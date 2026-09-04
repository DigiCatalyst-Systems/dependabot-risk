# Dependabot Risk Report

A GitHub Action that tells you **which Dependabot PRs actually matter**.

Semver tells you how much changed. It does not tell you what is urgent. A `patch`
bump can close a high-severity command injection; a `major` bump can be entirely
additive. This action reads the release notes and advisory data and ranks the
packages in a PR by real risk.

## What it looks like

Most of the time, reassurance:

> ### ✅ Nothing to worry about
>
> Checked `esbuild` 0.28.1 → 0.28.2. No security advisories affecting you, and no breaking changes in the release notes.

When a routine-looking patch is hiding something:

> ### 🔴 Merge this — it closes 2 security holes
>
> `lodash` 4.17.20 → 4.17.21 is a patch bump, but your current version is exposed to:
>
> - **Command Injection** — HIGH, fix soon
> - **Regular Expression Denial of Service (ReDoS)** — MODERATE, worth fixing
>
> Nothing else changes. Safe to merge as is.

**This is the case the action exists for.** Dependabot surfaces advisory
information on *security* updates. On a routine scheduled version bump it does
not — so a patch that happens to close a command injection looks like any other
patch.

When something will actually break:

> ### ⚠️ Read before merging — 2 things change
>
> `express` 4.18.2 → 5.0.0
>
> **What breaks**
> - `req.param()` has been removed — use `req.params`
> - Node.js 18 or higher is required
>
> Your tests may not catch these — they change behaviour, not syntax.
>
> [Migration guide →](https://expressjs.com/en/guide/migrating-5.html)

And for a grouped PR, which is where triage actually costs you time:

> ### 2 of 5 updates need a look
>
> **🔴 Merge first**
> - `lodash` 4.17.20 → 4.17.21 — closes **Command Injection** (HIGH, fix soon) and 1 more
>
> **⚠️ Read first**
> - `express` 4.18.2 → 5.0.0 — 2 breaking changes · [migration guide]
>
> **✅ Routine** — no advisories, no breaking changes
> `esbuild`, `tsx`, `zod`

## Usage

```yaml
name: Dependabot risk
on: pull_request

permissions:
  contents: read
  pull-requests: write

jobs:
  risk:
    # Gate on the pull request's author, not `github.actor`. The actor is whoever
    # triggered the run, so anyone reopening or pushing to a bot's branch would
    # skip the check.
    if: >-
      github.event.pull_request.user.login == 'dependabot[bot]' ||
      github.event.pull_request.user.login == 'renovate[bot]'
    runs-on: ubuntu-latest
    steps:
      - uses: DigiCatalyst-Systems/dependabot-risk@v1
```

No configuration and no token setup: the action reads the version bumps out of the
pull request itself and uses the job's own `GITHUB_TOKEN`.

The `if:` is optional — without it the action runs on every pull request and simply
reports that it found no dependency bumps. It is there to save a runner minute.

### Fail the check on risky upgrades

```yaml
      - uses: DigiCatalyst-Systems/dependabot-risk@v1
        with:
          fail-on: caution
```

### GitHub Actions bumps

No configuration needed — they are detected from the name:

```yaml
      - uses: DigiCatalyst-Systems/dependabot-risk@v1
```

### Python projects

```yaml
      - uses: DigiCatalyst-Systems/dependabot-risk@v1
        with:
          ecosystem: pypi
```

## Inputs

| Input | Default | Description |
|---|---|---|
| `github-token` | `${{ github.token }}` | Reads release notes and posts the comment. |
| `ecosystem` | `npm` | Default for names that do not settle it themselves: `npm` or `pypi`. GitHub Actions bumps are detected from the name. |
| `comment` | `true` | Post and update a comment on the PR. |
| `fail-on` | `none` | Fail at this level or worse: `security`, `caution`, `review`, `likely-safe`, `safe`, `none`. |

## Outputs

| Output | Description |
|---|---|
| `highest-level` | Riskiest level found across the PR. |
| `security-count` | Total advisories resolved by the PR. |
| `summary` | The rendered Markdown report. |

## What it reads

- **Security fixes** — advisories present at the old version and resolved at the new one, via [OSV.dev](https://osv.dev).
- **Breaking changes** — extracted from GitHub release notes between the two versions, with prerelease tags and CI/docs churn filtered out.
- **Migration links** — upgrade guide URLs found in those release notes.

### Supported bots and ecosystems

Both **Dependabot** and **Renovate** are read. Dependabot states each change in prose
(`Bumps [zod](...) from 4.3.6 to 4.5.2`); Renovate states it only in its body table
(`` | [zod](...) | `4.3.6` -> `4.5.2` | ``), including the range operators
(`^`, `==`, `>=`), which are stripped.

npm, PyPI, and **GitHub Actions** are analyzed. An `actions/checkout` bump needs no
configuration: a slashed, unscoped name is a repository coordinate, so it is detected
and routed regardless of the `ecosystem` input. This matters more than it sounds —
`actions/*` bumps are among the most common PRs Dependabot opens, and they carry real
advisories: `tj-actions/changed-files` 45.0.7 → 46.0.1 closes a HIGH-severity secret
disclosure that the PR body says nothing about.

If a dependency bot opened the PR and no version change could be read from it, the
action logs a warning rather than passing silently. A quiet no-op is indistinguishable
from a broken install.

The report is always written to the job summary, so it survives even when a fork PR's
token cannot post comments.

## How it works

Dependabot and Renovate PR bodies already state every version change, so this action
does not need to parse lockfiles. It reads them directly, then hands each change to
[`dep-diff`](https://github.com/DigiCatalyst-Systems/dep-diff-mcp) — the same analysis
engine available as an MCP server for interactive use in Claude Code, Cursor, and
Claude Desktop.

## License

MIT
