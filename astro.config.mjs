import { defineConfig } from "astro/config";
import react from "@astrojs/react";
// Shared CSS minify settings (incl. the cssTarget that keeps lightningcss from
// dropping the header backdrop-filter prefix). See tds-shared#10.
import { tdsViteBuild } from "@tracht-digital-solutions/tds-shared/astro";

// The central login site (auth.tracht-digital.de). It is a private surface: no
// sitemap, robots.txt disallows all, and the layout hard-codes a noindex meta.
export default defineConfig({
  site: "https://auth.tracht-digital.de",
  output: "static",
  integrations: [react()],

  /**
   * Prefetch the page under the pointer (2026-09-29).
   *
   * Astro's own prefetch, NOT `<ClientRouter>`: it fetches the document into the
   * browser's cache and the click that follows is an ordinary navigation, so
   * nothing about how this site loads changes.
   *
   * `hover` rather than `viewport`: this is a login, its links are few and mostly
   * legal pages, and fetching all of them to show one form is payload for
   * nothing.
   */
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },

  trailingSlash: "ignore",
  build: {
    format: "directory",
    // Inline small stylesheets into <head> so critical CSS ships in the initial
    // HTML and the browser doesn't round-trip before paint.
    inlineStylesheets: "auto",
  },
  image: {
    service: { entrypoint: "astro/assets/services/sharp" },
  },
  vite: {
    build: { ...tdsViteBuild },
  },
});
