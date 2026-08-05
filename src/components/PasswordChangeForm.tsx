import { useEffect, useState } from "react";
import { Spinner } from "@tracht-digital-solutions/tds-shared/components";
import { changePassword, fetchMe } from "~/lib/auth";
import { resolveTarget } from "~/lib/redirect";

const MIN_LEN = 12;

/**
 * Password change / forced first-change. Requires a valid session (reached
 * straight after a login, either voluntary via /passwort or forced when the
 * account carries `mustChangePassword`). Calls tds-auth-api `PUT /password`
 * ({old, new}); on success the API rotates the session and we forward to the
 * validated `?next=` (or a role-based default). Without a session it bounces
 * back to the login.
 */
export default function PasswordChangeForm() {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  const rawNext = (): string | null =>
    typeof location !== "undefined" ? new URLSearchParams(location.search).get("next") : null;

  // Guard: a password change needs an existing session. No session → login.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const me = await fetchMe();
      if (cancelled) return;
      if (!me) {
        const next = rawNext();
        location.replace(`/${next ? `?next=${encodeURIComponent(next)}` : ""}`);
        return;
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (newPw.length < MIN_LEN) {
      setError(`Das neue Passwort muss mindestens ${MIN_LEN} Zeichen lang sein.`);
      return;
    }
    if (newPw !== confirmPw) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    if (newPw === oldPw) {
      setError("Das neue Passwort muss sich vom alten unterscheiden.");
      return;
    }
    setBusy(true);
    try {
      const res = await changePassword(oldPw, newPw);
      if (!res.ok) {
        setError(
          res.status === 401
            ? "Das aktuelle Passwort ist falsch."
            : res.status === 422
              ? (res.error ?? "Das neue Passwort ist ungültig.")
              : "Änderung fehlgeschlagen. Bitte erneut versuchen.",
        );
        setBusy(false);
        return;
      }
      const me = await fetchMe();
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
        Aktuelles Passwort
        <input
          className="field-boxed"
          type="password"
          value={oldPw}
          onChange={(ev) => setOldPw(ev.target.value)}
          autoComplete="current-password"
          autoFocus
          required
        />
      </label>
      <label>
        Neues Passwort
        <input
          className="field-boxed"
          type="password"
          value={newPw}
          onChange={(ev) => setNewPw(ev.target.value)}
          autoComplete="new-password"
          minLength={MIN_LEN}
          required
        />
      </label>
      <label>
        Neues Passwort bestätigen
        <input
          className="field-boxed"
          type="password"
          value={confirmPw}
          onChange={(ev) => setConfirmPw(ev.target.value)}
          autoComplete="new-password"
          minLength={MIN_LEN}
          required
        />
      </label>
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? <Spinner size="sm" /> : "Passwort speichern"}
      </button>
    </form>
  );
}
