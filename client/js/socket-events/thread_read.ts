import socket from "../socket";
import {store} from "../store";

socket.on("thread:read", ({chan, rootMsgid, state}) => {
	const target = store.getters.findChannel(chan);

	if (!target) {
		return;
	}

	if (state === null) {
		if (target.channel.threadStates) {
			delete target.channel.threadStates[rootMsgid];

			if (Object.keys(target.channel.threadStates).length === 0) {
				delete target.channel.threadStates;
			}
		}

		return;
	}

	if (!state) {
		return;
	}

	target.channel.threadStates ||= {};
	const currentState = target.channel.threadStates[rootMsgid];
	const isActive =
		store.state.activeThread?.channelId === chan &&
		store.state.activeThread.rootMsgid === rootMsgid;

	// Keep the local unread marker when this window was the one opening the thread.
	target.channel.threadStates[rootMsgid] = isActive
		? {
				...state,
				firstUnread: currentState?.firstUnread ?? state.firstUnread,
		  }
		: state;
});
