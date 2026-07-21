import _ from "lodash";
import log from "../log";
import Config from "../config";
import User from "./user";
import Msg from "./msg";
import storage from "../plugins/storage";
import Client from "../client";
import Network from "./network";
import Prefix from "./prefix";
import {MessageType, SharedMsg} from "../../shared/types/msg";
import {
	ChanType,
	SpecialChanType,
	ChanState,
	ThreadSummaries,
	ThreadState,
	ThreadStates,
	ThreadSummary,
} from "../../shared/types/chan";
import {SharedNetworkChan} from "../../shared/types/network";
import {
	buildThreadSummaries,
	NickCaseFold,
	resolveThreadRoot,
	updateThreadSummaries,
} from "./thread";
import {
	indexThreadMessages,
	isThreadReply,
	resolveThreadRootFromIndex,
} from "../../shared/types/thread";

export type ChanConfig = {
	name: string;
	key?: string;
	muted?: boolean;
	type?: string;
};

export type PushMessageOptions = {
	increasesUnread?: boolean;
};

export type PushMessageResult = {
	threadRootMsgid?: string;
	threadState?: ThreadState;
	duplicate?: true;
};

class Chan {
	// TODO: don't force existence, figure out how to make TS infer it.
	id!: number;
	messages!: Msg[];
	name!: string;
	key!: string;
	topic!: string;
	firstUnread!: number;
	unread!: number;
	highlight!: number;
	users!: Map<string, User>;
	muted!: boolean;
	type!: ChanType;
	state!: ChanState;
	isOnline?: boolean;
	threads?: ThreadSummaries;
	threadStates?: ThreadStates;

	userAway?: boolean;
	special?: SpecialChanType;
	data?: any;
	closed?: boolean;
	num_users?: number;

	constructor(attr?: Partial<Chan>) {
		_.defaults(this, attr, {
			id: 0,
			messages: [],
			name: "",
			key: "",
			topic: "",
			type: ChanType.CHANNEL,
			state: ChanState.PARTED,
			firstUnread: 0,
			unread: 0,
			highlight: 0,
			users: new Map(),
			muted: false,
		});

		if (this.type === ChanType.QUERY && this.isOnline === undefined) {
			this.isOnline = false;
		}
	}

	destroy() {
		this.dereferencePreviews(this.messages);
	}

