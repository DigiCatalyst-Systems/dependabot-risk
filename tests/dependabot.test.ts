import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseDependabotPr, isDependencyBot } from "../src/dependabot.ts";

// Fixtures below are real Dependabot output from this repository's own PRs,
// trimmed to the lines the parser reads.

describe("parseDependabotPr", () => {
	it("parses a single bump from the title alone", () => {
		const out = parseDependabotPr("chore(deps): bump lru-cache from 11.3.5 to 11.5.2");
		assert.deepEqual(out, [{ name: "lru-cache", fromVersion: "11.3.5", toVersion: "11.5.2" }]);
	});

	it("parses the linked Bumps line in the body (PR #30)", () => {
		const out = parseDependabotPr(
			"chore(deps): bump zod from 4.3.6 to 4.5.2",
			"Bumps [zod](https://github.com/colinhacks/zod) from 4.3.6 to 4.5.2.\n<details>"
		);
		assert.deepEqual(out, [{ name: "zod", fromVersion: "4.3.6", toVersion: "4.5.2" }]);
	});

	it("parses every entry of a grouped PR body (PR #28)", () => {
		const body = [
			"Bumps the dev-dependencies group with 4 updates: [@types/node](https://x), [@types/semver](https://y), [esbuild](https://z) and [typescript](https://w).",
			"",
			"Updates `@types/node` from 25.6.0 to 26.4.0",
			"<details><summary>Commits</summary></details>",
			"Updates `@types/semver` from 7.7.1 to 7.8.0",
			"Updates `esbuild` from 0.28.1 to 0.28.2",
			"Updates `typescript` from 6.9.9 to 7.0.2",
		].join("\n");
		const out = parseDependabotPr(
			"chore(deps-dev): bump the dev-dependencies group with 4 updates",
			body
		);
		assert.deepEqual(out, [
			{ name: "@types/node", fromVersion: "25.6.0", toVersion: "26.4.0" },
			{ name: "@types/semver", fromVersion: "7.7.1", toVersion: "7.8.0" },
			{ name: "esbuild", fromVersion: "0.28.1", toVersion: "0.28.2" },
			{ name: "typescript", fromVersion: "6.9.9", toVersion: "7.0.2" },
		]);
	});

	it("classifies a GitHub Actions bump as its own ecosystem (PR #27)", () => {
		// `actions/setup-node` looks identical to a package bump and would 404 on
		// npm, so it carries its ecosystem rather than being dropped.
		const out = parseDependabotPr(
			"chore(deps): bump actions/setup-node from 4 to 7",
			"Bumps [actions/setup-node](https://github.com/actions/setup-node) from 4 to 7."
		);
		assert.deepEqual(out, [
			{ name: "actions/setup-node", fromVersion: "4", toVersion: "7", ecosystem: "github-actions" },
		]);
	});

	it("classifies a nested action path", () => {
		const out = parseDependabotPr("chore(deps): bump github/codeql-action/init from 3.28.0 to 3.29.0");
		assert.deepEqual(out, [
			{
				name: "github/codeql-action/init",
				fromVersion: "3.28.0",
				toVersion: "3.29.0",
				ecosystem: "github-actions",
			},
		]);
	});

	it("mixes actions and npm packages in one grouped PR", () => {
		const body = [
			"Updates `actions/checkout` from 4 to 5",
			"Updates `esbuild` from 0.28.1 to 0.28.2",
		].join("\n");
		const out = parseDependabotPr("chore(deps): bump the ci group", body);
		assert.deepEqual(out, [
			{ name: "actions/checkout", fromVersion: "4", toVersion: "5", ecosystem: "github-actions" },
			{ name: "esbuild", fromVersion: "0.28.1", toVersion: "0.28.2" },
		]);
	});

	it("keeps scoped npm packages, which also contain a slash", () => {
		const out = parseDependabotPr("chore(deps): bump @types/node from 25.6.0 to 26.4.0");
		assert.deepEqual(out, [{ name: "@types/node", fromVersion: "25.6.0", toVersion: "26.4.0" }]);
	});

	it("does not double-count when title and body describe the same bump", () => {
		const out = parseDependabotPr(
			"chore(deps): bump zod from 4.3.6 to 4.5.2",
			"Bumps [zod](https://github.com/colinhacks/zod) from 4.3.6 to 4.5.2."
		);
		assert.equal(out.length, 1);
	});

	it("returns nothing for a PR that is not a dependency bump", () => {
		assert.deepEqual(parseDependabotPr("feat: add output schemas", "Some description."), []);
	});

	it("tolerates a missing body", () => {
		const out = parseDependabotPr("build(deps-dev): bump tsx from 4.21.0 to 4.23.13", undefined);
		assert.deepEqual(out, [{ name: "tsx", fromVersion: "4.21.0", toVersion: "4.23.13" }]);
	});
});

// The parser reads a presentation format, not an API. If GitHub or Renovate
// restyles a PR body it returns nothing, and a silent no-op reads as "broken".
// Knowing the author was a dependency bot is what turns that into a loud warning.
describe("isDependencyBot", () => {
	it("recognises Dependabot", () => {
		assert.equal(isDependencyBot("dependabot[bot]"), true);
	});

	it("recognises Renovate, self-hosted included", () => {
		assert.equal(isDependencyBot("renovate[bot]"), true);
		assert.equal(isDependencyBot("renovate-bot"), true);
	});

	it("ignores a human author", () => {
		assert.equal(isDependencyBot("kaustubhdgr8"), false);
	});

	it("ignores an unrelated bot", () => {
		assert.equal(isDependencyBot("codecov[bot]"), false);
	});

	it("tolerates a missing login", () => {
		assert.equal(isDependencyBot(undefined), false);
	});
});
