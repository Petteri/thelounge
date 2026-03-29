import {IrcEventHandler} from "../../client";
import {ChanType} from "../../../shared/types/chan";

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
		const status = data.tags?.["+typing"] || data.tags?.typing;
		const rawTarget = data.target || data.channel;

		if (!nick || !status || !typingStatuses.has(status) || nick === irc.user.nick || !rawTarget) {
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

		client.emit("typing", {
			chan: chan.id,
			nick,
			status: status as "active" | "paused" | "done",
		});
	});
};
