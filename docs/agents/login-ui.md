# Login UI

## Split shell (`global.css`)

The form sits left and a generated composition right (≥ 62rem). Below that, the artwork becomes a
slim band above the form.

- **The form comes first in the DOM.** Grid rows move the artwork above it on narrow screens without
  changing source order, so the keyboard reaches the fields first. `static-posture.test.ts` pins the
  order.
- **The artwork panel is a fixed dark field in both themes** (`--color-surface-*`, which don't flip).
  It is the contrast partner to the form half.
- The panel paints its own CSS gradient, so the frame before the island generates anything is a
  brand surface, not a hole.
- **The form half carries `.tds-wash`** (tds-shared ≥ 0.23.0). Put it on `.auth-panel`, not
  `.auth-page`; on the page it would run under the artwork half, which owns its ground.
- **`.tds-brandbar--sm` sits under the wordmark**, spaced by `.auth-brand__bar` (margin only). It is
  the page's only ornament.

## Hold-to-reveal password (`.auth-password__reveal` in `LoginForm.tsx`)

The password is readable only **while the eye button is held**. It is momentary, not a toggle: this
page is often opened on shared or projected screens, and a toggle can be forgotten.

- **The release is watched on `window`**, not the button. A press can end anywhere: dragged off,
  `pointercancel` from a scroll, or window blur. Missing one leaves a plaintext password on screen.
  Listeners are attached only while something is revealed.
- **`preventDefault()` on `pointerdown`** keeps focus (and the caret) in the password field. The
  keyboard path has its own `keydown` / `keyup` pair plus `onBlur`.
- **`type="button"`**, or checking the password would submit the form.
- **Not `.btn`**: the primitive's 44 px min-height would burst the 40 px field. Geometry is local;
  the `pointer: coarse` block grows it to 44 × 44 alongside `.field-boxed`.

## Form controls

- **Inputs use `.field-boxed`**, not `.field` (the underline variant looked half-rendered next to a
  focus outline).
- **The remember-me checkbox is `.auth-remember`** with an explicit `id` / `htmlFor` inside a `<div>`.
  `.auth-form > label` (child combinator) styles field labels; a wrapping label made the option read
  as a third input. Keep the child combinator.
- **Buttons carry `.btn` and a `.btn-*` variant.** `.btn` is geometry, `.btn-primary` colour only.
  `global.css` may position a button (`.auth-form .btn { margin-top }`) but never re-declare its
  geometry.

## Page motion is native (tds-shared ≥ 0.38.6)

`LoginForm` is `client:load` on the page whose LCP it is. Shape changes (the session-check spinner
handing over to the form, an error pushing fields down) run through tds-shared's
`transitionUpdate` (`reshape()`): spinner and form share the view-transition name `auth-login`, so
the browser grows one into the other. Pages cross-fade via `page-transitions.css`. LCP is set by the
cookie notice.
