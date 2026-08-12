/**
 * The generative artwork beside the login form.
 *
 * A fresh composition on every visit — but a *bounded* one. That is the whole
 * design constraint: anything random enough to be interesting is also random
 * enough to produce something ugly, so the ranges here are deliberately narrow.
 * Ribbon count, curvature, thickness and palette are all clamped to a band that
 * cannot compose badly; what varies is the arrangement inside it.
 *
 * Pure and seeded, so a composition is reproducible from its number alone —
 * which is what makes it testable at all (see `artwork.test.ts`) and what would
 * let a specific one be pinned later if we ever want a fixed marketing shot.
 *
 * Colours are emitted as `var(--color-*)` references rather than literals, so
 * the artwork follows the light/dark theme for free instead of needing a second
 * palette.
 */

/** Square canvas; the SVG slices it to whatever the panel's aspect ratio is. */
export const VIEWBOX = 100;

/**
 * How far every ribbon runs past both edges of the canvas.
 *
 * A stroke that ends inside the frame shows its round cap, which reads as a
 * rendering fault rather than as a design choice — so both ends have to stay
 * outside the crop no matter what happens to them afterwards. "Afterwards" is
 * the part worth spelling out, because it is not just the crop: the whole
 * composition is tilted by up to 18°, swayed by another 3°, and each ribbon
 * drifts and rotates on top of that. A rotation about the canvas centre swings
 * the ENDS furthest, and it swings the ends of a high or low ribbon *inward* —
 * at 20 units of overhang a ribbon starting at y=5 could put its cap around
 * x=5, which the panel does show. This is sized for the worst combination of
 * all four, with margin.
 */
export const OVERHANG = 45;

/**
 * Brand hues the composition may draw from. All six flip with the theme.
 * Kept to the categorical + brand tokens — no greys: the backdrop is already a
 * deep navy, and a grey ribbon on it reads as a rendering fault.
 */
export const PALETTE = [
  "var(--color-primary)",
  "var(--color-accent)",
  "var(--color-cat-violet)",
  "var(--color-cat-teal)",
  "var(--color-cat-cyan)",
  "var(--color-accent-pink)",
] as const;

/**
 * Ambient drift for one ribbon — seeded like everything else here.
 *
 * The motion is part of the composition, so it comes out of the generator and
 * not out of `Math.random()` in the component: a composition that is only half
 * reproducible from its seed is not reproducible at all, and the sweep in
 * `artwork.test.ts` would have nothing to bound. "Alive but not distracting" is
 * a requirement, and a requirement that is not a number cannot be tested.
 *
 * Plain numbers, no units — the component serialises them into CSS custom
 * properties, the same way it turns `blur` into a `url(#…)`.
 */
export interface Drift {
  /** Peak offset in SVG user units, signed. */
  dx: number;
  dy: number;
  /** Peak rotation in degrees, signed. */
  rot: number;
  /**
   * Peak scale, always >= 1 — the composition breathes outward only, so a
   * ribbon's over-hang can never be pulled inside the frame and show its cap.
   */
  scale: number;
  /** Seconds for one there-and-back cycle. */
  dur: number;
  /**
   * NEGATIVE seconds. Every shape starts mid-cycle; that phase offset is what
   * keeps the composition from swelling in unison on load, which is exactly
   * what makes ambient motion read as "an animation" rather than as drift.
   */
  delay: number;
}

/**
 * Rings travel a short arc about the canvas centre.
 *
 * Rotating a circle about its OWN centre is a no-op, so the pivot is (50,50)
 * and `rot` moves it along the circumference. Directions alternate by index —
 * same-direction rings read as the whole picture turning, which is the one
 * motion the tilt group already owns.
 */
export interface Orbit {
  rot: number;
  dur: number;
  delay: number;
}

/**
 * Sparks breathe in opacity only. They are the crisp focal points; if they
 * move, the eye follows them, and the eye belongs on the login form.
 */
export interface Pulse {
  /** Multiplier on the resting opacity at the bottom of the cycle. */
  dim: number;
  dur: number;
  delay: number;
}

export interface Ribbon {
  /** Cubic path across the full canvas, deliberately over-hanging both edges. */
  d: string;
  hue: string;
  width: number;
  opacity: number;
  /** Index into {@link BLUR_LEVELS} — bucketed so `<defs>` stays at three filters. */
  blur: number;
  motion: Drift;
}

export interface Ring {
  cx: number;
  cy: number;
  r: number;
  hue: string;
  opacity: number;
  motion: Orbit;
}

export interface Spark {
  cx: number;
  cy: number;
  r: number;
  hue: string;
  opacity: number;
  motion: Pulse;
}

export interface Artwork {
  seed: number;
  /** Whole-composition rotation in degrees, for variety without new shapes. */
  tilt: number;
  /**
   * Whole-composition sway: peak degrees (signed) and the round-trip period.
   * Applied by a group OUTSIDE the tilt group — see `LoginArtwork.tsx`.
   */
  sway: { deg: number; dur: number };
  ribbons: Ribbon[];
  rings: Ring[];
  sparks: Spark[];
}

/**
 * Gaussian blur radii the ribbons are bucketed into.
 *
 * Raised from [2.5, 5, 9]: the ribbons are meant to read as soft colour clouds,
 * with the rings and sparks left sharp — the contrast between the two is what
 * gives the composition its depth. The largest value is what sizes the filter
 * region in `LoginArtwork.tsx`; past ~20 the Gaussian's support outruns that
 * region and the ribbon gets a hard, straight cut-off.
 */
export const BLUR_LEVELS = [5, 10, 17] as const;