	pushMessage(client: Client, msg: Msg, options: PushMessageOptions = {}): PushMessageResult {
		if (msg.msgid && this.findMessageByMsgid(msg.msgid)) {
			return {duplicate: true};
		}

		const chanId = this.id;
		msg.id = client.idMsg++;
		let threadRootMsgid =
			this.type === ChanType.CHANNEL && isThreadReply(msg)
				? resolveThreadRoot(this.messages, msg)
				: undefined;
		let threadState = threadRootMsgid
			? this.updateThreadState(client, msg, threadRootMsgid, options)
			: undefined;

		// A thread view keeps its parent channel active, but does not read the channel itself.
		const isOpen = _.some(
			client.attachedClients,
			(attachedClient) => attachedClient.openChannel === chanId && !attachedClient.openThread
		);

		if (!threadState && msg.self) {
			// reset counters/markers when receiving self-/echo-message
			this.unread = 0;
			this.firstUnread = msg.id;
			this.highlight = 0;
		} else if (!threadState && !isOpen) {
			if (!this.firstUnread) {
				this.firstUnread = msg.id;
			}

			if (options.increasesUnread || msg.highlight) {
				this.unread++;
			}

			if (msg.highlight) {
				this.highlight++;
			}
		}

		// Never store messages in public mode as the session
		// is completely destroyed when the page gets closed
		if (Config.values.public) {
			const thread = msg.replyTo
				? this.updateThreadSummary(msg, this.getNickCaseFold(client))
				: undefined;
			client.emit("msg", {
				chan: chanId,
				msg,
				unread: this.unread,
				highlight: this.highlight,
				...(thread ? {thread} : {}),
				...(threadState ? {threadState} : {}),
			});
			return {threadRootMsgid: threadState ? threadRootMsgid : undefined, threadState};
		}

		// showInActive is only processed on "msg", don't need it on page reload
		if (msg.showInActive) {
			delete msg.showInActive;
		}

		const resolvesThreadGap = Boolean(msg.msgid && this.threads?.[msg.msgid]);
		this.writeUserLog(client, msg);

		let prunedThreadHistory = false;
		let prunedMsgids: Set<string> | undefined;

		if (Config.values.maxHistory >= 0 && this.messages.length > Config.values.maxHistory) {
			const deleted = this.messages.splice(
				0,
				this.messages.length - Config.values.maxHistory
			);
			prunedMsgids = new Set(
				deleted.flatMap((message) => (message.msgid ? [message.msgid] : []))
			);
			prunedThreadHistory = deleted.some(
				(message) =>
					Boolean(message.replyTo) ||
					Boolean(message.msgid && this.threads?.[message.msgid]) ||
					Boolean(message.msgid && this.threadStates?.[message.msgid])
			);

			// If maxHistory is 0, image would be dereferenced before client had a chance to retrieve it,
			// so for now, just don't implement dereferencing for this edge case.
			if (Config.values.maxHistory > 0) {
				this.dereferencePreviews(deleted);
			}
		}

		let thread: ThreadSummary | undefined;
		let threads: ThreadSummaries | null | undefined;
		let threadStates: ThreadStates | null | undefined;

		if (
			this.type === ChanType.CHANNEL &&
			(msg.replyTo || prunedThreadHistory || resolvesThreadGap)
		) {
			const caseFold = this.getNickCaseFold(client);

			if (prunedThreadHistory || resolvesThreadGap) {
				this.rebuildThreadSummaries(caseFold);
				this.rebuildThreadStates(prunedMsgids);
				threads = this.threads || null;
				threadStates = this.threadStates || null;

				if (isThreadReply(msg)) {
					threadRootMsgid = resolveThreadRoot(this.messages, msg);
					thread = threadRootMsgid ? this.threads?.[threadRootMsgid] : undefined;
					threadState = threadRootMsgid
						? this.threadStates?.[threadRootMsgid]
						: undefined;
				}
			} else {
				thread = this.updateThreadSummary(msg, caseFold);
			}
		}

		client.emit("msg", {
			chan: chanId,
			msg,
			unread: this.unread,
			highlight: this.highlight,
			...(thread ? {thread} : {}),
			...(typeof threads !== "undefined" ? {threads} : {}),
			...(typeof threadStates !== "undefined" ? {threadStates} : {}),
			...(threadState ? {threadState} : {}),
		});

		return {threadRootMsgid: threadState ? threadRootMsgid : undefined, threadState};
	}

	private updateThreadState(
		client: Client,
		msg: Msg,
		rootMsgid: string,
		options: PushMessageOptions
	) {
		const currentState = this.threadStates?.[rootMsgid];
		const rootMessage = this.messages.find((message) => message.msgid === rootMsgid);

		if (!currentState && !msg.self && !rootMessage?.self) {
			return undefined;
		}

		const isOpen = _.some(
			client.attachedClients,
			(attachedClient) =>
				attachedClient.openChannel === this.id && attachedClient.openThread === rootMsgid
		);

		const state: ThreadState = {
			rootMsgid,
			participating: true,
			unread: currentState?.unread ?? 0,
			highlight: currentState?.highlight ?? 0,
			firstUnread:
				currentState?.firstUnread ??
				(msg.self || isOpen ? msg.id : rootMessage?.id ?? msg.id),
			lastReplyId: msg.id,
			lastReplyTime: msg.time.getTime(),
		};

		if (!msg.self && !isOpen) {
			if (options.increasesUnread || msg.highlight) {
				state.unread++;
			}

			if (msg.highlight) {
				state.highlight++;
			}
		}

		this.threadStates ||= {};
		this.threadStates[rootMsgid] = state;
		return state;
	}

