// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { RIPPLE_SLOTS } from "~/lib/artwork";
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
 *  - reduced motion must switch the interaction off in JS, not only in CSS. Two
 *    of the three responses are imperative (the offsets are written onto the
 *    node, the bursts are Web Animations); a media query cannot stop either.
 *  - a zero-sized panel must not produce NaN. A NaN custom property makes the
 *    whole `transform` invalid at computed-value time — every shape snaps to the
 *    origin, with nothing logged.
 *  - leaving the panel must park the composition back at centre, and the pending
 *    frame must be cancelled or it re-applies the last offset a frame later.
 *  - the typing signal has to reach the artwork at all, and let go afterwards.
 */

/**
 * rAF is driven manually, with a real advancing clock: the follow eases over
 * ELAPSED TIME, so a stub that always passes `0` would compute a zero delta and
 * nothing would ever move — a green test proving the opposite of the truth.
 */
let queue = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;
let now = 0;

/** One frame, 16 ms later. */
function tick(ms = 16) {
  now += ms;
  const due = [...queue.values()];
  queue.clear();
  for (const callback of due) callback(now);
}

/** Run until the loop stops scheduling itself, i.e. until the ease has settled. */
function settle(maxFrames = 400) {
  for (let i = 0; queue.size > 0 && i < maxFrames; i++) tick();
}

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

/** jsdom measures everything as 0×0; the component treats that as unmeasurable. */
function stubSize(el: HTMLElement, width: number, height: number) {
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0 }) as DOMRect;
}

function renderStage() {
  const { container } = render(<LoginArtwork />);
  const stage = container.querySelector(".auth-art__stage") as HTMLElement;
  stubSize(stage, 400, 200);
  return stage;
}

/** Inline custom property, or "" when the component never wrote one. */
const read = (el: HTMLElement, name: string) => el.style.getPropertyValue(name);

/**
 * jsdom implements no `PointerEvent`, and Testing Library's `fireEvent.pointerMove`
 * silently falls back to a bare `Event` — coordinates and `pointerType` are
 * dropped, so the handler reads `undefined` and every assertion below turns into
 * `NaN`. Build the event by hand instead: a `MouseEvent` carries the
 * coordinates, and `pointerType` is defined onto it.
 */
function pointerMove(el: HTMLElement, clientX: number, clientY: number, pointerType = "mouse") {
  const event = new MouseEvent("pointermove", { clientX, clientY, bubbles: true });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  fireEvent(el, event);
}

