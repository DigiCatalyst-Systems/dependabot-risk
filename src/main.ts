import * as core from "@actions/core";
import * as github from "@actions/github";
import { analyzePackageChange } from "@digicatalyst/dep-diff-mcp/dist/analyzer.js";
import { isDependencyBot, parseDependabotPr, type Ecosystem } from "./dependabot.ts";
import { parseRenovatePr } from "./renovate.ts";
import {
	COMMENT_MARKER,
	capForComment,
	highestLevel,
	renderComment,
	SUMMARY_HEADING,
	type Analyzed,
} from "./render.ts";

const ORDER = ["security", "caution", "review", "likely-safe", "safe"];
const CONCURRENCY = 8;

/** Small bounded-concurrency map, so a 30-package group does not open 30 sockets. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const out = new Array<R>(items.length);
	let next = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (next < items.length) {
			const i = next++;
			out[i] = await fn(items[i]!);
		}
	});
	await Promise.all(workers);
	return out;
}

export async function run(): Promise<void> {
	const token = core.getInput("github-token", { required: true });
	const ecosystem = (core.getInput("ecosystem") || "npm") as Ecosystem;
	const failOn = (core.getInput("fail-on") || "none").trim();
	const shouldComment = core.getBooleanInput("comment");

	const pr = github.context.payload.pull_request;
	if (!pr) {
		core.info("Not a pull_request event — nothing to analyze.");
		return;
	}

	const body = (pr.body as string | null) ?? undefined;
	// Dependabot states the change in prose; Renovate only in a table. Neither
	// format matches the other, so a miss on one is not a miss on the other.
	const changes = [
		...parseDependabotPr(pr.title ?? "", body),
		...parseRenovatePr(body),
	].filter((c, i, all) => all.findIndex((o) => o.name === c.name) === i);
	if (changes.length === 0) {
		// Reading a pull request body is reading a presentation format, not an API.
		// When the author was a dependency bot there were changes to find, so failing
		// quietly here would read as "the action is broken" — say so instead.
		if (isDependencyBot(pr.user?.login)) {
			core.warning(
				`Could not read any version changes from this ${pr.user?.login} pull request. ` +
					"The body format may have changed — please open an issue at " +
					"https://github.com/DigiCatalyst-Systems/dependabot-risk/issues with a link to this PR."
			);
		} else {
			core.info("No dependency bumps found in this pull request.");
		}
		core.setOutput("highest-level", "safe");
		core.setOutput("security-count", "0");
		return;
	}

	const actionCount = changes.filter((c) => c.ecosystem === "github-actions").length;
	core.info(
		`Analyzing ${changes.length} package change(s): ` +
			`${changes.length - actionCount} in ${ecosystem}, ${actionCount} github-actions.`
	);

	const analyses: Analyzed[] = await mapLimit(changes, CONCURRENCY, async (c) => {
		try {
			return (await analyzePackageChange(
				// A slashed, unscoped name is a repository coordinate, so the name
				// itself settles the ecosystem regardless of the configured default.
				c.ecosystem ?? ecosystem,
				c.name,
				c.fromVersion,
				c.toVersion,
				token
			)) as Analyzed;
		} catch (err) {
			// Report the failure in place. Dropping it would silently understate risk.
			core.warning(`Could not analyze ${c.name}: ${(err as Error).message}`);
			return {
				package: c.name,
				error: (err as Error).message,
				recommendationLevel: "review",
			};
		}
	});

	const report = renderComment(analyses);
	const level = highestLevel(analyses);
	const securityCount = analyses.reduce((n, a) => n + (a.securityFixes?.length ?? 0), 0);

	core.setOutput("highest-level", level);
	core.setOutput("security-count", String(securityCount));
	core.setOutput("summary", report);
	await core.summary.addRaw(`${SUMMARY_HEADING}\n\n${report}`).write();

	// The log is the one surface that cannot be blocked by a fork's read-only
	// token or trimmed by GitHub's comment size limit, so the whole report goes
	// here unconditionally. Grouped, so it collapses by default.
	core.startGroup("Risk report");
	core.info(report);
	core.endGroup();

	if (shouldComment) await upsertComment(token, pr.number, capForComment(report));

	if (failOn !== "none") {
		const threshold = ORDER.indexOf(failOn);
		if (threshold === -1) {
			core.warning(`Unknown fail-on value "${failOn}"; expected one of ${ORDER.join(", ")}, or none.`);
		} else if (ORDER.indexOf(level) <= threshold) {
			core.setFailed(`Highest risk level is "${level}", at or above the fail-on threshold "${failOn}".`);
		}
	}
}

/** Update this action's own comment rather than adding one per push. */
async function upsertComment(token: string, issueNumber: number, body: string): Promise<void> {
	const octokit = github.getOctokit(token);
	const { owner, repo } = github.context.repo;
	try {
		const existing = await octokit.paginate(octokit.rest.issues.listComments, {
			owner,
			repo,
			issue_number: issueNumber,
			per_page: 100,
		});
		const mine = existing.find((c) => c.body?.includes(COMMENT_MARKER));
		if (mine) {
			await octokit.rest.issues.updateComment({ owner, repo, comment_id: mine.id, body });
			core.info(`Updated existing comment ${mine.id}.`);
			return;
		}
		await octokit.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body });
		core.info("Posted risk report comment.");
	} catch (err) {
		// A fork PR gets a read-only token; the job summary still carries the report.
		core.warning(
			`Could not post the comment (${(err as Error).message}). ` +
				"If this is a pull request from a fork, grant pull-requests: write or read the job summary instead."
		);
	}
}

run().catch((err) => core.setFailed((err as Error).message));
