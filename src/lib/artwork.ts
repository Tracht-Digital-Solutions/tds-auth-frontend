/**
 * The generative artwork beside the login form.
 *
 * A fresh composition on every visit — but a *bounded* one. That is the whole
 * design constraint: anything random enough to be interesting is also random
 * enough to produce something ugly, so the ranges here are deliberately narrow.
 * Counts, sizes, alphas and palette are all clamped to a band that cannot
 * compose badly; what varies is the arrangement inside it.
 *
 * The vocabulary is the brand's "Digitale Maßarbeit" (tds-shared's decoration
 * layer): CONSTRUCTED geometry — capsules, quarter and half circles, strongly
 * rounded rectangles — cut by the frame, conduit lines with rounded 90° corners
 * and nodes, the three-part brand accent, and the hard, unblurred 2D offset
 * shadow every card and button on the public sites and panels carries. It
 * replaced an aurora of blurred ribbons under a `screen` blend, which was the
 * "kalte Tech-Optik" the shared pass removed everywhere else. Only the far wash
 * is still soft, the way `.tds-wash` is soft at a section's edges.
 *
 * Variety comes from a SCENE drawn per visit — eight archetypes with different
 * shape and motion vocabularies (see {@link SCENES}).
 *
 * Pure and seeded, so a composition is reproducible from its number alone —
 * which is what makes it testable at all (see `artwork.test.ts`) and what would
 * let a specific one be pinned later if we ever want a fixed marketing shot.
 *
 * Colours are emitted as `var(--color-*)` references rather than literals. The
 * stage resolves them under `data-theme="dark"` in both page themes, because
 * the panel is a fixed dark field: the light theme's navy marks on a navy
 * ground were invisible.
 */

/** Square canvas; the SVG slices it to whatever the panel's aspect ratio is. */
export const VIEWBOX = 100;

/**
 * How far a SPANNING mark runs past the canvas at both ends.
 *
 * A strip, band or line that ends inside the frame shows its round cap, which
 * reads as a rendering fault rather than as a design choice — so both ends have
 * to stay outside the crop no matter what happens to them afterwards: the
 * composition is tilted by up to 18°, swayed by another 3°, and each mark moves
 * on top of that. A rotation about the canvas centre swings the ENDS furthest,
 * and swings the ends of a high or low mark *inward*. This is sized for the
 * worst combination, with margin — which is also why a spanning mark never
 * rotates on its own (its motion is a translation, its hover pose carries no
 * rotation; both are pinned in `artwork.test.ts`).
 */
export const OVERHANG = 45;

/**
 * Brand hues the composition may draw from. Resolved under the dark theme (see
 * the module note), so these are the light-on-dark twins.
 *
 * Gold is not drawn as a field hue: it is the brand's punctuation colour ("short
 * rules, single nodes"), so every composition carries it as {@link SPOT} for
 * its nodes, ticks and the brand accent, and nowhere else.
 */
export const PALETTE = [
  "var(--color-primary)",
  "var(--color-accent)",
  "var(--color-accent-pink)",
  "var(--color-cat-violet)",
  "var(--color-cat-cyan)",
  "var(--color-gold)",
] as const;
export const SPOT = "var(--color-gold)";
const FIELD_HUES = PALETTE.filter((hue) => hue !== SPOT);
const BRAND_ACCENT = "var(--color-accent)";
const BRAND_CORAL = "var(--color-accent-pink)";

/**
 * The eight composition archetypes. Each fills the same three layers (see
 * {@link LAYERS}); what differs is the shape and motion vocabulary:
 *
 *  - `constructs` — big cut slabs behind a handful of shadowed tiles.
 *  - `circuits`   — conduits running in from the edge to chips and nodes, with
 *                   signals travelling along them.
 *  - `orbits`     — arc segments turning on one or two foci, nodes riding them.
 *  - `strata`     — parallel capsule bands sliding along their own axis.
 *  - `raster`     — a dot matrix with a pulse running through it as a wave.
 *  - `mosaic`     — a cluster of shadowed tiles that turn by quarter steps.
 *  - `ribbons`    — flat curved paper strips, each with its hard shadow.
 *  - `measure`    — tape-measure rules, registration crosses, the logomark's
 *                   diagonal cut and the brand accent. "Maßarbeit", literally.
 */
export const SCENES = [
  "constructs",
  "circuits",
  "orbits",
  "strata",
  "raster",
  "mosaic",
  "ribbons",
  "measure",
] as const;
export type SceneKind = (typeof SCENES)[number];

/**
 * Depth layers, ordered back to front — and this is also the PAINT order, which
 * is why `Artwork.marks` arrives pre-sorted by it.
 *
 *  - `wash`      soft fields and big translucent slabs. Broad, quiet.
 *  - `structure` the crisp geometry: tiles, conduits, strips, rules, rings.
 *  - `accent`    the few sharp focal points that give the eye somewhere to land.
 */
export const LAYERS = ["wash", "structure", "accent"] as const;
export type Layer = (typeof LAYERS)[number];

/**
 * How far a mark travels, in SVG user units, when the pointer is over the panel.
 *
 * The three bands are DISJOINT, and that separation IS the depth cue: the wash
 * moves least, the accents most. `structure` additionally travels in the
 * OPPOSITE direction (the sign is applied in {@link poseFor}), for the same
 * reason the rings counter-rotate: if every layer slid the same way the response
 * would read as the whole picture being dragged.
 */
export const POSE_BANDS: Record<Layer, readonly [number, number]> = {
  wash: [2.2, 4],
  structure: [4.8, 6.6],
  accent: [7.4, 9.6],
};

/**
 * Ceiling on a mark's hover stagger, in milliseconds. Low, because the same
 * delay applies on the way BACK, and a decoration still rearranging itself half
 * a second after the pointer left reads as lag rather than as weight.
 */
export const POSE_DELAY_MAX = 220;

/**
 * Ceiling on a mark's entrance delay, in milliseconds. The build-up is a
 * one-shot that has to be over before anyone has finished typing an address.
 */
export const ENTER_MAX = 1500;

/** A ceiling on the composition's size: "abstract" must not become "a hundred shapes". */
export const MARKS_MAX = 64;

/**
 * Hard-shadow offset band, in user units. At the desktop panel's ~9 px per unit
 * that is the 6–8 px of `--tds-shadow-hard` on the cards beside it; on the phone
 * band it shrinks with the picture, which is what a drawn shadow should do.
 */
export const SHADE_RANGE = [0.55, 0.95] as const;

/** Ambient drift for one mark. Plain numbers; the component adds the units. */
export interface Drift {
  kind: "drift";
  /** Peak offset in SVG user units, signed. */
  dx: number;
  dy: number;
  /** Peak rotation in degrees, signed. */
  rot: number;
  /** Peak scale, always >= 1: outward only, so an overhang is never pulled in. */
  scale: number;
  /** Seconds for one there-and-back cycle. */
  dur: number;
  /** NEGATIVE seconds: every shape starts mid-cycle, never in unison. */
  delay: number;
}

/**
 * A short arc about the CANVAS centre. Rotating a circle about its own centre
 * is a no-op, so a ring travels by being swung about the canvas instead.
 */
export interface Orbit {
  kind: "orbit";
  rot: number;
  dur: number;
  delay: number;
}

/**
 * A short arc about the mark's OWN pivot — an arc segment turning on the circle
 * it was cut from, and a node riding that circle. The pivot is carried
 * explicitly because `transform-box: fill-box` would turn the arc about its
 * bounding box instead.
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
 * A quarter step about the tile's own centre, held still for most of the cycle:
 * rest → turn → rest → turn back. The mosaic reads as a still floor that every
 * so often rearranges one tile, not as spinning parts.
 */
export interface Turn {
  kind: "turn";
  /** ±90, or a multiple of it — the tile has to land on its own grid. */
  rot: number;
  ox: number;
  oy: number;
  dur: number;
  delay: number;
}

/** Breathing in opacity only — a multiplier resting at 1. */
export interface Pulse {
  kind: "pulse";
  /** Multiplier on the resting opacity at the bottom of the cycle. */
  dim: number;
  dur: number;
  delay: number;
}

/** A there-and-back translation along a fixed axis. */
export interface Slide {
  kind: "slide";
  dx: number;
  dy: number;
  dur: number;
  delay: number;
}

