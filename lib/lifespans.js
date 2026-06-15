// Expected service life in years, keyed by exact item name (matching data/maintenance.json).
// Values are [typical, low, high]. `typical` drives the replacement forecast; the range
// informs the life-remaining bar. Items absent from this table are excluded from
// forecasting but still counted in cost-of-ownership rollups.
//
// Roofs are keyed directly by material (the catalog already splits them), so no
// material branching is needed.

export const EXPECTED_LIFESPAN = {
  // ── HVAC ─────────────────────────────────────────────────────────────────
  "Furnace":                    [18, 15, 25],
  "Furnace / Air Handler":      [18, 15, 25],
  "Central Air Conditioner":    [15, 12, 18],
  "Heat Pump":                  [14, 12, 18],
  "Mini-Split / Ductless System": [15, 12, 20],
  "Thermostat":                 [10, 8, 12],
  "Smart Thermostat":           [10, 8, 12],
  "Humidifier (whole-home)":    [12, 8, 15],
  "Dehumidifier":               [8, 5, 10],
  "Air Exchanger / HRV":        [15, 10, 20],
  "Window / Portable A/C Unit": [8, 5, 12],
  "Ductwork":                   [25, 20, 40],
  "Range Hood":                 [14, 10, 20],
  "Exhaust Fan":                [10, 7, 15],

  // ── Plumbing ─────────────────────────────────────────────────────────────
  "Water Heater (Tank)":        [10, 8, 12],
  "Water Heater (Tankless)":    [20, 15, 25],
  "Water Softener":             [12, 10, 15],
  "Reverse Osmosis Filter":     [12, 10, 15],
  "Whole-Home Water Filter":    [10, 7, 15],
  "Sump Pump":                  [8, 5, 10],
  "Toilet":                     [25, 15, 40],
  "Showerhead":                 [10, 8, 15],
  "Washing Machine Hoses":      [5, 3, 7],
  "Septic System":              [30, 20, 40],

  // ── Electrical ───────────────────────────────────────────────────────────
  "Electrical Panel":           [35, 25, 45],
  "Backup Generator":           [25, 20, 30],
  "Circuit Breakers":           [35, 25, 45],
  "AFCI Breakers":              [35, 25, 45],
  "GFCI Outlets":               [15, 10, 25],
  "Outlets & Switches":         [30, 20, 40],
  "Ceiling Fans":               [12, 8, 15],
  "Surge Protectors":           [5, 3, 8],
  "Network Router / Hub":       [5, 3, 7],

  // ── Safety & Security ────────────────────────────────────────────────────
  "Smoke Detectors":            [10, 8, 10],
  "Carbon Monoxide Detectors":  [7, 5, 10],
  "Smart Smoke / CO Detector":  [10, 8, 10],
  "Radon Detector":             [8, 5, 10],
  "Fire Extinguisher":          [12, 10, 15],
  "Security System":            [12, 8, 15],
  "Outdoor Cameras":            [6, 4, 8],
  "Video Doorbell":             [6, 4, 8],
  "Smart Lock":                 [8, 5, 10],
  "Emergency Escape Ladder":    [15, 10, 20],
  "Motion-Sensor Lights":       [8, 5, 12],

  // ── Appliances ───────────────────────────────────────────────────────────
  "Refrigerator":               [13, 10, 15],
  "Dishwasher":                 [10, 9, 12],
  "Washing Machine (front-load)": [11, 10, 14],
  "Washing Machine (top-load)": [12, 10, 14],
  "Dryer":                      [13, 10, 15],
  "Dryer Vent Duct":            [15, 10, 20],
  "Gas Range / Cooktop":        [15, 13, 18],
  "Oven":                       [15, 13, 18],
  "Microwave (built-in)":       [9, 7, 11],
  "Garbage Disposal":           [10, 8, 12],

  // ── Doors, Windows & Openings ────────────────────────────────────────────
  "Garage Door":                [25, 15, 30],
  "Garage Door Opener":         [12, 10, 15],
  "Windows":                    [25, 20, 40],
  "Skylights":                  [20, 15, 30],
  "Sliding Glass Doors":        [25, 20, 30],
  "Exterior Doors":             [30, 20, 40],
  "Storm Doors":                [25, 20, 30],

  // ── Roofing (keyed by material) ──────────────────────────────────────────
  "Asphalt Shingles":           [22, 15, 30],
  "Metal Roof":                 [50, 40, 70],
  "Tile Roof (Clay / Concrete)": [60, 50, 100],
  "Slate Roof":                 [90, 75, 150],
  "Wood Shake / Shingle Roof":  [30, 20, 40],
  "Flat Roof / EPDM":           [25, 15, 30],
  "Roof Flashing":              [25, 20, 35],
  "Gutters":                    [25, 20, 30],
  "Downspouts":                 [25, 20, 30],

  // ── Siding & Finishes ────────────────────────────────────────────────────
  "Fiber Cement / Vinyl Siding": [30, 20, 40],
  "Wood Siding / Trim":         [25, 15, 40],
  "Exterior Paint / Siding":    [8, 5, 10],
  "Interior Paint":             [8, 5, 12],
  "Hardwood Floors":            [50, 25, 100],
  "Carpet":                     [10, 5, 15],
  "Tile Grout":                 [15, 10, 25],

  // ── Exterior structures & grounds ────────────────────────────────────────
  "Composite Deck":             [30, 20, 40],
  "Deck / Wood Porch":          [20, 10, 30],
  "Fence (wood)":               [18, 10, 25],
  "Driveway (asphalt)":         [22, 15, 30],
  "Driveway (concrete)":        [35, 25, 50],
  "Irrigation System":          [20, 15, 30],
  "Pool / Spa":                 [12, 8, 20],

  // ── Outdoor equipment ────────────────────────────────────────────────────
  "Lawn Mower":                 [9, 7, 12],
  "Outdoor Gas Grill":          [10, 5, 15],
};

/**
 * Returns the expected service life in years for an item, or null if unknown.
 * A user override (from lib/lifespanOverrides.js, keyed by item name) takes
 * precedence over the curated typical value.
 */
export function expectedYears(itemName, overrides) {
  const o = overrides?.[itemName];
  if (o != null) return o;
  return EXPECTED_LIFESPAN[itemName]?.[0] ?? null;
}

/**
 * Full [typical, low, high] tuple, or null if the item has neither a curated
 * lifespan nor an override. A user override replaces the typical value; the low/
 * high bounds (used by the life-remaining bar) scale proportionally when a curated
 * range exists, otherwise collapse to the override.
 */
export function expectedRange(itemName, overrides) {
  const base = EXPECTED_LIFESPAN[itemName] ?? null;
  const o = overrides?.[itemName];
  if (o != null) {
    if (base) {
      const [typ, lo, hi] = base;
      const scale = typ ? o / typ : 1;
      return [o, Math.round(lo * scale), Math.round(hi * scale)];
    }
    return [o, o, o];
  }
  return base;
}
