# Generated login artwork

`src/lib/artwork.ts` (generator) + `src/components/LoginArtwork.tsx` (renderer) + the
`.auth-art*` rules in `global.css`.

## Generated per visit, client-side only

Nothing renders server-side. A static build would show every visitor the same picture until the
next deploy, and seeding it in the initial render would make server and client markup disagree on
every load. Generating in an effect is the only fresh and correct option.

## Style: "Digitale Maßarbeit", not an aurora

The vocabulary is tds-shared's decoration layer: **constructed geometry** (capsules, quarter and half
circles, strongly rounded rectangles) cut by the frame, `.tds-circuit`-style conduits with rounded 90°
corners and nodes, the bordeaux · coral · gold brand accent, and the **hard, unblurred 2D shadow**
the cards and buttons carry. The blurred ribbons under `screen` it replaced are gone; don't bring
back a blend mode (a dark shadow under `screen` vanishes).

- **The stage carries `data-theme="dark"` in both page themes.** The panel is a fixed dark field;
  under the light theme `--color-primary` is the panel's own navy and every mark vanished.
  tds-shared ≥ 0.45.2 resolves dark tokens for a subtree (incl. `--color-gold`).
- **The panel ground is flat `--color-surface-navy`.** Depth comes from the shadows.
- Colours are `var(--color-*)`, never literals. Two or three field hues per composition, plus gold
  (`SPOT`) for nodes, ticks and the accent only. The `measure` scene builds its hues around the brand
  accent instead of adding to them.

## Scenes and layers

Eight archetypes (`SCENES`), drawn per visit, each filling the same three layers:

| Scene | Wash (back) | Structure (middle) | Accent (front) |
|---|---|---|---|
| `constructs` | field, 1–2 cut slabs, maybe a great capsule | 3–5 shadowed tiles on a loose grid, diagonal, ring | dots |
| `circuits` | field, slab | conduits from the edge into chips/nodes, **signals** travelling along them | pads |
| `orbits` | 1–2 fields, slab | shadowed core per focus, 5–9 arcs (`spin`) | gold nodes riding the orbits |
| `strata` | field, slab | 5–8 parallel capsule bands (≥ 1 solid + shadowed), cross-ticks | dots |
| `raster` | field, slab, capsule | dot matrix with a **pulse wave**, tiles, ring | lit gold dots |
| `mosaic` | field, slab | 6–20 shadowed tiles that **turn by quarter steps** | dots |
| `ribbons` | 1–2 fields | 3–5 flat paper strips with shadows, rings | dots |
| `measure` | field, slab | tape-measure rules, logomark diagonal (72°), tiles | crosses, the brand accent |

- **Two render kinds:** `path` (stroked or filled) and `circle`. `LoginArtwork.tsx` is one loop with no
  per-scene branching. Shapes are built in local coordinates and placed by baking one rotation into
  the path points, never a `transform` attribute (accent CSS would override it).
- **Pieces that belong together share one motion object and one pose:** the circuit board (conduits,
  chips, terminal nodes), the raster grid and mosaic floor (pose staggered along the wave), the brand
  bar. Otherwise connections come apart on screen. Chips and nodes are painted after the conduits.

## Bounded, seeded, pure

- Counts, sizes, alphas and palette are clamped; only the arrangement varies. `MARKS_MAX` is 64.
- Seeded and pure. `generateArtwork(seed, scene)` forces the archetype and consumes the scene draw
  either way. Every draw happens in source order; moving a line reshuffles every composition.
- **Spanning marks** (strips, bands, rules, diagonals, the great capsule) carry `ends` that sit
  `OVERHANG` past the frame in the max-norm, from wherever they are centred (`spanHalf`). They only
  ever `slide`, never rotate, and never `pop` (shrunk about their centre they would show caps).
- Non-spanning marks carry `at`, within `STRAY_MAX` of the frame (cut slabs anchor just outside a
  corner).

## Blur

Only the wash fields are blurred (`BLUR_LEVELS` 5 / 10 / 17; keep the largest ≤ 20, it sizes the
`userSpaceOnUse` filter region). Wash alpha stays under `WASH_ALPHA_MAX` and never casts a shadow.

## The hard shadow

`Mark.shade` (user units, `SHADE_RANGE` ≈ the cards' 6–8 px) renders a dark copy of the shape
(`--auth-shade`, set on the stage) **behind a static `translate` attribute OUTSIDE its motion
group**, with the same motion values inside. Inside the motion group a turning tile would swing its
shadow round to the top-left. Only solid shapes (alpha ≥ 0.8) cast one.

The face's motion group gets `.auth-art__raise` and `--auth-sh`; its CSS `translate` (not
`transform`, which the same group animates) lifts it half an offset on hover (`--auth-lift`) — the
buttons' lift. The press is a keystroke answer (below), one shape per key.

