# CI/CD Pipeline

**Status:** 🔴 Proposed — no CI exists today; this is a gap analysis and a starting proposal, not a description of something built.
**Depends on:** test-strategy.md

## 1. Current state: none

No `.github/workflows/`, no `.gitlab-ci.yml`, no other CI config was found anywhere in this repo. Deployment is manual, per `docs/CLOUD_DEPLOY_DO*.md` — SSH to the droplet, pull, restart the systemd service. Tests (`npm test`/`npm run green`) are run by hand, presumably by whoever is making a change, with no enforcement that they were actually run before a commit or deploy.

## 2. What this means practically

There is no automated gate preventing a syntax error, a failing test, or a broken EJS template from reaching `main` or the production droplet. This session's own discipline (manual `node -c` syntax checks, manual `ejs.compile()` checks, manual live-browser verification before considering a fix "done") is a **substitute** for CI, not equivalent to it — it depends entirely on the person/session doing the work remembering to do it every time, which is exactly the kind of thing CI exists to make non-optional.

## 3. A minimal first CI pipeline (proposed, not built)

Given the existing `npm run green` command already exists specifically to run tests without a real MongoDB dependency, the lowest-effort real CI pipeline would be:

```yaml
# .github/workflows/test.yml (proposed — not created this session, left for the user to
# decide when/whether to add given the GitHub remote already exists)
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm install
      - run: npm run green
```

This alone (no deploy automation yet) would close the biggest gap: a red build on a PR before it merges. Deploy automation (SSH-and-restart, currently manual per the deploy docs) would be a deliberate follow-up decision, not bundled into this proposal — deploying to a shared production droplet automatically is a meaningfully bigger risk decision than running tests automatically, and should be a separate, explicit choice by the user.

## 4. Why this wasn't built this session

Creating and enabling a CI workflow changes the repository's operational behavior (GitHub Actions minutes, a required-check gate on PRs) in a way that affects the user and any collaborators — this falls under "ask before consequential, shared-state changes" rather than something to do unprompted alongside a documentation and bug-fix pass. Flagged here as the concrete next step if the user wants it.
