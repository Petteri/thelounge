export type TypingStatus = "active" | "paused" | "done";

export const typingThrottle = 3000;

export function shouldEmitTyping(
	currentStatus: TypingStatus,
	nextStatus: TypingStatus,
	elapsed: number,
	force = false
) {
	if (force) {
		return true;
	}

	if (currentStatus === nextStatus && nextStatus !== "active") {
		return false;
	}

	return elapsed >= typingThrottle;
}

export function formatTypingText(nicks: readonly string[]) {
	if (nicks.length === 0) {
		return "";
	}

	if (nicks.length === 1) {
		return `${nicks[0]} is typing...`;
	}

	if (nicks.length === 2) {
		return `${nicks[0]} and ${nicks[1]} are typing...`;
	}

	return `${nicks[0]}, ${nicks[1]}, and ${nicks.length - 2} others are typing...`;
}
