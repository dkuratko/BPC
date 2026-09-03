#!/usr/bin/env node
/**
 * `next build` with `output: "standalone"` produces `.next/standalone/`
 * containing a self-contained `server.js` and a pruned `node_modules` -- but
 * it does NOT copy the static assets or `public/`, since those are normally
 * served by a separate CDN/reverse proxy in front of `server.js`. The
 * Electron desktop build has no such proxy: `server.js` has to serve
 * everything itself, so this script copies the two directories it needs in.
 *
 * Run after `next build`, before `electron-builder` packages the app.
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const standaloneDir = path.join(root, ".next", "standalone");

if (!fs.existsSync(standaloneDir)) {
  console.error(
    'No .next/standalone directory found. Run "next build" first (next.config.ts sets output: "standalone").',
  );
  process.exit(1);
}

function copyIfExists(from, to) {
  if (!fs.existsSync(from)) {
    console.log(`(skipping ${path.relative(root, from)} -- does not exist)`);
    return;
  }
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
  console.log(`Copied ${path.relative(root, from)} -> ${path.relative(root, to)}`);
}

copyIfExists(path.join(root, ".next", "static"), path.join(standaloneDir, ".next", "static"));
copyIfExists(path.join(root, "public"), path.join(standaloneDir, "public"));

console.log("Standalone server is ready at .next/standalone/server.js");