export type Motion = Drift | Orbit | Spin | Turn | Pulse | Slide;

/**
 * Where a mark goes while the pointer is anywhere over the panel. The PRESENCE
 * of a pointer, never its coordinates: a seeded property of the composition.
 */
export interface Pose {
  /** Travel in SVG user units, signed. */
  dx: number;
  dy: number;
  /** Degrees about the canvas centre. 0 on a wash or spanning mark. */
  rot: number;
  /** Always >= 1: outward only. */
  scale: number;
  /** Milliseconds of stagger, so the composition arrives in waves. */
  delay: number;
}

/**
 * The one-shot build-up when the composition first appears.
 *
 *  - `draw` — an open stroke is drawn along its length (a conduit, an arc).
 *  - `pop`  — a shape grows into place from its own centre.
 *  - `fade` — a spanning shape fades in. It cannot pop: shrunk about its own
 *             centre, a band longer than the canvas would show its caps.
 *  - `none` — the wash, which arrives with the canvas fade.
 */
export interface Enter {
  kind: "none" | "pop" | "draw" | "fade";
  /** Milliseconds. */
  delay: number;
}

/** A pulse of light travelling along a conduit, now and then. */
export interface Signal {
  hue: string;
  dur: number;
  /** NEGATIVE seconds, like every other phase. */
  delay: number;
}

/**
 * One drawn thing.
 *
 * Two render kinds cover every scene — a `path` (stroked or filled) and a
 * `circle` (stroked ring or filled dot) — so `LoginArtwork.tsx` stays a single
 * loop with no per-scene branching.
 */
export interface Mark {
  kind: "path" | "circle";
  /** `kind === "path"`. */
  d?: string;
  /** `kind === "circle"`. */
  cx?: number;
  cy?: number;
  r?: number;
  /** A filled shape rather than a stroked outline. */
  filled: boolean;
  /**
   * The mark must leave the frame at BOTH ends ({@link OVERHANG}); `ends` then
   * names the two ends of its axis. Spanning marks never rotate.
   */
  spans: boolean;
  ends?: [Pt, Pt];
  /** Where the mark sits — its centre, or the corner a cut slab is anchored on. */
  at: Pt;
  hue: string;
  /** Stroke width; 0 on a filled mark. */
  width: number;
  opacity: number;
  /** Index into {@link BLUR_LEVELS}, or -1 for a crisp mark. */
  blur: number;
  /** Hard-shadow offset in user units, down and right; 0 for none. */
  shade: number;
  /** `pathLength="1"` on the node: needed for a drawn entrance or a signal. */
  measured: boolean;
  layer: Layer;
  motion: Motion;
  pose: Pose;
  enter: Enter;
  signal?: Signal;
}

/**
 * What a keystroke does to one mark. Each scene answers typing in its own
 * vocabulary instead of one generic burst:
 *
 *  - `press`   — a shadowed shape sinks into its shadow and springs back (a key).
 *  - `signal`  — a pulse runs along a conduit, edge to node, in one go.
 *  - `light`   — a dot flares and settles (raster cells, terminal nodes).
 *  - `flick`   — an arc or ring swings `rot` degrees about its pivot and back.
 *  - `whirl`   — an orbit's rider runs once round its whole orbit.
 *  - `flip`    — a mosaic tile spins a full turn about its own centre.
 *  - `shove`   — a band is pushed `dx`/`dy` along its axis and returns.
 *  - `flutter` — a paper strip lifts and settles across its run.
 *  - `advance` — a tape pays out one major unit (`dx`/`dy`); the jump back at
 *                the end is a whole tick period, so it is invisible.
 *  - `spin`    — a registration cross turns a quarter (it looks the same after).
 *
 * Every end state is the resting state, so a burst never leaves anything behind.
 */
export const ACTS = [
  "press",
  "signal",
  "light",
  "flick",
  "whirl",
  "flip",
  "shove",
  "flutter",
  "advance",
  "spin",
] as const;
export type Act = (typeof ACTS)[number];

export interface KeyPart {
  /** Index into `Artwork.marks`. */
  mark: number;
  act: Act;
  /** User units, for `shove`, `flutter` and `advance`. */
  dx: number;
  dy: number;
  /** Degrees, for `flick`, `flip` and `spin`. */
  rot: number;
  /** Milliseconds after the keystroke — a signal's node flares on arrival. */
  delay: number;
}

/** One keystroke's answer; the component fires the pool round-robin. */
export interface Keystroke {
  parts: KeyPart[];
}

export interface Artwork {
  seed: number;
  scene: SceneKind;
  /** Whole-composition rotation in degrees, for variety without new shapes. */
  tilt: number;
  /** Whole-composition sway: peak degrees (signed) and the round-trip period. */
  sway: { deg: number; dur: number };
  /** Pre-sorted into paint order: wash → structure → accent. */
  marks: Mark[];
  /** The keystroke pool, fired round-robin. Never empty. */
  keys: Keystroke[];
}

export type Pt = [number, number];

/**
 * Gaussian blur radii the soft fields are bucketed into. Only the far wash is
 * soft; everything constructed is crisp. The largest value sizes the filter
 * region in `LoginArtwork.tsx`; keep it ≤ 20.
 */
export const BLUR_LEVELS = [5, 10, 17] as const;

/**
 * Ceiling on any wash mark's alpha. These are light hues over a dark field with
 * plain alpha compositing: above this a field stops being a tint and becomes a
 * second colour block competing with the form.
 */
export const WASH_ALPHA_MAX = 0.34;

/**
 * How far a mark's anchor may sit outside the canvas. A cut slab is anchored on
 * a corner just outside the frame; anything further is a shape nobody sees.
 */
export const STRAY_MAX = 22;

/** Ceilings on a keystroke's travel, so a burst stays a twitch, not a shove off-canvas. */
export const KEY_TRAVEL_MAX = 18;
export const KEY_DELAY_MAX = 700;

/** How far each scene may tilt. The orthogonal ones read as askew past ~10°. */
const TILT_MAX: Record<SceneKind, number> = {
  constructs: 18,
  circuits: 10,
  orbits: 18,
  strata: 18,
  raster: 10,
  mosaic: 10,
  ribbons: 18,
  measure: 12,
};

/**
 * mulberry32 — a small, fast, well-distributed PRNG. `Math.random()` cannot be
 * seeded, and the same number must always yield the same composition.
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
 * values included. Moving a line silently reshuffles EVERY composition, because
 * each mark's values come off one shared stream. Never a cosmetic edit.
 */
interface Ctx {
  rng: () => number;
  between: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
  /** ±magnitude. Consumes one draw. */
  signed: (value: number) => number;
  /** A negative start offset inside the first cycle. One draw. */
  phase: (duration: number) => number;
  hues: string[];
  /** Unit vector the whole composition displaces along under hover. */
  ux: number;
  uy: number;
  /** Running count of turning marks, so consecutive ones alternate direction. */
  turns: number;
  /** Keystroke answers, collected by the builders against mark OBJECTS. */
  keys: Draft[][];
}

/** A key part before paint order is known; resolved to an index afterwards. */
interface Draft {
  mark: Mark;
  act: Act;
  dx?: number;
  dy?: number;
  rot?: number;
  delay?: number;
}

/**
 * Build one composition.
 *
 * `scene` is for tests and for a future pinned shot; the draw for it is
 * consumed either way, so `generateArtwork(s)` and `generateArtwork(s, <the
 * scene s would have picked>)` are the same composition.
 */
