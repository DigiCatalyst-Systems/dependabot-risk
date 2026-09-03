# dependabot-risk

**This is not a usable npm package.** It holds the name so that nothing else can publish under it and be mistaken for the real project.

## What you probably want

**[Dependabot Risk Report](https://github.com/marketplace/actions/dependabot-risk-report)** — a GitHub Action that tells you which Dependabot and Renovate pull requests actually matter, by reading the security advisories and breaking changes behind each version change rather than trusting semver.

GitHub Actions are distributed by git ref, not through npm, so there is nothing to install:

```yaml
name: Dependabot risk
on: pull_request
permissions:
  contents: read
  pull-requests: write
jobs:
  risk:
    runs-on: ubuntu-latest
    steps:
      - uses: DigiCatalyst-Systems/dependabot-risk@v1
```

## If you want this on npm

The analysis engine behind the action **is** published, and is useful on its own:

```bash
npm i @digicatalyst/dep-diff-mcp
```

[`@digicatalyst/dep-diff-mcp`](https://www.npmjs.com/package/@digicatalyst/dep-diff-mcp) is an MCP server, so you can ask an assistant in Claude Code, Cursor, or Claude Desktop questions like *"is it safe to bump express from 4.18.2 to 5.0.0?"* and get back the advisories crossed, the breaking changes pulled from release notes, and a recommendation.

## License

MIT
