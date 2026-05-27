import { storageGet, storageSet } from "./storage.js";
import { loadData } from "./data.js";
import { loadDeletedCategories } from "./deletedCategories.js";
import { loadEntityTypes, getBehaviorClass, resolveTypeId } from "./entityTypes.js";

const KEY = "foreman-category-types";

// Compatibility: GROUP_ORDER preserved for pages that still iterate over it.
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
  try { return storageGet(KEY) ?? {}; } catch { return {}; }
}

export function saveCategoryTypeOverrides(overrides) {
  storageSet(KEY, overrides);
}

// ─── Group label overrides ────────────────────────────────────────────────────

const GROUP_LABEL_OVERRIDES_KEY = "foreman-group-label-overrides";

export function loadGroupLabelOverrides() {
  try { return storageGet(GROUP_LABEL_OVERRIDES_KEY) ?? {}; } catch { return {}; }
}

export function saveGroupLabelOverrides(overrides) {
  storageSet(GROUP_LABEL_OVERRIDES_KEY, overrides);
}

// ─── Custom group types ───────────────────────────────────────────────────────

const CUSTOM_GROUPS_KEY = "foreman-custom-group-types";

export function loadCustomGroupTypes() {
  try { return storageGet(CUSTOM_GROUPS_KEY) ?? []; } catch { return []; }
}

export function saveCustomGroupTypes(types) {
  storageSet(CUSTOM_GROUPS_KEY, types);
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
  try { return storageGet(ROOM_SUBTYPES_KEY) ?? {}; } catch { return {}; }
}
export function saveRoomSubtypes(subtypes) {
  storageSet(ROOM_SUBTYPES_KEY, subtypes);
}

export function formatRoomLabel(categoryName, roomSubtypes) {
  const subtype = roomSubtypes?.[categoryName];
  return subtype ? `${categoryName} [${subtype}]` : categoryName;
}

// ─── Room / Spatial categories ───────────────────────────────────────────────

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
