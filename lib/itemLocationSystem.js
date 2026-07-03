// Shared resolution of an inventory item's Location and System, matching the
// Inventory list exactly. Both the Item Lifespans and Supplies tables surface
// these columns for items they derive from inventory, so the logic lives here
// as the single source of truth.

import { loadData } from "./data.js";
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

// Resolve an item's Location and System the way the Inventory list does: merge
// spatial assignments + item field values (keyed by stable key), and use the
// effective category type — override ?? data default ?? "system". A blank
// category (e.g. a manual supply) resolves to empty strings.
export function resolveItemLocationSystem(stableKey, category, ctx) {
  const { spatialAssignments, itemFieldValues, catTypeOverrides, defaultCategoryTypes, entityTypeData } = ctx;
  if (!category) return { location: "", system: "", type: "" };
  const cf = { ...(spatialAssignments?.[stableKey] || {}), ...(itemFieldValues?.[stableKey] || {}) };
  const catType = catTypeOverrides?.[category] ?? defaultCategoryTypes?.[category] ?? "system";
  const catTypeId = resolveTypeId(category, catType);
  const catIsSpatial    = isSpatial(catTypeId, entityTypeData);
  const catIsFunctional = isFunctional(catTypeId, entityTypeData);
  const location = cf.roomLabel || cf.exteriorLabel || cf.room || (catIsSpatial ? category : "");
  const system   = catIsFunctional ? category : (cf.systemCategory || cf.system || "");
  const type     = cf.item_type || "";
  return { location, system, type };
}
