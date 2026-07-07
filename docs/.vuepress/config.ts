import { viteBundler } from '@vuepress/bundler-vite'
import { defineUserConfig } from 'vuepress'
import { plumeTheme } from 'vuepress-theme-plume'

// Spora docs site configuration.
// - Bundler: Vite via @vuepress/bundler-vite
// - Theme: vuepress-theme-plume (https://theme-plume.vuejs.press)
// - Brand tokens applied via docs/.vuepress/styles/index.scss
// - Locales config wired so DE/FR/etc. can be added without restructuring

const repo = 'https://github.com/spora-ai/spora-docs'

export default defineUserConfig({
  // Served from / when the CNAME points docs.spora-ai.com at spora-ai.github.io
  base: '/',

  // Top-level site metadata
  lang: 'en-US',
  title: 'Spora',
  description: 'Self-hosted AI agent orchestration. Zero-config. Anywhere.',

  // The Vite bundler is required by VuePress 2 — not auto-inferred from the theme
  bundler: viteBundler(),

  // Locales config — only `en-US` populated for v1. To add another language,
  // copy the structure under a new locale key (e.g. '/de/') and translate.
  locales: {
    '/': {
      lang: 'en-US',
      title: 'Spora',
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
    // Dark mode is the default per the spora-landing brand spec
    appearance: 'force-dark',
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
    // Top nav — single-tier, matches the IA in the plan
    navbar: [
      { text: 'Guide', link: '/guide/' },
      { text: 'Develop', link: '/develop/' },
      { text: 'Deploy', link: '/deploy/' },
      { text: 'Reference', link: '/reference/' },
      { text: 'About', link: '/about/' },
    ],
    // Sidebar — auto-generated from the directory structure
    sidebar: {
      '/guide/': 'auto',
      '/develop/': 'auto',
      '/deploy/': 'auto',
      '/reference/': 'auto',
      '/about/': 'auto',
    },
    // Social links in the nav
    socials: [{ icon: 'github', link: 'https://github.com/spora-ai/spora' }],
    // Footer
    footer: 'Released under the MIT License. Copyright © 2026-present Fabian Graßl.',
  }),

  // Global <head> tags
  head: [
    ['meta', { name: 'theme-color', content: '#205158' }],
    ['meta', { property: 'og:site_name', content: 'Spora' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:url', content: 'https://docs.spora-ai.com' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['link', { rel: 'apple-touch-icon', href: '/favicon.svg' }],
  ],
})
