import {MessageType, SharedMsg} from "./msg";

export function isThreadReply(message: SharedMsg) {
	return (
		Boolean(message.replyTo) &&
		(message.type === MessageType.MESSAGE || message.type === MessageType.ACTION)
	);
}

export function indexThreadMessages<T extends SharedMsg>(messages: readonly T[]) {
	const index = new Map<string, T>();

	for (const message of messages) {
		if (message.msgid && !index.has(message.msgid)) {
			index.set(message.msgid, message);
		}
	}

	return index;
}

export function resolveThreadRootFromIndex<T extends SharedMsg>(
	index: ReadonlyMap<string, T>,
	reply: T
) {
	const immediateParent = reply.replyTo;

	if (!immediateParent) {
		return undefined;
	}

	let parentMsgid = immediateParent;
	const seen = new Set<string>();

	while (!seen.has(parentMsgid)) {
		seen.add(parentMsgid);

		const parent = index.get(parentMsgid);

		if (!parent) {
			// Do not guess past a history gap. A later rebuild can resolve the chain.
			return immediateParent;
		}

		if (!parent.replyTo) {
			return parent.msgid || immediateParent;
		}

		parentMsgid = parent.replyTo;
	}

	return immediateParent;
}

export function resolveThreadRoot<T extends SharedMsg>(messages: readonly T[], reply: T) {
	return resolveThreadRootFromIndex(indexThreadMessages(messages), reply);
}

export function projectThreadMessages<T extends SharedMsg>(
	messages: readonly T[],
	rootMsgid: string
) {
	const index = indexThreadMessages(messages);
	const root = index.get(rootMsgid);

	if (!root) {
		return undefined;
	}

	const replies = messages.filter(
		(message) =>
			isThreadReply(message) && resolveThreadRootFromIndex(index, message) === rootMsgid
	);

	replies.sort((a, b) => {
		const timeDifference = new Date(a.time).getTime() - new Date(b.time).getTime();
		return timeDifference || a.id - b.id;
	});

	return [root, ...replies];
}
