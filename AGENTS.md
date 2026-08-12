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
  - **The generator is bounded, not free.** Anything random enough to be interesting is
    random enough to be ugly, so ribbon count, curvature, thickness, opacity and palette
    are clamped; only the arrangement inside those ranges varies. One composition draws
    from **two or three** hues, never the full six — all of them at once reads as a
    colour test card. `artwork.test.ts` sweeps 300 seeds against those bounds.
  - **It is seeded and pure**, so a composition is reproducible from its number alone.
    That is what makes it testable, and what would let a specific one be pinned later.
  - Colours are emitted as `var(--color-*)`, never literals — the artwork follows the
    theme for free instead of needing a second palette.
  - `mix-blend-mode: screen` on the SVG is load-bearing: it is what makes overlapping
    ribbons read as light rather than as stacked paint.
  - **The ribbons are soft on purpose and the rings/sparks are sharp on purpose.**
    `BLUR_LEVELS` (5/10/17) turns the ribbons into diffuse colour clouds; the crisp
    rings and dots on top are the depth contrast and the place the eye lands. Keep the
    largest radius **≤ 20** — it is what sizes the filter region (below).
  - **Softer means DIMMER, not brighter** (`BLUR_ALPHA`). The intuition runs the other
    way: a wide Gaussian lowers a ribbon's peak, so it looks like it needs more ink.
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
    that clips the blur into a hard straight cut-off across the panel.

- **The composition drifts, and every part of that is deliberate.**
  - **The motion is seeded too.** Drift offsets, periods, phase and direction all come
    out of `generateArtwork`, not out of `Math.random()` in the component — otherwise a
    composition is only half reproducible from its number and the sweep has nothing to
    bound. "Barely noticeable" is a requirement, and a requirement that is not a number
    cannot be tested; `artwork.test.ts` pins the amplitudes and periods.
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
  - **Each ribbon `<path>` sits in its own static wrapper `<g>`; the wrapper is what
    moves.** The filter stays on the motionless child, so the Gaussian is a cached raster
    rather than a per-frame recompute. Don't "simplify" this by animating the path
    directly. Measured in Chrome against the built `dist/`: a flat 60 fps with **zero**
    frames over 32 ms at 1×, 4× and 6× CPU throttling (the same harness drops to 30 fps
    at 20×, so it does detect load). `will-change` is therefore deliberately absent —
    it would promote 4–7 layers underneath a `mix-blend-mode: screen` element, which is
    where engines fall off the blend fast path, for no measured gain. Not covered by that
    measurement: a weak **GPU** (CPU throttling doesn't emulate one) and **Firefox**,
    whose SVG filters are not always GPU-side.
  - **Seeded values reach CSS as inline custom properties** read by shared `@keyframes`.
    Inside `@keyframes`, a `var()` in a `transform` is substituted at computed-value time
    and is then constant for that element — which is what lets one rule drive seven
    differently-moving ribbons. A mistyped name makes the whole declaration invalid, so
    the shape simply never moves, silently; `static-posture.test.ts` cross-checks the
    names against `global.css` in both directions, and every `var()` carries an identity
    fallback.
  - The `opacity` presentation attribute on the sparks **stays** even though a keyframe
    animates it: under `reduce` no keyframe applies, so the attribute *is* the rendering,
    and the resting state matches the old static composition by construction.

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
  status→message mapping.
- **`src/lib/artwork.test.ts`** — the generator's *range*, not one picture: every seed
  produces a composed frame (bounded shape counts, no NaN in a path, a blur index that
  resolves, opacities strictly between 0 and 1, ribbons overhanging both edges so no
  stroke cap shows), the same seed always produces the same frame, and 300 seeds produce
  300 distinct ones — a PRNG wired up wrongly still passes the first two checks and
  renders the identical picture forever. It also bounds the **motion**: drift amplitudes
  and periods, a negative-but-sub-cycle phase on every shape, counter-rotating rings, and
  the alpha ceiling that keeps `screen` from washing the panel out. Those numbers are how
  "ambient, not animated" is enforced — a five-second cycle passes every other check here.
- **`tests/static-posture.test.ts`** — the AGENTS.md traps that fail *silently* (build stays
  green, production quietly breaks): noindex meta + `Disallow: /` + no sitemap, Tailwind via
  `@tailwindcss/postcss`, Fontsource as JS imports, the `tdsViteBuild` spread. It reads the
  source files, so negative assertions run against comment-stripped config — the configs
  *document* these traps in prose and a naive match would fire on the warning text. For the
  artwork it pins the reduced-motion gate (every looping keyframe inside the opt-in block,
  none outside it), the `--auth-*` custom properties agreeing between `LoginArtwork.tsx`
  and `global.css` in both directions, the user-space filter region, the tilt group nesting
  and the `screen` blend.

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
