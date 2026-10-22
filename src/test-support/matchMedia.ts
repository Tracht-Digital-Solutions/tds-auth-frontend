/**
 * jsdom has no `window.matchMedia`, so every island runs its narrow layout in
 * tests. This installs a stub that answers `matches` for every query and can
 * be flipped later, firing the `change` listeners like a resize would.
 */
export function stubMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  let current = matches;
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    get matches() {
      return current;
    },
    media: query,
    onchange: null,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    addListener: (fn: () => void) => listeners.add(fn),
    removeListener: (fn: () => void) => listeners.delete(fn),
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return {
    set(next: boolean) {
      current = next;
      listeners.forEach((fn) => fn());
    },
    restore() {
      window.matchMedia = original;
    },
  };
}
