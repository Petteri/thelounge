import Client from "../../client";
import Chan from "../../models/chan";
import Msg from "../../models/msg";
import {MessageType, MessageReaction} from "../../../shared/types/msg";

type MessageTags = {[key: string]: string} | undefined;

function getTag(tags: MessageTags, name: string) {
	return tags?.[`+${name}`] || tags?.[name];
}

export function getReactEvent(tags: MessageTags) {
	const reaction = getTag(tags, "draft/react") || getTag(tags, "react");
	const replyTo = getTag(tags, "draft/reply") || getTag(tags, "reply");

	if (typeof reaction === "undefined" || !replyTo) {
		return null;
	}

	return {reaction, replyTo};
}

export function applyReaction(
	client: Client,
	chan: Chan,
	replyTo: string,
	reaction: string,
	nick: string,
	options: {persist?: boolean; time?: number} = {}
) {
	const target = chan.messages.find((message) => message.msgid === replyTo);

	if (!target) {
		return false;
	}

	let reactionEntry = target.reactions.find((entry) => entry.name === reaction);

	if (!reactionEntry) {
		reactionEntry = {
			name: reaction,
			users: [],
		};
		target.reactions.push(reactionEntry);
	}

	if (!reactionEntry.users.includes(nick)) {
		reactionEntry.users.push(nick);
		reactionEntry.users.sort((a, b) => a.localeCompare(b));
	}

	target.reactions.sort((a: MessageReaction, b: MessageReaction) => {
		if (b.users.length !== a.users.length) {
			return b.users.length - a.users.length;
		}

		return a.name.localeCompare(b.name);
	});

		client.emit("msg:reaction", {
			chan: chan.id,
			id: target.id,
			reactions: target.reactions,
		});

		if (options.persist !== false) {
			const targetNetChan = client.find(chan.id);

			if (targetNetChan) {
				const reactionMsg = new Msg({
					type: MessageType.REACTION,
					time: options.time ? new Date(options.time) : undefined,
					from: chan.getUser(nick),
					reactionTo: replyTo,
				reactionEmoji: reaction,
				users: [],
			});

				for (const messageStorage of client.messageStorage) {
					messageStorage.index(targetNetChan.network, chan, reactionMsg).catch(() => {});
				}
			}
		}

	return true;
}

export function rebuildReactions(messages: Msg[]) {
	const visibleMessages = messages.filter((message) => message.type !== MessageType.REACTION);

	visibleMessages.forEach((message) => {
		message.reactions = [];
	});

	messages
		.filter(
			(message) =>
				message.type === MessageType.REACTION &&
				message.reactionTo &&
				typeof message.reactionEmoji !== "undefined" &&
				message.from?.nick
			)
			.forEach((message) => {
				const reactionNick = message.from?.nick;
				const reactionEmoji = message.reactionEmoji;

				if (!reactionNick || typeof reactionEmoji === "undefined") {
					return;
				}

				const target = visibleMessages.find((candidate) => candidate.msgid === message.reactionTo);

				if (!target) {
					return;
				}

				let reactionEntry = target.reactions.find((entry) => entry.name === reactionEmoji);

				if (!reactionEntry) {
					reactionEntry = {
						name: reactionEmoji,
						users: [],
					};
					target.reactions.push(reactionEntry);
				}

				if (!reactionEntry.users.includes(reactionNick)) {
					reactionEntry.users.push(reactionNick);
					reactionEntry.users.sort((a, b) => a.localeCompare(b));
				}
			});

	visibleMessages.forEach((message) => {
		message.reactions.sort((a: MessageReaction, b: MessageReaction) => {
			if (b.users.length !== a.users.length) {
				return b.users.length - a.users.length;
			}

			return a.name.localeCompare(b.name);
		});
	});

	return visibleMessages;
}
