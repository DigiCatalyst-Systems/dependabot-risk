import type { DependabotChange, Ecosystem } from "./dependabot.ts";

// Renovate renders one table row per dependency:
//   | [name](url) ([changelog](url)) | `==2026.3` -> `==2026.9` | ![age](badge) | ...
// The title carries no from-version, so this table is the only usable source.
const ROW = /^\s*\|\s*(?:\[([^\]]+)\]\([^)]*\)|([^|[\]]+?))\s*(?:\([^|]*\))?\s*\|\s*`([^`]+)`\s*(?:->|→)\s*`([^`]+)`\s*\|/gm;

// Renovate's Mend badges encode the ecosystem in their path:
//   https://developer.mend.io/api/mc/badges/age/pypi/crispy-bootstrap5/2026.9
const BADGE_ECOSYSTEM = /developer\.mend\.io\/api\/mc\/badges\/[^/]+\/([^/]+)\//;

const BADGE_MAP: Record<string, Ecosystem> = {
	npm: "npm",
	pypi: "pypi",
	"github-actions": "github-actions",
	"github-tags": "github-actions",
};

/** `==2026.3`, `^4.18.2`, `>=1.2.3` all name the same version. */
const stripRange = (v: string) => v.replace(/^[\^~=<>!\s]+/, "").trim();

export function parseRenovatePr(body: string | undefined): DependabotChange[] {
	if (!body) return [];

	const out: DependabotChange[] = [];
	const seen = new Set<string>();

	for (const line of body.split("\n")) {
		ROW.lastIndex = 0;
		const m = ROW.exec(line);
		if (!m) continue;

		const name = (m[1] ?? m[2] ?? "").trim();
		const fromVersion = stripRange(m[3]!);
		const toVersion = stripRange(m[4]!);
		if (!name || !fromVersion || !toVersion) continue;
		if (seen.has(name)) continue;
		seen.add(name);

		const change: DependabotChange = { name, fromVersion, toVersion };
		const ecosystem = detectEcosystem(name, line);
		if (ecosystem) change.ecosystem = ecosystem;
		out.push(change);
	}
	return out;
}

function detectEcosystem(name: string, line: string): Ecosystem | undefined {
	// A slashed, unscoped name is a repository coordinate, which the badge cannot
	// contradict.
	if (name.includes("/") && !name.startsWith("@")) return "github-actions";
	const badge = line.match(BADGE_ECOSYSTEM);
	return badge?.[1] ? BADGE_MAP[badge[1].toLowerCase()] : undefined;
}
