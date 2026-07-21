import {ChanType, ThreadSummaries, ThreadSummary} from "../../../shared/types/chan";
import {MessageType, SharedMsg} from "../../../shared/types/msg";

type ThreadChannel<T extends SharedMsg> = {
	type: ChanType;
	messages: T[];
	threads?: ThreadSummaries;
};

export function projectChannelMessages<T extends SharedMsg>(channel: ThreadChannel<T>) {
	if (channel.type !== ChanType.CHANNEL || !channel.threads) {
		return channel.messages;
	}

	return channel.messages.filter((message) => !message.replyTo);
}

export function getMessageThread(
	threads: ThreadSummaries | undefined,
	message: SharedMsg
): ThreadSummary | undefined {
	return message.msgid ? threads?.[message.msgid] : undefined;
}

export function isThreadStartableMessage(message: SharedMsg & {pending?: boolean}) {
	return (
		Boolean(message.msgid) &&
		!message.pending &&
		!message.replyTo &&
		(message.type === MessageType.MESSAGE || message.type === MessageType.ACTION)
	);
}
