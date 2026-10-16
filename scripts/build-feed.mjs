// Feed build step for blog.theborggroup.com
// Runs on every Netlify deploy. Writes /latest-posts.json with the newest posts
// (title, url, date, category) so theborggroup.com can show a "Latest from the blog"
// block that updates itself whenever the daily post is published.
// Reads the same fields as build-listings.mjs (h1, p.eyebrow, div.meta date).

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SITE = "https://blog.theborggroup.com";
const ROOT = process.cwd();
const COUNT = 3;
const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];

const decode = (s) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&middot;/g, "·");
const text = (s) => decode(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

const posts = [];
for (const file of readdirSync(join(ROOT, "posts")).filter((f) => f.endsWith(".html"))) {
  const html = readFileSync(join(ROOT, "posts", file), "utf8");
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const eb = html.match(/<p[^>]*class=["']eyebrow["'][^>]*>([\s\S]*?)<\/p>/i);
  const meta = html.match(/<div[^>]*class=["']meta["'][^>]*>([\s\S]*?)<\/div>/i);
  if (!h1 || !meta) continue;
  const m = text(meta[1]).match(/([A-Za-z]+)\.?\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) continue;
  const mi = MONTHS.findIndex((n) => n.startsWith(m[1].toLowerCase().slice(0, 3)));
  if (mi < 0) continue;
  const iso = `${m[3]}-${String(mi + 1).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
  posts.push({
    title: text(h1[1]),
    url: `${SITE}/posts/${file}`,
    date: iso,
    category: eb ? text(eb[1]) : "",
  });
}

posts.sort((a, b) => b.date.localeCompare(a.date) || a.url.localeCompare(b.url));
writeFileSync(join(ROOT, "latest-posts.json"), JSON.stringify({ posts: posts.slice(0, COUNT) }, null, 2) + "\n");
console.log(`build-feed: wrote latest-posts.json with ${Math.min(COUNT, posts.length)} of ${posts.length} posts.`);
