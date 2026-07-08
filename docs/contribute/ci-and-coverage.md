---
title: CI and coverage
description: The CI pipeline, SonarQube integration, per-PR coverage gate, and how to debug a red build.
---

# CI and coverage

The Spora project runs CI on every push to `main`, on `v*` tags, and on every pull request. This page covers the pipeline, the SonarQube integration, and the per-PR coverage gate.

For the PR workflow itself, see [PR workflow](/contribute/pr-workflow). For the local command equivalents, see [Developers → CLI & coding standards](/start/developers/cli-and-coding-standards).

## The pipeline

GitHub Actions runs the following jobs on every PR and push to `main`:

| Job             | Tool             | What it does                                                                  |
| --------------- | ---------------- | ----------------------------------------------------------------------------- |
| `php-lint`      | PHPStan          | Static analysis on `spora-core` (level 5, with Larastan + Mockery extensions) |
| `php-test`      | Pest             | Backend test suite (PHP 8.4, 8.5)                                             |
| `frontend-lint` | ESLint + vue-tsc | TypeScript type-check + ESLint flat config                                    |
| `frontend-test` | Vitest           | Frontend unit tests (Vue 3, Pinia, composables)                               |
| `build-docker`  | Docker buildx    | Builds the multi-stage image from `docker/Dockerfile`                         |
| `coverage`      | Pest + pcov      | Backend coverage with pcov (replaces Xdebug for CI speed)                     |
| `sonar`         | SonarCloud       | Uploads coverage + ESLint + PHPStan to SonarCloud for the `new_coverage` gate |

PRs require all jobs to be green. A red build blocks merge.

The pipeline lives at `.github/workflows/ci.yml` in each repo (spora-core, spora, spora-frontend, plugins). External actions are pinned to full 40-character commit SHAs with `# vX.Y.Z` comments per the project's supply-chain policy.

## Per-PR coverage gate

SonarQube tracks coverage per PR. The `new_coverage` quality gate requires **80% on the new code in the PR** (not 80% of the whole repo — that would make every PR a fight against pre-existing uncovered code).

How the gate works:

1. PR opens → SonarQube scans the diff between the PR's branch and `main`
2. New files / changed lines are tracked as "new code"
3. The `new_coverage` metric is the percentage of those new lines covered by tests
4. Gate fails if `new_coverage < 80%`
5. The PR's CI check turns red, blocking merge

Legacy untouched files are excluded from the gate — you don't need to fix coverage on files you didn't touch.

The 80% threshold is the project's floor, not the ceiling. For new business logic, target 90%+.

## Reading the SonarQube report

SonarQube publishes the report to the PR's "Files changed" tab as comments. Each file shows:

- **Lines added** — new code in the PR
- **Coverage on new code** — % of those lines covered by tests
- **Uncovered lines** — exact line numbers that aren't hit by any test

For a quick fix when coverage drops, open the SonarQube project dashboard and look at the file's coverage report. Common causes:

- New public method not called by any test → write a unit test
- New branch in an existing method → add a test that exercises the new branch
- New error path → add a test that triggers the error

## Debugging a red CI build

Most CI failures fall into a few categories. Here's the diagnostic order:

### 1. Format / lint

```bash
# Backend (PHP)
composer format
composer analyse

# Frontend (JS / Vue)
cd frontend
npm run lint
npm run format
```

If your local run passes but CI fails, check that you ran the right tool — Prettier and PHP-CS-Fixer have non-overlapping rule sets.

### 2. Tests

```bash
# Backend
composer test                # All
./vendor/bin/pest --filter="MyTest"   # One at a time

# Frontend
cd frontend
npm test                     # All
npm run test:watch           # One at a time
```

If a test fails locally with the same error, fix the test. If it fails only in CI, check the GitHub Actions log for environment differences (Node version, PHP version, missing env vars).

### 3. Build

```bash
composer build               # All VuePress build
```

Build failures are usually TypeScript errors in the Vue app or missing `package-lock.json` entries.

### 4. Coverage

If coverage dropped below 80%, SonarQube's PR comment shows the uncovered lines. Write the missing test, re-push.

## CI environment

CI runs on `ubuntu-latest` with:

- **PHP** 8.4 (the project's minimum)
- **Node.js** 20 (matches the skeleton's `package.json` engines field)
- **Composer** 2.x
- **Xdebug** disabled by default (Pest uses `pcov` for speed on CI)

For local parity, match these versions. If your local is ahead (e.g. PHP 8.5), tests may pass locally but fail on the CI matrix that runs 8.4.

## Common CI patterns

**For docs-only changes**, the pipeline runs `npm run build` and the lint. No PHP tests are affected. As long as `npm run build` passes locally, the PR will pass.

**For plugin changes**, the plugin's own CI runs. Plugin repos have a smaller pipeline (Pest + PHPStan + php-cs-fixer + coverage) and don't build a Docker image.

**For spora-core changes**, the full pipeline runs including Docker image build and SonarCloud scan. This is the slowest PR (3-5 minutes).

## What's next

- [PR workflow](/contribute/pr-workflow) — the local end of the pipeline
- [Author guide](/develop/plugins/author-guide) — for plugin-specific contribution
- [Contribute → index](/contribute/) — back to the overview
