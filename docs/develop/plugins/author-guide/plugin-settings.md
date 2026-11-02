---
title: Plugin author guide — Plugin settings
description: Implementing Spora\Settings\PluginSettingsProviderInterface — contributing operator-facing settings, the key the host builds for you, the storage group, and what happens when a provider does not contribute.
---

# Plugin settings

A plugin-settings provider is a class that lists the operator-facing settings your plugin owns — a client id, an API key, a URL. The host collects the definitions from every installed plugin and renders them on the **Plugins** tab of the settings page.

Two things to know before you start:

- **The host owns the key, the storage group and the section.** You state a key; the host decides what it is called, where it is stored, and where it appears.
- **A provider that does not contribute is reported, not dropped in silence.** A setting that silently does not exist is a setting nobody configured.

## The hook

`Spora\Extensions\SporaExtensionInterface::pluginSettingProviders()` returns the classes that provide the settings:

```php
<?php

declare(strict_types=1);

namespace Spora\Plugins\Acme;

use Spora\Plugins\AbstractPlugin;

final class AcmePlugin extends AbstractPlugin
{
    public function getName(): string
    {
        return 'Acme';
    }

    /**
     * @return list<class-string<\Spora\Settings\PluginSettingsProviderInterface>>
     */
    public function pluginSettingProviders(): array
    {
        return [AcmeSettingsProvider::class];
    }
}
```

