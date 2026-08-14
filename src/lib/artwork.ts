/**
 * The generative artwork beside the login form.
 *
 * A fresh composition on every visit — but a *bounded* one. That is the whole
 * design constraint: anything random enough to be interesting is also random
 * enough to produce something ugly, so the ranges here are deliberately narrow.
 * Counts, curvature, thickness and palette are all clamped to a band that cannot
 * compose badly; what varies is the arrangement inside it.
 *
 * Variety comes from a SCENE drawn per visit — four archetypes with different
 * shape vocabularies and different motion vocabularies (see {@link SCENES}).
 * Before them the generator only ever varied the parameters of one picture, and
 * a visitor who saw the page twice saw the same thing twice.
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
 * How far a SPANNING mark runs past both edges of the canvas.
 *
 * A stroke that ends inside the frame shows its round cap, which reads as a
 * rendering fault rather than as a design choice — so both ends have to stay
 * outside the crop no matter what happens to them afterwards. "Afterwards" is
 * the part worth spelling out, because it is not just the crop: the whole
 * composition is tilted by up to 18°, swayed by another 3°, and each mark
 * drifts and rotates on top of that. A rotation about the canvas centre swings
 * the ENDS furthest, and it swings the ends of a high or low mark *inward* —
 * at 20 units of overhang a ribbon starting at y=5 could put its cap around
 * x=5, which the panel does show. This is sized for the worst combination of
 * all four, with margin.
 *
 * The hover pose spends part of that margin — up to 4 further units on a wash
 * mark — so it is bounded in `artwork.test.ts` alongside the drift rather than
 * left to grow independently. It is also why a wash mark's pose carries NO
 * rotation: translation and outward scale cannot pull an overhang inward, a
 * rotation about the canvas centre can.
 */
export const OVERHANG = 45;

/**
 * Brand hues the composition may draw from. All six flip with the theme.
 * Kept to the categorical + brand tokens — no greys: the backdrop is already a
 * deep navy, and a grey mark on it reads as a rendering fault.
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
 * The four composition archetypes.
 *
 * Each fills the same three layers (see {@link LAYERS}) — that is the contract
 * that lets one set of blur filters, one `screen` blend and one depth read serve
 * all four. What differs is the shape vocabulary and the motion vocabulary:
 *
 *  - `ribbons`   — broad curved bands, rings, dots. The original picture.
 *  - `orbits`    — soft haloes with arc segments spinning about their own foci.
 *  - `particles` — soft blobs behind a scattered field of dots and short strokes.
 *  - `strata`    — parallel bands sliding along their own axis, with cross ticks.
 */
export const SCENES = ["ribbons", "orbits", "particles", "strata"] as const;
export type SceneKind = (typeof SCENES)[number];

/**
 * Depth layers, ordered back to front — and this is also the PAINT order, which
 * is why `Artwork.marks` arrives pre-sorted by it.
 *
 *  - `wash`      the blurred colour. Broad, soft, dim.
 *  - `structure` the crisp geometry that keeps the wash from reading as a smear.
 *  - `accent`    the few sharp focal points that give the eye somewhere to land.
 */
export const LAYERS = ["wash", "structure", "accent"] as const;
export type Layer = (typeof LAYERS)[number];

/**
 * How far a mark travels, in SVG user units, when the pointer is over the panel.
 *
 * The three bands are DISJOINT, and that separation IS the depth cue: the soft
 * wash moves least, the crisp accents most. Overlapping bands make some seeds
 * read as one flat sheet sliding, which is the failure this replaced.
 *
 * `structure` additionally travels in the OPPOSITE direction (the sign is
 * applied in {@link poseFor}, not drawn), for the same reason the rings
 * counter-rotate: if every layer slid the same way the response would read as
 * the whole picture being dragged.
 */
export const POSE_BANDS: Record<Layer, readonly [number, number]> = {
  wash: [2.2, 4],
  structure: [4.8, 6.6],
  accent: [7.4, 9.6],
};

