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
    // Top nav — Tailwind-style IA: Start → Concepts → Develop → Deploy → Reference
    navbar: [
      { text: 'Start', link: '/start/' },
      { text: 'Concepts', link: '/concepts/' },
      { text: 'Develop', link: '/develop/' },
      { text: 'Deploy', link: '/deploy/' },
      { text: 'Reference', link: '/reference/' },
    ],
    // Sidebar — auto-generated from the directory structure
    sidebar: {
      '/start/': 'auto',
      '/concepts/': 'auto',
      '/develop/': 'auto',
      '/deploy/': 'auto',
      '/reference/': 'auto',
      '/about/': 'auto',
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
