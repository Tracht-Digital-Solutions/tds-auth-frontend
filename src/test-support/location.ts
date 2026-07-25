import { vi } from "vitest";

/**
 * Test helper: a controllable `window.location`.
 *
 * Both islands read `location.search` (the `?next=` value) and `location.origin`
 * (the base for resolving a relative `next`), and navigate with
 * `location.replace`. jsdom's real `Location` is [Unforgeable] — its methods
 * cannot be spied on — but `window.location` itself is a configurable accessor,
 * so the whole object can be swapped for a plain stand-in.
 *
 * Not imported by any runtime code; it lives under `src/` only so the colocated
 * component tests can reach it without a `../../..` climb.
 */
export interface StubbedLocation {
  /** Calls to `location.replace(...)`, in order. */
  replace: ReturnType<typeof vi.fn>;
  /** The single URL the component navigated to, or null if it stayed put. */
  target: () => string | null;
  /** Restore jsdom's real `location`. */
  restore: () => void;
}

/**
 * Swap `window.location` for a stub whose search/origin you control.
 *
 * @param url The URL the login site is currently sitting on, e.g.
 *   `https://auth.tracht-digital.de/?next=https%3A%2F%2Fapp.tracht-digital.de%2F`.
 */
export function stubLocation(url = "https://auth.tracht-digital.de/"): StubbedLocation {
  const parsed = new URL(url);
  const replace = vi.fn();

  const descriptor = Object.getOwnPropertyDescriptor(window, "location");
  const stub = {
    href: parsed.href,
    origin: parsed.origin,
    protocol: parsed.protocol,
    host: parsed.host,
    hostname: parsed.hostname,
    pathname: parsed.pathname,
    search: parsed.search,
    hash: parsed.hash,
    replace,
    assign: vi.fn(),
    reload: vi.fn(),
    toString: () => parsed.href,
  };

  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: stub,
  });

  return {
    replace,
    target: () => (replace.mock.calls.length ? (replace.mock.calls[0][0] as string) : null),
    restore: () => {
      if (descriptor) Object.defineProperty(window, "location", descriptor);
    },
  };
}