/**
 * Ceiling on a mark's hover stagger, in milliseconds.
 *
 * Deliberately low. A stagger is what keeps the composition from snapping into
 * its pose in unison, but the same delay applies on the way BACK — and a
 * decoration that is still rearranging itself half a second after the pointer
 * left reads as lag rather than as weight.
 */
export const POSE_DELAY_MAX = 220;

/**
 * Ambient drift for one mark — seeded like everything else here.
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
  kind: "drift";
  /** Peak offset in SVG user units, signed. */
  dx: number;
  dy: number;
  /** Peak rotation in degrees, signed. */
  rot: number;
  /**
   * Peak scale, always >= 1 — the composition breathes outward only, so a
   * spanning mark's over-hang can never be pulled inside the frame and show its
   * cap.
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
 * A short arc about the CANVAS centre (50,50).
 *
 * Rotating a circle about its own centre is a no-op, so a ring travels by being
 * swung about the canvas instead. Directions alternate between consecutive
 * orbiting marks — same-direction rings read as the whole picture turning,
 * which is the one motion the sway group already owns.
 */
export interface Orbit {
  kind: "orbit";
  rot: number;
  dur: number;
  delay: number;
}

/**
 * A short arc about the mark's OWN pivot — an arc segment turning on the circle
 * it was cut from, which is what makes the `orbits` scene read as an orrery
 * rather than as tumbling debris.
 *
 * The pivot is carried explicitly (`ox`/`oy`, user units) because the obvious
 * `transform-box: fill-box` would rotate about the arc's bounding box, not
 * about the centre of its circle.
 */
export interface Spin {
  kind: "spin";
  rot: number;
  ox: number;
  oy: number;
  dur: number;
  delay: number;
}

/**
 * Breathing in opacity only. The accents are the crisp focal points; if they
 * move on their own, the eye follows them, and the eye belongs on the login
 * form.
 */
export interface Pulse {
  kind: "pulse";
  /** Multiplier on the resting opacity at the bottom of the cycle. */
  dim: number;
  dur: number;
  delay: number;
}

/** A there-and-back translation along a fixed axis — the strata's motion. */
export interface Slide {
  kind: "slide";
  dx: number;
  dy: number;
  dur: number;
  delay: number;
}

export type Motion = Drift | Orbit | Spin | Pulse | Slide;

/**
 * Where a mark goes while the pointer is anywhere over the panel.
 *
 * Note what is NOT here: the pointer's position. The composition answers the
 * *presence* of a pointer, not its coordinates — so the response is a seeded
 * property of the composition (reproducible, testable, bounded) rather than a
 * cursor read-out, and it costs one CSS state change instead of a rAF loop.
 */
export interface Pose {
  /** Travel in SVG user units, signed. */
  dx: number;
  dy: number;
  /** Degrees about the canvas centre. Always 0 on a wash mark — see OVERHANG. */
  rot: number;
  /** Always >= 1: outward only, same one-way rule the ambient drift follows. */
  scale: number;
  /** Milliseconds of stagger, so the composition arrives in waves. */
  delay: number;
}

/**
 * One drawn thing.
 *
 * Two render kinds cover every scene — a stroked `path` and a `circle` that is
 * either stroked (a ring) or filled (a dot, a blob). Keeping it at two is what
 * lets `LoginArtwork.tsx` stay a single loop with no per-scene branching.
 */
export interface Mark {
  kind: "path" | "circle";
  /** `kind === "path"`. Cubic, arc or line — the component does not care. */
  d?: string;
  /** `kind === "circle"`. */
  cx?: number;
  cy?: number;
  r?: number;
  /** A filled dot/blob rather than a stroked outline. */
  filled: boolean;
  /**
   * This mark must leave the frame at BOTH ends, so no stroke cap is ever
   * visible inside the crop. True for ribbons and strata bands; false for
   * everything that is meant to sit inside the picture.
   */
  spans: boolean;
  hue: string;
  /** Stroke width; 0 on a filled mark. */
  width: number;
  opacity: number;
  /** Index into {@link BLUR_LEVELS}, or -1 for an unfiltered (crisp) mark. */
  blur: number;
  layer: Layer;
  motion: Motion;
  pose: Pose;
}

