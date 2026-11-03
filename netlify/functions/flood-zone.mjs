// Flood Zone Lookup — server side for /resources/flood-zone-lookup/
// Address -> coordinates (U.S. Census Geocoder) -> FEMA flood zone (National Flood Hazard Layer).
// Runs on Netlify because neither government service allows direct calls from a browser.
// Called by the page as: /api/flood-zone?address=27399 Riverview Center Blvd, Bonita Springs, FL

const CENSUS =
  "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";
const NFHL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer";
const ZONES_LAYER = 28; // Flood Hazard Zones (S_FLD_HAZ_AR)
const PANELS_LAYER = 3; // FIRM Panels (S_FIRM_PAN)

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": status === 200 ? "public, max-age=86400" : "no-store",
    },
  });

async function getJson(url, ms = 9000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.json();
}

async function geocode(address) {
  const q = new URLSearchParams({
    address,
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
    layers: "Counties",
    format: "json",
  });
  const data = await getJson(`${CENSUS}?${q}`);
  const m = data?.result?.addressMatches?.[0];
  if (!m) return null;
  const county = m.geographies?.Counties?.[0]?.NAME || null;
  return {
    matchedAddress: m.matchedAddress,
    lng: m.coordinates.x,
    lat: m.coordinates.y,
    county,
    state: m.addressComponents?.state || null,
  };
}

async function femaQuery(layer, lng, lat, outFields) {
  const q = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields,
    returnGeometry: "false",
    f: "json",
  });
  const data = await getJson(`${NFHL}/${layer}/query?${q}`, 12000);
  if (data.error) throw new Error(data.error.message || "FEMA query error");
  return (data.features || []).map((f) => f.attributes);
}

const SEVERITY = ["VE", "V", "AE", "AO", "AH", "A99", "AR", "A", "X", "D"];
const rank = (z) => {
  const i = SEVERITY.indexOf((z || "").toUpperCase());
  return i === -1 ? 99 : i;
};

export default async (req) => {
  const address = (new URL(req.url).searchParams.get("address") || "").trim();
  if (address.length < 8 || address.length > 200) {
    return json(400, { error: "bad_address", message: "Please enter a full street address, city and state." });
  }

  let place;
  try {
    place = await geocode(address);
  } catch (e) {
    return json(502, { error: "geocoder_down", message: "The address service is not responding right now. Please try again in a minute." });
  }
  if (!place) {
    return json(404, {
      error: "not_found",
      message: "We couldn't match that address. Check the spelling, leave off the unit number, and include the city. Brand-new construction sometimes isn't in the address database yet.",
    });
  }

  let zones, panels = [];
  try {
    zones = await femaQuery(ZONES_LAYER, place.lng, place.lat, "FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,V_DATUM,DFIRM_ID");
  } catch (e) {
    return json(502, { error: "fema_down", message: "FEMA's flood map service is not responding right now. Please try again shortly.", place });
  }
  try {
    panels = await femaQuery(PANELS_LAYER, place.lng, place.lat, "FIRM_PAN,EFF_DATE");
  } catch (e) {
    // Panel details are a nice-to-have; the zone is what matters.
  }

  if (!zones.length) {
    return json(200, { place, zone: null, message: "FEMA has no digital flood map for this spot." });
  }

  // If the point sits where two zones meet, report the higher-risk one (what a lender would use).
  zones.sort((a, b) => rank(a.FLD_ZONE) - rank(b.FLD_ZONE));
  const z = zones[0];
  const bfe = typeof z.STATIC_BFE === "number" && z.STATIC_BFE > -9000 ? z.STATIC_BFE : null;
  const panel = panels[0] || {};
  const effDate = panel.EFF_DATE ? new Date(panel.EFF_DATE).toISOString().slice(0, 10) : null;

  return json(200, {
    place,
    zone: z.FLD_ZONE,
    subtype: z.ZONE_SUBTY || null,
    sfha: z.SFHA_TF === "T",
    bfe,
    datum: bfe != null ? z.V_DATUM || null : null,
    panel: panel.FIRM_PAN || null,
    panelEffective: effDate,
    otherZones: [...new Set(zones.slice(1).map((x) => x.FLD_ZONE))].filter((x) => x !== z.FLD_ZONE),
  });
};

export const config = { path: "/api/flood-zone" };
