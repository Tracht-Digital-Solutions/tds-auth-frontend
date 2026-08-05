import { useEffect, useState } from "react";
import { BLUR_LEVELS, VIEWBOX, generateArtwork, randomSeed, type Artwork } from "~/lib/artwork";

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
          <filter key={i} id={`auth-art-blur-${i}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={radius} />
          </filter>
        ))}
      </defs>

      {/* One rotation for the whole composition: cheaper than re-deriving every
          coordinate, and it varies the read of an otherwise similar layout. */}
      <g transform={`rotate(${art.tilt} ${VIEWBOX / 2} ${VIEWBOX / 2})`}>
        <g className="auth-art__ribbons">
          {art.ribbons.map((ribbon, i) => (
            <path
              key={i}
              d={ribbon.d}
              fill="none"
              stroke={ribbon.hue}
              strokeWidth={ribbon.width}
              strokeLinecap="round"
              opacity={ribbon.opacity}
              filter={`url(#auth-art-blur-${ribbon.blur})`}
            />
          ))}
        </g>

        {/* Thin rings and crisp dots are what keep the blurred ribbons from
            reading as a smear — structure first, then somewhere to look. */}
        {art.rings.map((ring, i) => (
          <circle
            key={i}
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
            cx={spark.cx}
            cy={spark.cy}
            r={spark.r}
            fill={spark.hue}
            opacity={spark.opacity}
          />
        ))}
      </g>
    </svg>
  );
}