/**
 * A keystroke burst: one expanding ring, fired from a fixed pool round-robin.
 *
 * Only the origin is generated — the expansion itself is driven imperatively
 * from the component (Web Animations), because a keystroke is an event and a
 * CSS animation cannot be re-triggered without either remounting the element
 * (which would reset its neighbours' ambient phase) or forcing a reflow.
 */
export interface Ripple {
  cx: number;
  cy: number;
  hue: string;
}

export interface Artwork {
  seed: number;
  scene: SceneKind;
  /** Whole-composition rotation in degrees, for variety without new shapes. */
  tilt: number;
  /**
   * Whole-composition sway: peak degrees (signed) and the round-trip period.
   * Applied by a group OUTSIDE the tilt group — see `LoginArtwork.tsx`.
   */
  sway: { deg: number; dur: number };
  /** Pre-sorted into paint order: wash → structure → accent. */
  marks: Mark[];
  ripples: Ripple[];
}

/**
 * Gaussian blur radii the wash marks are bucketed into.
 *
 * The wash is meant to read as soft colour clouds, with the structure and
 * accents left sharp — the contrast between the two is what gives the
 * composition its depth. The largest value is what sizes the filter region in
 * `LoginArtwork.tsx`; past ~20 the Gaussian's support outruns that region and
 * the mark gets a hard, straight cut-off.
 */
export const BLUR_LEVELS = [5, 10, 17] as const;

/**
 * Alpha correction per blur bucket. Note the direction: softer means DIMMER.
 *
 * The intuition runs the other way — a wide Gaussian lowers a mark's peak
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
 * Ceiling on any wash mark's alpha. `screen` over a near-black field turns
 * anything above this into a flat wash, and the panel stops being the dark half
 * of the split.
 */
export const WASH_ALPHA_MAX = 0.88;

/**
 * How far a non-spanning mark may stray outside the canvas.
 *
 * Not zero: an arc or a blob crossing the crop edge is part of the look. But a
 * mark generated far outside is one nobody will ever see, and a scene that
 * quietly spends half its shapes off-screen looks *sparse* rather than broken —
 * which is exactly the kind of fault that survives review.
 */
export const STRAY_MAX = 15;

/**
 * Size of the ripple pool.
 *
 * Fixed, not drawn: it is a recycling buffer, not a composition choice. Three is
 * what a burst of fast typing needs — at RIPPLE_MS ≈ 1.1 s and one ripple per
 * ~110 ms the oldest slot is always the one furthest through its expansion, so
 * restarting it is the least visible interruption available.
 */
export const RIPPLE_SLOTS = 3;

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
 * The draw context handed to every scene builder.
 *
 * NOTE ON ORDERING: every draw happens in source order, object-literal property
 * values included. Moving a line — or hoisting a `const` past another —
 * silently reshuffles EVERY composition, because each mark's values come off
 * one shared stream. That is not a bug, but it is never a cosmetic edit either.
 */
interface Ctx {
  rng: () => number;
  between: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
  /** ±magnitude. Consumes one draw, so it is part of the ordering. */
  signed: (value: number) => number;
  /** A negative start offset inside the first cycle. One draw. */
  phase: (duration: number) => number;
  hues: string[];
  /** Unit vector the whole composition displaces along under hover. */
  ux: number;
  uy: number;
}

/**
 * Build one composition.
 *
 * `scene` is for tests and for a future pinned marketing shot; the draw for it
 * is consumed either way, so `generateArtwork(s)` and `generateArtwork(s, <the
 * scene s would have picked>)` are the same composition.
 */
