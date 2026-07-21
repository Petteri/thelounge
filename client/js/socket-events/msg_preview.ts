import socket from "../socket";
import {store} from "../store";

socket.on("msg:preview", function (data) {
	const netChan = store.getters.findChannel(data.chan);
	const message = netChan?.channel.messages.find((m) => m.id === data.id);

	if (message?.previews) {
		const previewIndex = message.previews.findIndex((m) => m.link === data.preview.link);

		if (previewIndex > -1) {
			message.previews[previewIndex] = data.preview;
		}
	}

	for (const thread of Object.values(store.state.threadCache)) {
		if (thread.channelId !== data.chan) {
			continue;
		}

		const threadMessage = thread.messages.find((item) => item.id === data.id);
		const previewIndex = threadMessage?.previews?.findIndex(
			(preview) => preview.link === data.preview.link
		);

		if (threadMessage?.previews && typeof previewIndex === "number" && previewIndex > -1) {
			threadMessage.previews[previewIndex] = data.preview;
		}
	}
});
