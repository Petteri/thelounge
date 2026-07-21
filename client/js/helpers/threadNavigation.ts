import {cleanIrcMessage} from "../../../shared/irc";
import type {ActiveThread, ClientChan, ClientNetwork} from "../types";

type BaseNavigationTarget = {
	network: ClientNetwork;
	channel: ClientChan;
	label: string;
	searchText: string;
	unread: number;
	highlight: number;
};

export type ChannelNavigationTarget = BaseNavigationTarget & {
	type: "channel";
};

export type ThreadNavigationTarget = BaseNavigationTarget & {
	type: "thread";
	rootMsgid: string;
};

export type NavigationTarget = ChannelNavigationTarget | ThreadNavigationTarget;

const MAX_PREVIEW_LENGTH = 72;

function getRootPreview(channel: ClientChan, rootMsgid: string) {
	const root = channel.messages.find((message) => message.msgid === rootMsgid);

	if (!root) {
		return "Thread";
	}

	const nick = root.from?.nick ? `${root.from.nick}: ` : "";
	const text = cleanIrcMessage(root.text || "")
		.replace(/\s+/g, " ")
		.trim();
	const preview = `${nick}${text}`.trim() || "Thread";

	if (preview.length <= MAX_PREVIEW_LENGTH) {
		return preview;
	}

	return `${preview.slice(0, MAX_PREVIEW_LENGTH - 1).trimEnd()}…`;
}

function createChannelTarget(network: ClientNetwork, channel: ClientChan): ChannelNavigationTarget {
	return {
		type: "channel",
		network,
		channel,
		label: channel.name,
		searchText: `${network.name} ${channel.name}`,
		unread: channel.unread,
		highlight: channel.highlight,
	};
}

function createThreadTarget(
	network: ClientNetwork,
	channel: ClientChan,
	rootMsgid: string
): ThreadNavigationTarget {
	const state = channel.threadStates?.[rootMsgid];
	const label = getRootPreview(channel, rootMsgid);

	return {
		type: "thread",
		network,
		channel,
		rootMsgid,
		label,
		searchText: `${network.name} ${channel.name} ${label}`,
		unread: state?.unread || 0,
		highlight: state?.highlight || 0,
	};
}

export function isThreadActive(
	channel: ClientChan,
	rootMsgid: string,
	activeThread?: ActiveThread
) {
	return activeThread?.channelId === channel.id && activeThread.rootMsgid === rootMsgid;
}

export function getVisibleThreadTargets(
	network: ClientNetwork,
	channel: ClientChan,
	activeThread?: ActiveThread
) {
	const targets: ThreadNavigationTarget[] = [];
	const seen = new Set<string>();

	for (const state of Object.values(channel.threadStates || {})) {
		if (state.unread === 0 && !isThreadActive(channel, state.rootMsgid, activeThread)) {
			continue;
		}

		targets.push(createThreadTarget(network, channel, state.rootMsgid));
		seen.add(state.rootMsgid);
	}

	if (activeThread?.channelId === channel.id && !seen.has(activeThread.rootMsgid)) {
		targets.push(createThreadTarget(network, channel, activeThread.rootMsgid));
	}

	return targets;
}

export function getNavigationTargets(networks: ClientNetwork[], activeThread?: ActiveThread) {
	const targets: NavigationTarget[] = [];

	for (const network of networks) {
		for (const channel of network.channels) {
			targets.push(createChannelTarget(network, channel));
			targets.push(...getVisibleThreadTargets(network, channel, activeThread));
		}
	}

	return targets;
}

export function isNavigationTargetActive(
	target: NavigationTarget,
	activeChannel?: ClientChan,
	activeThread?: ActiveThread
) {
	if (target.type === "thread") {
		return isThreadActive(target.channel, target.rootMsgid, activeThread);
	}

	return target.channel === activeChannel && !activeThread;
}

export function getUnreadNavigationTargets(
	networks: ClientNetwork[],
	activeChannel?: ClientChan,
	activeThread?: ActiveThread
) {
	return getNavigationTargets(networks, activeThread).filter(
		(target) =>
			target.unread > 0 || isNavigationTargetActive(target, activeChannel, activeThread)
	);
}

export function navigationTargetKey(target: NavigationTarget) {
	const channelKey = `${target.network.uuid}:${target.channel.id}`;

	return target.type === "thread"
		? `${channelKey}:thread:${target.rootMsgid}`
		: `${channelKey}:channel`;
}

export function threadNavigationElementId(target: ThreadNavigationTarget) {
	return `thread-channel-${target.channel.id}-${encodeURIComponent(target.rootMsgid)}`;
}

export function channelHasVisibleThread(channel: ClientChan, activeThread?: ActiveThread) {
	return (
		Object.values(channel.threadStates || {}).some((state) => state.unread > 0) ||
		activeThread?.channelId === channel.id
	);
}
