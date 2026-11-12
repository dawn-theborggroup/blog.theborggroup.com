// Builds /resources/southwest-florida-housing-market/index.html from data/market-ticker.json.
// The daily market task refreshes data/market-ticker.json every morning and pushes it to main;
// Netlify then rebuilds the site, and this script turns the numbers into plain, crawlable text
// (questions and answers, tables, FAQ and Dataset schema) so search engines and AI tools can read it.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const DATA = "data/market-ticker.json";
const OUT_DIR = "resources/southwest-florida-housing-market";
const URL = "https://blog.theborggroup.com/resources/southwest-florida-housing-market/";

if (!existsSync(DATA)) {
  console.log("market snapshot: no data file, skipped");
  process.exit(0);
}
const d = JSON.parse(readFileSync(DATA, "utf8"));
const iso = d.updated.slice(0, 10);
const when = d.updatedLabel;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
const money = (n) => (n == null ? "—" : "$" + Math.round(n).toLocaleString("en-US"));
const short = (n) => {
  if (n == null) return "—";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + " million";
  return "$" + Math.round(n / 1000) + ",000";
};
const pct = (n) => (n == null ? "—" : n.toFixed(1).replace(/\.0$/, "") + "%");
const supply = (s, days) => (s.active && s.sold ? s.active / ((s.sold / days) * 30) : null);
const months = (m) => (m == null ? null : m < 10 ? m.toFixed(1) : String(Math.round(m)));

const areas = d.areas;
const sentence = (a, k, label) => {
  const s = a[k];
  if (!s) return "";
  const bits = [];
  if (s.active != null && s.pending != null) bits.push(`${num(s.active)} ${label} homes for sale and ${s.pending ? num(s.pending) : "none"} under contract`);
  else if (s.active != null) bits.push(`${num(s.active)} ${label} homes for sale`);
  else if (s.pending != null) bits.push(`${num(s.pending)} ${label} homes under contract`);
  let t = bits.length ? `There are ${bits[0]}.` : "";
  if (s.sold && s.medianSold == null) t += ` Only ${s.sold} ${label} ${s.sold === 1 ? "home" : "homes"} closed in the last ${a.soldDays} days, too few for a meaningful median price.`;
  else if (!s.sold && s.active) t += ` No ${label} homes closed in the last ${a.soldDays} days.`;
  if (s.sold && s.medianSold != null) {
    t += ` In the last ${a.soldDays} days, ${s.sold} ${label} ${s.sold === 1 ? "home" : "homes"} closed at a median price of ${short(s.medianSold)}`;
    t += s.saleToList ? `, selling for a median ${pct(s.saleToList)} of the final list price.` : ".";
  }
  const m = months(supply(s, a.soldDays));
  if (m && s.active != null) t += ` At that pace, there are about ${m} months of ${label} inventory.`;
  return t.trim();
};
const answer = (a) =>
  [sentence(a, "sf", "single-family"), sentence(a, "condo", "condo")].filter(Boolean).join(" ").replace(/condo homes/g, "condos").replace(/condo home\b/g, "condo");

// Quick answer: ranges across areas.
const sfSold = areas.filter((a) => a.sf?.medianSold && a.sf.sold >= 10).sort((x, y) => x.sf.medianSold - y.sf.medianSold);
const coSold = areas.filter((a) => a.condo?.medianSold && a.condo.sold >= 10).sort((x, y) => x.condo.medianSold - y.condo.medianSold);
const ratios = areas.flatMap((a) => [a.sf?.saleToList, a.condo?.saleToList]).filter(Boolean).sort((x, y) => x - y);
const totActive = areas.reduce((t, a) => t + (a.sf?.active || 0) + (a.condo?.active || 0), 0);
const quick = `As of ${when}, the Southwest Florida areas we serve have about ${num(totActive)} single-family homes and condos for sale across Naples, Bonita Springs, Bonita Beach, Estero, Fort Myers, Fort Myers Beach and Cape Coral. ` +
  (sfSold.length ? `The median single-family sold price over the last 45 days (30 in Cape Coral) runs from ${short(sfSold[0].sf.medianSold)} in ${sfSold[0].name} to ${short(sfSold.at(-1).sf.medianSold)} in ${sfSold.at(-1).name}. ` : "") +
  (coSold.length ? `For condos, it runs from ${short(coSold[0].condo.medianSold)} in ${coSold[0].name} to ${short(coSold.at(-1).condo.medianSold)} in ${coSold.at(-1).name}. ` : "") +
  (ratios.length ? `Homes are selling for a median of ${pct(ratios[0])} to ${pct(ratios.at(-1))} of their final list price, which means most buyers are negotiating, and pricing right still matters for sellers.` : "");

