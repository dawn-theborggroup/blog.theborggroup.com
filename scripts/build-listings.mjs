// Listing build step for blog.theborggroup.com
// Runs on every Netlify deploy (see netlify.toml), right after the footer step and before the SEO step.
//
// Why it exists: the nightly blog task only adds the new post file. Without this step,
// someone has to remember to add the post to the homepage and its category page by hand.
//
// What it does, every deploy:
//   1. Reads every file in /posts/ and pulls out its title (h1), date, and category (eyebrow).
//   2. Adds a row for that post to the homepage list, and to its category page's list,
//      ONLY if the post isn't already listed there.
//   3. Puts each new row in date order (newest first) among the existing rows.
// It never edits, reorders, or removes rows that already exist, and running it twice
// changes nothing the second time. A post it can't read is skipped with a warning.

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SITE = "https://blog.theborggroup.com";
const ROOT = process.cwd();
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const decode = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&middot;/g, "·");
const encode = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const stripTags = (s) => decode(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

// "October 9, 2026" -> { label: "Oct 9, 2026", stamp: 20261009 }
function parseDate(text) {
  const m = text.match(/([A-Za-z]+)\.?\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return null;
  const idx = MONTH_LONG.findIndex((n) => n.startsWith(m[1].toLowerCase().slice(0, 3)));
  if (idx < 0) return null;
  const day = Number(m[2]);
  const year = Number(m[3]);
  return { label: `${MONTHS[idx]} ${day}, ${year}`, stamp: year * 10000 + (idx + 1) * 100 + day };
}

// Read one post file -> { slug, title, category, date } or null.
function readPost(file) {
  const html = readFileSync(join(ROOT, "posts", file), "utf8");
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const eyebrow = html.match(/<p[^>]*class=["']eyebrow["'][^>]*>([\s\S]*?)<\/p>/i);
  const meta = html.match(/<div[^>]*class=["']meta["'][^>]*>([\s\S]*?)<\/div>/i);
  if (!h1 || !eyebrow || !meta) return null;
  const date = parseDate(stripTags(meta[1]));
  if (!date) return null;
  return {
    slug: file.replace(/\.html$/, ""),
    title: stripTags(h1[1]),
    category: stripTags(eyebrow[1]),
    date,
  };
}

const rowFor = (p) =>
  `    <a class='post-row' href='${SITE}/posts/${p.slug}.html'>\n` +
  `      <span class="post-row__date">${p.date.label}</span>\n` +
  `      <span class="post-row__title">${encode(p.title)}</span>\n` +
  `      <span class="post-row__cat">${encode(p.category)}</span>\n` +
  `    </a>\n\n`;

// Insert any missing rows into one listing page. Returns how many were added.
function addMissing(pagePath, posts) {
  if (!existsSync(pagePath)) return 0;
  let html = readFileSync(pagePath, "utf8");
  const section = html.match(/<section class="post-list"[^>]*>/);
  if (!section) return 0;

  let added = 0;
  // Newest first, so same-day posts end up in a stable order.
  const todo = [...posts].sort((a, b) => b.date.stamp - a.date.stamp || a.slug.localeCompare(b.slug));

  for (const p of todo) {
    // Existing rows may use full, relative ("posts/x.html"), or "../../posts/x.html" links.
    if (new RegExp(`class='post-row'\\s+href='(?:[^']*/)?posts/${p.slug}\\.html'`).test(html)) {
      continue; // already listed
    }
    // Find each existing row with its date; insert before the first one that is strictly older.
    const re = /<a class='post-row'[^>]*>\s*<span class="post-row__date">([^<]*)<\/span>/g;
    let insertAt = -1;
    let lastRowEnd = -1;
    let m;
    while ((m = re.exec(html)) !== null) {
      const d = parseDate(m[1]);
      const rowStart = m.index;
      const rowEnd = html.indexOf("</a>", rowStart) + "</a>".length;
      lastRowEnd = rowEnd;
      if (d && d.stamp < p.date.stamp) {
        insertAt = rowStart;
        break;
      }
    }
    if (insertAt < 0) {
      if (lastRowEnd < 0) {
        // Empty list: put the row right after the section opens.
        insertAt = html.indexOf(section[0]) + section[0].length;
        html = html.slice(0, insertAt) + "\n\n" + rowFor(p) + html.slice(insertAt);
      } else {
        // Older than everything listed: append after the last row.
        html = html.slice(0, lastRowEnd) + "\n\n" + rowFor(p).trimEnd() + html.slice(lastRowEnd);
      }
    } else {
      // Back up to the start of the line so the row's indentation is kept.
      const lineStart = html.lastIndexOf("\n", insertAt) + 1;
      html = html.slice(0, lineStart) + rowFor(p) + html.slice(lineStart);
    }
    added++;
  }

  if (added > 0) writeFileSync(pagePath, html);
  return added;
}

const posts = [];
for (const file of readdirSync(join(ROOT, "posts")).filter((f) => f.endsWith(".html")).sort()) {
  const p = readPost(file);
  if (p) posts.push(p);
  else console.warn(`build-listings: skipped posts/${file} (could not read title, category, or date)`);
}

const slugForCategory = (label) =>
  label.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

let homeAdded = addMissing(join(ROOT, "index.html"), posts);
let catAdded = 0;
const byCategory = new Map();
for (const p of posts) {
  const key = slugForCategory(p.category);
  if (!byCategory.has(key)) byCategory.set(key, []);
  byCategory.get(key).push(p);
}
for (const [key, list] of byCategory) {
  const page = join(ROOT, "category", key, "index.html");
  if (existsSync(page)) catAdded += addMissing(page, list);
  else console.warn(`build-listings: no category page for "${key}" (${list.length} post(s) only on the homepage)`);
}

console.log(`build-listings: ${posts.length} posts read; added ${homeAdded} to the homepage and ${catAdded} to category pages.`);
