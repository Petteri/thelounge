import {expect} from "chai";
import User from "../../server/models/user";

describe("User", function () {
	describe("#toJSON()", function () {
		it("should include away status", function () {
			const user = new User({
				away: "brb",
				lastMessage: 123,
				nick: "alice",
			});

			expect(user.toJSON()).to.deep.equal({
				away: "brb",
				lastMessage: 123,
				modes: [],
				nick: "alice",
			});
		});
	});
});
