import constants from "./constants";

import {createRouter, createWebHashHistory} from "vue-router";
import SignIn from "../components/Windows/SignIn.vue";
import Connect from "../components/Windows/Connect.vue";
import Settings from "../components/Windows/Settings.vue";
import Help from "../components/Windows/Help.vue";
import Changelog from "../components/Windows/Changelog.vue";
import NetworkEdit from "../components/Windows/NetworkEdit.vue";
import SearchResults from "../components/Windows/SearchResults.vue";
import RoutedChat from "../components/RoutedChat.vue";
import RoutedThread from "../components/RoutedThread.vue";
import {store} from "./store";

import AppearanceSettings from "../components/Settings/Appearance.vue";
import GeneralSettings from "../components/Settings/General.vue";
import AccountSettings from "../components/Settings/Account.vue";
import NotificationSettings from "../components/Settings/Notifications.vue";
import {ClientChan} from "./types";

const router = createRouter({
	history: createWebHashHistory(),
	routes: [
		{
			name: "SignIn",
			path: "/sign-in",
			component: SignIn,
			beforeEnter(to, from, next) {
				// Prevent navigating to sign-in when already signed in
				if (store.state.appLoaded) {
					next(false);
					return;
				}

				next();
			},
		},
		{
			name: "Connect",
			path: "/connect",
			component: Connect,
			props: (route) => ({queryParams: route.query}),
		},
		{
			path: "/settings",
			component: Settings,
			children: [
				{
					name: "General",
					path: "",
					component: GeneralSettings,
				},
				{
					name: "Appearance",
					path: "appearance",
					component: AppearanceSettings,
				},
				{
					name: "Account",
					path: "account",
					component: AccountSettings,
					props: true,
				},
				{
					name: "Notifications",
					path: "notifications",
					component: NotificationSettings,
				},
			],
		},
		{
			name: "Help",
			path: "/help",
			component: Help,
		},
		{
			name: "Changelog",
			path: "/changelog",
			component: Changelog,
		},
		{
			name: "NetworkEdit",
			path: "/edit-network/:uuid",
			component: NetworkEdit,
		},
		{
			name: "RoutedChat",
			path: "/chan-:id",
			component: RoutedChat,
		},
		{
			name: "Thread",
			path: "/chan-:id/thread/:rootMsgid",
			component: RoutedThread,
		},
		{
			name: "SearchResults",
			path: "/chan-:id/search",
			component: SearchResults,
		},
	],
});

router.beforeEach((to, from, next) => {
	// If user is not yet signed in, wait for appLoaded state to change
	// unless they are trying to open SignIn (which can be triggered in auth.js)
	if (!store.state.appLoaded && to.name !== "SignIn") {
		store.watch(
			(state) => state.appLoaded,
			() => next()
		);

		return;
	}

	next();
});

router.beforeEach((to, from) => {
	// Disallow navigating to non-existing routes
	if (!to.matched.length) {
		return false;
	}

	// Disallow navigating to invalid channels
	if (
		(to.name === "RoutedChat" || to.name === "Thread") &&
		!store.getters.findChannel(Number(to.params.id))
	) {
		return false;
	}

	// Disallow navigating to invalid networks
	if (to.name === "NetworkEdit" && !store.getters.findNetwork(String(to.params.uuid))) {
		return false;
	}

	return true;
});

router.afterEach((to) => {
	if (store.state.appLoaded) {
		if (window.innerWidth <= constants.mobileViewportPixels) {
			store.commit("sidebarOpen", false);
		}
	}

	const isConversationRoute = to.name === "RoutedChat" || to.name === "Thread";
	const destinationChannelId = isConversationRoute ? Number(to.params.id) : undefined;

	if (store.state.activeChannel) {
		const channel = store.state.activeChannel.channel;
		const isLeavingChannel = destinationChannelId !== channel.id;

		if (!isConversationRoute) {
			store.commit("activeChannel", undefined);
		}

		// Moving between a channel and one of its threads keeps both contexts intact.
		if (isLeavingChannel && channel.messages?.length > 0) {
			channel.firstUnread = channel.messages[channel.messages.length - 1].id;
		}

		if (isLeavingChannel && channel.messages?.length > 100) {
			channel.messages.splice(0, channel.messages.length - 100);
			channel.moreHistoryAvailable = true;
		}
	}

	if (to.name !== "Thread") {
		store.commit("activeThread", undefined);
	}
});

async function navigate(routeName: string, params: any = {}) {
	if (router.currentRoute.value.name) {
		await router.push({name: routeName, params});
	} else {
		// If current route is null, replace the history entry
		// This prevents invalid entries from lingering in history,
		// and then the route guard preventing proper navigation
		await router.replace({name: routeName, params}).catch(() => {});
	}
}

function switchToChannel(channel: ClientChan) {
	void navigate("RoutedChat", {id: channel.id});
}

function switchToThread(channel: ClientChan, rootMsgid: string) {
	void navigate("Thread", {id: channel.id, rootMsgid});
}

if ("serviceWorker" in navigator) {
	navigator.serviceWorker.addEventListener("message", (event) => {
		if (event.data && event.data.type === "open") {
			const id = Number(event.data.chanId || event.data.channel?.substring(5));

			const channelTarget = store.getters.findChannel(id);

			if (channelTarget) {
				if (event.data.rootMsgid) {
					switchToThread(channelTarget.channel, event.data.rootMsgid);
				} else {
					switchToChannel(channelTarget.channel);
				}
			}
		}
	});
}

export {router, navigate, switchToChannel, switchToThread};
