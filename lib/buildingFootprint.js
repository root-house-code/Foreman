// Building footprint import (opt-in online feature). Geocodes an address via the
// OpenStreetMap Nominatim service and, when the matched feature carries building
// geometry, returns its outline projected into floor-plan canvas units.
//
// No API key required. Nominatim's usage policy asks for a descriptive User-Agent
// and low request volume; this is a one-shot, user-initiated lookup. Browsers do
// not allow overriding User-Agent, so we rely on the low volume of manual use.

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const FEET_PER_METER = 3.280839895;
const M_PER_DEG_LAT = 111320; // meters per degree of latitude (≈constant)

export function addressToQuery(addr) {
  if (!addr) return "";
  if (typeof addr === "string") return addr.trim();
  return [addr.street, addr.street2, addr.city, addr.state, addr.zip].filter(Boolean).join(", ");
}

// Project a [lon,lat] ring to planar canvas units using an equirectangular
// approximation centered on the ring's own centroid. North maps to −y so the
// outline reads the right way up on the SVG canvas (y increases downward).
function projectRing(ring, unitsPerFoot) {
  const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const lon0 = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  const unitsPerMeter = FEET_PER_METER * unitsPerFoot;
  return ring.map(([lon, lat]) => ({
    x: (lon - lon0) * mPerDegLon * unitsPerMeter,
    y: -(lat - lat0) * M_PER_DEG_LAT * unitsPerMeter,
  }));
}

// Extract the outer boundary ring from a GeoJSON Polygon / MultiPolygon. For a
// MultiPolygon (e.g. building with courtyards or several parts) take the ring with
// the most vertices as the primary structure.
function outerRing(geojson) {
  if (!geojson) return null;
  if (geojson.type === "Polygon") return geojson.coordinates?.[0] ?? null;
  if (geojson.type === "MultiPolygon") {
    let best = null, bestLen = 0;
    for (const poly of geojson.coordinates || []) {
      const ring = poly?.[0];
      if (ring && ring.length > bestLen) { best = ring; bestLen = ring.length; }
    }
    return best;
  }
  return null;
}

// Resolve an address to a building outline as canvas-unit points, recentered on
// (centerX, centerY). Throws an Error with a user-facing message on any failure.
export async function fetchBuildingFootprint(address, { unitsPerFoot = 20, centerX = 0, centerY = 0, signal } = {}) {
  const q = addressToQuery(address);
  if (!q) throw new Error("Enter an address first.");

  const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&format=jsonv2&polygon_geojson=1&addressdetails=0&limit=1`;
  let res;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" }, signal });
  } catch {
    throw new Error("Network request failed. Check your connection and try again.");
  }
  if (!res.ok) throw new Error(`Address lookup failed (${res.status}). Try again shortly.`);

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) throw new Error("No match found for that address.");

  const hit = data[0];
  const ring = outerRing(hit.geojson);
  if (!ring || ring.length < 4) {
    throw new Error("Found the address, but no building outline is published for it. A satellite-trace may work better here.");
  }

  // GeoJSON rings repeat the first point at the end — drop it for a clean polygon.
  const isClosed = ring.length > 1
    && ring[0][0] === ring[ring.length - 1][0]
    && ring[0][1] === ring[ring.length - 1][1];
  const open = isClosed ? ring.slice(0, -1) : ring;

  const projected = projectRing(open, unitsPerFoot);
  const xs = projected.map(p => p.x), ys = projected.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const points = projected.map(p => ({ x: Math.round(p.x - cx + centerX), y: Math.round(p.y - cy + centerY) }));

  return {
    points,
    meta: {
      displayName: hit.display_name || q,
      lat: Number(hit.lat), lon: Number(hit.lon),
      widthFt: Math.round((maxX - minX) / unitsPerFoot),
      heightFt: Math.round((maxY - minY) / unitsPerFoot),
      vertices: points.length,
    },
  };
}
