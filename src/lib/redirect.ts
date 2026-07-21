/**
 * Post-login redirect resolution + open-redirect guard.
 *
 * The panels bounce a logged-out visitor here with `?next=<absolute return URL>`
 * (the full origin+path they were trying to reach). Because that value ends up
 * in `location.replace`, it MUST be validated against an allow-list or it is an
 * open-redirect (phishing) vector: only same-family hosts are honoured.
 *
 * Allowed: any `https://` URL whose host is `tracht-digital.de` or a subdomain
 * of it; plus `http(s)://localhost[:port]` for local development. Anything else
 * (or a missing/garbage `next`) falls back to a role-based default derived from
 * the principal.
 */

const ROOT_DOMAIN = "tracht-digital.de";

/** Default landing targets when `next` is absent/invalid. */
export const ADMIN_HOME = "https://management.tracht-digital.de";
export const PORTAL_HOME = "https://app.tracht-digital.de";

/** True for hosts we are willing to redirect to. */
export function isAllowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1") return true;
  return h === ROOT_DOMAIN || h.endsWith(`.${ROOT_DOMAIN}`);
}

/**
 * Validate a raw `next` value. Returns the normalised absolute URL if it points
 * at an allowed host over an allowed scheme, else null. `base` (the current
 * origin) lets a bare-path `next` still resolve during development.
 */
export function safeNext(raw: string | null | undefined, base?: string): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return null;
  }
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  // Production hosts must be https; localhost may use http for dev servers.
  if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
    return null;
  }
  if (!isAllowedHost(url.hostname)) return null;
  return url.toString();
}

/** Role-based default when there is no usable `next`. */
export function defaultTargetFor(me: { isAdmin?: boolean } | null): string {
  return me?.isAdmin ? ADMIN_HOME : PORTAL_HOME;
}

/**
 * Resolve where to send the user after a successful auth: a validated `next`
 * wins, otherwise the role-based default.
 */
export function resolveTarget(
  raw: string | null | undefined,
  me: { isAdmin?: boolean } | null,
  base?: string,
): string {
  return safeNext(raw, base) ?? defaultTargetFor(me);
}
