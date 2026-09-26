// SEO build step for blog.theborggroup.com
// Runs on every Netlify deploy (see netlify.toml), so every new post is handled
// automatically — nothing has to remember to update the sitemap by hand.
//
// What it does, every deploy:
//   1. Gives every page one absolute canonical URL (removes duplicates).
//   2. Points internal post links at the canonical ".html" address.
//   3. Rebuilds sitemap.xml from the posts and category pages that exist.
//   4. Writes robots.txt pointing Google and AI crawlers at the sitemap.
// It is safe to run repeatedly: running it twice gives the same result.

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SITE = "https://blog.theborggroup.com";
const ROOT = process.cwd();

const toUrlPath = (file) => relative(ROOT, file).split(sep).join("/");

// Page file -> its one canonical address.
function canonicalFor(relPath) {
  if (relPath === "index.html") return `${SITE}/`;
  if (relPath.endsWith("/index.html")) return `${SITE}/${relPath.slice(0, -"index.html".length)}`;
  return `${SITE}/${relPath}`;
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

const postFiles = listHtml("posts").sort();
const categoryFiles = listHtml("category").filter((f) => f.endsWith(`${sep}index.html`)).sort();
const homeFile = join(ROOT, "index.html");
const pages = [homeFile, ...categoryFiles, ...postFiles].filter(existsSync);

const postSlugs = new Set(postFiles.map((f) => f.split(sep).pop().replace(/\.html$/, "")));

const escapeXml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

let changed = 0;
const sitemapEntries = [];

for (const file of pages) {
  const rel = toUrlPath(file);
  const canonical = canonicalFor(rel);
  const original = readFileSync(file, "utf8");
  let html = original;

  // 1. One absolute canonical tag.
  const canonicalTag = `<link rel="canonical" href="${canonical}">`;
  const canonicalRe = /<link\s+[^>]*rel=["']canonical["'][^>]*>\s*/gi;
  if (canonicalRe.test(html)) {
    let first = true;
    html = html.replace(canonicalRe, (m) => {
      if (!first) return "";
      first = false;
      const trailing = m.match(/\s*$/)[0];
      return canonicalTag + trailing;
    });
  } else {
    html = html.replace(/<\/head>/i, `${canonicalTag}\n</head>`);
  }

  // Keep og:url in step with the canonical.
  html = html.replace(
    /(<meta\s+property=["']og:url["']\s+content=["'])[^"']*(["'])/i,
    `$1${canonical}$2`
  );

  // 2. Internal post links -> canonical .html address (only for posts that exist).
  html = html.replace(
    /(href=)(["'])(https:\/\/blog\.theborggroup\.com)?(\/)?((?:\.\.\/)*)posts\/([a-z0-9-]+)(\/)?(["'#?])/gi,
    (m, attr, q, host, slash, dots, slug, trail, end) => {
      if (!postSlugs.has(slug)) return m;
      if (!host && !slash && !dots) return m; // leave relative links from inside /posts/ alone
      return `${attr}${q}${SITE}/posts/${slug}.html${end}`;
    }
  );

  if (html !== original) {
    writeFileSync(file, html);
    changed++;
  }

  // 3. Sitemap entry, with last-modified date from the page's own schema.
  const modified =
    html.match(/"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})/)?.[1] ||
    html.match(/"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})/)?.[1];
  sitemapEntries.push({ loc: canonical, lastmod: modified, isPost: rel.startsWith("posts/") });
}

// Home and category pages change whenever a post is added: use the newest post date.
const newest = sitemapEntries.filter((e) => e.isPost && e.lastmod).map((e) => e.lastmod).sort().pop();
for (const e of sitemapEntries) if (!e.isPost && newest) e.lastmod = newest;

const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  sitemapEntries
    .map(
      (e) =>
        `  <url>\n    <loc>${escapeXml(e.loc)}</loc>\n` +
        (e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>\n` : "") +
        `  </url>`
    )
    .join("\n") +
  `\n</urlset>\n`;
writeFileSync(join(ROOT, "sitemap.xml"), sitemap);

// 4. robots.txt — allow everyone, including AI answer engines, and point to the sitemap.
const robots = `# blog.theborggroup.com
User-agent: *
Allow: /
Disallow: /scripts/

Sitemap: ${SITE}/sitemap.xml
`;
writeFileSync(join(ROOT, "robots.txt"), robots);

// 5. Warn (without failing the deploy) about links to posts that don't exist.
const broken = [];
for (const file of pages) {
  const html = readFileSync(file, "utf8");
  for (const m of html.matchAll(/href=["'](?:https:\/\/blog\.theborggroup\.com)?\/?(?:\.\.\/)*posts\/([a-z0-9-]+?)(?:\.html)?\/?["'#?]/gi)) {
    if (!postSlugs.has(m[1])) broken.push(`${toUrlPath(file)} -> posts/${m[1]}`);
  }
}
if (broken.length) {
  console.warn(`WARNING: ${broken.length} link(s) point to posts that don't exist:`);
  for (const b of broken) console.warn(`  ${b}`);
}

console.log(
  `SEO build: ${pages.length} pages checked, ${changed} updated, ` +
    `${sitemapEntries.length} URLs in sitemap.xml (${postFiles.length} posts).`
);
