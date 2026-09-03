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
	security: 0, caution: 1, review: 2, "likely-safe": 3, safe: 4,
};
const rank = (a: Analyzed) => RANK[a.recommendationLevel] ?? RANK.review!;
const needsAttention = (a: Analyzed) => rank(a) <= RANK.review!;

/** Severity labels mean little to a non-expert. Translate them into urgency. */
const URGENCY: Record<string, string> = {
	CRITICAL: "fix urgently",
	HIGH: "fix soon",
	MODERATE: "worth fixing",
	MEDIUM: "worth fixing",
	LOW: "minor",
};

const FOOTER =
	"<sub>Ranked by what the release notes and advisories actually say, not by semver. " +
	"Powered by [dep-diff](https://github.com/DigiCatalyst-Systems/dep-diff-mcp).</sub>";

export function highestLevel(analyses: Analyzed[]): string {
	if (analyses.length === 0) return "safe";
	return analyses.reduce((worst, a) => (rank(a) < rank(worst) ? a : worst)).recommendationLevel;
}

export function renderComment(analyses: Analyzed[]): string {
	const sorted = [...analyses].sort((a, b) => rank(a) - rank(b));
	const attention = sorted.filter(needsAttention);
	const routine = sorted.filter((a) => !needsAttention(a));

	const body =
		attention.length === 0
			? allClear(routine)
			: sorted.length === 1
				? single(sorted[0]!)
				: grouped(attention, routine, sorted.length);

	// Sections push a trailing blank so the next one is separated; the last of
	// them would otherwise double up with the footer's own.
	while (body.length > 0 && body[body.length - 1] === "") body.pop();

	return [COMMENT_MARKER, ...body, "", FOOTER].join("\n");
}

/** The reassurance case. Says what was checked so silence reads as work, not absence. */
function allClear(routine: Analyzed[]): string[] {
	const names = routine.map((a) => `\`${a.package}\``).join(", ");
	const what =
		routine.length === 1
			? `${names} ${routine[0]!.fromVersion} → ${routine[0]!.toVersion}`
			: `all ${routine.length} updates`;
	return [
		"### ✅ Nothing to worry about",
		"",
		`Checked ${what}. No security advisories affecting you, and no breaking changes in the release notes.`,
		...(routine.length > 1 ? ["", names] : []),
	];
}

function single(a: Analyzed): string[] {
	if (a.error) {
		return [
			"### 🟡 Could not check this update",
			"",
			`\`${a.package}\` — ${a.error}`,
			"",
			"Nothing is necessarily wrong; the analysis just could not complete. Review it by hand.",
		];
	}

	const out: string[] = [];
	const fixes = a.securityFixes ?? [];
	const breaks = a.breakingChanges ?? [];

	if (fixes.length > 0) {
		out.push(
			fixes.length === 1
				? "### 🔴 Merge this — it closes a security hole"
				: `### 🔴 Merge this — it closes ${fixes.length} security holes`,
			"",
			`\`${a.package}\` ${a.fromVersion} → ${a.toVersion} is a ${a.semverClass} bump, ` +
				"but your current version is exposed to:",
			"",
			...fixes.map((f) => `- **${cleanSummary(f, a.package)}** — ${urgency(f.severity)}`)
		);
		if (breaks.length === 0) out.push("", "Nothing else changes. Safe to merge as is.");
	}

	if (breaks.length > 0) {
		if (out.length > 0) out.push("");
		out.push(
			`### ⚠️ Read before merging — ${breaks.length} thing${breaks.length === 1 ? "" : "s"} change${breaks.length === 1 ? "s" : ""}`,
			"",
			`\`${a.package}\` ${a.fromVersion} → ${a.toVersion}`,
			"",
			"**What breaks**",
			"",
			...groupByTag(breaks),
			"",
			"Your tests may not catch these — they change behaviour, not syntax."
		);
		for (const link of a.migrationLinks ?? []) out.push("", `[Migration guide →](${link})`);
	}

	if (out.length === 0) {
		out.push(
			"### 🟡 Worth a look before merging",
			"",
			`\`${a.package}\` ${a.fromVersion} → ${a.toVersion} — ${a.recommendation ?? "review recommended"}`
		);
	}
	return out;
}