export function generateArtwork(seed: number, scene?: SceneKind): Artwork {
  const rng = mulberry32(seed);
  const between = (min: number, max: number) => min + rng() * (max - min);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rng() * items.length)]!;
  const signed = (value: number) => (rng() < 0.5 ? -value : value);
  // Capped at 0.95 of the period: a delay of exactly `-dur` is the unison this
  // exists to prevent, and 2dp rounding can otherwise land there.
  const phase = (duration: number) => r(-duration * rng() * 0.95);

  const drawn = SCENES[Math.floor(rng() * SCENES.length)]!;
  const kind = scene ?? drawn;

  // Two or three field hues, never all of them: a full palette in one frame
  // reads as a colour test card. Gold rides along as the spot colour.
  let hues: string[] = shuffle(FIELD_HUES, rng).slice(0, rng() < 0.5 ? 2 : 3);
  // The brand accent is bordeaux · coral · gold and nothing else, so a scene
  // that sets it builds its palette around those two hues instead of adding
  // them on top — which would be five colours in one frame.
  if (kind === "measure") {
    hues = [BRAND_ACCENT, BRAND_CORAL, ...hues.filter((h) => h !== BRAND_ACCENT && h !== BRAND_CORAL)].slice(
      0,
      3,
    );
  }

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
    turns: 0,
    keys: [],
  };

  const build: Record<SceneKind, (c: Ctx) => Mark[]> = {
    constructs: constructScene,
    circuits: circuitScene,
    orbits: orbitScene,
    strata: strataScene,
    raster: rasterScene,
    mosaic: mosaicScene,
    ribbons: ribbonScene,
    measure: measureScene,
  };
  const marks = sortByLayer(build[kind](ctx));
  const keys: Keystroke[] = ctx.keys
    .filter((parts) => parts.length > 0)
    .map((parts) => ({
      parts: parts.map((p) => ({
        mark: marks.indexOf(p.mark),
        act: p.act,
        dx: r(p.dx ?? 0),
        dy: r(p.dy ?? 0),
        rot: r(p.rot ?? 0),
        delay: Math.round(p.delay ?? 0),
      })),
    }));

  const tiltMax = TILT_MAX[kind];
  return {
    seed,
    scene: kind,
    tilt: r(between(-tiltMax, tiltMax)),
    sway: { deg: signed(between(1.5, 3)), dur: r(between(70, 100)) },
    marks,
    keys,
  };
}

/* ---------------------------------------------------------------------------
   Geometry. Every shape is built in local coordinates about (0,0) and placed
   with one rotation + translation; circular arcs survive a rotation unchanged,
   so nothing here needs a `transform` attribute (which the hover CSS would
   override on an accent).
   ------------------------------------------------------------------------ */

type Place = (p: Pt) => Pt;

function place(cx: number, cy: number, deg = 0): Place {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return ([x, y]) => [cx + x * c - y * s, cy + x * s + y * c];
}

/** A tiny path writer: M / L / circular A / Z, every point through `at`. */
class Pen {
  private parts: string[] = [];
  constructor(private readonly at: Place = (p) => p) {}
  m(x: number, y: number) {
    const [a, b] = this.at([x, y]);
    this.parts.push(`M ${r(a)} ${r(b)}`);
    return this;
  }
  l(x: number, y: number) {
    const [a, b] = this.at([x, y]);
    this.parts.push(`L ${r(a)} ${r(b)}`);
    return this;
  }
  a(radius: number, large: 0 | 1, sweep: 0 | 1, x: number, y: number) {
    const [a, b] = this.at([x, y]);
    this.parts.push(`A ${r(radius)} ${r(radius)} 0 ${large} ${sweep} ${r(a)} ${r(b)}`);
    return this;
  }
  z() {
    this.parts.push("Z");
    return this;
  }
  toString() {
    return this.parts.join(" ");
  }
}

/** A capsule `w` long and `h` thick (w >= h), centred on the origin. */
function capsulePath(at: Place, w: number, h: number): string {
  const rr = h / 2;
  const hw = Math.max(0, w / 2 - rr);
  return new Pen(at)
    .m(-hw, -rr)
    .l(hw, -rr)
    .a(rr, 0, 1, hw, rr)
    .l(-hw, rr)
    .a(rr, 0, 1, -hw, -rr)
    .z()
    .toString();
}

/** A rectangle with corner radius `rad`, centred on the origin. */
function roundRectPath(at: Place, w: number, h: number, rad: number): string {
  const x = w / 2;
  const y = h / 2;
  const k = Math.min(rad, x, y);
  return new Pen(at)
    .m(-x + k, -y)
    .l(x - k, -y)
    .a(k, 0, 1, x, -y + k)
    .l(x, y - k)
    .a(k, 0, 1, x - k, y)
    .l(-x + k, y)
    .a(k, 0, 1, -x, y - k)
    .l(-x, -y + k)
    .a(k, 0, 1, -x + k, -y)
    .z()
    .toString();
}

/**
 * A quarter circle: a square of side `s` whose bottom-right corner is fully
 * rounded, centred on the origin. The rotation picks which corner rounds — the
 * same "the suffix names the rounded corner" rule as `.tds-shape--quarter-*`.
 */
function quarterPath(at: Place, s: number): string {
  const h = s / 2;
  return new Pen(at).m(-h, -h).l(h, -h).a(s, 0, 1, -h, h).z().toString();
}

/** A half disc of diameter `s`, flat side down, centred on its bounding box. */
function halfPath(at: Place, s: number): string {
  const R = s / 2;
  return new Pen(at)
    .m(-R, R / 2)
    .a(R, 0, 1, R, R / 2)
    .z()
    .toString();
}

/**
 * An orthogonal run through `pts` with every corner rounded to `rc` — the
 * conduit line of `.tds-circuit`, never a sharp elbow.
 */
function conduitPath(pts: Pt[], rc: number): string {
  const pen = new Pen();
  pen.m(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1]!;
    const [x, y] = pts[i]!;
    const [nx, ny] = pts[i + 1]!;
    const inLen = Math.hypot(x - px, y - py);
    const outLen = Math.hypot(nx - x, ny - y);
    const k = Math.min(rc, inLen / 2, outLen / 2);
    const d1: Pt = [(x - px) / inLen, (y - py) / inLen];
    const d2: Pt = [(nx - x) / outLen, (ny - y) / outLen];
    // Screen coordinates (y down): a positive cross product is a clockwise turn.
    const sweep = d1[0] * d2[1] - d1[1] * d2[0] > 0 ? 1 : 0;
    pen.l(x - d1[0] * k, y - d1[1] * k).a(k, 0, sweep, x + d2[0] * k, y + d2[1] * k);
  }
  const last = pts[pts.length - 1]!;
  pen.l(last[0], last[1]);
  return pen.toString();
}

/** A straight line from `a` to `b`. */
function linePath(a: Pt, b: Pt): string {
  return new Pen().m(a[0], a[1]).l(b[0], b[1]).toString();
}

/**
 * Half-length of a spanning mark centred on (`cx`,`cy`), at ANY angle: long
 * enough that both ends sit OVERHANG past the frame on the worst (diagonal)
 * heading, from wherever the mark is centred. Over-long is free; short shows a cap.
 */
function spanHalf(cx: number, cy: number): number {
  return (VIEWBOX / 2 + OVERHANG) * Math.SQRT2 + Math.hypot(cx - 50, cy - 50);
}

/** A pose shared by marks that must move as one piece, staggered by `t` in [0, 1]. */
function staggered(pose: Pose, t: number): Pose {
  return { ...pose, delay: Math.round(clamp(t, 0, 1) * POSE_DELAY_MAX) };
}

/* ---------------------------------------------------------------------------
   Motion, pose and entrance builders. Nothing below knows which scene it is
   being built for.
   ------------------------------------------------------------------------ */

/** The hover pose for a mark on `layer`. Sign and rotation come from the layer. */
function poseFor(ctx: Ctx, layer: Layer, still = false): Pose {
  const [lo, hi] = POSE_BANDS[layer];
  // Structure moves AGAINST the rest — see POSE_BANDS.
  const travel = ctx.between(lo, hi) * (layer === "structure" ? -1 : 1);
  // The draw is consumed either way, so `still` never reshuffles a neighbour.
  const turn = r(ctx.signed(ctx.between(1.2, 4)));
  const rot = layer === "wash" || still ? 0 : turn;
  const scale = r3(1 + ctx.between(0.01, layer === "wash" ? 0.03 : 0.06));
  return {
    dx: r(ctx.ux * travel),
    dy: r(ctx.uy * travel),
    rot,
    scale,
    delay: Math.round(ctx.rng() * POSE_DELAY_MAX),
  };
}

function enter(ctx: Ctx, kind: Enter["kind"], lo: number, hi: number): Enter {
  return { kind, delay: kind === "none" ? 0 : Math.round(Math.min(ENTER_MAX, ctx.between(lo, hi))) };
}

