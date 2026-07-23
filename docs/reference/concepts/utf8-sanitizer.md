---
title: UTF-8 sanitizer
description: Centralized utility that coerces user-supplied and tool-generated strings to valid UTF-8 before they reach the database. Used by core and exposed to plugins.
---

# UTF-8 Sanitizer

`Spora\Services\Text\Utf8Sanitizer` is a stateless utility that repairs
non-UTF-8 byte sequences in user-supplied or upstream-supplied text. Every
write path in `spora-core` that lands a string in a TEXT column runs the
incoming value through this utility first, so the bytes that end up on disk
are always valid UTF-8 and any subsequent `JsonResponse` can serialize the
row without throwing.

## The problem

The connection default is `utf8mb4` / `utf8mb4_unicode_ci` (see
[`Spora\Core\Database`](https://github.com/spora-ai/spora-core/blob/main/app/Core/Database.php)),
but that only governs *new* bytes. A row that was written before the column
was utf8mb4, or that arrived through a code path that dropped raw bytes
without validating them, can still contain stray `0x80` / `0xC0` / Latin-1
sequences.

The first symptom is a 500 from the HTTP layer:

```text
Invalid value for "json" option: Malformed UTF-8 characters, possibly incorrectly encoded
```

The exception originates in `vendor/symfony/http-foundation/JsonResponse.php`
when `json_encode` returns `false` with `JSON_ERROR_UTF8`. It happens long
after the row was persisted — every controller that returns the corrupt
row as JSON will trip the same wire.

**Why:** Closing the gap at the write site means there is exactly one place
to audit ("does this code path call `Utf8Sanitizer::scrubString`?"), instead
of trying to scrub at every JSON serialization point across the admin UI.

## The utility

```php
namespace Spora\Services\Text;

final class Utf8Sanitizer
{
    public static function scrub(mixed $value): mixed;
    public static function scrubString(string $value): string;
    public static function isValid(string $value): bool;
}
```

- `scrubString(string)` — returns valid UTF-8, salvaging Windows-1252 /
  ISO-8859-1 bytes, dropping anything unrecognisable via `iconv //IGNORE`.
- `scrub(mixed)` — dispatches on type: strings get scrubbed, arrays get
  recursed, everything else passes through. Use this when the shape of the
  value isn't known at compile time (request bodies, Eloquent
  `->fill([...])` payloads).
- `isValid(string)` — cheap, allocation-free check for callers that want to
  gate on UTF-8 without mutating.

## What the algorithm does

Three-step escalation, short-circuiting at the first success:

1. **`mb_check_encoding($value, 'UTF-8')`** — passes valid UTF-8 through
   unchanged. This is the hot path; every tool result that flows through
   the orchestrator is already valid UTF-8 and exits here in ~0.5 µs.
2. **`mb_convert_encoding($value, 'UTF-8', $encoding)`** — salvage via
   Windows-1252 (covers smart quotes, em-dashes, the Euro sign in the
   0x80–0x9F range) then ISO-8859-1 as the universal fallback. Most
   legacy Latin-1 strings exit here.
3. **`iconv('UTF-8', 'UTF-8//IGNORE', $value)`** — last resort. Drops
   every byte that isn't part of a valid UTF-8 sequence, preserving
   surrounding ASCII.

**Why:** The combined salvage + drop approach is the textbook recipe for
mixed-encoding input. Windows-1252 first because it covers 0x80–0x9F (smart
quotes, em-dashes, the Euro sign) that ISO-8859-1 leaves as control
characters. Then ISO-8859-1 as the universal fallback. `iconv //IGNORE`
handles the rare case where neither encoding matches.

## For plugin authors

If your plugin writes through a spora-core service — for example
`MediaArchiveService::ingest`, `ToolCallExecutor`'s wrapped
`executeAndRecordResult`, or `ApprovedBatchExecutor` — the core service
already scrubs the inbound field. **You don't need to opt in.** Add the
wrap yourself only if you write Eloquent directly to a TEXT column with
no spora-core wrapper in front of it (for example, the `memories` table
in `spora-plugin-memories` — see
[`MemoryService`](https://github.com/spora-ai/spora-plugin-memories/blob/main/src/Services/MemoryService.php)).

When you do need the utility, import it the same way you import any other
core class:

```php
use Spora\Services\Text\Utf8Sanitizer;

$content = Utf8Sanitizer::scrubString(
    (string) ($arguments['content'] ?? '')
);
```

For Eloquent `->fill([...])` payloads, use `scrub()` so nested arrays
recursively scrub every string leaf:

```php
$asset->fill(Utf8Sanitizer::scrub([
    'filename' => $request->filename,
    'tags'     => $request->tags,
    'metadata' => $request->metadata,
]));
```

PSR-4 import: the utility lives in
[`app/Services/Text/Utf8Sanitizer.php`](https://github.com/spora-ai/spora-core/blob/main/app/Services/Text/Utf8Sanitizer.php)
inside `spora-ai/spora-core`. Any plugin that already requires
`spora-core` gets the class for free — no `composer.json` change.

## Caveats

`Utf8Sanitizer` does **not**:

- Detect homograph attacks (visually-confusable characters from different
  scripts). That's a separate concern — see the URL allowlist.
- Repair mojibake (a string that was double-encoded UTF-8 → Latin-1 →
  UTF-8). The salvager interprets raw bytes as the *first* non-UTF-8
  encoding it recognises, never reverses a known re-encoding.
- Normalise Unicode (NFC / NFD / NFKC). A string like `café` written as
  the four code points `é` stays that way; the utility makes
  bytes valid UTF-8, it does not canonicalise.

**Why:** Each of these is a different problem with a different algorithm.
The scraper has one job — make bytes that don't break `json_encode` —
and stays out of the higher-level normalisation questions that belong in
their own utilities.

## See also

- [Code documentation](/reference/concepts/code-documentation) — comment
  policy for the wrapper sites themselves.
- [Media assets](/reference/concepts/media-assets) — where the wrapper
  applies on the `media_assets` table (`filename`, `prompt`,
  `markdown_content`, `tags`, `metadata`).
- [Tools](/reference/concepts/tools) — every `ToolResult::content` flows
  through `ToolCallExecutor::executeAndRecordResult`, which wraps the
  result before persisting.
