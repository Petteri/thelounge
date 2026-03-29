import socket from "../socket";
import {store} from "../store";

socket.on("msg:reaction", function (data) {
	const netChan = store.getters.findChannel(data.chan);
	const message = netChan?.channel.messages.find((m) => m.id === data.id);

	if (!message) {
		return;
	}

	message.reactions = data.reactions;
});
