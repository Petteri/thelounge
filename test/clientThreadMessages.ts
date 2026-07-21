import {expect} from "chai";

import {
	getMessageThread,
	isThreadStartableMessage,
	projectChannelMessages,
} from "../client/js/helpers/threadMessages";
import {
	canonicalHistoryLength,
	hasMoreHistory,
	mergeMessageHistory,
} from "../client/js/helpers/messageHistory";
import {
	appendPendingThreadReply,
	getPendingThreadReplyLines,
	getThreadParticipants,
	mergeThreadResponse,
	reconcilePendingThreadReply,
} from "../client/js/threads";
import type {ClientThread} from "../client/js/types";
import {ChanType, ThreadSummaries} from "../shared/types/chan";
import {MessageType, SharedMsg} from "../shared/types/msg";

describe("Client thread message projection", function () {
	const root = {id: 1, msgid: "root"} as SharedMsg;
	const reply = {id: 2, msgid: "reply", replyTo: "root"} as SharedMsg;
	const messages = [root, reply];
	const threads: ThreadSummaries = {
		root: {
			rootMsgid: "root",
			replyCount: 1,
			participants: ["Alice"],
			latestReplyId: 2,
			latestReplyTime: 100,
		},
	};

	it("should preserve the fast path for channels without replies", function () {
		const projected = projectChannelMessages({
			type: ChanType.CHANNEL,
			messages,
		});

		expect(projected).to.equal(messages);
	});

	it("should hide reply rows from channels with thread summaries", function () {
		const projected = projectChannelMessages({
			type: ChanType.CHANNEL,
			messages,
			threads,
		});

		expect(projected).to.deep.equal([root]);
		expect(getMessageThread(threads, root)).to.equal(threads.root);
	});

	it("should offer thread creation only for root messages with message IDs", function () {
		const message = {...root, type: MessageType.MESSAGE};

		expect(isThreadStartableMessage(message)).to.equal(true);
		expect(isThreadStartableMessage({...message, type: MessageType.ACTION})).to.equal(true);
		expect(isThreadStartableMessage({...message, msgid: undefined})).to.equal(false);
		expect(isThreadStartableMessage({...message, pending: true})).to.equal(false);
		expect(isThreadStartableMessage({...message, replyTo: "parent"})).to.equal(false);
		expect(isThreadStartableMessage({...message, type: MessageType.NOTICE})).to.equal(false);
	});

	it("should keep replies visible in queries", function () {
		const projected = projectChannelMessages({
			type: ChanType.QUERY,
			messages,
			threads,
		});

		expect(projected).to.equal(messages);
	});

	it("should replace a pending thread reply with its server echo", function () {
		const thread: ClientThread = {
			channelId: 23,
			rootMsgid: "root",
			messages: [root],
			loading: false,
		};
		const pending = appendPendingThreadReply(thread, "Alice", "hello");
		const echo = {
			id: 42,
			replyTo: "root",
			from: {mode: "", nick: "Alice"},
			self: true,
			text: "hello",
			time: new Date(),
			type: MessageType.MESSAGE,
			users: [],
		} as SharedMsg;

		expect(pending.pending).to.equal(true);
		expect(reconcilePendingThreadReply(thread, echo)).to.equal(true);
		expect(thread.messages).to.deep.equal([root, echo]);
	});

	it("should create pending rows only for ordinary multiline input", function () {
		expect(
			getPendingThreadReplyLines("first line\n/join #other\n//literal slash\n\nlast line")
		).to.deep.equal(["first line", "/literal slash", "last line"]);
	});

	it("should not consume a pending reply for an unrelated message", function () {
		const thread: ClientThread = {
			channelId: 23,
			rootMsgid: "root",
			messages: [root],
			loading: false,
		};
		const pending = appendPendingThreadReply(thread, "Alice", "hello");
		const unrelated = {
			id: 43,
			replyTo: "root",
			self: false,
			text: "hello",
			time: new Date(),
			type: MessageType.MESSAGE,
			users: [],
		} as SharedMsg;

		expect(reconcilePendingThreadReply(thread, unrelated)).to.equal(false);
		expect(thread.messages).to.deep.equal([root, pending]);
	});

	it("should merge reconnect and history pages by message identity", function () {
		const current = {id: 10, msgid: "same", text: "old"} as SharedMsg;
		const reconnect = {id: 20, msgid: "same", text: "canonical"} as SharedMsg;
		const latest = {id: 10, msgid: "latest"} as SharedMsg;
		const reconnected = mergeMessageHistory([current], [reconnect, latest], "append");

		expect(reconnected.messages).to.deep.equal([current, latest]);
		expect(reconnected.addedMessages).to.deep.equal([latest]);
		expect(current).to.include({id: 20, text: "canonical"});

		const older = {id: 19, msgid: "older"} as SharedMsg;
		const paged = mergeMessageHistory(reconnected.messages, [older, reconnect], "prepend");

		expect(paged.messages).to.deep.equal([older, current, latest]);
		expect(new Set(paged.messages.map((message) => message.msgid)).size).to.equal(3);
	});

	it("should stop history loading when a page adds no messages", function () {
		const visible = {id: 1, msgid: "visible"} as SharedMsg;
		const routedNotice = {id: 2, showInActive: true} as SharedMsg;

		expect(canonicalHistoryLength([visible, routedNotice])).to.equal(1);
		expect(hasMoreHistory(3, [visible, routedNotice], 1)).to.equal(true);
		expect(hasMoreHistory(3, [visible, routedNotice], 0)).to.equal(false);
	});

	it("should preserve replies received while a thread request is pending", function () {
		const serverRoot = {id: 1, msgid: "root"} as SharedMsg;
		const serverReply = {id: 2, msgid: "reply", replyTo: "root"} as SharedMsg;
		const liveReply = {id: 3, msgid: "live", replyTo: "root"} as SharedMsg;
		const thread: ClientThread = {
			channelId: 23,
			rootMsgid: "root",
			messages: [root, liveReply],
			loading: true,
			requestLastId: 2,
		};
		const pending = appendPendingThreadReply(thread, "Alice", "pending");
		const merged = mergeThreadResponse(thread, [serverRoot, serverReply]);

		expect(merged).to.deep.equal([serverRoot, serverReply, liveReply, pending]);
	});

	it("should build a channel-style list of thread participants", function () {
		const alice = {
			away: "Gone",
			lastMessage: 40,
			mode: "@",
			modes: ["@"],
			nick: "Alice",
		};
		const bob = {
			away: "",
			lastMessage: 50,
			mode: "+",
			modes: ["+"],
			nick: "Bob",
		};
		const threadMessages = [
			{
				id: 1,
				from: {mode: "", nick: "Alice"},
				time: new Date(10),
			},
			{
				id: 2,
				from: {mode: "+", nick: "Charlie"},
				time: new Date(20),
			},
			{
				id: 3,
				from: {mode: "", nick: "charlie"},
				time: new Date(30),
			},
			{
				id: 4,
				from: {mode: "", nick: "Bob"},
				time: new Date(40),
			},
		] as SharedMsg[];

		const participants = getThreadParticipants(threadMessages, [bob, alice]);

		expect(participants.map((user) => user.nick)).to.deep.equal(["Bob", "Alice", "Charlie"]);
		expect(participants[0]).to.equal(bob);
		expect(participants[1]).to.equal(alice);
		expect(participants[2]).to.deep.equal({
			away: "",
			lastMessage: 30,
			mode: "+",
			modes: ["+"],
			nick: "Charlie",
		});
	});
});
