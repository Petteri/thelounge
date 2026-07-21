import {expect} from "chai";

import {getReplyTo} from "../../server/plugins/irc-events/tags";

describe("IRCv3 replies", function () {
	it("should normalize +draft/reply", function () {
		expect(getReplyTo({"+draft/reply": "abc"})).to.equal("abc");
	});

	it("should normalize draft/reply", function () {
		expect(getReplyTo({"draft/reply": "abc"})).to.equal("abc");
	});

	it("should normalize +reply", function () {
		expect(getReplyTo({"+reply": "abc"})).to.equal("abc");
	});

	it("should normalize reply", function () {
		expect(getReplyTo({reply: "abc"})).to.equal("abc");
	});

	it("should ignore reply tags on reactions", function () {
		expect(
			getReplyTo({
				"+draft/react": "👍",
				"+draft/reply": "abc",
			})
		).to.be.undefined;
	});
});
