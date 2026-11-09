---
title: CLI & coding standards
description: bin/spora commands, Pest + Vitest + PHPStan, code comment policy, and the project's hard development rules.
---

# CLI & coding standards

The `bin/spora` CLI, the test framework, and the project's hard development rules — all in one place. Drawn from `spora-core/AGENTS.md` and the [Code documentation](/reference/concepts/code-documentation) policy.

## `bin/spora` commands

`bin/spora` is the runtime CLI entry point. Every operational task — install, plugin management, database ops, worker control — is a subcommand. To see the full list:

```bash
php bin/spora list
```

The most-used commands:

| Command                              | Purpose                                                                                                                                                                                                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `spora:install`                      | Initial setup (idempotent migrations). Re-run after any new migration ships.                                                                                                                                                                                                                                       |
| `spora:setup`                        | Run migrations and seed a fresh database. Existing installs are skipped — use `db:seed` or `db:repair-admin` for repairs. Used by the Docker entrypoint.                                                                                                                                                           |
| `db:reset`                           | Wipe the database (SQLite file or MySQL DROP+CREATE) and clear the schema stamp. Prompts unless `--force`.                                                                                                                                                                                                         |
| `db:seed`                            | Run the bootstrap seeder on an existing install. Inserts the admin + sample agent if missing (insert-only) and reconciles mail templates against `email-templates/` (insert missing YAMLs, preserve drifted). Takes no options — the reconcile is non-destructive, and `--force` belongs to `mail:templates:sync`. |
| `db:repair-admin [email]`            | Promote an existing admin to `verified=1` + `Role::ADMIN` + `status=1`. Idempotent, refuses to create a missing row.                                                                                                                                                                                               |
| `plugin:install <package>`           | Install a plugin from Packagist. Accepts `--path` for sibling-clone dev workflows.                                                                                                                                                                                                                                 |
| `plugin:uninstall <package>`         | Remove a plugin.                                                                                                                                                                                                                                                                                                   |
| `plugin:update [<package>]`          | Update one plugin, or all when no argument is given.                                                                                                                                                                                                                                                               |
| `plugin:list`                        | List installed plugins with version and path.                                                                                                                                                                                                                                                                      |
| `worker:run`                         | Run async worker. Default = daemon; `--once` for scheduled runs only; `--once --include-queue` for the full cron pass; `--reap-only` for orphan reaping.                                                                                                                                                           |
| `worker:run --reap-only`             | Reap orphaned `RUNNING` tasks (no queue work).                                                                                                                                                                                                                                                                     |
| `task:run`                           | Run a single task synchronously (debugging).                                                                                                                                                                                                                                                                       |
| `media:list` / `media:gc`            | List archived media assets; delete `media_assets` rows whose on-disk file is missing, or `--temporary` rows older than `--older-than-hours`. Not registered in `bin/spora` yet — see the note below.                                                                                                               |
| `assets:gc`                          | Delete every file in `<storage>/assets/` whose modification time is older than `--max-age-days` (default 7). No reference check. Not registered in `bin/spora` yet.                                                                                                                                                |
| `tool-settings:migrate-encryption`   | One-shot tool settings migration (if you upgrade across a settings-schema change).                                                                                                                                                                                                                                 |
| `spora:openapi [--output] [--check]` | Generate / drift-check the OpenAPI 3.0 spec from `RouteDefinitions`. Dev-only — gated on `zircote/swagger-php`.                                                                                                                                                                                                    |
| `spora:audit-operation-overrides`    | Read-only report of `agent_tool_operation_overrides` / `agent_tools` rows whose `tool_class` no longer resolves. No options; exits 1 when orphans are found.                                                                                                                                                       |

The `spora:` prefix on the install/setup/openapi commands is convention, not an alias — `spora:install`, `spora:setup`, `spora:openapi` and `spora:audit-operation-overrides` are registered under it. The plugin namespace is unprefixed: `plugin:install`, not `spora:plugin:install`. The prefixed plugin names existed in an early 0.x release and were renamed; they are not registered today, so `php bin/spora spora:plugin:install …` fails with `There are no commands defined in the "spora:plugin" namespace.` Run `php bin/spora list` to see the names this build actually registers.

`media:list`, `media:gc` and `assets:gc` are the exception to "what `bin/spora list` shows": the classes exist and are container-bound, but the console application never registers them, so the commands do not run yet.