export function generateArtwork(seed: number, scene?: SceneKind): Artwork {
  const rng = mulberry32(seed);
  const between = (min: number, max: number) => min + rng() * (max - min);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rng() * items.length)]!;
  const signed = (value: number) => (rng() < 0.5 ? -value : value);
  /**
   * Capped at 0.95 of the period rather than the full one: a delay of exactly
   * `-dur` is phase-equivalent to no delay at all, which is the unison this
   * exists to prevent, and 2dp rounding can otherwise land there.
   */
  const phase = (duration: number) => r(-duration * rng() * 0.95);

  const drawn = SCENES[Math.floor(rng() * SCENES.length)]!;
  const kind = scene ?? drawn;

  // Two or three hues, never all six: a full palette in one frame reads as a
  // colour test card rather than a composition.
  const hues = shuffle(PALETTE, rng).slice(0, rng() < 0.5 ? 2 : 3);

  // One direction for the whole composition. Per-mark directions would cancel
  // out into a shimmer; one axis reads as the picture leaning.
  const angle = rng() * Math.PI * 2;
  const ctx: Ctx = {
    rng,
    between,
    pick,
    signed,
    phase,
    hues,
    ux: Math.cos(angle),
    uy: Math.sin(angle),
  };

  const marks =
    kind === "ribbons"
      ? ribbonScene(ctx)
      : kind === "orbits"
        ? orbitScene(ctx)
        : kind === "particles"
          ? particleScene(ctx)
          : strataScene(ctx);

  // Origins only; the expansion is fired per keystroke from the component.
  const ripples: Ripple[] = [];
  for (let i = 0; i < RIPPLE_SLOTS; i++) {
    // Held well inside the frame: a ripple is a circle, and one centred near an
    // edge spends most of its life as an arc sliding off the crop.
    ripples.push({ cx: r(between(22, 78)), cy: r(between(22, 78)), hue: pick(hues) });
  }

  return {
    seed,
    scene: kind,
    tilt: r(between(-18, 18)),
    sway: { deg: signed(3), dur: r(between(70, 100)) },
    marks,
    ripples,
  };
}

/* ---------------------------------------------------------------------------
   Shared mark builders. Every scene composes these; nothing below knows which
   scene it is being built for.
   ------------------------------------------------------------------------ */

/** The hover pose for a mark on `layer`. Sign and rotation come from the layer. */
function poseFor(ctx: Ctx, layer: Layer): Pose {
  const [lo, hi] = POSE_BANDS[layer];
  // Structure moves AGAINST the rest — see POSE_BANDS.
  const travel = ctx.between(lo, hi) * (layer === "structure" ? -1 : 1);
  const rot = layer === "wash" ? 0 : r(ctx.signed(ctx.between(1.2, 4)));
  const scale = r3(1 + ctx.between(0.01, layer === "wash" ? 0.03 : 0.06));
  return {
    dx: r(ctx.ux * travel),
    dy: r(ctx.uy * travel),
    rot,
    scale,
    delay: Math.round(ctx.rng() * POSE_DELAY_MAX),
  };
}

/** Alpha for a wash mark, compensated for its blur bucket and clamped. */
function washAlpha(ctx: Ctx, blur: number, lo: number, hi: number): number {
  return r3(Math.min(WASH_ALPHA_MAX, ctx.between(lo, hi) * BLUR_ALPHA[blur]!));
}

function drift(ctx: Ctx): Drift {
  const dur = r(ctx.between(20, 38));
  return {
    kind: "drift",
    dx: r(ctx.signed(ctx.between(8, 14))),
    dy: r(ctx.signed(ctx.between(6, 11))),
    rot: r(ctx.signed(ctx.between(1.5, 3.5))),
    // 3dp: 2dp would quantise this narrow band far too coarsely.
    scale: r3(1 + ctx.between(0.02, 0.06)),
    dur,
    delay: ctx.phase(dur),
  };
}

/** `index` only sets the direction — counter-rotation has to be guaranteed. */
function orbit(ctx: Ctx, index: number): Orbit {
  const dur = r(ctx.between(45, 80));
  return {
    kind: "orbit",
    rot: r((index % 2 === 0 ? 1 : -1) * ctx.between(3, 6)),
    dur,
    delay: ctx.phase(dur),
  };
}

