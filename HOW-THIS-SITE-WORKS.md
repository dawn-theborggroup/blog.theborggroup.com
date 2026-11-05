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
- Buyer Closing Cost Calculator (/resources/buyer-closing-cost-calculator/), added Nov 4, 2026. Owner's title
  follows county custom (Collier: buyer pays, box checked; Lee: seller pays, box unchecked). Lender's policy =
  $25 simultaneous rate + 10% of the promulgated premium on the loan + $50 endorsements (estimate). Mortgage
  doc stamps $0.35/$100 of the loan, intangible tax 0.2%, recording ~$190, 3 months tax + 2 months insurance reserves.
- Florida Property Tax & Amendment 3 Savings Calculator (/resources/florida-property-tax-calculator/), added Nov 4, 2026.
  Two modes: staying (2026 vs 2027/2028 with SOH cap growth) and selling & buying (portability: full benefit
  when moving up, proportional when downsizing, $500,000 cap). Non-school exemption: 2026 $25,000 + up to $26,411;
  2027 $150,000; 2028 $250,000. SOH cap default 2.7% (2026). Assumes resident by Dec 31, 2026.
- Florida Title Insurance Calculator (/resources/florida-title-insurance-calculator/), added Nov 5, 2026.
  Rule 69O-186.003 rates: original $5.75/$5.00/$2.50/$2.25/$2.00 per $1,000 (to $100K/$1M/$5M/$10M/above),
  reissue $3.30/$3.00/$2.00/$1.50 (to $100K/$1M/$10M/above) up to the prior policy amount when the seller's
  owner's policy is under 3 years old; coverage rounded up to the next $100; $100 minimum. Lender's policy =
  $25 simultaneous + original rate on any loan above price + Form 9 at 10% of the loan premium + $50 endorsements.
  Owner's policy custom: Lee seller pays, Collier buyer pays. Form title-insurance-send (lead_type = buyer/seller).
- Florida Homestead & Exemption Checker (/resources/florida-homestead-exemption/), added Nov 4, 2026.
  Checklist of exemptions by situation (already homesteaded / buying by Dec 31, 2026 / FL resident buying 2027+ /
  new resident 2027+ gets $50,000 non-school until year five). Stackable $5,000 exemptions (widow(er), blind or
  disabled, 10%+ service-connected veteran), full exemptions (T&P disabled veteran or wheelchair, qualifying
  disability with income limit, disabled first responder), combat-related discount = VA rating % for 65+.
  Senior income limit $38,686 (2026 tax year; update each January). Senior exemptions are listed but not in
  the dollar estimate. Savings use the entered value with no SOH cap.
- Southwest Florida School Grades (/resources/southwest-florida-school-grades/), added Nov 5, 2026.
  Official FLDOE 2025-26 grades (SchoolGrades26.xlsx from fldoe.org) for 157 Lee and Collier public and
  charter schools (Lee virtual franchise excluded), with 2025 and 2024 grades for history. City/ZIP from the
  NCES school directory. Data is inline in the page (var SCHOOLS). District grades: Collier A, Lee B.
  Lee uses proximity/choice zones; Collier uses attendance boundaries; each links to its district lookup.
  UPDATE EACH JULY when FLDOE releases new grades. Form school-grades-send.

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
(/resources/mortgage-affordability-calculator/), closing-cost-send
(/resources/buyer-closing-cost-calculator/), tax-savings-send (/resources/florida-property-tax-calculator/), homestead-send
(/resources/florida-homestead-exemption/), title-insurance-send (/resources/florida-title-insurance-calculator/), school-grades-send
(/resources/southwest-florida-school-grades/). Every submission is also POSTed to a Zapier webhook
(workflow "blog-forms-to-boldtrail-and-net-sheet-email"), which emails the visitor their results
from dawn@ and creates the BoldTrail contact. A new "email me my results" form needs an entry in that
workflow's FORMS map and an email template. Email alerts: Forms -> Submission notifications
("any form" -> dawn@theborggroup.com; only Netlify team members can receive them).

## Daily market numbers: ticker + Southwest Florida Housing Market Today page
Added Nov 4, 2026.
- Data: data/market-ticker.json, written every morning by the scheduled daily market task (Part D),
  which runs `python3 scripts/market/ticker_check.py scripts/market/ticker_config.json data/market-ticker.json data/market-ticker.json`
  and pushes the file to main. Netlify rebuilds on that push.
- scripts/market/ticker_config.json holds Dawn's OneHome saved-search links per area (Naples, Bonita Springs,
  Bonita & Fort Myers Beach, Estero, Fort Myers, Cape Coral). Big areas are split into price bands to stay under
  OneHome's 500-result limit; listings are de-duplicated by MLS number. Sold = last 45 days (Cape Coral 30).
  An "omit" entry (e.g. "sf.pending") hides a number while its saved search is missing.
  A "split" entry divides one set of searches by ZIP (Bonita Beach 34134 / Fort Myers Beach 33931).
  Median sold price and % of list need at least 3 closed sales; otherwise they are left blank.
  The script reads each search through OneHome's GetSavedListings request (50 at a time). If a search fails twice,
  that area keeps its previous numbers and is marked "stale".
- Single-family = PropertySubType SingleFamilyResidence or Detached; condo = Condominium, Attached, Townhouse,
  Villa, StockCooperative. Duplexes and manufactured homes are left out.
- scripts/build-market-snapshot.mjs (first build step) turns the data into
  /resources/southwest-florida-housing-market/ (Q&A text, tables, FAQPage + Dataset schema, dateModified = data date).
- The same script fills the "Southwest Florida market today" strip on the blog home page (between the
  market-today:start / market-today:end comments in index.html) with total for sale, pending and recently closed.
- widgets/market-ticker/ is the scrolling ticker embedded with an iframe in the Community Guides section of the
  theborggroup.com homepage (BoldTrail). It reads /data/market-ticker.json.
- To change a saved search: update the link in scripts/market/ticker_config.json.
