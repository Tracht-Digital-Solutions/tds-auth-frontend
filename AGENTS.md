# AGENTS.md — tds-auth-frontend

The **central login site** at `auth.tracht-digital.de`: the single login, password-change and
passkey UI for all products. A static Astro build (`output: "static"`, no Node on prod) and a
private, **noindex** surface. It is UI only; the identity backend is `tds-auth-api`. The admin
frontend, customer portal and public sites bounce logged-out visitors here and get them back
via `?next=`.

## Commands

```bash
npm install --no-package-lock   # needs a PAT with read:packages (NPM_TOKEN / ~/.npmrc)
npm run dev                     # astro dev; set PUBLIC_AUTH_API_URL for local work
npm run type-check              # astro check, 0 errors is the gate
npm run test:run                # vitest: lib, islands, artwork, posture guards
npm run test:docker             # same gate on Linux / Node 22 (Docker + PAT)
npm run build                   # → dist/ (the deployed artefact)
```

## Hard rules

- **`?next=` goes through the allow-list in `src/lib/redirect.ts`.** Security-critical; keep `redirect.test.ts` green.
- Every auth call sends `credentials: "include"`; the shared cookie **is** the session.
- Don't advertise which surfaces a login covers on the login page.
- Buttons inside the form are `type="button"` unless they submit. Buttons carry `.btn` **and** a `.btn-*` variant.
- The password eye is a toggle (`aria-pressed`), and every submit masks the password again.
- Keep the noindex posture: robots meta, `Disallow: /`, no sitemap.
- The artwork never reads the pointer's position; loops and interactions live inside the reduced-motion opt-in.
- Tailwind via `@tailwindcss/postcss`; `@source` for tds-shared after the `@import`s; fonts as JS imports.
- A new form must call `signalTyping()`.
- tds-shared is a minor-locked 0.x caret: validate a repin from a fresh install.

## Topic files

| File | Read before |
|---|---|
| [docs/agents/architecture.md](docs/agents/architecture.md) | Changing login flows, SSO, redirects, passwords, passkeys or the API client |
| [docs/agents/login-ui.md](docs/agents/login-ui.md) | Changing the login layout, form controls or page motion |
| [docs/agents/artwork.md](docs/agents/artwork.md) | Touching `artwork.ts`, `LoginArtwork.tsx`, the artwork CSS or the typing signal |
| [docs/agents/conventions.md](docs/agents/conventions.md) | Changing styles, fonts, build config or shared imports |
| [docs/agents/testing.md](docs/agents/testing.md) | Writing or changing tests |
| [docs/agents/deployment.md](docs/agents/deployment.md) | Env, the `/install` wizard, workflows or deploy |

Workspace rules: `../CLAUDE.md`. Cross-repo state: `../MIGRATION-STATUS.md`.
