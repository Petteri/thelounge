import {expect} from "chai";
import sinon from "sinon";

import Config from "../../server/config";
import Client from "../../server/client";
import Chan from "../../server/models/chan";
import Msg from "../../server/models/msg";
import {
	buildThreadSummaries,
	resolveThreadRoot,
	updateThreadSummaries,
} from "../../server/models/thread";
import {ChanType} from "../../shared/types/chan";
import {MessageType} from "../../shared/types/msg";
import {projectThreadMessages} from "../../shared/types/thread";

const asciiCaseFold = (nick: string) => nick.toLowerCase();
const rfc1459CaseFold = (nick: string) =>
	nick
		.toLowerCase()
		.replaceAll("[", "{")
		.replaceAll("]", "}")
		.replaceAll("\\", "|")
		.replaceAll("^", "~");

describe("IRCv3 thread summaries", function () {
	it("should resolve nested replies to their original root", function () {
		const root = new Msg({id: 1, msgid: "root"});
		const firstReply = new Msg({id: 2, msgid: "reply-1", replyTo: "root"});
		const nestedReply = new Msg({id: 3, msgid: "reply-2", replyTo: "reply-1"});
		const messages = [root, firstReply, nestedReply];

		expect(resolveThreadRoot(messages, nestedReply)).to.equal("root");
	});

	it("should project one root and its replies in chronological order", function () {
		const root = new Msg({id: 1, msgid: "root", time: new Date(50)});
		const firstReply = new Msg({
			id: 2,
			msgid: "reply-1",
			replyTo: "root",
			time: new Date(200),
		});
		const nestedReply = new Msg({
			id: 3,
			msgid: "reply-2",
			replyTo: "reply-1",
			time: new Date(100),
		});
		const unrelated = new Msg({id: 4, msgid: "other", time: new Date(300)});

		const projected = projectThreadMessages([root, firstReply, unrelated, nestedReply], "root");

		expect(projected?.map((message) => message.id)).to.deep.equal([1, 3, 2]);
		expect(projectThreadMessages([firstReply], "root")).to.be.undefined;
	});

	it("should keep the immediate parent as a temporary root across history gaps", function () {
		const nestedReply = new Msg({id: 3, msgid: "reply-2", replyTo: "missing-reply"});

		expect(resolveThreadRoot([nestedReply], nestedReply)).to.equal("missing-reply");
	});

	it("should count replies, deduplicate participants, and select the latest reply", function () {
		const messages = [
			new Msg({id: 1, msgid: "root", time: new Date(50)}),
			new Msg({
				id: 2,
				msgid: "reply-1",
				replyTo: "root",
				from: {nick: "Alice", mode: ""},
				time: new Date(100),
			}),
			new Msg({
				id: 4,
				msgid: "reply-3",
				replyTo: "root",
				from: {nick: "alice", mode: ""},
				time: new Date(200),
			}),
			new Msg({
				id: 3,
				msgid: "reply-2",
				replyTo: "reply-1",
				from: {nick: "Bob", mode: ""},
				time: new Date(300),
			}),
		];

		const threads = buildThreadSummaries(messages, asciiCaseFold);

		expect(threads).to.deep.equal({
			root: {
				rootMsgid: "root",
				replyCount: 3,
				participants: ["Alice", "Bob"],
				latestReplyId: 3,
				latestReplyTime: 300,
			},
		});
	});

	it("should use IRC casemapping when deduplicating participants", function () {
		const messages = [
			new Msg({id: 1, msgid: "root"}),
			new Msg({id: 2, replyTo: "root", from: {nick: "[Nick]", mode: ""}}),
			new Msg({id: 3, replyTo: "root", from: {nick: "{nick}", mode: ""}}),
		];

		const threads = buildThreadSummaries(messages, rfc1459CaseFold);

		expect(threads?.root.participants).to.deep.equal(["[Nick]"]);
	});

	it("should ignore reaction records even if they contain a reply target", function () {
		const messages = [
			new Msg({id: 1, msgid: "root"}),
			new Msg({
				id: 2,
				type: MessageType.REACTION,
				replyTo: "root",
				reactionTo: "root",
				reactionEmoji: "thumbsup",
			}),
		];

		expect(buildThreadSummaries(messages, asciiCaseFold)).to.be.undefined;
	});

	it("should not allocate summaries for ordinary message history", function () {
		const messages = Array.from(
			{length: 5000},
			(_, index) => new Msg({id: index, msgid: `message-${index}`})
		);

		expect(buildThreadSummaries(messages, asciiCaseFold)).to.be.undefined;
	});

	it("should update only the affected summary without mutating the previous state", function () {
		const root = new Msg({id: 1, msgid: "root"});
		const reply = new Msg({
			id: 2,
			replyTo: "root",
			from: {nick: "Alice", mode: ""},
			time: new Date(100),
		});
		const previous = {
			other: {
				rootMsgid: "other",
				replyCount: 1,
				participants: ["Bob"],
				latestReplyId: 9,
				latestReplyTime: 90,
			},
		};

		const updated = updateThreadSummaries(previous, [root, reply], reply, asciiCaseFold);

		expect(updated).to.not.equal(previous);
		expect(updated?.other).to.equal(previous.other);
		expect(updated?.root.replyCount).to.equal(1);
		expect(previous).to.not.have.property("root");
	});

	it("should keep empty channels and queries on the sparse path", function () {
		const channel = new Chan();
		const query = new Chan({type: ChanType.QUERY});
		const reply = new Msg({id: 2, replyTo: "root"});

		channel.rebuildThreadSummaries(asciiCaseFold);
		query.messages = [reply];
		query.rebuildThreadSummaries(asciiCaseFold);

		expect(channel).to.not.have.own.property("threads");
		expect(channel.getFilteredClone()).to.not.have.own.property("threads");
		expect(query).to.not.have.own.property("threads");
	});

	it("should rebuild summaries before sending loaded history", async function () {
		const channel = new Chan({id: 23});
		const root = new Msg({id: 1, msgid: "root"});
		const reply = new Msg({
			id: 2,
			msgid: "reply",
			replyTo: "root",
			from: {nick: "Alice", mode: ""},
		});
		const emit = sinon.stub();
		const client = {
			name: "tester",
			idMsg: 3,
			messageProvider: {getMessages: sinon.stub().resolves([root, reply])},
			emit,
		};
		const network = {
			uuid: "network",
			irc: {
				caseLower: asciiCaseFold,
				network: {cap: {isEnabled: () => false}},
			},
		};

		channel.loadMessages(client as any, network as any);
		await new Promise((resolve) => setImmediate(resolve));

		expect(channel.threads?.root.replyCount).to.equal(1);
		sinon.assert.calledWithMatch(emit, "more", {
			chan: 23,
			threads: {root: {rootMsgid: "root", replyCount: 1}},
		});
	});

	it("should deduplicate stored history that overlaps live messages", async function () {
		const live = new Msg({id: 3, msgid: "live"});
		const stored = new Msg({id: 1, msgid: "stored"});
		const duplicate = new Msg({id: 2, msgid: "live"});
		const channel = new Chan({id: 23, messages: [live]});
		const emit = sinon.stub();
		const client = {
			name: "tester",
			idMsg: 4,
			messageProvider: {getMessages: sinon.stub().resolves([stored, duplicate])},
			emit,
		};
		const network = {
			uuid: "network",
			irc: {
				caseLower: asciiCaseFold,
				network: {cap: {isEnabled: () => false}},
			},
		};

		channel.loadMessages(client as any, network as any);
		await new Promise((resolve) => setImmediate(resolve));

		expect(channel.messages.map((message) => message.msgid)).to.deep.equal(["stored", "live"]);
		sinon.assert.calledWithMatch(emit, "more", {
			messages: [stored],
			totalMessages: 2,
		});
	});

	it("should update live summaries and remove data pruned from history", function () {
		const originalMaxHistory = Config.values.maxHistory;
		const originalPublic = Config.values.public;
		Config.values.maxHistory = 2;
		Config.values.public = false;

		try {
			const channel = new Chan({id: 23});
			const emit = sinon.stub();
			const client = {
				idMsg: 1,
				attachedClients: [],
				messageStorage: [],
				emit,
				find: () => ({
					chan: channel,
					network: {irc: {caseLower: asciiCaseFold}},
				}),
			};

			channel.pushMessage(client as any, new Msg({msgid: "root"}));
			channel.pushMessage(
				client as any,
				new Msg({
					msgid: "reply",
					replyTo: "root",
					from: {nick: "Alice", mode: ""},
				})
			);

			expect(channel.threads?.root.replyCount).to.equal(1);
			expect(emit.lastCall.args[1].thread.rootMsgid).to.equal("root");

			channel.pushMessage(client as any, new Msg({msgid: "ordinary-1"}));
			channel.pushMessage(client as any, new Msg({msgid: "ordinary-2"}));

			expect(channel).to.not.have.own.property("threads");
			expect(emit.lastCall.args[1].threads).to.equal(null);
		} finally {
			Config.values.maxHistory = originalMaxHistory;
			Config.values.public = originalPublic;
		}
	});
});

