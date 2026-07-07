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
