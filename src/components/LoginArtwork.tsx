import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ARRIVAL_MS,
  BLUR_LEVELS,
  VIEWBOX,
  generateArtwork,
  randomSeed,
  type Artwork,
  type Enter,
  type KeyPart,
  type Mark,
  type Motion,
  type Pose,
  type Signal,
} from "~/lib/artwork";
import { onTyping } from "~/lib/artworkSignal";

/**
 * `CSSProperties` has no index signature on purpose, so custom properties need
 * a widened type. An intersection rather than an `as CSSProperties` cast at each
 * call site: the cast would also swallow a typo in a *real* property name.
 */
type ArtStyle = CSSProperties & Record<`--${string}`, string>;

/*
 * Units live here, not in the generator — it emits plain numbers.
 *
 * `px` inside an SVG element's transform is ONE USER UNIT, so the motion is
 * expressed in viewBox coordinates and scales with the panel, which is what we
 * want. A unitless number in `translate()` is invalid CSS, and because these
 * arrive through `var()` substitution it would take the entire `transform`
 * declaration down with it — silently, with the shape simply never moving.
 */
const motionVars = (m: Motion): ArtStyle => {
  const timing: ArtStyle = { "--auth-dur": `${m.dur}s`, "--auth-delay": `${m.delay}s` };
  switch (m.kind) {
    case "drift":
      return {
        ...timing,
        "--auth-dx": `${m.dx}px`,
        "--auth-dy": `${m.dy}px`,
        "--auth-rot": `${m.rot}deg`,
        "--auth-scale": `${m.scale}`,
      };
    case "orbit":
      return { ...timing, "--auth-rot": `${m.rot}deg` };
    case "spin":
    case "turn":
      return {
        ...timing,
        "--auth-rot": `${m.rot}deg`,
        // The pivot is the centre of the circle the arc was cut from — NOT its
        // bounding box, which is what `transform-box: fill-box` would give and
        // which turns an orbiting arc into a tumbling one.
        "--auth-ox": `${m.ox}px`,
        "--auth-oy": `${m.oy}px`,
      };
    case "slide":
      return { ...timing, "--auth-dx": `${m.dx}px`, "--auth-dy": `${m.dy}px` };
  }
  return timing;
};

/**
 * The pulse is a MULTIPLIER on the group, not an absolute opacity.
 *
 * Each mark's own alpha lives on the drawn node as `stroke-opacity` /
 * `fill-opacity`, so the loop here runs 1 → `dim` → 1 and the two compose. Two
 * things fall out of that, both load-bearing: the loop rests at exactly 1, so
 * its resting state IS the static composition (and under
 * `prefers-reduced-motion: reduce`, where no keyframe applies, the group is
 * simply transparent to the value below it) — and the mark's alpha stays a
 * *presentation attribute*, which author CSS can still override. An inline
 * `opacity` on this group could not be, and the hover response would have had
 * nothing left to brighten.
 */
const pulseVars = (dim: number): ArtStyle => ({ "--auth-o-low": `${dim}` });

/**
 * The hover target. Read by ONE rule that only ever changes state when the
 * pointer enters or leaves the panel — which is why a CSS transition is the
 * right tool here, where a pointer-tracking parallax would have restarted it
 * every frame.
 */
const poseVars = (p: Pose): ArtStyle => ({
  "--auth-px": `${p.dx}px`,
  "--auth-py": `${p.dy}px`,
  "--auth-prot": `${p.rot}deg`,
  "--auth-pscale": `${p.scale}`,
  "--auth-pdelay": `${p.delay}ms`,
});

/**
 * The one-shot build-up. Its own group, between the pose and the motion: it
 * animates `scale` and `opacity` (a `pop`) or the stroke's dash (a `draw`), and
 * neither may share an element with a transform that is already animating or
 * transitioning.
 */
const enterVars = (e: Enter): ArtStyle => ({ "--auth-in": `${e.delay}ms` });

/** A conduit's travelling pulse — its own period, its own phase. */
const signalVars = (s: Signal): ArtStyle => ({
  "--auth-sig-dur": `${s.dur}s`,
  "--auth-sig-delay": `${s.delay}s`,
});

