---
title: Calendar
description: CalDAV calendar read/write for Spora agents — iCloud, Fastmail, Nextcloud, Radicale, Baïkal, Google Calendar via CalDAV.
---

# Calendar Plugin for Spora

CalDAV calendar read/write for [Spora](https://github.com/spora-ai/Spora) agents — list upcoming events, fetch a single event by URI, and create, edit, or delete events on any RFC 4791-compliant CalDAV server (iCloud, Fastmail, Nextcloud, Radicale, Baïkal, Google Calendar via CalDAV, etc.). iCalendar (RFC 5545) payloads are built and parsed with [`craigk5n/php-icalendar-core`](https://packagist.org/packages/craigk5n/php-icalendar-core). CalDAV is a protocol, not a SaaS — any server speaking [RFC 4791](https://www.rfc-editor.org/rfc/rfc4791) (CalDAV) and [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545) (iCalendar) works.

## Installation

```bash
php bin/spora plugin:install spora-ai/spora-plugin-calendar
```

For local development against a sibling checkout, pass `--path=/abs/path/to/checkout`.

After install, the `calendar` tool is exposed. Operations are dispatched via the `action` parameter (see [Per-tool parameters](#per-tool-parameters)).

## Configuration

Settings → Tools → Calendar. The three required fields are the CalDAV collection URL, the username, and a password (most providers require an **app-specific password**, not your account password — see the vendor list below).

| Setting        | Required | Default | Notes                                                                                   |
| -------------- | -------- | ------- | --------------------------------------------------------------------------------------- |
| `url`          | yes      | —       | Full URL to a specific CalDAV calendar collection, e.g. `https://caldav.icloud.com/...` |
| `username`     | yes      | —       | CalDAV account username (often the account email)                                       |
| `password`     | yes      | —       | CalDAV password or app-specific token                                                   |
| `auth_method`  | no       | `auto`  | HTTP authentication scheme — see [Authentication](#authentication) below.               |
| `http_timeout` | no       | `30`    | Seconds before an HTTP request fails. Overrides `SPORA_TOOL_HTTP_TIMEOUT`               |

The `password` field is encrypted at rest by Spora's `ToolConfigService`, masked in the UI, and never logged. ETag handling follows [RFC 7232](https://www.rfc-editor.org/rfc/rfc7232) for safe updates.

## Authentication

The `auth_method` setting controls how the plugin authenticates to the CalDAV server. The default (`auto`) covers every supported deployment without operator configuration:

| Value    | Behaviour                                                                                                                                                                                          | When to pick                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `auto`   | Sends HTTP Basic preemptively. If the server returns a `401` with a `WWW-Authenticate: Digest …` challenge, the plugin recomputes the request with a Digest Authorization header and retries once. | Default. Works against Nextcloud, Baïkal, Radicale, iCloud, Fastmail, Google, **and** all-inkl / Cyrus / Kerio. |
| `basic`  | Sends Basic preemptively. Never retries. A Digest-only server returns `401` and the request surfaces as a credential error.                                                                        | Servers that explicitly forbid Digest (rare).                                                                   |
| `digest` | Sends no Authorization on the first request so the server can issue its Digest challenge; computes the response from the challenge and retries once.                                               | Pin to Digest for a known Digest-only server, e.g. debugging credential issues.                                 |

The Digest implementation follows [RFC 7616](https://www.rfc-editor.org/rfc/rfc7616) and supports `qop=auth` with MD5 (the variant all-inkl ships). All retries are bounded to a single attempt — a wrong-password response is reported as `HTTP 401` rather than silently looping.

## Per-tool parameters

The tool exposes a single `action` discriminator; each action takes the parameters below. String dates use ISO-8601 (`YYYY-MM-DDTHH:MM:SS[±HH:MM]`) — a bare `YYYY-MM-DD` is auto-expanded to `T00:00:00` for the start and `T23:59:59` for the end so a single-day range covers the full day without the server rejecting it. For all-day events, set `all_day=true` and pass `YYYY-MM-DD` as-is (the plugin emits `DTSTART;VALUE=DATE`).

Returns `ToolResult::ok` on success or `ToolResult::fail` on validation / HTTP failure — never throws.

| Action           | Description                                                      | Parameters                                                                                                                                                                                                                                                                                                                             |
| ---------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_calendars` | Discover sibling calendars at the configured URL via `PROPFIND`. | _(none — uses the configured `url`)_                                                                                                                                                                                                                                                                                                   |
| `list_events`    | Fetch events within a date range.                                | `start_date` (string, required), `end_date` (string, required)                                                                                                                                                                                                                                                                         |
| `get_event`      | Get one event by its CalDAV URI.                                 | `event_uri` (string, required)                                                                                                                                                                                                                                                                                                         |
| `create_event`   | Create a new event. Requires approval.                           | `summary` (string, required, max 255 chars), `start_date` (string, required), `end_date` (string, required), `description` (string, optional), `location` (string, optional), `timezone` (string, optional, IANA name like `Europe/Berlin`), `all_day` (bool, optional)                                                                |
| `edit_event`     | Edit an existing event. Requires approval.                       | `event_uri` (string, required), `etag` (string, optional — auto-fetched if omitted), `summary` (string, optional — falls back to existing), `start_date` (string, optional), `end_date` (string, optional), `description` (string, optional), `location` (string, optional), `timezone` (string, optional), `all_day` (bool, optional) |
| `delete_event`   | Delete an event. Requires approval.                              | `event_uri` (string, required), `etag` (string, optional — adds `If-Match` for safer deletion)                                                                                                                                                                                                                                         |

`create_event` and `edit_event` write iCalendar payloads: when `timezone` is set, `DTSTART`/`DTEND` carry a `TZID` parameter; when `all_day` is `true`, dates are interpreted as date-only (`YYYY-MM-DD`) and emitted as `DTSTART;VALUE=DATE` / `DTEND;VALUE=DATE`. The plugin does not emit a `VTIMEZONE` component — most servers use their own timezone database to resolve unknown TZIDs.

For single-day all-day events, the same `YYYY-MM-DD` for `start_date` and `end_date` is accepted; the builder automatically bumps `DTEND` by one day so the payload satisfies RFC 5545 §3.6.1 (DTEND must be strictly after DTSTART). For non-all-day timed events, a bare `YYYY-MM-DD` for `start_date` / `end_date` is also accepted and expanded to `T00:00:00` / `T23:59:59` — same convention as `list_events`.

For safe edits, fetch the event with `get_event` first to obtain its current `etag` and pass it to `edit_event` — the server returns `412 Precondition Failed` (mapped to a friendly `ToolResult::fail` message) if the event has been modified since. If you omit `etag` entirely, or supply a placeholder like `initial` / `none` / `todo`, the plugin auto-fetches the current ETag from the server before sending the conditional PUT — no extra round-trip beyond the `get_event`-equivalent it already does for field merging. Any opaque tag that matches the real RFC 7232 shape (8+ alphanumerics inside `"…"` or `W/"…"`) is trusted as-is.

`create_event` sends `If-None-Match: *` on every PUT (RFC 4791 §5.3.2), so retries cannot overwrite or duplicate an event the server already accepted. `summary` is capped at 255 characters to keep iCalendar payloads well under the RFC 5545 line-length limit.

## Response shape

Every action returns a `ToolResult` with two fields:

- `content` — a human-readable summary (unchanged from earlier releases; existing agents keep working).
- `data` — a structured payload new in this release. It always carries `status` (`ok` or `error`) and `action` (`list_events`, `create_event`, etc.) so programmatic consumers can branch without parsing the text. Successful results also include action-specific fields.

```jsonc
// create_event success
{
  "status": "ok",
  "action": "create_event",
  "event_uri": "/calendars/user/cal/20260922-120000-test.ics",
  "uid": "abc123-1@spora",
  "etag": "\"2a94de303bff21294a6bcc0f473aa3f8\"",
}
```

The same identifiers also appear in the human-readable text (multi-line `URI:` / `UID:` / `ETag:` block), so a follow-up `edit_event` or `delete_event` doesn't need a separate `list_events` round-trip just to discover them.

```jsonc
// list_events success
{
"status": "ok",
"action": "list_events",
"count": 3,
"events": [
{ "event_uri": "/…", "uid": "…", "summary": "Team Meeting", "dtstart": "20260922T120000Z", "dtend": "20260922T130000Z" }
]
}

// get_event success
{
"status": "ok",
"action": "get_event",
"event_uri": "/…",
"uid": "…",
"summary": "…",
"dtstart": "20260922T120000",
"dtend": "20260922T130000",
"dtstart_tzid": "America/New_York",
"dtend_tzid": "America/New_York",
"description": "…",
"location": "…",
"etag": "\"…\""
}
```

`dtstart_tzid` / `dtend_tzid` carry the original `TZID=` parameter from the iCalendar payload. Pass them back to `edit_event` to round-trip without losing the timezone — without them, the re-write emits floating local time and the wall-clock drifts across a DST transition. If the source event had no TZID, these fields are `null`.

```jsonc
// list_calendars success
{
  "status":    "ok",
  "action":    "list_calendars",
  "count":     2,
  "calendars": [
    { "href": "/calendars/user/personal/", "name": "Personal" },
    { "href": "/calendars/user/work/",     "name": "Work" }
  ]
}

// create_event validation failure
{
  "status":      "error",
  "action":      "create_event",
  "reason":      "summary_too_long",
  "hint":        "Shorten the summary and retry.",
  "field":       "summary"
}

// list_events HTTP failure
{
  "status":      "error",
  "action":      "list_events",
  "http_status": 500
}
```

`event_uri` is always returned — even when the server rewrites the slug you provided into a server-assigned name. `uid` and `etag` from `create_event` are what `edit_event` / `delete_event` expect on subsequent calls.

## CalDAV servers

CalDAV is an open IETF protocol; any of these work with the same configuration shape. Most providers require an **app-specific password** rather than your account password.

| Provider                      | CalDAV URL                                                                                                                                  | App password                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Apple iCloud                  | `https://caldav.icloud.com` (per-calendar URL from the Calendar app's "Calendar Sharing" dialog)                                            | <https://appleid.apple.com/account/manage> → App-Specific Passwords                                     |
| Fastmail                      | Per-calendar URL from Settings → Calendars → ⋯ → "CalDAV URL" (host: `caldav.fastmail.com`)                                                 | Account password (Fastmail supports CalDAV directly with the account password)                          |
| Google Calendar (via CalDAV)  | `https://apidata.googleusercontent.com/caldav/v2/<calendarID>/events` (calendar ID from Google Calendar settings)                           | <https://myaccount.google.com/apppasswords>                                                             |
| Nextcloud                     | `https://<your-nextcloud>/remote.php/dav/calendars/<username>/<calendar-name>/` (copy from Calendar → Settings → "iOS/OS X CalDAV address") | Nextcloud user profile → Security → "App passwords"                                                     |
| Radicale (self-hosted)        | `https://<your-radicale-host>/<user>/<calendar>/` (default port `5232`)                                                                     | Account password (configure auth in `config`)                                                           |
| Baïkal (self-hosted)          | `https://<your-baikal>/baikal/cal.php/calendars/<user>/<calendar>/`                                                                         | Account password                                                                                        |
| all-inkl.com (webmail CalDAV) | Per-calendar URL from webmail → Settings → Calendars (host: `webmail.<domain>`)                                                             | Webmail password — server only advertises **Digest** auth (handled automatically by `auth_method=auto`) |

Radicale's docs: <https://radicale.org/>. Baïkal: <https://sabre.io/baikal/>.

## Development

```bash
composer install
./vendor/bin/pest
./vendor/bin/phpstan analyse --no-progress
./vendor/bin/php-cs-fixer fix --dry-run --diff --no-interaction
```

CI: `.github/workflows/ci.yml` — Pest on PHP 8.4 + 8.5, PHPStan, and php-cs-fixer dry-run. The `coverage` job generates `coverage.xml` (Pest with Xdebug) and the `sonar` job uploads it to SonarCloud (project key `spora-ai_spora-plugin-calendar`). Requires the `SONAR_TOKEN` secret in the repo. MIT license.

---

**Repo:** [spora-ai/spora-plugin-calendar](https://github.com/spora-ai/spora-plugin-calendar) · **MIT**
