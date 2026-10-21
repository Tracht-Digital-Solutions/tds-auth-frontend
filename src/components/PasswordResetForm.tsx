import { useState } from "react";
import { Spinner } from "@tracht-digital-solutions/tds-shared/components";
import { confirmPasswordReset, requestPasswordReset } from "~/lib/auth";
import { signalTyping } from "~/lib/artworkSignal";

const MIN_LEN = 12;

/**
 * Forgotten password, both halves on one page (`/passwort-vergessen`):
 *
 *  - without `?token=`: ask for the address. The API answers 202 for every
 *    well-formed address, so the confirmation is the same sentence whether an
 *    account exists or not — the page must not undo that.
 *  - with `?token=` (the mailed link): set a new password. On success the API
 *    issues no session; the user signs in with the new password.
 */
export default function PasswordResetForm() {
  const token = typeof location !== "undefined" ? new URLSearchParams(location.search).get("token") : null;
  return token ? <SetPassword token={token} /> : <RequestLink />;
}

function RequestLink() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await requestPasswordReset(email.trim());
      if (res.ok) {
        setSent(true);
      } else {
        setError(
          res.status === 429
            ? "Zu viele Anfragen. Bitte später erneut versuchen."
            : res.status === 400
              ? "Bitte eine gültige E-Mail-Adresse eingeben."
              : "Anfrage fehlgeschlagen. Bitte erneut versuchen.",
        );
      }
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
    }
    setBusy(false);
  };

  if (sent) {
    return (
      <div className="auth-form">
        <p className="status-pill status-pill--success" role="status">
          Wenn zu dieser Adresse ein Konto besteht, ist eine E-Mail mit einem Link unterwegs. Der Link gilt eine Stunde.
        </p>
        <a className="btn btn-ghost" href="/">
          Zur Anmeldung
        </a>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {error ? (
        <p className="status-pill status-pill--danger auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <label>
        E-Mail
        <input
          className="field-boxed"
          type="email"
          value={email}
          onChange={(ev) => {
            setEmail(ev.target.value);
            signalTyping();
          }}
          autoComplete="email"
          autoFocus
          required
        />
      </label>
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? <Spinner size="sm" /> : "Link anfordern"}
      </button>
      <a className="btn btn-ghost" href="/">
        Zurück zur Anmeldung
      </a>
    </form>
  );
}

function SetPassword({ token }: { token: string }) {
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

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
    setBusy(true);
    try {
      const res = await confirmPasswordReset(token, newPw);
      if (res.ok) {
        setDone(true);
      } else if (res.status === 400) {
        setExpired(true);
      } else {
        setError(
          res.status === 422
            ? (res.error ?? "Das neue Passwort ist ungültig.")
            : res.status === 429
              ? "Zu viele Versuche. Bitte später erneut versuchen."
              : "Änderung fehlgeschlagen. Bitte erneut versuchen.",
        );
      }
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
    }
    setBusy(false);
  };

  if (done) {
    return (
      <div className="auth-form">
        <p className="status-pill status-pill--success" role="status">
          Das neue Passwort ist gespeichert. Alle bisherigen Anmeldungen sind beendet.
        </p>
        <a className="btn btn-primary" href="/">
          Jetzt anmelden
        </a>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="auth-form">
        <p className="status-pill status-pill--danger auth-error" role="alert">
          Dieser Link ist ungültig, abgelaufen oder wurde schon benutzt.
        </p>
        <a className="btn btn-primary" href="/passwort-vergessen">
          Neuen Link anfordern
        </a>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {error ? (
        <p className="status-pill status-pill--danger auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <label>
        Neues Passwort
        <input
          className="field-boxed"
          type="password"
          value={newPw}
          onChange={(ev) => {
            setNewPw(ev.target.value);
            signalTyping();
          }}
          autoComplete="new-password"
          minLength={MIN_LEN}
          autoFocus
          required
        />
      </label>
      <label>
        Neues Passwort bestätigen
        <input
          className="field-boxed"
          type="password"
          value={confirmPw}
          onChange={(ev) => {
            setConfirmPw(ev.target.value);
            signalTyping();
          }}
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
