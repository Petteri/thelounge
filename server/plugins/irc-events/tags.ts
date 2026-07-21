export type MessageTags = {[key: string]: string} | undefined;

export function getMessageTag(tags: MessageTags, name: string) {
	return tags?.[`+${name}`] || tags?.[name];
}

export function getRawReplyTo(tags: MessageTags) {
	return getMessageTag(tags, "draft/reply") || getMessageTag(tags, "reply");
}

export function getReplyTo(tags: MessageTags) {
	if (
		typeof getMessageTag(tags, "draft/react") !== "undefined" ||
		typeof getMessageTag(tags, "react") !== "undefined"
	) {
		return undefined;
	}

	return getRawReplyTo(tags);
}
