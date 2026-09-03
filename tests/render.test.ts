import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { COMMENT_MARKER, renderComment, highestLevel, type Analyzed } from "../src/render.ts";

const base = { ecosystem: "npm", repoUrl: null, releaseCount: 0, migrationLinks: [] };

const lodash: Analyzed = {
	...base, package: "lodash", fromVersion: "4.17.20", toVersion: "4.17.21",
	semverClass: "patch", breakingChanges: [],
	securityFixes: [
		{ id: "GHSA-35jh-r3h4-6jhm", summary: "Command Injection in lodash", severity: "HIGH" },
		{ id: "GHSA-29mw-wpgm-hmr9", summary: "Regular Expression Denial of Service (ReDoS) in lodash", severity: "MODERATE" },
	],
	recommendation: "RECOMMENDED: 2 security fix(es).", recommendationLevel: "security",
};

const express: Analyzed = {
	...base, package: "express", fromVersion: "4.18.2", toVersion: "5.0.0",
	semverClass: "major",
	breakingChanges: ["req.param() has been removed", "Node.js 18 or higher is required"],
	securityFixes: [], migrationLinks: ["https://expressjs.com/en/guide/migrating-5.html"],
	recommendation: "REVIEW: 2 breaking change(s).", recommendationLevel: "caution",
};

const esbuild: Analyzed = {
	...base, package: "esbuild", fromVersion: "0.28.1", toVersion: "0.28.2",
	semverClass: "patch", breakingChanges: [], securityFixes: [],
	recommendation: "SAFE: Patch-level change.", recommendationLevel: "safe",
};

const tsx: Analyzed = { ...esbuild, package: "tsx", fromVersion: "4.21.0", toVersion: "4.23.13" };

const failed: Analyzed = {
	package: "left-pad", error: "registry lookup failed", recommendationLevel: "review",
};

describe("renderComment — reassurance path", () => {
	it("always comments, even when nothing is wrong", () => {
		const out = renderComment([esbuild]);
		assert.ok(out.startsWith(COMMENT_MARKER));
		assert.match(out, /Nothing to worry about/i);
	});

	it("names what it checked, so the reader can see the work was done", () => {
		const out = renderComment([esbuild, tsx]);
		assert.match(out, /esbuild/);
		assert.match(out, /tsx/);
	});

	it("says why it is safe in plain words, not by quoting semver", () => {
		const out = renderComment([esbuild]);
		assert.match(out, /no (security )?advisor|no breaking changes/i);
	});
});

describe("renderComment — security path", () => {
	it("leads with the security fix rather than the version numbers", () => {
		const out = renderComment([lodash]);
		const headline = out.split("\n").find((l) => l.startsWith("###")) ?? "";
		assert.match(headline, /security/i);
		assert.ok(!headline.includes("4.17.20"), `headline should not lead with versions: ${headline}`);
	});

	it("flags that a routine-looking patch is hiding the fix", () => {
		assert.match(renderComment([lodash]), /patch/i);
	});

	it("translates severity into urgency a non-expert can act on", () => {
		const out = renderComment([lodash]);
		assert.match(out, /fix soon|urgent/i, "HIGH must map to plain-language urgency");
	});

	it("drops the redundant 'in <package>' from advisory summaries", () => {
		const out = renderComment([lodash]);
		assert.match(out, /Command Injection/);
		assert.ok(!out.includes("Command Injection in lodash"), "package name is already the row label");
	});
});

describe("renderComment — breaking-change path", () => {
	it("lists what actually breaks, not just a count", () => {
		const out = renderComment([express]);
		assert.match(out, /req\.param\(\) has been removed/);
		assert.match(out, /Node\.js 18 or higher is required/);
	});

	it("warns that tests may not catch these", () => {
		assert.match(renderComment([express]), /tests may not catch/i);
	});

	it("surfaces the migration guide as a link", () => {
		assert.match(renderComment([express]), /expressjs\.com\/en\/guide\/migrating-5\.html/);
	});
});

describe("renderComment — grouped PR", () => {
	const group = [esbuild, express, tsx, lodash];

	it("counts how many of the batch actually need attention", () => {
		assert.match(renderComment(group), /2 of 4/);
	});

	it("puts the security item above the breaking-change item", () => {
		const out = renderComment(group);
		assert.ok(out.indexOf("lodash") < out.indexOf("express"));
	});

	it("collapses the routine ones instead of giving each a row", () => {
		const out = renderComment(group);
		const routine = out.slice(out.search(/routine/i));
		assert.match(routine, /esbuild/);
		assert.match(routine, /tsx/);
	});

	it("keeps a failed analysis visible rather than dropping it", () => {
		const out = renderComment([esbuild, failed]);
		assert.match(out, /left-pad/);
		assert.match(out, /registry lookup failed/);
	});
});

describe("highestLevel", () => {
	it("returns the riskiest level present", () => {
		assert.equal(highestLevel([esbuild, lodash]), "security");
	});
	it("returns safe for an empty set", () => {
		assert.equal(highestLevel([]), "safe");
	});
	it("counts a failed analysis as review", () => {
		assert.equal(highestLevel([esbuild, failed]), "review");
	});
});