function spin(ctx: Ctx, index: number, ox: number, oy: number): Spin {
  const dur = r(ctx.between(40, 90));
  return {
    kind: "spin",
    rot: r((index % 2 === 0 ? 1 : -1) * ctx.between(4, 14)),
    ox: r(ox),
    oy: r(oy),
    dur,
    delay: ctx.phase(dur),
  };
}

function pulse(ctx: Ctx): Pulse {
  const dur = r(ctx.between(5, 11));
  return { kind: "pulse", dim: r3(ctx.between(0.5, 0.78)), dur, delay: ctx.phase(dur) };
}

/** `dir` is the axis (a unit vector); the amplitude is drawn here. */
function slide(ctx: Ctx, dx: number, dy: number, lo: number, hi: number): Slide {
  const amp = ctx.between(lo, hi);
  const dur = r(ctx.between(25, 50));
  return { kind: "slide", dx: r(dx * amp), dy: r(dy * amp), dur, delay: ctx.phase(dur) };
}

/** A broad curved band entering left and leaving right. */
function ribbon(ctx: Ctx): Mark {
  const y0 = ctx.between(5, 95);
  const y1 = ctx.between(5, 95);
  const c1x = ctx.between(15, 45);
  const c2x = ctx.between(55, 85);
  const c1y = y0 + ctx.between(-45, 45);
  const c2y = y1 + ctx.between(-45, 45);
  // Drawn before the literal because `opacity` is compensated against it.
  const blur = Math.floor(ctx.rng() * BLUR_LEVELS.length);
  return {
    kind: "path",
    d: `M ${-OVERHANG} ${r(y0)} C ${r(c1x)} ${r(c1y)}, ${r(c2x)} ${r(c2y)}, ${
      VIEWBOX + OVERHANG
    } ${r(y1)}`,
    filled: false,
    spans: true,
    hue: ctx.pick(ctx.hues),
    width: r(ctx.between(7, 24)),
    opacity: washAlpha(ctx, blur, 0.34, 0.6),
    blur,
    layer: "wash",
    motion: drift(ctx),
    pose: poseFor(ctx, "wash"),
  };
}

/** A wide, heavily blurred annulus — colour without an edge. */
function halo(ctx: Ctx): Mark {
  const blur = ctx.rng() < 0.5 ? 1 : 2;
  return {
    kind: "circle",
    cx: r(ctx.between(25, 75)),
    cy: r(ctx.between(25, 75)),
    r: r(ctx.between(22, 42)),
    filled: false,
    spans: false,
    hue: ctx.pick(ctx.hues),
    width: r(ctx.between(12, 26)),
    opacity: washAlpha(ctx, blur, 0.3, 0.52),
    blur,
    layer: "wash",
    motion: drift(ctx),
    pose: poseFor(ctx, "wash"),
  };
}

/** A soft filled cloud. Dimmer than a halo: it covers far more of the field. */
function blob(ctx: Ctx): Mark {
  const blur = ctx.rng() < 0.4 ? 1 : 2;
  return {
    kind: "circle",
    cx: r(ctx.between(20, 80)),
    cy: r(ctx.between(20, 80)),
    r: r(ctx.between(16, 34)),
    filled: true,
    spans: false,
    hue: ctx.pick(ctx.hues),
    width: 0,
    opacity: washAlpha(ctx, blur, 0.3, 0.5),
    blur,
    layer: "wash",
    motion: drift(ctx),
    pose: poseFor(ctx, "wash"),
  };
}

/**
 * A straight band. All bands of a scene share one angle — that IS the scene.
 *
 * Never the widest blur bucket, and that is the whole difference between this
 * scene reading as banded light and reading as an empty panel. A 3-unit stroke
 * smeared over σ=17 has no peak left at all: the first cut of this scene shipped
 * with the same bucket weighting as the ribbons and rendered as a faint vertical
 * gradient with two stray ticks over it. A ribbon survives that blur because it
 * is up to 24 wide and curved; a band is neither.
 */
