import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseDependabotScopes, parseRenovateScopes } from "../src/scope.ts";

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

// Renovate's prBodyColumns is user-configurable and merge-confidence badges
// displace the Type column, so its position varies and it is often absent.
// Header shapes below are real: MoJ #763, kit-data-manager #218, weblate #21437.
describe("parseRenovateScopes", () => {
	it("reads a Type column at index 1 (MoJ #763)", () => {
		const body = [
			"| Package | Type | Update | Change |",
			"|---|---|---|---|",
			"| [actions/setup-node](https://redirect.github.com/actions/setup-node) | action | major | `v6` \u2192 `v7` |",
		].join("\n");
		assert.deepEqual([...parseRenovateScopes(body)], [["actions/setup-node", "ci"]]);
	});

	it("reads a Type column at index 4 (kit-data-manager #218)", () => {
		const body = [
			"| Package | Change | [Age](https://x) | [Confidence](https://y) | Type | Update | Pending |",
			"|---|---|---|---|---|---|---|",
			"| [tsc-alias](https://x) ([source](https://y)) | [`1.9.2` \u2192 `1.9.3`](https://z) | ![age](https://a) | ![confidence](https://b) | devDependencies | patch |  |",
		].join("\n");
		assert.deepEqual([...parseRenovateScopes(body)], [["tsc-alias", "dev"]]);
	});

	it("returns nothing when there is no Type column (weblate #21437)", () => {
		const body = [
			"| Package | Change | [Age](https://x) | [Confidence](https://y) |",
			"|---|---|---|---|",
			"| [@sentry/browser](https://x) ([source](https://y)) | [`10.72.0` \u2192 `10.73.0`](https://z) | ![age](https://a) | ![confidence](https://b) |",
		].join("\n");
		assert.deepEqual([...parseRenovateScopes(body)], []);
	});

	it("maps every recognised manifest section", () => {
		const body = [
			"| Package | Type |",
			"|---|---|",
			"| a | dependencies |",
			"| b | devDependencies |",
			"| c | peerDependencies |",
			"| d | optionalDependencies |",
			"| e | action |",
			"| f | somethingElse |",
		].join("\n");
		assert.deepEqual(
			[...parseRenovateScopes(body)],
			[["a", "runtime"], ["b", "dev"], ["c", "runtime"], ["d", "runtime"], ["e", "ci"]]
		);
	});

	it("tolerates a missing body", () => {
		assert.deepEqual([...parseRenovateScopes(undefined)], []);
	});
});
