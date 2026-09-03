import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseRenovatePr } from "../src/renovate.ts";

// Renovate titles carry no from-version ("update dependency x to v2"), so the
// body table is the only source. Fixture shape taken from WeblateOrg/weblate #21415.
describe("parseRenovatePr", () => {
	it("reads a row and its ecosystem from the age badge", () => {
		const body = [
			"| Package | Change | Age |",
			"|---|---|---|",
			"| [crispy-bootstrap5](https://github.com/django-crispy-forms/crispy-bootstrap5) ([changelog](https://x)) | `==2026.3` -> `==2026.9` | ![age](https://developer.mend.io/api/mc/badges/age/pypi/crispy-bootstrap5/2026.9) |",
		].join("\n");
		assert.deepEqual(parseRenovatePr(body), [
			{ name: "crispy-bootstrap5", fromVersion: "2026.3", toVersion: "2026.9", ecosystem: "pypi" },
		]);
	});

	it("accepts the unicode arrow", () => {
		const body =
			"| [zod](https://github.com/colinhacks/zod) | `4.3.6` → `4.5.2` | ![age](https://developer.mend.io/api/mc/badges/age/npm/zod/4.5.2) |";
		assert.deepEqual(parseRenovatePr(body), [
			{ name: "zod", fromVersion: "4.3.6", toVersion: "4.5.2", ecosystem: "npm" },
		]);
	});

	it("strips range operators from both versions", () => {
		const body =
			"| [express](https://x) | `^4.18.2` -> `^5.0.0` | ![age](https://developer.mend.io/api/mc/badges/age/npm/express/5.0.0) |";
		assert.deepEqual(parseRenovatePr(body), [
			{ name: "express", fromVersion: "4.18.2", toVersion: "5.0.0", ecosystem: "npm" },
		]);
	});

	it("classifies a slashed name as github-actions", () => {
		const body = "| [actions/checkout](https://github.com/actions/checkout) | `v4` -> `v5` |";
		assert.deepEqual(parseRenovatePr(body), [
			{ name: "actions/checkout", fromVersion: "v4", toVersion: "v5", ecosystem: "github-actions" },
		]);
	});

	it("reads an unlinked package name", () => {
		const body = "| lodash | `4.17.20` -> `4.17.21` |";
		assert.deepEqual(parseRenovatePr(body), [
			{ name: "lodash", fromVersion: "4.17.20", toVersion: "4.17.21" },
		]);
	});

	it("reads every row of a multi-package table", () => {
		const body = [
			"| [zod](https://x) | `4.3.6` -> `4.5.2` | ![age](https://developer.mend.io/api/mc/badges/age/npm/zod/4.5.2) |",
			"| [esbuild](https://y) | `0.28.1` -> `0.28.2` | ![age](https://developer.mend.io/api/mc/badges/age/npm/esbuild/0.28.2) |",
		].join("\n");
		assert.equal(parseRenovatePr(body).length, 2);
	});

	it("skips a digest row with no version change", () => {
		const body = "| [some/image](https://x) | `sha256:abc` |";
		assert.deepEqual(parseRenovatePr(body), []);
	});

	it("ignores the header separator row", () => {
		const body = ["| Package | Change |", "|---|---|"].join("\n");
		assert.deepEqual(parseRenovatePr(body), []);
	});

	it("tolerates a missing body", () => {
		assert.deepEqual(parseRenovatePr(undefined), []);
	});
});
