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
Change the footer once in scripts/footer.html (it contains the "Search Homes" link).

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

## Buy With Us page: /buy-with-us/
Added Nov 3, 2026. The main menu's "Buy" link points here. Home search form submits to
TheBorgGroup.com's BoldTrail search (index.php?quick=1&display=...); "Create your free home
search account" goes to theborggroup.com/login.php. Netlify form "buyer-search-alerts"
collects custom-search requests (turn on email notifications in Netlify).
