import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The two preconditions for the host-side wizard actually reaching this site.
 *
 * Both are invisible: break either one and the build is green, the tests are
 * green, `astro check` is green, and `/install/` still reports a successful
 * install — while the site keeps calling whatever URL Vite baked in. That is
 * the same fail-soft shape the wizard exists to fix, so it is worth two greps.
 */

const SRC = join(__dirname, "..");

describe("runtime configuration reaches this site", () => {
  it("the layout declares no tds-api-base meta tag", () => {
    // `runtimeConfig()` returns null WITHOUT a request when that tag is
    // present — it is the frontend host's deliberate opt-out for the admin and
    // customer panels, which know their API at build time. Rendering it here
    // would mean the wizard writes `tds-runtime.json` and nobody ever reads it.
    const layout = readFileSync(join(SRC, "layouts", "Layout.astro"), "utf8");
    expect(layout).not.toContain("tds-api-base");
  });

  it("no module pins the auth base at import time", () => {
    // `tds-runtime.json` is FETCHED, so a module-scope constant is evaluated
    // before the file has been read and would pin the baked value forever. Both
    // clients must therefore resolve per call, through `authBase()`.
    for (const file of ["auth.ts", "passkeys.ts"]) {
      const source = readFileSync(join(SRC, "lib", file), "utf8");
      const calls = source.match(/fetch\(`\$\{[^}]*\}/g) ?? [];
      for (const call of calls) {
        expect(call, `${file} builds a URL without awaiting authBase()`).toContain("await authBase()");
      }
    }
  });
});
