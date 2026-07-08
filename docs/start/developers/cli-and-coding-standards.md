---
title: CLI & coding standards
description: bin/spora commands, Pest + Vitest + PHPStan, code comment policy, and the project's hard development rules.
---

# CLI & coding standards

The `bin/spora` CLI, the test framework, and the project's hard development rules — all in one place. Drawn from `spora-core/AGENTS.md` and `spora-core/docs/{14,16}_*.md`.

## `bin/spora` commands

`bin/spora` is the single CLI entry point. Every operational task — install, plugin management, database ops, worker control — is a subcommand. To see the full list:

```bash
php bin/spora list
```

The most-used commands:

| Command                                   | Purpose                                                                                                         |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `spora:install`                           | Initial setup (idempotent migrations). Re-run after any new migration ships.                                    |
| `spora:setup`                             | Run migrations and seed a fresh database (or skip seeding on existing installs). Used by the Docker entrypoint. |
| `db:reset`                                | Wipe the database (SQLite file or MySQL DROP+CREATE) and clear the schema stamp. Prompts unless `--force`.      |
| `db:seed`                                 | Seed database with sample data (idempotent — skips if users/agents exist).                                      |
| `plugin:install <package>`                | Install a plugin from Packagist. Accepts `--path` for sibling-clone dev workflows.                              |
| `plugin:uninstall <package>`              | Remove a plugin.                                                                                                |
| `plugin:update [<package>]`               | Update one plugin, or all when no argument is given.                                                            |
| `plugin:list`                             | List installed plugins with version and path.                                                                   |
| `worker:run`                              | Run async worker. Default = daemon; `--once` for cron; `--once --include-queue` for full cron.                  |
| `worker:run --scheduled`                  | Run only scheduled tasks.                                                                                       |
| `worker:run --reap-only`                  | Reap orphaned `RUNNING` tasks (no queue work).                                                                  |
| `task:run`                                | Run a single task synchronously (debugging).                                                                    |
| `media:archive:list` / `media:archive:gc` | List / garbage-collect archived media.                                                                          |
| `assets:gc`                               | Garbage-collect unreferenced assets.                                                                            |
| `tool:settings:migrate`                   | One-shot tool settings migration (if you upgrade across a settings-schema change).                              |

The `spora:` prefix on the install/setup commands is convention — the plugin namespace is unprefixed (`plugin:install` not `spora:plugin:install`). Older docs sometimes use the prefixed form; both work in current versions.

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
└── Fixtures/           # Test fixtures (plugins, sample data)
```

**No mocks for integration tests** that already boot the DB via `beforeEach`. Use the in-memory SQLite database fixture (`tests/Fixtures/inmemory-sqlite.php`) or boot `Database::bootDatabaseConnectionOnly()` in `beforeEach`. This is enforced at code review.

**Cover the happy path, one failure path, and one credential-missing path per tool.** That's the minimum.

### Frontend — Vitest

```bash
cd frontend
npm test                    # All unit tests
npm run test:watch          # Watch mode
```

Test structure:

```text
frontend/tests/
├── api/                # HTTP client tests
├── apps/               # App-shell tests
├── components/         # Vue component tests
│   ├── agent/
│   └── layout/
├── composables/        # useFoo() composable tests
├── pages/              # Page-level tests
├── stores/             # Pinia store tests
├── unit/               # Misc isolated unit tests
├── utils/              # Pure utility tests
└── setup.ts            # Vitest global setup (mocks browser APIs)
```

E2E tests are **not currently wired up** — no Playwright dep, no `frontend/tests/e2e/` directory.

### CI

`composer test && composer frontend:test` runs on every push to `main` and on PRs. The CI also runs PHPStan, ESLint, and Vue type-check.

## Static analysis — PHPStan

```bash
composer analyse         # PHPStan (level 5, with Larastan + Mockery extensions)
cd frontend && npm run lint   # ESLint (flat config) + vue-tsc
```

PHPStan configuration lives in `phpstan.neon`. Level 5 catches:

- Type mismatches
- Unused parameters
- Undefined methods
- Missing return types
- Mockery annotation mismatches

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

Drawn from `spora-core/docs/14_code_documentation.md`. Three principles:

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
// #1 SSRF guard: allowlist only http/https — blocks file://, ftp://, gopher://,
// cloud metadata endpoints (http://169.254.169.254), etc.
$scheme = strtolower(parse_url($url, PHP_URL_SCHEME) ?? '');
```

Non-obvious algorithms:

```php
// Seed schema defaults if no global config AND no agent override exists
$globalSettings = $this->toolConfig->getGlobalSettings($toolClass);
```

Cross-cutting concerns:

```php
/**
 * Singleton. Registered via PHP-DI factory.
 * Loads master key once at construction. Fails immediately if key is invalid.
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
 *   #[Tool(name: 'my_tool', description: 'Does something useful')]
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