const row = (a, k) => {
  const s = a[k] || {};
  return `<tr><td>${a.url.includes("communities.theborggroup.com") ? `<a href="${esc(a.url)}">${esc(a.name)}</a>` : esc(a.name)}</td><td>${num(s.active)}</td><td>${num(s.pending)}</td><td>${money(s.medianSold)}</td><td>${pct(s.saleToList)}</td><td>${months(supply(s, a.soldDays)) ?? "—"}</td></tr>`;
};
const table = (k, title) => `
  <h3>${title}</h3>
  <div class="mk-wrap"><table class="mk">
    <thead><tr><th>Area</th><th>For sale</th><th>Pending</th><th>Median sold</th><th>% of list</th><th>Months of supply</th></tr></thead>
    <tbody>${areas.map((a) => row(a, k)).join("")}</tbody>
  </table></div>`;

const qs = areas.map((a) => ({ q: `What is the ${a.name} housing market like right now?`, a: answer(a), area: a }));
const faq = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    { "@type": "Question", name: "What is the Southwest Florida housing market like today?", acceptedAnswer: { "@type": "Answer", text: quick } },
    ...qs.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: `As of ${when}: ${x.a}` } })),
  ],
};
const dataset = {
  "@context": "https://schema.org",
  "@type": "Dataset",
  name: "Southwest Florida Housing Market Snapshot",
  description: "Daily counts of single-family homes and condos for sale and pending, median sold prices, sale-to-list price ratios and months of supply for Naples, Bonita Springs, Bonita Beach and Fort Myers Beach, Estero, Fort Myers and Cape Coral, Florida.",
  url: URL,
  dateModified: d.updated,
  temporalCoverage: `${iso}`,
  spatialCoverage: areas.map((a) => ({ "@type": "Place", name: `${a.name}, Florida` })),
  creator: { "@id": "https://www.theborggroup.com/#organization" },
  isAccessibleForFree: true,
  license: "https://blog.theborggroup.com/",
  variableMeasured: ["Homes for sale", "Pending sales", "Median sold price", "Sale-to-list price ratio", "Months of supply"],
};
const page = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Southwest Florida Housing Market Today",
  url: URL,
  datePublished: "2026-11-05",
  dateModified: iso,
  about: "Southwest Florida real estate market",
  publisher: { "@id": "https://www.theborggroup.com/#organization" },
};
const crumbs = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Blog", item: "https://blog.theborggroup.com/" },
    { "@type": "ListItem", position: 2, name: "Resources", item: "https://blog.theborggroup.com/resources/" },
    { "@type": "ListItem", position: 3, name: "Southwest Florida Housing Market Today", item: URL },
  ],
};
const ld = (o) => `<script type="application/ld+json">\n${JSON.stringify(o, null, 1)}\n</script>`;

// Per-area buttons. Estero has live community market reports; the other areas
// link to their community guides until they get live reports of their own.
const LIVE_REPORTS = { estero: "https://communities.theborggroup.com/market-reports/" };
const areaButtons = (area) => {
  const btns = [];
  if (LIVE_REPORTS[area.id])
    btns.push(`<a class="btn" href="${LIVE_REPORTS[area.id]}">See ${esc(area.name)}'s live community market reports</a>`);
  if (area.url.includes("communities.theborggroup.com"))
    btns.push(`<a class="btn btn--ghost" href="${esc(area.url)}">Explore ${esc(area.name)} communities</a>`);
  return btns.length ? `\n  <p class="area-btns" style="display:flex;flex-wrap:wrap;gap:10px;margin:14px 0 30px">${btns.join("")}</p>` : "";
};

