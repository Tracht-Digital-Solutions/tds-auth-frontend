/** Site-wide metadata for the central login. */
export const site = {
  name: "Tracht Digital Solutions",
  origin: "https://auth.tracht-digital.de",
  description: "Zentrale Anmeldung für Tracht Digital Solutions.",
} as const;

/**
 * The legal pages, which live on the marketing domain.
 *
 * This surface had **no** legal links at all, which is the gap worth naming:
 * § 5 DDG wants the imprint "leicht erkennbar, unmittelbar erreichbar und
 * ständig verfügbar", and a page with no route to one at all fails the first
 * two outright. A visitor arriving here from a bookmark could not reach it.
 *
 * They point at `tracht-digital.de` rather than at copies hosted here. A
 * cross-domain imprint link is the weaker construction — the safest reading of
 * § 5 DDG is that every telemedia offer carries its own — but it is a link to a
 * page that exists, which is strictly better than the nothing that was here,
 * and it does not create a second text to keep in step with the first.
 */
export const legalLinks = {
  impressum: "https://tracht-digital.de/legal/impressum",
  datenschutz: "https://tracht-digital.de/legal/datenschutz",
} as const;