function drift(ctx: Ctx, amp = 1): Drift {
  const dur = r(ctx.between(20, 38));
  return {
    kind: "drift",
    dx: r(ctx.signed(ctx.between(8, 14) * amp)),
    dy: r(ctx.signed(ctx.between(6, 11) * amp)),
    rot: r(ctx.signed(ctx.between(1.5, 3.5) * amp)),
    // 3dp: 2dp would quantise this narrow band far too coarsely.
    scale: r3(1 + ctx.between(0.02, 0.06) * amp),
    dur,
    delay: ctx.phase(dur),
  };
}

/** Direction alternates across the WHOLE composition — see `Ctx.turns`. */
function orbit(ctx: Ctx): Orbit {
  const dur = r(ctx.between(45, 80));
  return {
    kind: "orbit",
    rot: r((ctx.turns++ % 2 === 0 ? 1 : -1) * ctx.between(3, 6)),
    dur,
    delay: ctx.phase(dur),
  };
}

function spin(ctx: Ctx, ox: number, oy: number, lo = 4, hi = 14): Spin {
  const dur = r(ctx.between(40, 90));
  return {
    kind: "spin",
    rot: r((ctx.turns++ % 2 === 0 ? 1 : -1) * ctx.between(lo, hi)),
    ox: r(ox),
    oy: r(oy),
    dur,
    delay: ctx.phase(dur),
  };
}

function turn(ctx: Ctx, ox: number, oy: number): Turn {
  const dur = r(ctx.between(14, 30));
  return {
    kind: "turn",
    rot: (ctx.turns++ % 2 === 0 ? 1 : -1) * 90,
    ox: r(ox),
    oy: r(oy),
    dur,
    delay: ctx.phase(dur),
  };
}

function pulse(ctx: Ctx, lo = 0.5, hi = 0.78): Pulse {
  const dur = r(ctx.between(5, 11));
  return { kind: "pulse", dim: r3(ctx.between(lo, hi)), dur, delay: ctx.phase(dur) };
}

/** Along the axis (`dx`,`dy`, a unit vector); the amplitude is drawn here. */
function slide(ctx: Ctx, dx: number, dy: number, lo: number, hi: number): Slide {
  const amp = ctx.between(lo, hi);
  const dur = r(ctx.between(25, 50));
  return { kind: "slide", dx: r(dx * amp), dy: r(dy * amp), dur, delay: ctx.phase(dur) };
}

/** A small bob in a random direction — tiles that should feel set down, not fixed. */
function bob(ctx: Ctx): Slide {
  const a = ctx.rng() * Math.PI * 2;
  return slide(ctx, Math.cos(a), Math.sin(a), 1.5, 4);
}

function shadeOf(ctx: Ctx): number {
  return r(ctx.between(SHADE_RANGE[0], SHADE_RANGE[1]));
}

/** Fields shared by every mark, so the builders below only state what differs. */
function base(
  over: Partial<Mark> & Pick<Mark, "kind" | "at" | "hue" | "layer" | "motion" | "pose" | "opacity">,
): Mark {
  return {
    filled: false,
    spans: false,
    width: 0,
    blur: -1,
    shade: 0,
    measured: false,
    enter: { kind: "none", delay: 0 },
    ...over,
  };
}

/* ---------------------------------------------------------------------------
   Marks.
   ------------------------------------------------------------------------ */

/** A soft brand field at the edge — the `.tds-wash` of this panel. */
function field(ctx: Ctx): Mark {
  // On an edge, not in the middle: a tint behind the centre of the picture is a
  // haze, one at the edge is a light source.
  const edge = Math.floor(ctx.rng() * 4);
  const along = ctx.between(10, 90);
  const off = ctx.between(-8, 12);
  const cx = edge === 0 ? off : edge === 1 ? VIEWBOX - off : along;
  const cy = edge === 2 ? off : edge === 3 ? VIEWBOX - off : along;
  const blur = ctx.rng() < 0.5 ? 1 : 2;
  return base({
    kind: "circle",
    cx: r(cx),
    cy: r(cy),
    r: r(ctx.between(22, 36)),
    filled: true,
    at: [r(cx), r(cy)],
    hue: ctx.pick(ctx.hues),
    opacity: r3(Math.min(WASH_ALPHA_MAX, ctx.between(0.16, 0.3))),
    blur,
    layer: "wash",
    motion: drift(ctx),
    pose: poseFor(ctx, "wash"),
  });
}

/**
 * A big flat slab cut by the frame — "angeschnittene Formen": a disc on an
 * edge, or a quarter circle anchored just outside a corner with its rounded
 * corner facing in.
 */
function slab(ctx: Ctx): Mark {
  const hue = ctx.pick(ctx.hues);
  const opacity = r3(ctx.between(0.11, 0.2));
  if (ctx.rng() < 0.5) {
    const corner = Math.floor(ctx.rng() * 4);
    const s = ctx.between(60, 82);
    const o = -18;
    // Square corner at `(o,o)` beyond the canvas corner; the rotation turns the
    // bottom-right rounding toward the centre from whichever corner it sits in.
    const cx = corner === 0 || corner === 3 ? o + s / 2 : VIEWBOX - o - s / 2;
    const cy = corner < 2 ? o + s / 2 : VIEWBOX - o - s / 2;
    const ax = corner === 0 || corner === 3 ? o : VIEWBOX - o;
    const ay = corner < 2 ? o : VIEWBOX - o;
    return base({
      kind: "path",
      d: quarterPath(place(cx, cy, corner * 90), s),
      filled: true,
      at: [ax, ay],
      hue,
      opacity,
      layer: "wash",
      motion: drift(ctx, 0.35),
      pose: poseFor(ctx, "wash"),
    });
  }
  const edge = Math.floor(ctx.rng() * 4);
  const along = ctx.between(20, 80);
  const off = ctx.between(-6, 8);
  const cx = edge === 0 ? off : edge === 1 ? VIEWBOX - off : along;
  const cy = edge === 2 ? off : edge === 3 ? VIEWBOX - off : along;
  return base({
    kind: "circle",
    cx: r(cx),
    cy: r(cy),
    r: r(ctx.between(24, 40)),
    filled: true,
    at: [r(cx), r(cy)],
    hue,
    opacity,
    layer: "wash",
    motion: drift(ctx, 0.5),
    pose: poseFor(ctx, "wash"),
  });
}

/** A great capsule crossing the whole frame — the "große Kapsel", cut at both ends. */
function bigCapsule(ctx: Ctx): Mark {
  const deg = ctx.between(-35, 35);
  const cy = ctx.between(25, 75);
  const half = spanHalf(50, cy);
  const at = place(50, cy, deg);
  const thick = ctx.between(16, 26);
  return base({
    kind: "path",
    d: capsulePath(at, half * 2 + thick, thick),
    filled: true,
    spans: true,
    ends: [at([-half, 0]).map(r) as Pt, at([half, 0]).map(r) as Pt],
    at: [50, r(cy)],
    hue: ctx.pick(ctx.hues),
    opacity: r3(ctx.between(0.11, 0.17)),
    layer: "wash",
    motion: slide(ctx, Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180), 4, 9),
    pose: poseFor(ctx, "wash"),
  });
}

/** The tile vocabulary of `.tds-shape`, in local coordinates. */
const TILE_FORMS = ["capsule", "quarter", "half", "rect", "disc"] as const;
type TileForm = (typeof TILE_FORMS)[number];

/** A shadowed tile: solid colour, the hard 2D offset beneath it. */
function tile(
  ctx: Ctx,
  cx: number,
  cy: number,
  size: number,
  form: TileForm,
  motion: (c: Ctx) => Motion,
  shade: number,
  delay: [number, number],
  shared?: Pose,
): Mark {
  const hue = ctx.rng() < 0.12 ? SPOT : ctx.pick(ctx.hues);
  const opacity = r3(ctx.between(0.82, 0.96));
  const quarterTurn = Math.floor(ctx.rng() * 4) * 90;
  const common = {
    filled: true,
    at: [r(cx), r(cy)] as Pt,
    hue,
    opacity,
    shade,
    layer: "structure" as const,
  };
  if (form === "disc") {
    return base({
      ...common,
      kind: "circle",
      cx: r(cx),
      cy: r(cy),
      r: r(size / 2),
      motion: motion(ctx),
      pose: shared ?? poseFor(ctx, "structure"),
      enter: enter(ctx, "pop", ...delay),
    });
  }
  const at = place(cx, cy, quarterTurn);
  const d =
    form === "capsule"
      ? capsulePath(at, size * 1.9, size * 0.8)
      : form === "quarter"
        ? quarterPath(at, size)
        : form === "half"
          ? halfPath(at, size)
          : roundRectPath(at, size, size, size * 0.28);
  return base({
    ...common,
    kind: "path",
    d,
    motion: motion(ctx),
    pose: poseFor(ctx, "structure"),
    enter: enter(ctx, "pop", ...delay),
  });
}

