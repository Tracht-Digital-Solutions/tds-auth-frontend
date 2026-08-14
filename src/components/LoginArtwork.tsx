import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  BLUR_LEVELS,
  RIPPLE_SLOTS,
  VIEWBOX,
  generateArtwork,
  randomSeed,
  type Artwork,
  type Mark,
  type Motion,
  type Pose,
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
   * ripple bursts are Web Animations fired imperatively. A media query cannot
   * switch those off — only not starting them can. (The hover pose IS pure CSS
   * and sits inside the same opt-in block, so it needs nothing here.)
   */
  const [motionOk, setMotionOk] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const rippleRefs = useRef<(SVGCircleElement | null)[]>([]);
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

  // The decay timer outlives a navigation away from the page otherwise.
  useEffect(() => () => window.clearTimeout(decay.current), []);

  if (!art) return null;

  return (
    <div className="auth-art__stage" ref={stageRef}>
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
              // is a fraction of the path's GEOMETRIC bbox — strokes excluded — and
              // a nearly flat ribbon has almost no bbox height while its stroke is
              // up to 24 wide. At these radii that clips the blur into a hard,
              // straight cut-off across the panel.
              //
              // These numbers are viewBox units, and the margin is not cosmetic: the
              // region clips the filter's INPUT as well as its output, so a pixel
              // just inside the visible crop must still be able to reach every
              // source pixel within ~3σ (51 units at the widest blur). Spanning
              // marks run OVERHANG=45 past each edge plus half a 24-wide stroke, so
              // a 70-unit margin is what keeps the left- and right-most visible
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
              {art.marks.map((mark, i) => (
                // Three nested elements, one job each: the outer holds the hover
                // pose (a transition), the inner the ambient motion (an
                // animation), and the filtered node never moves at all. Both
                // halves are load-bearing. An animation beats any other
                // declaration of the same property, so pose and motion cannot
                // share an element; and an SVG filter on the very element being
                // transformed is the case engines are least likely to cache — at
                // radius 17 that would be a full Gaussian per mark per frame.
                // Don't "simplify" this by collapsing them.
                <g key={i} className="auth-art__pose" style={poseVars(mark.pose)}>
                  <g
                    className={`auth-art__m auth-art__m--${mark.motion.kind}`}
                    style={{
                      ...motionVars(mark.motion),
                      ...(mark.motion.kind === "pulse" ? pulseVars(mark.motion.dim) : null),
                    }}
                  >
                    {renderMark(mark)}
                  </g>
                </g>
              ))}

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

/**
 * The drawn node.
 *
 * Its alpha rides on `stroke-opacity`/`fill-opacity` rather than on `opacity`,
 * and it is a presentation ATTRIBUTE: that is the lowest-priority way to set a
 * value in SVG, so the hover rules can raise it while the composition still
 * renders correctly with no stylesheet at all (which is what someone under
 * `prefers-reduced-motion: reduce` gets).
 *
 * The layer class is what the interaction rules key off. Each layer answers
 * differently on purpose: accents scale, structure firms up (weight + alpha),
 * and the wash answers with movement ONLY — lifting the wash's alpha under
 * `screen` is what turns the dark half of the split into a pink wash.
 */
function renderMark(mark: Mark) {
  const filter = mark.blur >= 0 ? `url(#auth-art-blur-${mark.blur})` : undefined;
  const className = `auth-art__mark auth-art__mark--${mark.layer}`;

  if (mark.kind === "path") {
    return (
      <path
        className={className}
        // The resting width, so the hover rule can scale it by a factor instead
        // of naming an absolute one — the marks it applies to are between 0.3
        // and 0.7 wide, and a fixed target would SHRINK half of them.
        style={{ "--auth-w": `${mark.width}` } as ArtStyle}
        d={mark.d}
        fill="none"
        stroke={mark.hue}
        strokeWidth={mark.width}
        strokeOpacity={mark.opacity}
        strokeLinecap="round"
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
        fill={mark.hue}
        fillOpacity={mark.opacity}
        filter={filter}
      />
    );
  }

  return (
    <circle
      className={className}
      style={{ "--auth-w": `${mark.width}` } as ArtStyle}
      cx={mark.cx}
      cy={mark.cy}
      r={mark.r}
      fill="none"
      stroke={mark.hue}
      strokeWidth={mark.width}
      strokeOpacity={mark.opacity}
      filter={filter}
    />
  );
}
