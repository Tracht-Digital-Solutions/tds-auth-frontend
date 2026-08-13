// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { TYPING_EVENT, onTyping, signalTyping } from "./artworkSignal";

/**
 * The bus between the form island and the artwork island.
 *
 * Small surface, but the failure mode is invisible: a broken subscription
 * doesn't throw, it just leaves the artwork inert while someone types. So the
 * unsubscribe is pinned as tightly as the delivery — an effect that keeps
 * firing after unmount is the same silence with a leak attached.
 */

const stops: (() => void)[] = [];

afterEach(() => {
  while (stops.length) stops.pop()!();
});

function listen(handler: () => void) {
  const stop = onTyping(handler);
  stops.push(stop);
  return stop;
}

describe("signalTyping / onTyping", () => {
  it("delivers each keystroke to every subscriber", () => {
    const a = vi.fn();
    const b = vi.fn();
    listen(a);
    listen(b);

    signalTyping();
    signalTyping();

    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it("stops delivering after the returned unsubscribe runs", () => {
    const handler = vi.fn();
    const stop = listen(handler);

    signalTyping();
    stop();
    signalTyping();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("carries no payload", () => {
    // The password field emits this too. "Just the length" is still the wrong
    // instinct, so the event has to stay empty by construction.
    let seen: Event | null = null;
    const listener = (event: Event) => (seen = event);
    window.addEventListener(TYPING_EVENT, listener);

    signalTyping();
    window.removeEventListener(TYPING_EVENT, listener);

    expect(seen).toBeInstanceOf(CustomEvent);
    expect((seen as unknown as CustomEvent).detail ?? null).toBeNull();
  });

  it("is a no-op without a window, so it can be imported from .astro frontmatter", () => {
    const window_ = globalThis.window;
    // @ts-expect-error — deliberately simulating the SSR global.
    delete globalThis.window;
    try {
      expect(() => signalTyping()).not.toThrow();
      expect(() => onTyping(() => {})()).not.toThrow();
    } finally {
      globalThis.window = window_;
    }
  });
});
