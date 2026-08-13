import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  BLUR_LEVELS,
  FOLLOW_EASE,
  RIPPLE_SLOTS,
  VIEWBOX,
  generateArtwork,
  randomSeed,
  type Artwork,
  type Drift,
  type Orbit,
  type Pulse,
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
 * `px` inside an SVG element's transform is ONE USER UNIT, so the drift is
 * expressed in viewBox coordinates and scales with the panel, which is what we
 * want. A unitless number in `translate()` is invalid CSS, and because these
 * arrive through `var()` substitution it would take the entire `transform`
 * declaration down with it — silently, with the shape simply never moving.
 */
const driftVars = (m: Drift): ArtStyle => ({
  "--auth-dx": `${m.dx}px`,
  "--auth-dy": `${m.dy}px`,
  "--auth-rot": `${m.rot}deg`,
  "--auth-scale": `${m.scale}`,
  "--auth-dur": `${m.dur}s`,
  "--auth-delay": `${m.delay}s`,
});

const orbitVars = (m: Orbit): ArtStyle => ({
  "--auth-rot": `${m.rot}deg`,
  "--auth-dur": `${m.dur}s`,
  "--auth-delay": `${m.delay}s`,
});

/**
 * The dimmed end is precomputed rather than written as a `calc()` in the
 * keyframes, so 0% and 100% can be the resting opacity EXACTLY — the loop has to
 * rest where the static composition sits.
 */
const pulseVars = (opacity: number, m: Pulse): ArtStyle => ({
  "--auth-o": `${opacity}`,
  "--auth-o-low": `${Math.round(opacity * m.dim * 1000) / 1000}`,
  "--auth-dur": `${m.dur}s`,
  "--auth-delay": `${m.delay}s`,
});

/**
 * `--auth-depth` stays UNITLESS — the stylesheet multiplies it by the pointer's
 * normalised offset before turning the product into `px`, and `calc()` cannot
 * multiply two lengths.
 */
const depthVar = (depth: number): ArtStyle => ({ "--auth-depth": `${depth}` });

/**
 * Deliberately NOT `--auth-dur`: custom properties inherit, and a name shared
 * with the descendants would be a trap for any shape that ever forgets to set
 * its own.
 */
const swayVars = (sway: Artwork["sway"]): ArtStyle => ({
  "--auth-sway": `${sway.deg}deg`,
  "--auth-sway-dur": `${sway.dur}s`,
});

/** Layer keys, ordered far → near. Each eases at its own `FOLLOW_EASE` rate. */
const LAYERS = ["far", "mid", "near"] as const;

/**
 * The custom property each layer writes, spelled out rather than built from a
 * template literal. `static-posture.test.ts` cross-checks every `--auth-*` name
 * against `global.css` in both directions by reading this file as TEXT — an
 * interpolated name is invisible to that check, and the failure it guards
 * against (a shape that silently never moves) has no other symptom.
 */
const LAYER_VARS = {
  far: ["--auth-mx-far", "--auth-my-far"],
  mid: ["--auth-mx-mid", "--auth-my-mid"],
  near: ["--auth-mx-near", "--auth-my-near"],
} as const;

/**
 * Below this, the eased value is snapped to the target and the loop stops.
 * Without a floor an exponential ease never arrives, so the frame would be
 * scheduled forever — for a decoration nobody is looking at any more.
 */
const SETTLED = 0.0008;
/**
 * Clamp on the frame delta the ease integrates over. A backgrounded tab resumes
 * with a multi-second gap, and without this the composition would teleport to
 * the pointer on the first frame back.
 */
const MAX_STEP_MS = 100;

/** How long after the last keystroke the composition stays "engaged". */
const ENERGY_HOLD_MS = 900;
/**
 * Floor on the ripple rate. A held key autorepeats at ~30/s, and restarting the
 * pool that fast produces a flicker rather than a ripple.
 */
const RIPPLE_MIN_GAP_MS = 110;
const RIPPLE_MS = 1100;

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
 * The empty first frame is invisible: the panel paints its own gradient
 * backdrop in CSS, so what the visitor sees is a brand surface that gains
 * shapes a frame later, not a white hole.
 *
 * Purely decorative — `aria-hidden`, unfocusable, and it never announces. It
 * *reacts* (to the pointer and to typing), but it never becomes a control: there
 * is nothing to activate, nothing to focus, and no information carried by the
 * response. See `artworkSignal.ts` for why typing arrives as an event.
 */
