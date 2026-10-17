---
title: Global settings
description: Settings → Runtime settings — the runtime configuration registry, what each layer means, and when a file is still the right answer.
---

# Global settings

**Settings → Runtime settings** is where an admin changes Spora's runtime configuration
without editing a file on the server. Every field on it is declared by
`app/Settings/SettingDeclarations.php` — one definition per key carrying its type, default,
description, validation rule, UI section, and whether it is read before the database opens or is a
stored secret. **A key that is not declared there is not a setting**, which is why the page cannot
drift from what the application reads.

It is five tabs, grouped by what an operator is doing rather than by what the code calls things:

| Tab                      | Registry sections behind it            |
| ------------------------ | -------------------------------------- |
| **General**              | General, Access                        |
| **Mail & Realtime**      | Mail, Realtime                         |
| **Worker & Performance** | Worker, Timeouts                       |
| **Media & Plugins**      | Media, Plugins                         |
| **System**               | every section, file-only settings only |

**System** is the odd one out: it is read-only throughout, because everything on it is read before
the database opens. The other four are where the editing happens.

## Four layers, last wins

```text
registry default  <  config.php  <  .env / OS environment  <  database
```

The database layer is what makes this page worth using on a host where you cannot reach `.env` — a
shared cPanel account with no shell is exactly the case it was built for. It also wins over `.env`,
which surprises people: **a value you save here overrides one you set in `.env` months ago and
forgot about.** The page tells you when that has happened.

The exception is the `bootOnly` family: the `SPORA_DB_*` keys, `SPORA_KEY_PATH`, `SPORA_LOG_PATH`,
`SPORA_LOG_LEVEL`, `SPORA_SQLITE_BUSY_TIMEOUT`, `SPORA_APP_ENV`, `SPORA_APP_URL`, `SPORA_APP_PREFIX`,
`SPORA_MAX_WORKERS`, and `SPORA_WORKER_RUNTIME_MODE`. Those are read before the database can be
opened, so they are file-only, permanently. All sixteen are listed on the **System** tab, which has no
editing, and each one says why it is read where it is.

## What the page tells you

Under each field, one of three lines:

- **Where the value comes from** — the built-in default, your `.env`, your `config.php`, or the
  database — plus the key name, so you can see what a save here would shadow.
- **Could not be decrypted; running on the default** — the stored row exists but will not decrypt.
  Most often a rotated secret key. Re-enter the value here to store a readable one.

## Saving, and resetting

Save sends only the fields you changed, and the whole batch is validated before anything is written —
so a refused form leaves nothing half-saved and tells you exactly which field the server rejected.

**Clear** appears on a value that lives in the database; it deletes the row so the
`.env` / `config.php` value takes effect again. A confirmation says so before it happens, naming
the setting. The response does not say which layer the value fell back to, and a clear can expose a
value this page never showed you, so the page re-reads afterwards rather than guessing.

## Secrets

Password fields — the SMTP password, the Mercure JWT key — never send their value over the wire, not
even to an admin. The page shows a locked row with a **Change** button instead.

Pressing **Change** clears the field so you can type a new value; **Cancel** restores it untouched.
Because the server cannot hand the value back, saving never re-sends a secret you did not type.
Submitting an **empty** value is how you clear a credential: the stored row is deleted and the
setting falls back to your files.

## Shared tool settings

A plugin that ships several tools needing the same credential declares a **shared settings group**
once. The operator fills the key in one place, and every tool in the plugin falls back to it — while
a tool that sets its own key still wins. See
[Tools → Shared settings groups](/reference/concepts/tools#shared-settings-groups).

Editing a group's credential needs group-owner or group-admin access, not a global admin.

## When nothing loads

If a lost or rotated secret key leaves the page unable to render, the recovery is one command that
needs no working UI:

```bash
php bin/spora settings:reset
```

It deletes every stored row — see [Security → Recovering a lost or rotated secret
key](/start/operators/security#recovering-a-lost-or-rotated-secret-key).

## What you can't change here

The `bootOnly` family — they are read before the database opens, so the page that would write them
cannot run. They appear on the **System** tab with editing off.

Nothing else is excluded. A value you save on one of the four editable tabs is applied to the next
request, and to a worker the next time it starts.

## What's next

- [Config keys](/reference/config-keys) — the `config.php` reference and the four-layer chain
- [Environment variables](/start/operators/env-vars) — every `SPORA_*` variable
- [Security](/start/operators/security) — encryption, secret handling, recovery
- [CLI reference](/reference/cli) — every `bin/spora` command
