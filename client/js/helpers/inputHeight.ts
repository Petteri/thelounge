export function calculateInputHeight(scrollHeight: number, lineHeight: number) {
	// Browser zoom and display scaling can round scrollHeight a pixel in either direction.
	const lines = Math.max(1, Math.round(scrollHeight / lineHeight));
	return lines * lineHeight;
}
