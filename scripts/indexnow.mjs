// IndexNow: tells Bing (and other IndexNow search engines, which share submissions)
// about new or updated pages right after each deploy, instead of waiting for a crawl.
// Bing's index also feeds ChatGPT search and Copilot answers.
//
// How it works: reads sitemap.xml (rebuilt by seo-build.mjs earlier in the build) and
// submits every URL whose <lastmod> is within the last 2 days. The key file
// /1945e5ece74b76c5fa12a7a456b53db5.txt at the site root proves we own the site. It only warns on
// failure; it never stops a deploy (netlify.toml runs it with "|| true").
import { readFileSync } from "node:fs";

const HOST = "blog.theborggroup.com";
const KEY = "1945e5ece74b76c5fa12a7a456b53db5";
const DAYS = 2;

const xml = readFileSync(new URL("../sitemap.xml", import.meta.url), "utf8");
const cutoff = new Date(Date.now() - DAYS * 864e5).toISOString().slice(0, 10);
const urls = [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)]
  .filter(([, , mod]) => mod.slice(0, 10) >= cutoff)
  .map(([, loc]) => loc);

if (!urls.length) {
  console.log("IndexNow: no pages changed in the last " + DAYS + " days; nothing to submit.");
} else {
  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: HOST, key: KEY, keyLocation: "https://" + HOST + "/" + KEY + ".txt", urlList: urls.slice(0, 10000) }),
    });
    console.log("IndexNow: submitted " + urls.length + " URL(s), response " + res.status);
  } catch (e) {
    console.warn("WARNING: IndexNow submission failed: " + e.message);
  }
}
