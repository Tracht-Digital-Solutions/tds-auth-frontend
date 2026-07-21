import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Unit-test harness for the login site's framework-agnostic logic. Astro stays
 * on `npm run type-check`; this covers the `src/lib` helpers — most importantly
 * the `next`-redirect allow-list (open-redirect guard), which is security-
 * sensitive and cheap to pin.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
