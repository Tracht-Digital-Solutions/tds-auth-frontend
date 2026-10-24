import { useEffect, useState } from "react";
import { Spinner } from "@tracht-digital-solutions/tds-shared/components";
import { confirmRegistration, register } from "~/lib/auth";
import { signalTyping } from "~/lib/artworkSignal";
import { safeNext } from "~/lib/redirect";
import { legalLinks } from "~/lib/site";
import { ErrorPill, Field, useFormError } from "~/components/formError";

const MIN_LEN = 12;

/**
 * Where the visitor wanted to go (e.g. the tools site's premium page). The
 * mailed link cannot carry it — the API builds that link — so the allowed
 * target waits in this origin's storage until the address is confirmed,
 * usually in the same browser. Never trusted on read: it goes through
 * `safeNext` again.
 */
export const NEXT_KEY = "tds-register-next";

function storedNext(): string | null {
  try {
    return safeNext(localStorage.getItem(NEXT_KEY));
  } catch {
    return null;
  }
}

/**
 * Self-registration, both halves on one page (`/registrieren`):
 *
 *  - without `?token=`: name, address, password. The API answers 202 for
 *    every acceptable request, so the confirmation is the same sentence
 *    whether the address is new or already has an account.
 *  - with `?token=` (the mailed link): confirm on load. On success the API
 *    issues no session; the visitor signs in with the chosen password.
 */
export default function RegisterForm() {
  const token = typeof location !== "undefined" ? new URLSearchParams(location.search).get("token") : null;
  return token ? <Confirm token={token} /> : <SignUp />;
}

function SignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const { setError, edited, pill, invalid, tip } = useFormError();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const next = safeNext(new URLSearchParams(location.search).get("next"));
    try {
      if (next) localStorage.setItem(NEXT_KEY, next);
    } catch {
      /* storage blocked: the visitor lands on the default target instead */
    }
  }, []);

  const submit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_LEN) {
      setError(`Das Passwort muss mindestens ${MIN_LEN} Zeichen lang sein.`, ["password"]);
      return;
    }
    if (password !== confirmPw) {
      setError("Die Passwörter stimmen nicht überein.", ["confirm"]);
      return;
    }
    setBusy(true);
    try {
      const res = await register(name.trim(), email.trim(), password);
      if (res.ok) {
        setSent(true);
        setPassword("");
        setConfirmPw("");
      } else if (res.status === 400) {
        setError(
          name.trim() === "" ? "Bitte einen Namen eingeben." : "Bitte eine gültige E-Mail-Adresse eingeben.",
          [name.trim() === "" ? "name" : "email"],
        );
      } else if (res.status === 422) {
        setError(`Das Passwort muss mindestens ${MIN_LEN} Zeichen lang sein.`, ["password"]);
      } else if (res.status === 404) {
        setError("Die Registrierung ist zurzeit geschlossen.");
      } else {
        setError(
          res.status === 429
            ? "Zu viele Anfragen. Bitte später erneut versuchen."
            : "Registrierung fehlgeschlagen. Bitte erneut versuchen.",
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
          Fast geschafft: Eine E-Mail mit einem Bestätigungslink ist unterwegs. Der Link gilt 24 Stunden. Besteht zu der
          Adresse schon ein Konto, kommt keine Mail — dann hilft „Passwort vergessen“.
        </p>
        <a className="btn btn-ghost" href="/">
          Zur Anmeldung
        </a>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <ErrorPill message={pill} />
      <Field tip={tip("name")}>
        <label>
          Name
          <input
            className="field-boxed"
            type="text"
            value={name}
            onChange={(ev) => {
              setName(ev.target.value);
              edited("name");
              signalTyping();
            }}
            aria-invalid={invalid("name")}
            autoComplete="name"
            maxLength={120}
            autoFocus
            required
          />
        </label>
      </Field>
      <Field tip={tip("email")}>
        <label>
          E-Mail
          <input
            className="field-boxed"
            type="email"
            value={email}
            onChange={(ev) => {
              setEmail(ev.target.value);
              edited("email");
              signalTyping();
            }}
            aria-invalid={invalid("email")}
            autoComplete="email"
            required
          />
        </label>
      </Field>
      <Field tip={tip("password")}>
        <label>
          Passwort (mindestens {MIN_LEN} Zeichen)
          <input
            className="field-boxed"
            type="password"
            value={password}
            onChange={(ev) => {
              setPassword(ev.target.value);
              edited("password");
              signalTyping();
            }}
            aria-invalid={invalid("password")}
            autoComplete="new-password"
            minLength={MIN_LEN}
            required
          />
        </label>
      </Field>
      <Field tip={tip("confirm")}>
        <label>
          Passwort bestätigen
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
      <p className="auth-note">
        Mit dem Anlegen gilt die <a href={legalLinks.datenschutz}>Datenschutzerklärung</a>. Das Konto wird erst nach
        Bestätigung der E-Mail-Adresse aktiv.
      </p>
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? <Spinner size="sm" /> : "Konto anlegen"}
      </button>
      <a className="btn btn-ghost" href="/">
        Schon ein Konto? Anmelden
      </a>
    </form>
  );
}

type ConfirmState = "busy" | "done" | "expired" | "failed";

function Confirm({ token }: { token: string }) {
  const [state, setState] = useState<ConfirmState>("busy");
  const [loginHref, setLoginHref] = useState("/");

  useEffect(() => {
    let live = true;
    confirmRegistration(token)
      .then((res) => {
        if (!live) return;
        if (res.ok) {
          const next = storedNext();
          try {
            localStorage.removeItem(NEXT_KEY);
          } catch {
            /* ignore */
          }
          setLoginHref(next ? `/?next=${encodeURIComponent(next)}` : "/");
          setState("done");
        } else {
          setState(res.status === 400 ? "expired" : "failed");
        }
      })
      .catch(() => live && setState("failed"));
    return () => {
      live = false;
    };
  }, [token]);

  if (state === "busy") {
    return (
      <div className="auth-form" aria-busy="true">
        <p role="status">
          <Spinner size="sm" /> Adresse wird bestätigt …
        </p>
      </div>
    );
  }
  if (state === "done") {
    return (
      <div className="auth-form">
        <p className="status-pill status-pill--success" role="status">
          Die Adresse ist bestätigt, das Konto ist aktiv.
        </p>
        <a className="btn btn-primary" href={loginHref}>
          Jetzt anmelden
        </a>
      </div>
    );
  }
  return (
    <div className="auth-form">
      <p className="status-pill status-pill--danger auth-error" role="alert">
        {state === "expired"
          ? "Dieser Link ist ungültig, abgelaufen oder wurde schon benutzt."
          : "Die Bestätigung ist fehlgeschlagen. Bitte den Link erneut öffnen."}
      </p>
      <a className="btn btn-primary" href="/registrieren">
        Erneut registrieren
      </a>
      <a className="btn btn-ghost" href="/">
        Zur Anmeldung
      </a>
    </div>
  );
}
