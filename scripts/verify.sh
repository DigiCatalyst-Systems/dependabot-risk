#!/bin/sh
# The local gate, the same checks as .github/workflows/ci.yml. Run by
# .githooks/pre-push before every push that changes code, so a red run, or a
# dist/ that lags src/, is found on the laptop rather than on the pull request.
set -eu
npm run typecheck
npm test
npm run build
if ! git diff --quiet --exit-code dist/; then
  echo "dist/ is out of date. Commit the rebuilt dist/ and push again." >&2
  git diff --stat dist/
  exit 1
fi
