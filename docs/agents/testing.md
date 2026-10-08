# Testing

`npm run test:run` (vitest 4, TypeScript 6, jsdom) covers everything framework-agnostic; Astro
rendering stays on `npm run type-check`.

| Suite | Covers |
|---|---|
| `src/lib/redirect.test.ts` | The `?next=` allow-list incl. bypass shapes: userinfo (`https://app.tracht-digital.de@evil.example`), protocol-relative (`//evil.example`), look-alike hosts (`tracht-digital.de.evil.example`), non-http schemes, `http` on a production host. **Security-critical** |
| `src/lib/auth.test.ts` | `credentials: "include"` on every call; `{old, new}` password fields; an unparseable 200 still counts as success |
| `src/components/*.test.tsx` | Islands in jsdom with `~/lib/auth` mocked: on-mount SSO forwards without rendering the form; `mustChangePassword` from both sources; `?next=` into `/passwort`; post-login `/me` re-confirmation; status → message mapping. The password eye toggles (pointer and keyboard), stays shown after a release, masks again on submit and never submits; a 401 is a `role="alert"` with both fields `aria-invalid` until edited |
| `src/lib/artwork.test.ts` | The generator's **range**: 300 seeds per scene; all layers filled, paint order, bounded counts, no NaN, blur only on the wash, opacities in (0, 1), overhang rules; determinism; 300 distinct frames; all eight scenes drawn, none over a quarter; spanning ends past OVERHANG, anchors near the frame, hard shadows only under solid shapes, ≤ 3 field hues + gold; circuit board and brand bar move as one, mosaic turns by right angles; entrance kinds (draw only measured strokes, no pop on spanning fills); keystroke pools: per-scene vocabularies distinct, every part aimed at a mark that can perform it, bounded travel/delay, whole-turn flips and whirls, tape advance = one major unit; motion amplitudes, periods, phases (signals too), counter-rotation, pivots; hover pose bands disjoint and signed, wash and spanning marks never rotate, stagger capped |
| `src/lib/artworkSignal.test.ts` | Delivery, unsubscribe, **no payload**, no-op without `window` |
| `src/components/LoginArtwork.test.tsx` | Client-side generation with seed and scene in the markup; pose → entrance → motion nesting; stage resolves under `data-theme="dark"`; hard shadow offset outside its motion group, face raised; alpha as presentation attribute; reduced motion gates the imperative half; typing energy rises and decays; a keystroke animates only marks of the composition, different ones on consecutive keys; **a pointer moving over the stage writes nothing** |
| `tests/static-posture.test.ts` | Silent traps: noindex + `Disallow: /` + no sitemap, `@tailwindcss/postcss`, fonts as JS imports, `tdsViteBuild`; artwork reduced-motion gate, `--auth-*` names in sync both ways, user-space filter region, tilt nesting, no blend mode, static shadow offset + `translate` lift, no pointer reads, hover media query, pose as transition, overridable alpha; form-first DOM order |

`static-posture.test.ts` asserts against **comment-stripped** sources, because the configs document
these traps in prose. Its `ruleBody()` helper extracts a rule from comment-stripped CSS; several
selectors are named in the prose above their own rule.

## Gotchas

- **jsdom's `location.replace` can't be spied on** (`Location` is [Unforgeable]).
  `src/test-support/location.ts` swaps the whole `window.location` for a stub.
- **Auto-cleanup is off** (`globals: false`); each island suite calls `cleanup()` in `afterEach`.
- Use `userEvent.setup({ delay: null })`; the default typing speed costs ~700 ms per test.

## `npm run test:docker`

`Dockerfile.test` + `scripts/docker-test.mjs` rerun type-check, tests and build in
`node:22-bookworm-slim`, the runner's image. Without a lockfile, a dev box and CI may resolve different
native binaries (rolldown, lightningcss, sharp), so a green local run doesn't prove Linux is green.

- The Packages PAT comes from `$NPM_TOKEN` or `~/.npmrc` and is passed as a **BuildKit secret**; never
  an `ARG` / `ENV` (it would persist in image history).
- `.dockerignore` must keep the host `node_modules` out of the context.