function bandMark(ctx: Ctx, slope: number, yc: number, ux: number, uy: number): Mark {
  const x0 = -OVERHANG;
  const x1 = VIEWBOX + OVERHANG;
  const blur = ctx.rng() < 0.55 ? 0 : 1;
  return {
    kind: "path",
    d: `M ${x0} ${r(yc + slope * (x0 - 50))} L ${x1} ${r(yc + slope * (x1 - 50))}`,
    filled: false,
    spans: true,
    hue: ctx.pick(ctx.hues),
    width: r(ctx.between(4, 16)),
    // Lower than the ribbons' band: these are far less blurred, so they keep
    // their peak, and there are more of them crossing the same field.
    opacity: washAlpha(ctx, blur, 0.24, 0.46),
    blur,
    layer: "wash",
    motion: slide(ctx, ux, uy, 5, 12),
    pose: poseFor(ctx, "wash"),
  };
}

function ring(ctx: Ctx, index: number): Mark {
  return {
    kind: "circle",
    cx: r(ctx.between(10, 90)),
    cy: r(ctx.between(10, 90)),
    r: r(ctx.between(8, 34)),
    filled: false,
    spans: false,
    hue: ctx.pick(ctx.hues),
    width: 0.35,
    opacity: r3(ctx.between(0.16, 0.4)),
    blur: -1,
    layer: "structure",
    motion: orbit(ctx, index),
    pose: poseFor(ctx, "structure"),
  };
}

/** An arc segment cut from a circle, turning on that circle's own centre. */
function arc(ctx: Ctx, index: number, fx: number, fy: number): Mark {
  const radius = ctx.between(10, 34);
  const a0 = ctx.rng() * Math.PI * 2;
  const da = ctx.between(0.6, 2.6);
  const a1 = a0 + da;
  const d =
    `M ${r(fx + radius * Math.cos(a0))} ${r(fy + radius * Math.sin(a0))} ` +
    `A ${r(radius)} ${r(radius)} 0 ${da > Math.PI ? 1 : 0} 1 ` +
    `${r(fx + radius * Math.cos(a1))} ${r(fy + radius * Math.sin(a1))}`;
  return {
    kind: "path",
    d,
    filled: false,
    spans: false,
    hue: ctx.pick(ctx.hues),
    width: r3(ctx.between(0.3, 0.7)),
    opacity: r3(ctx.between(0.2, 0.46)),
    blur: -1,
    layer: "structure",
    motion: spin(ctx, index, fx, fy),
    pose: poseFor(ctx, "structure"),
  };
}

/** A short cross-tick, perpendicular to the strata. */
function tick(ctx: Ctx, ux: number, uy: number): Mark {
  const cx = ctx.between(25, 75);
  const cy = ctx.between(25, 75);
  // Perpendicular to the band axis.
  const px = -uy;
  const py = ux;
  const half = ctx.between(8, 22);
  return {
    kind: "path",
    d: `M ${r(cx - px * half)} ${r(cy - py * half)} L ${r(cx + px * half)} ${r(cy + py * half)}`,
    filled: false,
    spans: false,
    hue: ctx.pick(ctx.hues),
    width: r3(ctx.between(0.3, 0.6)),
    opacity: r3(ctx.between(0.2, 0.44)),
    blur: -1,
    layer: "structure",
    motion: slide(ctx, ux, uy, 4, 10),
    pose: poseFor(ctx, "structure"),
  };
}

function spark(ctx: Ctx, lo = 0.5, hi = 1.8): Mark {
  return {
    kind: "circle",
    cx: r(ctx.between(12, 88)),
    cy: r(ctx.between(12, 88)),
    r: r(ctx.between(lo, hi)),
    filled: true,
    spans: false,
    hue: ctx.pick(ctx.hues),
    width: 0,
    opacity: r3(ctx.between(0.5, 0.9)),
    blur: -1,
    layer: "accent",
    motion: pulse(ctx),
    pose: poseFor(ctx, "accent"),
  };
}

