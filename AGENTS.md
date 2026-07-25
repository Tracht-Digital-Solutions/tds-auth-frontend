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
- **`?next=` + open-redirect guard** (`src/lib/redirect.ts`): the frontends send an absolute
  return URL. Because it flows into `location.replace`, it is validated against an
  allow-list — `https://` on `tracht-digital.de` or any subdomain (plus `localhost` for
  dev). Anything else falls back to a role-based default (`isAdmin` → `management.`, else
  `app.`). **This is security-critical; `redirect.test.ts` pins it — keep it green.**
- **Forced password change**: a login that returns `mustChangePassword` (or a `/me` that
  reports it) is routed to `/passwort` before the redirect. `PUT /password` needs a valid
  session (min 12 chars, must differ), then rotates the session.
- **Login chrome** (`global.css`): the card sits on a frosted glass panel
  (`backdrop-filter`, brand-token background) over an **animated aurora** — three
  drifting radial-gradient orbs (`.auth-aurora__orb--1..3`) tinted with the flipping
  `--color-accent`/`--color-surface-navy`/`--color-primary` tokens so it reads right in
  light *and* dark. The orbs are `aria-hidden` decoration and fully stilled under
  `prefers-reduced-motion`. Layout is responsive (fluid card, `max-width: 26rem` tightens
  padding on phones).

## Gotchas (repo-wide conventions apply — see root CLAUDE.md)

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
- **`tests/static-posture.test.ts`** — the AGENTS.md traps that fail *silently* (build stays
  green, production quietly breaks): noindex meta + `Disallow: /` + no sitemap, Tailwind via
  `@tailwindcss/postcss`, Fontsource as JS imports, the `tdsViteBuild` spread. It reads the
  source files, so negative assertions run against comment-stripped config — the configs
  *document* these traps in prose and a naive match would fire on the warning text.

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
