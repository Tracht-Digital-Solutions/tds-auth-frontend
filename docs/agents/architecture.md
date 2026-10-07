# Architecture

## Pages

| Route | Purpose |
|---|---|
| `/` | Login (`LoginForm` island) |
| `/passwort` | Password change (forced or voluntary) |
| `/passkeys` | Passkey management |
| `/install` | Shared host setup wizard (see [deployment.md](deployment.md)) |

## SSO is the shared cookie, not a token hand-off

`tds-auth-api`'s `POST /login` sets the httpOnly `tds_session` cookie with
`Domain=.tracht-digital.de`, so a login here is immediately valid on `management.`, `app.` and the
public sites. Nothing is passed between sites. JS never reads the cookie; identity comes from
`GET /me`.

- **On-mount SSO** (`LoginForm.tsx`): if a session exists, the form never renders; the user is
  forwarded to the target.
- **Don't advertise the cross-surface session.** The old lede told unauthenticated visitors which
  surfaces exist. The explanation lives where a signed-in user finds it: the host's `/wiki` FAQ
  (`tds-core-frontend-pkg`) and the live-chat FAQ (`tds-ext-live-chat-cta-pkg`, seeded row
  `sso-scope`).

## `?next=` and the open-redirect guard (`src/lib/redirect.ts`)

Products send an absolute return URL. It flows into `location.replace`, so it is validated against
an allow-list: `https://` on `tracht-digital.de` or any subdomain (plus `localhost` for dev).
Anything else falls back to a role-based default (`isAdmin` → `management.`, else `app.`).
**Security-critical;** `redirect.test.ts` pins it.

## Passwords

- A login returning `mustChangePassword` (or a `/me` reporting it) is routed to `/passwort` before
  the redirect.
- `PUT /password` needs a valid session (min 12 chars, must differ), then rotates the session. The
  body fields are `{old, new}`.
- **"30 Tage angemeldet bleiben"** sends `remember: true`. It doesn't lengthen the token; the API
  issues a rotating remember-me cookie that panels trade at `POST /refresh` (see `tds-auth-api`).

## Passkeys (`src/lib/passkeys.ts`)

- Sign-in is **usernameless**: no `allowCredentials`, so the authenticator offers its discoverable
  credentials for `tracht-digital.de`. There is no email field and no way to probe whether an
  address has a passkey.
- The lib is the whole base64url ↔ `ArrayBuffer` layer; nothing else touches a buffer.
- **The passkey button is `type="button"`**; a bare `<button>` in a form would also submit the
  password login.
- **Dismissing the OS prompt is not an error.** `NotAllowedError` / `AbortError` mean the user
  decided; only real failures get a message.
- **Support is detected after hydration** (`useEffect`). The static HTML is shared by every
  visitor, so build-time detection would show the button where it can't work.

## API client (`src/lib/auth.ts`)

- `credentials: "include"` on every call.
- An unparseable 200 body still counts as a successful login.
- The base is resolved per call through `authBase()`, preferring the operator's
  `tds-runtime.json` over the build-time `PUBLIC_AUTH_API_URL`.
