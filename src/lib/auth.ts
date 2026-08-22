/**
 * Auth client for the central login site. Talks to tds-auth-api (a pure JSON
 * API). The real session is the httpOnly `tds_session` cookie the API sets with
 * `Domain=.tracht-digital.de` — so a login performed here is immediately valid
 * on every sibling panel (management. / app. / tools.) with no token hand-off.
 * JS never reads that cookie; identity is learned via GET /me.
 *
 * ### Where the base comes from
 *
 * This is a static Astro build: Vite inlines `PUBLIC_AUTH_API_URL` at build
 * time, so a deployed `dist/` could not be re-pointed at another API without a
 * CI rebuild. The host-side wizard at `/install/` closes that — it writes
 * `tds-runtime.json` beside `index.html`, and {@link authBase} prefers it.
 */

import { runtimeAbsolute } from "@tracht-digital-solutions/tds-shared/api";

/**
 * The build-time fallback, inlined by Vite.
 *
 * Still exported: it is what a host nobody has run `/install/` on uses, and it
 * is the value every resolution below falls back to.
 */
export const AUTH_API_URL: string =
  (import.meta.env.PUBLIC_AUTH_API_URL as string | undefined) ??
  "https://api.tracht-digital.de/auth";

/**
 * Where this page's auth calls actually go.
 *
 * Resolved per call rather than once at module scope, because
 * `tds-runtime.json` is FETCHED: a module constant is evaluated before the file
 * has been read and would pin the baked value forever. `runtimeConfig()`
 * memoises the request, so every call after the first awaits an
 * already-settled promise.
 *
 * ABSOLUTE only — that is what `runtimeAbsolute` buys. Proxy mode publishes a
 * relative base (`/api/auth`) and `install/proxy.php` deliberately drops
 * `Set-Cookie`, so a login through it would answer 200 and start no session at
 * all: success reported, nobody signed in, nothing in any log.
 * `install/profiles/auth.php` sets `proxy => false` so this site can never be
 * put in that mode; this is the second lock on the same door.
 */
export const authBase = (): Promise<string> => runtimeAbsolute("authBase", AUTH_API_URL);

/** The authenticated principal, as returned by tds-auth-api GET /me. */
export interface Me {
  userId: number;
  email: string;
  name?: string | null;
  isAdmin?: boolean;
  customerId?: number | null;
  companies?: { id: number; permissions: string[] }[];
  permissions?: string[];
  mustChangePassword?: boolean;
  expiresAt?: number | null;
}

/** Read the current principal, or null if there is no valid session. */
export async function fetchMe(): Promise<Me | null> {
  try {
    const res = await fetch(`${await authBase()}/me`, { credentials: "include" });
    return res.ok ? ((await res.json()) as Me) : null;
  } catch {
    return null;
  }
}

export interface LoginResult {
  ok: boolean;
  status: number;
  mustChangePassword: boolean;
}

/**
 * POST /login. On success the API sets the shared session cookie.
 *
 * `remember` opts into "30 Tage angemeldet bleiben": a SECOND httpOnly cookie
 * holding a rotating remember-me token. The session JWT stays short-lived
 * either way — staying signed in is a refresh at `/refresh`, not a longer
 * token, so a disabled account stops working within the hour rather than in 30
 * days. Sent only as an explicit `true`.
 */
export async function login(email: string, password: string, remember = false): Promise<LoginResult> {
  const res = await fetch(`${await authBase()}/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, remember }),
  });
  let mustChangePassword = false;
  if (res.ok) {
    try {
      const data = (await res.json()) as { mustChangePassword?: boolean };
      mustChangePassword = data.mustChangePassword === true;
    } catch {
      /* body optional — the cookie is what matters */
    }
  }
  return { ok: res.ok, status: res.status, mustChangePassword };
}

export interface PasswordResult {
  ok: boolean;
  status: number;
  error?: string;
}

/**
 * PUT /password — body {old, new}. Requires a valid session (the just-issued
 * login cookie). The API enforces a 12-char minimum and that new differs from
 * old, and rotates the session on success.
 */
export async function changePassword(oldPw: string, newPw: string): Promise<PasswordResult> {
  const res = await fetch(`${await authBase()}/password`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ old: oldPw, new: newPw }),
  });
  let error: string | undefined;
  if (!res.ok) {
    try {
      const data = (await res.json()) as { error?: string };
      error = data.error;
    } catch {
      /* ignore */
    }
  }
  return { ok: res.ok, status: res.status, error };
}