describe("IRCv3 thread history", function () {
	it("should return a complete thread outside the browser window", function () {
		const channel = new Chan({id: 23});
		channel.messages = [
			new Msg({id: 1, msgid: "root"}),
			...Array.from(
				{length: 250},
				(_, index) => new Msg({id: index + 2, msgid: `reply-${index}`, replyTo: "root"})
			),
		];
		const client = {find: () => ({chan: channel})};

		const response = Client.prototype.getThread.call(client as any, {
			target: 23,
			rootMsgid: "root",
		});

		expect(channel.getFilteredClone(true).messages).to.have.lengthOf(100);
		expect(response.messages).to.have.lengthOf(251);
	});

	it("should page through canonical history without overlap", function () {
		const channel = new Chan({id: 23});
		channel.messages = Array.from(
			{length: 250},
			(_, index) => new Msg({id: index + 1, msgid: `message-${index}`})
		);
		const client = {find: () => ({chan: channel})};
		const pages: Msg[][] = [];
		let lastId = -1;

		do {
			const response = Client.prototype.more.call(client as any, {
				target: 23,
				lastId,
				condensed: false,
			});

			if (!response) {
				throw new Error("Expected thread history response");
			}

			pages.unshift(response.messages);
			lastId = response.messages[0]?.id;
		} while (lastId > 1);

		const messages = pages.flat();
		expect(messages.map((message) => message.id)).to.deep.equal(
			channel.messages.map((message) => message.id)
		);
		expect(new Set(messages.map((message) => message.msgid)).size).to.equal(250);
	});
});

