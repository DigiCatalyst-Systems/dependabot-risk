export type SecurityFix = { id: string; summary: string; severity: string };

/** A successful analysis, or the in-place failure record for one that rejected. */
export type Analyzed = {
	package: string;
	ecosystem?: string;
	fromVersion?: string;
	toVersion?: string;
	semverClass?: string;
	repoUrl?: string | null;
	releaseCount?: number;
	breakingChanges?: string[];
	securityFixes?: SecurityFix[];
	migrationLinks?: string[];
	recommendation?: string;
	recommendationLevel: string;
	error?: string;
};

/** Lets the action find and update its own comment instead of posting a new one. */
export const COMMENT_MARKER = "<!-- dependabot-risk -->";

const RANK: Record<string, number> = {
	security: 0,
	caution: 1,
	review: 2,
	"likely-safe": 3,
	safe: 4,
};

const BADGE: Record<string, string> = {
	security: "🔴",
	caution: "🟠",
	review: "🟡",
	"likely-safe": "🟢",
	safe: "🟢",
};

const rank = (a: Analyzed) => RANK[a.recommendationLevel] ?? RANK.review!;

export function highestLevel(analyses: Analyzed[]): string {
	if (analyses.length === 0) return "safe";
	return analyses.reduce((worst, a) => (rank(a) < rank(worst) ? a : worst)).recommendationLevel;
}

const SEVERE = new Set(["HIGH", "CRITICAL"]);

export function renderComment(analyses: Analyzed[]): string {
	const sorted = [...analyses].sort((a, b) => rank(a) - rank(b));
	const fixes = sorted.flatMap((a) =>
		(a.securityFixes ?? []).map((f) => ({ pkg: a.package, ...f }))
	);
	const severe = fixes.filter((f) => SEVERE.has(f.severity.toUpperCase()));
	const breaking = sorted.filter((a) => (a.breakingChanges?.length ?? 0) > 0);
	const needsLook = sorted.filter((a) => rank(a) <= RANK.review!);

	const lines: string[] = [COMMENT_MARKER, "### Dependabot Risk Report", ""];

	if (needsLook.length === 0) {
		lines.push(`Nothing here needs a closer look — ${plural(sorted.length, "package")}, no security fixes and no breaking changes found.`, "");
	} else {
		const bits: string[] = [];
		if (fixes.length > 0) {
			bits.push(
				severe.length > 0
					? `**${plural(fixes.length, "security fix", "security fixes")}** (${severe.length} high/critical)`
					: `**${plural(fixes.length, "security fix", "security fixes")}**`
			);
		}
		if (breaking.length > 0) bits.push(`breaking changes in ${plural(breaking.length, "package")}`);
		const detail = bits.length > 0 ? ` — ${bits.join(", ")}` : "";
		lines.push(`**${plural(needsLook.length, "package")} of ${sorted.length} need${needsLook.length === 1 ? "s" : ""} a look**${detail}.`, "");
	}

	lines.push("| Package | Change | Class | Verdict |", "|---|---|---|---|");
	for (const a of sorted) lines.push(row(a));
	lines.push("");

	if (fixes.length > 0) {
		lines.push("<details><summary>Security advisories fixed in this range</summary>", "");
		for (const f of fixes) {
			lines.push(`- \`${f.pkg}\` — **${f.severity.toUpperCase()}** [${f.id}](https://github.com/advisories/${f.id}): ${f.summary}`);
		}
		lines.push("", "</details>", "");
	}

	if (breaking.length > 0) {
		lines.push("<details><summary>Breaking changes from release notes</summary>", "");
		for (const a of breaking) {
			lines.push(`**${a.package}** ${a.fromVersion} → ${a.toVersion}`);
			for (const b of a.breakingChanges!) lines.push(`- ${b}`);
			for (const link of a.migrationLinks ?? []) lines.push(`- Migration guide: ${link}`);
			lines.push("");
		}
		lines.push("</details>", "");
	}

	lines.push(
		"<sub>Ranked by what the release notes and advisories actually say, not by semver. " +
			"Powered by [dep-diff](https://github.com/DigiCatalyst-Systems/dep-diff-mcp).</sub>"
	);
	return lines.join("\n");
}

function row(a: Analyzed): string {
	const badge = BADGE[a.recommendationLevel] ?? "🟡";
	if (a.error) {
		return `| \`${a.package}\` | — | — | ${badge} **Could not analyze** — ${a.error} |`;
	}
	const change = `${a.fromVersion} → ${a.toVersion}`;
	const notes: string[] = [];
	const n = a.securityFixes?.length ?? 0;
	if (n > 0) {
		const worst = (a.securityFixes ?? [])
			.map((f) => f.severity.toUpperCase())
			.find((s) => SEVERE.has(s));
		notes.push(`${plural(n, "security fix", "security fixes")}${worst ? ` (${worst})` : ""}`);
	}
	const b = a.breakingChanges?.length ?? 0;
	if (b > 0) notes.push(`${plural(b, "breaking change")}`);
	const verdict = notes.length > 0 ? notes.join(", ") : (a.recommendation ?? "").replace(/\s+/g, " ");
	return `| \`${a.package}\` | ${change} | ${a.semverClass ?? "—"} | ${badge} ${verdict} |`;
}

function plural(n: number, one: string, many = `${one}s`): string {
	return `${n} ${n === 1 ? one : many}`;
}
