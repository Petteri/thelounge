import {expect} from "chai";
import sinon from "sinon";

import Client from "../../server/client";
import Chan from "../../server/models/chan";
import Msg from "../../server/models/msg";
import {getTypingEvent} from "../../server/plugins/irc-events/tagmsg";

describe("IRCv3 typing notifications", function () {
	it("should preserve the reply context on typing tags", function () {
		expect(
			getTypingEvent({
				"+typing": "active",
				"+reply": "root",
			})
		).to.deep.equal({status: "active", rootMsgid: "root"});
		expect(getTypingEvent({typing: "paused"})).to.deep.equal({status: "paused"});
		expect(getTypingEvent({"+typing": "invalid"})).to.equal(null);
	});

	it("should send typing tags with a known thread root", function () {
		const {client, tagmsg} = createTypingClient();

		Client.prototype.typing.call(client as any, {
			target: 23,
			status: "active",
			rootMsgid: "root",
		});

		sinon.assert.calledOnceWithExactly(tagmsg, "#thelounge", {
			"+typing": "active",
			"+reply": "root",
		});
	});

	it("should fall back to channel typing when reply tags are unavailable", function () {
		const {client, tagmsg} = createTypingClient({supportsReply: false});

		Client.prototype.typing.call(client as any, {
			target: 23,
			status: "active",
			rootMsgid: "root",
		});

		sinon.assert.calledOnceWithExactly(tagmsg, "#thelounge", {
			"+typing": "active",
		});
	});

	it("should not attach unknown thread roots", function () {
		const {client, tagmsg} = createTypingClient();

		Client.prototype.typing.call(client as any, {
			target: 23,
			status: "active",
			rootMsgid: "missing",
		});

		sinon.assert.calledOnceWithExactly(tagmsg, "#thelounge", {
			"+typing": "active",
		});
	});
});

function createTypingClient(options: {supportsReply?: boolean} = {}) {
	const channel = new Chan({
		id: 23,
		name: "#thelounge",
		messages: [new Msg({id: 1, msgid: "root"})],
	});
	const tagmsg = sinon.stub();
	const irc = {
		connected: true,
		network: {
			cap: {
				isEnabled(cap: string) {
					return cap === "message-tags";
				},
			},
			supportsTag(tagName: string) {
				return tagName === "+reply" && options.supportsReply !== false;
			},
		},
		tagmsg,
	};
	const client = {
		find() {
			return {
				network: {irc},
				chan: channel,
			};
		},
	};

	return {client, tagmsg};
}
