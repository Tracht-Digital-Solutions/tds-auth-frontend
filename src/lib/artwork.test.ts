import { describe, expect, it } from "vitest";
import {
  BLUR_LEVELS,
  PALETTE,
  VIEWBOX,
  generateArtwork,
  randomSeed,
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
 * 1-in-50 compositions is exactly the kind a handful of spot checks misses.
 */

const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 13);

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

describe("every composition is well-formed", () => {
  it("draws a bounded number of each shape", () => {
    // The bound is the point: "abstract" must not become "a hundred ribbons".
    for (const seed of SEEDS) {
      const art = generateArtwork(seed);
      expect(art.ribbons.length, `seed ${seed}`).toBeGreaterThanOrEqual(4);
      expect(art.ribbons.length, `seed ${seed}`).toBeLessThanOrEqual(7);
      expect(art.rings.length).toBeGreaterThanOrEqual(2);
      expect(art.rings.length).toBeLessThanOrEqual(4);
      expect(art.sparks.length).toBeGreaterThanOrEqual(2);
      expect(art.sparks.length).toBeLessThanOrEqual(4);
    }
  });

  it("emits no NaN in any coordinate", () => {
    // A single NaN in a path silently drops the whole shape — the artwork just
    // looks sparse, with nothing in the console to explain it.
    for (const seed of SEEDS) {
      const art = generateArtwork(seed);
      expect(JSON.stringify(art), `seed ${seed}`).not.toContain("null");
      for (const ribbon of art.ribbons) {
        expect(ribbon.d, `seed ${seed}`).not.toMatch(/NaN|undefined/);
      }
    }
  });

  it("only ever references theme tokens, never a literal colour", () => {
    // Literals would freeze the artwork to one theme; every hue must flip with
    // light/dark for free.
    for (const seed of SEEDS) {
      const art = generateArtwork(seed);
      const hues = [
        ...art.ribbons.map((r) => r.hue),
        ...art.rings.map((r) => r.hue),
        ...art.sparks.map((s) => s.hue),
      ];
      for (const hue of hues) {
        expect(PALETTE, `seed ${seed}`).toContain(hue);
      }
    }
  });

  it("limits one composition to at most three hues", () => {
    // All six at once reads as a colour test card rather than a composition.
    for (const seed of SEEDS) {
      const art = generateArtwork(seed);
      const used = new Set([
        ...art.ribbons.map((r) => r.hue),
        ...art.rings.map((r) => r.hue),
        ...art.sparks.map((s) => s.hue),
      ]);
      expect(used.size, `seed ${seed}`).toBeLessThanOrEqual(3);
    }
  });

  it("indexes a blur filter that actually exists", () => {
    // An out-of-range index yields `url(#auth-art-blur-3)`, which resolves to
    // nothing — the ribbon renders hard-edged and the composition looks wrong
    // in a way no error reports.
    for (const seed of SEEDS) {
      for (const ribbon of generateArtwork(seed).ribbons) {
        expect(ribbon.blur).toBeGreaterThanOrEqual(0);
        expect(ribbon.blur).toBeLessThan(BLUR_LEVELS.length);
        expect(Number.isInteger(ribbon.blur)).toBe(true);
      }
    }
  });

  it("keeps rings and sparks inside the frame", () => {
    for (const seed of SEEDS) {
      const art = generateArtwork(seed);
      for (const spark of art.sparks) {
        expect(spark.cx).toBeGreaterThan(0);
        expect(spark.cx).toBeLessThan(VIEWBOX);
        expect(spark.cy).toBeGreaterThan(0);
        expect(spark.cy).toBeLessThan(VIEWBOX);
      }
      for (const ring of art.rings) {
        expect(ring.r).toBeGreaterThan(0);
      }
    }
  });

  it("overhangs both edges with every ribbon", () => {
    // A stroke that ends inside the frame shows its round cap, which reads as a
    // rendering fault rather than as a design choice.
    for (const seed of SEEDS) {
      for (const ribbon of generateArtwork(seed).ribbons) {
        expect(ribbon.d.startsWith("M -20 "), `seed ${seed}`).toBe(true);
        expect(ribbon.d).toContain(", 120 ");
      }
    }
  });

  it("keeps every shape visible but never opaque", () => {
    // 0 is an invisible shape (wasted node); 1 is a flat block that defeats the
    // `screen` blend the whole look rests on.
    for (const seed of SEEDS) {
      const art = generateArtwork(seed);
      const opacities = [
        ...art.ribbons.map((r) => r.opacity),
        ...art.rings.map((r) => r.opacity),
        ...art.sparks.map((s) => s.opacity),
      ];
      for (const opacity of opacities) {
        expect(opacity, `seed ${seed}`).toBeGreaterThan(0.1);
        expect(opacity, `seed ${seed}`).toBeLessThan(1);
      }
    }
  });

  it("tilts within a range that cannot expose an uncovered corner", () => {
    for (const seed of SEEDS) {
      const art = generateArtwork(seed);
      expect(Math.abs(art.tilt), `seed ${seed}`).toBeLessThanOrEqual(18);
    }
  });

  it("keeps the blur radii inside the filter region the component declares", () => {
    // LoginArtwork.tsx sizes its userSpaceOnUse region at -30 / 160 user units.
    // A radius past ~20 pushes the Gaussian's support beyond that margin and the
    // ribbon gets a hard, straight cut-off that nothing reports.
    expect([...BLUR_LEVELS]).toEqual([...BLUR_LEVELS].sort((a, b) => a - b));
    expect(Math.max(...BLUR_LEVELS)).toBeLessThanOrEqual(20);
  });
});

