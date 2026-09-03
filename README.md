# Dependabot Risk Report

A GitHub Action that tells you **which Dependabot PRs actually matter**.

Semver tells you how much changed. It does not tell you what is urgent. A `patch`
bump can close a high-severity command injection; a `major` bump can be entirely
additive. This action reads the release notes and advisory data and ranks the
packages in a PR by real risk.

## What it looks like

> ### Dependabot Risk Report
>
> **1 package of 2 needs a look** — **2 security fixes** (1 high/critical).
>
> | Package | Change | Class | Verdict |
> |---|---|---|---|
> | `lodash` | 4.17.20 → 4.17.21 | patch | 🔴 2 security fixes (HIGH) |
> | `esbuild` | 0.28.1 → 0.28.2 | patch | 🟢 SAFE: Patch-level change. |

Note the ordering: the `patch` bump outranks everything else, because it closes a
**HIGH-severity command injection**. That is the case this action exists for.

## Usage

```yaml
name: Dependabot risk
on: pull_request

permissions:
  contents: read
  pull-requests: write

jobs:
  risk:
    if: github.actor == 'dependabot[bot]'
    runs-on: ubuntu-latest
    steps:
      - uses: DigiCatalyst-Systems/dependabot-risk@v1
```

No configuration and no token setup: the action reads the version bumps out of the
Dependabot PR itself and uses the job's own `GITHUB_TOKEN`.

### Fail the check on risky upgrades

```yaml
      - uses: DigiCatalyst-Systems/dependabot-risk@v1
        with:
          fail-on: caution
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
| `ecosystem` | `npm` | `npm` or `pypi`. |
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

The report is always written to the job summary, so it survives even when a fork PR's
token cannot post comments.

## How it works

Dependabot PR titles and bodies already state every version change, so this action
does not need to parse lockfiles. It reads them directly, then hands each change to
[`dep-diff`](https://github.com/DigiCatalyst-Systems/dep-diff-mcp) — the same analysis
engine available as an MCP server for interactive use in Claude Code, Cursor, and
Claude Desktop.

## License

MIT
