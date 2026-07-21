import {expect} from "chai";
import sinon from "sinon";

import Client from "../../server/client";
import Chan from "../../server/models/chan";
import Msg from "../../server/models/msg";
import {ChanType} from "../../shared/types/chan";
import {MessageType} from "../../shared/types/msg";
import ReplyCommand, {
	findLatestReplyTarget,
	findReplyTargetById,
} from "../../server/plugins/inputs/reply";
import {findReplyTargetByMsgid} from "../../server/plugins/inputs/replyTarget";

describe("Commands", function () {
	describe("/reply", function () {
		const channel = new Chan({
			id: 23,
			name: "#thelounge",
		});

		const lobby = new Chan({
			id: 99,
			name: "Network Lobby",
			type: ChanType.LOBBY,
		});

		beforeEach(function () {
			channel.messages = [];
		});

		it("should dispatch a reply for the latest top-level message by default", function () {
			channel.messages = [
				new Msg({id: 10, msgid: "older-root"}),
				new Msg({id: 12, msgid: "nested-reply", replyTo: "older-root"}),
				new Msg({id: 15, msgid: "latest-root"}),
			];

			const reply = sinon.stub().returns("sent");

			ReplyCommand.input.call({reply} as any, {} as any, channel, "reply", ["hello"]);

			sinon.assert.calledOnceWithExactly(reply, {
				target: 23,
				msgId: 15,
				text: "hello",
			});
		});

		it("should resolve nested replies back to the original root", function () {
			channel.messages = [
				new Msg({id: 10, msgid: "root"}),
				new Msg({id: 12, msgid: "reply-1", replyTo: "root"}),
				new Msg({id: 14, msgid: "reply-2", replyTo: "reply-1"}),
			];

			const target = findReplyTargetById(channel, 14);

			expect(target?.id).to.equal(10);
			expect(target?.msgid).to.equal("root");
		});

		it("should resolve a thread root by protocol message ID", function () {
			channel.messages = [
				new Msg({id: 10, msgid: "root"}),
				new Msg({id: 12, msgid: "reply-1", replyTo: "root"}),
			];

			expect(findReplyTargetByMsgid(channel, "reply-1")?.id).to.equal(10);
			expect(findReplyTargetByMsgid(channel, "missing")).to.equal(undefined);
		});

		it("client.replyToThread should send to the normalized root", function () {
			channel.messages = [
				new Msg({id: 10, msgid: "root"}),
				new Msg({id: 12, msgid: "reply-1", replyTo: "root"}),
			];
			const reply = sinon.stub().returns("sent");
			const client = {
				find() {
					return {chan: channel};
				},
				reply,
			};

			expect(
				(Client.prototype as any).replyToThread.call(client, {
					target: 23,
					rootMsgid: "reply-1",
					text: "hello",
				})
			).to.equal("sent");
			sinon.assert.calledOnceWithExactly(reply, {
				target: 23,
				msgId: 10,
				text: "hello",
			});
		});

		it("should skip reaction messages when choosing the latest reply target", function () {
			channel.messages = [
				new Msg({id: 10, msgid: "root"}),
				new Msg({
					id: 12,
					type: MessageType.REACTION,
					reactionTo: "root",
					reactionEmoji: "👍",
				}),
			];

			expect(findLatestReplyTarget(channel)?.id).to.equal(10);
		});

		it("should show usage when no text is provided", function () {
			const client = {idMsg: 1, emit: sinon.stub(), reply: sinon.stub()};

			ReplyCommand.input.call(client as any, {} as any, channel, "reply", []);

			sinon.assert.calledOnce(client.emit);
			expect(client.emit.firstCall.args[1].msg.type).to.equal(MessageType.ERROR);
			expect(client.emit.firstCall.args[1].msg.text).to.equal("Usage: /reply <message>");
			sinon.assert.notCalled(client.reply);
		});

		it("should show an error when no recent reply target exists", function () {
			const client = {idMsg: 1, emit: sinon.stub(), reply: sinon.stub()};

			ReplyCommand.input.call(client as any, {} as any, channel, "reply", ["hello"]);

			sinon.assert.calledOnce(client.emit);
			expect(client.emit.firstCall.args[1].msg.text).to.equal(
				"Could not find a recent message to reply to in this channel."
			);
			sinon.assert.notCalled(client.reply);
		});

		it("should reject the command in lobbies", function () {
			const client = {idMsg: 1, emit: sinon.stub(), reply: sinon.stub()};

			ReplyCommand.input.call(client as any, {} as any, lobby, "reply", ["hello"]);

			sinon.assert.calledOnce(client.emit);
			expect(client.emit.firstCall.args[1].msg.type).to.equal(MessageType.ERROR);
			expect(client.emit.firstCall.args[1].msg.text).to.equal(
				"reply command can only be used in channels and queries."
			);
			sinon.assert.notCalled(client.reply);
		});

		it("client.reply should send a tagged PRIVMSG and echo locally", function () {
			const message = new Msg({
				id: 42,
				msgid: "abc",
			});

			channel.messages = [message];

			const say = sinon.stub();
			const emit = sinon.stub();

			const client = {
				find() {
					return {
						network: {
							irc: {
								connected: true,
								network: {
									cap: {
										isEnabled(cap: string) {
											return cap === "message-tags";
										},
									},
									supportsTag(tagName: string) {
										return tagName === "+reply";
									},
								},
								say,
								emit,
								user: {nick: "petteri", username: "petteri", host: "example.com"},
							},
							supportsReplies() {
								return true;
							},
						},
						chan: channel,
					};
				},
			};

			expect(
				(Client.prototype as any).reply.call(client, {
					target: 23,
					msgId: 42,
					text: "hello",
				})
			).to.equal("sent");

			sinon.assert.calledOnceWithExactly(say, "#thelounge", "hello", {
				"+reply": "abc",
			});
			sinon.assert.calledOnce(emit);
			expect(emit.firstCall.args[0]).to.equal("privmsg");
			expect(emit.firstCall.args[1].tags).to.deep.equal({"+reply": "abc"});
		});

		it("client.reply should reject replies when the network does not support them", function () {
			channel.messages = [new Msg({id: 42, msgid: "abc"})];
			const say = sinon.stub();
			const client = {
				find() {
					return {
						network: {
							irc: {say},
							supportsReplies() {
								return false;
							},
						},
						chan: channel,
					};
				},
			};

			expect(
				(Client.prototype as any).reply.call(client, {
					target: 23,
					msgId: 42,
					text: "hello",
				})
			).to.equal("unsupported");
			sinon.assert.notCalled(say);
		});
	});
});
