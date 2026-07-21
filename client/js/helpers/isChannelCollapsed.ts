import {store} from "../store";
import {channelHasVisibleThread} from "./threadNavigation";

export default (network, channel) => {
	if (
		!network.isCollapsed ||
		channel.highlight ||
		channel.type === "lobby" ||
		channelHasVisibleThread(channel, store.state.activeThread)
	) {
		return false;
	}

	if (store.state.activeChannel && channel === store.state.activeChannel.channel) {
		return false;
	}

	return true;
};
