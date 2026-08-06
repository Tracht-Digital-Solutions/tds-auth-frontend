// Tailwind v4 runs through PostCSS here, never @tailwindcss/vite.
//
// The original reason was Astro 6 / Vite 7 + rolldown being incompatible with
// the Vite plugin's resolver shape (withastro/astro#16542). That bug is GONE in
// Astro 7 / Vite 8 — the plugin was re-tested on 2026-08-06 and builds fine.
// The convention stays anyway, because both routes now work and this one keeps
// the platform on one setup with the posture tests that guard it. The only
// thing Astro 7 changed is the import specifier in global.css: it must name
// `tailwindcss/index.css`, not the bare package (see the note there).
//
// So: don't reintroduce the Vite plugin as a "fix" — nothing is broken. If it
// is ever adopted, do it deliberately across all six apps and update
// static-posture.test.ts, which asserts this file exists and that the plugin is
// absent from both the astro config and package.json.
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