describe("IRCv3 thread unread state", function () {
	let originalPublic: boolean;
	type AttachedClients = Record<
		string,
		{token: string; openChannel: number; openThread?: string}
	>;

	before(function () {
		originalPublic = Config.values.public;
		Config.values.public = false;
	});

	after(function () {
		Config.values.public = originalPublic;
	});

	function createClient(channel: Chan, attachedClients: AttachedClients = {}) {
		return {
			idMsg: 2,
			attachedClients,
			messageStorage: [],
			emit: sinon.stub(),
			find: () => ({
				chan: channel,
				network: {irc: {caseLower: asciiCaseFold}},
			}),
		};
	}

	function createChannel(rootSelf = false) {
		return new Chan({
			id: 23,
			messages: [new Msg({id: 1, msgid: "root", self: rootSelf})],
		});
	}

	function pushReply(channel: Chan, client: ReturnType<typeof createClient>, attr = {}) {
		return channel.pushMessage(
			client as any,
			new Msg({
				msgid: `reply-${client.idMsg}`,
				replyTo: "root",
				from: {nick: "Alice", mode: ""},
				...attr,
			}),
			{increasesUnread: true}
		);
	}

	it("should count ordinary messages in a closed channel", function () {
		const channel = new Chan({id: 23});
		const client = createClient(channel);

		channel.pushMessage(client as any, new Msg(), {increasesUnread: true});

		expect(channel.unread).to.equal(1);
		expect(channel.threadStates).to.be.undefined;
		expect(channel.getFilteredClone()).to.not.have.property("threadStates");
	});

	it("should route non-participating replies to the channel", function () {
		const channel = createChannel();
		const client = createClient(channel);

		pushReply(channel, client, {highlight: true});

		expect(channel.unread).to.equal(1);
		expect(channel.highlight).to.equal(1);
		expect(channel.threadStates).to.be.undefined;
	});

	it("should route participating replies to a closed thread", function () {
		const channel = createChannel(true);
		channel.unread = 4;
		channel.highlight = 2;
		const client = createClient(channel);

		const result = pushReply(channel, client, {highlight: true});

		expect(channel.unread).to.equal(4);
		expect(channel.highlight).to.equal(2);
		expect(channel.threadStates?.root.unread).to.equal(1);
		expect(channel.threadStates?.root.highlight).to.equal(1);
		expect(result.threadRootMsgid).to.equal("root");
	});

	it("should keep counting a thread when only its parent is open", function () {
		const channel = createChannel(true);
		const client = createClient(channel, {
			parent: {token: "parent", openChannel: 23},
		});

		pushReply(channel, client);

		expect(channel.unread).to.equal(0);
		expect(channel.threadStates?.root.unread).to.equal(1);
	});

	it("should not count a reply when the exact thread is open", function () {
		const channel = createChannel(true);
		const client = createClient(channel, {
			parent: {token: "parent", openChannel: 23},
			thread: {token: "thread", openChannel: 23, openThread: "root"},
		});

		pushReply(channel, client, {highlight: true});

		expect(channel.unread).to.equal(0);
		expect(channel.highlight).to.equal(0);
		expect(channel.threadStates?.root.unread).to.equal(0);
		expect(channel.threadStates?.root.highlight).to.equal(0);
		expect(channel.threadStates?.root.firstUnread).to.equal(2);
	});

	it("should remember own replies without changing unread counters", function () {
		const channel = createChannel();
		channel.unread = 3;
		channel.highlight = 1;
		const client = createClient(channel);

		pushReply(channel, client, {self: true});

		expect(channel.unread).to.equal(3);
		expect(channel.highlight).to.equal(1);
		expect(channel.threadStates?.root).to.include({
			participating: true,
			unread: 0,
			highlight: 0,
			firstUnread: 2,
			lastReplyId: 2,
		});
	});

	it("should migrate a sparse thread when its root arrives late", function () {
		const channel = new Chan({id: 23});
		const client = createClient(channel);

		channel.pushMessage(
			client as any,
			new Msg({msgid: "nested", replyTo: "parent", self: true})
		);
		channel.pushMessage(client as any, new Msg({msgid: "nested-2", replyTo: "parent"}), {
			increasesUnread: true,
		});
		channel.pushMessage(client as any, new Msg({msgid: "parent", replyTo: "root", self: true}));
		channel.pushMessage(client as any, new Msg({msgid: "parent-2", replyTo: "root"}), {
			increasesUnread: true,
		});
		channel.pushMessage(client as any, new Msg({msgid: "root", self: true}));

		expect(channel.threads).to.have.all.keys("root");
		expect(channel.threads?.root.replyCount).to.equal(4);
		expect(channel.threadStates).to.have.all.keys("root");
		expect(channel.threadStates?.root.unread).to.equal(2);
		expect(client.emit.lastCall.args[1].threadStates).to.have.all.keys("root");
	});

	it("should ignore repeated IRC messages before updating state", function () {
		const channel = createChannel(true);
		const client = createClient(channel);
		const first = pushReply(channel, client, {msgid: "duplicate"});
		const idAfterFirst = client.idMsg;
		const emitCount = client.emit.callCount;
		const duplicate = pushReply(channel, client, {msgid: "duplicate"});

		expect(first.duplicate).to.be.undefined;
		expect(duplicate.duplicate).to.equal(true);
		expect(client.idMsg).to.equal(idAfterFirst);
		expect(client.emit.callCount).to.equal(emitCount);
		expect(channel.messages).to.have.lengthOf(2);
		expect(channel.threadStates?.root.unread).to.equal(1);
	});

	it("should discard read state when a thread root is pruned", function () {
		const originalMaxHistory = Config.values.maxHistory;
		Config.values.maxHistory = 2;

		try {
			const channel = createChannel(true);
			const client = createClient(channel);

			pushReply(channel, client, {self: true});
			channel.pushMessage(client as any, new Msg({msgid: "ordinary"}));

			expect(channel.messages.map((message) => message.msgid)).to.deep.equal([
				"reply-2",
				"ordinary",
			]);
			expect(channel.threadStates).to.be.undefined;
		} finally {
			Config.values.maxHistory = originalMaxHistory;
		}
	});

	it("should retain unread state until a pruned thread is opened", function () {
		const originalMaxHistory = Config.values.maxHistory;
		Config.values.maxHistory = 2;

		try {
			const channel = createChannel(true);
			const client = createClient(channel, {
				tab: {token: "tab", openChannel: 23},
			});

			pushReply(channel, client);
			channel.pushMessage(client as any, new Msg({msgid: "ordinary"}));

			expect(channel.threadStates?.root.unread).to.equal(1);
			Client.prototype.openThread.call(client as any, "tab", {
				target: 23,
				rootMsgid: "root",
			});

			expect(client.attachedClients.tab.openThread).to.equal("root");
			expect(channel.threadStates).to.be.undefined;
			sinon.assert.calledWithMatch(client.emit, "thread:read", {state: null});
		} finally {
			Config.values.maxHistory = originalMaxHistory;
		}
	});

	it("should clear channel and thread state independently", function () {
		const channel = createChannel(true);
		channel.unread = 3;
		channel.highlight = 1;
		const client = createClient(channel, {
			first: {token: "first", openChannel: 99},
			second: {token: "second", openChannel: 23},
		});

		pushReply(channel, client, {highlight: true});
		Client.prototype.openThread.call(client as any, "first", {
			target: 23,
			rootMsgid: "root",
		});

		expect(channel.unread).to.equal(3);
		expect(channel.highlight).to.equal(1);
		expect(channel.threadStates?.root.unread).to.equal(0);
		expect(client.attachedClients.first.openThread).to.equal("root");
		sinon.assert.calledWithMatch(client.emit, "thread:read", {
			chan: 23,
			rootMsgid: "root",
		});

		channel.threadStates!.root.unread = 2;
		Client.prototype.open.call(client as any, "first", 23);

		expect(channel.unread).to.equal(0);
		expect(channel.highlight).to.equal(0);
		expect(channel.threadStates?.root.unread).to.equal(2);
		expect(client.attachedClients.first).to.not.have.property("openThread");
	});

	it("should rebuild and clone sparse participation state", function () {
		const channel = createChannel(true);
		channel.messages.push(
			new Msg({
				id: 2,
				msgid: "reply",
				replyTo: "root",
				from: {nick: "Alice", mode: ""},
			})
		);

		channel.rebuildThreadSummaries(asciiCaseFold);
		channel.rebuildThreadStates();

		expect(channel.threadStates?.root).to.include({
			participating: true,
			unread: 0,
			lastReplyId: 2,
		});
		expect(channel.getFilteredClone().threadStates).to.deep.equal(channel.threadStates);
	});

	it("should remove all thread state when history is cleared", function () {
		const channel = createChannel(true);
		const client = createClient(channel, {
			first: {token: "first", openChannel: 23, openThread: "root"},
			second: {token: "second", openChannel: 99, openThread: "other"},
		});

		pushReply(channel, client);
		Client.prototype.clearHistory.call(client as any, {target: 23});

		expect(channel.messages).to.be.empty;
		expect(channel.threads).to.be.undefined;
		expect(channel.threadStates).to.be.undefined;
		expect(client.attachedClients.first).to.not.have.property("openThread");
		expect(client.attachedClients.second.openThread).to.equal("other");
		sinon.assert.calledWith(client.emit, "history:clear", {target: 23});
	});
});
