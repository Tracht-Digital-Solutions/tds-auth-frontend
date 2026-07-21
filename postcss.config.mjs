// Astro 6 ships Vite 7 with rolldown, which is incompatible with the
// @tailwindcss/vite plugin's expected resolver shape (withastro/astro#16542).
// The @tailwindcss/postcss variant runs Tailwind through PostCSS instead and
// sidesteps the rolldown plugin contract entirely. (Repo-wide convention — see
// CLAUDE.md: never reintroduce the Vite plugin.)
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
