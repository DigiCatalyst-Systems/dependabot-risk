import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseDependabotScopes } from "../src/scope.ts";

// Fixtures are real Dependabot commit trailers from dep-diff-mcp's own PRs.
const single = [
	"chore(deps): bump zod from 4.3.6 to 4.5.2",
	"",
	"Bumps [zod](https://github.com/colinhacks/zod) from 4.3.6 to 4.5.2.",
	"",
	"---",
	"updated-dependencies:",
	"- dependency-name: zod",
	"  dependency-version: 4.5.2",
	"  dependency-type: direct:production",
	"  update-type: version-update:semver-minor",
	"...",
	"",
	"Signed-off-by: dependabot[bot] <support@github.com>",
].join("\n");

const grouped = [
	"---",
	"updated-dependencies:",
	'- dependency-name: "@types/node"',
	"  dependency-version: 26.4.0",
	"  dependency-type: direct:development",
	"  update-type: version-update:semver-major",
	"  dependency-group: dev-dependencies",
	"- dependency-name: esbuild",
	"  dependency-version: 0.28.2",
	"  dependency-type: direct:development",
	"  update-type: version-update:semver-patch",
	"  dependency-group: dev-dependencies",
	"...",
].join("\n");

describe("parseDependabotScopes", () => {
	it("reads a production dependency from a single-package trailer (PR #30)", () => {
		assert.deepEqual([...parseDependabotScopes([single])], [["zod", "runtime"]]);
	});

	it("reads every entry of a grouped trailer, including quoted names (PR #28)", () => {
		assert.deepEqual(
			[...parseDependabotScopes([grouped])],
			[["@types/node", "dev"], ["esbuild", "dev"]]
		);
	});

	it("maps an indirect dependency", () => {
		const message = [
			"---",
			"updated-dependencies:",
			"- dependency-name: tough-cookie",
			"  dependency-type: indirect",
			"...",
		].join("\n");
		assert.deepEqual([...parseDependabotScopes([message])], [["tough-cookie", "indirect"]]);
	});

	it("ignores an unrecognised dependency-type rather than guessing", () => {
		const message = [
			"---",
			"updated-dependencies:",
			"- dependency-name: mystery",
			"  dependency-type: sideways:unknown",
			"...",
		].join("\n");
		assert.deepEqual([...parseDependabotScopes([message])], []);
	});

	it("returns nothing for a commit with no trailer", () => {
		assert.deepEqual([...parseDependabotScopes(["chore: unrelated commit"])], []);
	});

	it("lets a later commit win, because Dependabot force-pushes on rebase", () => {
		const first = [
			"---",
			"updated-dependencies:",
			"- dependency-name: zod",
			"  dependency-type: indirect",
			"...",
		].join("\n");
		assert.deepEqual([...parseDependabotScopes([first, single])], [["zod", "runtime"]]);
	});

	it("tolerates an empty list of commits", () => {
		assert.deepEqual([...parseDependabotScopes([])], []);
	});
});
