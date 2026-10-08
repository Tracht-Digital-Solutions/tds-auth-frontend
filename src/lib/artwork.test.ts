import { describe, expect, it } from "vitest";
import {
  ACTS,
  BLUR_LEVELS,
  ENTER_MAX,
  KEY_DELAY_MAX,
  KEY_TRAVEL_MAX,
  LAYERS,
  MARKS_MAX,
  OVERHANG,
  PALETTE,
  POSE_BANDS,
  POSE_DELAY_MAX,
  SCENES,
  SHADE_RANGE,
  SPOT,
  STRAY_MAX,
  VIEWBOX,
  WASH_ALPHA_MAX,
  generateArtwork,
  randomSeed,
  type Artwork,
  type Layer,
  type Mark,
  type SceneKind,
} from "./artwork";

/**
 * A generator that runs on every visit gets no second look before it ships, so
 * these assertions are about the RANGE, not one picture:
 *
 *  - every seed must produce something composed, not something broken,
 *  - the same seed must produce the same thing (otherwise nothing here is
 *    testable and no composition could ever be pinned), and
 *  - different seeds must actually differ (a generator that quietly collapses
 *    to one output looks fine in review and is wrong in production).
 *
 * The sweep runs over a few hundred seeds per SCENE explicitly. Left to the
 * seed alone every scene would get an eighth of the sweep, so a fault confined
 * to one of them would show up an eighth as often as it should.
 */

const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 13);

/** Every composition the sweep covers: each seed in each scene. */
function sweep(): Array<{ label: string; art: Artwork }> {
  const out: Array<{ label: string; art: Artwork }> = [];
  for (const scene of SCENES) {
    for (const seed of SEEDS) out.push({ label: `${scene}/${seed}`, art: generateArtwork(seed, scene) });
  }
  return out;
}

const ALL = sweep();

/** Every hue a composition puts on screen, signals included. */
function huesOf(art: Artwork): string[] {
  return [...art.marks.map((m) => m.hue), ...art.marks.flatMap((m) => (m.signal ? [m.signal.hue] : []))];
}

function marksOn(art: Artwork, layer: Layer): Mark[] {
  return art.marks.filter((m) => m.layer === layer);
}

/** How far a point lies outside the canvas, in the max-norm (negative inside). */
function outside([x, y]: [number, number]): number {
  return Math.max(-x, x - VIEWBOX, -y, y - VIEWBOX);
}

/** How far a mark travels under hover, unsigned. */
function travel(mark: Mark): number {
  return Math.hypot(mark.pose.dx, mark.pose.dy);
}

describe("determinism", () => {
  it("returns an identical composition for the same seed", () => {
    expect(generateArtwork(12345)).toEqual(generateArtwork(12345));
  });

  it("returns different compositions for different seeds", () => {
    expect(generateArtwork(1)).not.toEqual(generateArtwork(2));
  });

  it("does not collapse to a handful of outputs", () => {
    // A PRNG wired up wrongly (re-seeded per call, or a constant) still passes
    // the two tests above and produces the same picture every time in practice.
    const distinct = new Set(SEEDS.map((s) => JSON.stringify(generateArtwork(s))));
    expect(distinct.size).toBe(SEEDS.length);
  });

  it("consumes the scene draw even when the scene is forced", () => {
    // Otherwise the explicit-scene form used throughout this file would be
    // testing a DIFFERENT random stream from the one visitors get.
    for (const seed of SEEDS.slice(0, 60)) {
      const art = generateArtwork(seed);
      expect(generateArtwork(seed, art.scene), `seed ${seed}`).toEqual(art);
    }
  });
});

