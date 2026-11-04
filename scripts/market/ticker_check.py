#!/usr/bin/env python3
"""Build market-ticker.json from OneHome saved searches.

Usage: python3 ticker_check.py ticker_config.json data/market-ticker.json [previous.json]

If a saved search fails twice, that area keeps its previous numbers (marked stale).

For each saved search: load the page with Playwright, capture the GetSavedListings
GraphQL request, replay it 50 listings at a time until every listing is read.
Listings are de-duplicated by MLS number within each area (price-band searches
can overlap at their edges), then counted by type (single-family / condo) and
status (active / pending / sold).
"""
import asyncio, json, os, statistics, sys, datetime
from playwright.async_api import async_playwright

MIN_SALES = 3  # fewer closed sales than this: no median or % of list (too few to mean anything)
SKIP_HEADERS = {"content-length", "host", ":authority", ":method", ":path", ":scheme"}


def kind_of(p):
    sub = (p.get("PropertySubType") or "").replace(" ", "").lower()
    ci = (p.get("CommonInterest") or "").lower()
    if sub in ("singlefamilyresidence", "detached"):
        return "sf"
    if sub in ("condominium", "attached", "townhouse", "villa", "stockcooperative") or (not sub and ci == "condominium"):
        return "condo"
    return None  # duplex, manufactured, land, etc. are left out


def status_of(p):
    s = (p.get("StandardStatus") or p.get("MlsStatus") or "").replace(" ", "").lower()
    if s in ("closed", "sold"):
        return "sold"
    if s in ("pending", "activeundercontract", "comingsoon_pending", "contingent"):
        return "pending"
    if s == "active":
        return "active"
    return None


async def read_search(ctx, url):
    page = await ctx.new_page()
    cap = {}

    def on_request(r):
        if "graphql" in r.url and r.method == "POST" and "body" not in cap:
            try:
                b = r.post_data_json
            except Exception:
                return
            if b and b.get("operationName") == "GetSavedListings":
                cap["url"], cap["body"], cap["req"] = r.url, b, r

    page.on("request", on_request)
    total = None
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=90000)
        for _ in range(90):
            if "body" in cap:
                break
            await page.wait_for_timeout(500)
        if "body" not in cap:
            raise RuntimeError("listing request not seen")
        headers = {k: v for k, v in (await cap["req"].all_headers()).items() if k.lower() not in SKIP_HEADERS}
        body = cap["body"]
        ids = body["variables"].get("listingIds")
        cap["nids"] = len(ids) if ids else None
        out, n = [], 0
        while n < 40:
            body["variables"]["pageInput"] = {"pageNum": n, "size": 50}
            r = await ctx.request.post(cap["url"], headers=headers, data=json.dumps(body))
            d = (await r.json())["data"]["listingsBySavedSearchId"]
            batch = d.get("listings") or []
            if total is None:
                pi = d.get("pageInfo") or {}
                total = pi.get("totalCount") or pi.get("total") or pi.get("totalElements") or cap.get("nids")

            out.extend(batch)
            if len(batch) < 50:
                break
            n += 1
        return out, total
    finally:
        await page.close()


def median(xs):
    return round(statistics.median(xs)) if xs else None


def area_stats(seen):
    stats = {}
    for k in ("sf", "condo"):
        rows = [pr for pr in seen.values() if kind_of(pr) == k]
        act = [pr for pr in rows if status_of(pr) == "active"]
        pen = [pr for pr in rows if status_of(pr) == "pending"]
        sold = [pr for pr in rows if status_of(pr) == "sold" and pr.get("ClosePrice")]
        ratios = [pr["ClosePrice"] / pr["ListPrice"] for pr in sold if pr.get("ListPrice")]
        stats[k] = {
            "active": len(act),
            "pending": len(pen),
            "sold": len(sold),
            "medianSold": median([pr["ClosePrice"] for pr in sold]) if len(sold) >= MIN_SALES else None,
            "medianList": median([pr["ListPrice"] for pr in act if pr.get("ListPrice")]),
            "saleToList": round(statistics.median(ratios) * 100, 1) if len(ratios) >= MIN_SALES else None,
        }
    return stats


async def main(cfg_path, out_path, prev_path=None):
    cfg = json.load(open(cfg_path))
    prev = {}
    if prev_path and os.path.exists(prev_path):
        try:
            prev = {a["id"]: a for a in json.load(open(prev_path)).get("areas", [])}
        except Exception:
            prev = {}
    errors = []
    jobs = [(a, s) for a in cfg["areas"] for s in a["searches"]]
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context()
        sem = asyncio.Semaphore(5)

        async def fetch(a, s):
            async with sem:
                for attempt in (1, 2):
                    try:
                        listings, total = await read_search(ctx, s["url"])
                        if total and len(listings) < int(total):
                            raise RuntimeError(f"read {len(listings)} of {total}")
                        print(a["id"], s["label"], len(listings), file=sys.stderr, flush=True)
                        return listings, None
                    except Exception as e:
                        err = e
                return None, err

        got = await asyncio.gather(*[fetch(a, s) for a, s in jobs])
        await browser.close()

    by_area = {}
    for (a, s), (listings, err) in zip(jobs, got):
        d = by_area.setdefault(a["id"], {"seen": {}, "failed": [], "reads": {}})
        if err:
            d["failed"].append(f'{s["label"]}: {err}')
            continue
        d["reads"][s["label"]] = len(listings)
        for l in listings:
            pr = l.get("property") or {}
            if pr.get("ListingId"):
                d["seen"][pr["ListingId"]] = pr

    areas = []
    for a in cfg["areas"]:
        d = by_area[a["id"]]
        if d["failed"]:
            errors.extend(f'{a["label"]}: {f}' for f in d["failed"])
            ids = [x["id"] for x in (a.get("split") or [a])]
            if all(i in prev for i in ids):
                for i in ids:
                    kept = dict(prev[i])
                    kept["stale"] = True
                    areas.append(kept)
                continue
        # An area can be split into smaller areas by ZIP code (e.g. Bonita Beach 34134 / Fort Myers Beach 33931).
        parts = a.get("split") or [{"id": a["id"], "label": a["label"], "url": a["url"]}]
        for part in parts:
            zips = set(part.get("zips") or [])
            seen = {m: pr for m, pr in d["seen"].items() if not zips or str(pr.get("PostalCode") or "")[:5] in zips}
            block = {"id": part["id"], "name": part["label"], "url": part["url"], "soldDays": a["soldDays"], **area_stats(seen)}
            for key in a.get("omit", []):  # e.g. "sf.pending" while a saved search is missing
                k, f = key.split(".")
                block[k][f] = None
            block["reads"] = d["reads"]
            areas.append(block)

    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-5)))
    result = {"updated": now.isoformat(timespec="minutes"), "updatedLabel": now.strftime("%B %-d, %Y"),
              "source": "Southwest Florida MLS via OneHome saved searches", "areas": areas, "errors": errors}
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    json.dump(result, open(out_path, "w"), indent=1)
    print(json.dumps({"errors": errors, "areas": {x["id"]: {"sf": x["sf"], "condo": x["condo"]} for x in areas}}, indent=1))


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None))
