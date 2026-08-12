import { useEffect, useState, type CSSProperties } from "react";
import {
  BLUR_LEVELS,
  VIEWBOX,
  generateArtwork,
  randomSeed,
  type Artwork,
  type Drift,
  type Orbit,
  type Pulse,
} from "~/lib/artwork";

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
 * Deliberately NOT `--auth-dur`: custom properties inherit, and a name shared
 * with the descendants would be a trap for any shape that ever forgets to set
 * its own.
 */
const swayVars = (sway: Artwork["sway"]): ArtStyle => ({
  "--auth-sway": `${sway.deg}deg`,
  "--auth-sway-dur": `${sway.dur}s`,
});

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
 * Purely decorative — `aria-hidden`, unfocusable, and it never announces.
 */
export default function LoginArtwork() {
  const [art, setArt] = useState<Artwork | null>(null);

  useEffect(() => {
    setArt(generateArtwork(randomSeed()));
  }, []);

  if (!art) return null;

  return (
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

      {/* The sway group is animated and carries NO transform attribute of its
          own. Putting the CSS animation on the tilt group below would override
          that presentation attribute outright — author CSS always wins — and the
          tilt would silently disappear for the whole animation. Two rotations
          about the same point commute, so nesting them costs nothing. */}
      <g className="auth-art__sway" style={swayVars(art.sway)}>
        {/* One rotation for the whole composition: cheaper than re-deriving every
            coordinate, and it varies the read of an otherwise similar layout. */}
        <g transform={`rotate(${art.tilt} ${VIEWBOX / 2} ${VIEWBOX / 2})`}>
          <g className="auth-art__ribbons">
            {art.ribbons.map((ribbon, i) => (
              // The WRAPPER drifts; the filtered <path> inside it never moves.
              // An SVG filter on the very element being transformed is the case
              // engines are least likely to cache, and at radius 17 that would be
              // a full Gaussian per ribbon per frame. Don't "simplify" this by
              // animating the path directly.
              <g key={i} className="auth-art__ribbon" style={driftVars(ribbon.motion)}>
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
            ))}
          </g>

          {/* Thin rings and crisp dots are what keep the blurred ribbons from
              reading as a smear — structure first, then somewhere to look.
              Both stay sharp: the contrast against the soft ribbons is the depth. */}
          {art.rings.map((ring, i) => (
            <circle
              key={i}
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
          ))}

          {art.sparks.map((spark, i) => (
            <circle
              key={i}
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
          ))}
        </g>
      </g>
    </svg>
  );
}
