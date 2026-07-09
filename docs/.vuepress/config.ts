import { viteBundler } from '@vuepress/bundler-vite'
import { defineUserConfig } from 'vuepress'
import { plumeTheme } from 'vuepress-theme-plume'

// Spora docs site configuration.
// - Bundler: Vite via @vuepress/bundler-vite
// - Theme: vuepress-theme-plume (https://theme-plume.vuejs.press)
// - Brand tokens applied via docs/.vuepress/styles/index.scss
// - Brand fonts (Barlow + JetBrains Mono) loaded via Google Fonts <link>
// - Locales config wired so DE/FR/etc. can be added without restructuring

const repo = 'https://github.com/spora-ai/spora-docs'

export default defineUserConfig({
  // Served from / when the CNAME points docs.spora-ai.com at spora-ai.github.io
  base: '/',

  // Top-level site metadata — title is empty so the navbar doesn't render a
  // redundant "Spora" text next to the wordmark logo (logo.svg already spells
  // "SPORA" with the spore pictogram).
  lang: 'en-US',
  title: '',
  description: 'Self-hosted AI agent orchestration. Zero-config. Anywhere.',

  // The Vite bundler is required by VuePress 2 — not auto-inferred from the theme
  bundler: viteBundler(),

  // Plume does not auto-load user styles from .vuepress/styles/ — we have to
  // wire it via VuePress's `userStyle` config option (path is relative to docs/,
  // not .vuepress/, so we go up one). Otherwise our brand SCSS is never imported.
  userStyle: '.vuepress/styles/index.scss',

  // Locales config — only `en-US` populated for v1. To add another language,
  // copy the structure under a new locale key (e.g. '/de/') and translate.
  locales: {
    '/': {
      lang: 'en-US',
      title: '',
      description: 'Self-hosted AI agent orchestration. Zero-config. Anywhere.',
    },
  },

  // Markdown options — Plume's bundled markdown-it plugins cover most of what we need
  markdown: {
    linkify: true,
    typographer: true,
    // Pin Shiki to a light theme to match the light code-block surface in
    // styles/index.scss (--spora-paper-deep bg, --spora-ink text). The default
    // Shiki theme paints near-white backgrounds per token, which read as muddy
    // against a dark surface; pinning the theme to github-light keeps the
    // token palette designed for a light surface.
    highlight: {
      theme: 'github-light',
    },
  },

  // Plume theme — extensive options; we start with the essentials
  theme: plumeTheme({
    // Light mode is the default — spora-landing uses sand (#faf6ec) for body
    // backgrounds and only paints the navbar / hero / footer / code blocks in
    // dark brown. Docs mirror that treatment.
    appearance: false,
    // Show last-updated timestamps + edit links
    lastUpdated: true,
    editLink: true,
    // Repo for edit links and the "View source" button
    docsRepo: repo,
    docsBranch: 'main',
    docsDir: 'docs',
    editLinkText: 'Edit this page on GitHub',
    // Site branding
    logo: '/logo.svg',
    logoDark: '/logo.svg',
    // Top nav — Tailwind-style IA: Getting Started → Develop → Deploy → Reference.
    // "Concepts" is no longer a top-level entry; it lives under Reference as
    // the "Architecture & concepts" sub-section (see the Reference sidebar
    // below) so it doesn't compete for prominence with the primary tracks.
    navbar: [
      { text: 'Getting Started', link: '/start/' },
      { text: 'Develop', link: '/develop/' },
      { text: 'Deploy', link: '/deploy/' },
      { text: 'Reference', link: '/reference/' },
    ],
    // Sidebar — explicit items arrays for sections where Plume's 'auto'
    // derivation would render kebab-case directory names ("classical-server",
    // "local", "shared-host", "plugins", "projects") instead of proper
    // titles. The 'text' override on each item pins the human label. The
    // index entry is pinned at the top of each section so Plume doesn't
    // auto-insert it in an unpredictable position. Sections not flagged
    // (start, concepts, about) stay on 'auto'.
    sidebar: {
      // /start/ uses explicit items so the three sub-section labels render
      // as "Operators", "Developers", and "End users" instead of the
      // kebab-case directory names. Same shape as the other explicit
      // entries below.
      '/start/': [
        { text: 'Overview', link: '/start/' },
        {
          text: 'Operators',
          items: [
            { text: 'Overview', link: '/start/operators/' },
            { text: 'Installation', link: '/start/operators/install' },
            { text: 'Environment variables', link: '/start/operators/env-vars' },
            { text: 'Customization', link: '/start/operators/customization' },
            { text: 'Security', link: '/start/operators/security' },
            { text: 'Day-2 operations', link: '/start/operators/operations' },
            { text: 'Backups', link: '/start/operators/backups' },
          ],
        },
        {
          text: 'Developers',
          items: [
            { text: 'Overview', link: '/start/developers/' },
            { text: 'Local setup', link: '/start/developers/local-setup' },
            { text: 'Project structure', link: '/start/developers/project-structure' },
            { text: 'Stack', link: '/start/developers/stack' },
            { text: 'How to add a tool', link: '/start/developers/how-to-add-a-tool' },
            { text: 'CLI & coding standards', link: '/start/developers/cli-and-coding-standards' },
          ],
        },
        {
          text: 'End users',
          items: [
            { text: 'Overview', link: '/start/end-users/' },
            { text: 'First conversation', link: '/start/end-users/first-conversation' },
            { text: 'Managing agents', link: '/start/end-users/managing-agents' },
            { text: 'Troubleshooting', link: '/start/end-users/troubleshooting' },
          ],
        },
      ],
      // /develop/ uses explicit items so the two sub-section labels render
      // as "Projects" and "Plugins" (proper case) instead of the kebab-case
      // directory names. Projects is intentionally first: a project can be
      // promoted into a plugin via a Composer package, so users looking to
      // extend Spora start at the project level and graduate to a plugin
      // when the code is ready to ship.
      '/develop/': [
        { text: 'Overview', link: '/develop/' },
        {
          text: 'Projects',
          items: [
            { text: 'Overview', link: '/develop/projects/' },
            { text: 'Scaffolding', link: '/develop/projects/scaffolding' },
          ],
        },
        {
          text: 'Plugins',
          items: [
            { text: 'Overview', link: '/develop/plugins/' },
            { text: 'Author guide', link: '/develop/plugins/author-guide' },
            { text: 'Install API', link: '/develop/plugins/install-api' },
            {
              text: 'Reference',
              items: [
                { text: 'Plugin skeleton', link: '/develop/plugins/reference/plugin-skeleton' },
                { text: 'Calendar', link: '/develop/plugins/reference/calendar' },
                { text: 'Email', link: '/develop/plugins/reference/email' },
                { text: 'MiniMax', link: '/develop/plugins/reference/minimax' },
                { text: 'Semantic Scholar', link: '/develop/plugins/reference/semantic-scholar' },
                { text: 'Serper', link: '/develop/plugins/reference/serper' },
                { text: 'Tavily', link: '/develop/plugins/reference/tavily' },
                { text: 'Weather', link: '/develop/plugins/reference/weather' },
                { text: 'World News', link: '/develop/plugins/reference/worldnews' },
                { text: 'Zernio', link: '/develop/plugins/reference/zernio' },
              ],
            },
          ],
        },
      ],
      '/about/': 'auto',
      '/deploy/': [
        { text: 'Overview', link: '/deploy/' },
        {
          text: 'Docker',
          items: [
            { text: 'Single container', link: '/deploy/docker/single-container' },
            { text: 'Multi-container', link: '/deploy/docker/multi-container' },
            { text: 'Custom build', link: '/deploy/docker/custom-build' },
          ],
        },
        { text: 'Classical server', link: '/deploy/classical-server/' },
        { text: 'Local — PHP / Ollama / LM Studio', link: '/deploy/local/' },
        {
          text: 'Shared host',
          items: [
            { text: 'Overview', link: '/deploy/shared-host/' },
            { text: 'Limitations', link: '/deploy/shared-host/limitations' },
          ],
        },
      ],
      '/reference/': [
        { text: 'Overview', link: '/reference/' },
        { text: 'API', link: '/reference/api' },
        { text: 'CLI', link: '/reference/cli' },
        { text: 'Config keys', link: '/reference/config-keys' },
        { text: 'Plugin schema', link: '/reference/plugin-schema' },
        {
          text: 'Architecture & concepts',
          items: [
            { text: 'Overview', link: '/reference/concepts/' },
            { text: 'Architecture', link: '/reference/concepts/architecture' },
            { text: 'Agent loop & async', link: '/reference/concepts/agent-loop-async' },
            { text: 'App extensions', link: '/reference/concepts/app-extension' },
            { text: 'Code documentation', link: '/reference/concepts/code-documentation' },
            { text: 'Drivers', link: '/reference/concepts/drivers' },
            { text: 'Error handling', link: '/reference/concepts/error-handling' },
            { text: 'Frontend architecture', link: '/reference/concepts/frontend-architecture' },
            { text: 'Interfaces', link: '/reference/concepts/interfaces' },
            { text: 'Logging', link: '/reference/concepts/logging' },
            { text: 'Media assets', link: '/reference/concepts/media-assets' },
            { text: 'Plugin system', link: '/reference/concepts/plugins-system' },
            { text: 'Schema', link: '/reference/concepts/schema' },
            { text: 'Testing', link: '/reference/concepts/testing' },
            { text: 'Tools', link: '/reference/concepts/tools' },
            { text: 'Worker deployment', link: '/reference/concepts/worker-deployment' },
          ],
        },
      ],
    },
    // Social links in the nav
    socials: [{ icon: 'github', link: 'https://github.com/spora-ai/spora' }],
    // Footer — 4-column layout matching https://spora-ai.com/ (logo + tagline + 4 link groups + closing line)
    footer: {
      copyright: '© 2026 — Released under the MIT License.',
      message: `
<div class="spora-footer-grid">
  <div class="spora-footer-brand">
    <a href="https://spora-ai.com/" class="spora-footer-logo" rel="noopener">
      <strong>Spora docs</strong>
    </a>
    <p>Self-hosted AI agent orchestration. Built so your tools, your models, and your data stay where you put them.</p>
    <p class="spora-footer-tagline">Built for self-hosters.</p>
  </div>
  <div class="spora-footer-col">
    <h4>Project</h4>
    <ul>
      <li><a href="https://github.com/spora-ai/spora" rel="noopener">Source</a></li>
      <li><a href="https://github.com/spora-ai/spora/releases" rel="noopener">Releases</a></li>
      <li><a href="https://github.com/spora-ai/spora/blob/main/LICENSE" rel="noopener">MIT License</a></li>
    </ul>
  </div>
  <div class="spora-footer-col">
    <h4>Community</h4>
    <ul>
      <li><a href="https://github.com/spora-ai/spora/discussions" rel="noopener">Discussions</a></li>
      <li><a href="https://github.com/spora-ai/spora/blob/main/CONTRIBUTING.md" rel="noopener">Contributing</a></li>
      <li><a href="https://github.com/spora-ai/spora/issues" rel="noopener">Issues</a></li>
    </ul>
  </div>
  <div class="spora-footer-col">
    <h4>In the Ecosystem</h4>
    <ul>
      <li><a href="https://github.com/spora-ai/spora-core" rel="noopener">spora-core</a></li>
      <li><a href="https://github.com/spora-ai/spora-frontend" rel="noopener">spora-frontend</a></li>
      <li><a href="https://github.com/spora-ai/installer" rel="noopener">spora-installer</a></li>
      <li><a href="https://github.com/spora-ai/spora-plugin-skeleton" rel="noopener">plugin-skeleton</a></li>
    </ul>
  </div>
  <div class="spora-footer-col">
    <h4>Legal</h4>
    <ul>
      <li><a href="https://spora-ai.com/impressum.html" rel="noopener">Imprint</a></li>
      <li><a href="https://spora-ai.com/privacy.html" rel="noopener">Privacy</a></li>
      <li><a href="https://spora-ai.com/" rel="noopener">Back to spora-ai.com</a></li>
    </ul>
  </div>
</div>
`,
    },
  }),

  // Global <head> tags — Spora brand font preload + site meta
  head: [
    // Google Fonts: Barlow (sans) + JetBrains Mono (code), per spora-landing spec
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    [
      'link',
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
      },
    ],
    // Site meta — matches the brown ink of the spora-landing palette
    ['meta', { name: 'theme-color', content: '#33221a' }],
    ['meta', { property: 'og:site_name', content: 'Spora' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:url', content: 'https://docs.spora-ai.com' }],
    // Brand assets
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['link', { rel: 'apple-touch-icon', href: '/favicon.svg' }],
  ],
})
