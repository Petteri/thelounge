import socket from "../socket";
import {store} from "../store";
import {mergeThreadResponse, threadKey} from "../threads";

socket.on("thread", (data) => {
	const key = threadKey(data.chan, data.rootMsgid);
	const current = store.state.threadCache[key];

	store.commit("threadCache", {
		key,
		thread: {
			channelId: data.chan,
			rootMsgid: data.rootMsgid,
			messages: mergeThreadResponse(current, data.messages, data.error),
			loading: false,
			...(data.error ? {error: data.error} : {}),
		},
	});
});
