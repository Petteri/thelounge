import socket from "../socket";
import {store} from "../store";
import {switchToChannel} from "../router";

socket.on("history:clear", function (data) {
	const netChan = store.getters.findChannel(data.target);

	if (netChan?.channel) {
		if (store.state.activeThread?.channelId === data.target) {
			store.commit("activeThread", undefined);
			switchToChannel(netChan.channel);
		}

		netChan.channel.messages = [];
		delete netChan.channel.threads;
		delete netChan.channel.threadStates;
		netChan.channel.threadTyping = {};
		netChan.channel.unread = 0;
		netChan.channel.highlight = 0;
		netChan.channel.firstUnread = 0;
		netChan.channel.moreHistoryAvailable = false;
		store.commit("removeChannelThreads", data.target);
	}
});
