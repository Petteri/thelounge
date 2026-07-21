import {expect} from "chai";

import {
	channelHasVisibleThread,
	getNavigationTargets,
	getUnreadNavigationTargets,
	getVisibleThreadTargets,
	isNavigationTargetActive,
	navigationTargetKey,
} from "../client/js/helpers/threadNavigation";
import type {ActiveThread, ClientChan, ClientNetwork, ClientMessage} from "../client/js/types";
import {ChanType, ThreadState} from "../shared/types/chan";

function createChannel(id: number, name: string) {
	return {
		id,
		name,
		type: ChanType.CHANNEL,
		messages: [],
		unread: 0,
		highlight: 0,
	} as unknown as ClientChan;
}

function createNetwork(channels: ClientChan[]) {
	return {
		uuid: "network-id",
		name: "Test network",
		channels,
	} as unknown as ClientNetwork;
}

function createThreadState(rootMsgid: string, unread: number, highlight = 0) {
	return {
		rootMsgid,
		participating: true,
		unread,
		highlight,
		firstUnread: 0,
		lastReplyId: 1,
		lastReplyTime: 1,
	} as ThreadState;
}

describe("Client thread navigation", function () {
	it("should show only unread and active threads", function () {
		const channel = createChannel(23, "#threads");
		const network = createNetwork([channel]);
		channel.threadStates = {
			unread: createThreadState("unread", 2),
			read: createThreadState("read", 0),
		};

		expect(
			getVisibleThreadTargets(network, channel).map((target) => target.rootMsgid)
		).to.deep.equal(["unread"]);

		const activeThread: ActiveThread = {channelId: 23, rootMsgid: "read"};
		expect(
			getVisibleThreadTargets(network, channel, activeThread).map(
				(target) => target.rootMsgid
			)
		).to.deep.equal(["unread", "read"]);

		activeThread.rootMsgid = "not-participating";
		expect(
			getVisibleThreadTargets(network, channel, activeThread).map(
				(target) => target.rootMsgid
			)
		).to.deep.equal(["unread", "not-participating"]);
	});

	it("should describe a thread with its root message", function () {
		const channel = createChannel(23, "#threads");
		const network = createNetwork([channel]);
		channel.messages.push({
			msgid: "root",
			from: {nick: "Alice"},
			text: "\x02A useful root message\x0f",
		} as unknown as ClientMessage);
		channel.threadStates = {root: createThreadState("root", 1)};

		const target = getVisibleThreadTargets(network, channel)[0];

		expect(target.label).to.equal("Alice: A useful root message");
		expect(target.searchText).to.contain("Test network #threads Alice:");
	});

	it("should preserve sidebar order for unread navigation", function () {
		const lobby = createChannel(1, "Test network");
		lobby.type = ChanType.LOBBY;
		const channel = createChannel(23, "#threads");
		const network = createNetwork([lobby, channel]);
		channel.unread = 3;
		channel.threadStates = {
			first: createThreadState("first", 2, 1),
			second: createThreadState("second", 0),
		};
		const activeThread: ActiveThread = {channelId: 23, rootMsgid: "second"};

		const targets = getUnreadNavigationTargets([network], channel, activeThread);

		expect(
			targets.map((target) =>
				target.type === "thread" ? target.rootMsgid : target.channel.name
			)
		).to.deep.equal(["#threads", "first", "second"]);
		expect(isNavigationTargetActive(targets[2], channel, activeThread)).to.equal(true);
		expect(new Set(targets.map(navigationTargetKey)).size).to.equal(3);
	});

	it("should keep an active read channel in the activity list", function () {
		const channel = createChannel(23, "#threads");
		const network = createNetwork([channel]);

		const targets = getUnreadNavigationTargets([network], channel);

		expect(targets).to.have.length(1);
		expect(targets[0].type).to.equal("channel");
	});

	it("should expose channels containing visible threads", function () {
		const channel = createChannel(23, "#threads");
		channel.threadStates = {root: createThreadState("root", 1)};

		expect(channelHasVisibleThread(channel)).to.equal(true);
		channel.threadStates.root.unread = 0;
		expect(channelHasVisibleThread(channel)).to.equal(false);
		expect(channelHasVisibleThread(channel, {channelId: 23, rootMsgid: "root"})).to.equal(true);
	});

	it("should place threads immediately after their parent channel", function () {
		const first = createChannel(23, "#first");
		const second = createChannel(24, "#second");
		const network = createNetwork([first, second]);
		first.threadStates = {root: createThreadState("root", 1)};

		const targets = getNavigationTargets([network]);

		expect(
			targets.map((target) =>
				target.type === "thread" ? target.rootMsgid : target.channel.name
			)
		).to.deep.equal(["#first", "root", "#second"]);
	});
});