/** A hairline ring. */
function ring(ctx: Ctx, cx = ctx.between(15, 85), cy = ctx.between(15, 85), rad = ctx.between(8, 30)): Mark {
  return base({
    kind: "circle",
    cx: r(cx),
    cy: r(cy),
    r: r(rad),
    at: [r(cx), r(cy)],
    hue: ctx.pick(ctx.hues),
    width: r3(ctx.between(0.3, 0.5)),
    opacity: r3(ctx.between(0.2, 0.42)),
    layer: "structure",
    motion: orbit(ctx),
    pose: poseFor(ctx, "structure"),
    enter: enter(ctx, "pop", 150, 700),
  });
}

/** An arc segment cut from a circle about (`fx`,`fy`), turning on that centre. */
function arc(ctx: Ctx, fx: number, fy: number, radius: number): Mark {
  const a0 = ctx.rng() * Math.PI * 2;
  const da = ctx.between(0.6, 2.6);
  const a1 = a0 + da;
  const d =
    `M ${r(fx + radius * Math.cos(a0))} ${r(fy + radius * Math.sin(a0))} ` +
    `A ${r(radius)} ${r(radius)} 0 ${da > Math.PI ? 1 : 0} 1 ` +
    `${r(fx + radius * Math.cos(a1))} ${r(fy + radius * Math.sin(a1))}`;
  const mid = (a0 + a1) / 2;
  return base({
    kind: "path",
    d,
    at: [r(fx + radius * Math.cos(mid)), r(fy + radius * Math.sin(mid))],
    hue: ctx.pick(ctx.hues),
    width: r3(ctx.between(0.35, 0.8)),
    opacity: r3(ctx.between(0.3, 0.6)),
    measured: true,
    layer: "structure",
    motion: spin(ctx, fx, fy),
    pose: poseFor(ctx, "structure"),
    enter: enter(ctx, "draw", 100, 800),
  });
}

/** A crisp dot. `spot` forces the gold of a node. */
function dot(
  ctx: Ctx,
  cx = ctx.between(12, 88),
  cy = ctx.between(12, 88),
  rad = ctx.between(0.6, 1.8),
  motion: (c: Ctx) => Motion = (c) => pulse(c),
  spot = false,
  delay: [number, number] = [600, 1200],
): Mark {
  return base({
    kind: "circle",
    cx: r(cx),
    cy: r(cy),
    r: r(rad),
    filled: true,
    at: [r(cx), r(cy)],
    hue: spot || ctx.rng() < 0.35 ? SPOT : ctx.pick(ctx.hues),
    opacity: r3(ctx.between(0.6, 0.94)),
    layer: "accent",
    motion: motion(ctx),
    pose: poseFor(ctx, "accent"),
    enter: enter(ctx, "pop", ...delay),
  });
}

/** A registration cross — the tailor's chalk mark on a pattern. */
function cross(ctx: Ctx): Mark {
  const cx = ctx.between(14, 86);
  const cy = ctx.between(14, 86);
  const s = ctx.between(1.6, 3);
  const d = `${linePath([cx - s, cy], [cx + s, cy])} ${linePath([cx, cy - s], [cx, cy + s])}`;
  return base({
    kind: "path",
    d,
    at: [r(cx), r(cy)],
    hue: ctx.rng() < 0.5 ? SPOT : ctx.pick(ctx.hues),
    width: r3(ctx.between(0.35, 0.55)),
    opacity: r3(ctx.between(0.55, 0.9)),
    layer: "accent",
    motion: pulse(ctx),
    pose: poseFor(ctx, "accent"),
    enter: enter(ctx, "pop", 500, 1200),
  });
}

/**
 * A straight run crossing the whole frame along `deg` through (`cx`,`cy`), out
 * to OVERHANG at both ends.
 */
function spanLine(
  cx: number,
  cy: number,
  deg: number,
): { d: string; ends: [Pt, Pt]; ux: number; uy: number } {
  const half = spanHalf(cx, cy);
  const at = place(cx, cy, deg);
  const a = at([-half, 0]).map(r) as Pt;
  const b = at([half, 0]).map(r) as Pt;
  const rad = (deg * Math.PI) / 180;
  return { d: linePath(a, b), ends: [a, b], ux: Math.cos(rad), uy: Math.sin(rad) };
}

/**
 * The logomark's diagonal cut: ONE steep hairline at the mark's angle (72°, i.e.
 * the 18° skew of `.tds-shape--diagonal`), crossing the frame top to bottom.
 */
function diagonal(ctx: Ctx): Mark {
  const cx = ctx.between(22, 78);
  const { d, ends, ux, uy } = spanLine(cx, 50, ctx.rng() < 0.5 ? 72 : 108);
  return base({
    kind: "path",
    d,
    spans: true,
    ends,
    at: [r(cx), 50],
    hue: ctx.pick(ctx.hues),
    width: r3(ctx.between(0.35, 0.6)),
    opacity: r3(ctx.between(0.35, 0.6)),
    measured: true,
    layer: "structure",
    // Across its own axis: along it, an infinite line does not visibly move.
    motion: slide(ctx, -uy, ux, 2, 5),
    pose: poseFor(ctx, "structure", true),
    enter: enter(ctx, "draw", 0, 500),
  });
}

/**
 * A tape-measure rule: a spanning baseline with ticks every `step`, a long one
 * every fifth. One path, so a hundred ticks cost one node.
 */
