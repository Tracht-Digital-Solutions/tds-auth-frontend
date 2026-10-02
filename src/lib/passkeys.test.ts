// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { primeRuntimeConfig, resetRuntimeConfig } from "@tracht-digital-solutions/tds-shared/api";
import { deletePasskey, listPasskeys, loginWithPasskey } from "~/lib/passkeys";

/**
 * The passkey client never rejects. A network failure used to escape as a
 * rejected promise, and the callers — invoked through `void` — kept their busy
 * flags set, leaving both sign-in buttons disabled with nothing on screen.
 */

beforeEach(() => {
  primeRuntimeConfig(null);
  // Feature detection passes, so the request is what fails.
  vi.stubGlobal("PublicKeyCredential", function PublicKeyCredential() {});
  Object.defineProperty(navigator, "credentials", { configurable: true, value: { get: vi.fn(), create: vi.fn() } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetRuntimeConfig();
});

const offline = () => vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

describe("network failures", () => {
  it("sign-in resolves to a failure", async () => {
    offline();
    await expect(loginWithPasskey()).resolves.toEqual({ ok: false, reason: "failed" });
  });

  it("listing says `failed`, not `signed-out` — a hiccup must not log the user out", async () => {
    offline();
    await expect(listPasskeys()).resolves.toBe("failed");
  });

  it("listing says `signed-out` only for 401/403", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    await expect(listPasskeys()).resolves.toBe("signed-out");
  });

  it("removing reports status 0", async () => {
    offline();
    await expect(deletePasskey(3)).resolves.toEqual({ ok: false, status: 0 });
  });
});
