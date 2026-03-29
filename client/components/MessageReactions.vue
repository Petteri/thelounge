<template>
	<div v-if="message.reactions?.length" class="message-reactions">
		<span
			v-for="reaction in message.reactions"
			:key="reaction.name"
			:class="['message-reaction', {self: reaction.users.includes(network.nick)}]"
			:title="reaction.users.join(', ')"
		>
			<span class="message-reaction-name">{{ reaction.name || "(empty)" }}</span>
			<span class="message-reaction-count">{{ reaction.users.length }}</span>
		</span>
	</div>
</template>

<script lang="ts">
import {defineComponent, PropType} from "vue";
import type {ClientMessage, ClientNetwork} from "../js/types";

export default defineComponent({
	name: "MessageReactions",
	props: {
		message: {type: Object as PropType<ClientMessage>, required: true},
		network: {type: Object as PropType<ClientNetwork>, required: true},
	},
});
</script>