/**
 * Alpha correction per blur bucket. Note the direction: softer means DIMMER.
 *
 * The intuition runs the other way — a wide Gaussian lowers a ribbon's peak
 * value, so it looks like it needs more ink to compensate. Measured, that is
 * backwards. `screen` accumulates over COVERAGE, and at radius 17 a single
 * ribbon covers most of the canvas, so five of them lift the entire field
 * rather than crossing in a few bright places. Compensating the peak instead
 * of the coverage took the panel's mean luminance from 44 to 59 and turned the
 * dark half of the split into a pink wash — the exact failure the ceiling
 * below is meant to catch, arrived at from the other side.
 */
const BLUR_ALPHA = [1, 0.86, 0.68] as const;

/**
 * mulberry32 — a small, fast, well-distributed PRNG.
 *
 * `Math.random()` cannot be seeded, and a seeded generator is what makes this
 * module testable: the same number must always yield the same composition.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed for "a different one this time". */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

/**
 * Build one composition.
 *
 * Structure, from back to front: broad blurred ribbons sweeping across the
 * canvas (the colour), a couple of thin rings (the structure that keeps it from
 * reading as a smear), and two or three crisp dots (the focal points that give
 * the eye somewhere to land).
 */
export function generateArtwork(seed: number): Artwork {
  const rng = mulberry32(seed);
  const between = (min: number, max: number) => min + rng() * (max - min);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rng() * items.length)]!;
  /** ±magnitude. Consumes one draw, so it is part of the ordering below. */
  const signed = (value: number) => (rng() < 0.5 ? -value : value);
  /**
   * A negative start offset inside the first cycle. One draw.
   *
   * Capped at 0.95 of the period rather than the full one: a delay of exactly
   * `-dur` is phase-equivalent to no delay at all, which is the unison this
   * exists to prevent, and 2dp rounding can otherwise land there.
   */
  const phase = (duration: number) => r(-duration * rng() * 0.95);

  // Two or three hues, never all six: a full palette in one frame reads as a
  // colour test card rather than a composition.
  const hues = shuffle(PALETTE, rng).slice(0, rng() < 0.5 ? 2 : 3);

  // NOTE ON ORDERING: every draw below happens in source order, object-literal
  // property values included. Moving a line — or hoisting a `const` past
  // another — silently reshuffles EVERY composition, because each shape's
  // values come off one shared stream. That is not a bug, but it is never a
  // cosmetic edit either.
  const ribbonCount = Math.floor(between(4, 7.99));
  const ribbons: Ribbon[] = [];
  for (let i = 0; i < ribbonCount; i++) {
    // Ribbons enter left and leave right, over-hanging by OVERHANG units at both
    // ends so no stroke cap is ever visible inside the frame.
    const y0 = between(5, 95);
    const y1 = between(5, 95);
    const c1x = between(15, 45);
    const c2x = between(55, 85);
    const c1y = y0 + between(-45, 45);
    const c2y = y1 + between(-45, 45);
    // Drawn before the literal because `opacity` is compensated against it.
    const blur = Math.floor(rng() * BLUR_LEVELS.length);
    const dur = r(between(20, 38));

    ribbons.push({
      d: `M ${-OVERHANG} ${r(y0)} C ${r(c1x)} ${r(c1y)}, ${r(c2x)} ${r(c2y)}, ${
        VIEWBOX + OVERHANG
      } ${r(y1)}`,
      hue: pick(hues),
      width: r(between(7, 24)),
      // Clamped below 0.88: `screen` over a near-black field turns anything
      // above that into a flat wash, and the panel stops being the dark half of
      // the split.
      opacity: r3(Math.min(0.88, between(0.34, 0.6) * BLUR_ALPHA[blur]!)),
      blur,
      motion: {
        dx: r(signed(between(8, 14))),
        dy: r(signed(between(6, 11))),
        rot: r(signed(between(1.5, 3.5))),
        // 3dp: 2dp would quantise this narrow band far too coarsely.
        scale: r3(1 + between(0.02, 0.06)),
        dur,
        delay: phase(dur),
      },
    });
  }

  const ringCount = Math.floor(between(2, 4.99));
  const rings: Ring[] = [];
  for (let i = 0; i < ringCount; i++) {
    const dur = r(between(45, 80));

    rings.push({
      cx: r(between(10, 90)),
      cy: r(between(10, 90)),
      r: r(between(8, 34)),
      hue: pick(hues),
      opacity: r3(between(0.16, 0.4)),
      motion: {
        // Direction alternates by index rather than by a draw — counter-rotation
        // has to be guaranteed, not merely likely.
        rot: r((i % 2 === 0 ? 1 : -1) * between(3, 6)),
        dur,
        delay: phase(dur),
      },
    });
  }

  const sparkCount = Math.floor(between(2, 4.99));
  const sparks: Spark[] = [];
  for (let i = 0; i < sparkCount; i++) {
    const dur = r(between(5, 11));

    sparks.push({
      cx: r(between(12, 88)),
      cy: r(between(12, 88)),
      r: r(between(0.5, 1.8)),
      hue: pick(hues),
      opacity: r3(between(0.5, 0.9)),
      motion: {
        dim: r3(between(0.5, 0.78)),
        dur,
        delay: phase(dur),
      },
    });
  }

  return {
    seed,
    tilt: r(between(-18, 18)),
    sway: { deg: signed(3), dur: r(between(70, 100)) },
    ribbons,
    rings,
    sparks,
  };
}

/** Round to 2dp — the markup is ~40% smaller and nothing is visibly different. */
function r(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 3dp, for the few values where 2dp would quantise a narrow band flat. */
function r3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Fisher–Yates against the seeded rng, so shuffling stays reproducible. */
function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
