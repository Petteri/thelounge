import socket from "../socket";
import {cleanIrcMessage} from "../../../shared/irc";
import {store} from "../store";
import {switchToChannel, switchToThread} from "../router";
import {ClientChan, NetChan, ClientMessage} from "../types";
import {SharedMsg, MessageType} from "../../../shared/types/msg";
import {ChanType} from "../../../shared/types/chan";
import {clearTypingByNick} from "./typing";
import {resolveThreadRoot} from "../../../shared/types/thread";
import {reconcilePendingThreadReply, threadKey} from "../threads";
import {mergeMessageHistory} from "../helpers/messageHistory";

let pop;

try {
	pop = new Audio();
	pop.src = "audio/pop.wav";
} catch (e) {
	pop = {
		play() {},
	};
}

socket.on("msg", function (data) {
	const receivingChannel = store.getters.findChannel(data.chan);

	if (!receivingChannel) {
		return;
	}

	let channel = receivingChannel.channel;
	const originalChannelId = channel.id;
	let isActiveChannel =
		store.state.activeChannel &&
		store.state.activeChannel.channel === channel &&
		!store.state.activeThread;

	// Display received notices and errors in currently active channel.
	// Reloading the page will put them back into the lobby window.
	if (data.msg.showInActive) {
		// We only want to put errors/notices in active channel if they arrive on the same network
		if (
			store.state.activeChannel &&
			store.state.activeChannel.network === receivingChannel.network
		) {
			channel = store.state.activeChannel.channel;

			// Do not update unread/highlight counters for this channel
			// as we are putting this message in the active channel
			isActiveChannel = true;

			if (data.chan === channel.id) {
				// If active channel is the intended channel for this message,
				// remove the showInActive flag
				delete data.msg.showInActive;
			} else {
				data.chan = channel.id;
			}
		} else {
			delete data.msg.showInActive;
		}
	}

	// Do not set unread counter for channel if it is currently active on this client
	// It may increase on the server before it processes channel open event from this client
	if (!isActiveChannel) {
		if (typeof data.highlight !== "undefined") {
			channel.highlight = data.highlight;
		}

		if (typeof data.unread !== "undefined") {
			channel.unread = data.unread;
		}
	}

	const merged = mergeMessageHistory(channel.messages, [data.msg], "append");
	channel.messages = merged.messages;
	const isNewMessage = merged.addedMessages.length > 0;
	let threadRootMsgid: string | undefined;

	if (typeof data.threads !== "undefined") {
		if (data.threads) {
			channel.threads = data.threads;
		} else {
			delete channel.threads;
		}
	} else if (data.thread) {
		channel.threads ||= {};
		channel.threads[data.thread.rootMsgid] = data.thread;
	}

	if (typeof data.threadStates !== "undefined") {
		if (data.threadStates) {
			channel.threadStates = data.threadStates;
		} else {
			delete channel.threadStates;
		}
	}

	if (data.threadState) {
		channel.threadStates ||= {};
		const currentState = channel.threadStates[data.threadState.rootMsgid];
		const isActiveThread =
			store.state.activeThread?.channelId === originalChannelId &&
			store.state.activeThread.rootMsgid === data.threadState.rootMsgid;

		channel.threadStates[data.threadState.rootMsgid] = isActiveThread
			? {
					...data.threadState,
					unread: 0,
					highlight: 0,
					firstUnread: currentState?.firstUnread ?? data.threadState.firstUnread,
			  }
			: data.threadState;
	}

	if (data.msg.replyTo) {
		threadRootMsgid =
			data.threadState?.rootMsgid ||
			data.thread?.rootMsgid ||
			resolveThreadRoot(channel.messages, data.msg);
		const thread = threadRootMsgid
			? store.state.threadCache[threadKey(originalChannelId, threadRootMsgid)]
			: undefined;

		if (thread) {
			const reconciled = isNewMessage && reconcilePendingThreadReply(thread, data.msg);

			if (!reconciled) {
				thread.messages = mergeMessageHistory(
					thread.messages,
					[data.msg],
					"append"
				).messages;
			}
		}
	}

	if (!isNewMessage) {
		return;
	}

	clearTypingByNick(originalChannelId, data.msg.from?.nick);

	if (threadRootMsgid) {
		clearTypingByNick(originalChannelId, data.msg.from?.nick, threadRootMsgid);
	}

	if (data.msg.self) {
		if (!data.threadState) {
			channel.firstUnread = data.msg.id;
		}
	} else {
		notifyMessage(
			data.chan,
			channel,
			store.state.activeChannel,
			store.state.activeThread,
			data.msg,
			data.threadState?.rootMsgid
		);
	}

	let messageLimit = 0;

	if (!isActiveChannel) {
		// If message arrives in non active channel, keep only 100 messages
		messageLimit = 100;
	} else if (channel.scrolledToBottom) {
		// If message arrives in active channel, keep 1500 messages if scroll is currently at the bottom
		// One history load may load up to 1000 messages at once if condendesed or hidden events are enabled
		messageLimit = 1500;
	}

	if (messageLimit > 0 && channel.messages.length > messageLimit) {
		channel.messages.splice(0, channel.messages.length - messageLimit);
		channel.moreHistoryAvailable = true;
	}

	if (channel.type === ChanType.CHANNEL) {
		updateUserList(channel, data.msg);
	}
});

