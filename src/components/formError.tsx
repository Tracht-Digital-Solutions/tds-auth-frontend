import { useCallback, useEffect, useState, type ReactNode } from "react";

/**
 * Where a form's error is shown.
 *
 *  - A message that belongs to fields (wrong password, too short, mismatch)
 *    marks those fields `aria-invalid` (red frame) in every layout.
 *  - On the split layout (≥ 62rem, the breakpoint in `global.css`) that message
 *    sits as a tip beside the first of its fields; there is room next to the
 *    form there. Narrower, it stays the pill above the form.
 *  - A message without fields (rate limit, network, deactivated account) is
 *    always the pill.
 *
 * Exactly one element carries the message, and it is `role="alert"` in both
 * places, so it is announced once and tds-shared's error bounce shakes it.
 */
export const SPLIT_QUERY = "(min-width: 62rem)";

export type FormError = { message: string; fields: readonly string[] };

function useSplitLayout(): boolean {
  // After hydration only: the static HTML is the same for every viewport, and
  // jsdom has no matchMedia (the tests then run the pill layout).
  const [split, setSplit] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(SPLIT_QUERY);
    const sync = () => setSplit(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return split;
}

export function useFormError() {
  const [error, setErrorState] = useState<FormError | null>(null);
  const split = useSplitLayout();

  const setError = useCallback((message: string | null, fields: readonly string[] = []) => {
    setErrorState(message === null ? null : { message, fields });
  }, []);

  /** Editing a field that carries the error takes the error back. */
  const edited = useCallback((field: string) => {
    setErrorState((current) => (current && current.fields.includes(field) ? null : current));
  }, []);

  const anchor = split && error && error.fields.length ? error.fields[0] : null;

  return {
    error,
    setError,
    edited,
    /** The pill's message, or null while the tip shows it beside a field. */
    pill: error && anchor === null ? error.message : null,
    /** `aria-invalid` for a field's input. */
    invalid: (field: string) => (error?.fields.includes(field) ? true : undefined),
    /** The tip's message for this field, or null. */
    tip: (field: string) => (anchor === field ? error!.message : null),
  };
}

/** The pill above the form. */
export function ErrorPill({ message }: { message: string | null }) {
  if (message === null) return null;
  return (
    <p className="status-pill status-pill--danger auth-error" role="alert">
      {message}
    </p>
  );
}

/**
 * A field row: the label (with its input) plus, on the split layout, the tip
 * beside it. The tip is a SIBLING of the label, not inside it: label content
 * becomes the input's accessible name, so a message in there would rename the
 * field to "Passwort Das aktuelle Passwort ist falsch.".
 */
export function Field({ tip, children }: { tip: string | null; children: ReactNode }) {
  return (
    <div className="auth-field">
      {children}
      {tip !== null ? (
        <p className="auth-field__tip" role="alert">
          {tip}
        </p>
      ) : null}
    </div>
  );
}
