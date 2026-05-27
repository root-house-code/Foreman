import { storageGet, storageSet } from "./storage.js";

const CAT_KEY      = "foreman-category-field-schemas";
const ITEM_KEY     = "foreman-item-field-schemas";
const VAL_KEY      = "foreman-custom-field-values";    // legacy — kept for backwards-compat import
const SPATIAL_KEY  = "foreman-spatial-assignments";
const ITEM_VAL_KEY = "foreman-item-field-values";

// Fields that belong in spatialAssignments rather than itemFieldValues.
export const SPATIAL_FIELD_NAMES = new Set(["roomLabel", "exteriorLabel"]);

export function loadCategoryFieldSchemas() {
  try { return storageGet(CAT_KEY)  ?? {}; } catch { return {}; }
}
export function saveCategoryFieldSchemas(d) {
  storageSet(CAT_KEY, d);
}

export function loadItemFieldSchemas() {
  try { return storageGet(ITEM_KEY) ?? {}; } catch { return {}; }
}
export function saveItemFieldSchemas(d) {
  storageSet(ITEM_KEY, d);
}

export function loadCustomFieldValues() {
  try { return storageGet(VAL_KEY)  ?? {}; } catch { return {}; }
}
export function saveCustomFieldValues(d) {
  storageSet(VAL_KEY, d);
}

export function loadSpatialAssignments() {
  try { return storageGet(SPATIAL_KEY)  ?? {}; } catch { return {}; }
}
export function saveSpatialAssignments(d) { storageSet(SPATIAL_KEY, d); }

export function loadItemFieldValues() {
  try { return storageGet(ITEM_VAL_KEY) ?? {}; } catch { return {}; }
}
export function saveItemFieldValues(d) { storageSet(ITEM_VAL_KEY, d); }

// One-time split of foreman-custom-field-values into two separate stores.
// Idempotent — re-running after migration is already done is a safe no-op.
// Call after storageInit() so the cache has real data.
export function migrateCfvSplit() {
  if (storageGet(SPATIAL_KEY) !== null) return; // already migrated
  const old = loadCustomFieldValues();
  if (Object.keys(old).length === 0) return; // nothing to migrate (or race with runMigrations)
  const spatial = {}, itemVals = {};
  Object.entries(old).forEach(([key, vals]) => {
    if (!vals) return;
    const sp = {}, det = {};
    Object.entries(vals).forEach(([f, v]) => {
      if (SPATIAL_FIELD_NAMES.has(f)) sp[f] = v; else det[f] = v;
    });
    if (Object.keys(sp).length)  spatial[key]  = sp;
    if (Object.keys(det).length) itemVals[key] = det;
  });
  saveSpatialAssignments(spatial);
  saveItemFieldValues(itemVals);
}