## `bin/spora-build` — build-time CLI

`bin/spora-build` is the build-time companion to `bin/spora`. It deliberately skips the Kernel / DI / `storage/secret.key` boot because downstream tooling (CI, sibling-repo docs builds) checks out spora-core into a sibling directory and runs this binary without an installed app. New commands land under `app/Build/`; today the binary ships the two OpenAPI commands and the two translation-catalogue commands:

```bash
php bin/spora-build list                                # show commands
php bin/spora-build openapi:generate [output]           # emit openapi.json
composer openapi                                        # alias for openapi:generate
php bin/spora-build openapi:check [reference]           # exit non-zero on drift
php bin/spora-build i18n:extract                        # regenerate locales/en.json
php bin/spora-build i18n:check                          # fail on a stale catalogue
```

Why a second binary at all? Because `bin/spora` would refuse to boot without `storage/secret.key`, the DI container, and the database — and build-time tools can't have any of those. Keeping the two binaries separate makes the runtime / build-time boundary explicit; the full rationale lives in `spora-core/AGENTS.md` → "CLI Entry Points".

## Testing

### Backend — Pest

```bash
composer test                # All tests
composer test:coverage     # With coverage (Xdebug or pcov)
./vendor/bin/pest --filter="pattern"   # Filter by test name
```

Pest configuration lives in `tests/Pest.php`. The test structure:

```text
tests/
├── Pest.php            # Pest bootstrap + shared helpers
├── Unit/               # Unit tests (mirrors app/ subpackages)
├── Feature/            # HTTP/controller integration tests
├── Fixtures/           # Test fixtures (plugins, sample data)
├── Support/            # Shared helpers (fake producers, temp directories)
└── Concerns/           # Reusable Pest concerns
```

**No mocks for integration tests** that already boot the DB via `beforeEach`. Use the in-memory SQLite database factory (`tests/Support/TestDatabaseFactory.php`) or boot `Database::bootDatabaseConnectionOnly()` in `beforeEach`. This is enforced at code review.

**Cover the happy path, one failure path, and one credential-missing path per tool.** That's the minimum.

### Frontend — Vitest