	readThread(rootMsgid: string) {
		const state = this.threadStates?.[rootMsgid];

		if (!state) {
			return undefined;
		}

		state.unread = 0;
		state.highlight = 0;
		state.firstUnread = state.lastReplyId;

		const clearedState = {...state};
		const rootAvailable = this.messages.some(
			(message) => message.msgid === rootMsgid && !isThreadReply(message)
		);

		if (!rootAvailable) {
			delete this.threadStates![rootMsgid];

			if (Object.keys(this.threadStates!).length === 0) {
				delete this.threadStates;
			}
		}

		return clearedState;
	}

	private getNickCaseFold(client: Client): NickCaseFold {
		const target = client.find(this.id);
		const irc = target && target.network.irc;

		return irc ? irc.caseLower.bind(irc) : (nick: string) => nick.toLowerCase();
	}

	updateThreadSummary(msg: Msg, caseFold: NickCaseFold) {
		if (this.type !== ChanType.CHANNEL || !msg.replyTo) {
			return undefined;
		}

		const rootMsgid = resolveThreadRoot(this.messages, msg);
		this.threads = updateThreadSummaries(this.threads, this.messages, msg, caseFold);
		return rootMsgid ? this.threads?.[rootMsgid] : undefined;
	}

	rebuildThreadSummaries(caseFold: NickCaseFold) {
		if (this.type !== ChanType.CHANNEL) {
			delete this.threads;
			return;
		}

		const threads = buildThreadSummaries(this.messages, caseFold);

		if (threads) {
			this.threads = threads;
		} else {
			delete this.threads;
		}
	}

	rebuildThreadStates(prunedMsgids: ReadonlySet<string> = new Set()) {
		const previousStates = this.threadStates || {};
		const index = indexThreadMessages(this.messages);
		const nextStates: ThreadStates = {};

		for (const state of Object.values(previousStates)) {
			const stateRoot = index.get(state.rootMsgid);
			const rootMsgid =
				stateRoot && isThreadReply(stateRoot)
					? resolveThreadRootFromIndex(index, stateRoot) || state.rootMsgid
					: state.rootMsgid;
			const summary = this.threads?.[rootMsgid];
			const rootAvailable = Boolean(
				index.get(rootMsgid) && !isThreadReply(index.get(rootMsgid)!)
			);
			const shouldPreserveUnavailable = state.unread > 0 || state.highlight > 0;

			if (
				(!summary && !shouldPreserveUnavailable) ||
				(prunedMsgids.has(rootMsgid) && !rootAvailable && !shouldPreserveUnavailable)
			) {
				continue;
			}

			const current = nextStates[rootMsgid];
			const migrated: ThreadState = {
				...state,
				rootMsgid,
				...(summary
					? {
							lastReplyId: summary.latestReplyId,
							lastReplyTime: summary.latestReplyTime,
					  }
					: {}),
			};

			nextStates[rootMsgid] = current
				? {
						...migrated,
						unread: current.unread + migrated.unread,
						highlight: current.highlight + migrated.highlight,
						firstUnread: Math.min(current.firstUnread, migrated.firstUnread),
				  }
				: migrated;
		}

		for (const message of this.messages) {
			if (!isThreadReply(message)) {
				continue;
			}

			const rootMsgid = resolveThreadRootFromIndex(index, message);
			const summary = rootMsgid ? this.threads?.[rootMsgid] : undefined;
			const rootMessage = rootMsgid ? index.get(rootMsgid) : undefined;

			const rootAvailable = Boolean(rootMessage && !isThreadReply(rootMessage));

			if (
				!rootMsgid ||
				!summary ||
				(!message.self && !rootMessage?.self) ||
				(prunedMsgids.has(rootMsgid) && !rootAvailable && !nextStates[rootMsgid])
			) {
				continue;
			}

			nextStates[rootMsgid] ||= {
				rootMsgid,
				participating: true,
				unread: 0,
				highlight: 0,
				firstUnread: summary.latestReplyId,
				lastReplyId: summary.latestReplyId,
				lastReplyTime: summary.latestReplyTime,
			};
		}

		if (Object.keys(nextStates).length > 0) {
			this.threadStates = nextStates;
		} else {
			delete this.threadStates;
		}
	}

