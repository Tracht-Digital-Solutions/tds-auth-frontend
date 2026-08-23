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
npm run test:run           # vitest — lib + both islands + posture guards
npm run test:docker        # the whole gate again on Linux/Node 22 (see below)
npm run build              # → dist/
```

## Tests

`npm run test:run` covers everything that isn't Astro's own rendering:

| Suite | What it pins |
|---|---|
| `src/lib/redirect.test.ts` | the `?next=` allow-list — **security-critical** (userinfo `@`, protocol-relative, look-alike hosts, non-http schemes) |
| `src/lib/auth.test.ts` | the `tds-auth-api` client with `fetch` stubbed: `credentials: "include"` on every call, status pass-through, unparseable bodies |
| `src/components/*.test.tsx` | both islands in jsdom — on-mount SSO, the forced-password-change branch, `?next=` propagation, every error message, the in-flight/disabled states, and the hold-to-reveal password button (every way a press can end must re-mask) |
| `src/lib/artwork.test.ts` | the login artwork's generator over 300 seeds **× all four scenes**: composed geometry, bounded ambient motion, the hover-pose travel bands |
| `src/components/LoginArtwork.test.tsx` | the artwork's wiring — and that it writes **nothing** when the pointer moves over it (it answers hover, never the cursor's position) |
| `tests/static-posture.test.ts` | the traps that fail *silently*: noindex + no sitemap, Tailwind via PostCSS (not the Vite plugin), Fontsource as JS imports, the `tdsViteBuild` spread |

Astro rendering itself stays on `npm run type-check`.

**`npm run test:docker`** reruns type-check + tests + build inside the same
`node:22-bookworm-slim` image the GitHub runner uses. Worth it because the repo installs
with `--no-package-lock` (the committed lockfile is Windows-generated), so a dev box and
the runner can resolve *different* native binaries for rolldown/lightningcss/sharp — a
green Windows run is not proof the Linux build is green. It needs Docker running and the
same Packages token (`$NPM_TOKEN`, or the `//npm.pkg.github.com/:_authToken=` line in
`~/.npmrc`); the token is passed as a BuildKit secret and never lands in the image.

## Structure

```
src/
  layouts/Layout.astro          # noindex chrome, theme bootstrap, brand card
  pages/index.astro             # login page  (+ LoginForm island)
  pages/passwort.astro          # password change (+ PasswordChangeForm island)
  pages/404.astro
  components/LoginForm.tsx       # login + on-mount SSO + forced-change branch
  components/LoginForm.test.tsx
  components/PasswordChangeForm.tsx
  components/PasswordChangeForm.test.tsx
  lib/auth.ts                    # tds-auth-api client (login / me / password)
  lib/auth.test.ts
  lib/redirect.ts                # next allow-list + role-based default  (security-critical)
  lib/redirect.test.ts
  lib/site.ts / site.test.ts
  test-support/location.ts       # controllable window.location for the island tests
  styles/global.css              # tds-shared-pkg base+app + local login chrome
tests/static-posture.test.ts     # noindex / Tailwind / Fontsource / cssTarget guards
Dockerfile.test                  # the CI gate on Linux/Node 22  (npm run test:docker)
scripts/docker-test.mjs
public/robots.txt                # Disallow: /
scripts/sync-installer.mjs       # prebuild: copies the wizard into public/install/
                                 #   (generated, gitignored — see /install below)
```

## Setup auf dem Host: `/install`

Jeder Produktions-Build enthält einen Setup-Assistenten unter
`https://auth.tracht-digital.de/install`, der die ausgelieferte Site mit der API
verbindet — **ohne Rebuild**. Eine gewöhnliche Seite der Site: auf dieser Domain
ist PHP abgeschaltet, also läuft der Assistent vollständig im Browser.

Er installiert nichts: er prüft, erzeugt die `tds-runtime.json` zum
Herunterladen, und bestätigt danach, dass die abgelegte Datei wirklich
ausgeliefert wird. Details in `AGENTS.md`.


## Deploy

`dev.yml` builds every push to `main` → orphan `dev` branch (not deployed). `release.yml`
is the manual button → orphan `release` branch + deploy webhook. Point
`auth.tracht-digital.de` at the `release` branch. See `AGENTS.md` for the full recipe and
the required `tds-auth-api` CORS entry.