function ruler(ctx: Ctx, cx: number, cy: number, deg: number): Mark {
  const half = spanHalf(cx, cy);
  const step = ctx.between(2.2, 3.4);
  const at = place(cx, cy, deg);
  const pen = new Pen(at);
  pen.m(-half, 0).l(half, 0);
  const n = Math.floor((half * 2) / step);
  for (let i = 0; i <= n; i++) {
    const x = -half + i * step;
    const long = i % 5 === 0;
    pen.m(x, 0).l(x, long ? -3.2 : -1.6);
  }
  const rad = (deg * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const tape = base({
    kind: "path",
    d: pen.toString(),
    spans: true,
    ends: [at([-half, 0]).map(r) as Pt, at([half, 0]).map(r) as Pt],
    at: [r(cx), r(cy)],
    hue: ctx.pick([...ctx.hues, SPOT]),
    width: r3(ctx.between(0.3, 0.45)),
    opacity: r3(ctx.between(0.4, 0.65)),
    layer: "structure",
    // The tape pays out and draws back along itself, by whole ticks or not.
    motion: slide(ctx, ux, uy, 3, 9),
    pose: poseFor(ctx, "structure", true),
    enter: enter(ctx, "fade", 0, 400),
  });
  // A keystroke pays out exactly one MAJOR unit (five ticks): the pattern is
  // periodic in that length, so the snap back when the burst ends is invisible.
  ctx.keys.push([{ mark: tape, act: "advance", dx: ux * step * 5, dy: uy * step * 5 }]);
  return tape;
}

/* ---------------------------------------------------------------------------
   The scenes. Each returns its marks; `sortByLayer` puts them in paint order.
   ------------------------------------------------------------------------ */

function constructScene(ctx: Ctx): Mark[] {
  const marks: Mark[] = [field(ctx)];
  const slabs = Math.floor(ctx.between(1, 2.99));
  for (let i = 0; i < slabs; i++) marks.push(slab(ctx));
  if (ctx.rng() < 0.4) marks.push(bigCapsule(ctx));

  // Tiles on a loose grid of cells, one per cell, so two never stack into a
  // shape nobody designed.
  const cells = shuffle(
    Array.from({ length: 9 }, (_, i) => [20 + (i % 3) * 30, 20 + Math.floor(i / 3) * 30] as Pt),
    ctx.rng,
  );
  const tiles = Math.floor(ctx.between(3, 5.99));
  const shade = shadeOf(ctx);
  for (let i = 0; i < tiles; i++) {
    const [gx, gy] = cells[i]!;
    const size = ctx.between(9, 16);
    marks.push(
      tile(ctx, gx + ctx.between(-6, 6), gy + ctx.between(-6, 6), size, ctx.pick(TILE_FORMS), bob, shade, [
        150 + i * 110,
        300 + i * 110,
      ]),
    );
  }
  if (ctx.rng() < 0.5) marks.push(diagonal(ctx));
  const rings = Math.floor(ctx.between(0, 1.99));
  for (let i = 0; i < rings; i++) marks.push(ring(ctx));
  const dots = Math.floor(ctx.between(2, 4.99));
  for (let i = 0; i < dots; i++) marks.push(dot(ctx));
  pressKeys(ctx, marks);
  for (const mark of marks) {
    if (mark.motion.kind === "orbit")
      ctx.keys.push([{ mark, act: "flick", rot: Math.sign(mark.motion.rot) * 24 }]);
  }
  return marks;
}

/** How long a keystroke's pulse takes to reach the end of its conduit. */
export const ARRIVAL_MS = 520;

function circuitScene(ctx: Ctx): Mark[] {
  const marks: Mark[] = [field(ctx), slab(ctx)];

  // The board moves as ONE piece: conduits, chips and nodes share a single
  // slide (same values, same phase), or the connections would come apart.
  const board = slide(ctx, ctx.ux, ctx.uy, 1.5, 3.5);
  const still = () => board;
  // ...and answers hover as one piece, too.
  const boardPose = poseFor(ctx, "structure");

  const chips: Pt[] = [];
  // Drawn now (their positions route the conduits) but painted LAST: a conduit
  // runs into a chip, so it has to disappear under it, not cross over it.
  const chipMarks: Mark[] = [];
  const chipCount = Math.floor(ctx.between(1, 2.99));
  const shade = shadeOf(ctx);
  for (let i = 0; i < chipCount; i++) {
    const c: Pt = [ctx.between(30, 72), i === 0 ? ctx.between(26, 46) : ctx.between(56, 76)];
    chips.push(c);
    const w = ctx.between(12, 18);
    const h = ctx.between(8, 12);
    chipMarks.push(
      base({
        kind: "path",
        d: roundRectPath(place(c[0], c[1]), w, h, 2.2),
        filled: true,
        at: [r(c[0]), r(c[1])],
        hue: ctx.pick(ctx.hues),
        opacity: r3(ctx.between(0.84, 0.95)),
        shade,
        layer: "structure",
        motion: still(),
        pose: boardPose,
        enter: enter(ctx, "pop", 900, 1300),
      }),
    );
  }

  const nodes: Mark[] = [];
  const runs = Math.floor(ctx.between(3, 5.99));
  for (let i = 0; i < runs; i++) {
    // From one of the four edges, at a right-angle rotation of a left-to-right
    // run — a 90° rotation keeps every segment axis-aligned.
    const side = Math.floor(ctx.rng() * 4);
    const toChip = i < chips.length * 2 && ctx.rng() < 0.7;
    const target: Pt = toChip ? chips[i % chips.length]! : [ctx.between(25, 80), ctx.between(20, 80)];
    const fwd = place(50, 50, side * 90);
    const back = place(50, 50, -side * 90);
    const local = back([target[0] - 50, target[1] - 50]);
    const [tx, ty] = local;
    const y0 = clamp(ty + ctx.signed(ctx.between(8, 26)), 10, 90);
    const x1 = ctx.between(Math.max(4, tx - 40), tx - 8);
    const pts: Pt[] = [
      [-OVERHANG, y0],
      [x1, y0],
      [x1, ty],
      [tx, ty],
    ].map(([x, y]) => fwd([x - 50, y - 50]));
    const end = pts[pts.length - 1]!;
    const hue = ctx.pick(ctx.hues);
    const delay = 80 + i * 160;
    const conduit = base({
      kind: "path",
      d: conduitPath(pts, ctx.between(2.5, 4.5)),
      at: [r(end[0]), r(end[1])],
      hue,
      width: r3(ctx.between(0.45, 0.75)),
      opacity: r3(ctx.between(0.45, 0.72)),
      measured: true,
      layer: "structure",
      motion: still(),
      pose: boardPose,
      enter: enter(ctx, "draw", delay, delay + 60),
      signal: (() => {
        const dur = r(ctx.between(3.5, 7));
        return { hue: ctx.rng() < 0.6 ? SPOT : hue, dur, delay: ctx.phase(dur) };
      })(),
    });
    marks.push(conduit);
    // A keystroke sends a pulse down this conduit; what it runs into answers
    // when the pulse arrives — a chip presses like a key, a node flares.
    const key: Draft[] = [{ mark: conduit, act: "signal" }];
    if (toChip) key.push({ mark: chipMarks[i % chips.length]!, act: "press", delay: ARRIVAL_MS });
    ctx.keys.push(key);
    // The terminal node sits ON the board: structure, with the board's pose,
    // or hover would pull it off the end of its own conduit.
    if (!toChip) {
      const node = base({
        kind: "circle",
        cx: r(end[0]),
        cy: r(end[1]),
        r: r(ctx.between(1, 1.6)),
        filled: true,
        at: [r(end[0]), r(end[1])],
        hue: SPOT,
        opacity: r3(ctx.between(0.8, 0.95)),
        layer: "structure",
        motion: still(),
        pose: boardPose,
        enter: enter(ctx, "pop", delay + 700, delay + 800),
      });
      nodes.push(node);
      key.push({ mark: node, act: "light", delay: ARRIVAL_MS });
    }
  }
  marks.push(...nodes, ...chipMarks);
  // A few loose pads on the board.
  const pads = Math.floor(ctx.between(1, 3.99));
  for (let i = 0; i < pads; i++) marks.push(dot(ctx, undefined, undefined, ctx.between(0.6, 1.1)));
  return marks;
}

function orbitScene(ctx: Ctx): Mark[] {
  const marks: Mark[] = [field(ctx)];
  if (ctx.rng() < 0.5) marks.push(field(ctx));
  marks.push(slab(ctx));

  // One or two foci. Two reads as a binary system; one as a single orrery.
  const foci: Pt[] = [[ctx.between(34, 66), ctx.between(34, 66)]];
  if (ctx.rng() < 0.5) foci.push([ctx.between(30, 70), ctx.between(30, 70)]);

  // A solid core on each focus, shadowed like a tile: the orrery's sun.
  const shade = shadeOf(ctx);
  for (const [fx, fy] of foci) {
    marks.push(tile(ctx, fx, fy, ctx.between(6, 10), "disc", bob, shade, [100, 300]));
  }

  const arcs = Math.floor(ctx.between(5, 9.99));
  const radii: number[] = [];
  for (let i = 0; i < arcs; i++) {
    const [fx, fy] = foci[i % foci.length]!;
    const radius = ctx.between(10, 34);
    radii.push(radius);
    marks.push(arc(ctx, fx, fy, radius));
  }

  // Nodes riding the orbits: on an arc's circle, turning about the same focus.
  const riders = Math.floor(ctx.between(2, 3.99));
  for (let i = 0; i < riders; i++) {
    const k = i % arcs;
    const [fx, fy] = foci[k % foci.length]!;
    const a = ctx.rng() * Math.PI * 2;
    marks.push(
      dot(
        ctx,
        fx + radii[k]! * Math.cos(a),
        fy + radii[k]! * Math.sin(a),
        ctx.between(0.9, 1.5),
        (c) => spin(c, fx, fy, 8, 20),
        true,
      ),
    );
  }
  const dots = Math.floor(ctx.between(1, 3.99));
  for (let i = 0; i < dots; i++) marks.push(dot(ctx));
  for (const [fx, fy] of foci) {
    const onFocus = (m: Mark) => m.motion.kind === "spin" && m.motion.ox === r(fx) && m.motion.oy === r(fy);
    const core = marks.find((m) => m.shade > 0 && m.at[0] === r(fx) && m.at[1] === r(fy));
    const swing: Draft[] = marks
      .filter((m) => onFocus(m) && m.layer === "structure")
      .map((m) => ({ mark: m, act: "flick" as const, rot: Math.sign((m.motion as Spin).rot) * 28 }));
    if (core) swing.unshift({ mark: core, act: "press" });
    ctx.keys.push(swing);
    ctx.keys.push(
      marks
        .filter((m) => onFocus(m) && m.layer === "accent")
        .map((m) => ({ mark: m, act: "whirl" as const, rot: Math.sign((m.motion as Spin).rot) * 360 })),
    );
  }
  return marks;
}

function strataScene(ctx: Ctx): Mark[] {
  const marks: Mark[] = [field(ctx)];
  if (ctx.rng() < 0.5) marks.push(slab(ctx));

  // One angle for the whole scene — parallel is the entire idea.
  const deg = ctx.between(-28, 28);
  const rad = (deg * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  const bands = Math.floor(ctx.between(5, 8.99));
  // Evenly spread with jitter: a purely random offset leaves gaps and clusters.
  const step = 120 / bands;
  const shade = shadeOf(ctx);
  // At least one band is solid: a scene of panes alone has no shadow at all.
  const keystone = Math.floor(ctx.rng() * bands);
  for (let i = 0; i < bands; i++) {
    const off = -60 + (i + ctx.between(0.2, 0.8)) * step;
    // Offset across the axis from the canvas centre.
    const cx = 50 - uy * off;
    const cy = 50 + ux * off;
    const at = place(cx, cy, deg);
    const half = spanHalf(cx, cy);
    const thick = ctx.between(2.5, 9);
    // Some bands are solid and cast the hard shadow; the rest are translucent
    // panes the solid ones lie on.
    const solid = ctx.rng() < 0.4 || i === keystone;
    marks.push(
      base({
        kind: "path",
        d: capsulePath(at, half * 2 + thick, thick),
        filled: true,
        spans: true,
        ends: [at([-half, 0]).map(r) as Pt, at([half, 0]).map(r) as Pt],
        at: [r(cx), r(cy)],
        hue: ctx.pick(ctx.hues),
        opacity: solid ? r3(ctx.between(0.82, 0.94)) : r3(ctx.between(0.18, 0.4)),
        shade: solid ? shade : 0,
        layer: "structure",
        motion: slide(ctx, ux, uy, 5, 12),
        pose: poseFor(ctx, "structure", true),
        enter: enter(ctx, "fade", i * 90, i * 90 + 120),
      }),
    );
  }

  // Three is the floor: two cross-ticks read as stray scratches, three as a
  // deliberate cross-hatch. Perpendicular to the bands.
  const ticks = Math.floor(ctx.between(3, 5.99));
  for (let i = 0; i < ticks; i++) {
    const cx = ctx.between(25, 75);
    const cy = ctx.between(25, 75);
    const len = ctx.between(8, 22);
    marks.push(
      base({
        kind: "path",
        d: linePath([cx + uy * len, cy - ux * len], [cx - uy * len, cy + ux * len]),
        at: [r(cx), r(cy)],
        hue: ctx.pick([...ctx.hues, SPOT]),
        width: r3(ctx.between(0.3, 0.6)),
        opacity: r3(ctx.between(0.3, 0.55)),
        measured: true,
        layer: "structure",
        motion: slide(ctx, ux, uy, 4, 10),
        pose: poseFor(ctx, "structure"),
        enter: enter(ctx, "draw", 700, 1100),
      }),
    );
  }

  const dots = Math.floor(ctx.between(2, 4.99));
  for (let i = 0; i < dots; i++) marks.push(dot(ctx));
  let sign = 1;
  for (const mark of marks) {
    if (!mark.spans || mark.motion.kind !== "slide") continue;
    const len = Math.hypot(mark.motion.dx, mark.motion.dy) || 1;
    ctx.keys.push([
      { mark, act: "shove", dx: (sign * 7 * mark.motion.dx) / len, dy: (sign * 7 * mark.motion.dy) / len },
    ]);
    sign = -sign;
  }
  return marks;
}

function rasterScene(ctx: Ctx): Mark[] {
  const marks: Mark[] = [field(ctx), slab(ctx)];
  if (ctx.rng() < 0.5) marks.push(bigCapsule(ctx));

  // The matrix: a block of dots, off-centre, with a pulse running through it
  // as a wave. Every dot shares ONE period and takes its phase from where it
  // sits along the wave's direction — seeded, positional, never random.
  const cols = Math.floor(ctx.between(5, 8.99));
  const rows = Math.floor(ctx.between(4, 6.99));
  const gap = ctx.between(6, 8.5);
  const x0 = ctx.between(12, Math.max(12, 88 - (cols - 1) * gap));
  const y0 = ctx.between(12, Math.max(12, 88 - (rows - 1) * gap));
  const waveDur = r(ctx.between(5, 8));
  const wa = ctx.rng() * Math.PI * 2;
  const wx = Math.cos(wa);
  const wy = Math.sin(wa);
  const span = Math.abs(wx) * (cols - 1) * gap + Math.abs(wy) * (rows - 1) * gap || 1;
  const lo = Math.min(0, wx * (cols - 1) * gap) + Math.min(0, wy * (rows - 1) * gap);
  const hue = ctx.pick(ctx.hues);
  const lit = new Set<number>();
  const litCount = Math.floor(ctx.between(2, 4.99));
  for (let i = 0; i < litCount; i++) lit.add(Math.floor(ctx.rng() * cols * rows));

  const grid: Mark[] = [];
  const accents: Mark[] = [];
  const cells: Mark[] = [];
  // One pose for the matrix, delayed along the wave: the block moves as a
  // block, and the movement runs through it the way the pulse does.
  const gridPose = poseFor(ctx, "structure");
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = x0 + i * gap;
      const y = y0 + j * gap;
      const along = (wx * i * gap + wy * j * gap - lo) / span;
      const wave: Pulse = {
        kind: "pulse",
        dim: 0.45,
        dur: waveDur,
        delay: r(-waveDur * 0.9 * along),
      };
      if (lit.has(j * cols + i)) {
        const d = dot(ctx, x, y, ctx.between(1.1, 1.6), () => wave, true, [700, 1100]);
        accents.push(d);
        cells[j * cols + i] = d;
        continue;
      }
      const cell = base({
        kind: "circle",
        cx: r(x),
        cy: r(y),
        r: r(ctx.between(0.45, 0.65)),
        filled: true,
        at: [r(x), r(y)],
        hue,
        opacity: r3(ctx.between(0.5, 0.75)),
        layer: "structure",
        motion: wave,
        pose: staggered(gridPose, along),
        // The block builds up along the wave, too.
        enter: enter(ctx, "pop", 120 + along * 800, 160 + along * 800),
      });
      grid.push(cell);
      cells[j * cols + i] = cell;
    }
  }
  marks.push(...grid);

  const shade = shadeOf(ctx);
  const tiles = Math.floor(ctx.between(1, 2.99));
  for (let i = 0; i < tiles; i++) {
    marks.push(
      tile(
        ctx,
        ctx.between(20, 80),
        ctx.between(20, 80),
        ctx.between(9, 14),
        ctx.pick(TILE_FORMS),
        bob,
        shade,
        [900, 1300],
      ),
    );
  }
  marks.push(ring(ctx));
  marks.push(...accents);
  // Each keystroke lights a cell, and the light steps out to its four
  // neighbours a beat later — a keypad being played, not a drop in water.
  const presses = shuffle(
    Array.from({ length: cols * rows }, (_, k) => k),
    ctx.rng,
  ).slice(0, 10);
  for (const k of presses) {
    const i = k % cols;
    const j = Math.floor(k / cols);
    const key: Draft[] = [{ mark: cells[k]!, act: "light" }];
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const ni = i + di;
      const nj = j + dj;
      if (ni >= 0 && ni < cols && nj >= 0 && nj < rows)
        key.push({ mark: cells[nj * cols + ni]!, act: "light", delay: 90 });
    }
    ctx.keys.push(key);
  }
  return marks;
}