	dereferencePreviews(messages: Msg[]) {
		if (!Config.values.prefetch || !Config.values.prefetchStorage) {
			return;
		}

		messages.forEach((message) => {
			if (message.previews) {
				message.previews.forEach((preview) => {
					if (preview.thumb) {
						storage.dereference(preview.thumb);
						preview.thumb = "";
					}
				});
			}
		});
	}

	getSortedUsers(irc?: Network["irc"]) {
		const users = Array.from(this.users.values());

		if (!irc || !irc.network || !irc.network.options || !irc.network.options.PREFIX) {
			return users;
		}

		const userModeSortPriority = {};
		irc.network.options.PREFIX.forEach((prefix, index) => {
			userModeSortPriority[prefix.symbol] = index;
		});

		userModeSortPriority[""] = 99; // No mode is lowest

		return users.sort(function (a, b) {
			if (a.mode === b.mode) {
				return a.nick.toLowerCase() < b.nick.toLowerCase() ? -1 : 1;
			}

			return userModeSortPriority[a.mode] - userModeSortPriority[b.mode];
		});
	}

	findMessage(msgId: number) {
		return this.messages.find((message) => message.id === msgId);
	}

	findMessageByMsgid(msgid: string) {
		return this.messages.find((message) => message.msgid === msgid);
	}

	findUser(nick: string) {
		return this.users.get(nick.toLowerCase());
	}

	getUser(nick: string) {
		return this.findUser(nick) || new User({nick}, new Prefix([]));
	}

	setUser(user: User) {
		this.users.set(user.nick.toLowerCase(), user);
	}

	removeUser(user: User) {
		this.users.delete(user.nick.toLowerCase());
	}

	/**
	 * Get a clean clone of this channel that will be sent to the client.
	 * This function performs manual cloning of channel object for
	 * better control of performance and memory usage.
	 *
	 * @param {(int|bool)} lastActiveChannel - Last known active user channel id (needed to control how many messages are sent)
	 *                                         If true, channel is assumed active.
	 * @param {int} lastMessage - Last message id seen by active client to avoid sending duplicates.
	 */
	getFilteredClone(
		lastActiveChannel?: number | boolean,
		lastMessage?: number
	): SharedNetworkChan {
		let msgs: SharedMsg[];

		// If client is reconnecting, only send new messages that client has not seen yet
		if (lastMessage && lastMessage > -1) {
			// When reconnecting, always send up to 100 messages to prevent message gaps on the client
			// See https://github.com/thelounge/thelounge/issues/1883
			msgs = this.messages.filter((m) => m.id > lastMessage).slice(-100);
		} else {
			// If channel is active, send up to 100 last messages, for all others send just 1
			// Client will automatically load more messages whenever needed based on last seen messages
			const messagesToSend =
				lastActiveChannel === true || this.id === lastActiveChannel ? 100 : 1;
			msgs = this.messages.slice(-messagesToSend);
		}

		const clone: SharedNetworkChan = {
			id: this.id,
			messages: msgs,
			totalMessages: this.messages.length,
			name: this.name,
			key: this.key,
			topic: this.topic,
			firstUnread: this.firstUnread,
			unread: this.unread,
			highlight: this.highlight,
			muted: this.muted,
			type: this.type,
			state: this.state,
			isOnline: this.isOnline,

			special: this.special,
			data: this.data,
			closed: this.closed,
			num_users: this.num_users,
		};

		if (this.threads) {
			clone.threads = this.threads;
		}

		if (this.threadStates) {
			clone.threadStates = this.threadStates;
		}

		return clone;
		// TODO: funny array mutation below might need to be reproduced
		// static optionalProperties = ["userAway", "special", "data", "closed", "num_users"];
		// return Object.keys(this).reduce((newChannel, prop) => {
		// 	if (Chan.optionalProperties.includes(prop)) {
		// 		if (this[prop] !== undefined || (Array.isArray(this[prop]) && this[prop].length)) {
		// 			newChannel[prop] = this[prop];
		// 		}
		// 	}
	}

