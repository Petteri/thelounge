<template>
	<ThreadChat
		v-if="activeChannel && thread"
		:key="`${channelId}:${rootMsgid}`"
		:network="activeChannel.network"
		:channel="activeChannel.channel"
		:thread="thread"
	/>
</template>

<script lang="ts">
import {computed, defineComponent, onBeforeUnmount, watch} from "vue";
import {useRoute} from "vue-router";

import socket from "../js/socket";
import {useStore} from "../js/store";
import {createThreadCacheEntry, getLastMessageId, threadKey} from "../js/threads";
import ThreadChat from "./ThreadChat.vue";

export default defineComponent({
	name: "RoutedThread",
	components: {ThreadChat},
	setup() {
		const route = useRoute();
		const store = useStore();

		const channelId = computed(() => Number(route.params.id));
		const rootMsgid = computed(() => String(route.params.rootMsgid || ""));
		const activeChannel = computed(() => store.getters.findChannel(channelId.value));
		const cacheKey = computed(() => threadKey(channelId.value, rootMsgid.value));
		const thread = computed(() => store.state.threadCache[cacheKey.value]);

		const openThread = () => {
			if (!activeChannel.value || !rootMsgid.value) {
				return;
			}

			store.commit("activeChannel", activeChannel.value);
			store.commit("activeThread", {
				channelId: channelId.value,
				rootMsgid: rootMsgid.value,
			});

			if (activeChannel.value.channel.usersOutdated) {
				activeChannel.value.channel.usersOutdated = false;
				socket.emit("names", {target: channelId.value});
			}

			const state = activeChannel.value.channel.threadStates?.[rootMsgid.value];

			if (state) {
				state.unread = 0;
				state.highlight = 0;
			}

			socket.emit("thread:open", {
				target: channelId.value,
				rootMsgid: rootMsgid.value,
			});

			const cached = thread.value;
			const entry =
				cached || createThreadCacheEntry(activeChannel.value.channel, rootMsgid.value);

			store.commit("threadCache", {
				key: cacheKey.value,
				thread: {
					...entry,
					loading: true,
					requestLastId: getLastMessageId(activeChannel.value.channel.messages),
					error: undefined,
				},
			});

			socket.emit("thread:get", {
				target: channelId.value,
				rootMsgid: rootMsgid.value,
			});
		};

		watch([channelId, rootMsgid, activeChannel], openThread, {immediate: true});

		onBeforeUnmount(() => {
			if (
				store.state.activeThread?.channelId === channelId.value &&
				store.state.activeThread.rootMsgid === rootMsgid.value
			) {
				store.commit("activeThread", undefined);
			}

			if (route.name !== "RoutedChat" && route.name !== "Thread") {
				socket.emit("open", null);
			}
		});

		return {
			activeChannel,
			channelId,
			rootMsgid,
			thread,
		};
	},
});
</script>
