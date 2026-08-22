/**
 * Passkey (WebAuthn) client for the central login site.
 *
 * The API serialises every binary field as **base64url** (the WebAuthn wire
 * convention), so this module is the whole translation layer: base64url →
 * `ArrayBuffer` on the way into `navigator.credentials`, and back again on the
 * way out. Nothing else in the app touches a buffer.
 *
 * Sign-in is **usernameless**: the request carries no `allowCredentials`, so the
 * authenticator offers its discoverable credentials for `tracht-digital.de` and
 * the user picks one. No email is typed, and there is no place to probe whether
 * an address has a passkey.
 */

import { authBase } from "./auth";

/** Feature detection. Old browsers, http:// origins and locked-down setups all land here. */
export function passkeysSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential === "function" &&
    typeof navigator !== "undefined" &&
    !!navigator.credentials
  );
}

function fromB64url(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function toB64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  // A spread into String.fromCharCode blows the argument limit on large
  // attestation objects; the loop is deliberate.
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Options as the API sends them: every binary field is a base64url string. */
interface WireOptions {
  publicKey: Record<string, unknown> & {
    challenge: string;
    user?: { id: string; name: string; displayName: string };
    excludeCredentials?: { id: string; type: string; transports?: string[] }[];
    allowCredentials?: { id: string; type: string; transports?: string[] }[];
  };
}

/**
 * The API decides the option set (create vs. get), so this stays structural:
 * decode the binary fields, hand the rest through untouched. Narrowing it to
 * one of the two DOM option types here would mean re-declaring the server's
 * schema in a second place, which is exactly how the two drift apart.
 */
function decodeOptions(wire: WireOptions): PublicKeyCredentialCreationOptions & PublicKeyCredentialRequestOptions {
  const pk = { ...wire.publicKey } as Record<string, unknown>;
  pk.challenge = fromB64url(wire.publicKey.challenge);
  if (wire.publicKey.user) {
    pk.user = { ...wire.publicKey.user, id: fromB64url(wire.publicKey.user.id) };
  }
  for (const key of ["excludeCredentials", "allowCredentials"] as const) {
    const list = wire.publicKey[key];
    if (list) pk[key] = list.map((c) => ({ ...c, id: fromB64url(c.id) }));
  }
  return pk as unknown as PublicKeyCredentialCreationOptions & PublicKeyCredentialRequestOptions;
}

// One resolver for both modules — see `authBase` in ./auth. Re-deriving the
// base here is how the two would eventually disagree about which host this site
// talks to.
//
// Note the RP ID is decided by the API (`tracht-digital.de`, the registrable
// domain), not by this base: re-pointing a host at an API with a different RP
// ID invalidates the passkeys already registered there. That is an operator
// concern, not something this module can detect.
const api = async (path: string, init?: RequestInit) =>
  fetch(`${await authBase()}${path}`, { credentials: "include", ...init });

const postJson = (path: string, body?: unknown) =>
  api(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export interface PasskeyLoginResult {
  ok: boolean;
  /** `"abort"` when the user simply dismissed the browser prompt — not an error. */
  reason?: "abort" | "unsupported" | "failed";
  status?: number;
  mustChangePassword?: boolean;
}

/** Sign in with a passkey. */
export async function loginWithPasskey(remember = false): Promise<PasskeyLoginResult> {
  if (!passkeysSupported()) return { ok: false, reason: "unsupported" };

  const optionsRes = await postJson("/passkeys/login/options");
  if (!optionsRes.ok) return { ok: false, reason: "failed", status: optionsRes.status };
  const options = decodeOptions((await optionsRes.json()) as WireOptions);

  let credential: PublicKeyCredential | null;
  try {
    credential = (await navigator.credentials.get({ publicKey: options })) as PublicKeyCredential | null;
  } catch (e) {
    // Dismissing the OS prompt throws NotAllowedError. That is a decision, not
    // a failure, and must not surface as "Anmeldung fehlgeschlagen".
    const name = e instanceof DOMException ? e.name : "";
    return { ok: false, reason: name === "NotAllowedError" || name === "AbortError" ? "abort" : "failed" };
  }
  if (!credential) return { ok: false, reason: "abort" };

  const assertion = credential.response as AuthenticatorAssertionResponse;
  const res = await postJson("/passkeys/login", {
    credentialId: credential.id,
    clientDataJSON: toB64url(assertion.clientDataJSON),
    authenticatorData: toB64url(assertion.authenticatorData),
    signature: toB64url(assertion.signature),
    remember,
  });

  if (!res.ok) return { ok: false, reason: "failed", status: res.status };
  const data = (await res.json().catch(() => ({}))) as { mustChangePassword?: boolean };
  return { ok: true, mustChangePassword: data.mustChangePassword === true };
}

export interface Passkey {
  id: number;
  credential_id: string;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
}

export async function listPasskeys(): Promise<Passkey[] | null> {
  const res = await api("/passkeys");
  if (!res.ok) return null;
  const data = (await res.json()) as { passkeys?: Passkey[] };
  return data.passkeys ?? [];
}

export interface RegisterResult {
  ok: boolean;
  reason?: "abort" | "unsupported" | "failed";
  status?: number;
  error?: string;
}

/** Register a new passkey for the signed-in user. */
export async function registerPasskey(name: string): Promise<RegisterResult> {
  if (!passkeysSupported()) return { ok: false, reason: "unsupported" };

  const optionsRes = await postJson("/passkeys/options");
  if (!optionsRes.ok) return { ok: false, reason: "failed", status: optionsRes.status };
  const options = decodeOptions((await optionsRes.json()) as WireOptions);

  let credential: PublicKeyCredential | null;
  try {
    credential = (await navigator.credentials.create({ publicKey: options })) as PublicKeyCredential | null;
  } catch (e) {
    const domName = e instanceof DOMException ? e.name : "";
    if (domName === "NotAllowedError" || domName === "AbortError") return { ok: false, reason: "abort" };
    // InvalidStateError means this authenticator is already registered — the
    // excludeCredentials list working as intended, and worth saying plainly.
    return {
      ok: false,
      reason: "failed",
      error: domName === "InvalidStateError" ? "Dieses Gerät ist bereits registriert." : undefined,
    };
  }
  if (!credential) return { ok: false, reason: "abort" };

  const attestation = credential.response as AuthenticatorAttestationResponse;
  const res = await postJson("/passkeys", {
    clientDataJSON: toB64url(attestation.clientDataJSON),
    attestationObject: toB64url(attestation.attestationObject),
    name,
  });

  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, reason: "failed", status: res.status, error: data.error };
}

export async function deletePasskey(id: number): Promise<{ ok: boolean; status: number }> {
  const res = await api(`/passkeys/${id}`, { method: "DELETE" });
  return { ok: res.ok, status: res.status };
}
