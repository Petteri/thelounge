import {projectThreadMessages} from "../../shared/types/thread";
import {MessageType} from "../../shared/types/msg";
import type {ClientChan, ClientMessage, ClientThread, ClientUser} from "./types";
import {mergeMessageHistory} from "./helpers/messageHistory";

let nextPendingMessageId = -1;

export function threadKey(channelId: number, rootMsgid: string) {
	return `${channelId}\0${rootMsgid}`;
}

export function getPendingThreadReplyLines(text: string) {
	return text.split("\n").flatMap((line) => {
		const isMessage = line.charAt(0) !== "/" || line.charAt(1) === "/";
		const pendingText = isMessage ? line.replace(/^\//, "") : "";

		return pendingText ? [pendingText] : [];
	});
}

export function createThreadCacheEntry(channel: ClientChan, rootMsgid: string): ClientThread {
	return {
		channelId: channel.id,
		rootMsgid,
		messages: projectThreadMessages(channel.messages, rootMsgid) || [],
		loading: true,
		requestLastId: getLastMessageId(channel.messages),
	};
}

export function getLastMessageId(messages: readonly ClientMessage[]) {
	return messages.reduce((latest, message) => Math.max(latest, message.id), 0);
}

export function mergeThreadResponse(
	thread: ClientThread | undefined,
	messages: readonly ClientMessage[],
	error?: ClientThread["error"]
) {
	if (!thread) {
		return mergeMessageHistory([], messages, "append").messages;
	}

	for (const message of messages) {
		reconcilePendingThreadReply(thread, message);
	}

	const requestLastId = thread.requestLastId ?? getLastMessageId(thread.messages);
	const postRequestMessages = thread.messages.filter(
		(message) => message.pending || (!error && message.id > requestLastId)
	);
	const canonical = mergeMessageHistory([], messages, "append").messages;

	return mergeMessageHistory(canonical, postRequestMessages, "append").messages;
}

export function getThreadParticipants(
	messages: readonly ClientMessage[],
	channelUsers: readonly ClientUser[]
) {
	const participants = new Map<string, {nick: string; mode: string; lastMessage: number}>();

	for (const message of messages) {
		const nick = message.from?.nick;

		if (!nick) {
			continue;
		}

		const key = nick.toLowerCase();
		const current = participants.get(key);
		const lastMessage = new Date(message.time).getTime() || 0;

		participants.set(key, {
			nick: current?.nick || nick,
			mode: message.from?.mode || current?.mode || "",
			lastMessage: Math.max(current?.lastMessage || 0, lastMessage),
		});
	}

	const result: ClientUser[] = [];

	for (const user of channelUsers) {
		const key = user.nick.toLowerCase();

		if (participants.delete(key)) {
			result.push(user);
		}
	}

	for (const participant of participants.values()) {
		result.push({
			away: "",
			lastMessage: participant.lastMessage,
			mode: participant.mode,
			modes: participant.mode ? [participant.mode] : [],
			nick: participant.nick,
		});
	}

	return result;
}

export function appendPendingThreadReply(thread: ClientThread, nick: string, text: string) {
	const message: ClientMessage = {
		id: nextPendingMessageId--,
		replyTo: thread.rootMsgid,
		from: {mode: "", nick},
		pending: true,
		self: true,
		text,
		time: new Date(),
		type: MessageType.MESSAGE,
		users: [],
	};

	thread.messages.push(message);
	return message;
}

export function reconcilePendingThreadReply(thread: ClientThread, message: ClientMessage) {
	if (!message.self || message.replyTo !== thread.rootMsgid) {
		return false;
	}

	const pendingIndex = thread.messages.findIndex(
		(candidate) =>
			candidate.pending &&
			candidate.replyTo === message.replyTo &&
			candidate.text === message.text &&
			candidate.type === message.type
	);

	if (pendingIndex === -1) {
		return false;
	}

	thread.messages.splice(pendingIndex, 1, message);
	return true;
}
