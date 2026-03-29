import socket from "../socket";
import {store} from "../store";

const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

function timerKey(chan: number, nick: string) {
	return `${chan}:${nick.toLowerCase()}`;
}

function clearTyping(channelId: number, nick: string) {
	const channel = store.getters.findChannel(channelId)?.channel;

	if (!channel) {
		return;
	}

	channel.typing = channel.typing.filter((typingNick) => typingNick !== nick);

	const key = timerKey(channelId, nick);
	const timer = typingTimers.get(key);

	if (timer) {
		clearTimeout(timer);
		typingTimers.delete(key);
	}
}

export function clearTypingByNick(channelId: number, nick?: string) {
	if (!nick) {
		return;
	}

	clearTyping(channelId, nick);
}

socket.on("typing", function ({chan, nick, status}) {
	const channel = store.getters.findChannel(chan)?.channel;

	if (!channel) {
		return;
	}

	if (status === "done") {
		clearTyping(chan, nick);
		return;
	}

	if (!channel.typing.includes(nick)) {
		channel.typing.push(nick);
	}

	const key = timerKey(chan, nick);
	const timer = typingTimers.get(key);

	if (timer) {
		clearTimeout(timer);
	}

	typingTimers.set(
		key,
		setTimeout(() => {
			clearTyping(chan, nick);
		}, status === "paused" ? 30000 : 6000)
	);
});