/**
 * The hard 2D shadow's ink and strength. Resolved by the stylesheet on the
 * stage, so the offset reads as the same shade the cards and buttons beside it
 * cast — a dark, unblurred copy, never a glow.
 */
const SHADE = "var(--auth-shade)";
const SHADE_ALPHA = 0.72;

/**
 * Deliberately NOT `--auth-dur`: custom properties inherit, and a name shared
 * with the descendants would be a trap for any shape that ever forgets to set
 * its own.
 */
const swayVars = (sway: Artwork["sway"]): ArtStyle => ({
  "--auth-sway": `${sway.deg}deg`,
  "--auth-sway-dur": `${sway.dur}s`,
});

/** How long after the last keystroke the composition stays "engaged". */
const ENERGY_HOLD_MS = 900;
/**
 * Floor on the keystroke rate. A held key autorepeats at ~30/s, and firing the
 * pool that fast produces a flicker rather than an answer.
 */
const KEY_MIN_GAP_MS = 110;

/** A spring-ish ease-out with a small overshoot, for the twitches. */
const SNAP = "cubic-bezier(0.34, 1.4, 0.64, 1)";
const EASE_OUT = "cubic-bezier(0.16, 0.84, 0.44, 1)";

/**
 * Fire one keystroke part on its mark's groups.
 *
 * Each act animates a property nothing else on that element animates, so it
 * composes with the running loops instead of fighting them: `rotate` and
 * `scale` are individual transform properties applied OUTSIDE the `transform`
 * the CSS loops drive; `translate` on the entrance group is free once the
 * entrance has run (that one animates `scale`/`opacity`). Every keyframe set
 * ends where it started, so nothing is left behind, and `fill` stays `none`.
 *
 * Optional-called — jsdom implements no `Element.animate`.
 */
function fire(pose: Element, part: KeyPart) {
  const entrance = pose.firstElementChild;
  if (!entrance) return;
  const motions = entrance.querySelectorAll(".auth-art__m");
  const face = motions[motions.length - 1];
  const timing = (duration: number, easing = EASE_OUT): KeyframeAnimationOptions => ({
    duration,
    delay: part.delay,
    easing,
  });

  switch (part.act) {
    case "press": {
      // Into its own shadow and back — the button press of the form beside it.
      // The shadow's offset is the `--auth-sh` the face already carries.
      const sh = face instanceof SVGElement ? face.style.getPropertyValue("--auth-sh") || "0.7px" : "0.7px";
      face?.animate?.([{ translate: `${sh} ${sh}`, offset: 0.3 }], timing(360));
      return;
    }
    case "signal": {
      const signal = entrance.querySelector(".auth-art__signal");
      signal?.animate?.(
        [
          { strokeDashoffset: 0.07, opacity: 1 },
          { strokeDashoffset: -1, opacity: 1 },
        ],
        timing(ARRIVAL_MS + 80, "linear"),
      );
      return;
    }
    case "light":
      entrance.animate?.([{ scale: 1 }, { scale: 2.3, offset: 0.25 }, { scale: 1 }], timing(560));
      return;
    case "flick":
      // About the motion group's own pivot (the focus), shadow included.
      for (const m of motions) {
        m.animate?.(
          [{ rotate: "0deg" }, { rotate: `${part.rot}deg`, offset: 0.35 }, { rotate: "0deg" }],
          timing(900),
        );
      }
      return;
    case "whirl":
      // A rider runs once round its whole orbit, about the focus it rides.
      for (const m of motions)
        m.animate?.([{ rotate: "0deg" }, { rotate: `${part.rot}deg` }], timing(1100, "ease-in-out"));
      return;
    case "flip":
      // A full turn about the tile's centre. The shadow group turns with the
      // same pivot from its static offset, so the shadow stays down-right.
      for (const m of motions)
        m.animate?.([{ rotate: "0deg" }, { rotate: `${part.rot}deg` }], timing(720, SNAP));
      return;
    case "spin":
      entrance.animate?.([{ rotate: "0deg" }, { rotate: `${part.rot}deg` }], timing(480, SNAP));
      return;
    case "shove":
      entrance.animate?.(
        [
          { translate: "0px 0px" },
          { translate: `${part.dx}px ${part.dy}px`, offset: 0.3 },
          { translate: "0px 0px" },
        ],
        timing(760),
      );
      return;
    case "flutter":
      entrance.animate?.(
        [
          { translate: "0px 0px" },
          { translate: `${part.dx}px ${part.dy}px`, offset: 0.25 },
          { translate: `${-part.dx * 0.45}px ${-part.dy * 0.45}px`, offset: 0.6 },
          { translate: "0px 0px" },
        ],
        timing(820),
      );
      return;
    case "advance":
      entrance.animate?.([{ translate: "0px 0px" }, { translate: `${part.dx}px ${part.dy}px` }], timing(520));
      return;
  }
}