## Motion

- **Seeded** (offsets, periods, phases, directions); `artwork.test.ts` pins amplitudes and periods.
  Kinds: `drift`, `orbit`, `spin`, `turn` (±90° with long holds), `pulse`, `slide`.
- **Signals** are a separate `pathLength="1"` overlay with one short dash; invisible at both ends of
  the loop, so the static composition shows none.
- **Entrance** (`Mark.enter`): `pop` (scale + opacity on `.auth-art__in`), `draw` (stroke dash on
  `pathLength="1"` paths), `fade` (spanning fills), `none` (wash). One-shot, `both` fill, capped at
  `ENTER_MAX`.
- **Loops and entrances are opt-in under `prefers-reduced-motion: no-preference`.** tds-shared's clamp
  under `reduce` freezes a loop on its last keyframe; every loop has `0% == 100% ==` the static
  composition.
- **Every mark is nested:** `.auth-art__pose` (hover transition) → `.auth-art__in--*` (entrance) →
  `.auth-art__m--*` (ambient animation) → the drawn node (never moves). An animation beats any other
  declaration of the same property, so none of these can share an element.
- **The tilt is an SVG attribute on a group inside the animated sway group.** Orthogonal scenes tilt
  ≤ 10–12°, the rest ≤ 18°.
- **`spin` and `turn` pivot on `--auth-ox/oy`**, not `transform-box: fill-box`.
- Seeded values reach CSS as inline custom properties; `static-posture.test.ts` cross-checks names
  both ways, and every `var()` has an identity fallback.
- Measured 61 fps across all scenes (desktop Chrome, raster with ~50 marks); `will-change` stays absent.

## Interaction: hover and typing, never the cursor position

Both are inert under `reduce`.

- **No coordinate anywhere.** `static-posture.test.ts` fails on `clientX`, `getBoundingClientRect`,
  `requestAnimationFrame`, any `onPointer*` handler.
- **Hover → a seeded pose** per layer (`POSE_BANDS` disjoint: wash least, accents most; structure
  moves against the others; wash and spanning marks never rotate; stagger ≤ `POSE_DELAY_MAX`).
  Hairlines (`--line`) thicken and brighten, accents scale, raised tiles lift.
- **Hover rules sit inside `@media (hover: hover) and (pointer: fine)`**.
- **Each mark's alpha is a presentation attribute**, and `auth-art-pulse` rests at 1 and multiplies.
- **Typing → the scene's own answer + energy.** No generic burst (the old ripple pool is gone): the
  generator emits `Artwork.keys`, a pool of `Keystroke`s fired round-robin, each a few `KeyPart`s
  (`act` on a mark index). Vocabulary per scene, pinned distinct in `artwork.test.ts`:

  | Scene | Answer |
  |---|---|
  | `constructs` | a tile presses into its shadow; rings flick |
  | `circuits` | a signal runs down a conduit; the chip presses / the node flares on arrival (`ARRIVAL_MS`) |
  | `orbits` | the core presses and its arcs flick; a rider whirls once round its orbit |
  | `strata` | a band is shoved along its axis |
  | `raster` | a cell lights, its four neighbours a beat later |
  | `mosaic` | a tile spins a full turn (shadow stays down-right) |
  | `ribbons` | a strip flutters |
  | `measure` | the tape pays out one major unit (5 ticks, so the snap back is invisible); a cross turns 90°; the brand bar presses |

  `LoginArtwork.tsx` (`fire`) animates only `rotate`, `scale` and `translate` (individual properties
  that compose outside the loops' `transform`), on the motion groups or the entrance group, via
  Web Animations (optional-called; jsdom has none). Every keyframe set ends at rest; rate floor
  110 ms. `--auth-energy` (decays ~900 ms after the last key) only drives the breathe.
- **Reduced motion is gated in JS too** (`matchMedia` live, no typing subscription).

## The typing signal (`src/lib/artworkSignal.ts`)

Form and artwork are separate React roots, so a `window` CustomEvent is the bus. Each field calls
`signalTyping()` explicitly. **A new form must call it.** The event carries **no payload**.

## Verify in a browser, across several reloads

`npm run build && npx astro preview`, then drive it with `playwright-core` (`channel: "chrome"`):

- read `data-scene` off the `<svg>` to be sure you saw all eight scenes, in both page themes;
- compare `getComputedStyle(...).transform` on `.auth-art__pose` at two cursor positions inside the
  panel (identical), `translate` on `.auth-art__raise` hovered, and `document.getAnimations()`
  (script `Animation`s only) after a keystroke in each scene;
- check `document.getAnimations()` under `reducedMotion: "reduce"` (none on the artwork).
