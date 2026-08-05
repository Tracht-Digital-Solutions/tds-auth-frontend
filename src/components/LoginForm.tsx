import { useEffect, useState } from "react";
import { Spinner } from "@tracht-digital-solutions/tds-shared/components";
import { fetchMe, login } from "~/lib/auth";
import { loginWithPasskey, passkeysSupported } from "~/lib/passkeys";
import { resolveTarget } from "~/lib/redirect";

/**
 * Central login form. On mount it honours an existing shared session (the
 * `Domain=.tracht-digital.de` cookie) and walks straight through to the target —
 * so a user already logged in on one panel never sees the form. On submit it
 * POSTs to tds-auth-api `/login`, forces the password-change screen when the
 * account is flagged, else re-confirms via `/me` and redirects to the validated
 * `?next=` (or a role-based default).
 */
export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  // Feature detection has to happen after hydration: the server-rendered HTML
  // is shared by every visitor, so deciding this at build time would show the
  // button to browsers that cannot use it.
  const [canUsePasskeys, setCanUsePasskeys] = useState(false);
  // Start in "checking" so we don't flash the form before the SSO probe.
  const [checking, setChecking] = useState(true);

  const rawNext = (): string | null =>
    typeof location !== "undefined" ? new URLSearchParams(location.search).get("next") : null;

  const goToPasswordChange = () => {
    const next = rawNext();
    const q = next ? `?next=${encodeURIComponent(next)}` : "";
    location.replace(`/passwort${q}`);
  };

  useEffect(() => {
    setCanUsePasskeys(passkeysSupported());
  }, []);

  // On-mount SSO: already authenticated anywhere → forward immediately.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const me = await fetchMe();
      if (cancelled) return;
      if (me) {
        if (me.mustChangePassword) {
          goToPasswordChange();
          return;
        }
        location.replace(resolveTarget(rawNext(), me, location.origin));
        return;
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Finish a successful sign-in: forced password change, else confirm + forward. */
  const proceed = async (mustChangePassword: boolean): Promise<string | null> => {
    if (mustChangePassword) {
      goToPasswordChange();
      return null;
    }
    // Confirm the cookie stuck before leaving (a blocked third-party cookie
    // becomes a message, not a redirect loop).
    const me = await fetchMe();
    if (!me) return "Sitzung konnte nicht bestätigt werden. Bitte erneut versuchen.";
    location.replace(resolveTarget(rawNext(), me, location.origin));
    return null;
  };

  const signInWithPasskey = async () => {
    setError(null);
    setPasskeyBusy(true);
    const res = await loginWithPasskey(remember);
    if (res.ok) {
      const message = await proceed(res.mustChangePassword === true);
      if (message === null) return; // navigating away
      setError(message);
      setPasskeyBusy(false);
      return;
    }
    // Dismissing the OS prompt is a decision, not a failure — saying
    // "fehlgeschlagen" there trains people to distrust the message.
    if (res.reason !== "abort") {
      setError(
        res.status === 429
          ? "Zu viele Versuche. Bitte später erneut versuchen."
          : res.status === 403
            ? "Dieses Konto ist deaktiviert."
            : "Anmeldung mit Passkey fehlgeschlagen. Bitte mit E-Mail und Passwort anmelden.",
      );
    }
    setPasskeyBusy(false);
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await login(email, password, remember);
      if (!res.ok) {
        setError(
          res.status === 401
            ? "E-Mail oder Passwort ist falsch."
            : res.status === 403
              ? "Dieses Konto ist deaktiviert."
              : res.status === 429
                ? "Zu viele Versuche. Bitte später erneut versuchen."
                : "Anmeldung fehlgeschlagen. Bitte erneut versuchen.",
        );
        setBusy(false);
        return;
      }
      const message = await proceed(res.mustChangePassword);
      if (message !== null) {
        setError(message);
        setBusy(false);
      }
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
      setBusy(false);
    }
  };

  if (checking) {
    return (
      <div className="grid place-items-center py-8" aria-busy="true">
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {error ? <p className="status-pill status-pill--danger auth-error">{error}</p> : null}
      <label>
        E-Mail
        <input
          className="field-boxed"
          type="email"
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          autoComplete="username"
          autoFocus
          required
        />
      </label>
      <label>
        Passwort
        <input
          className="field-boxed"
          type="password"
          value={password}
          onChange={(ev) => setPassword(ev.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      {/* Explicit id/htmlFor rather than a wrapping <label>: the wrapper would
          be a direct child of `.auth-form` and inherit the stacked, 600-weight
          field-label treatment, which is what made this read as a third input. */}
      <div className="auth-remember">
        <input
          id="remember-me"
          type="checkbox"
          checked={remember}
          onChange={(ev) => setRemember(ev.target.checked)}
        />
        <label htmlFor="remember-me">30 Tage angemeldet bleiben</label>
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy || passkeyBusy}>
        {busy ? <Spinner size="sm" /> : "Anmelden"}
      </button>

      {canUsePasskeys ? (
        <>
          <p className="auth-divider"><span>oder</span></p>
          {/* type="button": inside a <form>, a bare <button> submits it — the
              passkey flow would fire the password login at the same time. */}
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => void signInWithPasskey()}
            disabled={busy || passkeyBusy}
          >
            {passkeyBusy ? <Spinner size="sm" /> : "Mit Passkey anmelden"}
          </button>
        </>
      ) : null}
    </form>
  );
}
