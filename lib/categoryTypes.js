import { loadData } from "./data.js";
import { loadDeletedCategories } from "./deletedCategories.js";
import { loadEntityTypes, getLabelForType, getTypesForClass, getBehaviorClass, resolveTypeId } from "./entityTypes.js";

const KEY = "foreman-category-types";

// Compatibility: GROUP_ORDER preserved for pages that still iterate over it.
// Prefer getBehaviorClass() / getTypesForClass() from entityTypes for new code.
export const GROUP_ORDER = ["room", "system", "structure", "exterior", "safety"];

// Compatibility: GROUP_LABELS preserved. New code should call getLabelForType(typeId).
export const GROUP_LABELS = {
  system:    "Systems",
  structure: "Structure",
  room:      "Rooms",
  exterior:  "Exterior",
  safety:    "Safety",
};

export function loadCategoryTypeOverrides() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); }
  catch { return {}; }
}

export function saveCategoryTypeOverrides(overrides) {
  localStorage.setItem(KEY, JSON.stringify(overrides));
}

// ─── Group label overrides (for renaming built-in group types) ────────────────

const GROUP_LABEL_OVERRIDES_KEY = "foreman-group-label-overrides";

export function loadGroupLabelOverrides() {
  try { return JSON.parse(localStorage.getItem(GROUP_LABEL_OVERRIDES_KEY) || "{}"); }
  catch { return {}; }
}

export function saveGroupLabelOverrides(overrides) {
  localStorage.setItem(GROUP_LABEL_OVERRIDES_KEY, JSON.stringify(overrides));
}

// ─── Custom group types ───────────────────────────────────────────────────────

const CUSTOM_GROUPS_KEY = "foreman-custom-group-types";

// Returns [{ id: "workshop", label: "Workshop" }, ...]
export function loadCustomGroupTypes() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_GROUPS_KEY) || "[]"); }
  catch { return []; }
}

export function saveCustomGroupTypes(types) {
  localStorage.setItem(CUSTOM_GROUPS_KEY, JSON.stringify(types));
}

// ─── Room subtypes ────────────────────────────────────────────────────────────

export const ROOM_SUBTYPES = [
  "Bedroom", "Bathroom", "Kitchen", "Living Room", "Dining Room",
  "Den", "Home Office", "Garage", "Basement", "Attic",
  "Laundry Room", "Crawl Space", "Utility Room", "Mudroom", "Foyer",
  "Sunroom", "Game Room", "Storage Room", "Outdoor / Yard",
];

const ROOM_SUBTYPES_KEY = "foreman-room-subtypes";

export function loadRoomSubtypes() {
  try { return JSON.parse(localStorage.getItem(ROOM_SUBTYPES_KEY) || "{}"); }
  catch { return {}; }
}
export function saveRoomSubtypes(subtypes) {
  localStorage.setItem(ROOM_SUBTYPES_KEY, JSON.stringify(subtypes));
}

// Returns "Name [Type]" if a subtype is set, otherwise just "Name".
export function formatRoomLabel(categoryName, roomSubtypes) {
  const subtype = roomSubtypes?.[categoryName];
  return subtype ? `${categoryName} [${subtype}]` : categoryName;
}

// ─── Room / Spatial categories ───────────────────────────────────────────────

// Legacy: returns category names whose effective type is "room".
// Kept for backward compatibility — all existing callers (chores, floor plan, etc.) still work.
export function loadRoomCategories() {
  const rows = loadData();
  const overrides = loadCategoryTypeOverrides();
  const deletedCategories = loadDeletedCategories();
  const typeMap = {};
  rows.forEach(row => {
    if (!row.category || !row.categoryType) return;
    if (!row._isCustom && deletedCategories.has(row.category)) return;
    if (!typeMap[row.category] || row._isCustom) {
      typeMap[row.category] = row.categoryType;
    }
  });
  return Object.keys(typeMap)
    .filter(cat => (overrides[cat] ?? typeMap[cat]) === "room");
}

// New: returns category names whose effective typeId maps to a Spatial behavioral class.
// Includes "room", "exterior", and any user-created spatial types.
export function loadSpatialCategories() {
  const rows = loadData();
  const overrides = loadCategoryTypeOverrides();
  const deletedCategories = loadDeletedCategories();
  const entityData = loadEntityTypes();
  const typeMap = {};
  rows.forEach(row => {
    if (!row.category || !row.categoryType) return;
    if (!row._isCustom && deletedCategories.has(row.category)) return;
    if (!typeMap[row.category] || row._isCustom) {
      typeMap[row.category] = row.categoryType;
    }
  });
  return Object.keys(typeMap).filter(cat => {
    const oldType = overrides[cat] ?? typeMap[cat];
    const typeId = resolveTypeId(cat, oldType);
    return getBehaviorClass(typeId, entityData) === "spatial";
  });
}

// New: returns category names whose effective typeId maps to a Functional behavioral class.
export function loadFunctionalCategories() {
  const rows = loadData();
  const overrides = loadCategoryTypeOverrides();
  const deletedCategories = loadDeletedCategories();
  const entityData = loadEntityTypes();
  const typeMap = {};
  rows.forEach(row => {
    if (!row.category || !row.categoryType) return;
    if (!row._isCustom && deletedCategories.has(row.category)) return;
    if (!typeMap[row.category] || row._isCustom) {
      typeMap[row.category] = row.categoryType;
    }
  });
  return Object.keys(typeMap).filter(cat => {
    const oldType = overrides[cat] ?? typeMap[cat];
    const typeId = resolveTypeId(cat, oldType);
    return getBehaviorClass(typeId, entityData) === "functional";
  });
}
