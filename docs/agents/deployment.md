# Environment, setup and deployment

## Env

| Var | Default | Purpose |
|---|---|---|
| `PUBLIC_AUTH_API_URL` | `https://api.tracht-digital.de/auth` | Auth API base (login, me, password) |

This is the **build-time fallback**; the `/install` wizard can override it at runtime without a
rebuild (`authBase()` in `src/lib/auth.ts`). For a full local flow, run a product with
`PUBLIC_LOGIN_URL` pointed at this dev server.

## `/install` wizard

Every production build ships the shared setup wizard at `https://auth.tracht-digital.de/install`: a
React island from `tds-shared-pkg/src/install/`, mounted by `src/pages/install.astro`. This domain runs
with **PHP disabled** (see `tds-gateway-api/DEPLOY-PLESK.md`), so it must work as a static file.

- It installs nothing (a browser can't write to the docroot). It verifies, generates
  `tds-runtime.json` for download, and confirms the placed file is served.
- **`Layout variant="plain"`**: a single centred column instead of the 384 px login column, and it
  writes `data-surface="panel"` so shared page primitives get geometry tokens (`.tds-card` rendered
  with `padding: 0` without a surface). Surface layers are scoped to the bare attribute, so the login
  page stays byte-identical.
- **`runtimeKeys` is `apiBase` + `authBase` only** (no `loginUrl`; this site is the login). The smoke
  test is `GET /.well-known/jwks.json` counting `keys`. Zero keys means `composer keygen` never ran on
  the API host: every login then fails signature verification while the endpoint answers 200.
- The `<link rel=preconnect>` in `Layout.astro` resolves before JS runs and keeps naming the baked host;
  on a re-pointed host that only wastes a socket.

## Deploy

| Workflow | Trigger | Result |
|---|---|---|
| `ci.yml` | pull request | gate |
| `dev.yml` | push to `main` | orphan `dev` branch, demo config, **not deployed** |
| `release.yml` | manual button | orphan `release` branch + `DEPLOY_WEBHOOK_URL` ping |

- Node 22, `npm install --no-package-lock`.
- Secrets: `NPM_TOKEN` (Packages install + branch push), `DEPLOY_WEBHOOK_URL` (release only).
- Backend prerequisite: `https://auth.tracht-digital.de` must be in `tds-auth-api`'s
  `CORS_ALLOWED_ORIGINS`.