function mosaicScene(ctx: Ctx): Mark[] {
  const marks: Mark[] = [field(ctx), slab(ctx)];

  const cols = Math.floor(ctx.between(3, 4.99));
  const rows = Math.floor(ctx.between(2, 4.99));
  const size = ctx.between(10, 14);
  const gap = ctx.between(1.2, 2.2);
  const pitch = size + gap;
  const w = cols * pitch - gap;
  const h = rows * pitch - gap;
  const x0 = ctx.between(10, 90 - w);
  const y0 = ctx.between(10, 90 - h);
  const shade = shadeOf(ctx);
  // A floor, not confetti: one tile form dominates and the rest vary around it.
  const main = ctx.pick(["quarter", "half", "quarter", "rect"] as const);
  // The floor lifts as one, in a wave from its first tile to its last.
  const floorPose = poseFor(ctx, "structure");

  let placed = 0;
  const total = cols * rows;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const index = j * cols + i;
      // Leave a few cells open for an irregular silhouette — but never so many
      // that fewer than six tiles remain.
      const open = ctx.rng() < 0.22 && total - index > 6 - placed;
      if (open) continue;
      const cx = x0 + i * pitch + size / 2;
      const cy = y0 + j * pitch + size / 2;
      const form: TileForm = ctx.rng() < 0.65 ? main : ctx.pick(TILE_FORMS.filter((f) => f !== "capsule"));
      marks.push(
        tile(
          ctx,
          cx,
          cy,
          size,
          form,
          (c) => turn(c, cx, cy),
          shade,
          [100 + index * 60, 160 + index * 60],
          staggered(floorPose, index / total),
        ),
      );
      placed++;
    }
  }

  const dots = Math.floor(ctx.between(2, 4.99));
  for (let i = 0; i < dots; i++) marks.push(dot(ctx));
  // In a shuffled order, so typing does not walk the floor row by row.
  for (const mark of shuffle(
    marks.filter((m) => m.motion.kind === "turn"),
    ctx.rng,
  )) {
    ctx.keys.push([{ mark, act: "flip", rot: Math.sign((mark.motion as Turn).rot) * 360 }]);
  }
  return marks;
}