The Vue app lives in the separate [`spora-frontend`](https://github.com/spora-ai/spora-frontend) repository — `spora-core` dropped its own `frontend/` tree. Clone it and run its tests there:

```bash
git clone https://github.com/spora-ai/spora-frontend.git
cd /path/to/spora-frontend
npm test                    # All unit tests
npm run test:watch          # Watch mode
```

Test structure:

```text
tests/
├── api/                # HTTP client tests
├── apps/               # App-shell tests
├── components/         # Vue component tests
│   ├── agent/
│   └── layout/
├── composables/        # useFoo() composable tests
├── pages/              # Page-level tests
├── stores/             # Pinia store tests
├── utils/              # Pure utility tests
├── a11y/               # Accessibility tests
├── fixtures/           # Test data
├── helpers/            # Shared test helpers
├── integration/        # Multi-module integration tests
├── lib/                # Plain library tests
├── router/             # Router tests
├── scripts/            # Build-script tests
├── vite/               # Vite plugin tests
├── workers/            # Web-worker tests
└── setup.ts            # Vitest global setup (mocks browser APIs)
```

E2E tests are **not currently wired up** — no Playwright dep, no `tests/e2e/` directory.

### CI

`spora-core`'s CI runs `composer test:parallel` on every push to `main` and on PRs, plus PHPStan, php-cs-fixer, an OpenAPI drift check, a translation-catalogue check and SonarCloud. The frontend's ESLint, Vitest and `vue-tsc` run in `spora-frontend`'s own CI, not here.

## Static analysis — PHPStan

```bash
composer analyse         # PHPStan (level 5, with Larastan + Mockery extensions)
cd /path/to/spora-frontend && npm run lint   # ESLint (flat config); vue-tsc runs in npm run build
```

PHPStan configuration lives in `phpstan.neon`. Level 5 checks the types of the arguments passed to methods and functions, and catches:

- Type mismatches
- Undefined methods
- Mockery annotation mismatches

Unused **constructor** parameters are reported at any level; missing typehints on methods are level 6.

## Hard development rules

From `spora-core/AGENTS.md`. Adopted as the project's invariants:

- **`declare(strict_types=1);`** at the top of every PHP file.
- **`final`** on all classes unless inheritance is required.
- **No DB calls in constructors** — boot explicitly via `Database::bootDatabaseConnectionOnly()`.
- **No mocks for integration tests** that already boot the DB via `beforeEach`.
- **Don't add error handling, fallbacks, or abstractions** beyond what the task requires.
- **Never commit or push directly to `main`.** Every change goes through a feature branch and a pull request. Branch naming: `<scope>/<phase-or-feature>` (e.g. `coverage/phase-1.4-orchestrator-and-controllers`, `feat/tool-authooring-dx`, `fix/logout`). Local `main` may be fast-forwarded via `git pull --ff-only` but never receives a direct push.

For the full PR flow, see the [Contribute](/contribute/) section.

## Code comment policy

Drawn from the [Code documentation](/reference/concepts/code-documentation) policy. Three principles:

1. **Clarity over ceremony** — comments make code _easier_ to understand. Decorative comments hinder more than help.
2. **Token efficiency** — every comment burns tokens during AI processing. Make each word count.
3. **Focus on why, not what** — comments serve other developers (and AI agents). The code already shows what it does; comments explain why.

### DELETE — visual noise

```php
// ── Section Name ──────────────────────────────────────────────────────────────
```

```php
// -------------------------------------------------------------------------
// Private helpers
// -------------------------------------------------------------------------
```

These patterns add no information. The code structure (classes, methods) provides all the organization needed.

```php
// Get the user  ← DELETE - the code does this already
$user = $this->userService->find($id);
```

```php
// Check if user is admin  ← DELETE - obvious from the condition
if ($user->isAdmin()) {
```

### KEEP — information value

Security rationale (the _why_ prevents future devs from weakening protections):

```php
// The scheme allowlist stops file://, ftp:// and gopher:// — it does
// not stop an http:// URL pointing at a private address. That screen
// is a separate layer, in SsrfGuard, and applies to every operation.
$scheme = strtolower(parse_url($url, PHP_URL_SCHEME) ?? '');
```

Non-obvious algorithms:

```php
// Per-agent ceiling on temp media rows. Migration 0081
// backfills every pre-existing agent to the schema's default
// (`5`); new agents get the explicit body value when supplied,
// falling back to `5` to match the column default so the
// "voice recordings auto-purge after 5" mental model holds
// out of the box.
'voice_message_retention_count' => (int) ($allowed['voice_message_retention_count'] ?? 5),
```

Cross-cutting concerns:

```php
/**
 * Singleton. Registered via PHP-DI factory.
 * Holds the master key in memory: the constructor takes the raw key, and
 * {@see self::fromKeyFile()} is the one that reads a key file. An invalid
 * key fails immediately.
 */
final class SecurityManager implements SecurityManagerInterface
```

### ADD — missing documentation

PHP attributes (every attribute in `app/Tools/Attributes/` needs a docblock with a usage example):

```php
/**
 * Marks a class as a Tool the agent can invoke.
 *
 * Usage:
 *   #[Tool(
 *       name: 'my_tool',
 *       description: 'Does something useful',
 *       displayName: 'My Tool',         // optional — operator-facing UI label
 *       category: 'general',             // optional; defaults to 'general'
 *       icon: 'puzzle',                  // optional; bundled icon key
 *       recommendsSkills: ['git'],       // optional; slugs the tool bundles
 *   )]
 *   final class MyTool implements ToolInterface { ... }
 */
#[Attribute(Attribute::TARGET_CLASS)]
final class Tool { ... }
```

Module-level JSDoc for Vue stores and composables:

```typescript
/**
 * Manages authentication: session init, login, logout, registration,
 * password/email changes, and CSRF token handling.
 */
export const useAuthStore = defineStore('auth', () => { ... });
```

## Quick decision tree

1. **Can the code express this?** If yes, refactor the code instead.
2. **Does this explain why, not what?** If yes, keep it.
3. **Will a developer (or AI) be confused without this?** If yes, keep or add it.
4. **Is this purely decorative or redundant?** If yes, delete it.

## What's next

- [Local setup](/start/developers/local-setup) — install, dev server, tests
- [Project structure](/start/developers/project-structure) — where things live
- [How to add a tool](/start/developers/how-to-add-a-tool) — a worked example
- [Contribute](/contribute/) — the PR flow, SonarQube, releases
