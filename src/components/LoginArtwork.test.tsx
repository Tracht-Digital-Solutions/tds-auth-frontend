// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { RIPPLE_SLOTS, SCENES } from "~/lib/artwork";
import { signalTyping } from "~/lib/artworkSignal";
import LoginArtwork from "~/components/LoginArtwork";

/**
 * The artwork's *interaction*, not its looks.
 *
 * jsdom has no layout, no compositor and no `Element.animate`, so nothing here
 * says anything about how the composition reads — `artwork.test.ts` bounds the
 * geometry and a browser is the only place to judge the rest. What this file
 * pins is the wiring, all of which fails silently in production:
 *
 *  - the composition must be generated CLIENT-side, once, with its seed and
 *    scene visible in the markup,
 *  - nothing may read the pointer's POSITION. The hover response is pure CSS by
 *    design; a stray listener writing offsets onto the node is exactly the
 *    regression this file exists to catch, and it would look fine on screen,
 *  - reduced motion must switch the imperative responses off in JS, not only in
 *    CSS — the keystroke bursts are Web Animations and no media query stops
 *    those, and
 *  - the typing signal has to reach the artwork at all, and let go afterwards.
 */

/**
 * jsdom's `matchMedia` answers `false` to everything, which would read as
 * "reduced motion requested" and silently make every assertion below trivially
 * true. Stub it so the preference is explicit in each test.
 */
function stubMotionPreference(noPreference: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: noPreference,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

function renderStage() {
  const { container } = render(<LoginArtwork />);
  return container.querySelector(".auth-art__stage") as HTMLElement;
}

/** Inline custom property, or "" when the component never wrote one. */
const read = (el: HTMLElement, name: string) => el.style.getPropertyValue(name);

/**
 * jsdom implements no `PointerEvent`, and Testing Library's `fireEvent.pointerMove`
 * silently falls back to a bare `Event` — coordinates and `pointerType` are
 * dropped. Build the event by hand instead: a `MouseEvent` carries the
 * coordinates, and `pointerType` is defined onto it.
 */
function pointerMove(el: HTMLElement, clientX: number, clientY: number, pointerType = "mouse") {
  const event = new MouseEvent("pointermove", { clientX, clientY, bubbles: true });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  fireEvent(el, event);
}

beforeEach(() => stubMotionPreference(true));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("rendering", () => {
  it("generates a composition client-side and stamps its seed and scene", () => {
    const stage = renderStage();
    const svg = stage.querySelector(".auth-art__canvas")!;

    // Server-rendering it would freeze one picture into the build; seeding it in
    // the first render instead is a hydration mismatch by construction.
    expect(svg.getAttribute("data-seed")).toMatch(/^\d+$/);
    expect(SCENES as readonly string[]).toContain(svg.getAttribute("data-scene"));
    expect(stage.querySelectorAll(".auth-art__mark").length).toBeGreaterThan(0);
  });

  it("wraps every mark in a pose group and a motion group", () => {
    // Three nested elements, one property each. Collapsing them is silent: an
    // animation beats the pose transition outright, so the hover response would
    // simply never appear.
    const stage = renderStage();

    for (const mark of stage.querySelectorAll(".auth-art__mark")) {
      const motion = mark.parentElement!;
      expect(motion.getAttribute("class")).toMatch(/auth-art__m--/);
      expect(motion.parentElement!.getAttribute("class")).toContain("auth-art__pose");
    }
  });

  it("carries each mark's own alpha as a presentation attribute", () => {
    // Not `opacity` on the group: an inline style cannot be overridden by the
    // hover rules, and the structure would have nothing left to brighten.
    const stage = renderStage();

    for (const mark of stage.querySelectorAll(".auth-art__mark")) {
      const alpha = mark.getAttribute("stroke-opacity") ?? mark.getAttribute("fill-opacity");
      expect(Number(alpha)).toBeGreaterThan(0.1);
      expect(mark.parentElement!.style.opacity).toBe("");
    }
  });

  it("renders the ripple pool up front, invisible", () => {
    // Mounting a circle per keystroke would cost a React render on every key and
    // reset its neighbours' ambient phase.
    const ripples = renderStage().querySelectorAll(".auth-art__ripple");

    expect(ripples.length).toBe(RIPPLE_SLOTS);
    for (const ripple of ripples) expect(ripple.getAttribute("opacity")).toBe("0");
  });
});

describe("it does not follow the cursor", () => {
  // The point of the whole design. Both halves used to exist and both are gone:
  // a rAF loop wrote normalised pointer offsets onto the stage for a per-layer
  // parallax, and a 34rem disc was translated to sit under the crosshair. The
  // first made the picture a read-out of the mouse position; the second read as
  // a cursor decoration rather than as artwork.

  it("writes nothing to the stage when the pointer moves over it", () => {
    const stage = renderStage();
    const before = stage.getAttribute("style") ?? "";

    pointerMove(stage, 100, 50);
    pointerMove(stage, 380, 190);
    fireEvent.pointerLeave(stage);

    expect(stage.getAttribute("style") ?? "").toBe(before);
    expect(read(stage, "--auth-glow-x")).toBe("");
  });

  it("renders no cursor glow element", () => {
    expect(renderStage().querySelector(".auth-art__glow")).toBeNull();
  });

  it("needs no measurement of the panel", () => {
    // jsdom measures everything as 0×0. The old implementation divided by that
    // and had to guard against NaN — a NaN custom property invalidates the whole
    // transform at computed-value time, silently. Nothing measures any more, so
    // the guard is not needed and its absence must not reintroduce the fault.
    const stage = renderStage();
    pointerMove(stage, 10, 10);

    expect(stage.getAttribute("style") ?? "").not.toMatch(/NaN/);
  });
});

describe("answering the keyboard", () => {
  it("raises the energy on a keystroke and lets it decay", () => {
    vi.useFakeTimers();
    const stage = renderStage();

    act(() => signalTyping());
    expect(read(stage, "--auth-energy")).toBe("1");

    // Held there while typing continues …
    act(() => {
      vi.advanceTimersByTime(600);
      signalTyping();
      vi.advanceTimersByTime(600);
    });
    expect(read(stage, "--auth-energy")).toBe("1");

    // … and released once the typing stops.
    act(() => vi.advanceTimersByTime(1000));
    expect(read(stage, "--auth-energy")).toBe("0");
  });

  it("unsubscribes on unmount", () => {
    vi.useFakeTimers();
    const { container, unmount } = render(<LoginArtwork />);
    const stage = container.querySelector(".auth-art__stage") as HTMLElement;
    unmount();

    // A handler that outlives the island writes to a detached node forever.
    expect(() => act(() => signalTyping())).not.toThrow();
    expect(read(stage, "--auth-energy")).toBe("");
  });
});

describe("prefers-reduced-motion: reduce", () => {
  beforeEach(() => stubMotionPreference(false));

  it("does not answer typing", () => {
    // This one MUST be gated in JS: the bursts are Web Animations, which no
    // media query can switch off.
    const stage = renderStage();

    act(() => signalTyping());

    expect(read(stage, "--auth-energy")).toBe("");
  });

  it("still renders the composition, just without the responses", () => {
    const stage = renderStage();

    expect(stage.querySelector(".auth-art__canvas")).not.toBeNull();
    expect(stage.querySelectorAll(".auth-art__mark").length).toBeGreaterThan(0);
  });
});
