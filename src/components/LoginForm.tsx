import { useEffect, useState } from "react";
import { Spinner } from "@tracht-digital-solutions/tds-shared/components";
import { fetchMe, login } from "~/lib/auth";
import { signalTyping } from "~/lib/artworkSignal";
import { loginWithPasskey, passkeysSupported } from "~/lib/passkeys";
import { resolveTarget } from "~/lib/redirect";

/**
 * Lucide `eye` / `eye-off`, hand-inlined — this site pulls in no icon library,
 * and two paths do not justify one. Purely decorative: the button carries the
 * accessible name, so these stay `aria-hidden`.
 */
const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
} as const;

function EyeIcon() {
  return (
    <svg {...iconProps}>
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg {...iconProps}>
      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
      <path d="m2 2 20 20" />
    </svg>
  );
}

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
  // Momentary, never a toggle: the password is legible only for as long as the
  // button is physically held down (see the reveal button below).
  const [revealed, setRevealed] = useState(false);
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

  /**
   * Release the reveal GLOBALLY, not just on the button.
   *
   * The press can end anywhere: the pointer may be dragged off the button
   * before it is lifted, the browser may steal it (a touch turning into a
   * scroll fires `pointercancel`), or the window may lose focus while the
   * finger is still down. Every one of those leaves an `onPointerUp` on the
   * button unfired — and the failure mode is a password sitting on screen in
   * plain text, which is exactly what this control must never do. The listeners
   * exist only while something is actually revealed.
   */
  useEffect(() => {
    if (!revealed) return;
    const conceal = () => setRevealed(false);
    window.addEventListener("pointerup", conceal);
    window.addEventListener("pointercancel", conceal);
    window.addEventListener("blur", conceal);
    return () => {
      window.removeEventListener("pointerup", conceal);
      window.removeEventListener("pointercancel", conceal);
      window.removeEventListener("blur", conceal);
    };
  }, [revealed]);

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

  const submit = async (e: React.SubmitEvent<HTMLFormElement>) => {
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
      {/* Every text field announces its keystrokes so the artwork island can
          answer them — see `artworkSignal.ts` for why this is an explicit call
          and not a listener over there. The signal carries no payload; the
          checkbox below deliberately does not send one. */}
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
          autoComplete="username"
          autoFocus
          required
        />
      </label>
      {/* The reveal button lives INSIDE the label, which is safe: label
          activation is skipped when the click target is interactive content,
          so pressing the eye does not also re-focus the input. The input stays
          the label's control because it is the first labelable descendant. */}
      <label>
        Passwort
        <span className="auth-password">
          <input
            className="field-boxed auth-password__input"
            type={revealed ? "text" : "password"}
            value={password}
            onChange={(ev) => {
              setPassword(ev.target.value);
              signalTyping();
            }}
            autoComplete="current-password"
            required
          />
          {/* Hold to read, release to mask — deliberately NOT a toggle, so an
              unlocked password can never be left standing on screen.
              `preventDefault` on pointerdown suppresses the focus that the
              compatibility mousedown would move here, keeping the caret in the
              field; the keyboard path (Enter/Space held) is handled separately
              because it produces no pointer events at all. */}
          <button
            className="auth-password__reveal"
            type="button"
            aria-label="Passwort anzeigen, solange gedrückt gehalten wird"
            title="Gedrückt halten, um das Passwort zu prüfen"
            data-revealed={revealed ? "true" : "false"}
            onPointerDown={(ev) => {
              ev.preventDefault();
              setRevealed(true);
            }}
            onKeyDown={(ev) => {
              if (ev.key !== "Enter" && ev.key !== " ") return;
              ev.preventDefault(); // Space would scroll the page
              if (!ev.repeat) setRevealed(true);
            }}
            onKeyUp={(ev) => {
              if (ev.key === "Enter" || ev.key === " ") setRevealed(false);
            }}
            onBlur={() => setRevealed(false)}
          >
            {revealed ? <EyeIcon /> : <EyeOffIcon />}
          </button>
        </span>
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
