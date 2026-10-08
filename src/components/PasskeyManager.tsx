import { useEffect, useState } from "react";
import { ConfirmDialog, Spinner } from "@tracht-digital-solutions/tds-shared/components";
import { fetchMe } from "~/lib/auth";
import { signalTyping } from "~/lib/artworkSignal";
import {
  deletePasskey,
  listPasskeys,
  passkeysSupported,
  registerPasskey,
  type Passkey,
} from "~/lib/passkeys";

/**
 * Passkey management for the signed-in user: list, add, remove.
 *
 * This site has no toast host (it is two pages and a form), so every outcome —
 * success and failure alike — stays **in the flow** as a status line. That is
 * also the right call for the content: "Passkey hinzugefügt" sits next to the
 * row it just created, and a failure names what to do next.
 */
export default function PasskeyManager() {
  // Decided after mount, like LoginForm does. Reading it in the initializer ran
  // during the prerender too, where `window` does not exist — the static HTML
  // said "this browser cannot", and hydration then disagreed with it.
  const [supported, setSupported] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Passkey | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async (isCurrent: () => boolean = () => true) => {
    const list = await listPasskeys();
    if (!isCurrent()) return;
    if (list === "signed-out") {
      // No session (or it just expired). Bounce to the login and come back —
      // the same absolute `?next=` contract the panels use.
      location.replace(`/?next=${encodeURIComponent(location.href)}`);
      return;
    }
    if (list === "failed") {
      setStatus({ tone: "danger", text: "Passkeys konnten nicht geladen werden. Bitte später erneut versuchen." });
    } else {
      setPasskeys(list);
    }
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    setSupported(passkeysSupported());
    void (async () => {
      // Confirm a session exists before rendering anything account-specific.
      const me = await fetchMe();
      if (cancelled) return;
      if (!me) {
        location.replace(`/?next=${encodeURIComponent(location.href)}`);
        return;
      }
      await load(() => !cancelled);
    })();
    return () => {
      cancelled = true;
    };
    // `load` is recreated each render and reads only setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = async () => {
    setStatus(null);
    setBusy(true);
    const label = name.trim() || defaultLabel();
    const res = await registerPasskey(label);
    if (res.ok) {
      setName("");
      setStatus({ tone: "ok", text: `Passkey „${label}“ hinzugefügt.` });
      await load();
    } else if (res.reason === "abort") {
      // Dismissing the OS prompt is a decision, not an error.
      setStatus(null);
    } else {
      setStatus({
        tone: "danger",
        text: res.error ?? `Passkey konnte nicht hinzugefügt werden${res.status ? ` (HTTP ${res.status})` : ""}.`,
      });
    }
    setBusy(false);
  };

  const remove = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const res = await deletePasskey(pendingDelete.id);
    if (res.ok) {
      setStatus({ tone: "ok", text: "Passkey entfernt." });
      setPendingDelete(null);
      await load();
    } else {
      setStatus({
        tone: "danger",
        text: res.status === 0 ? "Keine Verbindung. Bitte erneut versuchen." : `Entfernen fehlgeschlagen (HTTP ${res.status}).`,
      });
    }
    setDeleting(false);
  };

  if (supported === false) {
    return (
      <p className="status-pill status-pill--warning auth-error">
        Dieser Browser unterstützt keine Passkeys. Bitte melden Sie sich mit E-Mail und Passwort an.
      </p>
    );
  }

  if (supported === null || loading) {
    return (
      <div className="grid place-items-center py-8" aria-busy="true">
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <div className="auth-form">
      {status ? (
        <p
          className={`status-pill status-pill--${status.tone === "ok" ? "success" : "danger"} auth-error`}
          role={status.tone === "ok" ? "status" : "alert"}
        >
          {status.text}
        </p>
      ) : null}

      {passkeys.length === 0 ? (
        <p className="auth-hint">Noch kein Passkey hinterlegt.</p>
      ) : (
        <ul className="passkey-list">
          {passkeys.map((pk) => (
            <li key={pk.id} className="passkey-list__row">
              <span>
                <strong>{pk.name ?? "Passkey"}</strong>
                <span className="passkey-list__meta">
                  angelegt {formatDate(pk.created_at)}
                  {pk.last_used_at ? ` · zuletzt genutzt ${formatDate(pk.last_used_at)}` : " · noch nicht genutzt"}
                </span>
              </span>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setPendingDelete(pk)}
                disabled={deleting}
              >
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      )}

      <label>
        Name für dieses Gerät
        <input
          className="field-boxed"
          type="text"
          value={name}
          // The artwork answers every text field on the site, this one included
          // — see `artworkSignal.ts`.
          onChange={(ev) => {
            setName(ev.target.value);
            signalTyping();
          }}
          placeholder={defaultLabel()}
          maxLength={100}
        />
      </label>
      <button className="btn btn-primary" type="button" onClick={() => void add()} disabled={busy}>
        {busy ? <Spinner size="sm" /> : "Passkey hinzufügen"}
      </button>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Passkey „${pendingDelete?.name ?? "Passkey"}“ entfernen?`}
        message="Dieses Gerät kann sich danach nicht mehr per Passkey anmelden. Die Anmeldung mit E-Mail und Passwort bleibt möglich."
        confirmLabel="Entfernen"
        busy={deleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}

/** A sensible pre-filled label so the list is readable without anyone typing. */
function defaultLabel(): string {
  if (typeof navigator === "undefined") return "Dieses Gerät";
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return "iPhone / iPad";
  if (/Android/.test(ua)) return "Android-Gerät";
  if (/Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows-PC";
  return "Dieses Gerät";
}

function formatDate(value: string): string {
  const date = new Date(value.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("de-DE");
}