`AbstractPlugin` returns `[]`, so a plugin with no settings changes nothing. The provider is resolved from the container when the settings are collected, so PHP-DI autowires anything whose constructor arguments it can satisfy, and your own services are bound from a `ContainerBuildingEvent` subscriber (see [Lifecycle is events, not hooks](/develop/plugins/author-guide/foundations#lifecycle-is-events-not-hooks)).

## The interface contract

```php
namespace Spora\Settings;

interface PluginSettingsProviderInterface
{
    /** The plugin slug. The setting keys and the DB group are derived from it. */
    public function slug(): string;

    /** @return list<SettingDefinition> */
    public function settings(): array;
}
```

`slug()` returns the plugin's slug — the same one its `plugin.json` declares. The host derives the setting keys and the storage group from it, so a slug that does not match the manifest gives the plugin a second namespace.

The definitions themselves are `Spora\Settings\SettingDefinition` — the same value object core declares its own settings with:

```php
namespace Spora\Settings;

final readonly class SettingDefinition
{
    public const TYPE_TOGGLE = 'toggle';
    public const TYPE_TEXT = 'text';
    public const TYPE_NUMBER = 'number';
    public const TYPE_SELECT = 'select';
    public const TYPE_PASSWORD = 'password';
    public const TYPE_MULTI_SELECT = 'multi-select';
    public const TYPE_TEXTAREA = 'textarea';
    public const TYPE_LIST = 'list';

    public function __construct(
        public string $key,
        public string $label,
        public string $type,
        public mixed $default = null,
        public string $group = 'framework',
        public string $section = 'general',
        public string $description = '',
        public bool $secret = false,
        public bool $bootOnly = false,
        public array $options = [],
        public string $validation = '',
        public string $transform = '',
        public ?int $min = null,
    ) {}
}
```

## The key is rewritten

You give the key **without** a prefix. The host builds the full key: `SPORA_<SLUG>_<KEY>`, slug and key in upper case. A plugin with the slug `acme` and the key `api_key` contributes `SPORA_ACME_API_KEY`.

A key that arrives with a prefix already on it is stripped first: a leading `SPORA_` and a leading `<SLUG>_` are both removed before the host adds its own. So `api_key`, `ACME_API_KEY` and `SPORA_ACME_API_KEY` all name the same setting — you cannot end up with two settings by spelling the prefix out in one place and not in another.

The corollary is that your key must not start with the slug. A key `acme_thing` in a plugin with the slug `acme` becomes `SPORA_ACME_THING`, not `SPORA_ACME_ACME_THING`.

## The group and the section

Every plugin-contributed setting is stored under the group `plugin:<slug>` — `plugin:acme` for the plugin above — and rendered in the `plugins` section, which is the **Plugins** tab. The Plugins tab splits that section back into the groups the settings are stored under, so your plugin's settings appear under your plugin's slug and the plugin system's own settings stay where they are.

The group is part of the unique key with the setting key, so one plugin's rows never mix with another's. A row left behind by an uninstalled plugin is skipped rather than read.

**The host overrides the group and the section.** A `group` or a `section` on your `SettingDefinition` is ignored — the key is rewritten, the rows are filed under `plugin:<slug>`, and the setting is rendered in the `plugins` section. The same goes for `bootOnly`: a plugin's settings are read at request time, never before the database is open, so they are stored and edited like any other setting.

## The provider may depend on the config

The definitions are read on the configuration's first read. The config is built from core's own declarations first and the plugin's values are folded in on that first read, so there is no cycle: a provider that reads the configuration to describe its settings works.

That is what lets a provider put the instance's public address into the description of the setting that address is registered on. The operator pastes the address into a third-party console, and the provider takes it from the config its own request carries, so the two cannot disagree.

Two consequences worth knowing:

- **Do not touch the database in `settings()`.** The definitions are read before the database is open.
- **A provider that reads the settings registry sees core's settings only.** The registry is what asks the provider for its settings, so a read that happened mid-collection would re-enter it; the re-entrant read sees the core declarations and no plugin settings, and the outer call still merges the full set.

## A core key may not be redefined

The host owns the key space. A definition whose rewritten key collides with a core key is **refused**, and the core definition stands.

The collision is on the rewritten key, so the slug matters: a plugin with the slug `db` and the key `driver` spells `SPORA_DB_DRIVER` and is refused. A plugin that could redefine it would move the setting out of the `framework` group and off the boot-only list, and the stored row would be orphaned.

## A minimal provider

```php
<?php

declare(strict_types=1);

namespace Spora\Plugins\Acme;

use Spora\Core\Config;
use Spora\Settings\PluginSettingsProviderInterface;
use Spora\Settings\SettingDefinition;

final class AcmeSettingsProvider implements PluginSettingsProviderInterface
{
    public function __construct(
        private readonly Config $config,
    ) {}

    public function slug(): string
    {
        return 'acme';
    }

    /**
     * @return list<SettingDefinition>
     */
    public function settings(): array
    {
        return [
            new SettingDefinition(
                key: 'api_key',
                label: 'Acme API key',
                type: SettingDefinition::TYPE_PASSWORD,
                default: '',
                description: 'The key from your Acme account.',
                secret: true,
            ),
            new SettingDefinition(
                key: 'callback_url',
                label: 'Callback URL',
                type: SettingDefinition::TYPE_TEXT,
                default: '',
                description: 'Register '
                    . ($this->config->getString('SPORA_APP_URL') ?? 'this instance')
                    . ' as the callback URL in your Acme account.',
            ),
            new SettingDefinition(
                key: 'timeout_seconds',
                label: 'Request timeout',
                type: SettingDefinition::TYPE_NUMBER,
                default: 30,
                description: 'Seconds to wait for an Acme response.',
                validation: '/^\d+$/',
            ),
        ];
    }
}
```

No `group` and no `section` — the host owns both, and stating them would only be misleading.

`secret: true` stores the value encrypted and never sends it over the wire: the admin API answers with `'***'` in its place, and a value submitted back unchanged means "leave this alone".

## What the operator sees

A plugin-contributed setting is a normal setting from the operator's side:

- It appears on the **Plugins** tab, under your plugin's slug.
- It is written through `PATCH /api/v1/admin/settings` and reset through `DELETE /api/v1/admin/settings/{group}/{key}`, with the group `plugin:<slug>`.
- It resolves like any other setting: the declared default, then `config.php`, then the environment, then the stored row — the stored row wins.

Your own code reads it through the config, under the full key:

```php
$config->getString('SPORA_ACME_API_KEY');
$config->getInt('SPORA_ACME_TIMEOUT_SECONDS');
```

## When a provider does not contribute

A provider can fail to contribute, and the failure is reported in four cases:

- the class could not be resolved from the container;
- the provider has no slug;
- the provider's `settings()` threw;
- a rewritten key collided with a core setting.

Two surfaces carry it:

- **`GET /api/v1/admin/settings`** carries `data.plugin_problems` — a list of `{ provider, message }` objects, empty when nothing is wrong. The admin UI does not render it; the response is where an operator or a script reads it.
- **PHP's error log** carries the same message, prefixed `[spora] ERROR`. It is written with `error_log()` rather than the PSR-3 logger, because the plugin settings are folded into the configuration on its first read and the logger is built _from_ that configuration — there is no logger to inject at that point.

## Testing

1. **The full key** — assert the registry knows `SPORA_ACME_API_KEY` and that the group is `plugin:acme`.
2. **A core key is refused** — a definition that spells a core key is absent from the registry, and the failure appears in `plugin_problems`.
3. **The group and the section are overridden** — a definition that declares its own `group` and `section` still lands under `plugin:<slug>` and in the `plugins` section.
4. **A provider that depends on the config** — assert its settings are present and that its description carries the configured value.
5. **A provider that throws** — assert the other providers' settings are still there, and that the failure is reported.

## What's next

- [Foundations](/develop/plugins/author-guide/foundations) — the hook table, including `pluginSettingProviders()`.
- [Concepts → Plugin system](/reference/concepts/plugins-system#plugin-settings) — the host side: the key rewriting, the reserved keys, and the `plugin_problems` surface.
- [Config keys](/reference/config-keys) — how a setting resolves, and which layer wins.
- [Migrations](/develop/plugins/author-guide/migrations) — only if your plugin needs a table of its own; a contributed setting does not.
