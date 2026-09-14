#!/usr/bin/env node
// Appends a build-version query string to every relative ESM import (and to
// index.html's script/stylesheet tags) in a packaged site directory. Without
// this, a new deploy can silently keep being served from a browser's (or
// GitHub Pages' edge) stale cached copy of dist/*.js — there's no bundler
// here to give each file a content hash, so this is the substitute.
import fs from "node:fs";
import path from "node:path";

const siteDir = process.argv[2];
const version = process.argv[3] || String(Date.now());
if (!siteDir) {
  console.error("Usage: node cachebust.mjs <site-dir> [version]");
  process.exit(1);
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".js")) out.push(full);
  }
}

const jsFiles = [];
walk(path.join(siteDir, "dist"), jsFiles);

const importRe = /from\s+(["'])(\.[^"']+\.js)\1/g;
for (const file of jsFiles) {
  const src = fs.readFileSync(file, "utf8");
  const rewritten = src.replace(importRe, (_m, quote, p) => `from ${quote}${p}?v=${version}${quote}`);
  fs.writeFileSync(file, rewritten);
}

const indexPath = path.join(siteDir, "index.html");
let html = fs.readFileSync(indexPath, "utf8");
html = html.replace("dist/main.js", `dist/main.js?v=${version}`);
html = html.replace("styles/main.css", `styles/main.css?v=${version}`);
fs.writeFileSync(indexPath, html);

console.log(`Cache-busted ${jsFiles.length} JS file(s) and index.html with version "${version}".`);