describe("randomSeed", () => {
  it("stays inside the uint32 range the PRNG expects", () => {
    for (let i = 0; i < 200; i++) {
      const seed = randomSeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it("varies", () => {
    const seeds = new Set(Array.from({ length: 50 }, () => randomSeed()));
    expect(seeds.size).toBeGreaterThan(45);
  });
});

describe("scenes", () => {
  it("draws every archetype, and none more than a quarter of the time", () => {
    // A visitor who reloads must get a different KIND of picture, not the same
    // one reshuffled. A scene that is never drawn is dead code nobody notices.
    const counts = new Map<SceneKind, number>();
    for (const seed of SEEDS) {
      const { scene } = generateArtwork(seed);
      counts.set(scene, (counts.get(scene) ?? 0) + 1);
    }
    for (const scene of SCENES) {
      expect(counts.get(scene) ?? 0, scene).toBeGreaterThan(SEEDS.length / 20);
      expect(counts.get(scene) ?? 0, scene).toBeLessThan(SEEDS.length / 4);
    }
  });

  it("fills all three layers in every scene", () => {
    // A scene missing its wash is a flat picture; one missing its accents has
    // nowhere for the eye to land. Both still render.
    for (const { label, art } of ALL) {
      for (const layer of LAYERS) {
        expect(marksOn(art, layer).length, `${label} ${layer}`).toBeGreaterThan(0);
      }
    }
  });

  it("hands the marks over in paint order", () => {
    // The component renders `marks` in array order and nothing re-sorts it, so
    // an accent generated before its wash would be painted underneath it.
    for (const { label, art } of ALL) {
      const order = art.marks.map((m) => LAYERS.indexOf(m.layer));
      expect([...order], label).toEqual([...order].sort((a, b) => a - b));
    }
  });

  it("keeps every composition to a bounded number of marks", () => {
    // The bound is the point: "abstract" must not become "a hundred shapes".
    for (const { label, art } of ALL) {
      expect(art.marks.length, label).toBeGreaterThanOrEqual(6);
      expect(art.marks.length, label).toBeLessThanOrEqual(MARKS_MAX);
    }
  });

  it("casts a hard shadow somewhere in every scene", () => {
    // The hard 2D offset is the signature of the current brand surfaces; a
    // scene without a single shadowed shape has fallen out of the style.
    for (const { label, art } of ALL) {
      expect(
        art.marks.some((m) => m.shade > 0),
        label,
      ).toBe(true);
    }
  });

  it("runs every circuit board as one piece", () => {
    // Conduits end on chips and nodes. If any of them moved on its own, the
    // connections would come apart on screen.
    for (const { label, art } of ALL.filter(({ art }) => art.scene === "circuits")) {
      const board = marksOn(art, "structure");
      for (const mark of board) {
        expect(mark.motion, label).toEqual(board[0]!.motion);
        expect(mark.pose, label).toEqual(board[0]!.pose);
      }
      const conduits = board.filter((m) => m.signal);
      expect(conduits.length, label).toBeGreaterThanOrEqual(3);
      for (const conduit of conduits) expect(conduit.measured, label).toBe(true);
    }
  });

  it("sets the brand accent exactly once in a measure scene, in brand order", () => {
    // Bordeaux · coral · gold — punctuation, so one bar and never re-coloured.
    for (const { label, art } of ALL.filter(({ art }) => art.scene === "measure")) {
      const hues = marksOn(art, "accent")
        .filter((m) => m.kind === "path" && m.filled)
        .map((m) => m.hue);
      expect(hues, label).toEqual(["var(--color-accent)", "var(--color-accent-pink)", SPOT]);
    }
  });

  it("lays every mosaic on its grid: tiles turn by right angles only", () => {
    for (const { label, art } of ALL.filter(({ art }) => art.scene === "mosaic")) {
      const tiles = marksOn(art, "structure");
      expect(tiles.length, label).toBeGreaterThanOrEqual(6);
      for (const { motion: m } of tiles) {
        expect(m.kind, label).toBe("turn");
        if (m.kind === "turn") expect(Math.abs(m.rot) % 90, label).toBe(0);
      }
    }
  });
});

describe("every composition is well-formed", () => {
  it("emits no NaN in any coordinate", () => {
    // A single NaN in a path silently drops the whole shape.
    for (const { label, art } of ALL) {
      expect(JSON.stringify(art), label).not.toMatch(/NaN|null|undefined/);
      for (const mark of art.marks) {
        if (mark.kind === "path") expect(mark.d, label).toMatch(/^M [-\d.]+ [-\d.]+/);
        else expect(Number.isFinite(mark.cx! + mark.cy! + mark.r!), label).toBe(true);
      }
    }
  });

  it("only ever references theme tokens, never a literal colour", () => {
    for (const { label, art } of ALL) {
      for (const hue of huesOf(art)) expect(PALETTE, label).toContain(hue);
    }
  });

  it("limits one composition to three field hues plus the gold spot", () => {
    // A full palette at once reads as a colour test card. Signals count: they
    // only show while something happens, so a stray hue there would never turn
    // up in a screenshot.
    for (const { label, art } of ALL) {
      const hues = new Set(huesOf(art));
      hues.delete(SPOT);
      expect(hues.size, label).toBeLessThanOrEqual(3);
    }
  });

  it("blurs only the wash, with a filter that exists", () => {
    // The contrast between soft field and crisp construction IS the depth.
    for (const { label, art } of ALL) {
      for (const mark of art.marks) {
        expect(Number.isInteger(mark.blur), label).toBe(true);
        expect(mark.blur, label).toBeGreaterThanOrEqual(-1);
        expect(mark.blur, label).toBeLessThan(BLUR_LEVELS.length);
        if (mark.layer !== "wash") expect(mark.blur, label).toBe(-1);
      }
    }
  });

  it("runs every spanning mark OVERHANG past the frame at both ends", () => {
    // A strip, band or line that ends inside the frame shows its round cap.
    for (const { label, art } of ALL) {
      for (const mark of art.marks) {
        if (!mark.spans) continue;
        expect(mark.ends, label).toBeDefined();
        for (const end of mark.ends!)
          expect(outside(end), `${label} ${end}`).toBeGreaterThanOrEqual(OVERHANG - 0.01);
      }
    }
  });

  it("never rotates a spanning mark or the wash", () => {
    // Translation and outward scale cannot pull an overhang inside the frame; a
    // rotation about the canvas centre swings the ENDS furthest and can.
    for (const { label, art } of ALL) {
      for (const mark of art.marks) {
        if (!mark.spans && mark.layer !== "wash") continue;
        expect(mark.pose.rot, label).toBe(0);
        if (mark.spans) expect(mark.motion.kind, label).toBe("slide");
      }
    }
  });

  it("anchors every mark in or just beside the picture", () => {
    // A mark generated far outside is one nobody will ever see, and a scene
    // quietly spending its shapes off-screen looks sparse rather than broken.
    for (const { label, art } of ALL) {
      for (const mark of art.marks) {
        expect(outside(mark.at), `${label} ${mark.at}`).toBeLessThanOrEqual(STRAY_MAX);
        if (mark.kind === "circle") expect(mark.r, label).toBeGreaterThan(0);
      }
    }
  });

  it("keeps every mark visible but never opaque", () => {
    for (const { label, art } of ALL) {
      for (const mark of art.marks) {
        expect(mark.opacity, label).toBeGreaterThan(0.1);
        expect(mark.opacity, label).toBeLessThan(1);
      }
    }
  });

  it("keeps the wash a tint, not a second colour block", () => {
    for (const { label, art } of ALL) {
      for (const mark of marksOn(art, "wash")) {
        expect(mark.opacity, label).toBeLessThanOrEqual(WASH_ALPHA_MAX);
        expect(mark.shade, label).toBe(0);
      }
    }
  });

  it("casts hard shadows within the brand's offset, and only under solid shapes", () => {
    // The offset is the cards' 6–8 px; a translucent pane over its own shadow
    // reads as a smudge, not as a shape lifted off the panel.
    for (const { label, art } of ALL) {
      for (const mark of art.marks) {
        if (mark.shade === 0) continue;
        expect(mark.shade, label).toBeGreaterThan(0.3);
        expect(mark.shade, label).toBeLessThanOrEqual(SHADE_RANGE[1]);
        expect(mark.opacity, label).toBeGreaterThanOrEqual(0.8);
        expect(mark.blur, label).toBe(-1);
      }
    }
  });

  it("tilts within a range that cannot expose an uncovered corner", () => {
    for (const { label, art } of ALL) {
      expect(Math.abs(art.tilt), label).toBeLessThanOrEqual(18);
    }
  });

  it("keeps the blur radii inside the filter region the component declares", () => {
    expect([...BLUR_LEVELS]).toEqual([...BLUR_LEVELS].sort((a, b) => a - b));
    expect(Math.max(...BLUR_LEVELS)).toBeLessThanOrEqual(20);
  });
});

describe("typing: every scene answers in its own vocabulary", () => {
  /** Which acts a scene may use — the whole point is that they differ. */
  const VOCABULARY: Record<SceneKind, readonly string[]> = {
    constructs: ["press", "flick"],
    circuits: ["signal", "press", "light"],
    orbits: ["press", "flick", "whirl"],
    strata: ["shove"],
    raster: ["light"],
    mosaic: ["flip"],
    ribbons: ["flutter"],
    measure: ["advance", "spin", "press"],
  };

  it("gives every composition a pool of several keystroke answers", () => {
    // One answer fired over and over is the generic burst this replaced.
    for (const { label, art } of ALL) {
      expect(art.keys.length, label).toBeGreaterThanOrEqual(2);
      for (const key of art.keys) expect(key.parts.length, label).toBeGreaterThan(0);
    }
  });

  it("answers only with its own scene's acts, and no two scenes share a vocabulary", () => {
    for (const { label, art } of ALL) {
      for (const { parts } of art.keys) {
        for (const part of parts) {
          expect(ACTS, label).toContain(part.act);
          expect(VOCABULARY[art.scene], label).toContain(part.act);
        }
      }
    }
    const signatures = SCENES.map((scene) => [...VOCABULARY[scene]].sort().join("+"));
    expect(new Set(signatures).size).toBe(SCENES.length);
  });

  it("aims every part at a mark that can perform it", () => {
    // A part aimed at the wrong mark fails silently: the animation targets an
    // element that has no signal, no shadow, no pivot — and nothing moves.
    for (const { label, art } of ALL) {
      for (const { parts } of art.keys) {
        for (const part of parts) {
          const mark = art.marks[part.mark];
          expect(mark, `${label} #${part.mark}`).toBeDefined();
          if (part.act === "signal") expect(mark!.signal, label).toBeDefined();
          if (part.act === "press") expect(mark!.shade, label).toBeGreaterThan(0);
          if (part.act === "flip") expect(mark!.motion.kind, label).toBe("turn");
          if (part.act === "flick") expect(["spin", "orbit"], label).toContain(mark!.motion.kind);
          if (part.act === "whirl") expect(mark!.motion.kind, label).toBe("spin");
          if (part.act === "light") expect(mark!.filled, label).toBe(true);
          if (part.act === "advance" || part.act === "shove" || part.act === "flutter") {
            expect(mark!.spans, label).toBe(true);
          }
          if (part.act === "spin") expect(mark!.layer, label).toBe("accent");
          expect(mark!.layer, label).not.toBe("wash");
        }
      }
    }
  });

  it("keeps every answer a twitch: bounded travel, bounded delay, back to rest", () => {
    for (const { label, art } of ALL) {
      for (const { parts } of art.keys) {
        for (const part of parts) {
          expect(Math.hypot(part.dx, part.dy), label).toBeLessThanOrEqual(KEY_TRAVEL_MAX);
          expect(part.delay, label).toBeGreaterThanOrEqual(0);
          expect(part.delay, label).toBeLessThanOrEqual(KEY_DELAY_MAX);
          // A flip must land on the same picture: a whole turn.
          if (part.act === "flip") expect(Math.abs(part.rot), label).toBe(360);
          // A cross is symmetric under a quarter turn, so 90 lands on itself.
          if (part.act === "spin") expect(Math.abs(part.rot) % 90, label).toBe(0);
          if (part.act === "flick") expect(Math.abs(part.rot), label).toBeLessThanOrEqual(60);
          if (part.act === "whirl") expect(Math.abs(part.rot), label).toBe(360);
        }
      }
    }
  });

  it("pays a tape out by exactly one major unit, so the snap back is invisible", () => {
    for (const { label, art } of ALL.filter(({ art }) => art.scene === "measure")) {
      for (const { parts } of art.keys) {
        for (const part of parts) {
          if (part.act !== "advance") continue;
          // Five ticks of 2.2–3.4 units each.
          expect(Math.hypot(part.dx, part.dy), label).toBeGreaterThanOrEqual(10.9);
          expect(Math.hypot(part.dx, part.dy), label).toBeLessThanOrEqual(17.1);
        }
      }
    }
  });
});

describe("the entrance", () => {
  it("builds the constructed layers and leaves the wash to the canvas fade", () => {
    for (const { label, art } of ALL) {
      for (const mark of art.marks) {
        expect(mark.enter.delay, label).toBeGreaterThanOrEqual(0);
        expect(mark.enter.delay, label).toBeLessThanOrEqual(ENTER_MAX);
        if (mark.layer === "wash") expect(mark.enter.kind, label).toBe("none");
        else expect(mark.enter.kind, label).not.toBe("none");
      }
    }
  });

  it("draws only open strokes, and only measured ones", () => {
    // `draw` animates the dash of a `pathLength="1"` path; on a fill it does
    // nothing, and without the attribute it draws a fraction of the run.
    for (const { label, art } of ALL) {
      for (const mark of art.marks) {
        if (mark.enter.kind !== "draw") continue;
        expect(mark.kind, label).toBe("path");
        expect(mark.filled, label).toBe(false);
        expect(mark.measured, label).toBe(true);
      }
    }
  });

  it("never pops a filled spanning mark", () => {
    // Popped from 55 % about its own centre, a band longer than the canvas
    // would show both its caps for the length of the entrance.
    for (const { label, art } of ALL) {
      for (const mark of art.marks) {
        if (mark.spans && mark.filled) expect(mark.enter.kind, label).not.toBe("pop");
      }
    }
  });
});

describe("the motion is ambient, not animated", () => {
  // These bounds ARE the requirement: clearly alive, never a running animation
  // beside a login form. The upper bounds are also a geometry contract —
  // OVERHANG is sized against them.

  it("drifts and slides slowly and by very little", () => {
    for (const { label, art } of ALL) {
      for (const { motion: m } of art.marks) {
        if (m.kind === "drift") {
          expect(Math.abs(m.dx), label).toBeLessThanOrEqual(14);
          expect(Math.abs(m.dy), label).toBeLessThanOrEqual(11);
          expect(Math.abs(m.rot), label).toBeLessThanOrEqual(3.5);
          // Outward only, so an overhang is never pulled inside the frame.
          expect(m.scale, label).toBeGreaterThanOrEqual(1);
          expect(m.scale, label).toBeLessThanOrEqual(1.06);
        }
        if (m.kind === "slide") expect(Math.hypot(m.dx, m.dy), label).toBeLessThanOrEqual(12.1);
        if (m.kind === "orbit") expect(Math.abs(m.rot), label).toBeLessThanOrEqual(6);
        if (m.kind === "spin") expect(Math.abs(m.rot), label).toBeLessThanOrEqual(20);
        if (m.kind === "turn") expect(Math.abs(m.rot), label).toBe(90);
      }
    }
  });

  it("starts every mark and every signal mid-cycle", () => {
    // A zero delay everywhere makes the composition swell in unison. A delay of
    // a full period is phase-equivalent to none, so the bound is strict.
    for (const { label, art } of ALL) {
      for (const { motion: m, signal } of art.marks) {
        expect(m.delay, label).toBeLessThanOrEqual(0);
        expect(m.delay, label).toBeGreaterThan(-m.dur);
        if (signal) {
          expect(signal.delay, label).toBeLessThanOrEqual(0);
          expect(signal.delay, label).toBeGreaterThan(-signal.dur);
          expect(signal.dur, label).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it("counter-rotates consecutive turning marks", () => {
    // Every ring turning the same way reads as the whole picture rotating, and
    // that motion already belongs to the sway group.
    for (const { label, art } of ALL) {
      const turns = art.marks
        .map((m) => m.motion)
        .filter(
          (m): m is Extract<typeof m, { kind: "orbit" | "spin" | "turn" }> =>
            m.kind === "orbit" || m.kind === "spin" || m.kind === "turn",
        );
      for (let i = 1; i < turns.length; i++) {
        expect(Math.sign(turns[i]!.rot), `${label} #${i}`).not.toBe(Math.sign(turns[i - 1]!.rot));
      }
    }
  });

  it("pivots every spin and turn on a point inside the picture", () => {
    // The pivot reaches CSS as `transform-origin`; one far outside the canvas
    // turns a gentle rotation into a shape sweeping across the panel.
    for (const { label, art } of ALL) {
      for (const { motion: m } of art.marks) {
        if (m.kind !== "spin" && m.kind !== "turn") continue;
        expect(m.ox, label).toBeGreaterThan(0);
        expect(m.ox, label).toBeLessThan(VIEWBOX);
        expect(m.oy, label).toBeGreaterThan(0);
        expect(m.oy, label).toBeLessThan(VIEWBOX);
      }
    }
  });

  it("keeps every period long enough to read as drift", () => {
    for (const { label, art } of ALL) {
      for (const { motion: m } of art.marks) {
        expect(Number.isFinite(m.dur), label).toBe(true);
        expect(m.dur, label).toBeGreaterThanOrEqual(5);
      }
      expect(art.sway.dur, label).toBeGreaterThanOrEqual(5);
    }
  });

  it("dims pulsing marks without extinguishing them", () => {
    for (const { label, art } of ALL) {
      for (const { motion: m } of art.marks) {
        if (m.kind !== "pulse") continue;
        expect(m.dim, label).toBeGreaterThanOrEqual(0.45);
        expect(m.dim, label).toBeLessThan(1);
      }
    }
  });

  it("sways the whole composition by a couple of degrees at most", () => {
    for (const { label, art } of ALL) {
      expect(Math.abs(art.sway.deg), label).toBeLessThanOrEqual(3);
      expect(art.sway.deg, label).not.toBe(0);
    }
  });
});

describe("the hover pose", () => {
  // The composition answers the PRESENCE of a pointer, never its position — so
  // the response is a seeded property of the picture and can be bounded here.

  it("carries no trace of a pointer coordinate", () => {
    for (const { label, art } of ALL.filter((_, i) => i % 7 === 0)) {
      for (const mark of art.marks) {
        expect(Number.isFinite(mark.pose.dx + mark.pose.dy), label).toBe(true);
      }
      expect(
        generateArtwork(art.seed, art.scene).marks.map((m) => m.pose),
        label,
      ).toEqual(art.marks.map((m) => m.pose));
    }
  });

  it("orders the layers by travel: wash behind structure behind accents", () => {
    // This IS the depth cue; an overlap quietly flattens it.
    for (const { label, art } of ALL) {
      const wash = marksOn(art, "wash").map(travel);
      const structure = marksOn(art, "structure").map(travel);
      const accent = marksOn(art, "accent").map(travel);
      expect(Math.max(...wash), label).toBeLessThan(Math.min(...structure));
      expect(Math.max(...structure), label).toBeLessThan(Math.min(...accent));
    }
  });

  it("stays inside the geometry budget OVERHANG is sized for", () => {
    for (const { label, art } of ALL) {
      for (const mark of art.marks) {
        const [lo, hi] = POSE_BANDS[mark.layer];
        expect(travel(mark), label).toBeGreaterThanOrEqual(lo - 0.02);
        expect(travel(mark), label).toBeLessThanOrEqual(hi + 0.02);
      }
    }
  });

  it("moves the structure against everything else", () => {
    // If every layer slid the same way the response would read as the whole
    // picture being dragged.
    for (const { label, art } of ALL) {
      const wash = marksOn(art, "wash")[0]!.pose;
      for (const mark of marksOn(art, "structure")) {
        expect(mark.pose.dx * wash.dx + mark.pose.dy * wash.dy, label).toBeLessThan(0);
      }
      for (const mark of marksOn(art, "accent")) {
        expect(mark.pose.dx * wash.dx + mark.pose.dy * wash.dy, label).toBeGreaterThan(0);
      }
    }
  });

  it("scales outward only, and barely", () => {
    for (const { label, art } of ALL) {
      for (const mark of art.marks) {
        expect(mark.pose.scale, label).toBeGreaterThanOrEqual(1);
        expect(mark.pose.scale, label).toBeLessThanOrEqual(1.06);
        expect(Math.abs(mark.pose.rot), label).toBeLessThanOrEqual(4);
      }
    }
  });

  it("staggers the arrival, but not the departure into lag", () => {
    for (const { label, art } of ALL) {
      for (const mark of art.marks) {
        expect(mark.pose.delay, label).toBeGreaterThanOrEqual(0);
        expect(mark.pose.delay, label).toBeLessThanOrEqual(POSE_DELAY_MAX);
      }
      expect(new Set(art.marks.map((m) => m.pose.delay)).size, label).toBeGreaterThan(1);
    }
  });
});
