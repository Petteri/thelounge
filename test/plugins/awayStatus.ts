import {EventEmitter} from "events";
import {expect} from "chai";
import sinon from "ts-sinon";
import Client from "../../server/client";
import Chan from "../../server/models/chan";
import Network from "../../server/models/network";
import User from "../../server/models/user";
import join from "../../server/plugins/irc-events/join";
import away from "../../server/plugins/irc-events/away";

class MockIrc extends EventEmitter {
	user = {
		nick: "tester",
	};

	who(_target: string, cb: (data: {users: Array<{nick: string; away?: boolean}>}) => void) {
		cb({
			users: [
				{nick: "tester"},
				{nick: "alice", away: true},
			],
		});
	}
}

describe("Away status IRC events", function () {
	it("should populate away states from WHO after self join", function () {
		const irc = new MockIrc();
		const chan = new Chan({name: "#thelounge"});
		const network = new Network({host: "irc.example.com", channels: [chan]});
		const emit = sinon.stub();
		const client = {
			idMsg: 1,
			emit,
		} as unknown as Client;

		join.apply(client, [irc as any, network as any]);

		irc.emit("join", {
			channel: "#thelounge",
			nick: "tester",
			ident: "tester",
			hostname: "example.com",
			gecos: "Tester",
			time: 1,
		});

		expect(chan.getUser("alice").away).to.equal("away");
		sinon.assert.calledWithMatch(emit, "users", {
			chan: chan.id,
		});
	});

	it("should emit updated users when another user goes away", function () {
		const irc = new MockIrc();
		const chan = new Chan({name: "#thelounge"});
		chan.setUser(new User({nick: "alice"}));
		const network = new Network({host: "irc.example.com", channels: [chan]});
		const emit = sinon.stub();
		const client = {
			emit,
		} as unknown as Client;

		away.apply(client, [irc as any, network as any]);

		irc.emit("away", {
			nick: "alice",
			time: 1,
		});

		expect(chan.getUser("alice").away).to.equal("away");
		sinon.assert.calledWithMatch(emit, "users", {
			chan: chan.id,
		});
	});

	it("should update self away state in channel nicklists", function () {
		const irc = new MockIrc();
		const chan = new Chan({name: "#thelounge"});
		chan.setUser(new User({nick: "tester"}));
		const network = new Network({host: "irc.example.com", channels: [chan]});
		const emit = sinon.stub();
		const client = {
			idMsg: 1,
			emit,
		} as unknown as Client;

		away.apply(client, [irc as any, network as any]);

		irc.emit("away", {
			self: true,
			nick: "tester",
			message: "brb",
			time: 1,
		});

		expect(chan.getUser("tester").away).to.equal("brb");
		sinon.assert.calledWithMatch(emit, "users", {
			chan: chan.id,
		});
	});

	it("should populate away state when another user joins already away", function () {
		const irc = new MockIrc();
		const chan = new Chan({name: "#thelounge"});
		const network = new Network({host: "irc.example.com", channels: [chan]});
		const emit = sinon.stub();
		const client = {
			idMsg: 1,
			emit,
		} as unknown as Client;

		join.apply(client, [irc as any, network as any]);

		irc.emit("join", {
			channel: "#thelounge",
			nick: "alice",
			ident: "alice",
			hostname: "example.com",
			gecos: "Alice",
			time: 1,
		});

		expect(chan.getUser("alice").away).to.equal("away");
		sinon.assert.calledWithMatch(emit, "users", {
			chan: chan.id,
		});
	});
});
