<template>
	<button
		type="button"
		:class="['message-reply-summary', {unread: Boolean(state?.unread)}]"
		:aria-label="summaryLabel"
		@click="emit('open-thread', summary.rootMsgid)"
	>
		<span class="message-reply-count">{{ replyCount }}</span>
		<span v-if="state?.unread" class="message-reply-unread">{{ state.unread }} unread</span>
		<span v-if="participantText" class="message-reply-participants">{{ participantText }}</span>
		<time class="message-reply-latest" :datetime="latestDateTime" :title="latestTimeLocale">
			latest {{ latestTime }}
		</time>
		<span class="message-reply-open" aria-hidden="true"></span>
	</button>
</template>

<script lang="ts">
import {computed, defineComponent, PropType} from "vue";
import dayjs from "dayjs";

import {ThreadState, ThreadSummary} from "../../shared/types/chan";
import constants from "../js/constants";
import localetime from "../js/helpers/localetime";
import {useStore} from "../js/store";

export default defineComponent({
	name: "MessageReplySummary",
	props: {
		summary: {type: Object as PropType<ThreadSummary>, required: true},
		state: {type: Object as PropType<ThreadState>, required: false},
	},
	emits: ["open-thread"],
	setup(props, {emit}) {
		const store = useStore();

		const timeFormat = computed(() => {
			if (store.state.settings.use12hClock) {
				return store.state.settings.showSeconds
					? constants.timeFormats.msg12hWithSeconds
					: constants.timeFormats.msg12h;
			}

			return store.state.settings.showSeconds
				? constants.timeFormats.msgWithSeconds
				: constants.timeFormats.msgDefault;
		});

		const replyCount = computed(
			() =>
				`${props.summary.replyCount} ${
					props.summary.replyCount === 1 ? "reply" : "replies"
				}`
		);

		const participantText = computed(() => {
			const participants = props.summary.participants;

			if (participants.length <= 2) {
				return participants.join(", ");
			}

			return `${participants.slice(0, 2).join(", ")} +${participants.length - 2}`;
		});

		const latestTime = computed(() =>
			dayjs(props.summary.latestReplyTime).format(timeFormat.value)
		);
		const latestTimeLocale = computed(() => localetime(props.summary.latestReplyTime));
		const latestDateTime = computed(() =>
			new Date(props.summary.latestReplyTime).toISOString()
		);
		const summaryLabel = computed(() => {
			const participants = props.summary.participants.length;
			const unread = props.state?.unread ? `, ${props.state.unread} unread` : "";
			return `Open thread with ${replyCount.value}${unread} and ${participants} ${
				participants === 1 ? "participant" : "participants"
			}`;
		});

		return {
			emit,
			latestDateTime,
			latestTime,
			latestTimeLocale,
			participantText,
			replyCount,
			summaryLabel,
		};
	},
});
</script>
