import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_API_URL, changePassword, fetchMe, login, type Me } from "~/lib/auth";

/**
 * Contract tests for the tds-auth-api client. `fetch` is stubbed — nothing here
 * touches the network. What is pinned:
 *
 *  - every call carries `credentials: "include"` (the shared `tds_session`
 *    cookie IS the session; dropping it silently breaks SSO for every panel),
 *  - a non-OK or throwing response degrades to a value the callers can act on,
 *    never an unhandled rejection,
 *  - a 200 with an unparseable body is still a success (the cookie is what
 *    matters — the JSON body is advisory).
 */

/** Build a minimal Response-alike; `json` throws when `body` is the sentinel. */
const BAD_JSON = Symbol("unparseable body");

function res(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === BAD_JSON) throw new SyntaxError("Unexpected end of JSON input");
      return body;
    },
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The request `init` of the nth (default: first) fetch call. */
function callInit(n = 0): RequestInit {
  return fetchMock.mock.calls[n][1] as RequestInit;
}

function callUrl(n = 0): string {
  return fetchMock.mock.calls[n][0] as string;
}

describe("AUTH_API_URL", () => {
  it("defaults to the production gateway's auth prefix", () => {
    // PUBLIC_AUTH_API_URL is unset in the test env, so the fallback applies.
    expect(AUTH_API_URL).toBe("https://api.tracht-digital.de/auth");
  });

  it("is an absolute https URL with no trailing slash", () => {
    // A trailing slash would produce `//me` on every call.
    expect(AUTH_API_URL).toMatch(/^https:\/\//);
    expect(AUTH_API_URL.endsWith("/")).toBe(false);
  });
});

describe("fetchMe", () => {
  const me: Me = { userId: 7, email: "julian@tracht-digital.de", isAdmin: true };

  it("returns the principal on 200", async () => {
    fetchMock.mockResolvedValue(res(200, me));
    await expect(fetchMe()).resolves.toEqual(me);
  });

  it("calls GET /me with credentials so the shared cookie rides along", async () => {
    fetchMock.mockResolvedValue(res(200, me));
    await fetchMe();
    expect(callUrl()).toBe(`${AUTH_API_URL}/me`);
    expect(callInit().credentials).toBe("include");
  });

  it("returns null on 401 (no session)", async () => {
    fetchMock.mockResolvedValue(res(401, { error: "unauthenticated" }));
    await expect(fetchMe()).resolves.toBeNull();
  });

  it("returns null on a server error rather than throwing", async () => {
    fetchMock.mockResolvedValue(res(500));
    await expect(fetchMe()).resolves.toBeNull();
  });

  it("swallows a network failure and returns null", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(fetchMe()).resolves.toBeNull();
  });

  it("returns null when a 200 body is not JSON", async () => {
    // res.json() rejecting inside the try must still degrade to "no session".
    fetchMock.mockResolvedValue(res(200, BAD_JSON));
    await expect(fetchMe()).resolves.toBeNull();
  });
});

describe("login", () => {
  it("POSTs credentials as JSON to /login", async () => {
    fetchMock.mockResolvedValue(res(200, {}));
    await login("julian@tracht-digital.de", "hunter2hunter2");

    expect(callUrl()).toBe(`${AUTH_API_URL}/login`);
    const init = callInit();
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      email: "julian@tracht-digital.de",
      password: "hunter2hunter2",
    });
  });

  it("reports success without a forced password change", async () => {
    fetchMock.mockResolvedValue(res(200, { mustChangePassword: false }));
    await expect(login("a@b.de", "pw")).resolves.toEqual({
      ok: true,
      status: 200,
      mustChangePassword: false,
    });
  });

  it("surfaces mustChangePassword from the body", async () => {
    fetchMock.mockResolvedValue(res(200, { mustChangePassword: true }));
    await expect(login("a@b.de", "pw")).resolves.toMatchObject({
      ok: true,
      mustChangePassword: true,
    });
  });

  it("treats a truthy-but-not-true flag as no forced change", async () => {
    // The check is a strict `=== true`; "1"/1 must not trip the change screen.
    fetchMock.mockResolvedValue(res(200, { mustChangePassword: "1" }));
    await expect(login("a@b.de", "pw")).resolves.toMatchObject({
      ok: true,
      mustChangePassword: false,
    });
  });

  it("still succeeds when the 200 body is unparseable", async () => {
    // The cookie is the session; an empty/HTML body must not fail the login.
    fetchMock.mockResolvedValue(res(200, BAD_JSON));
    await expect(login("a@b.de", "pw")).resolves.toEqual({
      ok: true,
      status: 200,
      mustChangePassword: false,
    });
  });

  it.each([
    [401, "wrong credentials"],
    [403, "disabled account"],
    [429, "rate limited"],
    [500, "server error"],
  ])("passes status %i (%s) back to the caller", async (status) => {
    fetchMock.mockResolvedValue(res(status, { error: "nope" }));
    await expect(login("a@b.de", "pw")).resolves.toEqual({
      ok: false,
      status,
      mustChangePassword: false,
    });
  });

  it("does not read the body of a failed response", async () => {
    // A 401 body is irrelevant; parsing it would be a needless failure mode.
    const failed = res(401, BAD_JSON);
    fetchMock.mockResolvedValue(failed);
    await expect(login("a@b.de", "pw")).resolves.toMatchObject({ ok: false, status: 401 });
  });

  it("propagates a network error to the caller", async () => {
    // Unlike fetchMe, login lets the rejection through — the form catches it
    // and shows "Netzwerkfehler".
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(login("a@b.de", "pw")).rejects.toThrow(TypeError);
  });
});

describe("changePassword", () => {
  it("PUTs {old, new} as JSON to /password with credentials", async () => {
    fetchMock.mockResolvedValue(res(204, {}));
    await changePassword("oldpassword12", "newpassword12");

    expect(callUrl()).toBe(`${AUTH_API_URL}/password`);
    const init = callInit();
    expect(init.method).toBe("PUT");
    expect(init.credentials).toBe("include");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    // The API's field names are `old`/`new`, NOT oldPassword/newPassword.
    expect(JSON.parse(init.body as string)).toEqual({
      old: "oldpassword12",
      new: "newpassword12",
    });
  });

  it("reports success with no error", async () => {
    fetchMock.mockResolvedValue(res(200, {}));
    await expect(changePassword("a", "b")).resolves.toEqual({
      ok: true,
      status: 200,
      error: undefined,
    });
  });

  it("surfaces the API's error message on a 422", async () => {
    fetchMock.mockResolvedValue(res(422, { error: "Passwort zu kurz." }));
    await expect(changePassword("a", "b")).resolves.toEqual({
      ok: false,
      status: 422,
      error: "Passwort zu kurz.",
    });
  });

  it("reports a 401 (wrong current password) with no message", async () => {
    fetchMock.mockResolvedValue(res(401, {}));
    await expect(changePassword("a", "b")).resolves.toEqual({
      ok: false,
      status: 401,
      error: undefined,
    });
  });

  it("degrades to no message when the error body is unparseable", async () => {
    fetchMock.mockResolvedValue(res(500, BAD_JSON));
    await expect(changePassword("a", "b")).resolves.toEqual({
      ok: false,
      status: 500,
      error: undefined,
    });
  });

  it("does not read the body of a successful response", async () => {
    fetchMock.mockResolvedValue(res(204, BAD_JSON));
    await expect(changePassword("a", "b")).resolves.toMatchObject({ ok: true, status: 204 });
  });

  it("propagates a network error to the caller", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(changePassword("a", "b")).rejects.toThrow(TypeError);
  });
});
