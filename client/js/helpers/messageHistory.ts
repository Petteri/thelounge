import type {ClientMessage} from "../types";

type MergePlacement = "append" | "prepend";

export function mergeMessageHistory(
	existing: ClientMessage[],
	incoming: readonly ClientMessage[],
	placement: MergePlacement
) {
	const byId = new Map<number, ClientMessage>();
	const byMsgid = new Map<string, ClientMessage>();

	const register = (message: ClientMessage) => {
		byId.set(message.id, message);

		if (message.msgid) {
			byMsgid.set(message.msgid, message);
		}
	};

	for (const message of existing) {
		register(message);
	}

	const addedMessages: ClientMessage[] = [];

	for (const message of incoming) {
		const current = message.msgid ? byMsgid.get(message.msgid) : byId.get(message.id);

		if (current) {
			const previousId = current.id;
			const previousMsgid = current.msgid;
			Object.assign(current, message);

			if (byId.get(previousId) === current) {
				byId.delete(previousId);
			}

			if (previousMsgid && byMsgid.get(previousMsgid) === current) {
				byMsgid.delete(previousMsgid);
			}

			register(current);
			continue;
		}

		addedMessages.push(message);
		register(message);
	}

	return {
		messages:
			placement === "prepend"
				? addedMessages.concat(existing)
				: existing.concat(addedMessages),
		addedMessages,
	};
}

export function canonicalHistoryLength(messages: readonly ClientMessage[]) {
	return messages.filter((message) => !message.showInActive).length;
}

export function hasMoreHistory(
	totalMessages: number,
	messages: readonly ClientMessage[],
	addedMessages: number
) {
	return addedMessages > 0 && totalMessages > canonicalHistoryLength(messages);
}
