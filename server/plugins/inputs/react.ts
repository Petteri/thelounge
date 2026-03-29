import {PluginInputHandler} from "./index";
import Msg from "../../models/msg";
import {MessageType} from "../../../shared/types/msg";
import {ChanType} from "../../../shared/types/chan";

const commands = ["react"];

const usageText = "Usage: /react <emoji> or /react <message-id> <emoji>";

const input: PluginInputHandler = function (_network, chan, _cmd, args) {
	if (chan.type !== ChanType.CHANNEL && chan.type !== ChanType.QUERY) {
		chan.pushMessage(
			this,
			new Msg({
				type: MessageType.ERROR,
				text: "react command can only be used in channels and queries.",
			})
		);

		return true;
	}

	let messageId: string | undefined;
	let emoji: string | undefined;

	if (args.length === 1) {
		emoji = args[0];
		messageId = [...chan.messages]
			.reverse()
			.find((message) => Boolean(message.msgid))
			?.id.toString();
	} else if (args.length === 2) {
		messageId = args[0]?.match(/^(?:msg-)?(\d+)$/)?.[1];
		emoji = args[1];
	}

	if (!messageId || !emoji) {
		chan.pushMessage(
			this,
			new Msg({
				type: MessageType.ERROR,
				text: usageText,
			})
		);

		return true;
	}

	const result = this.react({
		target: chan.id,
		msgId: Number.parseInt(messageId, 10),
		emoji,
	});

	if (result === "message_not_found") {
		chan.pushMessage(
			this,
			new Msg({
				type: MessageType.ERROR,
				text: `Could not find message ${messageId} in this channel.`,
			})
		);
	} else if (result === "already_reacted") {
		chan.pushMessage(
			this,
			new Msg({
				type: MessageType.ERROR,
				text: `You have already reacted to message ${messageId} with ${emoji}.`,
			})
		);
	} else if (result === "unsupported") {
		chan.pushMessage(
			this,
			new Msg({
				type: MessageType.ERROR,
				text: "This message can not be reacted to right now.",
			})
		);
	}

	return true;
};

export default {
	commands,
	input,
};