/**
 * Entries arrive as `v4.5.0: what broke`. Printing that tag on every line puts
 * 18 characters of noise before any information, so print it once as a
 * subheading and list its changes under it.
 */
const TAGGED = /^([^\s:]+):\s+([\s\S]+)$/;

function groupByTag(entries: string[]): string[] {
	const out: string[] = [];
	let lastTag: string | null = null;
	for (const entry of entries) {
		const m = entry.match(TAGGED);
		if (!m) {
			lastTag = null;
			out.push(`- ${entry}`);
			continue;
		}
		const [, tag, text] = m as unknown as [string, string, string];
		if (tag !== lastTag) {
			if (out.length > 0) out.push("");
			out.push(`\`${tag}\``);
			lastTag = tag;
		}
		out.push(`- ${text}`);
	}
	return out;
}

function grouped(attention: Analyzed[], routine: Analyzed[], total: number): string[] {
	const out = [
		`### ${attention.length} of ${total} update${total === 1 ? "" : "s"} need${attention.length === 1 ? "s" : ""} a look`,
		"",
	];

	const security = attention.filter((a) => (a.securityFixes?.length ?? 0) > 0);
	const breaking = attention.filter(
		(a) => (a.breakingChanges?.length ?? 0) > 0 && (a.securityFixes?.length ?? 0) === 0
	);
	const unclear = attention.filter((a) => a.error);
	const other = attention.filter(
		(a) => !security.includes(a) && !breaking.includes(a) && !unclear.includes(a)
	);

	if (security.length > 0) {
		out.push("**🔴 Merge first**");
		for (const a of security) {
			const worst = (a.securityFixes ?? [])[0]!;
			const extra = (a.securityFixes ?? []).length - 1;
			out.push(
				`- \`${a.package}\` ${a.fromVersion} → ${a.toVersion} — closes **${cleanSummary(worst, a.package)}** ` +
					`(${urgency(worst.severity)})${extra > 0 ? ` and ${extra} more` : ""}`
			);
		}
		out.push("");
	}

	if (breaking.length > 0) {
		out.push("**⚠️ Read first**");
		for (const a of breaking) {
			const link = (a.migrationLinks ?? [])[0];
			out.push(
				`- \`${a.package}\` ${a.fromVersion} → ${a.toVersion} — ${a.breakingChanges!.length} breaking change` +
					`${a.breakingChanges!.length === 1 ? "" : "s"}${link ? ` · [migration guide](${link})` : ""}`
			);
			const shown = a.breakingChanges!.slice(0, 3);
			for (const b of shown) out.push(`  - ${b}`);
			const hidden = a.breakingChanges!.length - shown.length;
			// Claiming five and listing three, silently, is the failure this whole
			// report exists to avoid.
			if (hidden > 0) out.push(`  - …and ${hidden} more`);
		}
		out.push("");
	}

	for (const [heading, group] of [
		["**🟡 Worth a look**", other],
		["**🟡 Could not check**", unclear],
	] as const) {
		if (group.length === 0) continue;
		out.push(heading);
		for (const a of group) {
			out.push(
				a.error
					? `- \`${a.package}\` — ${a.error}`
					: `- \`${a.package}\` ${a.fromVersion} → ${a.toVersion} — ${a.recommendation ?? "review recommended"}`
			);
		}
		out.push("");
	}

	if (routine.length > 0) {
		out.push(
			"**✅ Routine** — no advisories, no breaking changes",
			routine.map((a) => `\`${a.package}\``).join(", ")
		);
	}
	return out;
}

/** "Command Injection in lodash" reads badly next to a lodash label. */
function cleanSummary(f: SecurityFix, pkg: string): string {
	const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return f.summary.replace(new RegExp(`\\s+in\\s+${escaped}\\s*$`, "i"), "").trim();
}

function urgency(severity: string): string {
	const s = severity.toUpperCase();
	const plain = URGENCY[s];
	return plain ? `${s}, ${plain}` : s;
}