describe("the motion is ambient, not animated", () => {
  // These bounds ARE the requirement. "Barely noticeable" is the whole point of
  // the drift — a five-second cycle or a twenty-unit sweep would pass every
  // other test in this file and still be wrong, because the artwork sits beside
  // a login form and must not pull the eye off it.

  it("drifts slowly and by very little", () => {
    for (const seed of SEEDS) {
      for (const { motion: m } of generateArtwork(seed).ribbons) {
        expect(Math.abs(m.dx), `seed ${seed}`).toBeLessThanOrEqual(8);
        expect(Math.abs(m.dy), `seed ${seed}`).toBeLessThanOrEqual(6);
        expect(Math.abs(m.rot), `seed ${seed}`).toBeLessThanOrEqual(2);
        // Never below 1: the composition breathes outward only, so a ribbon's
        // over-hang can never be pulled inside the frame.
        expect(m.scale, `seed ${seed}`).toBeGreaterThanOrEqual(1);
        expect(m.scale, `seed ${seed}`).toBeLessThanOrEqual(1.04);
        expect(m.dur, `seed ${seed}`).toBeGreaterThanOrEqual(30);
        expect(m.dur, `seed ${seed}`).toBeLessThanOrEqual(60);
      }
    }
  });

  it("starts every shape mid-cycle", () => {
    // A zero delay everywhere makes the whole composition swell in unison,
    // which is what turns ambient drift back into "an animation". A delay of a
    // full period is phase-equivalent to no delay at all, so the bound is strict.
    for (const seed of SEEDS) {
      const art = generateArtwork(seed);
      const motions = [
        ...art.ribbons.map((x) => x.motion),
        ...art.rings.map((x) => x.motion),
        ...art.sparks.map((x) => x.motion),
      ];
      for (const m of motions) {
        expect(m.delay, `seed ${seed}`).toBeLessThanOrEqual(0);
        expect(m.delay, `seed ${seed}`).toBeGreaterThan(-m.dur);
      }
    }
  });

  it("counter-rotates adjacent rings", () => {
    // Every ring turning the same way reads as the whole picture rotating —
    // and that motion already belongs to the sway group.
    for (const seed of SEEDS) {
      const rings = generateArtwork(seed).rings;
      expect(Math.sign(rings[0]!.motion.rot), `seed ${seed}`).not.toBe(
        Math.sign(rings[1]!.motion.rot),
      );
    }
  });

  it("keeps every period long enough to read as drift", () => {
    for (const seed of SEEDS) {
      const art = generateArtwork(seed);
      const periods = [
        ...art.ribbons.map((x) => x.motion.dur),
        ...art.rings.map((x) => x.motion.dur),
        ...art.sparks.map((x) => x.motion.dur),
        art.sway.dur,
      ];
      for (const period of periods) {
        expect(Number.isFinite(period), `seed ${seed}`).toBe(true);
        expect(period, `seed ${seed}`).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it("dims sparks without extinguishing them", () => {
    for (const seed of SEEDS) {
      for (const spark of generateArtwork(seed).sparks) {
        expect(spark.motion.dim, `seed ${seed}`).toBeGreaterThanOrEqual(0.6);
        expect(spark.motion.dim, `seed ${seed}`).toBeLessThan(1);
      }
    }
  });

  it("sways the whole composition by a couple of degrees at most", () => {
    for (const seed of SEEDS) {
      const { sway } = generateArtwork(seed);
      expect(Math.abs(sway.deg), `seed ${seed}`).toBeLessThanOrEqual(2);
      expect(sway.deg, `seed ${seed}`).not.toBe(0);
    }
  });

  it("keeps ribbon alpha under the screen-blend ceiling", () => {
    // The per-bucket blur compensation multiplies the base draw; without the
    // clamp the softest bucket reaches 0.9 and `screen` washes the panel out.
    for (const seed of SEEDS) {
      for (const ribbon of generateArtwork(seed).ribbons) {
        expect(ribbon.opacity, `seed ${seed}`).toBeLessThanOrEqual(0.88);
      }
    }
  });
});
