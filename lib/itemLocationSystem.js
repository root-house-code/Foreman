// Shared resolution of an inventory item's Location and System, matching the
// Inventory list. Both the Item Lifespans and Supplies tables surface these
// columns for items they derive from inventory, so the logic lives here as the
// single source of truth.

import { loadData } from "./data.js";
import { getItemStableKey } from "./itemKeys.js";
import { resolveTypeId, isSpatial, isFunctional } from "./entityTypes.js";

// Per-category default behavioral type from the data rows (a custom row wins
// over a same-named default) — mirrors the Inventory page's defaultCategoryTypes.
export function buildDefaultCategoryTypes(rows = loadData()) {
  const map = {};
  rows.forEach(row => {
    if (!row.category || !row.categoryType) return;
    if (!map[row.category] || row._isCustom) map[row.category] = row.categoryType;
  });
  return map;
}

// Core: derive Location / System / Type from a merged custom-field object and the
// item's category, using the effective category type (override ?? data default
// ?? "system"). A blank category resolves to empty strings.
function resolveFromFields(cf, category, ctx) {
  const { catTypeOverrides, defaultCategoryTypes, entityTypeData } = ctx;
  if (!category) return { location: "", system: "", type: "" };
  const catType = catTypeOverrides?.[category] ?? defaultCategoryTypes?.[category] ?? "system";
  const catTypeId = resolveTypeId(category, catType);
  const catIsSpatial    = isSpatial(catTypeId, entityTypeData);
  const catIsFunctional = isFunctional(catTypeId, entityTypeData);
  return {
    location: cf.roomLabel || cf.exteriorLabel || cf.room || (catIsSpatial ? category : ""),
    system:   catIsFunctional ? category : (cf.systemCategory || cf.system || ""),
    type:     cf.item_type || "",
  };
}

// Resolve a single item keyed by its own stable key (spatial assignments +
// item field values, merged).
export function resolveItemLocationSystem(stableKey, category, ctx) {
  const cf = { ...(ctx.spatialAssignments?.[stableKey] || {}), ...(ctx.itemFieldValues?.[stableKey] || {}) };
  return resolveFromFields(cf, category, ctx);
}

// Build a map "category|item" -> { location, system, type }, resolved by item
// identity the way the Inventory list groups items. An item can span several
// rows/stable keys (e.g. one row per maintenance task); its Location or System
// may be recorded on any of them, so the location-bearing fields are merged
// across all of an item's stable keys (first non-empty wins) before resolving.
export function buildItemMetaByName(rows, ctx) {
  const { spatialAssignments, itemFieldValues } = ctx;
  const LOC_FIELDS = ["roomLabel", "exteriorLabel", "room", "systemCategory", "system", "item_type"];
  const merged = {};
  rows.forEach(row => {
    if (!row.category || !row.item) return;
    const sk = getItemStableKey(row);
    const cf = { ...(spatialAssignments?.[sk] || {}), ...(itemFieldValues?.[sk] || {}) };
    const nameKey = `${row.category}|${row.item}`;
    const cur = merged[nameKey] || { __category: row.category };
    for (const f of LOC_FIELDS) if (!cur[f] && cf[f]) cur[f] = cf[f];
    merged[nameKey] = cur;
  });
  const out = {};
  for (const [nameKey, cf] of Object.entries(merged)) {
    out[nameKey] = resolveFromFields(cf, cf.__category, ctx);
  }
  return out;
}
