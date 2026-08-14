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
const artwork = read("src/components/LoginArtwork.tsx");

/**
 * Body of the first `prefers-reduced-motion: no-preference` block, extracted by
 * counting braces — a regex cannot see which `}` closes the at-rule once there
 * are nested rules inside it.
 */
const noPreferenceBlock = (() => {
  const start = globalCss.indexOf("@media (prefers-reduced-motion: no-preference)");
  if (start < 0) return "";
  const open = globalCss.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < globalCss.length; i++) {
    if (globalCss[i] === "{") depth++;
    else if (globalCss[i] === "}" && --depth === 0) return globalCss.slice(open, i);
  }
  return "";
})();
/**
 * The declarations of one rule, comment-stripped.
 *
 * Slicing from `indexOf(selector)` is not good enough here: these selectors are
 * *named in the prose* above their own rule, so a naive slice lands inside the
 * comment and the assertion reads the explanation instead of the CSS.
 */
function ruleBody(selector: string): string {
  const source = code(globalCss);
  const at = source.indexOf(`${selector} {`);
  if (at < 0) return "";
  return source.slice(source.indexOf("{", at) + 1, source.indexOf("}", at));
}

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

  it("keeps every looping ambient animation opt-in too", () => {
    // tds-shared's base.css clamps `animation-iteration-count: 1` and a 0.01ms
    // duration on `*` under `reduce`. That clamp is built for entrance
    // animations, whose end state IS the resting state — it does NOT switch a
    // loop off. A loop declared outside the opt-in block runs once, instantly,
    // and freezes on its final keyframe, which is the one reduced-motion failure
    // an audit never looks for.
    for (const name of [
      "auth-art-drift",
      "auth-art-orbit",
      "auth-art-slide",
      "auth-art-pulse",
      "auth-art-sway",
    ]) {
      expect(noPreferenceBlock, `${name} must sit inside the opt-in block`).toContain(name);
    }
    expect(globalCss.replace(noPreferenceBlock, "")).not.toMatch(/animation:[^;]*infinite/);
  });

  it("wires the artwork's motion variables end to end", () => {
    // A mistyped custom property is invalid at computed-value time: the whole
    // `transform` computes to `none`, the shape simply never moves, and nothing
    // is logged. Checked in both directions — a variable declared and never read
    // is dead weight the next reader will trust.
    //
    // The stylesheet declares a couple of these itself (the resting energy), so
    // those count as supplied. What must never happen is a `var()` that NOTHING
    // sets.
    const declared = new Set([
      ...[...artwork.matchAll(/"(--auth-[a-z-]+)"/g)].map((m) => m[1]!),
      ...[...globalCss.matchAll(/^\s*(--auth-[a-z-]+):/gm)].map((m) => m[1]!),
    ]);
    const used = new Set([...globalCss.matchAll(/var\((--auth-[a-z-]+)/g)].map((m) => m[1]!));
    expect([...used].filter((name) => !declared.has(name))).toEqual([]);
    // The reverse only covers what the COMPONENT writes: a property it sets and
    // no rule reads is a shape that will never move.
    const written = [...artwork.matchAll(/"(--auth-[a-z-]+)"/g)].map((m) => m[1]!);
    expect([...new Set(written)].filter((name) => !used.has(name))).toEqual([]);
  });

  it("never reads the pointer's position", () => {
    // The composition answers the PRESENCE of a pointer, never its coordinates.
    // Both halves of the old behaviour looked fine on screen and were the
    // problem: a rAF loop wrote normalised offsets onto the stage for a
    // parallax, and a disc was translated to sit under the crosshair. Either
    // one coming back is a design regression, not a bug, so nothing downstream
    // would ever fail.
    expect(artwork).not.toMatch(/clientX|getBoundingClientRect|requestAnimationFrame/);
    expect(artwork).not.toMatch(/onPointer(Move|Leave|Enter)/);
    expect(globalCss).not.toMatch(/--auth-glow|auth-art__glow|auth-art__follow/);
  });

  it("sizes the blur filter region in user space, not against the bbox", () => {
    // A percentage region is a fraction of the path's GEOMETRIC bbox (strokes
    // excluded). A nearly flat ribbon has almost none, so at these blur radii the
    // filter is clipped into a hard straight edge across the panel.
    expect(artwork).toMatch(/filterUnits="userSpaceOnUse"/);
  });

  it("keeps the tilt on a group INSIDE the animated one", () => {
    // A CSS transform animation on the tilt group would override the SVG
    // presentation attribute outright (author CSS always wins) and the tilt would
    // vanish for the whole animation, with no error.
    expect(artwork.indexOf("auth-art__sway")).toBeLessThan(artwork.indexOf("transform={`rotate("));
  });

  it("keeps every pointer/typing response inside the reduced-motion opt-in", () => {
    // The interaction is motion like any other. Declared outside the opt-in
    // block it would keep running for someone who asked for none — and unlike a
    // keyframe set, a `transition` is not touched at all by tds-shared's
    // `reduce` clamp, so nothing downstream would catch it.
    for (const rule of [
      ".auth-art__pose",
      ".auth-art__mark--accent",
      ".auth-art__breathe",
      ".auth-art__ripple",
      ".auth-art__stage:hover",
    ]) {
      expect(noPreferenceBlock, `${rule} must sit inside the opt-in block`).toContain(rule);
    }
  });

  it("gates the imperative response in JS as well", () => {
    // The keystroke bursts are Web Animations, which no media query can switch
    // off. (The hover pose is pure CSS and lives inside the opt-in block above,
    // which is why nothing in the component touches it.)
    expect(artwork).toMatch(/matchMedia\("\(prefers-reduced-motion: no-preference\)"\)/);
    expect(artwork).toMatch(/if \(!motionOk\) return;\s*\n\s*return onTyping\(pulse\)/);
  });

  it("limits the hover response to real pointing devices", () => {
    // A tap latches `:hover` on a touch screen until something else is tapped,
    // so the composition would sit in its pose permanently — with no way back,
    // because there is no `pointerleave` behind a finger that lifted.
    expect(noPreferenceBlock).toMatch(/@media \(hover: hover\) and \(pointer: fine\)/);
    const touchGate = noPreferenceBlock.indexOf("@media (hover: hover)");
    expect(noPreferenceBlock.indexOf(".auth-art__stage:hover")).toBeGreaterThan(touchGate);
  });

  it("keeps the hover pose on its own group, off the animated one", () => {
    // `.auth-art__m--*` already animates `transform`, and an animation beats any
    // other declaration of the same property outright — collapsing the two
    // groups makes the pose silently never appear.
    expect(ruleBody(".auth-art__pose")).toMatch(/transition:\s*transform/);
    expect(ruleBody(".auth-art__pose")).not.toMatch(/animation:/);
    expect(artwork).toMatch(/className="auth-art__pose"[\s\S]{0,300}auth-art__m--/);
  });

  it("keeps each mark's alpha overridable by the hover rules", () => {
    // As a presentation attribute (`stroke-opacity`/`fill-opacity`), not as an
    // inline `opacity` on the group: inline styles beat author CSS, so the
    // structure's hover brightening would be silently ignored. The pulse
    // keyframes therefore rest at 1 and multiply, rather than naming an
    // absolute opacity.
    expect(artwork).toMatch(/strokeOpacity=\{mark\.opacity\}/);
    expect(artwork).toMatch(/fillOpacity=\{mark\.opacity\}/);
    expect(globalCss).toMatch(/@keyframes auth-art-pulse\s*\{\s*0%,\s*100%\s*\{\s*opacity:\s*1;/);
  });

  it("keeps the screen blend the composition is built on", () => {
    // Overlapping ribbons read as light rather than as stacked paint only under
    // `screen`; without it the panel goes muddy and the palette stops working.
    expect(globalCss).toMatch(/mix-blend-mode:\s*screen/);
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