/**
 * Renders the generated composition beside the login form.
 *
 * **Nothing is rendered server-side, on purpose.** This is a static site, so
 * anything produced during the build would be the *same* picture for every
 * visitor until the next deploy — and seeding it in the initial render instead
 * would make the server's markup disagree with the client's on every single
 * load, which is a hydration mismatch by construction. Generating in an effect
 * is the only variant that is both fresh per visit and correct.
 *
 * The empty first frame is invisible: the panel paints its own flat navy
 * ground in CSS, so what the visitor sees is a brand surface that gains
 * shapes a frame later, not a white hole.
 *
 * **It does not read the pointer's position.** The composition answers the
 * *presence* of a pointer (a plain CSS `:hover`, one state change, no JS at
 * all) and it answers typing. It never tracked the cursor well: a disc pinned
 * under the crosshair reads as a cursor decoration rather than as artwork, and
 * a parallax bound to the coordinates makes the picture a read-out of where the
 * mouse is. Both are gone; what is left is a seeded pose the shapes glide into.
 *
 * Purely decorative — `aria-hidden`, unfocusable, and it never announces.
 * See `artworkSignal.ts` for why typing arrives as an event.
 */
export default function LoginArtwork() {
  const [art, setArt] = useState<Artwork | null>(null);
  /**
   * Reduced motion is read here rather than left to CSS alone, because the
   * keystroke answers are Web Animations fired imperatively. A media query cannot
   * switch those off — only not starting them can. (The hover pose IS pure CSS
   * and sits inside the same opt-in block, so it needs nothing here.)
   */
  const [motionOk, setMotionOk] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<Artwork | null>(null);
  const decay = useRef(0);
  const keySlot = useRef(0);
  const lastKey = useRef(Number.NEGATIVE_INFINITY);

  useEffect(() => {
    const generated = generateArtwork(randomSeed());
    artRef.current = generated;
    setArt(generated);
  }, []);

  useEffect(() => {
    // Guarded: jsdom has matchMedia, but a bare `window` in a non-browser test
    // harness may not, and losing the artwork entirely to a TypeError here would
    // be a poor trade for a decoration.
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: no-preference)");
    setMotionOk(query.matches);
    const sync = () => setMotionOk(query.matches);
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  /**
   * One keystroke: the scene's own answer (immediate) plus a bump of ambient
   * energy (slow).
   *
   * The answer is the composition's, not a generic burst: a pulse runs down a
   * conduit, a mosaic tile spins, the tape pays out a unit, a raster cell lights
   * its neighbours, a tile presses into its shadow (see `Act` in artwork.ts).
   * The pool is fired round-robin, so consecutive keys play different parts.
   *
   * The split is still the point. A keystroke needs an answer inside a frame or
   * the feedback is not attributable to it, but a per-keystroke *ambient* change
   * would strobe while someone types a password. So the answer is discrete and
   * the field-wide response is a value that rises once and decays once.
   */
  const pulse = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;

    stage.style.setProperty("--auth-energy", "1");
    window.clearTimeout(decay.current);
    decay.current = window.setTimeout(() => {
      stageRef.current?.style.setProperty("--auth-energy", "0");
    }, ENERGY_HOLD_MS);

    const now = performance.now();
    const keys = artRef.current?.keys;
    if (!keys?.length || now - lastKey.current < KEY_MIN_GAP_MS) return;
    lastKey.current = now;

    const key = keys[keySlot.current % keys.length]!;
    keySlot.current++;
    // Web Animations rather than a CSS animation + class toggle: a keystroke has
    // to be able to re-fire an answer that is still running, and CSS gives you
    // that only by remounting the node (which would reset its ambient phase) or
    // by forcing a synchronous reflow.
    for (const part of key.parts) {
      const pose = stage.querySelector(`[data-mark="${part.mark}"]`);
      if (pose) fire(pose, part);
    }
  }, []);

  useEffect(() => {
    if (!motionOk) return;
    return onTyping(pulse);
  }, [motionOk, pulse]);

  // The decay timer outlives a navigation away from the page otherwise.
  useEffect(() => () => window.clearTimeout(decay.current), []);

  if (!art) return null;

  return (
    // `data-theme="dark"` in BOTH page themes: the panel is a fixed dark field,
    // so the marks need the light-on-dark twins of the brand hues. Under the
    // light theme `--color-primary` is the panel's own navy and every mark in
    // it vanished. tds-shared ≥ 0.45.2 resolves the dark tokens for a subtree.
    <div className="auth-art__stage" ref={stageRef} data-theme="dark">
      <svg
        className="auth-art__canvas"
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        // `slice` fills the panel at any aspect ratio without distorting the
        // curves — the composition is designed to be cropped.
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        focusable="false"
        data-seed={art.seed}
        data-scene={art.scene}
      >
        <defs>
          {BLUR_LEVELS.map((radius, i) => (
            <filter
              key={i}
              id={`auth-art-blur-${i}`}
              // USER SPACE, not the default objectBoundingBox. A percentage region
              // is a fraction of the shape's GEOMETRIC bbox (strokes excluded), and
              // a field sitting on the edge would be clipped into a hard, straight
              // cut-off at these radii.
              //
              // These numbers are viewBox units, and the margin is not cosmetic: the
              // region clips the filter's INPUT as well as its output, so a pixel
              // just inside the visible crop must still be able to reach every
              // source pixel within ~3σ (51 units at the widest blur). A field is
              // centred up to 12 units outside the frame with a radius up to 36,
              // so a 70-unit margin keeps the outermost visible columns from
              // quietly losing part of their colour.
              filterUnits="userSpaceOnUse"
              x={-70}
              y={-70}
              width={240}
              height={240}
            >
              <feGaussianBlur stdDeviation={radius} />
            </filter>
          ))}
        </defs>

        {/* Outermost: the typing response. Its own group because it is a
            TRANSITION on `transform` and the sway below is an ANIMATION on the
            same property — one element cannot carry both, and the animation
            would win outright. Scale only ever grows, so a spanning mark's
            overhang can never be pulled inside the frame. */}
        <g className="auth-art__breathe">
          {/* The sway group is animated and carries NO transform attribute of its
              own. Putting the CSS animation on the tilt group below would override
              that presentation attribute outright — author CSS always wins — and the
              tilt would silently disappear for the whole animation. Two rotations
              about the same point commute, so nesting them costs nothing. */}
          <g className="auth-art__sway" style={swayVars(art.sway)}>
            {/* One rotation for the whole composition: cheaper than re-deriving every
                coordinate, and it varies the read of an otherwise similar layout. */}
            <g transform={`rotate(${art.tilt} ${VIEWBOX / 2} ${VIEWBOX / 2})`}>
              {/* Already in paint order: wash → structure → accent. */}
              {art.marks.map((mark, i) => {
                const motion: ArtStyle = {
                  ...motionVars(mark.motion),
                  ...(mark.motion.kind === "pulse" ? pulseVars(mark.motion.dim) : null),
                };
                const moving = `auth-art__m auth-art__m--${mark.motion.kind}`;
                // Nested groups, one job each: the pose (a transition), the
                // entrance (a one-shot), the motion (an animation), and the drawn
                // node, which never moves at all. An animation beats any other
                // declaration of the same property, so none of them can share an
                // element; and an SVG filter on the very element being
                // transformed is the case engines are least likely to cache.
                // Don't "simplify" this by collapsing them.
                return (
                  <g key={i} className="auth-art__pose" style={poseVars(mark.pose)} data-mark={i}>
                    <g
                      className={`auth-art__in auth-art__in--${mark.enter.kind}`}
                      style={enterVars(mark.enter)}
                    >
                      {/* The hard shadow: the same shape, offset down-right by a
                          STATIC attribute OUTSIDE its motion group. Inside it, a
                          tile turning a quarter would swing its shadow round to
                          the top-left; out here the offset stays put while the
                          shape it copies turns. Same motion values, same phase,
                          so the two never drift apart. */}
                      {mark.shade > 0 && (
                        <g transform={`translate(${mark.shade} ${mark.shade})`}>
                          <g className={moving} style={motion}>
                            {renderMark(mark, "shade")}
                          </g>
                        </g>
                      )}
                      <g
                        className={mark.shade > 0 ? `${moving} auth-art__raise` : moving}
                        style={mark.shade > 0 ? { ...motion, "--auth-sh": `${mark.shade}px` } : motion}
                      >
                        {renderMark(mark, "face")}
                        {mark.signal && (
                          // Invisible at rest (`opacity=0`), so the static
                          // composition under `reduce` is the conduit alone.
                          <path
                            className="auth-art__signal"
                            style={signalVars(mark.signal)}
                            d={mark.d}
                            pathLength={1}
                            fill="none"
                            stroke={mark.signal.hue}
                            strokeWidth={r2(mark.width * 2.2)}
                            strokeLinecap="round"
                            opacity={0}
                          />
                        )}
                      </g>
                    </g>
                  </g>
                );
              })}
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}