const sections = qs
  .map(
    (x) => `
  <h2 id="${x.area.id}">${esc(x.q)}</h2>
  <p>${esc(x.a)}</p>${areaButtons(x.area)}`
  )
  .join("");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Southwest Florida Housing Market Today: Naples, Bonita Springs, Estero, Fort Myers &amp; Cape Coral | The Borg Group</title>
<meta name="description" content="Updated ${esc(when)}: homes and condos for sale, pending sales, median sold prices and sale-to-list ratios for Naples, Bonita Springs, Bonita Beach, Fort Myers Beach, Estero, Fort Myers and Cape Coral.">
<link rel="canonical" href="${URL}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,400;1,500&family=Jost:wght@200;300;400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/styles.css">
<link rel="stylesheet" href="/assets/tools.css">

<script async src="https://www.googletagmanager.com/gtag/js?id=G-Q8YTWVXK2J"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-Q8YTWVXK2J');
</script>

<meta property="og:title" content="Southwest Florida Housing Market Today">
<meta property="og:description" content="Daily numbers for Naples, Bonita Springs, Estero, Fort Myers and Cape Coral: inventory, pendings, median sold prices and more.">
<meta property="og:type" content="website">
<meta property="og:url" content="${URL}">
<meta property="og:image" content="https://blog.theborggroup.com/assets/images/amendment-3-passed-social.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Southwest Florida Housing Market Today">
<meta name="twitter:description" content="Updated every morning from Southwest Florida MLS data.">
<meta name="twitter:image" content="https://blog.theborggroup.com/assets/images/amendment-3-passed-social.jpg">

