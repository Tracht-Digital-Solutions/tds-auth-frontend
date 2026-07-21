# AGENTS.md — tds-auth

_Read before non-trivial changes. Repo-wide conventions apply — see the root `CLAUDE.md`._

## What this is

`tds-auth` is the **central login site** for Tracht Digital Solutions, served at
`auth.tracht-digital.de`. It is a standalone static Astro site (`output: "static"`,
no SSR, no Node on prod) — a **private, noindex** surface (unlike the indexable
landingpage/blog/tools). It hosts the single login + password-change UI for *all*
products; the admin panel, customer portal and tools site bounce logged-out visitors
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
- **`?next=` + open-redirect guard** (`src/lib/redirect.ts`): the panels send an absolute
  return URL. Because it flows into `location.replace`, it is validated against an
  allow-list — `https://` on `tracht-digital.de` or any subdomain (plus `localhost` for
  dev). Anything else falls back to a role-based default (`isAdmin` → `management.`, else
  `app.`). **This is security-critical; `redirect.test.ts` pins it — keep it green.**
- **Forced password change**: a login that returns `mustChangePassword` (or a `/me` that
  reports it) is routed to `/passwort` before the redirect. `PUT /password` needs a valid
  session (min 12 chars, must differ), then rotates the session.

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
- Design tokens/components come from `tds-shared` (`base.css` + `app.css` + `ThemeToggle`/
  `CookieNotice`/`Spinner`). Don't re-inline them.

## Commands

```bash
npm install --no-package-lock   # needs a GitHub PAT with read:packages (NPM_TOKEN / ~/.npmrc)
npm run dev                     # astro dev
npm run type-check              # astro check — 0 errors is the gate
npm run test:run                # vitest (redirect allow-list guard)
npm run build                   # → dist/ (the deployed artifact)
```

Set `PUBLIC_AUTH_API_URL` for local dev (default is the prod gateway). To exercise the
full flow locally, run a panel with `PUBLIC_LOGIN_URL` pointed at this dev server.

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
