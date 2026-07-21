import Chan from "../../models/chan";
import Msg from "../../models/msg";
import {MessageType} from "../../../shared/types/msg";

function isReplyableMessage(message: Msg) {
	return (
		Boolean(message.msgid) &&
		(message.type === MessageType.MESSAGE || message.type === MessageType.ACTION)
	);
}

export function resolveReplyRoot(chan: Chan, message: Msg) {
	let current = message;
	const seen = new Set<string>();

	while (current.replyTo) {
		if (seen.has(current.replyTo)) {
			break;
		}

		seen.add(current.replyTo);

		const parent = chan.messages.find((candidate) => candidate.msgid === current.replyTo);

		if (!parent) {
			break;
		}

		current = parent;
	}

	return current;
}

export function findLatestReplyTarget(chan: Chan) {
	const latest = [...chan.messages]
		.reverse()
		.find((message) => isReplyableMessage(message) && !message.replyTo);

	return latest ? resolveReplyRoot(chan, latest) : undefined;
}

export function findReplyTargetById(chan: Chan, messageId: number) {
	const message = chan.findMessage(messageId);

	if (!message || !isReplyableMessage(message)) {
		return undefined;
	}

	return resolveReplyRoot(chan, message);
}

export function findReplyTargetByMsgid(chan: Chan, msgid: string) {
	const message = chan.messages.find((candidate) => candidate.msgid === msgid);

	if (!message || !isReplyableMessage(message)) {
		return undefined;
	}

	return resolveReplyRoot(chan, message);
}
