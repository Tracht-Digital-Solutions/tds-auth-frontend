import { describe, expect, it } from "vitest";
import {
  BLUR_LEVELS,
  LAYERS,
  OVERHANG,
  PALETTE,
  POSE_BANDS,
  POSE_DELAY_MAX,
  RIPPLE_SLOTS,
  SCENES,
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
 * The sweep runs over a few hundred seeds, because a fault that shows up in
 * 1-in-50 compositions is exactly the kind a handful of spot checks misses —
 * and it runs over each SCENE explicitly. Left to the seed alone every scene
 * would get a quarter of the sweep, so a fault confined to one of them would
 * show up a quarter as often as it should.
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

/** Every hue a composition puts on screen, ripples included. */
function huesOf(art: Artwork): string[] {
  return [...art.marks.map((m) => m.hue), ...art.ripples.map((x) => x.hue)];
}

function marksOn(art: Artwork, layer: Layer): Mark[] {
  return art.marks.filter((m) => m.layer === layer);
}

/** Every number in a path, in source order. */
function numbersIn(d: string): number[] {
  return (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
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
    // testing a DIFFERENT random stream from the one visitors get, and every
    // bound below would be measuring the wrong compositions.
    for (const seed of SEEDS.slice(0, 40)) {
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
  it("draws every archetype, and none more than half the time", () => {
    // The whole point of the rewrite: a visitor who reloads must get a
    // different KIND of picture, not the same one reshuffled. A scene that is
    // never drawn is dead code nobody would notice.
    const counts = new Map<SceneKind, number>();
    for (const seed of SEEDS) {
      const { scene } = generateArtwork(seed);
      counts.set(scene, (counts.get(scene) ?? 0) + 1);
    }
    for (const scene of SCENES) {
      expect(counts.get(scene) ?? 0, scene).toBeGreaterThan(SEEDS.length / 10);
      expect(counts.get(scene) ?? 0, scene).toBeLessThan(SEEDS.length / 2);
    }
  });

  it("fills all three layers in every scene", () => {
    // A scene missing its wash is a flat picture; one missing its accents has
    // nowhere for the eye to land. Both still render, which is why this is a
    // test and not a runtime check.
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
      expect(art.marks.length, label).toBeLessThanOrEqual(40);
    }
  });
});

describe("every composition is well-formed", () => {
  it("emits no NaN in any coordinate", () => {
    // A single NaN in a path silently drops the whole shape — the artwork just
    // looks sparse, with nothing in the console to explain it.
    for (const { label, art } of ALL) {
      expect(JSON.stringify(art), label).not.toMatch(/NaN|null|undefined/);
      for (const mark of art.marks) {
        if (mark.kind === "path") expect(mark.d, label).not.toMatch(/NaN|undefined/);
        else expect(Number.isFinite(mark.cx! + mark.cy! + mark.r!), label).toBe(true);
      }
    }
  });

  it("only ever references theme tokens, never a literal colour", () => {
    // Literals would freeze the artwork to one theme; every hue must flip with
    // light/dark for free.
    for (const { label, art } of ALL) {
      for (const hue of huesOf(art)) expect(PALETTE, label).toContain(hue);
      expect(art.ripples.length, label).toBe(RIPPLE_SLOTS);
    }
  });

  it("limits one composition to at most three hues", () => {
    // All six at once reads as a colour test card rather than a composition.
    // The ripples are included on purpose: they are the one shape that appears
    // only while someone is typing, so a hue drawn from outside the palette
    // there would never show up in a screenshot.
    for (const { label, art } of ALL) {
      expect(new Set(huesOf(art)).size, label).toBeLessThanOrEqual(3);
    }
  });

  it("indexes a blur filter that actually exists", () => {
    // An out-of-range index yields `url(#auth-art-blur-3)`, which resolves to
    // nothing — the mark renders hard-edged and the composition looks wrong in
    // a way no error reports. -1 is the explicit "no filter" case.
    for (const { label, art } of ALL) {
      for (const mark of art.marks) {
        expect(Number.isInteger(mark.blur), label).toBe(true);
        expect(mark.blur, label).toBeGreaterThanOrEqual(-1);
        expect(mark.blur, label).toBeLessThan(BLUR_LEVELS.length);
        // Only the wash is ever blurred: the contrast between soft colour and
        // crisp geometry IS the depth of the composition.
        if (mark.layer !== "wash") expect(mark.blur, label).toBe(-1);
      }
    }
  });

  it("overhangs both edges with every spanning mark", () => {
    // A stroke that ends inside the frame shows its round cap, which reads as a
    // rendering fault rather than as a design choice. The overhang has to clear
    // the drift AND the rotations: a tilt about the canvas centre swings the end
    // of a high or low mark *inward*, which is why OVERHANG is far larger than
    // the drift amplitude alone would suggest.
    for (const { label, art } of ALL) {
      for (const mark of art.marks) {
        if (!mark.spans) continue;
        expect(mark.kind, label).toBe("path");
        const nums = numbersIn(mark.d!);
        // First pair is the `M`; the last pair is wherever the segment ends.
        expect(nums[0], label).toBe(-OVERHANG);
        expect(nums[nums.length - 2], label).toBe(VIEWBOX + OVERHANG);
      }
    }
  });

  it("keeps every non-spanning mark inside the crop", () => {
    // The mirror of the rule above. A mark generated far outside is one nobody
    // will ever see, and a scene quietly spending half its shapes off-screen
    // looks *sparse* rather than broken — the kind of fault that survives
    // review. A little bleed is deliberate; a lot is a bug.
    for (const { label, art } of ALL) {
      for (const mark of art.marks) {
        if (mark.spans) continue;
        if (mark.kind === "path") {
          for (const n of numbersIn(mark.d!)) {
            expect(n, `${label} ${mark.d}`).toBeGreaterThanOrEqual(-STRAY_MAX);
            expect(n, `${label} ${mark.d}`).toBeLessThanOrEqual(VIEWBOX + STRAY_MAX);
          }
        } else {
          // Radius and stroke may bleed past the edge — that is what a wash
          // does — but the ANCHOR has to sit in the picture.
          expect(mark.cx, label).toBeGreaterThan(0);
          expect(mark.cx, label).toBeLessThan(VIEWBOX);
          expect(mark.cy, label).toBeGreaterThan(0);
          expect(mark.cy, label).toBeLessThan(VIEWBOX);
          expect(mark.r, label).toBeGreaterThan(0);
        }
      }
    }
  });

  it("keeps every mark visible but never opaque", () => {
    // 0 is an invisible shape (wasted node); 1 is a flat block that defeats the
    // `screen` blend the whole look rests on.
    for (const { label, art } of ALL) {
      for (const mark of art.marks) {
        expect(mark.opacity, label).toBeGreaterThan(0.1);
        expect(mark.opacity, label).toBeLessThan(1);
      }
    }
  });

  it("keeps wash alpha under the screen-blend ceiling", () => {
    // The per-bucket blur compensation multiplies the base draw; without the
    // clamp the softest bucket reaches 0.9 and `screen` washes the panel out.
    for (const { label, art } of ALL) {
      for (const mark of marksOn(art, "wash")) {
        expect(mark.opacity, label).toBeLessThanOrEqual(WASH_ALPHA_MAX);
      }
    }
  });

  it("tilts within a range that cannot expose an uncovered corner", () => {
    for (const { label, art } of ALL) {
      expect(Math.abs(art.tilt), label).toBeLessThanOrEqual(18);
    }
  });

  it("keeps the blur radii inside the filter region the component declares", () => {
    // LoginArtwork.tsx sizes its userSpaceOnUse region from the largest radius
    // here. Past ~20 the Gaussian's support outruns that margin and the mark
    // gets a hard, straight cut-off that nothing reports.
    expect([...BLUR_LEVELS]).toEqual([...BLUR_LEVELS].sort((a, b) => a - b));
    expect(Math.max(...BLUR_LEVELS)).toBeLessThanOrEqual(20);
  });

  it("keeps every ripple origin well inside the crop", () => {
    // A ripple is a circle: one centred near an edge spends most of its life as
    // an arc sliding off the frame, which reads as a rendering fault.
    for (const { label, art } of ALL) {
      for (const ripple of art.ripples) {
        expect(ripple.cx, label).toBeGreaterThanOrEqual(20);
        expect(ripple.cx, label).toBeLessThanOrEqual(80);
        expect(ripple.cy, label).toBeGreaterThanOrEqual(20);
        expect(ripple.cy, label).toBeLessThanOrEqual(80);
      }
    }
  });
});

describe("the motion is ambient, not animated", () => {
  // These bounds ARE the requirement. The composition should read as clearly
  // alive but never as a running animation — a five-second cycle or a
  // thirty-unit sweep would pass every other test in this file and still be
  // wrong, because the artwork sits beside a login form and must not pull the
  // eye off it. The upper bounds are also a geometry contract: OVERHANG is
  // sized against them, so raising an amplitude without re-checking it starts
  // showing stroke caps.

  it("drifts and slides slowly and by very little", () => {
    for (const { label, art } of ALL) {
      for (const { motion: m } of art.marks) {
        if (m.kind === "drift") {
          expect(Math.abs(m.dx), label).toBeLessThanOrEqual(14);
          expect(Math.abs(m.dy), label).toBeLessThanOrEqual(11);
          expect(Math.abs(m.rot), label).toBeLessThanOrEqual(3.5);
          // Never below 1: the composition breathes outward only, so a spanning
          // mark's over-hang can never be pulled inside the frame.
          expect(m.scale, label).toBeGreaterThanOrEqual(1);
          expect(m.scale, label).toBeLessThanOrEqual(1.06);
        }
        if (m.kind === "slide") {
          expect(Math.hypot(m.dx, m.dy), label).toBeLessThanOrEqual(12.1);
        }
        if (m.kind === "orbit") expect(Math.abs(m.rot), label).toBeLessThanOrEqual(6);
        if (m.kind === "spin") expect(Math.abs(m.rot), label).toBeLessThanOrEqual(14);
      }
    }
  });

  it("starts every mark mid-cycle", () => {
    // A zero delay everywhere makes the whole composition swell in unison,
    // which is what turns ambient drift back into "an animation". A delay of a
    // full period is phase-equivalent to no delay at all, so the bound is strict.
    for (const { label, art } of ALL) {
      for (const { motion: m } of art.marks) {
        expect(m.delay, label).toBeLessThanOrEqual(0);
        expect(m.delay, label).toBeGreaterThan(-m.dur);
      }
    }
  });

  it("counter-rotates consecutive turning marks", () => {
    // Every ring turning the same way reads as the whole picture rotating —
    // and that motion already belongs to the sway group. Guaranteed by index
    // rather than drawn, because a direction that is merely likely is one some
    // seeds don't get.
    for (const { label, art } of ALL) {
      const turns = art.marks
        .map((m) => m.motion)
        .filter((m): m is Extract<typeof m, { kind: "orbit" | "spin" }> =>
          m.kind === "orbit" || m.kind === "spin",
        );
      for (let i = 1; i < turns.length; i++) {
        expect(Math.sign(turns[i]!.rot), `${label} #${i}`).not.toBe(Math.sign(turns[i - 1]!.rot));
      }
    }
  });

  it("pivots every spin on a point inside the picture", () => {
    // The pivot reaches CSS as `transform-origin`; one far outside the canvas
    // turns a gentle rotation into a shape sweeping across the whole panel.
    for (const { label, art } of ALL) {
      for (const { motion: m } of art.marks) {
        if (m.kind !== "spin") continue;
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
  // the response is a seeded property of the picture and can be bounded here,
  // which a cursor read-out never could be.

  it("carries no trace of a pointer coordinate", () => {
    // The regression this whole change exists to prevent: a pose is fixed at
    // generation time, so nothing about it may depend on where the mouse is.
    for (const { label, art } of ALL) {
      for (const mark of art.marks) {
        expect(Number.isFinite(mark.pose.dx + mark.pose.dy), label).toBe(true);
      }
      // Same seed, same pose — twice, with no input in between.
      expect(generateArtwork(art.seed, art.scene).marks.map((m) => m.pose), label).toEqual(
        art.marks.map((m) => m.pose),
      );
    }
  });

  it("orders the layers by travel: wash behind structure behind accents", () => {
    // This IS the depth cue. The blurred wash is the far layer and must always
    // move least; the crisp accents are the near one and must always move most
    // — they are also the only marks whose displacement the eye can actually
    // measure, so an overlap here quietly flattens the effect.
    for (const { label, art } of ALL) {
      const wash = marksOn(art, "wash").map(travel);
      const structure = marksOn(art, "structure").map(travel);
      const accent = marksOn(art, "accent").map(travel);
      expect(Math.max(...wash), label).toBeLessThan(Math.min(...structure));
      expect(Math.max(...structure), label).toBeLessThan(Math.min(...accent));
    }
  });

  it("stays inside the geometry budget OVERHANG is sized for", () => {
    // The pose stacks on top of the drift, so it spends the same margin. 4
    // units on a wash mark is the ceiling the OVERHANG note assumes; raising it
    // means re-deriving OVERHANG against tilt + sway + rotation again, not just
    // bumping a number here.
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
    // picture being dragged — the same argument as the counter-rotating rings.
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

  it("never rotates a wash mark", () => {
    // Translation and outward scale cannot pull a spanning mark's overhang
    // inside the frame. A rotation about the canvas centre swings the ENDS
    // furthest and can — which is the one way this response could put a stroke
    // cap on screen.
    for (const { label, art } of ALL) {
      for (const mark of marksOn(art, "wash")) expect(mark.pose.rot, label).toBe(0);
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
    // The same delay applies on the way back, so this ceiling is what keeps a
    // decoration from still rearranging itself long after the pointer left.
    for (const { label, art } of ALL) {
      for (const mark of art.marks) {
        expect(mark.pose.delay, label).toBeGreaterThanOrEqual(0);
        expect(mark.pose.delay, label).toBeLessThanOrEqual(POSE_DELAY_MAX);
      }
      // …and it has to actually vary, or there is no stagger at all.
      expect(new Set(art.marks.map((m) => m.pose.delay)).size, label).toBeGreaterThan(1);
    }
  });
});