export default function LoginArtwork() {
  const [art, setArt] = useState<Artwork | null>(null);
  /**
   * Reduced motion is read here rather than left to CSS alone, because two of
   * the three responses are imperative: the ripple bursts are Web Animations and
   * the pointer offsets are written straight onto the node. A media query cannot
   * switch those off — only not starting them can.
   */
  const [motionOk, setMotionOk] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const rippleRefs = useRef<(SVGCircleElement | null)[]>([]);
  /**
   * Where the pointer is, normalised to ±1 about the panel centre. The parallax
   * works in viewBox units and must scale with the panel, so the pixels are
   * turned into a fraction here and multiplied by each shape's depth in CSS.
   */
  const target = useRef({ x: 0, y: 0 });
  /**
   * Where each layer currently IS — one eased position per layer, chasing
   * `target` at its own rate. The glow chases at the near layer's rate but in
   * pixels: it is a plain DOM element, so it travels in real distance.
   */
  const eased = useRef({
    far: { x: 0, y: 0 },
    mid: { x: 0, y: 0 },
    near: { x: 0, y: 0 },
  });
  const frame = useRef(0);
  const lastFrame = useRef(0);
  /** Panel size at the last sample, so the glow can convert back to pixels. */
  const panel = useRef({ width: 0, height: 0 });
  const decay = useRef(0);
  const rippleSlot = useRef(0);
  const lastRipple = useRef(0);

  useEffect(() => {
    setArt(generateArtwork(randomSeed()));
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

  /*
   * THE FOLLOW IS EASED HERE, IN ONE LOOP, AND WRITTEN STRAIGHT TO THE DOM.
   * Neither half of that is a shortcut; both were arrived at by measuring.
   *
   * Not React: a `pointermove` arrives per input sample, up to 120/s on a
   * high-rate mouse. Routing that through `useState` would re-render 4–7
   * filtered ribbons, 2–4 rings and every spark on every sample, rebuilding each
   * shape's style object, to move two numbers that only CSS ever reads.
   *
   * Not a CSS transition either, which is the version this replaced. A
   * transition whose target moves every frame is restarted every frame, and on
   * fifteen elements that was the single most expensive thing on the page: 49
   * fps against 59 for the identical transforms driven directly, at 6× CPU
   * throttling in Chrome against the built `dist/`. The transforms are nearly
   * free; the transition bookkeeping was not.
   *
   * So: three eased positions, one per layer, each an exponential chase toward
   * the pointer with its own time constant. Six custom properties on ONE element
   * per frame, which every shape inherits.
   */
  const step = useCallback((now: number) => {
    const stage = stageRef.current;
    if (!stage) {
      frame.current = 0;
      return;
    }
    // First frame of a run has no previous timestamp to subtract.
    const dt = lastFrame.current ? Math.min(now - lastFrame.current, MAX_STEP_MS) : 16;
    lastFrame.current = now;

    let settled = true;
    for (const layer of LAYERS) {
      const at = eased.current[layer];
      // Frame-rate independent: the fraction covered depends on elapsed TIME,
      // not on how many frames happened to fire. A plain `* k` per frame would
      // make the panel feel twice as responsive on a 120 Hz display.
      const k = 1 - Math.exp(-dt / FOLLOW_EASE[layer]);
      at.x += (target.current.x - at.x) * k;
      at.y += (target.current.y - at.y) * k;
      if (
        Math.abs(target.current.x - at.x) > SETTLED ||
        Math.abs(target.current.y - at.y) > SETTLED
      ) {
        settled = false;
      } else {
        // Snap, so the resting state is exactly the target rather than
        // asymptotically near it.
        at.x = target.current.x;
        at.y = target.current.y;
      }
      stage.style.setProperty(LAYER_VARS[layer][0], round(at.x));
      stage.style.setProperty(LAYER_VARS[layer][1], round(at.y));
    }

    // The glow rides the near layer's easing but in real pixels — it is a DOM
    // element, and a percentage in `translate()` would resolve against its own
    // box rather than the panel's.
    const near = eased.current.near;
    stage.style.setProperty("--auth-glow-x", `${round((near.x * panel.current.width) / 2)}px`);
    stage.style.setProperty("--auth-glow-y", `${round((near.y * panel.current.height) / 2)}px`);

    frame.current = settled ? 0 : requestAnimationFrame(step);
    if (settled) lastFrame.current = 0;
  }, []);

  const start = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(step);
  }, [step]);

  const track = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // A touch drag over the band would leave the composition parked wherever
      // the finger lifted, with no pointerleave to bring it home. Hover is a
      // mouse/pen gesture; treat it as one.
      if (event.pointerType === "touch") return;
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      // A zero-sized rect (jsdom, or a panel measured mid-layout) would divide
      // to NaN. NaN in a custom property makes the whole `transform` invalid at
      // computed-value time: every shape snaps back to the origin, and nothing
      // is logged.
      if (rect.width === 0 || rect.height === 0) return;
      panel.current = { width: rect.width, height: rect.height };
      target.current = {
        x: clamp(((event.clientX - rect.left - rect.width / 2) / rect.width) * 2),
        y: clamp(((event.clientY - rect.top - rect.height / 2) / rect.height) * 2),
      };
      start();
    },
    [start],
  );

  /** Pointer gone: aim at centre and let each layer ease its own way back. */
  const release = useCallback(() => {
    target.current = { x: 0, y: 0 };
    start();
  }, [start]);

  /**
   * One keystroke: a ripple (immediate) plus a bump of ambient energy (slow).
   *
   * The split is the point. A keystroke needs an answer inside a frame or the
   * feedback is not attributable to it, but a per-keystroke *ambient* change
   * would strobe while someone types a password. So the burst is discrete and
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
    if (now - lastRipple.current < RIPPLE_MIN_GAP_MS) return;
    lastRipple.current = now;

    const slot = rippleRefs.current[rippleSlot.current % RIPPLE_SLOTS];
    rippleSlot.current++;
    // Web Animations rather than a CSS animation + class toggle: a keystroke has
    // to be able to re-fire a burst that is still running, and CSS gives you
    // that only by remounting the node (which would reset its neighbours'
    // ambient phase) or by forcing a synchronous reflow. `fill` stays at its
    // `none` default so the circle returns to its resting opacity: 0.
    // Optional-called — jsdom implements no `Element.animate`.
    slot?.animate?.(
      [
        { transform: "scale(0.06)", opacity: 0.5 },
        { transform: "scale(1)", opacity: 0 },
      ],
      { duration: RIPPLE_MS, easing: "cubic-bezier(0.16, 0.84, 0.44, 1)" },
    );
  }, []);

  useEffect(() => {
    if (!motionOk) return;
    return onTyping(pulse);
  }, [motionOk, pulse]);

  // Timers and frames outlive a navigation away from the page otherwise.
  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      window.clearTimeout(decay.current);
    },
    [],
  );

  if (!art) return null;

  return (
    <div
      className="auth-art__stage"
      ref={stageRef}
      // Under `reduce` the handlers are never attached at all, so no offset can
      // be written and the stylesheet's interaction rules — which live inside
      // the same opt-in block — have nothing to read either way.
      onPointerMove={motionOk ? track : undefined}
      onPointerLeave={motionOk ? release : undefined}
    >
      {/* Beneath the composition, so the ribbons stay the top layer and the glow
          reads as a light source behind them rather than as a smear over them. */}
      <div className="auth-art__glow" />

      <svg
        className="auth-art__canvas"
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        // `slice` fills the panel at any aspect ratio without distorting the
        // curves — the composition is designed to be cropped.
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        focusable="false"
        data-seed={art.seed}
      >
        <defs>
          {BLUR_LEVELS.map((radius, i) => (
            <filter
              key={i}
              id={`auth-art-blur-${i}`}
              // USER SPACE, not the default objectBoundingBox. A percentage region
              // is a fraction of the path's GEOMETRIC bbox — strokes excluded — and
              // a nearly flat ribbon has almost no bbox height while its stroke is
              // up to 24 wide. At these radii that clips the blur into a hard,
              // straight cut-off across the panel.
              //
              // These numbers are viewBox units, and the margin is not cosmetic: the
              // region clips the filter's INPUT as well as its output, so a pixel
              // just inside the visible crop must still be able to reach every
              // source pixel within ~3σ (51 units at the widest blur). Ribbons now
              // run OVERHANG=45 past each edge plus half a 24-wide stroke, so a
              // 70-unit margin is what keeps the left- and right-most visible
              // columns from quietly losing part of their colour.
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
            would win outright. Scale only ever grows, so the ribbons' overhang
            can never be pulled inside the frame. */}
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
              {/* One group per parallax layer. The group carries nothing but the
                  binding from its layer's eased position to the `--auth-fx/fy`
                  the shapes below read, so a shape needs to know only its own
                  depth — and there are three easings to run, not fifteen. */}
              <g className="auth-art__layer auth-art__layer--far">
                {art.ribbons.map((ribbon, i) => (
                  // Three nested groups, one property each: the outer follows the
                  // pointer, the inner drifts (animation), and the filtered
                  // <path> never moves at all. An SVG filter on the very element
                  // being transformed is the case engines are least likely to
                  // cache, and at radius 17 that would be a full Gaussian per
                  // ribbon per frame. Don't "simplify" this by collapsing them.
                  <g key={i} className="auth-art__follow" style={depthVar(ribbon.depth)}>
                    <g className="auth-art__ribbon" style={driftVars(ribbon.motion)}>
                      <path
                        d={ribbon.d}
                        fill="none"
                        stroke={ribbon.hue}
                        strokeWidth={ribbon.width}
                        strokeLinecap="round"
                        opacity={ribbon.opacity}
                        filter={`url(#auth-art-blur-${ribbon.blur})`}
                      />
                    </g>
                  </g>
                ))}
              </g>

              {/* Thin rings and crisp dots are what keep the blurred ribbons from
                  reading as a smear — structure first, then somewhere to look.
                  Both stay sharp: the contrast against the soft ribbons is the depth. */}
              <g className="auth-art__layer auth-art__layer--mid">
                {art.rings.map((ring, i) => (
                  <g key={i} className="auth-art__follow" style={depthVar(ring.depth)}>
                    <circle
                      className="auth-art__ring"
                      style={orbitVars(ring.motion)}
                      cx={ring.cx}
                      cy={ring.cy}
                      r={ring.r}
                      fill="none"
                      stroke={ring.hue}
                      strokeWidth={0.35}
                      opacity={ring.opacity}
                    />
                  </g>
                ))}
              </g>

              <g className="auth-art__layer auth-art__layer--near">
                {art.sparks.map((spark, i) => (
                  <g key={i} className="auth-art__follow" style={depthVar(spark.depth)}>
                    <circle
                      className="auth-art__spark"
                      style={pulseVars(spark.opacity, spark.motion)}
                      cx={spark.cx}
                      cy={spark.cy}
                      r={spark.r}
                      fill={spark.hue}
                      // KEEP the attribute: under `prefers-reduced-motion: reduce` no
                      // keyframe applies, so this IS the rendering. The resting state is
                      // then identical to the old static composition by construction,
                      // rather than by a second rule someone has to remember.
                      opacity={spark.opacity}
                    />
                  </g>
                ))}
              </g>

              {/* Keystroke bursts. Rendered always and invisible at rest
                  (`opacity=0`), so a keystroke costs an animation and never a
                  mount — and under `reduce`, where nothing ever animates them,
                  the attribute is the whole rendering. */}
              {art.ripples.map((ripple, i) => (
                <circle
                  key={i}
                  className="auth-art__ripple"
                  ref={(el) => {
                    rippleRefs.current[i] = el;
                  }}
                  cx={ripple.cx}
                  cy={ripple.cy}
                  // The radius the burst expands TO: the animation scales this
                  // circle rather than animating `r`, because `r` as a CSS
                  // property is far less evenly supported than `transform`.
                  r={26}
                  fill="none"
                  stroke={ripple.hue}
                  strokeWidth={0.5}
                  opacity={0}
                />
              ))}
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}

/** Keep the normalised offset inside ±1 — the corners of the panel exceed it. */
function clamp(value: number): number {
  return Math.max(-1, Math.min(1, Math.round(value * 1000) / 1000));
}

/**
 * 3dp. Custom properties are re-parsed on every write, so the shortest string
 * that is still smooth at the scale these drive (a hundred-unit viewBox) is the
 * one to send — and it makes the settled value exactly the target rather than
 * `0.9999999`.
 */
function round(value: number): string {
  return `${Math.round(value * 1000) / 1000}`;
}