	writeUserLog(client: Client, msg: Msg) {
		this.messages.push(msg);

		// Are there any logs enabled
		if (client.messageStorage.length === 0) {
			return;
		}

		const targetChannel: Chan = this;

		// Is this particular message or channel loggable
		if (!msg.isLoggable() || !this.isLoggable()) {
			// Because notices are nasty and can be shown in active channel on the client
			// if there is no open query, we want to always log notices in the sender's name
			if (msg.type === MessageType.NOTICE && msg.showInActive) {
				targetChannel.name = msg.from.nick || ""; // TODO: check if || works
			} else {
				return;
			}
		}

		// Find the parent network where this channel is in
		const target = client.find(this.id);

		if (!target) {
			return;
		}

		for (const messageStorage of client.messageStorage) {
			messageStorage.index(target.network, targetChannel, msg).catch((e) => log.error(e));
		}
	}

	loadMessages(client: Client, network: Network) {
		if (!this.isLoggable()) {
			return;
		}

		if (!network.irc) {
			// Network created, but misconfigured
			log.warn(
				`Failed to load messages for ${client.name}, network ${network.name} is not initialized.`
			);
			return;
		}

		if (!client.messageProvider) {
			if (network.irc.network.cap.isEnabled("znc.in/playback")) {
				// if we do have a message provider we might be able to only fetch partial history,
				// so delay the cap in this case.
				requestZncPlayback(this, network, 0);
			}

			return;
		}

		client.messageProvider
			.getMessages(network, this, () => client.idMsg++)
			.then((messages) => {
				if (messages.length === 0) {
					if (network.irc!.network.cap.isEnabled("znc.in/playback")) {
						requestZncPlayback(this, network, 0);
					}

					return;
				}

				const knownMsgids = new Set(
					this.messages.flatMap((message) => (message.msgid ? [message.msgid] : []))
				);
				const loadedMessages = messages.filter((message) => {
					if (!message.msgid || !knownMsgids.has(message.msgid)) {
						if (message.msgid) {
							knownMsgids.add(message.msgid);
						}

						return true;
					}

					return false;
				});

				this.messages.unshift(...loadedMessages);
				this.rebuildThreadSummaries(network.irc!.caseLower.bind(network.irc));
				this.rebuildThreadStates();

				if (!this.firstUnread && loadedMessages.length > 0) {
					this.firstUnread = loadedMessages[loadedMessages.length - 1].id;
				}

				client.emit("more", {
					chan: this.id,
					messages: loadedMessages.slice(-100),
					totalMessages: this.messages.length,
					threads: this.threads || null,
					threadStates: this.threadStates || null,
				});

				if (network.irc!.network.cap.isEnabled("znc.in/playback")) {
					const from = Math.floor(messages[messages.length - 1].time.getTime() / 1000);

					requestZncPlayback(this, network, from);
				}
			})
			.catch((err: Error) =>
				log.error(`Failed to load messages for ${client.name}: ${err.toString()}`)
			);
	}

	isLoggable() {
		return this.type === ChanType.CHANNEL || this.type === ChanType.QUERY;
	}

	setMuteStatus(muted: boolean) {
		this.muted = !!muted;
	}
}

function requestZncPlayback(channel: Chan, network: Network, from: number) {
	if (!network.irc) {
		throw new Error(
			`requestZncPlayback: no irc field on network "${network.name}", this is a bug`
		);
	}

	network.irc.raw("ZNC", "*playback", "PLAY", channel.name, from.toString());
}

export default Chan;

export type Channel = Chan;
