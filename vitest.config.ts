import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Unit-test harness for the login site. Astro's own correctness stays on
 * `npm run type-check`; this covers everything framework-agnostic:
 *
 *  - `src/lib/redirect.ts` — the `next` allow-list (open-redirect guard). This
 *    is the security-critical one; it must stay green.
 *  - `src/lib/auth.ts` — the tds-auth-api client (fetch stubbed, no network).
 *  - `src/components/*.tsx` — the two React islands, rendered in jsdom via
 *    Testing Library. Those files opt in with a `@vitest-environment jsdom`
 *    docblock; everything else runs in the cheaper node environment.
 *  - `tests/` — repo-posture guards (noindex, no sitemap, Tailwind via PostCSS,
 *    Fontsource as JS imports). They read the source files rather than build
 *    output, so they cost nothing and catch the AGENTS.md "silently ships
 *    broken" traps in review instead of in production.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    environment: "node",
    // Component tests stub globals (fetch, location); restore them per test so
    // a leaked stub can't make an unrelated file pass.
    restoreMocks: true,
    unstubGlobals: true,
  },
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
