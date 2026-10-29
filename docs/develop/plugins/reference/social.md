---
title: Social
description: Native social publishing for Spora — an agent writes and schedules your LinkedIn, Facebook and Instagram posts, and the numbers come back per network.
---

# Social Plugin for Spora

Publishes to **LinkedIn**, **Facebook** and **Instagram** from Spora, against accounts you own. **One login per provider:** the Meta login covers Instagram and Facebook together, and the LinkedIn login covers the member and the organisations they administer. The copy is written by an agent that wakes on your schedule, reads what is already going out, and hands each post to you for approval; the worker publishes it when the moment comes. Each network's own numbers come back afterwards. The plugin holds the tokens, does the posting and reads the analytics: it is the native replacement for the [Zernio](/develop/plugins/reference/zernio) plugin, which was a thin proxy to a third-party service that held the accounts and published for you.

## Installation

```bash
php bin/spora plugin:install spora-ai/spora-plugin-social
php bin/spora spora:install   # applies the plugin's migrations
```

The panel is a pre-built Vue SPA shipped as a separate Composer package, `spora-ai/spora-plugin-social-frontend` (type `spora-plugin-frontend`). The PHP package's `require` block pulls it in, so there is nothing extra to install — but the frontend package has to be **published first**: the plugin's `composer.json` names it as a dependency (`">=0.1.0 <2.0.0"`), and Composer cannot resolve a requirement that is not on Packagist. Its `extra.spora-plugin-slug` must equal the parent plugin's `plugin.json#slug` (`social`); the installer refuses to install when it does not.

After install the **Social** tile appears in the admin panel's Apps dropdown at `/apps/social`, and five tools are exposed to agents. The panel is four tabs — **Compose**, **Calendar**, **Posts** and **Accounts** — with **Analytics** behind the Posts tab, because the post list and how the posts did are one job.

> **Status — the plugin needs spora-core ≥ 0.32.0.** Two core extension points carry it: `Spora\Scheduling\DueWorkProviderInterface`, the hook that lets a plugin publish a scheduled post and collect the readings on its own, and `Spora\Settings\PluginSettingsProviderInterface`, the hook that puts the client ids and secrets on the **Plugins** tab. `composer.json` requires the floor, so Composer refuses an older core rather than installing a plugin that cannot publish by itself.

## The agent that posts for you

The agent-driven mode is the reason the plugin exists. You give an agent a schedule; the agent writes the post. It wakes, reads what is already going out, drafts a body per network, checks the media against each network's rules, and hands the finished post to you. You approve the copy and the time **once**, and the worker publishes when the moment comes.

You do not have to build that agent yourself — the plugin ships both halves.

### The agent template

`agent-templates/social-poster.json` — id **`social/social-poster`**, name "Spora Social Poster", version 1.0.0, `required_plugins: ["spora-ai/spora-plugin-social"]`.

It enables the five tools with the approval defaults already set: every read and every draft is pre-approved, and everything that commits copy to a network is not. It also grants the **Skill** tool with `social-poster` allowlisted, so the imported agent arrives with the operating manual as well as the tools. Its system prompt carries the per-platform rules — the character limits, that Instagram needs media and takes no PNG, that each network gets its own body — because a body over Instagram's limit fails that target, and a post that reaches LinkedIn but not Instagram is a `partial` one. See [Concepts → Agent templates](/reference/concepts/agent-templates).

### The skill

`skills/social-poster/SKILL.md` — the operating manual the agent reads: what each tool does, the per-platform rules, the media rules, the approval behaviour, and the worked flow from "the operator asked for a weekly post" to "the post is scheduled". It declares `allowed-tools: social_connections social_post social_media social_analytics social_calendar` and a compatibility floor of `spora>=0.32 spora-plugin-social>=0.1`.

All five tools recommend it through `recommendsSkills`, so on the agent's **Tools** tab each of those tool cards carries a row for it, and turning that row on allowlists the skill in the same move. The imported agent has it already; the row is there to turn it off.

### From the template to a running agent