/** A hairline stroke — a spark with a direction. Texture for the particle field. */
function dash(ctx: Ctx): Mark {
  const x = ctx.between(10, 90);
  const y = ctx.between(10, 90);
  const angle = ctx.rng() * Math.PI * 2;
  const len = ctx.between(1.5, 5);
  return {
    kind: "path",
    d: `M ${r(x)} ${r(y)} L ${r(x + len * Math.cos(angle))} ${r(y + len * Math.sin(angle))}`,
    filled: false,
    spans: false,
    hue: ctx.pick(ctx.hues),
    width: r3(ctx.between(0.3, 0.55)),
    opacity: r3(ctx.between(0.4, 0.8)),
    blur: -1,
    layer: "accent",
    motion: pulse(ctx),
    pose: poseFor(ctx, "accent"),
  };
}

/* ---------------------------------------------------------------------------
   The scenes. Each returns its marks already in paint order.
   ------------------------------------------------------------------------ */

function ribbonScene(ctx: Ctx): Mark[] {
  const marks: Mark[] = [];
  const ribbons = Math.floor(ctx.between(4, 7.99));
  for (let i = 0; i < ribbons; i++) marks.push(ribbon(ctx));
  const rings = Math.floor(ctx.between(2, 4.99));
  for (let i = 0; i < rings; i++) marks.push(ring(ctx, i));
  const sparks = Math.floor(ctx.between(2, 4.99));
  for (let i = 0; i < sparks; i++) marks.push(spark(ctx));
  return marks;
}

function orbitScene(ctx: Ctx): Mark[] {
  const marks: Mark[] = [];
  for (let i = 0; i < 2; i++) marks.push(halo(ctx));

  // One or two foci. Two reads as a binary system; one as a single orrery.
  const foci: Array<[number, number]> = [[ctx.between(32, 68), ctx.between(32, 68)]];
  if (ctx.rng() < 0.5) foci.push([ctx.between(32, 68), ctx.between(32, 68)]);
  const arcs = Math.floor(ctx.between(5, 9.99));
  for (let i = 0; i < arcs; i++) {
    const [fx, fy] = foci[i % foci.length]!;
    marks.push(arc(ctx, i, fx, fy));
  }

  const sparks = Math.floor(ctx.between(3, 5.99));
  for (let i = 0; i < sparks; i++) marks.push(spark(ctx));
  return marks;
}

function particleScene(ctx: Ctx): Mark[] {
  const marks: Mark[] = [];
  const blobs = Math.floor(ctx.between(2, 3.99));
  for (let i = 0; i < blobs; i++) marks.push(blob(ctx));

  const rings = Math.floor(ctx.between(1, 2.99));
  for (let i = 0; i < rings; i++) marks.push(ring(ctx, i));

  // The field. Small radii on purpose: the whole point is a scatter of crisp
  // points, and at this count anything larger reads as confetti.
  const points = Math.floor(ctx.between(16, 28.99));
  for (let i = 0; i < points; i++) {
    marks.push(ctx.rng() < 0.22 ? dash(ctx) : spark(ctx, 0.35, 1.4));
  }
  return marks;
}

function strataScene(ctx: Ctx): Mark[] {
  const marks: Mark[] = [];
  // One angle for the whole scene — parallel is the entire idea.
  const slope = ctx.between(-0.55, 0.55);
  const norm = Math.hypot(1, slope);
  const ux = 1 / norm;
  const uy = slope / norm;

  const bands = Math.floor(ctx.between(6, 10.99));
  // Evenly spread with jitter: a purely random intercept leaves gaps and
  // clusters, and a band generated at y=130 is one nobody ever sees.
  const step = 140 / bands;
  for (let i = 0; i < bands; i++) {
    marks.push(bandMark(ctx, slope, -20 + (i + ctx.between(0.15, 0.85)) * step, ux, uy));
  }

  // Three is the floor on purpose: two cross-ticks read as stray scratches over
  // the bands, three or more as a deliberate cross-hatch.
  const ticks = Math.floor(ctx.between(3, 5.99));
  for (let i = 0; i < ticks; i++) marks.push(tick(ctx, ux, uy));

  const sparks = Math.floor(ctx.between(2, 4.99));
  for (let i = 0; i < sparks; i++) marks.push(spark(ctx));
  return marks;
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
