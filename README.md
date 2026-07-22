# tds-auth-frontend

Central login for **Tracht Digital Solutions** — `auth.tracht-digital.de`.

A standalone static Astro site that hosts the single sign-on **login** and
**password-change** UI for every product (admin frontend, customer portal, tools). It is a
private, `noindex` surface. Identity is handled by `tds-auth-api`; this repo is UI only.

Because `tds-auth-api` sets the session cookie with `Domain=.tracht-digital.de`, one login
here is valid across all `*.tracht-digital.de` frontends — no token hand-off. The frontends
redirect logged-out visitors to `auth.tracht-digital.de/?next=<return URL>`; this site
logs them in and sends them back (the `next` value is validated against a
`*.tracht-digital.de` allow-list to prevent open redirects).

## Setup

`@tracht-digital-solutions/*` packages live on **GitHub Packages**, so `npm install` needs
a classic PAT with `read:packages` (SSO-authorized for the org), provided via `~/.npmrc` or
the `NPM_TOKEN` env var the repo `.npmrc` references. `GITHUB_TOKEN` can't read
`tds-shared-pkg` cross-repo.

```bash
npm install --no-package-lock
cp .env.example .env       # point PUBLIC_AUTH_API_URL at your auth API (default: prod gateway)
npm run dev                # astro dev
npm run type-check         # astro check (0-error gate)
npm run test:run           # vitest — the redirect allow-list guard
npm run build              # → dist/
```

## Structure

```
src/
  layouts/Layout.astro          # noindex chrome, theme bootstrap, brand card
  pages/index.astro             # login page  (+ LoginForm island)
  pages/passwort.astro          # password change (+ PasswordChangeForm island)
  pages/404.astro
  components/LoginForm.tsx       # login + on-mount SSO + forced-change branch
  components/PasswordChangeForm.tsx
  lib/auth.ts                    # tds-auth-api client (login / me / password)
  lib/redirect.ts                # next allow-list + role-based default  (security-critical)
  lib/redirect.test.ts
  styles/global.css              # tds-shared-pkg base+app + local login chrome
public/robots.txt                # Disallow: /
```

## Deploy

`dev.yml` builds every push to `main` → orphan `dev` branch (not deployed). `release.yml`
is the manual button → orphan `release` branch + deploy webhook. Point
`auth.tracht-digital.de` at the `release` branch. See `AGENTS.md` for the full recipe and
the required `tds-auth-api` CORS entry.
