import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	COMMENT_MARKER,
	renderComment,
	highestLevel,
	capForComment,
	MAX_COMMENT_CHARS,
	SUMMARY_HEADING,
	LOG_BANNER,
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

	it("gives the routine ones a row rather than a footnote", () => {
		const out = renderComment(group);
		assert.match(out, /\| ✅ \| `esbuild`/);
		assert.match(out, /\| ✅ \| `tsx`/);
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

describe("grouped table", () => {
	const mk = (over: Record<string, unknown>) => ({
		package: "p", fromVersion: "1", toVersion: "2",
		semverClass: "major", recommendationLevel: "caution",
		securityFixes: [], breakingChanges: [], migrationLinks: [],
		...over,
	}) as never;

	const four = [
		mk({
			package: "lodash", fromVersion: "4.17.20", toVersion: "4.17.21",
			recommendationLevel: "security",
			securityFixes: [
				{ id: "GHSA-1", summary: "Command Injection in lodash", severity: "HIGH" },
				{ id: "GHSA-2", summary: "ReDoS in lodash", severity: "MODERATE" },
			],
		}),
		mk({
			package: "actions/setup-node", fromVersion: "4", toVersion: "7",
			breakingChanges: [
				"v7.0.0: Migrate to ESM and upgrade dependencies",
				"v5.0.0: Upgrade action to use node24. Runner must be on version v2.327.1 or later.",
			],
		}),
		mk({ package: "typescript", fromVersion: "6.0.3", toVersion: "7.0.2",
			recommendationLevel: "review", recommendation: "REVIEW: Major version bump." }),
		mk({ package: "esbuild", fromVersion: "0.28.1", toVersion: "0.28.2",
			recommendationLevel: "safe", semverClass: "patch" }),
	];

	it("renders a markdown table with a header", () => {
		const out = renderComment(four);
		assert.match(out, /\|\s*\|\s*Package\s*\|\s*Change\s*\|\s*What to know\s*\|/);
		assert.match(out, /\|---\|/);
	});

	it("marks security, breaking, review and safe distinctly", () => {
		const out = renderComment(four);
		assert.match(out, /\| 🚨 \| `lodash` \| 4\.17\.20 → 4\.17\.21 \|/);
		assert.match(out, /\| 🚫 \| `actions\/setup-node` \| 4 → 7 \|/);
		assert.match(out, /\| ⚠️ \| `typescript` \|/);
		assert.match(out, /\| ✅ \| `esbuild` \|/);
	});

	it("gives every package a row, routine ones included", () => {
		const out = renderComment(four);
		for (const p of ["lodash", "actions/setup-node", "typescript", "esbuild"]) {
			assert.match(out, new RegExp(`\\| \`${p.replace("/", "\\/")}\``), `no row for ${p}`);
		}
	});

	it("puts the worst advisory and the remaining count in What to know", () => {
		const out = renderComment(four);
		assert.match(out, /Command Injection.*fix soon.*1 more/);
	});

	// A bare count says how much to read, not what it is. The requirement change
	// is the part that decides whether a workflow survives the merge.
	it("names the most consequential change beside the count", () => {
		const out = renderComment(four);
		assert.match(out, /2 breaking changes.*node24/);
	});

	it("says plainly when nothing was found", () => {
		assert.match(renderComment(four), /\| ✅ \| `esbuild` \| 0\.28\.1 → 0\.28\.2 \| nothing found \|/);
	});

	it("escapes a pipe so it cannot break the table", () => {
		const out = renderComment([
			four[0]!,
			mk({ package: "weird", breakingChanges: ["v2.0.0: a | b was removed"] }),
		]);
		assert.ok(!/\| a \| b was removed/.test(out), "unescaped pipe leaked into a cell");
	});

	it("puts the full change list in a details block under the table", () => {
		const out = renderComment(four);
		assert.match(out, /<details><summary>.*actions\/setup-node.*<\/summary>/);
		assert.match(out, /`v7\.0\.0`\n- Migrate to ESM and upgrade dependencies/);
		assert.match(out, /`v5\.0\.0`\n- Upgrade action to use node24/);
	});

	it("no longer marks individual change lines", () => {
		const out = renderComment(four);
		assert.ok(!/- (🔴|🟠|🟡) v\d/.test(out), out);
	});
});

describe("per-package details block", () => {
	const withChanges = (n: number) => [
		{
			package: "zod", fromVersion: "4.3.6", toVersion: "4.5.2",
			semverClass: "minor" as const, recommendationLevel: "caution" as const,
			securityFixes: [], migrationLinks: [],
			breakingChanges: Array.from({ length: n }, (_, i) => `v2.0.0: change number ${i + 1}`),
		},
		{
			package: "esbuild", fromVersion: "0.28.1", toVersion: "0.28.2",
			semverClass: "patch" as const, recommendationLevel: "safe" as const,
			securityFixes: [], migrationLinks: [], breakingChanges: [],
		},
	];

	// The table carries the verdict; the details block carries everything, so
	// nothing is capped and nothing is hidden behind a count.
	it("lists every change, however many", () => {
		const out = renderComment(withChanges(12));
		for (let i = 1; i <= 12; i++) {
			assert.match(out, new RegExp(`change number ${i}\\b`), `missing change ${i}`);
		}
	});

	it("leaves a blank line after summary so the markdown inside renders", () => {
		assert.match(renderComment(withChanges(4)), /<\/summary>\n\n/);
	});

	it("closes every expander it opens", () => {
		const out = renderComment(withChanges(4));
		assert.equal((out.match(/<details>/g) ?? []).length, (out.match(/<\/details>/g) ?? []).length);
	});

	it("adds no block for a package with nothing to expand", () => {
		const out = renderComment(withChanges(4));
		assert.ok(!/<b>esbuild<\/b>/.test(out), out);
	});
});

describe("dependency scope", () => {
	it("tags a dev dependency after its name in the grouped table", () => {
		const devEsbuild: Analyzed = { ...esbuild, scope: "dev" };
		const out = renderComment([lodash, devEsbuild, tsx]);
		assert.match(out, /`esbuild` 🔧dev/);
	});

	it("leaves a runtime dependency unmarked, because runtime is the default", () => {
		const out = renderComment([lodash, { ...esbuild, scope: "runtime" }, tsx]);
		assert.match(out, /`esbuild` \|/);
		assert.doesNotMatch(out, /🔧|⚙️|📦/);
	});

	it("tags a github-actions bump as ci", () => {
		const checkout: Analyzed = {
			...esbuild, package: "actions/checkout", fromVersion: "4", toVersion: "7", scope: "ci",
		};
		const out = renderComment([lodash, checkout, tsx]);
		assert.match(out, /`actions\/checkout` ⚙️ci/);
	});

	it("tags an indirect dependency", () => {
		const out = renderComment([lodash, { ...esbuild, scope: "indirect" }, tsx]);
		assert.match(out, /`esbuild` 📦indirect/);
	});

	it("says what a dev scope means beneath a single security finding", () => {
		const out = renderComment([{ ...lodash, scope: "dev" }]);
		assert.match(out, /build tooling/i);
		assert.match(out, /run in CI with access to your tokens/i);
	});

	it("adds no scope note for a runtime security finding", () => {
		const out = renderComment([{ ...lodash, scope: "runtime" }]);
		assert.doesNotMatch(out, /build tooling/i);
	});

	// The guard on the whole feature: scope annotates, it never downranks.
	it("still reports security for an advisory in a dev dependency", () => {
		const devLodash: Analyzed = { ...lodash, scope: "dev" };
		assert.equal(highestLevel([devLodash, esbuild]), "security");
		assert.match(renderComment([devLodash, esbuild, tsx]), /🚨/);
	});
});