function r2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The drawn node — the visible face, or its hard shadow.
 *
 * The face's alpha rides on `stroke-opacity`/`fill-opacity` rather than on
 * `opacity`, and it is a presentation ATTRIBUTE: the lowest-priority way to set
 * a value in SVG, so the hover rules can raise it while the composition still
 * renders correctly with no stylesheet at all (which is what someone under
 * `prefers-reduced-motion: reduce` gets).
 *
 * The layer class is what the interaction rules key off: accents scale, hairline
 * structure (`--line`) firms up, raised tiles lift off their shadow, and the
 * wash answers with movement only.
 *
 * `pathLength="1"` only where a drawn entrance or a signal needs it: it rescales
 * the dash pattern and nothing else.
 */
function renderMark(mark: Mark, role: "face" | "shade") {
  const face = role === "face";
  const filter = face && mark.blur >= 0 ? `url(#auth-art-blur-${mark.blur})` : undefined;
  const line = !mark.filled && mark.width < 1;
  const className = face
    ? `auth-art__mark auth-art__mark--${mark.layer}${line ? " auth-art__mark--line" : ""}`
    : "auth-art__shade";
  const hue = face ? mark.hue : SHADE;
  const alpha = face ? mark.opacity : SHADE_ALPHA;
  // The resting width, so the hover rule can scale it by a factor instead of
  // naming an absolute one — a fixed target would SHRINK half the hairlines.
  const width = line && face ? ({ "--auth-w": `${mark.width}` } as ArtStyle) : undefined;
  const pathLength = mark.measured ? 1 : undefined;

  if (mark.kind === "path") {
    return mark.filled ? (
      <path className={className} d={mark.d} fill={hue} fillOpacity={alpha} filter={filter} />
    ) : (
      <path
        className={className}
        style={width}
        d={mark.d}
        pathLength={pathLength}
        fill="none"
        stroke={hue}
        strokeWidth={mark.width}
        strokeOpacity={alpha}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={filter}
      />
    );
  }

  if (mark.filled) {
    return (
      <circle
        className={className}
        cx={mark.cx}
        cy={mark.cy}
        r={mark.r}
        fill={hue}
        fillOpacity={alpha}
        filter={filter}
      />
    );
  }

  return (
    <circle
      className={className}
      style={width}
      cx={mark.cx}
      cy={mark.cy}
      r={mark.r}
      fill="none"
      stroke={hue}
      strokeWidth={mark.width}
      strokeOpacity={alpha}
      filter={filter}
    />
  );
}