1. **Install the plugin**, and connect the providers the agent will publish as — see [Connecting a provider](#connecting-a-provider).
2. **Create the agent.** **Agents → New → From template**, pick **Spora Social Poster**, then **Import**. The agent arrives with the five tools enabled, the approval defaults from the template, and the `social-poster` skill allowlisted — the operating manual is in place before the agent has read anything.
3. **Give it a model.** The agent's **LLM config** tab, or the global default in **Settings → LLM drivers**.
4. **Give it a schedule.** The agent's own **Schedules** tab: a recurring cron expression, a timezone, and the prompt that says what to write about — "a post about this week's release, on Tuesday morning". The schedule wakes the agent; the agent does the rest.

The imported agent is an ordinary agent afterwards: editing the template file does not reach it. See [Start → Managing agents → Agent templates](/start/end-users/managing-agents#agent-templates).

## Operator prerequisites

The things that have to be true before a post reaches an audience do not show up in the code, and each one fails in a way that does not name its cause.

> **`SPORA_APP_URL` must be a publicly reachable HTTPS address.** Instagram fetches the published media from the internet, so an address only your own network can see fails at the last step of a publish, with an error that never mentions the URL. The plugin checks the address when you start a connection, not when you publish — which is the difference between fixing it now and fixing it after a failed post. See [Environment variables](/start/operators/env-vars#application).
>
> **Start the Meta app review first.** `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `pages_show_list`, `pages_manage_posts`, `pages_read_engagement` and `read_insights` all need review, and it can take weeks. Nothing in the plugin blocks on it — it runs against a developer-mode app — but the feature is not usable against a real audience until the review lands. Start the review before you write the copy.
>
> **A LinkedIn organisation page needs Community Management API approval.** Posting as a member through `w_member_social` is self-service, so a personal account works from the first day and an organisation page does not. Ship member posting first, and turn on **Ask LinkedIn for organisation pages** only once your app holds the scope: asking for a scope the app does not have fails the whole authorization request, not just the organisation part.

**Meta is one login for both networks.** It is the _Instagram API with Unified Login_, built on Facebook Login for Business: one Meta app, one configuration, one redirect URI, and one click connects Instagram and Facebook together. The client picks a business portfolio, the Instagram professional account and the Facebook Page, and the app receives a **Business Integration System User token** that covers every asset they shared and **never expires**.

**Both sides need a business portfolio.** The app has to be owned by a portfolio you control — Meta's rule is that it is "separate from the business portfolio owned by your business client" — and the client onboards with the portfolio that owns their assets. That is the cost of the model, and the operator hits it.

**One caveat the plugin cannot check for you.** An Instagram professional account _connected to_ a Page which requires Page Publishing Authorization cannot be published to until that authorization is completed, and Meta says there is no way for an app to find out whether a Page requires it. Whether the account's Page is one of those is on you to know.

### The Meta app, step by step

**Meta** — [app dashboard](https://developers.facebook.com/apps)

1. Create a **Business** app. A _Consumer_ app cannot use Instagram. The app must be owned by a business portfolio you control.
2. Copy the **App ID** and the **App Secret** — they go into `SPORA_SOCIAL_META_APP_ID` and `SPORA_SOCIAL_META_APP_SECRET`.
3. Add the **Facebook Login for Business** product.
4. Add the **Manage messaging & content on Instagram** use case, and open the _"API setup with Unified login"_ tab. That tab only appears for an app owned by a business portfolio that uses Facebook Login for Business; if yours does not have it, the portfolio is the piece to fix.
5. Open _Facebook Login for Business → Configurations_ and create one: the **system-user access token** type, the **Instagram professional account** and the **Facebook Page** as the assets, and the permissions below. Copy the **Configuration ID** into `SPORA_SOCIAL_META_CONFIG_ID`.
6. Register the redirect URL with that configuration. **The setting's own description in Settings → Plugins carries it** — the _Meta configuration id_ row ends with _Register this redirect URL with it: {url}_ — so copy it from there rather than assembling it. It is built from `SPORA_APP_URL`, so it has to be the address you registered.
7. Request the permissions: `instagram_basic`, `instagram_content_publish` and `instagram_manage_insights` for Instagram, `pages_show_list`, `pages_manage_posts`, `pages_read_engagement` and `read_insights` for the Pages.
8. **To list the Pages** — the client shares them, and the plugin needs their ids — add `business_management` to the configuration. It grants the whole business portfolio and needs its own review, so the plugin does not ask for it: without it the connection covers the Instagram account alone, and the Pages have to be published to by their ids.

**Standard Access against Advanced Access** is the review state of the permissions, not of the app. Standard Access is enough to use the app with people who already have a role on it — the app's own testers and administrators — which is what you need to try the plugin with your own accounts. Advanced Access is what makes the permissions available to the public, and it needs an App Review, which takes weeks. So: **start on Standard Access, get it working with your own accounts, and start the review before you write the copy.** Nothing in the plugin waits for the review — it runs against a developer-mode app — but a post that reaches an audience of strangers needs it.

### The LinkedIn app, step by step

**LinkedIn** — [developer portal](https://www.linkedin.com/developers/apps)

1. Create an app and add the **Sign in with LinkedIn** product. It brings OpenID Connect and the member id with it.
2. Copy the **Client ID** and the **Client Secret** from _Auth_.
3. Register the redirect URI with the app. **The setting's own description in Settings → Plugins carries it** — the _LinkedIn client id_ row ends with _Register this redirect URL with it: {url}_ — so copy it from there rather than assembling it. Its shape is `{your-spora}/api/v1/plugins/social/oauth/linkedin/callback`.
4. Add the **Share on LinkedIn** product.

Member posting (`w_member_social`) is **self-service**: an app in development mode posts as the member who signed in, and no review is involved. Start there. The organisation permission and the four read permissions are not — see [The LinkedIn permission toggles](#the-linkedin-permission-toggles).

## Settings

The plugin's settings sit on the **Plugins** tab of the admin settings, under the group **Social**. The same keys can be written in `.env` or `config.php`.

| Label                                            | Key                                        | Type     | Notes                                                                                                                                                         |
| ------------------------------------------------ | ------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LinkedIn client id                               | `SPORA_SOCIAL_LINKEDIN_CLIENT_ID`          | text     | The client id of your LinkedIn app. Its description carries the redirect URL to register with it.                                                             |
| LinkedIn client secret                           | `SPORA_SOCIAL_LINKEDIN_CLIENT_SECRET`      | password | Stored encrypted, never returned over the wire.                                                                                                               |
| Ask LinkedIn for organisation pages              | `SPORA_SOCIAL_LINKEDIN_ORGANIZATION_SCOPE` | toggle   | Off by default. On only once your app holds `w_organization_social`.                                                                                          |
| Ask LinkedIn for the administered organisations  | `SPORA_SOCIAL_LINKEDIN_READ_ORG_ACLS`      | toggle   | Off by default. On only once your app holds `r_organization_admin`.                                                                                           |
| Ask LinkedIn for the organisation statistics     | `SPORA_SOCIAL_LINKEDIN_READ_ORG_STATS`     | toggle   | Off by default. On only once your app holds `rw_organization_admin`.                                                                                          |
| Ask LinkedIn for the member post reactions       | `SPORA_SOCIAL_LINKEDIN_READ_MEMBER_FEED`   | toggle   | Off by default. On only once your app holds `r_member_social_feed`.                                                                                           |
| Ask LinkedIn for the organisation post reactions | `SPORA_SOCIAL_LINKEDIN_READ_ORG_FEED`      | toggle   | Off by default. On only once your app holds `r_organization_social_feed`.                                                                                     |
| LinkedIn API version                             | `SPORA_SOCIAL_LINKEDIN_API_VERSION`        | text     | `YYYYMM`. Defaults to `202610`.                                                                                                                               |
| Meta Graph API version                           | `SPORA_SOCIAL_GRAPH_API_VERSION`           | text     | The version every Meta endpoint carries, written as the URL wants it, e.g. `v26.0`. Defaults to `v26.0`.                                                      |
| Meta app id                                      | `SPORA_SOCIAL_META_APP_ID`                 | text     | The app id of your Meta app. One app serves both networks.                                                                                                    |
| Meta app secret                                  | `SPORA_SOCIAL_META_APP_SECRET`             | password | Stored encrypted.                                                                                                                                             |
| Meta configuration id                            | `SPORA_SOCIAL_META_CONFIG_ID`              | text     | The id of the Facebook Login for Business configuration the login dialog uses. Its description carries the redirect URL to register with it.                  |
| Frontend URL                                     | `SPORA_SOCIAL_FRONTEND_URL`                | text     | Where the browser lands after a connect. Empty by default — the app URL is used. Set it when the SPA runs on another origin, as it does in local development. |

**Meta is one app and one configuration for both networks.** The configuration is the list of permissions and assets your app asks a client for; its id is not a secret, but the login cannot happen without it. A provider whose app id and secret are both set is configured; one whose pair is missing refuses the connection with the reason named, before the browser ever reaches the platform.

### The LinkedIn permission toggles

LinkedIn grants `w_organization_social` and the four read permissions to selected developers only, and it needs the Community Management API approved for them. **An app that asks for a permission it does not hold is refused the whole authorization request** — not just the part it may not have. So turn on exactly what your app holds, and nothing else. They are one setting each, so an app that holds one of them is not refused over the other four.

| Toggle                      | Permission                   | Reads                                    |
| --------------------------- | ---------------------------- | ---------------------------------------- |
| organisation pages          | `w_organization_social`      | posts on behalf of an organisation       |
| administered organisations  | `r_organization_admin`       | the organisations the member administers |
| organisation statistics     | `rw_organization_admin`      | an organisation's share statistics       |
| member post reactions       | `r_member_social_feed`       | a member post's reactions                |
| organisation post reactions | `r_organization_social_feed` | an organisation post's reactions         |

With all of them off, the plugin asks for `openid`, `profile`, `email` and `w_member_social` alone — what member posting needs, and what any app may ask for. The posts still go out; the numbers stay empty.

### The API versions

They are settings rather than constants because both platforms retire versions on a date nobody chose.

**Meta.** Meta retires a Graph API version every year, and **`v21.0` is removed on 21 January 2027**. The plugin's default is `v26.0`, so the setting is there to make moving to the next version your decision on your own schedule rather than a plugin release on Meta's timetable.

**LinkedIn.** LinkedIn versions its APIs quarterly and each version lives two years; its own documentation carries a notice that the Marketing Version 202511 is sunset on 16 November 2026. The plugin's default is `202610`, and the version travels in the header on every `/rest/*` request.

## Connecting a provider

Connecting is the platform's own sign-in: Spora hands the browser to the provider, and the provider hands it back with a token. The token is stored encrypted and belongs to the **connection**, not to an account — one login, one token, many accounts.

The **Accounts** tab shows one card per connection, and the accounts it covers as cards inside it. A provider that has no connection yet gets a card of its own with a **Connect {provider}** button — and, when the provider is not set up on this instance, a setup card naming what is missing.

**The redirect URI is in the settings, not on this screen.** It is setup instruction, and the other Meta settings live beside it, so it sits in the **description** of the setting it is registered on: the **Meta configuration id** (`SPORA_SOCIAL_META_CONFIG_ID`) and the **LinkedIn client id**. Copy it from **Settings → Plugins**, where you are already filling in the app id, the secret and the configuration id.

Its shape is `{your-spora}/api/v1/plugins/social/oauth/{provider}/callback` — `meta` or `linkedin`. A mismatch is refused by the platform with a redirect-URI error that never mentions Spora's address, so it has to be right before you connect and not after. `SPORA_APP_URL` is what it is built from, so it has to be the address you registered — not the one the request happened to arrive on.

**The setting will not name a `localhost` address.** No platform accepts one, so a setting that named it would be telling the operator to register something that cannot work. The two refusals have different causes: with no address at all the connect says _The instance has no public address, so there is no redirect URI to register. Set SPORA_APP_URL_, and with a `localhost` address it is the reachability check that refuses — _SPORA_APP_URL must be a publicly reachable HTTPS address before an account can be connected_.

**A provider that is not set up cannot be connected.** Pressing Connect on one is refused with the same instruction the setup card carries, in one sentence: _Meta integration needs setup — add the app id, the app secret and the configuration id in Settings → Plugins_, or _LinkedIn integration needs setup — add the client id, the client secret and the requested permissions in Settings → Plugins_. The card splits that instruction in two: a title that names the provider's state, and a body that names the place to go. A provider that **is** set up but has no connection yet shows only its Connect button, because there is nothing left to instruct.

One connection can cover more than one account:

- **Meta** — the Instagram professional accounts and the Facebook Pages the client shared. The configuration names the assets, so one login publishes to both networks.
- **LinkedIn** — the member who signed in, and every organisation they administer (the organisations only when the organisation permission is on).

**A Meta token normally does not expire.** A system-user token "defaults to never expire", so its expiry is empty and the card says _Never expires_ — but Meta can send one, and the connection carries it when it does. It still stops working if the client removes the app from their business portfolio or moves the Instagram account to another one — then the client connects again.

**A LinkedIn token does expire**, so the connection carries the expiry, the status and the _needs reconnect_ flag, and a token inside its last ten days is renewed on the spot before the next publish. The platform's own error text does not say "reconnect" — that is the whole reason the plugin says it.

**The Facebook Pages and `business_management`.** A configuration can name a Facebook Page as an asset, but _listing_ the Pages a token may act for needs `business_management` — a broad permission that grants the whole business portfolio and needs its own review. The plugin does not ask for it. Without it the connection covers the Instagram account alone and the Pages are simply not there.

**Reconnect** runs the provider's sign-in again and replaces the stored token on the same connection. It is what a revoked or expired token needs; a token that merely needs renewing is renewed by itself.

## Checking it against the real platforms

The plugin ships a live suite that signs in for real against LinkedIn, Facebook and Instagram, publishes a post on every account it can reach, reads the numbers back, and takes the post down again where the platform allows it.

It exists because the adapter tests answer with **hand-written** responses. Those prove the plugin builds the request the way the code already understood it; they cannot prove the request is right — and things _were_ wrong that only the documentation could have told us: a missing LinkedIn version header, a wrong organisation scope, the wrong Instagram API host, a Graph API version on its way out, a wrong LinkedIn post-body field, a wrong image-URN key, and a wrong Instagram video parameter.

**Run it from the plugin's directory**, after `composer install`:

```bash
composer live
```

It is excluded from the ordinary test run — `composer test` and `composer test:parallel` both skip the `Live` testsuite — because it needs credentials and the network.

**The run prints the redirect URI to register** — one per provider, so the Meta callback appears once and covers both networks — and the authorization URL of every provider you gave it credentials for, and then asks you to paste back the URL the platform sent you to. `php bin/live --urls` prints the URIs and the authorization URLs and stops there, for when you want to collect the codes without running the checks.

### The variables it reads

The names carry `LIVE`, so a value is visibly the harness's and not the install's: the plugin's own settings are `SPORA_SOCIAL_*`, and the live suite never reads those.

| Variable                                                                                         | What it is                                                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SPORA_LIVE_LINKEDIN_CLIENT_ID` / `SPORA_LIVE_LINKEDIN_CLIENT_SECRET`                            | Your LinkedIn app's credentials.                                                                                                                  |
| `SPORA_LIVE_META_CLIENT_ID` / `SPORA_LIVE_META_CLIENT_SECRET`                                    | Your Meta app's credentials. One pair for both networks.                                                                                          |
| `SPORA_LIVE_META_CONFIG_ID`                                                                      | The Facebook Login for Business configuration the login dialog uses.                                                                              |
| `SPORA_LIVE_REDIRECT_URI`                                                                        | The public address of your install, e.g. `https://spora.example.com`. The per-provider callback is built from it exactly as the plugin builds it. |
| `SPORA_LIVE_PUBLIC_IMAGE_URL`                                                                    | A publicly reachable **JPEG** for Instagram to fetch. Instagram has no text-only post, and it takes no PNG.                                       |
| `SPORA_LIVE_LINKEDIN_ORGANIZATION_SCOPE`                                                         | Set it once your app holds `w_organization_social`.                                                                                               |
| `SPORA_LIVE_LINKEDIN_READ_ORG_ACLS` / `_READ_ORG_STATS` / `_READ_MEMBER_FEED` / `_READ_ORG_FEED` | Set the one once your app holds that read permission.                                                                                             |
| `SPORA_LIVE_GRAPH_API_VERSION` / `SPORA_LIVE_LINKEDIN_API_VERSION`                               | The versions to check against, when they differ from the plugin's defaults.                                                                       |
| `SPORA_LIVE_<PLATFORM>_REDIRECT_URL`                                                             | The URL the platform sent you back to, when you collected it in an earlier run.                                                                   |

### What to do first

The apps are the ones you set up for the install — see [The Meta app, step by step](#the-meta-app-step-by-step) and [The LinkedIn app, step by step](#the-linkedin-app-step-by-step). The redirect URI to register is the same one those steps point at in Settings → Plugins, and the run prints it again so you can copy it from the terminal.

**A public image for Instagram.** Instagram fetches the media from the internet, so the image has to be served from an address the platform can reach, and it has to be a JPEG. Put one on any public host and set `SPORA_LIVE_PUBLIC_IMAGE_URL` to it.

### What it leaves behind

The LinkedIn post is deleted again, and the Facebook post too where the platform allows it — the report says which of the two it managed to take down. **The Instagram post stays** — the API cannot delete a published media, so the live check leaves one post on your Instagram account. Run it on an account you are willing to post on.

### A skip is not a pass

```text
  linkedin   PASSED   7 passed, 0 failed, 0 skipped
  instagram  SKIPPED  0 passed, 0 failed, 5 skipped
             skipped: SPORA_LIVE_META_CLIENT_ID is not in the environment
```

A skipped check is not a passed check: it is a fact about the environment, not a verdict on the plugin. The command **exits non-zero when nothing was verified**, so a run without credentials cannot be mistaken for a green one.

## Publishing

The composer is the landing screen, for the operator writing one post by hand. It has an internal title, a message, the accounts to publish to, the media to publish, and what to do with it.

- **Title** — an internal label. It never reaches the network.
- **Message** — the shared body.
- **Publish to** — the accounts. Each network gets its own body if one was drafted for it, and the shared body otherwise.
- **Platform preview** — a live character counter per targeted network, and the media badges for that network.

**Draft with AI** asks the principal's configured model for copy and returns **one body per network**, because the post that reads well on LinkedIn is not the post that reads well on Instagram. It needs a language model; without one it answers _No language model is configured for this principal. Set a preferred configuration, or a global default._

**When** offers three: _Save as draft_, _Schedule_, _Publish now_. _Schedule_ here is the one-shot path — a post dated for a moment. The recurring path is the agent's own schedule; see [The agent that posts for you](#the-agent-that-posts-for-you).

**Publishing is irreversible on the target networks.** The composer says so; the agent path asks for approval first.

The outcome is recorded **per account**, because a post can succeed on one network and fail on another. A post's status is derived from those outcomes and never set on its own:

| Status      | Meaning                      |
| ----------- | ---------------------------- |
| `published` | Every target published.      |
| `partial`   | Some published, some failed. |
| `failed`    | None published.              |

**Retry failed** publishes only the accounts that failed and leaves the ones that went out alone.

**Take down** pulls a published post back down, one network at a time. LinkedIn and Facebook can delete a published post; **Instagram cannot** — its API has no delete for published media — so that target stays published and says why.

## Where to see what is going out

The Recurring screen went with the static slot. A fixed slot posted **the same words every week**, and its `{{placeholder}}` syntax only knew date and time variables — `{{headline}}` would have published as the literal string `{{headline}}`. LinkedIn and Meta ship native scheduled posts now, so a third-party static repeater competed on the weakest axis available, and no source-driven recurrence exists yet to replace it.

What did replace it is where the posts themselves are:

- **The Posts list** — a post the agent wrote is labelled **By an agent**, and one that is still waiting says **The agent will publish this.** Filter the list by status to see only what is **Scheduled**.
- **The Calendar** — the month's posts, on the day each one is due or went out.

The recurrence itself lives in the agent's own **Schedules** tab — the cron expression and the prompt are there, and that is where it is edited.

## The per-platform rules

Each network takes its own things, and the rules are the reason a post is rejected:

| Platform  | Media        | Types                     | Cap    | Body              |
| --------- | ------------ | ------------------------- | ------ | ----------------- |
| LinkedIn  | optional     | JPEG, PNG, GIF            | 8 MB   | 3,000 characters  |
| Facebook  | optional     | JPEG, PNG, GIF, BMP, MP4  | 1 GB   | 63,206 characters |
| Instagram | **required** | JPEG (image), MP4 (video) | 100 MB | 2,200 characters  |

**Both are enforced, per target.** Before it publishes, the backend checks every attachment against the rules of every target, and counts the body against that target's platform's limit. A body over it is refused with the numbers: _Over the limit: 5000 / 2200 characters for Instagram. Shorten the post._

Each platform is judged against **its own** body — `platform_bodies[platform]`, or the shared body when there is none for it — so one post aimed at LinkedIn and Instagram is checked twice, against each platform's limit. A post that is fine for LinkedIn and too long for Instagram fails **only the Instagram target**: the LinkedIn one goes out, and the post ends `partial`.

LinkedIn publishes images only in this version: no video, no carousel, no reel.

**Instagram takes no PNG at all** and cannot publish a text-only post. The plugin converts a PNG to a JPEG for you through core's own image producer and leaves the original untouched, so a PNG in the archive is not a reason an Instagram post fails.

**And one thing the plugin cannot check:** if the Instagram account is connected to a Page that requires Page Publishing Authorization, the platform refuses the publish until that authorization is completed. See [Operator prerequisites](#operator-prerequisites).

## Media

Media comes from the [Media Archive](/reference/concepts/media-assets). **Attach media** opens the host's own picker, which lists the archive and uploads — the plugin ships no upload dialog of its own. A tile click chooses, the **Attach** button commits.

A post carries **one** attachment, and the backend refuses a second: the publish sends one file, so a second would be a file the operator believes is going out and is not.

Every attachment carries its fit state **for the networks the post currently targets**, with the remedy named — _Convert to JPEG_, _Compress_, _Attach a JPEG image or an MP4 video_ — because the operator can act on that and not on a platform's error text. The same rules are checked again at publish time, against the media the platform will actually receive.

An agent does the same through the tools: `social_media` with `list_assets` to see the library, `check_fit` to ask whether an asset fits a network, and `attach` to put it on a post. Attach the **original** asset id — the backend converts for Instagram and publishes the bytes for LinkedIn and Facebook.

## The tools

Five tools, for the agents that write the posts. They are declared as `social_connections`, `social_post`, `social_media`, `social_analytics` and `social_calendar`; on the wire to the model they carry the plugin's slug — `social:social_post` — see [Concepts → Tools → Tool naming](/reference/concepts/tools#tool-naming).

| Tool                 | Operations                                                                      | What it is for                                                                    |
| -------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `social_connections` | `list`, `connect`, `disconnect`, `refresh`, `health`                            | The connections: one login per provider, and the accounts each one covers.        |
| `social_post`        | `create`, `schedule`, `publish`, `list`, `inspect`, `update`, `retry`, `delete` | The posts: draft one, date one, send one, look at what happened, take one down.   |
| `social_media`       | `list_assets`, `check_fit`, `prepare`, `attach`, `detach`                       | The Media Archive: what is there, whether it fits, and attaching it.              |
| `social_analytics`   | `post_metrics`, `period_totals`, `top_posts`, `network_comparison`              | What the posts did: one post, a period, the top posts, the networks side by side. |
| `social_calendar`    | `list_month`                                                                    | The posts of a month with the days they are due.                                  |

Several of them changed shape in the last round, and an agent that still reads them the old way will miss what is already going out:

- **`social_connections` replaced `social_accounts`.** The unit is the connection, not the account: one login per provider, and the accounts it covers ride inside it. `connect` takes a **provider** — `meta` or `linkedin` — and `disconnect`, `refresh` and `health` take a **connection id**.
- **`social_post` with `list` takes a `from` / `to` window** — two `YYYY-MM-DD` days. "What is going out this week" is one call: the window matches a post's scheduled date **or** the date it went out. It takes an `account_id` as well, so "what is going to that account" is the same call with one more argument.
- **`schedule` is the one call that schedules a post.** It creates the post and dates it in the same call, so there is no "create first, then date it" step and no second approval. The time is read in the timezone the post names: `"2026-11-02 09:00"` with `Europe/Berlin` goes out at 08:00 UTC. A value that carries its own offset — or a `Z` — is absolute, and wins over the named zone.
- **`social_calendar` is one operation.** `list_month` returns the month's posts with their dates.

A post an agent wrote is written down as such — `source: ai`. In the Posts list that is the label **By an agent**, and a scheduled one says **The agent will publish this.**

### The approval behaviour

Reads are free and writes are not, and the line is drawn at what each operation commits:

| Approval           | Operations                                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Not needed         | Every read: `list`, `inspect`, `health`, `list_assets`, `check_fit`, `prepare`, `list_month`, and all four `social_analytics` operations. |
| Not needed         | `create` — a draft goes nowhere.                                                                                                          |
| **The operator's** | `schedule`, `publish`, `update`, `retry`, `attach`, `detach`, `delete`, and the connection operations `connect`, `disconnect`, `refresh`. |

`schedule` needs the operator's agreement for one reason: it commits the copy to go out later **without asking again**. The operator sees the copy and the time once, and the worker publishes it when the moment comes. That is why `schedule` is gated and `create` is not.

## The numbers

Each network reports on its own post, in its own terms, and the plugin keeps the networks **apart**. They count reach differently — Instagram's impressions are not Facebook's impressions — so the rows stay separate and a combined figure is labelled a rough one rather than presented as a fact.

> **A LinkedIn member post reports reactions only.** `organizationalEntityShareStatistics` exists for organisation pages; a member post has no impressions and no click count. The reach and impressions columns are **empty by design** for every personal account, and the plugin says why rather than showing a zero that reads as "nobody saw it".
>
> **Instagram insights need a business or creator account.** A personal account has no media insights at all.
>
> **A missing permission is named, not guessed at.** The insights permissions are scopes on the connection's token, not properties of the account: an Instagram account whose token does not carry `instagram_manage_insights` cannot report insights, and its card says so. A token that never reported its scopes is not treated as one without them.
>
> **Every reading is a dated snapshot.** Impressions keep climbing for days after a post goes out and the platforms revise them. Nothing here is final.

The token's health sits on the **connection**, not on the accounts inside it: the expiry, the status and the _needs reconnect_ flag belong to the one login, and an account carries only what is its own. A Meta token normally does not expire, so it rarely needs a reconnect; a LinkedIn one does.

The first reading lands a couple of hours after a publish, and the collector reads the numbers again once a day after that.

## Development

```bash
composer install
composer analyse        # PHPStan
composer test:parallel # Pest
composer format        # php-cs-fixer
```

The panel is a separate repo, `spora-plugin-social-frontend`:

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

Both ship a German catalogue. The key is the English source string, so a copy edit orphans the German entry that was paired with it.

---

**Repo:** [spora-ai/spora-plugin-social](https://github.com/spora-ai/spora-plugin-social) · **MIT**
