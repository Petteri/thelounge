import Msg from "../../models/msg";
import User from "../../models/user";
import type {IrcEventHandler} from "../../client";
import {MessageType} from "../../../shared/types/msg";
import {ChanState, ChanType} from "../../../shared/types/chan";

export default <IrcEventHandler>function (irc, network) {
	const client = this;

	function populateUsersAwayState(chan) {
		if (chan.type !== ChanType.CHANNEL) {
			return;
		}

		irc.who(chan.name, (whoData) => {
			for (const whoUser of whoData.users) {
				const user = chan.getUser(whoUser.nick);
				user.away =
					typeof whoUser.away === "string" ? whoUser.away : whoUser.away ? "away" : "";
				chan.setUser(user);
			}

			client.emit("users", {
				chan: chan.id,
			});
		});
	}

	function populateUserAwayState(chan, nick: string) {
		if (chan.type !== ChanType.CHANNEL) {
			return;
		}

		irc.who(nick, (whoData) => {
			for (const whoUser of whoData.users) {
				if (whoUser.nick.toLowerCase() !== nick.toLowerCase()) {
					continue;
				}

				const user = chan.findUser(whoUser.nick);

				if (!user) {
					return;
				}

				user.away =
					typeof whoUser.away === "string" ? whoUser.away : whoUser.away ? "away" : "";
				chan.setUser(user);

				client.emit("users", {
					chan: chan.id,
				});

				return;
			}
		});
	}

	irc.on("join", function (data) {
		let chan = network.getChannel(data.channel);
		const isSelf = data.nick === irc.user.nick;

		if (typeof chan === "undefined") {
			chan = client.createChannel({
				name: data.channel,
				state: ChanState.JOINED,
			});

			client.emit("join", {
				network: network.uuid,
				chan: chan.getFilteredClone(true),
				shouldOpen: false,
				index: network.addChannel(chan),
			});
			client.save();

			chan.loadMessages(client, network);

			// Request channels' modes
			network.irc.raw("MODE", chan.name);
		} else if (isSelf) {
			chan.state = ChanState.JOINED;

			client.emit("channel:state", {
				chan: chan.id,
				state: chan.state,
			});
		}

		const user = new User({nick: data.nick});
		const msg = new Msg({
			time: data.time,
			from: user,
			hostmask: data.ident + "@" + data.hostname,
			gecos: data.gecos,
			account: data.account,
			type: MessageType.JOIN,
			self: isSelf,
		});
		chan.pushMessage(client, msg);

		chan.setUser(new User({nick: data.nick}));
		client.emit("users", {
			chan: chan.id,
		});

		if (isSelf) {
			populateUsersAwayState(chan);
		} else {
			populateUserAwayState(chan, data.nick);
		}
	});
};
