// Favicon step for blog.theborggroup.com
// Runs on every Netlify deploy (see netlify.toml), first in the build, so every page —
// including brand-new posts written by the nightly pipeline — gets the favicon links in <head>.
// The icon files live in the repo root (favicon.ico, favicon-32.png, favicon-48.png,
// favicon-192.png, favicon-512.png, apple-touch-icon.png) and are published as-is.
// Safe to run repeatedly: a page that already has the links is left alone.

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, sep } from "node:path";

const ROOT = process.cwd();
const LINKS = [
  '<link rel="icon" href="/favicon.ico" sizes="any">',
  '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">',
  '<link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png">',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
];

const ICONS = ["favicon.ico", "favicon-32.png", "favicon-48.png", "favicon-192.png", "favicon-512.png", "apple-touch-icon.png"];
for (const f of ICONS) {
  if (!existsSync(join(ROOT, f))) console.warn(`apply-favicon: missing ${f} in the repo root`);
}

function listHtml(dir) {
  const full = join(ROOT, dir);
  if (!existsSync(full)) return [];
  const out = [];
  for (const name of readdirSync(full)) {
    const p = join(full, name);
    if (statSync(p).isDirectory()) out.push(...listHtml(join(dir, name)));
    else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

const pages = [
  join(ROOT, "index.html"),
  ...listHtml("category").filter((f) => f.endsWith(`${sep}index.html`)),
  ...listHtml("posts"),
].filter(existsSync);

let updated = 0;
const skipped = [];
for (const file of pages) {
  const html = readFileSync(file, "utf8");
  if (html.includes('href="/favicon.ico"')) continue; // already has them
  if (!/<\/head>/i.test(html)) { skipped.push(file); continue; }
  const next = html.replace(/<\/head>/i, `  ${LINKS.join("\n  ")}\n</head>`);
  writeFileSync(file, next);
  updated++;
}
console.log(`Favicon step: ${pages.length} pages checked, ${updated} updated.`);
if (skipped.length) console.warn(`Favicon step: no </head> found in ${skipped.length} page(s): ${skipped.join(", ")}`);
