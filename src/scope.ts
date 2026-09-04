/**
 * Where a dependency actually runs. Scope is an annotation only: it never
 * changes how a package ranks, because a compromised build tool still runs in
 * CI holding the repository token.
 */
export type Scope = "runtime" | "dev" | "ci" | "indirect";

const DEPENDABOT_TYPE: Record<string, Scope> = {
	"direct:production": "runtime",
	"direct:development": "dev",
	indirect: "indirect",
};

const NAME = /^-\s+dependency-name:\s*(.+?)\s*$/;
const TYPE = /^\s+dependency-type:\s*(\S+)\s*$/;

const unquote = (v: string) => v.replace(/^["']|["']$/g, "");

/**
 * Dependabot states the scope in a YAML trailer on the commit, not in the pull
 * request body -- structured metadata rather than a presentation format, so it
 * is sturdier than the title and body parsers.
 *
 * Later commits win: Dependabot force-pushes when it rebases, so the last
 * message is the freshest statement of what the branch now changes.
 */
export function parseDependabotScopes(commitMessages: string[]): Map<string, Scope> {
	const out = new Map<string, Scope>();
	for (const message of commitMessages) {
		let inBlock = false;
		let name: string | undefined;
		for (const raw of message.split("\n")) {
			const line = raw.trimEnd();
			if (/^updated-dependencies:\s*$/.test(line)) {
				inBlock = true;
				continue;
			}
			if (!inBlock) continue;
			// The trailer is a YAML document; "..." ends it.
			if (line === "..." || line === "---") {
				inBlock = false;
				name = undefined;
				continue;
			}
			const n = line.match(NAME);
			if (n) {
				name = unquote(n[1]!);
				continue;
			}
			const t = line.match(TYPE);
			if (!t || !name) continue;
			// An unrecognised type yields nothing. Guessing here would state a
			// scope the trailer never claimed.
			const scope = DEPENDABOT_TYPE[t[1]!];
			if (scope) out.set(name, scope);
		}
	}
	return out;
}

const RENOVATE_TYPE: Record<string, Scope> = {
	dependencies: "runtime",
	devdependencies: "dev",
	// Peer and optional dependencies still ship to whoever installs the package.
	peerdependencies: "runtime",
	optionaldependencies: "runtime",
	action: "ci",
};

/** `| a | b |` -> `["a", "b"]`. Returns nothing for a line that is not a row. */
function cells(line: string): string[] {
	const t = line.trim();
	if (!t.startsWith("|")) return [];
	return t.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

/** `[name](url) ([source](url))` -> `name`; a bare cell is its own name. */
function nameFrom(cell: string): string {
	const link = cell.match(/^\[([^\]]+)\]\([^)]*\)/);
	return (link ? link[1]! : cell.replace(/\s*\(.*$/, "")).trim();
}

const HEADER_CELL = /^\[?([A-Za-z ]+)\]?/;
const headerName = (cell: string) => (cell.match(HEADER_CELL)?.[1] ?? "").trim().toLowerCase();

/**
 * Renovate has no commit trailer, only an optional body column. Its position is
 * not fixed -- `prBodyColumns` is user-configurable and merge-confidence badges
 * displace it -- so the index is read from the header row rather than assumed.
 * Most Renovate pull requests carry no Type column at all, which yields no
 * entries rather than a guess.
 */
export function parseRenovateScopes(body: string | undefined): Map<string, Scope> {
	const out = new Map<string, Scope>();
	if (!body) return out;

	let packageIdx = -1;
	let typeIdx = -1;

	for (const line of body.split("\n")) {
		const row = cells(line);
		if (row.length === 0) continue;

		if (typeIdx === -1) {
			const names = row.map(headerName);
			const p = names.indexOf("package");
			const t = names.indexOf("type");
			if (p !== -1 && t !== -1) {
				packageIdx = p;
				typeIdx = t;
			}
			continue;
		}

		// The |---|---| separator directly under the header.
		if (row.every((c) => /^:?-+:?$/.test(c))) continue;

		const name = nameFrom(row[packageIdx] ?? "");
		const scope = RENOVATE_TYPE[(row[typeIdx] ?? "").toLowerCase()];
		if (name && scope) out.set(name, scope);
	}
	return out;
}
