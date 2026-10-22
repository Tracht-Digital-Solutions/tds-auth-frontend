import { useEffect, useRef, useState } from "react";
import { Spinner } from "@tracht-digital-solutions/tds-shared/components";
import { changePassword, fetchMe, type Me } from "~/lib/auth";
import { signalTyping } from "~/lib/artworkSignal";
import { resolveTarget } from "~/lib/redirect";
import { ErrorPill, Field, useFormError } from "~/components/formError";

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
  const { setError, edited, pill, invalid, tip } = useFormError();
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  // The account seen by the guard below. After the change the session is read
  // again for a fresh answer, but a transient failure there must not decide
  // the destination: `null` means "customer", which sent admins to the portal.
  const knownMe = useRef<Me | null>(null);

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
      knownMe.current = me;
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
      setError(`Das neue Passwort muss mindestens ${MIN_LEN} Zeichen lang sein.`, ["new"]);
      return;
    }
    if (newPw !== confirmPw) {
      setError("Die Passwörter stimmen nicht überein.", ["confirm"]);
      return;
    }
    if (newPw === oldPw) {
      setError("Das neue Passwort muss sich vom alten unterscheiden.", ["new"]);
      return;
    }
    setBusy(true);
    try {
      const res = await changePassword(oldPw, newPw);
      if (!res.ok) {
        if (res.status === 401) setError("Das aktuelle Passwort ist falsch.", ["old"]);
        else if (res.status === 422) setError(res.error ?? "Das neue Passwort ist ungültig.", ["new"]);
        else setError("Änderung fehlgeschlagen. Bitte erneut versuchen.");
        setBusy(false);
        return;
      }
      const me = (await fetchMe()) ?? knownMe.current;
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
      <ErrorPill message={pill} />
      {/* Same artwork signal as the login form — see `artworkSignal.ts`. A form
          that forgets it leaves the composition inert with nothing logged, so
          this suite asserts the emission. */}
      <Field tip={tip("old")}>
        <label>
          Aktuelles Passwort
          <input
            className="field-boxed"
            type="password"
            value={oldPw}
            onChange={(ev) => {
              setOldPw(ev.target.value);
              edited("old");
              signalTyping();
            }}
            aria-invalid={invalid("old")}
            autoComplete="current-password"
            autoFocus
            required
          />
        </label>
      </Field>
      <Field tip={tip("new")}>
        <label>
          Neues Passwort
          <input
            className="field-boxed"
            type="password"
            value={newPw}
            onChange={(ev) => {
              setNewPw(ev.target.value);
              edited("new");
              signalTyping();
            }}
            aria-invalid={invalid("new")}
            autoComplete="new-password"
            minLength={MIN_LEN}
            required
          />
        </label>
      </Field>
      <Field tip={tip("confirm")}>
        <label>
          Neues Passwort bestätigen
          <input
            className="field-boxed"
            type="password"
            value={confirmPw}
            onChange={(ev) => {
              setConfirmPw(ev.target.value);
              edited("confirm");
              signalTyping();
            }}
            aria-invalid={invalid("confirm")}
            autoComplete="new-password"
            minLength={MIN_LEN}
            required
          />
        </label>
      </Field>
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? <Spinner size="sm" /> : "Passwort speichern"}
      </button>
    </form>
  );
}
