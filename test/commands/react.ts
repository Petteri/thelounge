import {expect} from "chai";
import sinon from "sinon";

import Chan from "../../server/models/chan";
import Msg from "../../server/models/msg";
import {ChanType} from "../../shared/types/chan";
import {MessageType} from "../../shared/types/msg";
import ReactCommand from "../../server/plugins/inputs/react";

describe("Commands", function () {
	describe("/react", function () {
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

		it("should dispatch a reaction for the latest message by default", function () {
			channel.messages = [
				new Msg({id: 12}),
				new Msg({id: 42, msgid: "abc"}),
				new Msg({id: 51, msgid: "def"}),
			];

			const react = sinon.stub().returns("sent");

			ReactCommand.input.call({react} as any, {} as any, channel, "react", ["👍"]);

			sinon.assert.calledOnceWithExactly(react, {
				target: 23,
				msgId: 51,
				emoji: "👍",
			});
		});

		it("should dispatch a reaction for a numeric message id", function () {
			const react = sinon.stub().returns("sent");

			ReactCommand.input.call({react} as any, {} as any, channel, "react", ["42", "👍"]);

			sinon.assert.calledOnceWithExactly(react, {
				target: 23,
				msgId: 42,
				emoji: "👍",
			});
		});

		it("should accept DOM-style message ids", function () {
			const react = sinon.stub().returns("sent");

			ReactCommand.input.call({react} as any, {} as any, channel, "react", ["msg-42", "🔥"]);

			sinon.assert.calledOnceWithExactly(react, {
				target: 23,
				msgId: 42,
				emoji: "🔥",
			});
		});

		it("should show usage on invalid arguments", function () {
			const client = {idMsg: 1, emit: sinon.stub(), react: sinon.stub()};

			ReactCommand.input.call(client as any, {} as any, channel, "react", ["wat"]);

			sinon.assert.calledOnce(client.emit);
			expect(client.emit.firstCall.args[0]).to.equal("msg");
			expect(client.emit.firstCall.args[1].msg.type).to.equal(MessageType.ERROR);
			expect(client.emit.firstCall.args[1].msg.text).to.equal(
				"Usage: /react <emoji> or /react <message-id> <emoji>"
			);
			sinon.assert.notCalled(client.react);
		});

		it("should show usage when no recent reactable message exists", function () {
			const client = {idMsg: 1, emit: sinon.stub(), react: sinon.stub()};

			ReactCommand.input.call(client as any, {} as any, channel, "react", ["👍"]);

			sinon.assert.calledOnce(client.emit);
			expect(client.emit.firstCall.args[1].msg.text).to.equal(
				"Usage: /react <emoji> or /react <message-id> <emoji>"
			);
			sinon.assert.notCalled(client.react);
		});

		it("should show an error when the message is not found", function () {
			const client = {
				idMsg: 1,
				emit: sinon.stub(),
				react: sinon.stub().returns("message_not_found"),
			};

			ReactCommand.input.call(client as any, {} as any, channel, "react", ["42", "👍"]);

			sinon.assert.calledOnce(client.emit);
			expect(client.emit.firstCall.args[1].msg.text).to.equal(
				"Could not find message 42 in this channel."
			);
		});

		it("should reject the command in lobbies", function () {
			const client = {idMsg: 1, emit: sinon.stub(), react: sinon.stub()};

			ReactCommand.input.call(client as any, {} as any, lobby, "react", ["42", "👍"]);

			sinon.assert.calledOnce(client.emit);
			expect(client.emit.firstCall.args[1].msg.type).to.equal(MessageType.ERROR);
			expect(client.emit.firstCall.args[1].msg.text).to.equal(
				"react command can only be used in channels and queries."
			);
			sinon.assert.notCalled(client.react);
		});

		it("client.react should reject duplicate reactions", function () {
			const message = new Msg({
				id: 42,
				msgid: "abc",
				reactions: [{name: "👍", users: ["petteri"]}],
			});

			channel.messages = [message];

			const client = {
				find() {
					return {
						network: {
							nick: "petteri",
							irc: {
								connected: true,
								network: {
									cap: {
										isEnabled(cap: string) {
											return cap === "message-tags";
										},
									},
								},
								tagmsg: sinon.stub(),
								emit: sinon.stub(),
								user: {nick: "petteri", username: "petteri", host: "example.com"},
							},
						},
						chan: channel,
					};
				},
			};

			expect((require("../../server/client").default.prototype as any).react.call(client, {
				target: 23,
				msgId: 42,
				emoji: "👍",
			})).to.equal("already_reacted");
		});
	});
});
