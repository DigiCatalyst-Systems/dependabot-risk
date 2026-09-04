# Security policy

## Reporting a vulnerability

**Use [private vulnerability reporting](https://github.com/DigiCatalyst-Systems/dependabot-risk/security/advisories/new).** It keeps the report private, threads the conversation, and drafts the advisory in the same place. If you would rather use email, write to <kaustubh@digicatalyst.ca>.

Please do not open a public issue for a suspected vulnerability.

Expect an acknowledgement within 3 working days. This is a small project, so a fix may take longer than that; you will be told where it stands rather than left waiting.

## Scope

This action runs on your own runner, reads the title and body of a pull request, and calls the GitHub and [OSV.dev](https://osv.dev) APIs. It writes a job summary and, when `comment` is enabled, one pull request comment.

Reports that are in scope include:

- Anything that lets a crafted pull request title or body change what the action executes, reaches outside the job, or exfiltrates the token.
- Incorrect handling of `github-token` — logging it, writing it to the summary, or including it in the comment.
- A path by which the action reports a package as safe when the data it fetched says otherwise. Under-reporting risk is the failure mode this project exists to prevent, so it is treated as a security issue rather than a bug.

Out of scope:

- Vulnerabilities in the dependencies this action *reports on*. Those belong to their own maintainers; this action only tells you they exist.
- Missing advisories caused by upstream data. If OSV or a release note has no record, neither will the report.

## Supply chain

`dist/` is a committed bundle, so what runs on your runner is in the repository and reviewable. CI rebuilds it from `src/` on every pull request and fails if the two differ, which is what makes reviewing `src/` sufficient.

Release tags `v*.*.*` cannot be moved or deleted — the repository ruleset that enforces this has no bypass actors, including for administrators. **Pin to a full commit SHA if you want the strongest guarantee**, or to `@v1.0.1` for an immutable tag. The `v1` tag moves by design, as the major-version convention requires.

Workflow actions used here are themselves pinned to commit SHAs, and the repository requires SHA pinning.

## Verifying a release

The action runs a bundled `dist/index.js`. Every release from v1.2.0 onward is
attested with build provenance, tying that bundle to this source and to the
workflow that built it:

```console
$ gh attestation verify dist/index.js --repo DigiCatalyst-Systems/dependabot-risk
```

The signing workflow rebuilds the bundle from `src/` at the release tag and
fails rather than attest if the rebuild does not match the committed file.

Released `vX.Y.Z` tags are immutable and cannot be moved or deleted by anyone,
including the maintainers. Only the floating `v1` tag moves.