declare global {
	// this extends the interface from lib.dom with additional stuff which is not
	// exactly standard but implemented in some browsers
	interface NotificationOptions {
		timestamp?: number; // chrome has it, other browsers ignore it
	}
}

function notifyMessage(
	targetId: number,
	channel: ClientChan,
	activeChannel: NetChan | undefined,
	activeThread: {channelId: number; rootMsgid: string} | undefined,
	msg: ClientMessage,
	threadRootMsgid?: string
) {
	if (channel.muted) {
		return;
	}

	if (
		msg.highlight ||
		(store.state.settings.notifyAllMessages && msg.type === MessageType.MESSAGE)
	) {
		const isActiveTarget = threadRootMsgid
			? activeThread?.channelId === targetId && activeThread.rootMsgid === threadRootMsgid
			: activeChannel?.channel === channel && !activeThread;

		if (!document.hasFocus() || !isActiveTarget) {
			if (store.state.settings.notification) {
				try {
					pop.play();
				} catch (exception) {
					// On mobile, sounds can not be played without user interaction.
				}
			}

			if (
				store.state.settings.desktopNotifications &&
				"Notification" in window &&
				Notification.permission === "granted"
			) {
				let title: string;
				let body: string;
				// TODO: fix msg type and get rid of that conditional
				const nick = msg.from && msg.from.nick ? msg.from.nick : "unkonown";

				if (msg.type === MessageType.INVITE) {
					title = "New channel invite:";
					body = nick + " invited you to " + msg.channel;
				} else {
					title = nick;

					if (channel.type !== ChanType.QUERY) {
						title += ` (${channel.name})`;
					}

					if (msg.type === MessageType.MESSAGE) {
						title += " says:";
					}

					// TODO: fix msg type and get rid of that conditional
					body = cleanIrcMessage(msg.text ? msg.text : "");
				}

				const timestamp = Date.parse(String(msg.time));

				try {
					if (store.state.hasServiceWorker) {
						navigator.serviceWorker.ready
							.then((registration) => {
								registration.active?.postMessage({
									type: "notification",
									chanId: targetId,
									...(threadRootMsgid ? {rootMsgid: threadRootMsgid} : {}),
									timestamp: timestamp,
									title: title,
									body: body,
								});
							})
							.catch(() => {
								// no-op
							});
					} else {
						const notify = new Notification(title, {
							tag: threadRootMsgid
								? `thread-${targetId}-${threadRootMsgid}`
								: `chan-${targetId}`,
							badge: "img/icon-alerted-black-transparent-bg-72x72px.png",
							icon: "img/icon-alerted-grey-bg-192x192px.png",
							body: body,
							timestamp: timestamp,
						});
						notify.addEventListener("click", function () {
							this.close();
							window.focus();

							const channelTarget = store.getters.findChannel(targetId);

							if (channelTarget) {
								if (threadRootMsgid) {
									switchToThread(channelTarget.channel, threadRootMsgid);
								} else {
									switchToChannel(channelTarget.channel);
								}
							}
						});
					}
				} catch (exception) {
					// `new Notification(...)` is not supported and should be silenced.
				}
			}
		}
	}
}

function updateUserList(channel: ClientChan, msg: SharedMsg) {
	switch (msg.type) {
		case MessageType.MESSAGE: // fallthrough

		case MessageType.ACTION: {
			const user = channel.users.find((u) => u.nick === msg.from?.nick);

			if (user) {
				user.lastMessage = new Date(msg.time).getTime() || Date.now();
			}

			break;
		}

		case MessageType.NICK:
			clearTypingByNick(channel.id, msg.from?.nick);
			break;

		case MessageType.QUIT: // fallthrough

		case MessageType.PART: {
			clearTypingByNick(channel.id, msg.from?.nick);
			const idx = channel.users.findIndex((u) => u.nick === msg.from?.nick);

			if (idx > -1) {
				channel.users.splice(idx, 1);
			}

			break;
		}

		case MessageType.KICK: {
			clearTypingByNick(channel.id, msg.target?.nick);
			const idx = channel.users.findIndex((u) => u.nick === msg.target?.nick);

			if (idx > -1) {
				channel.users.splice(idx, 1);
			}

			break;
		}
	}
}
