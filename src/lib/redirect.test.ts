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
});
