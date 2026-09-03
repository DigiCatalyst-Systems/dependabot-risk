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
	"<sub>[Dependabot Risk Report](https://github.com/marketplace/actions/dependabot-risk-report) " +
	"by DigiCatalyst Systems · ranked by what the release notes and advisories actually say, " +
	"not by semver · powered by " +
	"[dep-diff-mcp](https://github.com/DigiCatalyst-Systems/dep-diff-mcp).</sub>";

/**
 * Heading for the job summary only. The pull request comment must lead with the
 * verdict -- a banner above it is a line the reader has to skip before reaching
 * the point. A job summary has no such competition, so it can be labelled.
 */
export const SUMMARY_HEADING =
	"## 🛡️ Dependabot Risk Report\n\n" +
	"<sub>by DigiCatalyst Systems · " +
	"[install it](https://github.com/marketplace/actions/dependabot-risk-report)</sub>";

/**
 * Printed unconditionally to the run log, outside the collapsed group, so the
 * report is attributable at a glance in a log full of other jobs.
 */
export const LOG_BANNER = [
	"╔════════════════════════════════════════════════════════════════════╗",
	"║   D E P E N D A B O T   R I S K   R E P O R T                      ║",
	"║   by DigiCatalyst Systems                                          ║",
	"╚════════════════════════════════════════════════════════════════════╝",
].join("\n");

/** GitHub rejects a comment body over 65536 characters. Leave room for the notice. */
export const MAX_COMMENT_CHARS = 60000;

/**
 * A rejected comment is turned into a warning by the caller, so an oversized
 * report would disappear without ever being read. Trim it and say where the
 * whole thing is instead.
 */
export function capForComment(body: string): string {
	if (body.length <= MAX_COMMENT_CHARS) return body;
	const notice =
		"\n\n<sub>Report truncated — it exceeded GitHub's comment size limit. " +
		"The full report is in the job summary.</sub>";
	return body.slice(0, MAX_COMMENT_CHARS - notice.length) + notice;
}

/** How many nested changes the grouped view shows before collapsing the rest. */
const GROUPED_VISIBLE = 3;

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
		"|  | Package | Change | What to know |",
		"|---|---|---|---|",
	];

	// Every package gets a row, routine ones included. A comma-separated
	// afterthought reads as "and some others"; a row reads as "I checked this".
	const all = [...attention, ...routine];
	for (const a of all) {
		const change = a.error ? "—" : `${a.fromVersion} → ${a.toVersion}`;
		out.push(`| ${packageMarker(a)} | \`${a.package}\` | ${change} | ${cell(whatToKnow(a))} |`);
	}

	for (const a of all) {
		const breaks = a.breakingChanges ?? [];
		if (breaks.length === 0) continue;
		out.push(
			"",
			`<details><summary><b>${a.package}</b> — what breaks</summary>`,
			"",
			...groupByTag(breaks)
		);
		for (const link of a.migrationLinks ?? []) out.push("", `[Migration guide →](${link})`);
		out.push("", "</details>");
	}

	return out;
}

/**
 * One marker per package rather than per line. Security is deliberately its own
 * state: "merge this, it closes a hole" is the opposite instruction from "read
 * this before merging", and folding the two together inverts the advice on the
 * most valuable thing the report finds.
 */
function packageMarker(a: Analyzed): string {
	if ((a.securityFixes?.length ?? 0) > 0) return "🚨";
	if ((a.breakingChanges?.length ?? 0) > 0) return "🚫";
	if (a.error || needsAttention(a)) return "⚠️";
	return "✅";
}

/** A pipe in release-note text would otherwise split the cell into two. */
function cell(text: string): string {
	return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

const MAX_CELL_LEN = 90;

/**
 * A bare count tells you how much there is to read, not what it is. Lead with the
 * single most consequential item, because that is what decides whether the merge
 * is safe -- for a security row the worst advisory, for a breaking row the change
 * most likely to break a build outright.
 */
function whatToKnow(a: Analyzed): string {
	if (a.error) return `could not check — ${a.error}`;

	const fixes = a.securityFixes ?? [];
	if (fixes.length > 0) {
		const worst = fixes[0]!;
		const more = fixes.length - 1;
		const text =
			`closes ${cleanSummary(worst, a.package)} (${urgency(worst.severity)})` +
			(more > 0 ? ` · ${more} more` : "");
		return truncate(text);
	}

	const breaks = a.breakingChanges ?? [];
	if (breaks.length > 0) {
		const count = `${breaks.length} breaking change${breaks.length === 1 ? "" : "s"}`;
		const headline = highlightOf(breaks);
		return truncate(headline ? `${count} · ${headline}` : count);
	}

	if (needsAttention(a)) return truncate(a.recommendation ?? "review recommended");
	return "nothing found";
}

/**
 * The change worth naming in the summary cell. A new minimum requirement breaks a
 * workflow whether or not you use the feature, so it outranks everything else;
 * failing that, the first change stands in.
 */
function highlightOf(changes: string[]): string {
	const requirement = changes.find((c) => REQUIREMENT.test(c));
	const pick = requirement ?? changes[0]!;
	return pick.replace(/^\S+:\s*/, "").replace(/\s*\[[^\]]*\]\([^)]*\)\s*$/, "").trim();
}

const REQUIREMENT =
	/\b(?:now\s+requires?|minimum|must\s+be\s+on|or\s+later|upgrade\s+\S+\s+to\s+use|requires?\s+(?:node|python|runner))\b/i;

function truncate(text: string): string {
	if (text.length <= MAX_CELL_LEN) return text;
	const cut = text.slice(0, MAX_CELL_LEN);
	// Break on a word so a cell does not end mid-syllable ("v2.327.1 or l…").
	const space = cut.lastIndexOf(" ");
	return (space > MAX_CELL_LEN * 0.6 ? cut.slice(0, space) : cut).trimEnd() + "…";
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
