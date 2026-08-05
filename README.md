# Spora Docs

The documentation site for the [Spora](https://github.com/spora-ai/spora) project.

**Live site:** <https://docs.spora-ai.com>

## Stack

- [VuePress 2](https://v2.vuepress.vuejs.org/) (release candidate)
- [vuepress-theme-plume](https://vuepress-theme-plume.vuejs.plume.org/) — third-party theme
- Deployed to GitHub Pages

## Development

```bash
npm install
npm run dev        # local preview at http://localhost:8080
npm run build      # production build into docs/.vuepress/dist
npm run lint:md    # markdown lint
npm run format     # prettier
```

## Customising mail templates

System-email defaults are YAML files under `email-templates/`. A project-local file with the same template `name` takes precedence over the default bundled with `spora-core`.

```yaml
name: welcome
subject: 'Welcome to {{site_name}}'
body: |
  Hi {{user_name}},

  Your account is ready.
body_html: '<main>{markdown_html}</main>'
```

- `body` is CommonMark Markdown and is rendered to HTML and plain text.
- `body_html` is an optional trusted HTML shell. Include `{markdown_html}` where the rendered Markdown should be injected.
- `{{variable}}` placeholders are substituted at send time; unknown placeholders remain unchanged.

After changing YAML defaults, reconcile them with the database:

```bash
php bin/spora mail:templates:sync --check  # dry run; exits 1 on drift
php bin/spora mail:templates:sync          # prompt before overwriting each drifted row
php bin/spora mail:templates:sync --force  # overwrite without prompting
```

Existing installations must run `php bin/spora spora:install` first so the `body_text` column is renamed to `body`. Do not run `db:seed` solely to update mail templates.

## Project layout

```text
docs/
├── .vuepress/
│   ├── config.ts          # site + Plume theme config
│   ├── styles/index.scss  # brand tokens (Spora palette)
│   └── public/            # logo, favicon, og-image
├── index.md               # home page
├── guide/                 # Getting Started (4 tracks)
├── develop/               # Plugins + Projects
├── deploy/                # 4 deployment scenarios
├── reference/             # exact specs (env vars, CLI, API, schema)
├── about/                 # what is Spora, roadmap, FAQ, license
└── contribute/            # contributor docs
```

## Contributing

See [docs/contribute/index.md](docs/contribute/index.md). All changes go through pull requests.

## License

MIT — see [LICENSE](LICENSE).
