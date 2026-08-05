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

export interface Ribbon {
  /** Cubic path across the full canvas, deliberately over-hanging both edges. */
  d: string;
  hue: string;
  width: number;
  opacity: number;
  /** Index into {@link BLUR_LEVELS} — bucketed so `<defs>` stays at three filters. */
  blur: number;
}

export interface Ring {
  cx: number;
  cy: number;
  r: number;
  hue: string;
  opacity: number;
}

export interface Spark {
  cx: number;
  cy: number;
  r: number;
  hue: string;
  opacity: number;
}

export interface Artwork {
  seed: number;
  /** Whole-composition rotation in degrees, for variety without new shapes. */
  tilt: number;
  ribbons: Ribbon[];
  rings: Ring[];
  sparks: Spark[];
}

/** Gaussian blur radii the ribbons are bucketed into. */
export const BLUR_LEVELS = [2.5, 5, 9] as const;

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

  // Two or three hues, never all six: a full palette in one frame reads as a
  // colour test card rather than a composition.
  const hues = shuffle(PALETTE, rng).slice(0, rng() < 0.5 ? 2 : 3);

  const ribbonCount = Math.floor(between(4, 7.99));
  const ribbons: Ribbon[] = [];
  for (let i = 0; i < ribbonCount; i++) {
    // Ribbons enter left and leave right, over-hanging by 20 units so no stroke
    // end is ever visible inside the frame — a visible cap looks like a bug.
    const y0 = between(5, 95);
    const y1 = between(5, 95);
    const c1x = between(15, 45);
    const c2x = between(55, 85);
    const c1y = y0 + between(-45, 45);
    const c2y = y1 + between(-45, 45);

    ribbons.push({
      d: `M -20 ${r(y0)} C ${r(c1x)} ${r(c1y)}, ${r(c2x)} ${r(c2y)}, 120 ${r(y1)}`,
      hue: pick(hues),
      width: between(5, 20),
      opacity: between(0.32, 0.62),
      blur: Math.floor(rng() * BLUR_LEVELS.length),
    });
  }

  const ringCount = Math.floor(between(2, 4.99));
  const rings: Ring[] = [];
  for (let i = 0; i < ringCount; i++) {
    rings.push({
      cx: r(between(10, 90)),
      cy: r(between(10, 90)),
      r: r(between(8, 34)),
      hue: pick(hues),
      opacity: between(0.16, 0.4),
    });
  }

  const sparkCount = Math.floor(between(2, 4.99));
  const sparks: Spark[] = [];
  for (let i = 0; i < sparkCount; i++) {
    sparks.push({
      cx: r(between(12, 88)),
      cy: r(between(12, 88)),
      r: r(between(0.5, 1.8)),
      hue: pick(hues),
      opacity: between(0.5, 0.9),
    });
  }

  return {
    seed,
    tilt: r(between(-18, 18)),
    ribbons,
    rings,
    sparks,
  };
}

/** Round to 2dp — the markup is ~40% smaller and nothing is visibly different. */
function r(value: number): number {
  return Math.round(value * 100) / 100;
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
