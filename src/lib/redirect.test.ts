import { describe, expect, it } from "vitest";
import {
  ADMIN_HOME,
  PORTAL_HOME,
  defaultTargetFor,
  isAllowedHost,
  resolveTarget,
  safeNext,
} from "~/lib/redirect";

describe("isAllowedHost", () => {
  it("accepts the root domain and its subdomains", () => {
    expect(isAllowedHost("tracht-digital.de")).toBe(true);
    expect(isAllowedHost("management.tracht-digital.de")).toBe(true);
    expect(isAllowedHost("app.tracht-digital.de")).toBe(true);
    expect(isAllowedHost("tools.tracht-digital.de")).toBe(true);
  });

  it("accepts localhost for dev", () => {
    expect(isAllowedHost("localhost")).toBe(true);
    expect(isAllowedHost("127.0.0.1")).toBe(true);
  });

  it("rejects foreign and look-alike hosts", () => {
    expect(isAllowedHost("evil.example")).toBe(false);
    // suffix trick: must be a real sub-label, not a substring
    expect(isAllowedHost("tracht-digital.de.evil.example")).toBe(false);
    expect(isAllowedHost("nottracht-digital.de")).toBe(false);
  });

  it("is case-insensitive (hostnames are)", () => {
    expect(isAllowedHost("Management.Tracht-Digital.DE")).toBe(true);
    expect(isAllowedHost("EVIL.EXAMPLE")).toBe(false);
  });

  it("rejects near-miss TLD and hyphen variants", () => {
    expect(isAllowedHost("tracht-digital.com")).toBe(false);
    expect(isAllowedHost("trachtdigital.de")).toBe(false);
    expect(isAllowedHost("tracht-digital.de.co")).toBe(false);
    // a bare label that merely ends with the domain text
    expect(isAllowedHost("xtracht-digital.de")).toBe(false);
  });

  it("rejects the empty host", () => {
    expect(isAllowedHost("")).toBe(false);
  });
});