function ribbonScene(ctx: Ctx): Mark[] {
  const marks: Mark[] = [field(ctx)];
  if (ctx.rng() < 0.5) marks.push(field(ctx));

  // Flat paper strips: a curved band entering left and leaving right, solid,
  // each lying on its own hard shadow.
  const strips = Math.floor(ctx.between(3, 5.99));
  const shade = shadeOf(ctx);
  for (let i = 0; i < strips; i++) {
    const y0 = ctx.between(10, 90);
    const y1 = ctx.between(10, 90);
    const c1y = y0 + ctx.between(-40, 40);
    const c2y = y1 + ctx.between(-40, 40);
    const a: Pt = [-OVERHANG, r(y0)];
    const b: Pt = [VIEWBOX + OVERHANG, r(y1)];
    marks.push(
      base({
        kind: "path",
        d: `M ${a[0]} ${a[1]} C ${r(ctx.between(15, 45))} ${r(c1y)}, ${r(ctx.between(55, 85))} ${r(c2y)}, ${b[0]} ${b[1]}`,
        spans: true,
        ends: [a, b],
        at: [50, r((y0 + y1) / 2)],
        hue: ctx.pick(ctx.hues),
        width: r(ctx.between(3, 8)),
        opacity: r3(ctx.between(0.8, 0.95)),
        shade,
        measured: true,
        layer: "structure",
        motion: slide(ctx, 0.2, 1, 3, 7),
        pose: poseFor(ctx, "structure", true),
        enter: enter(ctx, "draw", i * 180, i * 180 + 100),
      }),
    );
  }
  const rings = Math.floor(ctx.between(1, 2.99));
  for (let i = 0; i < rings; i++) marks.push(ring(ctx));
  const dots = Math.floor(ctx.between(2, 4.99));
  for (let i = 0; i < dots; i++) marks.push(dot(ctx));
  let lift = 1;
  for (const mark of marks) {
    if (!mark.spans) continue;
    ctx.keys.push([{ mark, act: "flutter", dy: lift * 3.2 }]);
    lift = -lift;
  }
  return marks;
}

function measureScene(ctx: Ctx): Mark[] {
  const marks: Mark[] = [field(ctx), slab(ctx)];

  // One or two tapes, parallel or crossing at a right angle — a cutting table.
  const deg = ctx.between(-20, 20);
  const tapes = ctx.rng() < 0.5 ? 1 : 2;
  marks.push(ruler(ctx, 50, ctx.between(28, 72), deg));
  if (tapes === 2) {
    const crossing = ctx.rng() < 0.5;
    marks.push(
      crossing ? ruler(ctx, ctx.between(28, 72), 50, deg + 90) : ruler(ctx, 50, ctx.between(28, 72), deg),
    );
  }

  marks.push(diagonal(ctx));

  // A dimension line between two crosses: the measurement being taken.
  const shade = shadeOf(ctx);
  const tiles = Math.floor(ctx.between(1, 2.99));
  for (let i = 0; i < tiles; i++) {
    marks.push(
      tile(
        ctx,
        ctx.between(20, 80),
        ctx.between(20, 80),
        ctx.between(9, 15),
        ctx.pick(TILE_FORMS),
        bob,
        shade,
        [500, 900],
      ),
    );
  }

  const crosses = Math.floor(ctx.between(3, 5.99));
  for (let i = 0; i < crosses; i++) marks.push(cross(ctx));

  // The brand accent: bordeaux · coral · gold, 42 : 20 : 12 with a gap, as
  // three capsules — punctuation, so exactly one, and only here.
  const bx = ctx.between(18, 58);
  const by = ctx.between(18, 82);
  const unit = ctx.between(0.42, 0.62);
  const thick = ctx.between(1.6, 2.4);
  const segs: Array<[number, string]> = [
    [42 * unit, BRAND_ACCENT],
    [20 * unit, BRAND_CORAL],
    [12 * unit, SPOT],
  ];
  let x = bx;
  const barMotion = pulse(ctx, 0.78, 0.92);
  const barPose = poseFor(ctx, "accent");
  segs.forEach(([len, hue], i) => {
    const cx = x + len / 2;
    marks.push(
      base({
        kind: "path",
        d: capsulePath(place(cx, by), len, thick),
        filled: true,
        at: [r(cx), r(by)],
        hue,
        opacity: 0.94,
        shade: r(shade * 0.6),
        layer: "accent",
        // One motion for all three, or the bar comes apart while it breathes.
        motion: barMotion,
        pose: staggered(barPose, i / 4),
        enter: enter(ctx, "pop", 1000 + i * 120, 1000 + i * 120),
      }),
    );
    x += len + 6 * unit;
  });

  const dots = Math.floor(ctx.between(1, 2.99));
  for (let i = 0; i < dots; i++) marks.push(dot(ctx));
  for (const mark of marks) {
    if (mark.layer === "accent" && mark.kind === "path" && !mark.filled)
      ctx.keys.push([{ mark, act: "spin", rot: 90 }]);
  }
  pressKeys(
    ctx,
    marks.filter((m) => m.layer === "structure"),
  );
  // The brand bar presses as one, segment by segment.
  ctx.keys.push(
    marks
      .filter((m) => m.layer === "accent" && m.kind === "path" && m.filled)
      .map((mark, i) => ({ mark, act: "press" as const, delay: i * 70 })),
  );
  return marks;
}

/* ---------------------------------------------------------------------------
   Keystroke helpers.
   ------------------------------------------------------------------------ */

/** Every shadowed shape becomes a key of its own: it sinks into its shadow. */
function pressKeys(ctx: Ctx, marks: Mark[]): void {
  for (const mark of marks) if (mark.shade > 0) ctx.keys.push([{ mark, act: "press" }]);
}

/* ---------------------------------------------------------------------------
   Helpers.
   ------------------------------------------------------------------------ */

/** Stable sort into paint order — builders may emit an accent before structure. */
function sortByLayer(marks: Mark[]): Mark[] {
  return marks
    .map((mark, i) => ({ mark, i }))
    .sort((a, b) => LAYERS.indexOf(a.mark.layer) - LAYERS.indexOf(b.mark.layer) || a.i - b.i)
    .map(({ mark }) => mark);
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
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
