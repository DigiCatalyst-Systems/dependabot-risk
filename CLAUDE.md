# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`DigiCatalyst-Systems/dependabot-risk` is a public GitHub Action (`uses: DigiCatalyst-Systems/dependabot-risk@v1`) that ranks Dependabot and Renovate pull requests by real risk. It parses the PR title, body and commit trailers, runs each package through the analyzer from `@digicatalyst/dep-diff-mcp`, and posts one Markdown comment plus a job summary. The analysis engine lives in the sibling repo `~/Code/biz/mcp/dep-diff-mcp`; this repo owns parsing, ranking, rendering, commenting and labelling.

Listed on the GitHub Marketplace. Consumers pin `@v1`, an exact tag, or a commit SHA. `README.md` is the user-facing contract for inputs, outputs and behaviour and must stay in step with `action.yml`.

## Commands

```bash
npm ci
npm run typecheck                                  # tsc --noEmit
npm test                                           # node --test over tests/*.test.ts (via tsx)
node --import tsx --test tests/render.test.ts      # one file
node --import tsx --test --test-name-pattern="scope" tests/*.test.ts   # tests matching a name
npm run build                                      # esbuild bundle -> dist/index.js (committed)
npm run changelog                                  # regenerate CHANGELOG.md from GitHub Releases (needs gh auth)
```

CI (`.github/workflows/ci.yml`) runs typecheck and tests, then rebuilds `dist/` and fails if it differs from what is committed. Any change under `src/` or to a runtime dependency must be followed by `npm run build`, with `dist/index.js` committed in the same change. Node 24 is the runtime (`runs.using: node24` in `action.yml`).

## Architecture

- `src/main.ts` is the entrypoint only. It calls `run()` from `src/action.ts` so tests can drive the action without executing it on import.
- `src/action.ts` `run(overrides)`: reads inputs via `@actions/core`, decides Dependabot vs Renovate from the PR author, parses changes, reads commit messages for scope, analyzes packages with bounded concurrency (8), renders, upserts the comment (found again via `COMMENT_MARKER`), writes outputs, and reconciles the automerge label. The two network calls (`analyze`, `getOctokit`) are injectable through `Deps`, which is how `tests/e2e.test.ts` runs the real `run()` against a fake Octokit and a real Dependabot payload.
- `src/dependabot.ts` and `src/renovate.ts` parse the two bots' PR formats into `DependabotChange[]`. The Dependabot rule is structural: once any `Updates ...` line exists, the `Bumps ...` line and the title are summaries and are ignored (otherwise Gradle catalog aliases get treated as packages).
- `src/scope.ts` reads `dependency-type` from Dependabot's YAML commit trailer, or Renovate's `Type` column, and maps to `runtime | dev | ci | indirect`. Scope annotates; it never changes rank. A security advisory in a dev dependency still reports level `security`, and a regression test asserts it.
- `src/render.ts` owns the Markdown: one marker per package (security / breaking / worth a look / nothing), one table row per package including routine ones, the full change list in `<details>`, `capForComment` at 60,000 chars. `highestLevel` and `isSafeToAutomerge` feed the `fail-on` input and the outputs.
- Rank order is `security > caution > review > likely-safe > safe` (`ORDER` in `action.ts`).

## Invariants

- Never be silent. Every defect so far in this project was dropped information: a package skipped, a section truncated, a crash that looked like a pass. When a package cannot be analyzed, its row says so. When a bot opened the PR and nothing parsed, the action warns loudly. Under-reporting risk is treated as a security issue (`SECURITY.md`).
- Only `github-token` reaches the network. Never log it, write it to the summary, or include it in the comment. PR titles and bodies are untrusted input.
- `action.yml` inputs and outputs, `README.md`, and `run()` must agree. Adding an input means updating all three.
- `dist/` is reviewed by the CI rebuild, not by reading the diff. Do not hand-edit it.
- `docs/` is gitignored on purpose (internal plans and research). Do not reference it from committed files.
- `npm-placeholder/` reserves the npm name; it ships only README and LICENSE.

## Releases

Tags `v*.*.*` are immutable by repository ruleset. `v1` moves to the newest `v1.x` release. After a release: `npm run changelog`, then open a PR with the regenerated `CHANGELOG.md` (it trails a release by one commit by design). `.github/workflows/attest.yml` rebuilds and attests `dist/index.js` on publish; consumers verify with `gh attestation verify dist/index.js --repo DigiCatalyst-Systems/dependabot-risk`.

## Agents and skills for this repo

- Pure TypeScript, no UI. Review with `typescript-reviewer`. Add `security-reviewer` for anything touching the token, the comment body, or PR-text parsing. `silent-failure-hunter` is the right reviewer for any change on the analyze-or-report path.
- `senior-developer` for non-trivial code changes. It must run `npm run build` and commit `dist/` before reporting READY FOR QA.
- `github-ops` skill for release, tag and Marketplace tasks.
- Changes to the analysis itself (advisories, release notes, breaking-change extraction) belong in `dep-diff-mcp`. Bump the dependency here afterwards.

## Git

- Public repository. Commits go out under the human author only: no `Co-Authored-By` or session trailers, and no mention of AI assistance in commit messages, PRs or release notes.
- Conventional commits, lowercase subject, no trailing period. Never commit on `main`; branch and open a PR. CI must be green, including the `dist/` drift check.
