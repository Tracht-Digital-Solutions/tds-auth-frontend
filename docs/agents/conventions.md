# Styling and build conventions

## tds-shared

- Design tokens and components come from tds-shared (`base.css`, `app.css`, `ThemeToggle`,
  `CookieNotice`, `Spinner`). Don't re-inline them.
- tds-shared is a **0.x caret, minor-locked**: every shared minor needs an explicit repin. Validate it
  from a **fresh** `npm install --no-package-lock`; an incrementally grown `node_modules` can keep an
  older line alive while every local gate stays green.
- **`@source` for the shared package**, or its islands render unstyled. Shared React components use
  Tailwind utilities, and Tailwind ignores `node_modules` by default; the theme toggle once shipped as
  two raw stacked SVGs. The `@source` line must sit **after** the `@import`s (before is a build error).

## Build

- **Tailwind v4 via `@tailwindcss/postcss`** (`postcss.config.mjs`), never the Vite plugin. Deleting
  the file silently ships unstyled output.
- **Fontsource fonts are JS imports in `Layout.astro`**, never CSS `@import` in `global.css`
  (`@tailwindcss/postcss` doesn't rebase the woff2 URLs; every font 404s).
- **`vite.build` spreads `tdsViteBuild`** from `tds-shared/astro`; it pins `cssTarget` so lightningcss
  keeps the `backdrop-filter` prefix. Don't hand-author it.
- **Astro inline `<script>` / `<style>` bodies are raw**; never wrap them in `` {`...`} ``. The theme
  bootstrap depends on this.

## Type

The canonical stack: **Lato** display, **Plus Jakarta Sans** body, both tokens from tds-shared.
`global.css` declares **no** `--font-*` token (a local block once out-ranked the shared tokens and
shipped a face no other surface used). JetBrains Mono isn't installed; `--font-mono` has no call sites.

## noindex posture

`public/robots.txt` is `Disallow: /`, the layout hard-codes
`<meta name="robots" content="noindex,nofollow">`, and there is no sitemap integration. Don't add one.
