# blog.theborggroup.com — how the site is built

Snapshot of the live site (GitHub repo dawn-theborggroup/blog.theborggroup.com, branch main).
Last deploy: Oct 20, 2026, 11:32 AM ET (commit 5735de0, "Point footer Search Homes link to the new map search URL", PR #47). 158 posts.

## Header (main menu): COPIED into every file
There is no shared header template. The menu (nav.site-nav: Buy, Sell, Communities, Blog, Resources, Contact + phone; Buy points to https://blog.theborggroup.com/buy-with-us/; Sell points to https://communities.theborggroup.com/widgets/sell-with-us/; Contact points to /pages/contact-us) is written
into index.html, each category/*/index.html, and every posts/*.html (153+ files with the same block).
To change a menu link, the same edit has to be made in every file (a find-and-replace across the folder
does it; the menu text is identical in all pages except the Blog link, which is a relative path).

## Footer: SHARED
scripts/footer.html is the single source. scripts/apply-footer.mjs copies it into every page on each deploy.
Change the footer once in scripts/footer.html (it contains the "Search Homes" link and the Google Preferred Sources button, which links to https://google.com/preferences/source?q=blog.theborggroup.com).

## Adding a new post (what the nightly task does)
1. Copy the structure of posts/moving-to-fort-myers-relocation-guide.html (site-header, breadcrumb,
   post-header with p.eyebrow / h1 / div.meta date, post-hero-media, article.post-body, post-cta,
   related reading, footer). Save as posts/<slug>.html.
2. Only link to slugs that exist in /posts/. Use a hero image from assets/images/.
3. Update latest-post.json, recent-posts.json, weekly-recap.json at the repo root.
4. Open a pull request into main. Merging ("Squash and merge") publishes it.
Do NOT edit index.html or category pages by hand: the deploy does it.

## Build command (netlify.toml): runs on every deploy
node scripts/apply-footer.mjs && node scripts/build-listings.mjs && node scripts/seo-build.mjs
- apply-footer.mjs   puts scripts/footer.html on every page
- build-listings.mjs adds any post missing from index.html and its category page (newest first)
- seo-build.mjs      adds each post to sitemap.xml and sets its canonical URL
Publish directory is the repo root (".").

## Not included
No _redirects file exists yet: the old BoldTrail URL redirects were never set up
(the old URLs are still live on BoldTrail).

## Resources (free tools): /resources/
Added Nov 3, 2026. Each tool is its own folder with an index.html, so URLs are clean
(e.g. /resources/flood-zone-lookup/). The hub is resources/index.html.
- Shared tool styles: assets/tools.css (loaded after assets/styles.css).
- The footer, favicon, sitemap and link-check steps include every page under /resources/.
- Server-side code lives in netlify/functions/ (netlify.toml sets the folder).
  flood-zone.mjs answers /api/flood-zone?address=... : U.S. Census geocoder -> FEMA National
  Flood Hazard Layer. Free public services, no API keys.
- Lead forms use Netlify Forms (form "flood-report"). Email notifications are set in the
  Netlify dashboard: Forms -> flood-report -> Form notifications.
- To add a tool: copy resources/flood-zone-lookup/index.html as a starting point, then switch
  its hub tile in resources/index.html from "Coming soon" to a link and add it to the hub's ItemList.
- Mortgage & Affordability Calculator (/resources/mortgage-affordability-calculator/), added Nov 4, 2026.
  Property taxes use county-average 2025 millage (Lee 15.97 / 5.32 school; Collier 11.05 / 4.64 school)
  and Amendment 3 homestead rules (non-school exemption $150,000 in 2027, $250,000 in 2028; new residents
  after Dec 31, 2026 get the current $51,411 until year five). The default rate is Freddie Mac's weekly
  average; update the value and hint text in the page when it moves meaningfully.

## Buy With Us page: /buy-with-us/
Added Nov 3, 2026. The main menu's "Buy" link points here. Home search form submits to
TheBorgGroup.com's BoldTrail search (index.php?quick=1&display=...); "Create your free home
search account" goes to theborggroup.com/login.php. Netlify form "buyer-search-alerts"
collects custom-search requests (turn on email notifications in Netlify).

## Netlify Forms
Form detection was turned on for this project on Nov 3, 2026 (Project configuration -> Forms).
Netlify only picks up new forms on a deploy that happens after detection is on. If a new form
doesn't appear under Forms, trigger a fresh deploy.
Forms on this site: flood-report (/resources/flood-zone-lookup/), buyer-search-alerts (/buy-with-us/),
seller-net-sheet and net-sheet-send (/resources/seller-net-sheet/), mortgage-send
(/resources/mortgage-affordability-calculator/). Every submission is also POSTed to a Zapier webhook
(workflow "blog-forms-to-boldtrail-and-net-sheet-email"), which emails the visitor their results
from dawn@ and creates the BoldTrail contact. A new "email me my results" form needs an entry in that
workflow's FORMS map and an email template. Email alerts: Forms -> Submission notifications
("any form" -> dawn@theborggroup.com; only Netlify team members can receive them).