describe("safeNext", () => {
  it("passes through an https URL on an allowed host", () => {
    const u = "https://management.tracht-digital.de/users?x=1";
    expect(safeNext(u)).toBe(u);
  });

  it("rejects http on a production host", () => {
    expect(safeNext("http://app.tracht-digital.de/")).toBeNull();
  });

  it("allows http on localhost (dev servers)", () => {
    expect(safeNext("http://localhost:4321/dashboard")).toBe("http://localhost:4321/dashboard");
  });

  it("rejects a foreign host even over https", () => {
    expect(safeNext("https://evil.example/steal")).toBeNull();
  });

  it("rejects garbage and empty input", () => {
    expect(safeNext("")).toBeNull();
    expect(safeNext(null)).toBeNull();
    expect(safeNext("javascript:alert(1)")).toBeNull();
    expect(safeNext("not a url")).toBeNull();
  });

  it("resolves a bare path against the base origin", () => {
    expect(safeNext("/foo", "https://app.tracht-digital.de")).toBe(
      "https://app.tracht-digital.de/foo",
    );
  });

  it("rejects a bare path when there is no base to resolve against", () => {
    expect(safeNext("/foo")).toBeNull();
  });

  // --- open-redirect attack shapes -------------------------------------------

  it("rejects the userinfo trick (real host is after the @)", () => {
    // `https://management.tracht-digital.de@evil.example/` looks in-family to a
    // human but the browser navigates to evil.example.
    expect(safeNext("https://management.tracht-digital.de@evil.example/")).toBeNull();
    expect(safeNext("https://tracht-digital.de:x@evil.example/steal")).toBeNull();
  });

  it("rejects a protocol-relative URL pointing off-domain", () => {
    // `//evil.example` inherits the current scheme — a classic bypass of naive
    // "starts with https://" checks.
    expect(safeNext("//evil.example/steal", "https://auth.tracht-digital.de")).toBeNull();
  });

  it("rejects non-http(s) schemes outright", () => {
    expect(safeNext("javascript:alert(document.cookie)")).toBeNull();
    expect(safeNext("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeNext("file:///etc/passwd")).toBeNull();
    expect(safeNext("ftp://tracht-digital.de/x")).toBeNull();
  });

  it("rejects a subdomain of a look-alike parent", () => {
    expect(safeNext("https://app.tracht-digital.de.evil.example/")).toBeNull();
    expect(safeNext("https://tracht-digital.de.evil.example/")).toBeNull();
  });

  it("accepts an allowed host on a non-standard port", () => {
    expect(safeNext("https://management.tracht-digital.de:8443/x")).toBe(
      "https://management.tracht-digital.de:8443/x",
    );
  });

  it("rejects https on 127.0.0.1's look-alikes but accepts the loopback pair", () => {
    expect(safeNext("http://127.0.0.1:4321/dashboard")).toBe("http://127.0.0.1:4321/dashboard");
    expect(safeNext("https://127.0.0.1.evil.example/")).toBeNull();
  });

  it("normalises the returned URL (so callers get a canonical target)", () => {
    expect(safeNext("https://app.tracht-digital.de")).toBe("https://app.tracht-digital.de/");
    expect(safeNext("HTTPS://APP.TRACHT-DIGITAL.DE/Foo")).toBe(
      "https://app.tracht-digital.de/Foo",
    );
  });

  it("preserves query and fragment on an allowed target", () => {
    const u = "https://management.tracht-digital.de/tickets?status=open#top";
    expect(safeNext(u)).toBe(u);
  });

  it("rejects undefined as well as null/empty", () => {
    expect(safeNext(undefined)).toBeNull();
  });
});

describe("defaultTargetFor / resolveTarget", () => {
  it("routes admins to management, others to the portal", () => {
    expect(defaultTargetFor({ isAdmin: true })).toBe(ADMIN_HOME);
    expect(defaultTargetFor({ isAdmin: false })).toBe(PORTAL_HOME);
    expect(defaultTargetFor(null)).toBe(PORTAL_HOME);
  });

  it("prefers a valid next over the role default", () => {
    const u = "https://app.tracht-digital.de/tickets";
    expect(resolveTarget(u, { isAdmin: true })).toBe(u);
  });

  it("falls back to the role default on a rejected next", () => {
    expect(resolveTarget("https://evil.example", { isAdmin: true })).toBe(ADMIN_HOME);
  });

  it("treats a principal without the flag as a portal user", () => {
    expect(defaultTargetFor({})).toBe(PORTAL_HOME);
    expect(defaultTargetFor(undefined as unknown as null)).toBe(PORTAL_HOME);
  });

  it("falls back to the role default on a missing next", () => {
    expect(resolveTarget(null, { isAdmin: false })).toBe(PORTAL_HOME);
    expect(resolveTarget(undefined, { isAdmin: true })).toBe(ADMIN_HOME);
    expect(resolveTarget("", null)).toBe(PORTAL_HOME);
  });

  it("uses the base origin when resolving a relative next", () => {
    expect(resolveTarget("/tickets", null, "https://app.tracht-digital.de")).toBe(
      "https://app.tracht-digital.de/tickets",
    );
  });

  it("never returns an off-domain target for any input", () => {
    const hostile = [
      "https://evil.example",
      "//evil.example",
      "javascript:alert(1)",
      "https://app.tracht-digital.de@evil.example",
      "http://app.tracht-digital.de",
    ];
    for (const raw of hostile) {
      const target = resolveTarget(raw, { isAdmin: true }, "https://auth.tracht-digital.de");
      expect(isAllowedHost(new URL(target).hostname)).toBe(true);
    }
  });

  it("exposes defaults that are themselves allowed hosts", () => {
    // Guards against a future typo in the constants creating a dead redirect.
    expect(safeNext(ADMIN_HOME)).toBe(`${ADMIN_HOME}/`);
    expect(safeNext(PORTAL_HOME)).toBe(`${PORTAL_HOME}/`);
  });
});
