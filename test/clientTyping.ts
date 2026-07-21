import {expect} from "chai";

import {formatTypingText, shouldEmitTyping} from "../client/js/helpers/typing";

describe("Client typing notifications", function () {
	it("should format typing placeholders", function () {
		expect(formatTypingText([])).to.equal("");
		expect(formatTypingText(["Alice"])).to.equal("Alice is typing...");
		expect(formatTypingText(["Alice", "Bob"])).to.equal("Alice and Bob are typing...");
		expect(formatTypingText(["Alice", "Bob", "Carol", "Dan"])).to.equal(
			"Alice, Bob, and 2 others are typing..."
		);
	});

	it("should refresh active typing after the throttle", function () {
		expect(shouldEmitTyping("done", "active", 3000)).to.equal(true);
		expect(shouldEmitTyping("active", "active", 2999)).to.equal(false);
		expect(shouldEmitTyping("active", "active", 3000)).to.equal(true);
	});

	it("should suppress duplicate idle states unless forced", function () {
		expect(shouldEmitTyping("paused", "paused", 30000)).to.equal(false);
		expect(shouldEmitTyping("active", "done", 0)).to.equal(false);
		expect(shouldEmitTyping("active", "done", 0, true)).to.equal(true);
	});
});
