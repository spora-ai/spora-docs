---
title: Code documentation
description: Comment policy — what to delete, keep, and add (docblocks). Token-efficient comments that explain why.
---

# Code Documentation

Guidelines for writing meaningful comments that add value without adding noise.

## Principles

**1. Clarity over ceremony** — Comments should make code _easier_ to understand. Decorative comments hinder more than help.

**2. Token efficiency** — Every comment burns tokens during AI processing. Make each word count.

**3. Focus on _why_, not _what_** — Comments serve other developers (and AI agents). The code already shows what it does; comments explain why.

**4. Self-documenting code first** — Well-named variables, functions, and classes reduce the need for comments.

## Delete — Visual Noise

These patterns add no information and should be removed:

### Visual Separators

```php
// ── Section Name ──────────────────────────────────────────────────────────────
```

```php
// -------------------------------------------------------------------------
// Private helpers
// -------------------------------------------------------------------------
```

```php
// ======== Section ========
```

**Why:** The code structure (classes, methods) provides all the organization needed. These dividers are redundant.

### Noise Comments

```php
// Get the user  ← DELETE - the code does this already
$user = $this->userService->find($id);

// Check if user is admin  ← DELETE - obvious from the condition
if ($user->isAdmin()) {
```

## Keep — Information Value

These patterns provide genuine value:

### Security Rationale

```php
// The scheme allowlist stops file://, ftp:// and gopher:// — it does
// not stop an http:// URL pointing at a private address. That screen
// is a separate layer, in SsrfGuard, and applies to every operation.
$scheme = strtolower(parse_url($url, PHP_URL_SCHEME) ?? '');
```

_(from `app/Tools/ReadUrlTool.php`)_

```php
/**
 * Reserved IPv4 space, as network/prefix pairs: RFC1918, loopback,
 * link-local, carrier-grade NAT, `192.0.0.0/24`, benchmarking
 * (`198.18.0.0/15`), multicast and `240.0.0.0/4`.
 *
 * Whole ranges, not text prefixes: `100.65.0.0` is inside the
 * carrier-grade NAT block and `198.19.0.0` is inside the benchmarking
 * block, and a prefix would have let both through.
 *
 * Not exhaustive — the documentation ranges (`192.0.2.0/24`,
 * `198.51.100.0/24`, `203.0.113.0/24`) are not listed.
 *
 * Every address here is a reserved-network constant the guard exists
 * to refuse, so a hardcoded-address finding on one of them says
 * nothing: they are the deny list, not a host the deployment talks
 * to.
 *
 * @var list<array{0: string, 1: int}>
 */
```

_(from `app/Services/SsrfGuard.php`)_

```php
// `SsrfGuard` screened the URL as supplied and pinned the
// address it vetted; following a redirect would re-issue the
// POST to a host that was never screened — a `302` to the
// cloud metadata endpoint turns the guard into a comment. A
// 3xx falls through to `recordFailure()` and is retried,
// which is the right answer for a receiver that has no reason
// to redirect.
'max_redirects' => 0,
```

_(from `app/Services/ApiKeys/ApiKeyCallbackDispatcher.php`)_

**Why:** Security decisions often look arbitrary without context. The _why_ prevents future developers from accidentally weakening protections.

> **A comment must not over-claim.** The scheme allowlist and the private-range screen are two separate checks: `http://169.254.169.254` passes the allowlist. A comment that credits the allowlist with blocking the metadata endpoint tells the next reader that a layer they cannot see is covered — which is how one of them quietly gets weakened.

### Complex Business Logic

```php
// Per-agent ceiling on temp media rows. Migration 0081
// backfills every pre-existing agent to the schema's default
// (`5`); new agents get the explicit body value when supplied,
// falling back to `5` to match the column default so the
// "voice recordings auto-purge after 5" mental model holds
// out of the box.
'voice_message_retention_count' => (int) ($allowed['voice_message_retention_count'] ?? 5),
```

_(from `app/Services/AgentService.php`)_

**Why:** Non-obvious algorithms or business rules need explanation.

### API Contracts

```php
/**
 * Send a chat completion request to the LLM and return the normalized response.
 * Intentionally synchronous — async behaviour is managed at the Messenger layer.
 *
 * @throws Exceptions\LLMProviderException   Non-recoverable API error.
 * @throws Exceptions\LLMRateLimitException  HTTP 429; caller should back off.
 */
public function complete(LLMRequest $request): LLMResponse;
```

_(from `app/Drivers/LLMDriverInterface.php`)_

**Why:** Interface contracts may not convey runtime behavior.

### Cross-cutting Concerns

```php
/**
 * Singleton. Registered via PHP-DI factory.
 * Holds the master key in memory: the constructor takes the raw key, and
 * {@see self::fromKeyFile()} is the one that reads a key file. An invalid
 * key fails immediately.
 */
final class SecurityManager implements SecurityManagerInterface
```

_(from `app/Core/SecurityManager.php`)_

```php
/**
 * The ONLY class permitted to read or write tool_configurations.settings
 * and agent_tool_overrides.settings columns.
 *
 * The Eloquent models have a guard accessor that throws LogicException on direct
 * `settings` access — all reads/writes must funnel through this service.
 */
class ToolConfigService
```

_(from `app/Services/ToolConfigService.php`)_

**Why:** Architectural decisions and invariants that affect the entire codebase.

## Add — Missing Documentation

### Attributes (PHP)

All attributes in `app/Tools/Attributes/` should have docblocks with a usage example:

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

### Module-level Documentation (JS/Vue)

Stores and composables should have JSDoc:

```typescript
/**
 * Manages authentication: session init, login, logout, registration,
 * password/email changes, and CSRF token handling.
 */
export const useAuthStore = defineStore('auth', () => { ... });
```

_(from `frontend/src/stores/auth.ts`)_

## Quick Reference

| Situation                        | Action       |
| -------------------------------- | ------------ |
| Decorative `// ──` or `// -----` | DELETE       |
| Restates what code does          | DELETE       |
| Explains _why_ a guard exists    | KEEP         |
| Non-obvious algorithm            | KEEP         |
| Interface/trait purpose          | KEEP         |
| Attribute usage                  | ADD docblock |
| Store/composable purpose         | ADD JSDoc    |

### Decision Tree

1. **Can the code express this?** If yes, refactor the code instead.
2. **Does this explain _why_, not _what_?** If yes, keep it.
3. **Will a developer (or AI) be confused without this?** If yes, keep or add it.
4. **Is this purely decorative or redundant?** If yes, delete it.

## See Also

- [Martin Fowler: CodeAsDocumentation](https://martinfowler.com/bliki/CodeAsDocumentation.html)
- [Self-Documenting Code](https://anthonysciamanna.com/2014/04/05/self-documenting-code-and-meaningful-comments.html)
