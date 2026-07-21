<template>
	<div
		:id="threadNavigationElementId(target)"
		:class="{
			active,
			'has-unread': target.unread,
			'has-highlight': target.highlight,
			'is-muted': target.channel.muted,
		}"
		:aria-controls="`#thread-${target.channel.id}-${target.rootMsgid}`"
		:aria-label="ariaLabel"
		:aria-selected="active"
		:title="ariaLabel"
		:data-name="target.label"
		:data-thread-root="target.rootMsgid"
		class="channel-list-item thread-channel"
		data-type="thread"
		role="tab"
		@click="click"
	>
		<span class="name">{{ displayName }}</span>
		<span
			v-if="target.unread"
			:class="{highlight: target.highlight && !target.channel.muted}"
			class="badge"
			>{{ unreadCount }}</span
		>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, PropType} from "vue";

import roundBadgeNumber from "../js/helpers/roundBadgeNumber";
import {
	threadNavigationElementId,
	type ThreadNavigationTarget,
} from "../js/helpers/threadNavigation";
import {switchToThread} from "../js/router";

export default defineComponent({
	name: "ThreadChannel",
	props: {
		target: {
			type: Object as PropType<ThreadNavigationTarget>,
			required: true,
		},
		active: Boolean,
		isFiltering: Boolean,
	},
	setup(props) {
		const displayName = computed(() =>
			props.isFiltering
				? `${props.target.channel.name} · ${props.target.label}`
				: props.target.label
		);
		const unreadCount = computed(() => roundBadgeNumber(props.target.unread));
		const ariaLabel = computed(() => {
			const extra: string[] = [];

			if (props.target.unread > 0) {
				extra.push(
					`${props.target.unread} unread ${
						props.target.unread === 1 ? "message" : "messages"
					}`
				);
			}

			if (props.target.highlight > 0) {
				extra.push(
					`${props.target.highlight} ${
						props.target.highlight === 1 ? "mention" : "mentions"
					}`
				);
			}

			return `Thread in ${props.target.channel.name}: ${props.target.label}${
				extra.length ? ` (${extra.join(", ")})` : ""
			}`;
		});

		const click = () => {
			if (!props.isFiltering) {
				switchToThread(props.target.channel, props.target.rootMsgid);
			}
		};

		return {
			ariaLabel,
			click,
			displayName,
			threadNavigationElementId,
			unreadCount,
		};
	},
});
</script>
