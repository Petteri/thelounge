<template>
	<div
		v-if="canReact"
		class="message-reaction-picker"
		@click.stop
	>
		<button
			class="message-react-trigger"
			type="button"
			aria-label="Add reaction"
			:title="'Add reaction'"
			@click.stop="togglePicker"
		>
			<span class="message-react-trigger-emoji">😀</span>
			<span class="message-react-trigger-plus">+</span>
		</button>
		<div v-if="isOpen" class="message-react-menu">
			<button
				v-for="emoji in emojis"
				:key="emoji"
				type="button"
				class="message-react-option"
				:title="emoji"
				:disabled="hasReaction(emoji)"
				@click.stop="react(emoji)"
			>
				{{ emoji }}
			</button>
		</div>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, onMounted, onUnmounted, PropType, ref} from "vue";
import socket from "../js/socket";
import type {ClientChan, ClientMessage, ClientNetwork} from "../js/types";
import {ChanType} from "../../shared/types/chan";

const emojis = [
	"👍",
	"❤️",
	"😂",
	"🎉",
	"😁",
	"🥳",
	"🙃",
	"🔥",
	"👏",
	"🙌",
	"😍",
	"🤔",
	"😮",
	"😢",
	"👀",
	"✅",
	"🙏",
	"💯",
	"👎",
	"🤣",
	"😊",
	"🤩",
	"😎",
	"😉",
	"😭",
	"😅",
	"🤯",
	"😴",
	"🤝",
	"👌",
	"💪",
	"🚀",
	"⭐",
	"💜",
	"🫡",
];

export default defineComponent({
	name: "MessageReactionPicker",
	props: {
		message: {type: Object as PropType<ClientMessage>, required: true},
		channel: {type: Object as PropType<ClientChan>, required: false},
		network: {type: Object as PropType<ClientNetwork>, required: true},
	},
	setup(props) {
		const isOpen = ref(false);

		const canReact = computed(
			() =>
				Boolean(props.channel) &&
				Boolean(props.message.msgid) &&
				Boolean(socket.connected) &&
				[ChanType.CHANNEL, ChanType.QUERY].includes(props.channel!.type) &&
				(props.message.type === "message" || props.message.type === "action")
		);

		const hasReaction = (emoji: string) =>
			Boolean(
				props.message.reactions?.some(
					(reaction) =>
						reaction.name === emoji && reaction.users.includes(props.network.nick)
				)
			);

		const closePicker = () => {
			isOpen.value = false;
		};

		const togglePicker = () => {
			if (!canReact.value) {
				return;
			}

			isOpen.value = !isOpen.value;
		};

		const react = (emoji: string) => {
			if (!props.channel || hasReaction(emoji)) {
				closePicker();
				return;
			}

			socket.emit("msg:react", {
				target: props.channel.id,
				msgId: props.message.id,
				emoji,
			});
			closePicker();
		};

		const onPointerDown = (event: Event) => {
			if (!(event.target instanceof Element)) {
				return;
			}

			if (!event.target.closest(".message-reaction-picker")) {
				closePicker();
			}
		};

		onMounted(() => {
			document.addEventListener("pointerdown", onPointerDown);
		});

		onUnmounted(() => {
			document.removeEventListener("pointerdown", onPointerDown);
		});

		return {
			canReact,
			emojis,
			hasReaction,
			isOpen,
			react,
			togglePicker,
		};
	},
});
</script>
