---
title: Global settings
description: Settings → Admin → Global settings — the runtime configuration registry, what each layer means, and when a file is still the right answer.
---

# Global settings

**Settings → Admin → Global settings** is where an admin changes Spora's runtime configuration
without editing a file on the server. Every field on it is declared by
`app/Settings/SettingsRegistry.php` — one definition per key carrying its type, default,
description, validation rule, UI section, and whether it is read before the database opens or is a
stored secret. **A key that is not declared there is not a setting**, which is why the page cannot
drift from what the application reads.

Sections: General, Access, Timeouts, Worker, Plugins, Media, Mail, Database, Security.

## Four layers, last wins

```text
registry default  <  config.php  <  .env / OS environment  <  database
```

The database layer is what makes this page worth using on a host where you cannot reach `.env` — a
shared cPanel account with no shell is exactly the case it was built for. It also wins over `.env`,
which surprises people: **a value you save here overrides one you set in `.env` months ago and
forgot about.** The page tells you when that has happened.

The exception is the `bootOnly` family — the `SPORA_DB_*` keys, `SPORA_KEY_PATH`, `SPORA_LOG_PATH`,
`SPORA_APP_ENV`, `SPORA_APP_URL`, `SPORA_APP_PREFIX`, `SPORA_SQLITE_BUSY_TIMEOUT`. Those are read
before the database can be opened, so they are file-only, permanently. They render disabled with the
reason shown.

## What the page tells you

Under each field, one of three lines:

- **Where the value comes from** — the built-in default, your `.env`, your `config.php`, or the
  database — plus the key name, so you can see what a save here would shadow.
- **Takes effect after the workers restart** — for the handful of settings read once before the
  worker loop starts.
- **Could not be decrypted; running on the default** — the stored row exists but will not decrypt.
  Most often a rotated secret key. Re-enter the value here to store a readable one.

## Saving, and resetting

Save sends only the fields you changed, and the whole batch is validated before anything is written —
so a refused form leaves nothing half-saved and tells you exactly which field the server rejected.

**Reset to default** appears on a value that lives in the database; it deletes the row so the
`.env` / `config.php` value takes effect again. The reset response does not say which layer the value
fell back to, and a reset can expose a value this page never showed you, so the page re-reads
afterwards rather than guessing.

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

Boot-time settings, and anything the worker reads only at startup without a restart hook.

## What's next

- [Config keys](/reference/config-keys) — the `config.php` reference and the four-layer chain
- [Environment variables](/start/operators/env-vars) — every `SPORA_*` variable
- [Security](/start/operators/security) — encryption, secret handling, recovery
- [CLI reference](/reference/cli) — every `bin/spora` command
