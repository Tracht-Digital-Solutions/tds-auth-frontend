# AGENTS.md — tds-auth-frontend

_Read before non-trivial changes. Repo-wide conventions apply — see the root `CLAUDE.md`._

## What this is

`tds-auth-frontend` is the **central login site** for Tracht Digital Solutions, served at
`auth.tracht-digital.de`. It is a standalone static Astro site (`output: "static"`,
no SSR, no Node on prod) — a **private, noindex** surface (unlike the indexable
landingpage/blog/tools). It hosts the single login + password-change UI for *all*
products; the admin frontend, customer portal and tools site bounce logged-out visitors
here and get the user back via `?next=`.

It is **UI only** — the identity backend is `tds-auth-api` (a pure JSON API). There is
no login HTML in the API; every frontend renders its own. This site consolidates that UI
in one place.

## How it works

- **SSO is the shared cookie, not a token hand-off.** `tds-auth-api`'s `POST /login` sets
  the httpOnly `tds_session` cookie with `Domain=.tracht-digital.de`. A login performed
  here is therefore immediately valid on `management.` / `app.` / `tools.` — nothing is
  passed between sites. JS never reads the cookie; identity comes from `GET /me`.
- **On-mount SSO** (`LoginForm.tsx`): if a session already exists, the form never renders —
  the user is forwarded straight to the target.
- **The login page does NOT advertise the cross-surface session.** The lede used to read
  "Eine Anmeldung gilt für alle Bereiche (Panel, Portal und Tools)" — that sentence is
  removed on purpose (it tells an unauthenticated visitor which surfaces exist). The
  explanation now lives where a *logged-in* user can look it up: the frontend host's
  `/wiki` FAQ (`tds-core-frontend-pkg`) and the Live-Chat-Widget FAQ
  (`tds-ext-live-chat-cta-pkg`, seeded row `sso-scope`). Don't reintroduce it here.
- **`?next=` + open-redirect guard** (`src/lib/redirect.ts`): the frontends send an absolute
  return URL. Because it flows into `location.replace`, it is validated against an
  allow-list — `https://` on `tracht-digital.de` or any subdomain (plus `localhost` for
  dev). Anything else falls back to a role-based default (`isAdmin` → `management.`, else
  `app.`). **This is security-critical; `redirect.test.ts` pins it — keep it green.**
- **Forced password change**: a login that returns `mustChangePassword` (or a `/me` that
  reports it) is routed to `/passwort` before the redirect. `PUT /password` needs a valid
  session (min 12 chars, must differ), then rotates the session.
- **"30 Tage angemeldet bleiben"** is a checkbox that sends `remember: true`. It does not
  lengthen the session token — the API issues a second, rotating remember-me cookie and
  the panels trade it at `POST /refresh` (see `tds-auth-api`'s AGENTS.md for why a longer
  JWT would be a longer *non-revocable* credential). Nothing here needs to know that
  beyond passing the flag.
- **The password field can be read while the eye button is HELD DOWN** — and only then
  (`.auth-password__reveal` in `LoginForm.tsx`). It is a momentary control, not a toggle:
  press (pointer, or Enter/Space on the focused button) swaps the input to `type="text"`,
  release swaps it back. A plain click therefore leaves the field masked, which is the
  point — a toggle can be switched on and forgotten, and this page is often opened on a
  shared or projected screen.
  - **The release is watched on the `window`, not on the button.** A press can end
    anywhere: the pointer may be dragged off before it is lifted, a touch may turn into a
    scroll (`pointercancel`), or the window may lose focus with the finger still down. Any
    of those leaves the button's own `onPointerUp` unfired — and the failure mode is a
    plaintext password left standing on screen, with nothing to report it. The listeners
    are attached only while something is actually revealed; `LoginForm.test.tsx` pins each
    of those exits separately.
  - **`preventDefault()` on `pointerdown`** suppresses the focus the compatibility
    `mousedown` would move to the button, so the caret stays in the password field and
    typing can continue straight after the check. The keyboard path produces no pointer
    events at all and is handled by its own `keydown`/`keyup` pair (plus `onBlur`, for a
    key held while focus leaves).
  - **`type="button"`**, same trap as the passkey button below — a bare `<button>` inside
    the form would submit it, so checking the password would attempt a login.
  - The button is **not `.btn`**: that primitive's 44px min-height and padding would burst
    the 40px field it sits inside. Its geometry is local (`global.css`), and the
    `pointer: coarse` block grows it to 44×44 in step with `.field-boxed` — verified in
    Chrome, since a narrow desktop viewport does not match that query.
