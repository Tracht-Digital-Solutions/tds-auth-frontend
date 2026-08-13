/**
 * The typing → artwork signal.
 *
 * The form and the artwork are two SEPARATE React islands — Astro mounts every
 * `client:*` component as its own root — so they share no state, no context and
 * no provider. A `window` CustomEvent is the same bus tds-shared's toast host
 * uses, for exactly the same reason.
 *
 * It is an explicit call rather than a `document`-level `input` listener inside
 * the artwork, and that is a deliberate trade:
 *
 *  - a listener would also fire on the "30 Tage angemeldet bleiben" checkbox and
 *    on anything added to the page later, so the artwork would react to things
 *    nobody decided it should react to, and
 *  - "which interactions exist" would stop being greppable — the coupling would
 *    be invisible from both ends.
 *
 * The cost is that a NEW form has to call {@link signalTyping} itself. That is
 * the failure mode worth guarding, so both island suites assert their form
 * emits while typing; a form that forgets simply leaves the artwork inert, with
 * nothing logged.
 */

export const TYPING_EVENT = "tds:auth-typing";

/**
 * Announce one keystroke. Deliberately payload-free: the artwork must never be
 * able to see what was typed, and a password field is the one place where an
 * event that carries "just the length" is still the wrong instinct.
 */
export function signalTyping(): void {
  // The forms are `client:load` islands, so this only ever runs in a browser —
  // but the module is importable from `.astro` frontmatter, which is Node.
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TYPING_EVENT));
}

/** Subscribe; returns the unsubscribe so an effect can return it directly. */
export function onTyping(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = () => handler();
  window.addEventListener(TYPING_EVENT, listener);
  return () => window.removeEventListener(TYPING_EVENT, listener);
}
