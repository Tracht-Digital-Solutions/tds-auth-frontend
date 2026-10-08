# Login UI

## Split shell (`global.css`)

The form sits left and a generated composition right (≥ 62rem). Below that, the artwork becomes a
slim band above the form.

- **The form comes first in the DOM.** Grid rows move the artwork above it on narrow screens without
  changing source order, so the keyboard reaches the fields first. `static-posture.test.ts` pins the
  order.
- **The artwork panel is a fixed dark field in both themes** (`--color-surface-*`, which don't flip).
  It is the contrast partner to the form half.
- The panel paints its own flat navy ground, so the frame before the island generates anything is a
  brand surface, not a hole.
- **The form half carries `.tds-wash`** (tds-shared ≥ 0.23.0). Put it on `.auth-panel`, not
  `.auth-page`; on the page it would run under the artwork half, which owns its ground.
- **`.tds-brandbar--sm` sits under the wordmark**, spaced by `.auth-brand__bar` (margin only). It is
  the page's only ornament.

## Password eye (`.auth-password__reveal` in `LoginForm.tsx`)

A **toggle** (2026-10-09, asked for; it replaced hold-to-reveal): one press shows the password, the
next hides it. `aria-pressed` carries the state under one stable name, "Passwort anzeigen".

- **Every submit masks it again**, so a shown password never carries on into the next attempt.
- **`preventDefault()` on `pointerdown`** keeps focus (and the caret) in the password field; the
  click still fires. Enter and Space reach it as a native button click.
- **`type="button"`**, or checking the password would submit the form.
- **Not `.btn`**: the primitive's 44 px min-height would burst the 40 px field. Geometry is local;
  the `pointer: coarse` block grows it to 44 × 44 alongside `.field-boxed`.

## Form controls

- **Errors announce and shake.** The error pill is `role="alert"`; a 401 sets `aria-invalid` on both
  fields until one is edited. tds-shared's `errorBounceScript` (inline in `Layout.astro`) shakes the
  pill, the fields and the submit button as they turn on. The pill is cleared on every submit, so the
  same message failing twice shakes again.
- **Focused fields show no ring and no recoloured border**; the pressed-in well changes colour
  (tds-shared ≥ 0.49.6).
- **Inputs use `.field-boxed`**, not `.field` (the underline variant looked half-rendered next to a
  focus outline).
- **The remember-me checkbox is `.auth-remember`** with an explicit `id` / `htmlFor` inside a `<div>`.
  `.auth-form > label` (child combinator) styles field labels; a wrapping label made the option read
  as a third input. Keep the child combinator.
- **A navy button never casts a navy shadow.** `--tds-shadow-ink` is the brand navy, so under
  `.btn-primary` the offset fused into one slab; the filled button re-points it to
  `--color-accent-pink` (both themes). The ghost button keeps the navy ink.
- **Buttons carry `.btn` and a `.btn-*` variant.** `.btn` is geometry, `.btn-primary` colour only.
  `global.css` may position a button (`.auth-form .btn { margin-top }`) but never re-declare its
  geometry.

## Page motion is native (tds-shared ≥ 0.38.6)

`LoginForm` is `client:load` on the page whose LCP it is. Shape changes (the session-check spinner
handing over to the form, an error pushing fields down) run through tds-shared's
`transitionUpdate` (`reshape()`): spinner and form share the view-transition name `auth-login`, so
the browser grows one into the other. Pages cross-fade via `page-transitions.css`. LCP is set by the
cookie notice.