beforeEach(() => {
  queue = new Map();
  nextFrameId = 1;
  now = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = nextFrameId++;
    queue.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => queue.delete(id));
  stubMotionPreference(true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("rendering", () => {
  it("generates a composition client-side and stamps its seed", () => {
    const stage = renderStage();
    const svg = stage.querySelector(".auth-art__canvas")!;

    // Server-rendering it would freeze one picture into the build; seeding it in
    // the first render instead is a hydration mismatch by construction.
    expect(svg.getAttribute("data-seed")).toMatch(/^\d+$/);
    expect(stage.querySelectorAll(".auth-art__follow").length).toBeGreaterThan(0);
  });

  it("renders the ripple pool up front, invisible", () => {
    // Mounting a circle per keystroke would cost a React render on every key and
    // reset its neighbours' ambient phase.
    const ripples = renderStage().querySelectorAll(".auth-art__ripple");

    expect(ripples.length).toBe(RIPPLE_SLOTS);
    for (const ripple of ripples) expect(ripple.getAttribute("opacity")).toBe("0");
  });

  it("gives the glow and the composition one common ancestor", () => {
    // Both read the pointer custom properties, and only the stage sets them.
    const stage = renderStage();

    expect(stage.querySelector(".auth-art__glow")).not.toBeNull();
    expect(stage.querySelector(".auth-art__canvas")).not.toBeNull();
  });
});

describe("following the pointer", () => {
  it("eases every layer to the pointer, and the glow to it in pixels", () => {
    const stage = renderStage();

    // Top-left quadrant of a 400×200 panel: a quarter left of centre, a quarter
    // above it — so ±0.5 normalised, and −100/−50 px for the glow.
    pointerMove(stage, 100, 50);
    settle();

    for (const layer of ["far", "mid", "near"]) {
      expect(read(stage, `--auth-mx-${layer}`), layer).toBe("-0.5");
      expect(read(stage, `--auth-my-${layer}`), layer).toBe("-0.5");
    }
    // The glow is a DOM element, so it travels in real pixels, not user units.
    expect(read(stage, "--auth-glow-x")).toBe("-100px");
    expect(read(stage, "--auth-glow-y")).toBe("-50px");
  });

  it("lags the far layer behind the near one on the way there", () => {
    // The whole point of three easings. Sampled mid-flight, because at rest all
    // three sit on the pointer and the difference is invisible.
    const stage = renderStage();

    pointerMove(stage, 400, 200); // full deflection, bottom-right
    for (let i = 0; i < 6; i++) tick();

    const far = Number(read(stage, "--auth-mx-far"));
    const near = Number(read(stage, "--auth-mx-near"));
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });

  it("coalesces a burst of samples into one scheduled frame", () => {
    const stage = renderStage();

    for (let i = 0; i < 10; i++) pointerMove(stage, 200 + i, 100);

    // Ten samples, one frame — the whole reason this bypasses React.
    expect(queue.size).toBe(1);
    settle();
    expect(read(stage, "--auth-glow-x")).toBe("9px");
  });

  it("clamps to ±1 outside the panel", () => {
    const stage = renderStage();

    pointerMove(stage, 900, -300);
    settle();

    expect(read(stage, "--auth-mx-near")).toBe("1");
    expect(read(stage, "--auth-my-near")).toBe("-1");
  });

  it("eases back to centre after the pointer leaves", () => {
    const stage = renderStage();
    pointerMove(stage, 400, 200);
    settle();
    expect(read(stage, "--auth-mx-near")).toBe("1");

    fireEvent.pointerLeave(stage);
    settle();

    // Snapped, not merely asymptotically close: the resting composition has to
    // be exactly the one a visitor who never moved the mouse sees.
    expect(read(stage, "--auth-mx-near")).toBe("0");
    expect(read(stage, "--auth-mx-far")).toBe("0");
    expect(read(stage, "--auth-glow-x")).toBe("0px");
  });

  it("stops scheduling frames once it has settled", () => {
    // An exponential ease never actually arrives; without a floor the loop would
    // run forever for a decoration nobody is pointing at.
    const stage = renderStage();
    pointerMove(stage, 300, 150);
    settle();

    expect(queue.size).toBe(0);
  });

  it("survives a backgrounded tab without teleporting", () => {
    // A resumed tab delivers one frame with a multi-second delta. Unclamped,
    // `1 - exp(-dt/tau)` is 1 and the composition jumps to the pointer.
    const stage = renderStage();
    pointerMove(stage, 400, 200);
    tick(30000);

    expect(Number(read(stage, "--auth-mx-far"))).toBeLessThan(1);
  });

  it("ignores an unmeasurable panel instead of writing NaN", () => {
    const { container } = render(<LoginArtwork />);
    const stage = container.querySelector(".auth-art__stage") as HTMLElement;
    // Left at jsdom's 0×0: dividing by it is where NaN comes from, and a NaN
    // custom property invalidates the entire transform silently.
    pointerMove(stage, 10, 10);
    settle();

    expect(read(stage, "--auth-mx-far")).toBe("");
  });

  it("ignores touch, which has no way back to centre", () => {
    const stage = renderStage();

    pointerMove(stage, 100, 50, "touch");
    settle();

    // A finger dragging across the band leaves no pointerleave behind, so the
    // composition would stay parked wherever it lifted.
    expect(read(stage, "--auth-mx-far")).toBe("");
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

  it("never attaches the pointer handlers", () => {
    // The CSS rules are inside the opt-in block, so nothing would READ these —
    // but writing them anyway means the "off" state depends on two things
    // agreeing instead of one.
    const stage = renderStage();

    pointerMove(stage, 100, 50);
    settle();

    expect(queue.size).toBe(0);
    expect(read(stage, "--auth-mx-far")).toBe("");
  });

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
  });
});
