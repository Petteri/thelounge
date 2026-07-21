import socket from "../socket";
import {store} from "../store";

const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

function timerKey(chan: number, nick: string, rootMsgid?: string) {
	return `${chan}:${rootMsgid || ""}:${nick.toLowerCase()}`;
}

function clearTyping(channelId: number, nick: string, rootMsgid?: string) {
	const channel = store.getters.findChannel(channelId)?.channel;

	if (!channel) {
		return;
	}

	if (rootMsgid) {
		const typing = channel.threadTyping[rootMsgid];

		if (typing) {
			const remaining = typing.filter((typingNick) => typingNick !== nick);

			if (remaining.length > 0) {
				channel.threadTyping[rootMsgid] = remaining;
			} else {
				delete channel.threadTyping[rootMsgid];
			}
		}
	} else {
		channel.typing = channel.typing.filter((typingNick) => typingNick !== nick);
	}

	const key = timerKey(channelId, nick, rootMsgid);
	const timer = typingTimers.get(key);

	if (timer) {
		clearTimeout(timer);
		typingTimers.delete(key);
	}
}

export function clearTypingByNick(channelId: number, nick?: string, rootMsgid?: string) {
	if (!nick) {
		return;
	}

	clearTyping(channelId, nick, rootMsgid);
}

socket.on("typing", function ({chan, nick, status, rootMsgid}) {
	const channel = store.getters.findChannel(chan)?.channel;

	if (!channel) {
		return;
	}

	if (status === "done") {
		clearTyping(chan, nick, rootMsgid);
		return;
	}

	const typing = rootMsgid ? (channel.threadTyping[rootMsgid] ||= []) : channel.typing;

	if (!typing.includes(nick)) {
		typing.push(nick);
	}

	const key = timerKey(chan, nick, rootMsgid);
	const timer = typingTimers.get(key);

	if (timer) {
		clearTimeout(timer);
	}

	typingTimers.set(
		key,
		setTimeout(
			() => {
				clearTyping(chan, nick, rootMsgid);
			},
			status === "paused" ? 30000 : 6000
		)
	);
});