${ld(page)}
${ld(dataset)}
${ld(crumbs)}
${ld(faq)}
<style>
  .mk-wrap { overflow-x: auto; margin: var(--space-2) 0 var(--space-3); }
  table.mk { width: 100%; border-collapse: collapse; font-size: .92rem; }
  table.mk th, table.mk td { padding: .55rem .45rem; border-bottom: 1px solid var(--silver-light); text-align: right; white-space: nowrap; }
  table.mk th:first-child, table.mk td:first-child { text-align: left; padding-left: 0; white-space: normal; }
  table.mk thead th { font-size: .66rem; letter-spacing: .1em; text-transform: uppercase; color: var(--silver-dark); font-weight: 500; border-bottom: 1px solid var(--charcoal); white-space: normal; vertical-align: bottom; line-height: 1.35; }
  table.mk td a { color: var(--charcoal); }
  @media (max-width: 560px) { table.mk { font-size: .8rem; } table.mk th, table.mk td { padding: .5rem .25rem; } }
  .updated { display: inline-flex; align-items: center; gap: .5rem; font-size: .8rem; letter-spacing: .14em; text-transform: uppercase; color: var(--silver-dark); }
  .updated i { width: 8px; height: 8px; border-radius: 50%; background: #5fae7b; display: inline-block; }
  .post-body h3 { margin-top: var(--space-3); }
</style>
</head>
<body>

<header class="site-header">
  <div class="site-header__inner">
    <a class='wordmark' href='/index.html'>The Borg Group<span>Live Where Life Feels Better</span></a>
    <nav class="site-nav" aria-label="Primary">
      <a href="https://blog.theborggroup.com/buy-with-us/">Buy</a>
      <a href="https://communities.theborggroup.com/widgets/sell-with-us/">Sell</a>
      <a href="https://communities.theborggroup.com/">Communities</a>
      <a href='/index.html'>Blog</a>
      <a aria-current="page" href="https://blog.theborggroup.com/resources/">Resources</a>
      <a href="https://www.theborggroup.com/pages/contact-us">Contact</a>
      <a class="nav-phone" href="tel:+12393504474">239-350-4474</a>
    </nav>
  </div>
</header>

<nav class="breadcrumb" aria-label="Breadcrumb">
  <a href="/index.html">Blog</a><span>/</span><a href="/resources/">Resources</a><span>/</span>Southwest Florida Housing Market Today
</nav>

<header class="post-header">
  <p class="eyebrow">Resources &middot; Updated Daily</p>
  <hr class="rule">
  <h1>What is the Southwest Florida housing market like today?</h1>
  <p class="updated"><i aria-hidden="true"></i>Updated <time datetime="${esc(d.updated)}">${esc(when)}</time></p>
  <p>Every morning we pull the latest Southwest Florida MLS numbers for the areas we serve and put them here, in plain English: how many homes and condos are for sale, how many are under contract, what they're selling for and how close to asking price. Single-family homes and condos are shown separately, because they're two very different markets.</p>
</header>

<article class="post-body">

  <div class="quick-answer">
    <p class="eyebrow">Quick Answer</p>
    <p>${esc(quick)}</p>
  </div>

  <h2>Southwest Florida market numbers by area</h2>
  ${table("sf", "Single-family homes")}
  ${table("condo", "Condos")}
  <p class="hint">Median sold price and percent of list price cover closings in the last 45 days (30 days in Cape Coral). Months of supply compares homes for sale with the recent pace of sales.</p>
${sections}

  <h2>What do these numbers mean for buyers and sellers?</h2>
  <p>Area-wide numbers set the stage, but they don't price a home. Two neighborhoods a mile apart can move at very different speeds, and the gap between list price and sold price changes from one community and price range to the next. If you're thinking about selling, the number that matters is what homes like yours, in your community, have actually closed for. If you're buying, it's knowing where there's room to negotiate and where good homes still go fast. Since 2005, Mark and Dawn have helped Southwest Florida buyers and sellers read the market street by street.</p>

  <h2>Where do these numbers come from?</h2>
  <p>They come from Southwest Florida MLS listings for each area, refreshed every morning. Single-family counts include detached homes and leave out duplexes and manufactured homes; condo counts include condos and attached villas and townhomes. A listing that matches more than one search is counted once. This page is information and knowledge only. The numbers are deemed reliable but not guaranteed and can change throughout the day.</p>
</article>

<div class="post-cta">
  <h3>Want the numbers for your neighborhood?</h3>
  <p>We'll show you what's selling, how fast and for how much in your community, not just your city. Call or text <span class="nowrap">239-350-4474</span>.</p>
  <a class="btn" href="https://communities.theborggroup.com/widgets/sell-with-us/?mode=fresh">Get My Home's Value</a>
</div>

<div class="related">
  <h4>Related Reading</h4>
  <ul>
    <li><a href="https://communities.theborggroup.com/">Community guides across Southwest Florida</a></li>
    <li><a href="/resources/seller-net-sheet/">Seller Net Sheet</a></li>
    <li><a href="/resources/mortgage-affordability-calculator/">Mortgage &amp; Affordability Calculator</a></li>
    <li><a href="/resources/florida-property-tax-calculator/">Florida Property Tax &amp; Amendment 3 Calculator</a></li>
    <li><a href="/resources/">More free tools and resources</a></li>
  </ul>
</div>

<footer class="tbgf"></footer>
</body>
</html>
`;
// Blog home page: a one-line "market today" strip between the markers, so the newest numbers are
// one click from the front page (and readable by crawlers as plain text).
const HOME = "index.html";
if (existsSync(HOME)) {
  const totPending = areas.reduce((t, a) => t + (a.sf?.pending || 0) + (a.condo?.pending || 0), 0);
  const totSold = areas.reduce((t, a) => t + (a.sf?.sold || 0) + (a.condo?.sold || 0), 0);
  const k = (n) => (n == null ? "" : n >= 1e6 ? "$" + (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M" : "$" + Math.round(n / 1000) + "K");
  const seg = (label, s) => {
    if (!s) return "";
    const p = [];
    if (s.active) p.push(`<b>${num(s.active)}</b> for sale`);
    if (s.pending) p.push(`<b>${num(s.pending)}</b> pending`);
    if (s.medianSold) p.push(`median sold <b>${k(s.medianSold)}</b>`);
    if (s.saleToList) p.push(`<b>${pct(s.saleToList)}</b> of list`);
    return p.length ? `<span class="mt-seg"><span class="mt-t">${label}</span> ${p.join(' <span class="mt-sep">&middot;</span> ')}</span>` : "";
  };
  const items = areas
    .map((a) => `<a class="mt-item" href="/resources/southwest-florida-housing-market/#${esc(a.id)}"><span class="mt-area">${esc(a.name)}</span>${seg("Single-family", a.sf)}<span class="mt-bar">|</span>${seg("Condo", a.condo)}</a>`)
    .join("");
  const strip = `<!-- market-today:start (filled in at deploy time by scripts/build-market-snapshot.mjs) -->
  <section class="market-today-wrap" aria-label="Southwest Florida market today">
    <div class="market-today">
      <a class="mt-head" href="/resources/southwest-florida-housing-market/">
        <span class="mt-k"><i aria-hidden="true"></i>Southwest Florida market today</span>
        <span class="mt-v"><b>${num(totActive)}</b> homes &amp; condos for sale <span class="mt-sep">&middot;</span> <b>${num(totPending)}</b> pending <span class="mt-sep">&middot;</span> <b>${num(totSold)}</b> recently closed</span>
        <span class="mt-go">See every area, updated ${esc(when)} &rarr;</span>
      </a>
      <div class="mt-belt"><div class="mt-track">${items}<span class="mt-dup" aria-hidden="true">${items.replace(/<a /g, '<a tabindex="-1" ')}</span></div></div>
    </div>
  </section>
  <!-- market-today:end -->`;
  const home = readFileSync(HOME, "utf8");
  const re = /<!-- market-today:start[\s\S]*?<!-- market-today:end -->/;
  if (re.test(home)) writeFileSync(HOME, home.replace(re, strip));

  // Resources page: the market snapshot is the page's headline feature (stat card + scrolling areas).
  const RES = "resources/index.html";
  if (existsSync(RES)) {
    const hero = `<!-- market-hero:start (filled in at deploy time by scripts/build-market-snapshot.mjs) -->
    <a class="mk-card" href="/resources/southwest-florida-housing-market/" aria-label="Southwest Florida market today, updated ${esc(when)}">
      <span class="mk-card__k"><i aria-hidden="true"></i>Southwest Florida market today</span>
      <span class="mk-card__stats">
        <span class="mk-stat"><b>${num(totActive)}</b><em>homes &amp; condos for sale</em></span>
        <span class="mk-stat"><b>${num(totPending)}</b><em>pending sales</em></span>
        <span class="mk-stat"><b>${num(totSold)}</b><em>recently closed</em></span>
      </span>
      <span class="mk-card__go">Updated ${esc(when)} &middot; See every area &rarr;</span>
    </a>
    <!-- market-hero:end -->`;
    const belt = `<!-- market-belt:start (filled in at deploy time by scripts/build-market-snapshot.mjs) -->
<section class="market-today-wrap" aria-label="Today's numbers by area">
  <div class="market-today"><div class="mt-belt"><div class="mt-track">${items}<span class="mt-dup" aria-hidden="true">${items.replace(/<a /g, '<a tabindex="-1" ')}</span></div></div></div>
</section>
<!-- market-belt:end -->`;
    let res = readFileSync(RES, "utf8");
    res = res.replace(/<!-- market-hero:start[\s\S]*?<!-- market-hero:end -->/, hero);
    res = res.replace(/<!-- market-belt:start[\s\S]*?<!-- market-belt:end -->/, belt);
    writeFileSync(RES, res);
  }
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/index.html`, html);
console.log(`market snapshot: built for ${when} (${areas.length} areas)`);
