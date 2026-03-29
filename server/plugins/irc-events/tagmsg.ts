import {IrcEventHandler} from "../../client";
import {ChanType} from "../../../shared/types/chan";
import {applyReaction, getReactEvent} from "./react";

const typingStatuses = new Set(["active", "paused", "done"]);

export default <IrcEventHandler>function (irc, network) {
	const client = this;

	irc.on("tagmsg", function (data: {
		channel?: string;
		nick?: string;
		target?: string;
		tags?: {[key: string]: string};
	}) {
		const nick = data.nick;
		const reactEvent = getReactEvent(data.tags);
		const status = data.tags?.["+typing"] || data.tags?.typing;
		const rawTarget = data.target || data.channel;

		if (!nick || !rawTarget) {
			return;
		}

		let target = rawTarget;

		if (target.toLowerCase() === irc.user.nick.toLowerCase()) {
			target = nick;
		}

		const chan = network.getChannel(target);

		if (!chan || ![ChanType.CHANNEL, ChanType.QUERY].includes(chan.type)) {
			return;
		}

		if (reactEvent) {
			applyReaction(client, chan, reactEvent.replyTo, reactEvent.reaction, nick);
		}

		if (!status || !typingStatuses.has(status) || nick === irc.user.nick) {
			return;
		}

		client.emit("typing", {
			chan: chan.id,
			nick,
			status: status as "active" | "paused" | "done",
		});
	});
};
