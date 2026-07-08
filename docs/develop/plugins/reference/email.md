---
title: Email
description: SMTP send + IMAP read for Spora agents — 11 operations across inbox read, folder management, drafts, sending, message state.
---

# Email Plugin for Spora

**SMTP send + IMAP read for Spora agents.** Point it at any SMTP/IMAP host (Gmail, Outlook, Fastmail, iCloud, or a self-hosted Postfix+Dovecot) and give agents a single `email` tool with 11 operations covering inbox read, folder management, drafts, sending, and message state.

Under the hood: **SMTP** via [Symfony Mailer](https://symfony.com/doc/current/mailer.html) ([RFC 5321](https://datatracker.ietf.org/doc/html/rfc5321)) and **IMAP** via [webklex/php-imap](https://www.php-imap.com/) ([RFC 3501](https://datatracker.ietf.org/doc/html/rfc3501)).

## Installation

```bash
php bin/spora plugin:install spora-ai/spora-plugin-email
```

For local development against a sibling checkout, pass `--path=/abs/path/to/checkout`.

After install, the tool is registered as `email` in Spora's `communication` category. Operations are dispatched via a single `action` parameter (see [Per-tool operations](#per-tool-operations)).

## Configuration

Settings → Tools → Email. The same `email_username` and `email_password` are used for both IMAP and SMTP authentication.

| Setting                   | Required                  | Default               | Notes                                                                                                                                 |
| ------------------------- | ------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `imap_host`               | yes (for read operations) | —                     | e.g. `imap.gmail.com`                                                                                                                 |
| `imap_port`               | no                        | `993`                 | IMAPS port; use `143` with `tls` (STARTTLS)                                                                                           |
| `imap_encryption`         | no                        | `ssl`                 | `ssl` (implicit TLS), `tls` (STARTTLS), or `notls` (not recommended)                                                                  |
| `imap_timeout`            | no                        | `60`                  | Seconds before an IMAP connection fails                                                                                               |
| `email_username`          | yes                       | —                     | Full email address, used for IMAP **and** SMTP                                                                                        |
| `email_password`          | yes                       | —                     | Account password or app password                                                                                                      |
| `smtp_host`               | yes (for send operations) | —                     | e.g. `smtp.gmail.com`                                                                                                                 |
| `smtp_port`               | no                        | `587`                 | Submission port; use `465` with `ssl`                                                                                                 |
| `smtp_encryption`         | no                        | `tls`                 | `ssl`, `tls`, or `notls`                                                                                                              |
| `smtp_from`               | yes (for send/draft)      | —                     | The `From:` address the agent sends as                                                                                                |
| `smtp_allowed_recipients` | no                        | _(empty = allow any)_ | Comma-separated exact addresses the agent may send to, or `*` for any. **Empty = unrestricted; set an explicit list for production.** |
| `smtp_timeout`            | no                        | `30`                  | Seconds before an SMTP connection fails                                                                                               |

`email_password` is encrypted at rest by Spora's `ToolConfigService`, masked in the UI, and never logged. SMTP recipient filtering is enforced by `EmailSettingsResolver::validateSmtpSettings` before any message is queued to the Symfony Mailer transport.

## Per-tool operations

The `email` tool exposes 11 `action` values. The three read-side operations (`read_inbox`, `list_folders`, `read_folder`) are enabled by default; the remaining eight are gated behind a per-tool "require approval" flag and are disabled by default except `create_draft`, which defaults to off with no approval required.

| Operation         | Approval | Purpose                                    | Parameters (types)                                                                                          |
| ----------------- | -------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `read_inbox`      | no       | Recent messages from `INBOX`               | `limit` int (default 5, max 20), `unread_only` bool, `mark_as_read` bool (irreversible)                     |
| `list_folders`    | no       | All mailbox folders                        | _(none)_                                                                                                    |
| `read_folder`     | no       | Recent messages from a named folder        | `folder` string (required), `limit` int                                                                     |
| `create_draft`    | no       | Save a draft to `Drafts` via IMAP `APPEND` | `to` string, `subject` string, `body` string (all required)                                                 |
| `send_email`      | yes      | SMTP send via Symfony Mailer               | `to` string, `subject` string, `body` string (all required; `to` checked against `smtp_allowed_recipients`) |
| `create_folder`   | yes      | IMAP `CREATE`                              | `new_folder` string (required)                                                                              |
| `rename_folder`   | yes      | IMAP `RENAME`                              | `folder` string (old name), `new_folder` string (required)                                                  |
| `delete_folder`   | yes      | IMAP `DELETE` (blocks system folders)      | `folder` string (required)                                                                                  |
| `move_email`      | yes      | IMAP `COPY` + `EXPUNGE`                    | `uid` int, `folder` string (source), `new_folder` string (destination)                                      |
| `delete_email`    | yes      | IMAP `EXPUNGE` (sets `\Deleted`)           | `uid` int, `folder` string                                                                                  |
| `mark_email_read` | yes      | IMAP `STORE` `\Seen` flag                  | `uid` int, `folder` string, `read` bool (default true)                                                      |

Read operations accept `limit` in `1..20`; out-of-range values fall back to the default of 5. `mark_as_read=true` via `read_inbox` sets the server-side `\Seen` flag; clear it with `mark_email_read(read=false)`.

`describeAction()` renders each call for the approval UI through `EmailActionDescriber`, so the human-readable summary in the Spora admin shows the specific recipient, folder, or UID being acted on.

## Provider setup

SMTP and IMAP are protocols, not a SaaS — you point the plugin at any host. A few common operators:

- **Gmail (Google Workspace + personal)** — IMAP requires an [App password](https://support.google.com/accounts/answer/185833) since May 2022; the account password will not work even with IMAP enabled. Hosts: `imap.gmail.com:993` (SSL), `smtp.gmail.com:587` (TLS).
- **Outlook / Microsoft 365** — IMAP/SMTP AUTH requires an [app password](https://support.microsoft.com/en-us/account-billing/using-app-passwords-with-apps-that-dont-support-two-factor-verification-5896ed9b-4263-e681-128a-a6f2979a7944) when MFA is enforced, or OAuth2 for full-flow auth. Hosts: `outlook.office365.com:993` (SSL), `smtp.office365.com:587` (TLS).
- **Fastmail** — IMAP/SMTP work with the account password (or an [app password](https://www.fastmail.com/help/clients/creating-an-app-password.html) if MFA is on). Hosts: `imap.fastmail.com:993`, `smtp.fastmail.com:587`.
- **iCloud** — Requires an [app-specific password](https://support.apple.com/en-us/HT204397) (Apple ID MFA does not allow raw account passwords). Hosts: `imap.mail.me.com:993`, `smtp.mail.me.com:587`.
- **Self-hosted Postfix + Dovecot** — Plain STARTTLS on `143`/`587`, or implicit TLS on `993`/`465`. Match `imap_encryption` and `smtp_encryption` to whatever the MTA exposes.

Always use an **app password / app-specific password** when the provider supports MFA — raw account passwords are rejected by every major provider once MFA is enrolled, and storing a raw password in Spora config defeats the encryption-at-rest guarantees in `ToolConfigService`. Never commit config files containing real passwords; rotate any credential that does end up in git history.

## Development

```bash
composer install
./vendor/bin/pest           # unit + integration tests
./vendor/bin/phpstan analyse
./vendor/bin/php-cs-fixer fix --dry-run --diff
```

CI: `.github/workflows/ci.yml` — Pest on PHP 8.4 + 8.5, PHPStan level per `phpstan.neon`, php-cs-fixer dry-run. SonarCloud analysis against project key `spora-ai_spora-plugin-email` (requires `SONAR_TOKEN` secret on the repo). MIT license.

---

**Repo:** [spora-ai/spora-plugin-email](https://github.com/spora-ai/spora-plugin-email) · **MIT**
