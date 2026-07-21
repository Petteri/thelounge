import {nextTick} from "vue";

import socket from "../socket";
import {store} from "../store";
import {MessageType} from "../../../shared/types/msg";
import {hasMoreHistory, mergeMessageHistory} from "../helpers/messageHistory";

socket.on("more", async (data) => {
	const channel = store.getters.findChannel(data.chan)?.channel;

	if (!channel) {
		return;
	}

	const merged = mergeMessageHistory(channel.messages, data.messages, "prepend");

	channel.inputHistory = channel.inputHistory.concat(
		merged.addedMessages
			.filter((m) => m.self && m.text && m.type === MessageType.MESSAGE)
			// TS is too stupid to see the guard in .filter(), so we monkey patch it
			// to please the compiler
			.map((m) => (m.text ? m.text : ""))
			.reverse()
			.slice(0, 100 - channel.inputHistory.length)
	);
	channel.messages = merged.messages;
	channel.moreHistoryAvailable = hasMoreHistory(
		data.totalMessages,
		channel.messages,
		merged.addedMessages.length
	);

	if (typeof data.threads !== "undefined") {
		if (data.threads) {
			channel.threads = data.threads;
		} else {
			delete channel.threads;
		}
	}

	if (typeof data.threadStates !== "undefined") {
		if (data.threadStates) {
			channel.threadStates = data.threadStates;
		} else {
			delete channel.threadStates;
		}
	}

	await nextTick();
	channel.historyLoading = false;
});
