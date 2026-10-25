/**
 * `@vuepress/plugin-shiki` reads its options from `markdown.shiki`, but the
 * package does not augment `MarkdownOptions` with that key, so `vue-tsc`
 * rejects a perfectly valid configuration.
 *
 * The options are the plugin's own (`@vuepress/plugin-shiki/dist/node`):
 * `theme` accepts a single Shiki theme name, `themes` a `{ light, dark }`
 * pair. The plugin's own default is the `themes` form, so setting `theme`
 * alone leaves the default pair in place.
 */
declare module '@vuepress/markdown' {
  interface MarkdownOptions {
    shiki?: {
      theme?: string
      themes?: { light: string; dark: string }
      [option: string]: unknown
    }
  }
}

export {}
