import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guards for the repo's structural posture — the AGENTS.md traps that fail
 * *silently* (the build stays green, production quietly breaks):
 *
 *  - noindex: this is a private surface. A stray sitemap or a dropped robots
 *    meta puts the login into Google.
 *  - Tailwind through @tailwindcss/postcss, never the Vite plugin (Astro 6 +
 *    rolldown, withastro/astro#16542) — the wrong one ships unstyled HTML.
 *  - Fontsource as JS imports in Layout.astro, never CSS @import in global.css
 *    — @tailwindcss/postcss doesn't rebase the woff2 URLs, so every font 404s
 *    and the page silently renders in the system fallback.
 *  - `vite.build` spreads `tdsViteBuild` — it pins the cssTarget that keeps
 *    lightningcss from dropping the -webkit-backdrop-filter prefix (Safari ≤17).
 *
 * These read source files rather than build output, so they cost nothing and
 * fail in review instead of in production.
 */

const repoRoot = new URL("..", import.meta.url);
const read = (rel: string) => readFileSync(new URL(rel, repoRoot), "utf8");

/**
 * Drop comments before a "must NOT contain" assertion — the configs *document*
 * these traps in prose ("no sitemap", "the cssTarget that…"), so a naive match
 * would fire on the warning rather than on a real regression. The `[^:]` guard
 * keeps `https://` inside string literals intact.
 */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const astroConfig = read("astro.config.mjs");
const astroConfigCode = code(astroConfig);
const postcssConfig = read("postcss.config.mjs");
const layout = read("src/layouts/Layout.astro");
const globalCss = read("src/styles/global.css");
const robots = read("public/robots.txt");
const pkg = JSON.parse(read("package.json")) as {
  version: string;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

describe("noindex posture (private surface)", () => {
  it("robots.txt disallows every crawler", () => {
    expect(robots).toMatch(/User-agent:\s*\*/i);
    expect(robots).toMatch(/^\s*Disallow:\s*\/\s*$/mi);
    // An Allow line would punch a hole in the blanket disallow.
    expect(robots).not.toMatch(/^\s*Allow:/mi);
  });

  it("the layout hard-codes the robots meta on every page", () => {
    expect(layout).toMatch(/<meta\s+name="robots"\s+content="noindex,nofollow"\s*\/>/);
  });

  it("has no sitemap integration", () => {
    // A sitemap on a noindex surface advertises exactly what we're hiding.
    expect(astroConfigCode).not.toMatch(/sitemap/i);
    expect(pkg.dependencies["@astrojs/sitemap"]).toBeUndefined();
    expect(pkg.devDependencies["@astrojs/sitemap"]).toBeUndefined();
  });
});

describe("build configuration", () => {
  it("stays a static site (no SSR — there is no Node on prod)", () => {
    expect(astroConfig).toMatch(/output:\s*"static"/);
    expect(astroConfig).not.toMatch(/output:\s*"server"/);
  });

  it("declares the production origin as the site", () => {
    expect(astroConfig).toMatch(/site:\s*"https:\/\/auth\.tracht-digital\.de"/);
  });

  it("runs Tailwind through @tailwindcss/postcss, not the Vite plugin", () => {
    expect(postcssConfig).toMatch(/"@tailwindcss\/postcss"/);
    expect(astroConfigCode).not.toMatch(/@tailwindcss\/vite/);
    expect(pkg.dependencies["@tailwindcss/vite"]).toBeUndefined();
    expect(pkg.dependencies["@tailwindcss/postcss"]).toBeDefined();
  });

  it("spreads the shared tdsViteBuild preset (keeps the backdrop-filter prefix)", () => {
    expect(astroConfig).toMatch(/tdsViteBuild/);
    expect(astroConfig).toMatch(/build:\s*\{\s*\.\.\.tdsViteBuild\s*\}/);
    // Hand-authoring cssTarget back in is what tds-shared#10 warns against.
    expect(astroConfigCode).not.toMatch(/cssTarget\s*:/);
  });
});

describe("font loading", () => {
  it("imports Fontsource from the layout frontmatter (so Vite emits the woff2)", () => {
    expect(layout).toMatch(/import "@fontsource\/lato\/400\.css";/);
    expect(layout).toMatch(/import "@fontsource-variable\/geist";/);
  });

  it("never @imports a Fontsource stylesheet from CSS", () => {
    // The trap: @tailwindcss/postcss inlines this without rebasing url(), so
    // zero font files ship and everything falls back to the system font.
    expect(globalCss).not.toMatch(/@import\s+["'][^"']*fontsource/i);
  });
});

describe("login chrome", () => {
  it("renders the artwork panel as aria-hidden decoration", () => {
    // It carries no information — announcing it would put a shrug in front of
    // every screen-reader user before they reach the form.
    expect(layout).toMatch(/class="auth-art"\s+aria-hidden="true"/);
    expect(layout).toContain("LoginArtwork");
  });

  it("puts the form BEFORE the artwork in the DOM", () => {
    // On a wide screen the artwork sits to the right and grid lifts it above
    // the form on narrow ones — but tab order follows the DOM, and it must
    // always reach the fields first. Swapping these two blocks to "fix" the
    // mobile layout would silently make decoration the first stop.
    expect(layout.indexOf('class="auth-panel"')).toBeLessThan(layout.indexOf('class="auth-art"'));
  });

  it("gates the artwork's entrance animation on prefers-reduced-motion", () => {
    // Opt-IN (`no-preference`), not opt-out: an animation that has to be
    // switched off is one that ships to everyone who never gets asked.
    expect(globalCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*no-preference\)/);
  });

  it("keeps the theme bootstrap as a raw inline script", () => {
    // Wrapping an Astro inline script body in {`...`} leaks literal backticks
    // into dist and kills the no-flash theme bootstrap.
    expect(layout).toMatch(/<script is:inline>/);
    expect(layout).not.toMatch(/<script is:inline>\s*\{`/);
    expect(layout).toContain('localStorage.getItem("tds-theme")');
  });
});

describe("package manifest", () => {
  it("exposes the commands CI and AGENTS.md rely on", () => {
    for (const script of ["build", "type-check", "test:run"]) {
      expect(pkg.scripts[script], `missing npm script: ${script}`).toBeDefined();
    }
  });

  it("carries a semver version", () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
