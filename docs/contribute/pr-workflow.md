---
title: PR workflow
description: Branches, commits, reviews, merge — the full Spora pull request workflow.
---

# PR workflow

Spora uses a PR-only flow. No direct commits to `main`. Every change goes through a feature branch, a pull request, and a review before merge.

This page covers the mechanics. The conceptual background is in [Contribute → index](/contribute/).

## Branching

**Branch naming:** `<scope>/<phase-or-feature>` (kebab-case, slash-separated)

| Pattern            | Example                                           | When                                    |
| ------------------ | ------------------------------------------------- | --------------------------------------- |
| `feat/<name>`      | `feat/tool-authooring-dx`                         | New feature or significant change       |
| `fix/<name>`       | `fix/logout`                                      | Bug fix or small correction             |
| `coverage/<phase>` | `coverage/phase-1.4-orchestrator-and-controllers` | Test-coverage work for a specific phase |
| `chore/<name>`     | `chore/spora-landing-brand-palette`               | Maintenance / non-functional change     |
| `docs/<name>`      | `docs/ia-restructure`                             | Docs-only change                        |
| `refactor/<name>`  | `refactor/ia-restructure`                         | Restructuring without behaviour change  |

Use one branch per logical change. If a PR is doing two unrelated things, split it.

## Local workflow

```bash
# Sync to latest main
git checkout main
git pull --ff-only

# Branch off
git checkout -b feat/my-change

# Edit, test, commit
$EDITOR file.php
./vendor/bin/pest --filter="MyTest"
git add file.php
git commit -m "feat: short imperative summary

Longer body explaining the why. Reference the issue number with
\`Fixes #123\` or \`Closes #456\` if it closes one."

# Push
git push -u origin feat/my-change
```

Keep commits small and focused. One logical change per commit. Imperative mood in the subject line ("add X", not "added X"). No "Co-Authored-By: Claude" trailer — the project follows the contributor identity alone (per the spora-core CLAUDE.md).

## Commit messages

```text
short imperative subject (max ~72 chars)

longer body explaining the why (wrap at ~72 chars per line)
- bullet for one reason
- bullet for another

Fixes #123
Closes #456
```

The subject is what shows up in `git log --oneline` and the merge commit. The body is what a reviewer reads to understand the change. The "why" matters more than the "what" — the diff shows the what.

## Pull request

Open a PR from your branch into `main`. The PR title is the change summary (the merge commit subject will follow this). The body should have:

1. **What** — what does this PR do
2. **Why** — what problem does it solve, or what does it enable
3. **How** — short technical summary if the change is non-trivial
4. **Testing** — how you verified the change works
5. **Risk** — anything reviewers should pay extra attention to

For docs changes, the format is simpler — what changed, why, and a link to the affected page in the rendered site.

## CI

Every PR runs through the project's CI:

- **Build** — the project compiles, the test suite runs, the Docker image builds
- **Lint** — PHPStan + ESLint + Prettier
- **Tests** — Pest (backend) + Vitest (frontend)
- **Coverage** — tracked per-PR via SonarQube's `new_coverage` metric

A PR cannot be merged unless CI is green on the latest commit. See [CI and coverage](/contribute/ci-and-coverage) for the full pipeline.

## Review

At least one approving review is required before merge. The project uses GitHub's "Require 1 approval" branch protection rule on `main`.

The reviewer checks:

- **Does it do what the PR description says?**
- **Is the code style consistent** — PHP-CS-Fixer, ESLint, Prettier all run in CI
- **Are the tests adequate?** — at minimum, the happy path + one failure path for new logic
- **Does it follow the project's hard rules?** — `declare(strict_types=1);`, `final` classes, no DB calls in constructors, etc.
- **Is the commit message clear and explains the "why"?**

A reviewer can request changes by leaving a review with the "Request changes" status. The author addresses the feedback in new commits (force-push to the branch is fine, but only on the feature branch — not on `main`).

## Merge

When CI is green and at least one review approves, the PR is merged. The project uses squash-merge by default — the PR's commits are squashed into a single commit on `main` with the PR title as the commit subject. The PR's body becomes the commit body.

To merge:

1. The author clicks "Squash and merge" (or a maintainer with write access does)
2. The merge commit lands on `main`
3. The CI pipeline re-runs on the merge commit (deployment gate)

**No direct pushes to `main`**, even with admin access. The PR flow is the only path to `main`. Local `main` may be fast-forwarded via `git pull --ff-only` but never receives a direct push. This is enforced at the branch-protection level.

## Versioning and tags

Pre-1.0, Spora uses `0.x.y` semver-ish tags. Breaking changes can land in minor bumps. The plan is to lock to strict SemVer once 1.0 ships.

Tags are created **only from `main`, only after CI is green, only on a merge commit** — never from a PR branch. The tag is created immediately after the merge, then a GitHub Release is published so Packagist picks up the version.

For the framework (spora-core) and the skeleton (spora), the tag format is `vX.Y.Z`. For the docs site (spora-docs), tags follow the same format but are not Packagist-published (the docs site has no Composer package).

## Commit hygiene

A few things to avoid:

- **Squash before merging** — the squash happens at merge time, not before. Don't squash your own branch.
- **Don't rewrite history on shared branches** — `git rebase` is fine on your own feature branch; don't rebase a branch others are working on.
- **Don't merge `main` into your feature branch repeatedly** — `git rebase origin/main` is cleaner.
- **One concern per PR** — if your branch touches the LLM driver AND adds a plugin, split it.

## Common pitfalls

- **CI failing on a doc-only PR** — make sure the docs source isn't using unrendered Vue/React components that would break the build. `npm run build` locally before pushing.
- **Coverage dropped** — the new code path isn't tested. Add a test or exclude it with a `@codeCoverageIgnoreStart` annotation (rare).
- **Lint errors** — run `composer format` and `npm run format` before pushing. Most CI failures on first push are formatting.
- **Merge conflicts** — `git rebase origin/main` to replay your changes on top of the latest main, resolve any conflicts, force-push.

## What's next

- [CI and coverage](/contribute/ci-and-coverage) — the pipeline and the SonarQube integration
- [Author guide](/develop/plugins/author-guide) — for plugin contributions (different scope)
- [Contribute → index](/contribute/) — back to the overview