- **Passkeys** (`src/lib/passkeys.ts`, `/passkeys`): sign-in is **usernameless** — the
  request carries no `allowCredentials`, the authenticator offers its discoverable
  credentials for `tracht-digital.de` and the user picks one. So there is no email field
  in that flow and no way to probe whether an address has a passkey. The lib is the whole
  base64url ↔ `ArrayBuffer` translation layer; nothing else touches a buffer.
  - **The passkey button is `type="button"`.** Inside a `<form>` a bare `<button>`
    submits it, which would fire the password login at the same time.
  - **Dismissing the OS prompt is not an error.** `NotAllowedError`/`AbortError` mean the
    user decided; showing "Anmeldung fehlgeschlagen" there trains people to distrust the
    message. Only real failures get a message.
  - **Support is detected after hydration** (`useEffect`), never at build time — the
    static HTML is shared by every visitor, so the button would otherwise appear in
    browsers that cannot use it.
- **Login chrome** (`global.css`) is a **split shell**: the form on the left, a
  generated composition on the right (`≥ 62rem`); below that the artwork becomes a slim
  band above the form. It replaced a frosted card floating over an animated aurora —
  two competing focal points where the form never actually won.
  - **The form comes FIRST in the DOM.** Grid rows move the artwork above it on narrow
    screens without touching source order, so the keyboard always reaches the fields
    first. Swapping the two blocks to "fix" the mobile layout would silently make
    decoration the first tab stop; `static-posture.test.ts` pins the order.
  - **The artwork panel is a FIXED dark field in both themes** (`--color-surface-*`,
    which don't flip). It is the contrast partner to the form half — a light artwork
    panel beside a light form flattens the whole split.
  - The panel paints its own gradient in CSS, so the frame before the island has
    generated anything is a brand surface rather than a hole.

- **The artwork is generated per visit** (`src/lib/artwork.ts` + `components/LoginArtwork.tsx`).
  - **Nothing renders server-side, deliberately.** This is a static site: anything
    produced at build time would be the same picture for every visitor until the next
    deploy, and seeding it in the initial render instead would make the server's markup
    disagree with the client's on *every* load — a hydration mismatch by construction.
    Generating in an effect is the only variant that is both fresh and correct.
  - **Variety comes from a SCENE, drawn per visit.** Four archetypes (`SCENES`), each
    with its own shape vocabulary *and* its own motion vocabulary:

    | scene | wash (soft, back) | structure (crisp, middle) | accent (crisp, front) |
    |---|---|---|---|
    | `ribbons` | 4–7 curved bands, `drift` | 2–4 rings, `orbit` | 2–4 dots, `pulse` |
    | `orbits` | 2 wide blurred haloes, `drift` | 5–9 arc segments about 1–2 foci, `spin` | 3–5 dots, `pulse` |
    | `particles` | 2–3 blurred blobs, `drift` | 1–2 rings, `orbit` | 16–28 dots + hairlines, `pulse` |
    | `strata` | 6–10 parallel bands, `slide` | 3–5 cross-ticks, `slide` | 2–4 dots, `pulse` |

    Before them the generator only varied the parameters of one picture, so a visitor
    who reloaded saw the same thing again. **Every scene fills the same three layers**
    — that contract is what lets one set of blur filters, one `screen` blend and one
    depth read serve all four, and it is why adding a fifth scene is a generator change
    and nothing else.
  - **The shape model is two render kinds, not one type per scene.** A stroked `path`
    and a `circle` that is either stroked or filled cover every archetype, which keeps
    `LoginArtwork.tsx` a single loop with no per-scene branching. `Mark.spans` says
    whether a mark must leave the frame at both ends; `Mark.layer` is what the
    interaction rules key off.
  - **The generator is bounded, not free.** Anything random enough to be interesting is
    random enough to be ugly, so counts, curvature, thickness, opacity and palette are
    clamped; only the arrangement inside those ranges varies. One composition draws
    from **two or three** hues, never the full six — all of them at once reads as a
    colour test card. `artwork.test.ts` sweeps 300 seeds **per scene** against those
    bounds; left to the seed alone each scene would only get a quarter of the sweep.
  - **It is seeded and pure**, so a composition is reproducible from its number alone.
    That is what makes it testable, and what would let a specific one be pinned later.
    `generateArtwork(seed, scene)` forces the archetype for exactly that purpose, and
    consumes the scene draw either way so the forced form is the same random stream.
  - Colours are emitted as `var(--color-*)`, never literals — the artwork follows the
    theme for free instead of needing a second palette.
  - `mix-blend-mode: screen` on the SVG is load-bearing: it is what makes overlapping
    marks read as light rather than as stacked paint.
  - **The wash is soft on purpose and everything else is sharp on purpose.**
    `BLUR_LEVELS` (5/10/17) turns the wash into diffuse colour clouds; the crisp
    structure and accents on top are the depth contrast and the place the eye lands.
    Only the wash is ever filtered. Keep the largest radius **≤ 20** — it is what sizes
    the filter region (below).
  - **A thin mark cannot take the widest bucket.** The `strata` bands shipped with the
    ribbons' bucket weighting and rendered as a faint vertical gradient with a couple of
    stray ticks over it: a 3-unit stroke smeared over σ=17 has no peak left at all. A
    ribbon survives that blur because it is up to 24 wide *and* curved; a straight band
    is neither, so `bandMark` never draws bucket 2.
  - **Softer means DIMMER, not brighter** (`BLUR_ALPHA`). The intuition runs the other
    way: a wide Gaussian lowers a mark's peak, so it looks like it needs more ink.
    Measured, that is backwards — `screen` accumulates over *coverage*, and at radius 17
    one ribbon covers most of the canvas, so five of them lift the whole field instead
    of crossing in a few bright places. Compensating the peak took the panel's mean
    luminance from 44 to 59 and turned the dark half of the split into a pink wash.
    Judge any change to the blur or alpha ranges by **measuring mean luminance over
    several loads**, not by looking at one composition: every visit is a different seed,
    so one picture cannot tell "this build is too bright" from "that seed was".
  - **The blur filter region is `userSpaceOnUse`, not percentages.** A percentage region
    is a fraction of the path's *geometric* bbox — strokes excluded — and a nearly flat
    ribbon has almost no bbox height while its stroke is up to 24 wide. At these radii
    that clips the blur into a hard straight cut-off across the panel. The region also
    clips the filter's **input**, not just its output, so its margin has to let a pixel
    just inside the visible crop still reach every source pixel within ~3σ (51 units at
    the widest blur) — otherwise the outermost visible columns quietly lose part of
    their colour. It is sized from `OVERHANG` + half a stroke + 3σ.

- **The composition drifts, and every part of that is deliberate.**
  - **The motion is seeded too.** Drift offsets, periods, phase and direction all come
    out of `generateArtwork`, not out of `Math.random()` in the component — otherwise a
    composition is only half reproducible from its number and the sweep has nothing to
    bound. "Alive but not distracting" is a requirement, and a requirement that is not a
    number cannot be tested; `artwork.test.ts` pins the amplitudes and periods.
  - **`OVERHANG` is sized against the motion bounds, so the two move together.** Marks
    flagged `spans` run past both edges so no round stroke cap is ever visible. The trap
    is that the limiting case is not the drift — it is *rotation*: a tilt about the canvas
    centre swings the ends of a high or low mark **inward**, and at the original 20 units
    a ribbon starting near `y=5` could put its cap at roughly `x=5`, which the panel does
    show. Raising a drift amplitude means re-checking `OVERHANG` against the worst
    combination of tilt + sway + per-mark rotation + the hover pose, not just against the
    translation.
  - **The loops are opt-in under `no-preference`, and that is not decoration.**
    tds-shared's `base.css` clamps `animation-duration: 0.01ms` and
    `animation-iteration-count: 1` on `*` under `reduce`. That clamp is built for
    *entrance* animations, whose end state is the resting state. A **loop** left outside
    the opt-in block is therefore **not switched off** by it — it runs once, instantly,
    and freezes on its final keyframe. Every ambient keyframe set additionally has
    `0% == 100% ==` the static composition, so even that failure mode lands somewhere
    correct.
  - **The tilt stays an SVG attribute on a group INSIDE the animated sway group.** A CSS
    transform animation on the tilt group would override the presentation attribute
    outright (author CSS always wins) and the tilt would vanish, with no error.
  - **Every mark is THREE nested elements, one job each** — `.auth-art__pose` (the hover
    transition) around `.auth-art__m--*` (the ambient animation) around the drawn node,
    which never moves. Both nestings are load-bearing: an animation beats any other
    declaration of the same property, so pose and motion cannot share an element; and the
    filter has to stay on the motionless child or the Gaussian is a per-frame recompute
    instead of a cached raster. Don't "simplify" this by collapsing them.
    Measured in Chrome against the built `dist/`: a flat 60 fps with **zero**
    frames over 32 ms at 1×, 4× and 6× CPU throttling (the same harness drops to 30 fps
    at 20×, so it does detect load). `will-change` is therefore deliberately absent —
    it would promote 4–7 layers underneath a `mix-blend-mode: screen` element, which is
    where engines fall off the blend fast path, for no measured gain. Not covered by that
    measurement: a weak **GPU** (CPU throttling doesn't emulate one) and **Firefox**,
    whose SVG filters are not always GPU-side.
  - **Seeded values reach CSS as inline custom properties** read by shared `@keyframes`.
    Inside `@keyframes`, a `var()` in a `transform` is substituted at computed-value time
    and is then constant for that element — which is what lets **one rule per motion
    kind** drive thirty differently-moving marks. A mistyped name makes the whole
    declaration invalid, so the shape simply never moves, silently; `static-posture.test.ts`
    cross-checks the names against `global.css` in both directions, and every `var()`
    carries an identity fallback.
  - **`spin` is the one motion that does not pivot on the canvas centre.** An arc segment
    turns on the centre of the circle it was cut from, carried as `--auth-ox/oy` in user
    units. The obvious `transform-box: fill-box` pivots on the arc's *bounding box*
    instead, which turns an orrery into tumbling debris. It shares `auth-art-orbit`'s
    keyframes — same rotation, different pivot; a second identical keyframe block would
    be dead weight, not documentation.

- **The composition answers HOVER and the keyboard — never the cursor's position.**
  Both responses are inert under `reduce`.
  - **It used to track the pointer, and that was the bug.** A rAF loop wrote normalised
    pointer offsets onto the stage to drive a three-layer parallax, and a 34rem disc was
    translated to sit under the crosshair. Neither was a *defect* — both worked — but the
    first turns the picture into a read-out of where the mouse is, and the second reads
    as a cursor decoration rather than as artwork. There is now **no coordinate anywhere
    in the artwork**, in JS or in CSS: `static-posture.test.ts` fails on `clientX`,
    `getBoundingClientRect`, `requestAnimationFrame`, any `onPointer*` handler, and on
    the `--auth-glow`/`__follow` selectors, because a design regression like this has no
    other symptom.
  - **Hover → a seeded pose.** Every mark sits in a `.auth-art__pose` wrapper that glides
    into a target offset/rotation/scale while the pointer is anywhere over the panel. One
    direction (a unit vector) is drawn per composition — per-mark directions cancel out
    into a shimmer; one axis reads as the picture leaning. Two things are assigned by
    LAYER rather than drawn, because "depth that is merely likely is depth some seeds
    don't have": the **sign** (`structure` moves against the other two — otherwise the
    response reads as the whole picture being dragged) and the **band** (`POSE_BANDS`:
    wash travels least, accents most, the three ranges **disjoint**). That separation IS
    the depth cue.
  - **A CSS `transition` is correct here, and the old note said the opposite.** It said so
    correctly: a parallax target moves every frame while the pointer does, so the
    transition is *restarted* every frame on every shape — **49 fps against 59** for the
    identical transforms driven from a rAF loop (Chrome, built `dist/`, 6× CPU
    throttling). None of that applies to a value that changes exactly twice per visit.
    The rAF loop, `FOLLOW_EASE`, `SETTLED` and `MAX_STEP_MS` are all gone with it.
  - **The stagger is capped low** (`POSE_DELAY_MAX`, 220 ms). It is what keeps thirty
    marks from snapping into place in unison — but the same delay applies on the way
    *back*, and a decoration still rearranging itself half a second after the pointer
    left reads as lag rather than as weight.
  - **A wash mark's pose never rotates.** Translation and outward scale cannot pull a
    spanning mark's overhang inside the frame; a rotation about the canvas centre swings
    the ENDS furthest and can. Same geometry budget `OVERHANG` is sized against.
  - **The hover rules sit inside `@media (hover: hover) and (pointer: fine)`.** A tap
    latches `:hover` on a touch screen until something else is tapped, so the composition
    would sit in its pose permanently with no `pointerleave` to bring it home — the same
    reason the old implementation ignored `pointerType: "touch"`, now expressed where it
    belongs. Nothing measures the panel any more either, so the old `NaN`-from-a-zero-
    sized-rect guard is simply not needed.
  - **Hover firms up the structure and never the wash.** Wash alpha is the one knob that
    blows the panel out under `screen` (see `BLUR_ALPHA`), so the wash answers with
    movement only; the structure thickens (`--auth-w` carries its resting width so the
    rule can scale it by a *factor* — these marks are 0.3–0.7 wide and an absolute target
    would thin half of them) and brightens, and the accents scale. Accents answer with
    **scale** rather than opacity because theirs is already driven by `auth-art-pulse`,
    and a running animation beats a transition outright — the declaration would be
    ignored with nothing to show for it.
  - **Each mark's alpha is a presentation attribute** (`stroke-opacity`/`fill-opacity`),
    not an `opacity` inline style on the group. Inline styles beat author CSS, so the
    structure's hover brightening would have been silently ignored. `auth-art-pulse`
    therefore rests at exactly **1** and multiplies, rather than naming an absolute
    opacity — which also means that under `reduce`, where no keyframe applies, the group
    is simply transparent and the mark's own value is the whole rendering.
  - **Typing → energy + a burst.** Each keystroke sets `--auth-energy` to 1 (decaying
    ~900 ms after the last one), which makes the whole composition inhale and the accents
    grow; and it fires **one expanding ripple** from a fixed pool of three
    seeded origins. The split is the point: a keystroke needs an answer inside a frame or
    the feedback is not attributable to it, but a per-keystroke *ambient* change would
    strobe while someone types a password. The ripple uses **Web Animations**, because a
    keystroke has to be able to re-fire a burst that is still running and CSS gives you
    that only by remounting the node (resetting its neighbours' ambient phase) or forcing
    a reflow. It is `Element.animate` optional-called — jsdom implements none.
  - **The typing signal crosses an island boundary** (`src/lib/artworkSignal.ts`): the
    form and the artwork are separate React roots, so a `window` CustomEvent is the only
    bus available — the same one tds-shared's toast host uses. It is an explicit
    `signalTyping()` call from each field rather than a `document`-level `input` listener
    in the artwork, so the artwork cannot react to things nobody decided it should (the
    remember-me checkbox, anything added later) and the coupling stays greppable. **The
    cost is that a new form must call it**; a form that forgets leaves the composition
    inert with nothing logged, so every island suite asserts its own emission.
  - **Reduced motion is gated in JS as well as CSS.** The keystroke bursts are Web
    Animations and no media query can stop those, so the component reads
    `matchMedia("(prefers-reduced-motion: no-preference)")`, keeps it live, and simply
    does not subscribe to the typing bus. The hover pose needs nothing there: it is pure
    CSS inside the same opt-in block.
  - **Judge any change to this in a browser, at several reloads.** Every visit is a
    different seed *and* a different scene now, so one screenshot cannot tell "this build
    is wrong" from "that composition was". `npm run build && npx astro preview`, then
    drive it with `playwright-core` (`channel: "chrome"`) — read `data-scene` off the
    `<svg>` to be sure you saw all four, compare `getComputedStyle(...).transform` on
    `.auth-art__pose` at two *different* cursor positions inside the panel (they must be
    identical), and check `document.getAnimations()` under `reducedMotion: "reduce"`.

## Gotchas (repo-wide conventions apply — see root CLAUDE.md)

- **`@source` for the shared package, or its islands render unstyled.** The shared React
  components are built from Tailwind utilities (`ThemeToggle` is
  `inline-flex w-9 h-9 rounded-full …`), and **Tailwind ignores `node_modules` by
  default**. Without the `@source` line in `global.css` those utilities are never
  generated: the toggle shipped as two raw stacked SVGs in the corner, with no error and
  no warning. It must sit **after** the `@import`s — `@source` before an `@import` is a
  build error. Same trap the frontend products carry (root CLAUDE.md).
- **Login inputs use `.field-boxed`, not `.field`.** `.field` is the underline variant;
  at rest it is a single hairline, which next to the browser's focus outline on the
  focused sibling made the form look half-rendered. Boxed is also what every panel
  settings form uses.

- **Tailwind v4 runs through `@tailwindcss/postcss`** (`postcss.config.mjs`), never the
  Vite plugin. Deleting that file silently ships unstyled output.
- **Fontsource fonts are JS imports in `Layout.astro`**, never CSS `@import` in
  `global.css` — `@tailwindcss/postcss` wouldn't rebase the woff2 URLs and every font 404s.
- **`vite.build` spreads `tdsViteBuild`** (from `tds-shared/astro`) — pins `cssTarget` so
  lightningcss keeps the header `backdrop-filter` prefix. Don't hand-author it back.
- **Astro inline `<script>`/`<style>` bodies are raw** — never wrap in `` {`...`} ``.
  The theme bootstrap depends on this.
- **noindex posture**: `public/robots.txt` = `Disallow: /`, the layout hard-codes
  `<meta name="robots" content="noindex,nofollow">`, and there is **no** sitemap
  integration. Don't add one.
- Design tokens/components come from `tds-shared-pkg` (`base.css` + `app.css` + `ThemeToggle`/
  `CookieNotice`/`Spinner`). Don't re-inline them.
- **The remember-me checkbox is `.auth-remember`, not a `.auth-form` label.** `.auth-form
  > label` (direct children only) styles field labels — stacked, 600-weight, muted. A
  wrapping `<label>` inherited that and made the option read as a third input, so it uses
  an explicit `id`/`htmlFor` pair inside a `<div>` instead. Keep the child combinator.
- **`.btn` AND `.btn-*` — both classes, always.** `.btn` carries the geometry (radius,
  padding, 44px touch target); `.btn-primary` contributes colour only. Every button on
  this site shipped with `.btn-primary` alone, which is why the login button rendered as
  a hard-edged rectangle with no padding. `global.css` may position a button
  (`.auth-form .btn { margin-top }`) but must never re-declare its geometry.

## Tests

`vitest` covers everything framework-agnostic; Astro's own rendering stays on
`npm run type-check`. Four groups, all run by `npm run test:run`:

- **`src/lib/redirect.test.ts`** — the `?next=` allow-list. **Security-critical, keep it
  green.** Beyond the happy paths it pins the bypass shapes: userinfo (`https://app.tracht-
  digital.de@evil.example`), protocol-relative (`//evil.example`), look-alike hosts
  (`tracht-digital.de.evil.example`), non-http schemes, and `http` on a production host.
- **`src/lib/auth.test.ts`** — the `tds-auth-api` client with `fetch` stubbed. Pins
  `credentials: "include"` on every call (the shared cookie IS the session — dropping it
  silently breaks SSO for every product), the `{old, new}` password body field names, and
  that an unparseable 200 body still counts as a successful login.
- **`src/components/*.test.tsx`** — both islands in jsdom via Testing Library, with
  `~/lib/auth` mocked at the module boundary. On-mount SSO (an existing session must
  forward *without* rendering the form), the `mustChangePassword` branch from both sources,
  `?next=` propagation into `/passwort`, the post-login `/me` re-confirmation, and every
  status→message mapping. `LoginForm.test.tsx` also pins the hold-to-reveal button from
  every direction a press can end (release on the button, release after dragging off,
  `pointercancel`, window blur, key up, blur while a key is held) plus the two shapes it
  must never take: a toggle, and a submit.
- **`src/lib/artwork.test.ts`** — the generator's *range*, not one picture, and it sweeps
  300 seeds **in each of the four scenes**: every seed produces a composed frame (all
  three layers filled, marks handed over in paint order, bounded counts, no NaN in a
  path, a blur index that resolves and only on the wash, opacities strictly between 0 and
  1, spanning marks overhanging both edges so no stroke cap shows *and* non-spanning ones
  staying inside the crop), the same seed always produces the same frame, and 300 seeds
  produce 300 distinct ones — a PRNG wired up wrongly still passes the first two checks
  and renders the identical picture forever. It also pins that **all four scenes actually
  get drawn**, and that none takes more than half the draws. It bounds the **motion**:
  amplitudes and periods per motion kind, a negative-but-sub-cycle phase on every mark,
  counter-rotating consecutive turns, spin pivots inside the picture, and the alpha
  ceiling that keeps `screen` from washing the panel out. Those numbers are how "ambient,
  not animated" is enforced — a five-second cycle passes every other check here. The
  **hover pose** is bounded the same way: the three travel bands stay disjoint and
  correctly signed for every seed (that separation IS the depth cue), the wash pose never
  rotates, scale is outward-only, and the stagger stays under its ceiling.
- **`src/lib/artworkSignal.test.ts`** — the form → artwork bus. Delivery, unsubscribe (a
  handler that outlives its island is the same silence with a leak attached), that the
  event carries **no payload** (a password field emits it too, so "just the length" is
  still the wrong instinct), and that it no-ops without a `window`.
- **`src/components/LoginArtwork.test.tsx`** — the interaction wiring, not the looks: the
  composition generated client-side with its seed *and scene* in the markup, every mark
  wrapped in a pose group inside a motion group (collapsing the two is silent — an
  animation beats the pose transition outright), each mark's alpha as a presentation
  attribute rather than an inline group `opacity`, reduced motion gating the imperative
  half, and the typing energy rising and decaying. Its own `describe` block pins the
  regression this whole design exists to prevent: **a pointer moving over the stage must
  write nothing to it**, there must be no glow element, and nothing may measure the panel.
- **`tests/static-posture.test.ts`** — the AGENTS.md traps that fail *silently* (build stays
  green, production quietly breaks): noindex meta + `Disallow: /` + no sitemap, Tailwind via
  `@tailwindcss/postcss`, Fontsource as JS imports, the `tdsViteBuild` spread. It reads the
  source files, so negative assertions run against comment-stripped config — the configs
  *document* these traps in prose and a naive match would fire on the warning text. For the
  artwork it pins the reduced-motion gate (every looping keyframe **and** every
  interaction rule inside the opt-in block, none outside it), the `--auth-*` custom
  properties agreeing between `LoginArtwork.tsx` and `global.css` in both directions, the
  user-space filter region, the tilt group nesting, the `screen` blend, and the shapes
  that are invisible in a screenshot: **nothing reads the pointer's position**, the hover
  rules sit behind `@media (hover: hover) and (pointer: fine)`, the pose is a
  `transition` on its own group with no `animation` on it, and each mark's alpha stays
  overridable. Its `ruleBody()` helper extracts a rule from the comment-stripped CSS —
  several of these selectors are *named in the prose above their own rule*, so a naive
  `indexOf` slice asserts against the explanation instead of the code.

Two testing gotchas worth knowing before you extend them:

- **jsdom's `location.replace` cannot be spied on** (`Location` is [Unforgeable]), but
  `window.location` itself is a configurable accessor. `src/test-support/location.ts` swaps
  the whole object for a stub with a controllable `search`/`origin` and a `vi.fn()` replace.
- **Auto-cleanup is off** (`globals: false`), so each island suite calls Testing Library's
  `cleanup()` itself in `afterEach`. `userEvent.setup({ delay: null })` — the default
  simulates human typing speed and costs ~700 ms per test.

**`npm run test:docker`** (`Dockerfile.test` + `scripts/docker-test.mjs`) reruns
type-check + tests + build inside `node:22-bookworm-slim`, the runner's image. It exists
because the repo installs with `--no-package-lock` (the committed lockfile is
Windows-generated and win32-only), so a dev box and CI can resolve *different* native
binaries for rolldown/lightningcss/sharp — a green local run does not prove the Linux
build is green. The Packages PAT is read from `$NPM_TOKEN` or `~/.npmrc` and passed as a
**BuildKit secret**; never move it to an `ARG`/`ENV`, which would persist in the image
history. `.dockerignore` must keep the host `node_modules` out of the context — otherwise
it shadows the Linux install and the whole point is lost.

## Commands

```bash
npm install --no-package-lock   # needs a GitHub PAT with read:packages (NPM_TOKEN / ~/.npmrc)
npm run dev                     # astro dev
npm run type-check              # astro check — 0 errors is the gate
npm run test:run                # vitest — lib + both islands + posture guards
npm run test:docker             # the same gate on Linux/Node 22 (needs Docker + the PAT)
npm run build                   # → dist/ (the deployed artifact)
```

Set `PUBLIC_AUTH_API_URL` for local dev (default is the prod gateway). To exercise the
full flow locally, run a frontend with `PUBLIC_LOGIN_URL` pointed at this dev server.

## Env

| Var | Default | Purpose |
|---|---|---|
| `PUBLIC_AUTH_API_URL` | `https://api.tracht-digital.de/auth` | Auth API base (login / me / password) |

## Deploy

Two-track: `dev.yml` (push to main → orphan `dev` branch, demo config, **not** deployed) and
`release.yml` (manual button → orphan `release` branch + `DEPLOY_WEBHOOK_URL` ping). `ci.yml`
is the PR gate. Node 22, `npm install --no-package-lock`. Secrets: `NPM_TOKEN` (Packages
install + branch push) and `DEPLOY_WEBHOOK_URL` (release only). Backend prerequisite:
`https://auth.tracht-digital.de` must be in `tds-auth-api`'s `CORS_ALLOWED_ORIGINS`.
