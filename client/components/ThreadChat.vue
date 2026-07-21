<template>
	<div id="chat-container" class="window thread-window" :data-current-channel="channel.name">
		<div id="chat">
			<div
				:id="`thread-${channel.id}-${thread.rootMsgid}`"
				class="chat-view thread-view"
				data-type="thread"
				:aria-label="`Thread in ${channel.name}`"
				:aria-busy="thread.loading"
				role="tabpanel"
			>
				<div class="header thread-header">
					<SidebarToggle />
					<button
						type="button"
						class="thread-back"
						:aria-label="`Back to ${channel.name}`"
						@click="switchToChannel(channel)"
					>
						<span class="thread-back-icon" aria-hidden="true"></span>
						<span class="thread-back-channel">{{ channel.name }}</span>
					</button>
					<div class="thread-heading" role="heading" aria-level="1">
						<span class="thread-title">Thread</span>
						<span v-if="rootPreview" class="thread-root-preview" :title="rootPreview">
							{{ rootPreview }}
						</span>
					</div>
					<span
						v-if="!thread.loading && !thread.error"
						class="rt-tooltip tooltipped tooltipped-w"
						aria-label="Toggle participant list"
					>
						<button
							class="rt"
							aria-label="Toggle participant list"
							:aria-controls="participantListId"
							:aria-expanded="store.state.userlistOpen"
							@click="store.commit('toggleUserlist')"
						/>
					</span>
				</div>
				<div class="chat-content thread-content">
					<ChatUserList
						v-if="!thread.loading && !thread.error"
						:id="participantListId"
						class="thread-participant-list"
						:channel="viewChannel"
						:list-label="`Participants in thread in ${channel.name}`"
						item-label="participant"
					/>
					<div
						v-if="thread.loading && thread.messages.length === 0"
						class="thread-state"
						role="status"
						aria-live="polite"
					>
						Loading thread…
					</div>
					<div v-else-if="thread.error" class="thread-state thread-error" role="alert">
						This thread is no longer available in channel history.
					</div>
					<div
						v-else-if="thread.messages.length === 0"
						class="thread-state"
						role="status"
					>
						This thread has no messages.
					</div>
					<MessageList v-else :network="network" :channel="viewChannel" />
				</div>
			</div>
		</div>
		<ChatInput
			v-if="
				!thread.loading &&
				!thread.error &&
				thread.messages.length > 0 &&
				network.status.connected &&
				network.supportsReplies
			"
			:network="network"
			:channel="viewChannel"
			:conversation="conversation"
			:typing-text="typingText"
			@message-submitted="addPendingReply"
		/>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, PropType, reactive, watch} from "vue";

import {cleanIrcMessage} from "../../shared/irc";
import {appendPendingThreadReply, getThreadParticipants} from "../js/threads";
import type {ClientChan, ClientNetwork, ClientThread, ConversationContext} from "../js/types";
import {switchToChannel} from "../js/router";
import {useStore} from "../js/store";
import {formatTypingText} from "../js/helpers/typing";
import ChatInput from "./ChatInput.vue";
import ChatUserList from "./ChatUserList.vue";
import MessageList from "./MessageList.vue";
import SidebarToggle from "./SidebarToggle.vue";

export default defineComponent({
	name: "ThreadChat",
	components: {ChatInput, ChatUserList, MessageList, SidebarToggle},
	props: {
		network: {type: Object as PropType<ClientNetwork>, required: true},
		channel: {type: Object as PropType<ClientChan>, required: true},
		thread: {type: Object as PropType<ClientThread>, required: true},
	},
	setup(props) {
		const store = useStore();
		const threadState = computed(() => props.channel.threadStates?.[props.thread.rootMsgid]);
		const participantUsers = computed(() =>
			getThreadParticipants(props.thread.messages, props.channel.users)
		);
		const viewChannel = reactive({
			...props.channel,
			messages: props.thread.messages,
			pendingMessage: "",
			inputHistoryPosition: 0,
			threads: undefined,
			moreHistoryAvailable: false,
			historyLoading: false,
			scrolledToBottom: true,
			firstUnread: threadState.value?.firstUnread ?? props.thread.messages[0]?.id ?? 0,
			unread: threadState.value?.unread ?? 0,
			highlight: threadState.value?.highlight ?? 0,
			users: participantUsers.value,
		}) as ClientChan;

		watch(
			[() => props.thread.messages, participantUsers],
			([messages, users]) => {
				viewChannel.messages = messages;
				viewChannel.users = users;
			},
			{immediate: true}
		);
		watch(
			threadState,
			(state) => {
				if (state) {
					viewChannel.firstUnread = state.firstUnread;
					viewChannel.unread = state.unread;
					viewChannel.highlight = state.highlight;
				}
			},
			{immediate: true}
		);

		const rootMessage = computed(() => props.thread.messages[0]);
		const conversation = computed<ConversationContext>(() => ({
			type: "thread",
			rootMsgid: props.thread.rootMsgid,
		}));
		const typingText = computed(() =>
			formatTypingText(props.channel.threadTyping[props.thread.rootMsgid] || [])
		);
		const participantListId = computed(
			() => `thread-participants-${props.channel.id}-${props.thread.rootMsgid}`
		);

		const addPendingReply = ({text}: {replyTo: string; text: string}) => {
			appendPendingThreadReply(props.thread, props.network.nick, text);
		};

		const rootPreview = computed(() => {
			const root = rootMessage.value;

			if (!root) {
				return "";
			}

			const nick = root.from?.nick ? `${root.from.nick}: ` : "";
			return `${nick}${cleanIrcMessage(root.text || "")}`;
		});

		return {
			addPendingReply,
			conversation,
			participantListId,
			rootPreview,
			store,
			switchToChannel,
			typingText,
			viewChannel,
		};
	},
});
</script>
