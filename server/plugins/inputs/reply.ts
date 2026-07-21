import {PluginInputHandler} from "./index";
import Msg from "../../models/msg";
import {MessageType} from "../../../shared/types/msg";
import {ChanType} from "../../../shared/types/chan";
import {findLatestReplyTarget, findReplyTargetById} from "./replyTarget";

const commands = ["reply"];

const usageText = "Usage: /reply <message>";

const input: PluginInputHandler = function (_network, chan, _cmd, args) {
	if (chan.type !== ChanType.CHANNEL && chan.type !== ChanType.QUERY) {
		chan.pushMessage(
			this,
			new Msg({
				type: MessageType.ERROR,
				text: "reply command can only be used in channels and queries.",
			})
		);

		return true;
	}

	const text = args.join(" ").trim();

	if (!text) {
		chan.pushMessage(
			this,
			new Msg({
				type: MessageType.ERROR,
				text: usageText,
			})
		);

		return true;
	}

	const targetMessage = findLatestReplyTarget(chan);

	if (!targetMessage) {
		chan.pushMessage(
			this,
			new Msg({
				type: MessageType.ERROR,
				text: "Could not find a recent message to reply to in this channel.",
			})
		);

		return true;
	}

	const result = this.reply({
		target: chan.id,
		msgId: targetMessage.id,
		text,
	});

	if (result === "message_not_found") {
		chan.pushMessage(
			this,
			new Msg({
				type: MessageType.ERROR,
				text: `Could not find message ${targetMessage.id} in this channel.`,
			})
		);
	} else if (result === "unsupported") {
		chan.pushMessage(
			this,
			new Msg({
				type: MessageType.ERROR,
				text: "This message can not be replied to right now.",
			})
		);
	}

	return true;
};

export {findLatestReplyTarget, findReplyTargetById};

export default {
	commands,
	input,
};
