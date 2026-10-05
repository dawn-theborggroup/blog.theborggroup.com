// Canonical footer step for blog.theborggroup.com
// Runs on every Netlify deploy (see netlify.toml) before the SEO build, so every
// page — including brand-new posts written by the nightly pipeline — ends up with
// the same footer and Information Disclaimer used on communities.theborggroup.com.
//
// Single source of truth: scripts/footer.html. Change the footer THERE, once.
// It is safe to run repeatedly: running it twice gives the same result.

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const footer = readFileSync(join(ROOT, "scripts", "footer.html"), "utf8").trimEnd();

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

// Matches the older blog footer (site-footer) or a previously applied canonical footer (tbgf).
const footerRe = /<footer\b[^>]*\bclass=["'](?:site-footer|tbgf)["'][^>]*>[\s\S]*?<\/footer>/i;

let updated = 0;
const missing = [];
for (const file of pages) {
  const original = readFileSync(file, "utf8");
  if (!footerRe.test(original)) {
    missing.push(relative(ROOT, file).split(sep).join("/"));
    continue;
  }
  const html = original.replace(footerRe, () => footer);
  if (html !== original) {
    writeFileSync(file, html);
    updated++;
  }
}

if (missing.length) {
  console.warn(`WARNING: ${missing.length} page(s) have no footer to replace:`);
  for (const m of missing) console.warn(`  ${m}`);
}
console.log(`Footer build: ${pages.length} pages checked, ${updated} updated.`);
