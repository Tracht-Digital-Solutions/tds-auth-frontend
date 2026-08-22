/**
 * Copy the host-side setup wizard into `public/install/`.
 *
 * Runs as this repo's `prebuild` step, so `npm run build` always ships a
 * matching installer: Astro copies `public/` verbatim into `dist/`, the build
 * workflow force-pushes `dist/` onto the orphan `release` branch, and Plesk
 * pulls it. The wizard therefore reaches the host with no pipeline change.
 *
 * Source of truth is `@tracht-digital-solutions/tds-shared/install` — one
 * wizard and one proxy for all four sites, differing only in the profile copied
 * here as `profile.php`. Keeping four hand-maintained copies is exactly the
 * drift the gateway's `.env` writers taught this project to avoid.
 *
 * ### Two renames, both deliberate
 *
 * `install.php` lands as **`index.php`**, so the wizard answers at `/install/`
 * — the URL an operator guesses, rather than the `_setup` it used to live
 * under. `htaccess` lands as **`.htaccess`**: it is stored without the dot in
 * the package because npm's handling of dotfiles inside a published `files`
 * directory is the one thing here that would fail silently on all four sites at
 * once.
 *
 * That `.htaccess` is load-bearing, not decoration. `DirectoryIndex` is
 * INHERITED from the docroot, and the landingpage's `public/.htaccess` sets it
 * to `index.html` — so without the override `/install/` answers **403** there,
 * with nothing red in the build, the tests or any log. The other three sites
 * ship no docroot `.htaccess` at all and so inherit no `PassengerEnabled off`
 * either, which the same file supplies. This script is byte-identical in all
 * four repos; keep it that way.
 *
 * Usage: node scripts/sync-installer.mjs <profile-id>
 *
 * A missing package is a WARNING, not an error: `npm install` without registry
 * auth is a normal state for a contributor who only wants to run type-check,
 * and failing the build there would be a worse trade than shipping without the
 * optional installer.
 */

import { cpSync, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const profileId = process.argv[2];
if (!profileId) {
  console.error("[sync-installer] missing profile id (landingpage | blog | tools | auth)");
  process.exit(1);
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "node_modules", "@tracht-digital-solutions", "tds-shared", "install");
const target = join(root, "public", "install");

if (!existsSync(source)) {
  console.warn(
    `[sync-installer] ${source} not found — skipping. The deployed site will have no /install wizard.`,
  );
  process.exit(0);
}

const profile = join(source, "profiles", `${profileId}.php`);
if (!existsSync(profile)) {
  const available = readdirSync(join(source, "profiles")).join(", ");
  console.error(`[sync-installer] unknown profile "${profileId}". Available: ${available}`);
  process.exit(1);
}

// Wipe first: a profile renamed upstream would otherwise linger here forever,
// and two profile files in install/ is not a state the wizard can resolve.
rmSync(target, { recursive: true, force: true });

// And drop the pre-`/install` location, which this script no longer writes and
// so would never clean up on its own. Without this, every working tree and
// every `dist/` keeps serving the old wizard at the old URL indefinitely.
rmSync(join(root, "public", "_setup"), { recursive: true, force: true });

mkdirSync(target, { recursive: true });

for (const [from, to] of [
  ["install.php", "index.php"],
  ["proxy.php", "proxy.php"],
  ["htaccess", ".htaccess"],
]) {
  cpSync(join(source, from), join(target, to));
}
copyFileSync(profile, join(target, "profile.php"));

console.log(`[sync-installer] public/install ← tds-shared/install (profile: ${profileId})`);
