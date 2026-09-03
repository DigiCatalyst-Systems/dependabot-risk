import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { COMMENT_MARKER, renderComment, highestLevel, type Analyzed } from "../src/render.ts";

const lodash: Analyzed = {
	package: "lodash", ecosystem: "npm", fromVersion: "4.17.20", toVersion: "4.17.21",
	semverClass: "patch", repoUrl: "https://github.com/lodash/lodash", releaseCount: 0,
	breakingChanges: [],
	securityFixes: [
		{ id: "GHSA-35jh-r3h4-6jhm", summary: "Command Injection in lodash", severity: "HIGH" },
	],
	migrationLinks: [], recommendation: "RECOMMENDED: 1 security fix(es) (incl. high/critical).",
	recommendationLevel: "security",
};

const typescript: Analyzed = {
	package: "typescript", ecosystem: "npm", fromVersion: "5.3.3", toVersion: "5.4.5",
	semverClass: "minor", repoUrl: null, releaseCount: 3, breakingChanges: [],
	securityFixes: [], migrationLinks: [],
	recommendation: "LIKELY SAFE: minor version, additive changes per semver.",
	recommendationLevel: "likely-safe",
};

const failed: Analyzed = {
	package: "left-pad", error: "registry lookup failed", recommendationLevel: "review",
};

describe("renderComment", () => {
	it("embeds a stable marker so the comment can be updated in place", () => {
		assert.ok(renderComment([lodash]).startsWith(COMMENT_MARKER));
	});

	it("puts the riskiest package first regardless of input order", () => {
		const out = renderComment([typescript, lodash]);
		assert.ok(
			out.indexOf("lodash") < out.indexOf("typescript"),
			"security-level package must outrank likely-safe"
		);
	});

	it("surfaces the security fix and its severity", () => {
		const out = renderComment([lodash]);
		assert.match(out, /HIGH/);
		assert.match(out, /GHSA-35jh-r3h4-6jhm/);
	});

	it("reports a failed analysis rather than dropping the package", () => {
		const out = renderComment([lodash, failed]);
		assert.match(out, /left-pad/);
		assert.match(out, /registry lookup failed/);
	});

	it("states plainly when nothing needs attention", () => {
		const out = renderComment([typescript]);
		assert.ok(out.includes(COMMENT_MARKER));
		assert.match(out, /typescript/);
	});
});

describe("highestLevel", () => {
	it("returns the riskiest level present", () => {
		assert.equal(highestLevel([typescript, lodash]), "security");
	});

	it("returns safe for an empty set", () => {
		assert.equal(highestLevel([]), "safe");
	});

	it("counts a failed analysis as review", () => {
		assert.equal(highestLevel([typescript, failed]), "review");
	});
});
