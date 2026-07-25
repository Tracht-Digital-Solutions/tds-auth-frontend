#!/usr/bin/env node
/**
 * `npm run test:docker` — run the full CI gate (type-check + tests + build)
 * inside the same Linux/Node 22 image the GitHub runner uses.
 *
 * Why this exists: the frontends install with `--no-package-lock` because the
 * committed lockfile is Windows-generated, so the dev box and the runner can
 * silently resolve *different* native binaries (rolldown, lightningcss, sharp).
 * A green local run is therefore not proof the Linux build is green. This gives
 * that proof without pushing a branch.
 *
 * The GitHub Packages token is resolved from $NPM_TOKEN, else from the
 * `//npm.pkg.github.com/:_authToken=` line in ~/.npmrc, and handed to the build
 * as a BuildKit secret — never an ARG/ENV, which would persist in the image.
 *
 * Written in Node rather than shell so it runs identically from PowerShell,
 * Git Bash and CI.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const IMAGE = "tds-auth-frontend-test";

/** The Packages token, from the environment or the user's ~/.npmrc. */
function resolveToken() {
  if (process.env.NPM_TOKEN) return process.env.NPM_TOKEN.trim();
  try {
    const npmrc = readFileSync(join(homedir(), ".npmrc"), "utf8");
    const match = npmrc.match(/^\/\/npm\.pkg\.github\.com\/:_authToken\s*=\s*(.+)$/m);
    if (match) return match[1].trim();
  } catch {
    /* no ~/.npmrc — fall through to the error below */
  }
  console.error(
    [
      "No GitHub Packages token found.",
      "",
      "@tracht-digital-solutions/* installs from GitHub Packages, so the container",
      "needs a classic PAT with read:packages (SSO-authorized for the org).",
      "",
      "Set it for this run:",
      "  PowerShell:  $env:NPM_TOKEN = 'ghp_...'; npm run test:docker",
      "  bash:        NPM_TOKEN=ghp_... npm run test:docker",
      "",
      "or add it once to ~/.npmrc:",
      "  //npm.pkg.github.com/:_authToken=ghp_...",
    ].join("\n"),
  );
  process.exit(1);
}

/** Run a command, inheriting stdio; exit this process if it fails. */
function run(command, args, env) {
  console.log(`\n$ ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
    shell: process.platform === "win32", // docker.exe resolution on Windows
  });
  if (result.error) {
    console.error(`\nFailed to run ${command}: ${result.error.message}`);
    if (result.error.code === "ENOENT") {
      console.error("Is Docker installed and on PATH? (`docker --version`)");
    }
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const token = resolveToken();

// BuildKit reads the secret from the child env, so the token never appears in
// the command line (visible to other users via the process list) or the image.
run(
  "docker",
  [
    "build",
    "--secret",
    "id=npm_token,env=NPM_TOKEN",
    "-f",
    "Dockerfile.test",
    "-t",
    IMAGE,
    ".",
  ],
  { NPM_TOKEN: token, DOCKER_BUILDKIT: "1" },
);

run("docker", ["run", "--rm", IMAGE]);

console.log("\nDocker gate passed: type-check + tests + build are green on Linux/Node 22.");
