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
