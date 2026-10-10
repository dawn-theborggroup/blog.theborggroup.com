// Link check for blog.theborggroup.com
// Runs last on every Netlify deploy (see netlify.toml). It looks at every link on every
// page and reports any that lead to a "page not found" — so a bad link written into a
// new post is spotted in the deploy log the same morning, not weeks later by a visitor.
//
// What it checks:
//   - Links to theborggroup.com and communities.theborggroup.com: asked of the live site.
//     A 404/410, or the main site's "notfound.php" page, counts as broken.
//   - Links within this blog: checked against the files that exist in this deploy
//     (a brand-new post isn't live yet, so it can't be asked of the live site).
//   - Everything else (fonts, outside websites): ignored.
//
// It only WARNS. It never stops a deploy, so a daily post always publishes.
// Look for lines starting with "WARNING: broken link" in the deploy log.
//
// Optional settings (environment variables):
//   LINK_CHECK_STRICT=1   exit with an error when a broken link is found (off by default)
//   LINK_CHECK_HOSTS      comma-separated sites to ask the live web about
//                         (default: theborggroup.com — includes www. and communities.)
//
// Links that couldn't be checked (site busy, timeout, rate limit) are counted separately
// and are NOT reported as broken. It is safe to run repeatedly.

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const BLOG_HOST = "blog.theborggroup.com";
const SITE = `https://${BLOG_HOST}`;
const STRICT = process.env.LINK_CHECK_STRICT === "1";
const CHECK_HOSTS = (process.env.LINK_CHECK_HOSTS || "theborggroup.com")
  .split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);

const CONCURRENCY = 4;        // polite: the main site rate-limits (HTTP 429) if hit too fast
const START_GAP_MS = 120;     // pause between starting requests
const TIMEOUT_MS = 15000;     // per request
const DEADLINE_MS = 120000;   // overall cap so this can never slow a deploy much

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const hostMatches = (host, base) => host === base || host.endsWith(`.${base}`);

// Collect every link: url -> set of pages it appears on.
const httpLinks = new Map();   // checked against the live web
const localLinks = new Map();  // checked against files in this deploy
const addTo = (map, key, page) => {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(page);
};

const hrefRe = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
for (const file of pages) {
  const rel = relative(ROOT, file).split(sep).join("/");
  const pageUrl = `${SITE}/${rel}`;
  const html = readFileSync(file, "utf8");
  for (const m of html.matchAll(hrefRe)) {
    const raw = (m[1] ?? m[2] ?? "").trim().replaceAll("&amp;", "&");
    if (!raw || /^(#|mailto:|tel:|sms:|javascript:|data:)/i.test(raw)) continue;
    let url;
    try { url = new URL(raw, pageUrl); } catch { continue; }
    if (!/^https?:$/.test(url.protocol)) continue;
    url.hash = "";
    const host = url.hostname.toLowerCase();
    if (host === BLOG_HOST) addTo(localLinks, url.pathname, rel);
    else if (CHECK_HOSTS.some((h) => hostMatches(host, h))) addTo(httpLinks, url.href, rel);
  }
}

// ---- Links within this blog: does a file exist for it? ----
const broken = [];       // { url, pages, why }
function localExists(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath); } catch { p = urlPath; }
  p = p.replace(/^\/+/, "");
  const candidates = p === "" || p.endsWith("/")
    ? [join(p, "index.html")]
    : [p, `${p}.html`, join(p, "index.html")];
  return candidates.some((c) => {
    const full = join(ROOT, c);
    return existsSync(full) && statSync(full).isFile();
  });
}
for (const [urlPath, from] of localLinks) {
  if (!localExists(urlPath)) broken.push({ url: `${SITE}${urlPath}`, pages: [...from], why: "no such page in this blog" });
}

// ---- Links to the main and communities sites: ask the live web ----
let unverified = 0;
let timedOut = 0;
const started = Date.now();

async function checkOnce(url) {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "user-agent": "borg-blog-link-check/1.0 (deploy check)" },
  });
  try { await res.arrayBuffer(); } catch { /* body not needed */ }
  return res;
}

async function checkHttp(url, from) {
  if (Date.now() - started > DEADLINE_MS) { timedOut++; return; }
  try {
    let res = await checkOnce(url);
    if (res.status === 429) { await sleep(2500); res = await checkOnce(url); }
    const finalPath = new URL(res.url).pathname.toLowerCase();
    if (res.status === 404 || res.status === 410 || finalPath.endsWith("/notfound.php")) {
      broken.push({ url, pages: [...from], why: `page not found (HTTP ${res.status})` });
    } else if (res.status === 429 || res.status >= 500) {
      unverified++;
    }
  } catch {
    unverified++;   // network trouble or timeout: can't say, so don't accuse
  }
}

async function runHttpChecks() {
  if (typeof fetch !== "function") { unverified += httpLinks.size; return; }
  const queue = [...httpLinks.entries()];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const [url, from] = queue.shift();
      await checkHttp(url, from);
      await sleep(START_GAP_MS);
    }
  });
  await Promise.all(workers);
}

try {
  await runHttpChecks();
} catch (err) {
  console.warn(`Link check stopped early (${err?.message || err}). Deploy continues.`);
}

// ---- Report ----
broken.sort((a, b) => a.url.localeCompare(b.url));
for (const b of broken) {
  const shown = b.pages.slice(0, 3).join(", ");
  const more = b.pages.length > 3 ? ` (+${b.pages.length - 3} more)` : "";
  console.warn(`WARNING: broken link ${b.url} — ${b.why} — on ${b.pages.length} page(s): ${shown}${more}`);
}
const total = httpLinks.size + localLinks.size;
let summary = `Link check: ${total} unique links on ${pages.length} pages, ${broken.length} broken`;
if (unverified) summary += `, ${unverified} could not be checked (site busy or unreachable)`;
if (timedOut) summary += `, ${timedOut} skipped (time limit)`;
console.log(`${summary}.`);

process.exit(STRICT && broken.length ? 1 : 0);
