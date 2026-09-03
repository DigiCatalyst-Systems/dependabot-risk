export type Ecosystem = "npm" | "pypi" | "github-actions";

export type DependabotChange = {
	name: string;
	fromVersion: string;
	toVersion: string;
	/** Set only where the pull request settles it; otherwise the caller decides. */
	ecosystem?: Ecosystem;
};

// Grouped PRs list one line per package: Updates `esbuild` from 0.28.1 to 0.28.2
const GROUPED = /^Updates\s+`([^`]+)`\s+from\s+(\S+)\s+to\s+(\S+)/gim;

// Single-package PRs open with: Bumps [zod](https://...) from 4.3.6 to 4.5.2.
const BUMPS = /^Bumps\s+(?:\[([^\]]+)\]\([^)]*\)|([^\s[]+))\s+from\s+(\S+)\s+to\s+(\S+)/gim;

// Fallback for a body-less PR: chore(deps): bump tsx from 4.21.0 to 4.23.13
const TITLE = /\bbumps?\s+(?:\[([^\]]+)\]\([^)]*\)|([^\s[]+))\s+from\s+(\S+)\s+to\s+(\S+)/i;

/**
 * A GitHub Actions bump (`actions/setup-node`) is shaped exactly like a package
 * bump, but the name is a repository coordinate rather than a registry entry, so
 * it needs its own ecosystem. Scoped npm packages also contain a slash, hence the
 * `@` exemption.
 */
function isActionReference(name: string): boolean {
	return name.includes("/") && !name.startsWith("@");
}

const clean = (v: string) => v.replace(/[.,;]+$/, "");

export function parseDependabotPr(title: string, body?: string): DependabotChange[] {
	const found: DependabotChange[] = [];
	const push = (name: string, from: string, to: string) => {
		const n = name.trim();
		if (!n) return;
		const change: DependabotChange = { name: n, fromVersion: clean(from), toVersion: clean(to) };
		if (isActionReference(n)) change.ecosystem = "github-actions";
		found.push(change);
	};

	if (body) {
		for (const m of body.matchAll(GROUPED)) push(m[1]!, m[2]!, m[3]!);
		for (const m of body.matchAll(BUMPS)) push(m[1] ?? m[2]!, m[3]!, m[4]!);
	}

	const t = title.match(TITLE);
	if (t) push(t[1] ?? t[2]!, t[3]!, t[4]!);

	// First mention wins: the body is more precise than the title, and a grouped
	// PR repeats each package in its opening summary line.
	const seen = new Set<string>();
	return found.filter((c) => !seen.has(c.name) && seen.add(c.name));
}

export function isDependencyBot(login: string | undefined): boolean {
	if (!login) return false;
	const bare = login
		.toLowerCase()
		.replace(/^app\//, "")
		.replace(/\[bot\]$/, "")
		.replace(/-bot$/, "");
	return bare === "dependabot" || bare === "renovate";
}
