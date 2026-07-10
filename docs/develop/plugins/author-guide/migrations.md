---
title: Plugin author guide — Migrations
description: Adding migrations to a Spora plugin — schema versions, filename prefixes, and the up()/down() convention.
---

# Migrations

Plugins that need their own database tables declare a migration path and a schema version:

```php
public function schemaVersion(): int
{
    return 1;   // bump on every new migration file
}

public function migrationsPath(): ?string
{
    return __DIR__ . '/../database/migrations';
}
```

The full schema reference is in [Concepts → Schema](/reference/concepts/schema).

## Filename pattern

Every migration file **must be prefixed with the plugin slug** followed by a six-digit sequence number:

```text
database/migrations/
├── acme-search_000001_create_search_index_table.php
├── acme-search_000002_add_results_table.php
└── …
```

`DatabaseSchemaInstaller` enforces this prefix at install time and throws `RuntimeException` if any file lacks the `{slug}_` prefix. The prefix namespacing is what keeps your plugin's migrations from colliding with core or sibling plugins.

## File content

An anonymous class extending `Illuminate\Database\Migrations\Migration`, matching the core migration style:

```php
<?php

declare(strict_types=1);

use Illuminate\Database\Capsule\Manager as Capsule;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;

return new class extends Migration {
    public function up(): void
    {
        Capsule::schema()->create('acme_search_index', static function (Blueprint $table): void {
            $table->id();
            $table->string('keyword')->index();
            $table->json('top_results')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Capsule::schema()->dropIfExists('acme_search_index');
    }
};
```

## Rules of thumb

- Always namespace your tables (`acme_search_index`, not `search_index`) to avoid collision with core tables or other plugins.
- Always write a `down()` even if you only use it for local cleanup.
- Never edit a migration that has already shipped — bump `schemaVersion()` and add a new file.

## What's next

- [Admin UI](/develop/plugins/author-guide/admin-ui) — when the operator needs a UI to manage the data in your tables
- [Distribution](/develop/plugins/author-guide/distribution) — when you have working code on `main`
