import {expect} from "chai";

import {calculateInputHeight} from "../client/js/helpers/inputHeight";

describe("Client input height", function () {
	it("should ignore sub-line browser rounding", function () {
		expect(calculateInputHeight(19, 19)).to.equal(19);
		expect(calculateInputHeight(20, 19)).to.equal(19);
	});

	it("should preserve complete wrapped lines", function () {
		expect(calculateInputHeight(37, 19)).to.equal(38);
		expect(calculateInputHeight(38, 19)).to.equal(38);
		expect(calculateInputHeight(39, 19)).to.equal(38);
	});
});
