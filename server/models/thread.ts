import Msg from "./msg";
import {ThreadSummaries, ThreadSummary} from "../../shared/types/chan";
import {
	indexThreadMessages,
	isThreadReply,
	resolveThreadRoot,
	resolveThreadRootFromIndex,
} from "../../shared/types/thread";

export {resolveThreadRoot} from "../../shared/types/thread";

export type NickCaseFold = (nick: string) => string;

function withParticipant(
	participants: readonly string[],
	nick: string | undefined,
	caseFold: NickCaseFold
) {
	if (!nick) {
		return [...participants];
	}

	const foldedNick = caseFold(nick);

	if (participants.some((participant) => caseFold(participant) === foldedNick)) {
		return [...participants];
	}

	return [...participants, nick];
}

function addReply(
	summary: ThreadSummary | undefined,
	rootMsgid: string,
	reply: Msg,
	caseFold: NickCaseFold
): ThreadSummary {
	const latestReplyTime = reply.time.getTime();
	const isLatest =
		!summary ||
		latestReplyTime > summary.latestReplyTime ||
		(latestReplyTime === summary.latestReplyTime && reply.id > summary.latestReplyId);

	return {
		rootMsgid,
		replyCount: (summary?.replyCount || 0) + 1,
		participants: withParticipant(summary?.participants || [], reply.from?.nick, caseFold),
		latestReplyId: isLatest ? reply.id : summary.latestReplyId,
		latestReplyTime: isLatest ? latestReplyTime : summary.latestReplyTime,
	};
}

export function updateThreadSummaries(
	threads: ThreadSummaries | undefined,
	messages: readonly Msg[],
	reply: Msg,
	caseFold: NickCaseFold
) {
	if (!isThreadReply(reply)) {
		return threads;
	}

	const rootMsgid = resolveThreadRoot(messages, reply);

	if (!rootMsgid) {
		return threads;
	}

	return {
		...threads,
		[rootMsgid]: addReply(threads?.[rootMsgid], rootMsgid, reply, caseFold),
	};
}

export function buildThreadSummaries(messages: readonly Msg[], caseFold: NickCaseFold) {
	if (!messages.some(isThreadReply)) {
		return undefined;
	}

	const index = indexThreadMessages(messages);
	const threads: ThreadSummaries = {};

	for (const message of messages) {
		if (!isThreadReply(message)) {
			continue;
		}

		const rootMsgid = resolveThreadRootFromIndex(index, message);

		if (rootMsgid) {
			threads[rootMsgid] = addReply(threads[rootMsgid], rootMsgid, message, caseFold);
		}
	}

	return Object.keys(threads).length > 0 ? threads : undefined;
}
