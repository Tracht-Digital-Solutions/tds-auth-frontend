import { describe, expect, it } from "vitest";
import { site } from "~/lib/site";
import { isAllowedHost } from "~/lib/redirect";

/**
 * The site metadata is three constants, but two of them are load-bearing: the
 * origin has to match `astro.config.mjs`'s `site` (canonical/meta) and has to
 * be a host the redirect allow-list accepts — otherwise the login site cannot
 * even redirect to itself.
 */
describe("site metadata", () => {
  it("is the production login origin, https, no trailing slash", () => {
    expect(site.origin).toBe("https://auth.tracht-digital.de");
    expect(new URL(site.origin).protocol).toBe("https:");
    expect(site.origin.endsWith("/")).toBe(false);
  });

  it("sits on an allow-listed host", () => {
    expect(isAllowedHost(new URL(site.origin).hostname)).toBe(true);
  });

  it("carries a German name and description for the meta tags", () => {
    expect(site.name).toBe("Tracht Digital Solutions");
    expect(site.description.length).toBeGreaterThan(10);
    expect(site.description.length).toBeLessThan(160); // meta description budget
  });
});
