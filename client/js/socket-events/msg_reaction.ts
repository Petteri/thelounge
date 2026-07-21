import socket from "../socket";
import {store} from "../store";

socket.on("msg:reaction", function (data) {
	const netChan = store.getters.findChannel(data.chan);
	const message = netChan?.channel.messages.find((m) => m.id === data.id);

	if (message) {
		message.reactions = data.reactions;
	}

	for (const thread of Object.values(store.state.threadCache)) {
		if (thread.channelId !== data.chan) {
			continue;
		}

		const threadMessage = thread.messages.find((item) => item.id === data.id);

		if (threadMessage) {
			threadMessage.reactions = data.reactions;
		}
	}
});
