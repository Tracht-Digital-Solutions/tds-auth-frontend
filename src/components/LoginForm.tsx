import { useEffect, useState } from "react";
import { Spinner } from "@tracht-digital-solutions/tds-shared/components";
import { fetchMe, login } from "~/lib/auth";
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
  const [busy, setBusy] = useState(false);
  // Start in "checking" so we don't flash the form before the SSO probe.
  const [checking, setChecking] = useState(true);

  const rawNext = (): string | null =>
    typeof location !== "undefined" ? new URLSearchParams(location.search).get("next") : null;

  const goToPasswordChange = () => {
    const next = rawNext();
    const q = next ? `?next=${encodeURIComponent(next)}` : "";
    location.replace(`/passwort${q}`);
  };

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

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await login(email, password);
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
      if (res.mustChangePassword) {
        goToPasswordChange();
        return;
      }
      // Confirm the cookie stuck before leaving (a blocked third-party cookie
      // becomes a message, not a redirect loop).
      const me = await fetchMe();
      if (!me) {
        setError("Sitzung konnte nicht bestätigt werden. Bitte erneut versuchen.");
        setBusy(false);
        return;
      }
      location.replace(resolveTarget(rawNext(), me, location.origin));
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
          className="field"
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
          className="field"
          type="password"
          value={password}
          onChange={(ev) => setPassword(ev.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      <button className="btn-primary" type="submit" disabled={busy}>
        {busy ? <Spinner size="sm" /> : "Anmelden"}
      </button>
    </form>
  );
}
