# Generated login artwork

`src/lib/artwork.ts` (generator) + `src/components/LoginArtwork.tsx` (renderer) + the
`.auth-art*` rules in `global.css`.

## Generated per visit, client-side only

Nothing renders server-side. A static build would show every visitor the same picture until the
next deploy, and seeding it in the initial render would make server and client markup disagree on
every load. Generating in an effect is the only fresh and correct option.

## Scenes and layers

Variety comes from a **scene** drawn per visit. Four archetypes (`SCENES`), each with its own shape
and motion vocabulary:

| Scene | Wash (soft, back) | Structure (crisp, middle) | Accent (crisp, front) |
|---|---|---|---|
| `ribbons` | 4–7 curved bands, `drift` | 2–4 rings, `orbit` | 2–4 dots, `pulse` |
| `orbits` | 2 wide blurred haloes, `drift` | 5–9 arc segments about 1–2 foci, `spin` | 3–5 dots, `pulse` |
| `particles` | 2–3 blurred blobs, `drift` | 1–2 rings, `orbit` | 16–28 dots + hairlines, `pulse` |
| `strata` | 6–10 parallel bands, `slide` | 3–5 cross-ticks, `slide` | 2–4 dots, `pulse` |

- **Every scene fills the same three layers.** That contract lets one set of blur filters, one
  `screen` blend and one depth read serve all four; a fifth scene is a generator change only.
- **Two render kinds:** a stroked `path` and a `circle` (stroked or filled). `LoginArtwork.tsx` is one
  loop with no per-scene branching. `Mark.spans` says a mark must leave the frame at both ends;
  `Mark.layer` drives the interaction rules.

## Bounded, seeded, pure

- Counts, curvature, thickness, opacity and palette are clamped; only the arrangement varies. One
  composition uses **two or three** hues, never all six.
- Seeded and pure, so a composition is reproducible from its number. `generateArtwork(seed, scene)`
  forces the archetype and consumes the scene draw either way.
- Colours are `var(--color-*)`, never literals, so the artwork follows the theme.
- `mix-blend-mode: screen` on the SVG is load-bearing: overlapping marks read as light.

## Blur and brightness

- **Only the wash is blurred** (`BLUR_LEVELS` 5 / 10 / 17); structure and accents stay sharp for
  depth. Keep the largest radius **≤ 20**; it sizes the filter region.
- **A thin mark can't take the widest bucket.** A 3-unit straight band smeared over σ = 17 has no
  peak left, so `bandMark` never draws bucket 2.
- **Softer means dimmer, not brighter** (`BLUR_ALPHA`). `screen` accumulates over coverage; at
  radius 17 one ribbon covers most of the canvas. Judge blur or alpha changes by **mean luminance
  over several loads**, never one composition.
- **The filter region is `userSpaceOnUse`.** A percentage region is a fraction of the geometric bbox
  (strokes excluded) and clips flat ribbons into a hard cut-off. The region also clips the filter's
  input, so it is sized from `OVERHANG` + half a stroke + 3σ.

## Ambient motion

- **Motion is seeded too** (offsets, periods, phase, direction come from `generateArtwork`, never
  `Math.random()` in the component). `artwork.test.ts` pins amplitudes and periods.
- **`OVERHANG` is sized against the motion bounds.** The limiting case is rotation: a tilt about the
  canvas centre swings mark ends inward. Re-check `OVERHANG` against tilt + sway + per-mark rotation
  + the hover pose whenever an amplitude grows.
- **Loops are opt-in under `prefers-reduced-motion: no-preference`.** tds-shared's clamp under
  `reduce` is built for entrances; a loop outside the opt-in runs once and freezes on its last
  keyframe. Every ambient keyframe has `0% == 100% ==` the static composition.
- **The tilt is an SVG attribute on a group inside the animated sway group.** A CSS transform
  animation on the tilt group would override the attribute and drop the tilt silently.
- **Every mark is three nested elements:** `.auth-art__pose` (hover transition) around
  `.auth-art__m--*` (ambient animation) around the drawn node (never moves). An animation beats any
  other declaration of the same property, so pose and motion can't share an element; the filter
  stays on the motionless child so its raster is cached. Measured flat 60 fps at 1×–6× CPU throttling;
  `will-change` is deliberately absent (it would promote layers under a `screen` blend for no gain).
  Not measured: weak GPUs and Firefox.
- **Seeded values reach CSS as inline custom properties** read by shared `@keyframes`, one rule per
  motion kind. A mistyped name silently invalidates the declaration; `static-posture.test.ts`
  cross-checks names both ways, and every `var()` has an identity fallback.
- **`spin` pivots on the arc's circle centre** (`--auth-ox/oy`), not `transform-box: fill-box`. It
  reuses `auth-art-orbit`'s keyframes.

## Interaction: hover and typing, never the cursor position

Both are inert under `reduce`.

- **No coordinate anywhere.** Tracking the pointer turned the picture into a cursor read-out.
  `static-posture.test.ts` fails on `clientX`, `getBoundingClientRect`, `requestAnimationFrame`, any
  `onPointer*` handler, and the `--auth-glow` / `__follow` selectors.
- **Hover → a seeded pose.** Each `.auth-art__pose` glides to a target offset/rotation/scale while the
  pointer is over the panel. One direction per composition. The sign and the travel band are assigned
  by layer (`structure` moves against the others; `POSE_BANDS` are disjoint: wash least, accents most).
  That separation is the depth cue.
- A CSS `transition` is right here because the value changes twice per visit.
- **Stagger is capped** (`POSE_DELAY_MAX`, 220 ms); the delay also applies on the way back.
- **A wash mark's pose never rotates** (rotation could pull an overhang into view).
- **Hover rules sit inside `@media (hover: hover) and (pointer: fine)`**; a tap latches `:hover` on
  touch screens.
- **Hover firms up the structure, never the wash.** Structure thickens (`--auth-w` holds its resting
  width so the rule scales by a factor) and brightens; accents **scale**, because their opacity is
  driven by `auth-art-pulse` and an animation beats a transition.
- **Each mark's alpha is a presentation attribute** (`stroke-opacity` / `fill-opacity`), not an inline
  `opacity` (inline styles beat author CSS). `auth-art-pulse` rests at exactly 1 and multiplies.
- **Typing → energy + a burst.** Each keystroke sets `--auth-energy` to 1 (decaying ~900 ms after the
  last) and fires one expanding ripple from a pool of three seeded origins, via Web Animations
  (`Element.animate`, optional-called; jsdom has none).
- **Reduced motion is gated in JS too:** the component reads
  `matchMedia("(prefers-reduced-motion: no-preference)")` live and doesn't subscribe to typing.

## The typing signal (`src/lib/artworkSignal.ts`)

Form and artwork are separate React roots, so a `window` CustomEvent is the bus (as with tds-shared's
toast host). Each field calls `signalTyping()` explicitly, so the artwork reacts only to what someone
decided. **A new form must call it**; every island suite asserts its own emission. The event carries
**no payload**, not even a length.

## Verify in a browser, across several reloads

`npm run build && npx astro preview`, then drive it with `playwright-core` (`channel: "chrome"`):

- read `data-scene` off the `<svg>` to be sure you saw all four scenes;
- compare `getComputedStyle(...).transform` on `.auth-art__pose` at two different cursor positions
  inside the panel (they must be identical);
- check `document.getAnimations()` under `reducedMotion: "reduce"`.
