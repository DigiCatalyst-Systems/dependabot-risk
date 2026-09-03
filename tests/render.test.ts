import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	COMMENT_MARKER,
	renderComment,
	highestLevel,
	capForComment,
	MAX_COMMENT_CHARS,
	SUMMARY_HEADING,
	type Analyzed,
} from "../src/render.ts";

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

describe("breaking changes grouped by release tag", () => {
	// The analyzer prefixes each entry with the tag it came from. Repeating that
	// tag on every line puts 18 characters of noise before any information.
	const zod = {
		package: "zod",
		fromVersion: "4.3.6",
		toVersion: "4.5.2",
		semverClass: "minor" as const,
		recommendationLevel: "caution" as const,
		securityFixes: [],
		breakingChanges: [
			"v4.5.0: `z.iso.datetime()` requires seconds",
			"v4.5.0: String length counts code points",
			"v4.4.0: Stricter string formats",
		],
	};

	it("prints each tag once as a subheading", () => {
		const out = renderComment([zod]);
		assert.equal(out.match(/v4\.5\.0/g)?.length, 1, out);
		assert.match(out, /`v4\.5\.0`\n- `z\.iso\.datetime\(\)` requires seconds\n- String length counts code points/);
		assert.match(out, /`v4\.4\.0`\n- Stricter string formats/);
	});

	it("does not repeat the tag inside the bullets", () => {
		const out = renderComment([zod]);
		assert.ok(!/- v4\.5\.0:/.test(out), out);
	});

	it("still counts every change", () => {
		assert.match(renderComment([zod]), /3 things change/);
	});

	it("renders an entry with no tag prefix as a plain bullet", () => {
		const out = renderComment([{ ...zod, breakingChanges: ["Something broke"] }]);
		assert.match(out, /- Something broke/);
	});
});

describe("grouped view truncation", () => {
	const many = (n: number) =>
		Array.from({ length: n }, (_, i) => `v2.0.0: breaking change number ${i + 1}`);

	const pkgs = [
		{
			package: "zod",
			fromVersion: "4.3.6",
			toVersion: "4.5.2",
			semverClass: "minor" as const,
			recommendationLevel: "caution" as const,
			securityFixes: [],
			breakingChanges: many(5),
		},
		{
			package: "left-pad",
			fromVersion: "1.0.0",
			toVersion: "1.0.1",
			semverClass: "patch" as const,
			recommendationLevel: "safe" as const,
			securityFixes: [],
			breakingChanges: [],
		},
	];

	// Claiming five and listing three, with nothing to say the rest exist, is the
	// same silent withholding the analyzer was just fixed for.
	it("says how many changes it did not list", () => {
		const out = renderComment(pkgs);
		assert.match(out, /5 breaking changes/);
		assert.match(out, /and 2 more/);
	});

	it("says nothing extra when everything fits", () => {
		const out = renderComment([{ ...pkgs[0]!, breakingChanges: many(2) }, pkgs[1]!]);
		assert.ok(!/and \d+ more/.test(out.split("Merge first")[0] ?? out), out);
	});
});

describe("whitespace", () => {
	it("leaves exactly one blank line before the footer", () => {
		const out = renderComment([
			{
				package: "zod",
				fromVersion: "4.3.6",
				toVersion: "4.5.2",
				semverClass: "minor" as const,
				recommendationLevel: "caution" as const,
				securityFixes: [],
				breakingChanges: ["v4.5.0: it broke"],
			},
			{
				package: "express",
				fromVersion: "4.18.2",
				toVersion: "5.0.0",
				semverClass: "major" as const,
				recommendationLevel: "caution" as const,
				securityFixes: [],
				breakingChanges: ["v5.0.0: also broke"],
			},
		]);
		assert.ok(!/\n\n\n/.test(out), JSON.stringify(out.slice(-200)));
	});
});

describe("hidden changes stay reachable", () => {
	const many = (n: number) =>
		Array.from({ length: n }, (_, i) => `v2.0.0: breaking change number ${i + 1}`);
	const pkgs = (n: number) => [
		{
			package: "zod",
			fromVersion: "4.3.6",
			toVersion: "4.5.2",
			semverClass: "minor" as const,
			recommendationLevel: "caution" as const,
			securityFixes: [],
			breakingChanges: many(n),
		},
		{
			package: "express",
			fromVersion: "4.18.2",
			toVersion: "5.0.0",
			semverClass: "major" as const,
			recommendationLevel: "caution" as const,
			securityFixes: [],
			breakingChanges: ["v5.0.0: also broke"],
		},
	];

	// "…and 3 more" with nowhere to see them is a tease. The job summary is the
	// same string, so there was no second surface carrying the rest either.
	it("puts the remainder in a details expander", () => {
		const out = renderComment(pkgs(6));
		assert.match(out, /<details><summary>…and 3 more<\/summary>/);
		assert.match(out, /breaking change number 6/);
	});

	it("leaves a blank line after summary so the markdown inside renders", () => {
		const out = renderComment(pkgs(6));
		assert.match(out, /<summary>…and 3 more<\/summary>\n\n/);
	});

	it("closes the expander", () => {
		const out = renderComment(pkgs(6));
		assert.equal((out.match(/<details>/g) ?? []).length, (out.match(/<\/details>/g) ?? []).length);
	});

	it("adds no expander when everything already fits", () => {
		const out = renderComment(pkgs(3));
		assert.ok(!/<details>/.test(out), out);
		assert.match(out, /breaking change number 3/);
	});

	it("never drops a change", () => {
		const out = renderComment(pkgs(9));
		for (let i = 1; i <= 9; i++) {
			assert.match(out, new RegExp(`breaking change number ${i}\\b`), `missing change ${i}`);
		}
	});
});

describe("attribution", () => {
	const one = [
		{
			package: "zod",
			fromVersion: "4.3.6",
			toVersion: "4.5.2",
			semverClass: "patch" as const,
			recommendationLevel: "safe" as const,
			securityFixes: [],
			breakingChanges: [],
		},
	];

	it("names the action and links the marketplace listing", () => {
		const out = renderComment(one);
		assert.match(out, /\[Dependabot Risk Report\]\(https:\/\/github\.com\/marketplace\/actions\/dependabot-risk-report\)/);
		assert.match(out, /DigiCatalyst Systems/);
	});

	it("spells the engine out rather than abbreviating it", () => {
		const out = renderComment(one);
		assert.match(out, /dep-diff-mcp/);
	});

	it("offers a heading for the job summary only", () => {
		assert.match(SUMMARY_HEADING, /^## /);
		assert.match(SUMMARY_HEADING, /Dependabot Risk Report/);
		// The comment must still lead with the verdict, not a banner.
		assert.ok(!renderComment(one).startsWith(SUMMARY_HEADING));
	});
});

describe("capForComment", () => {
	it("leaves a normal report untouched", () => {
		const body = "### all clear\n\nnothing to see";
		assert.equal(capForComment(body), body);
	});

	// GitHub rejects a comment over 65536 characters, and upsertComment turns the
	// failure into a warning -- so an oversized report would vanish silently.
	it("trims an oversized report and says so", () => {
		const body = "x".repeat(MAX_COMMENT_CHARS + 5000);
		const out = capForComment(body);
		assert.ok(out.length <= MAX_COMMENT_CHARS, `still ${out.length}`);
		assert.match(out, /job summary/i);
	});
});
