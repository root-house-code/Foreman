const KEY = "foreman-entity-types";

// ─── Built-in types ───────────────────────────────────────────────────────────

export const BUILT_IN_TYPES = [
  { id: "room",       label: "Room",       behaviorClass: "spatial",    parentId: null,     builtIn: true },
  { id: "exterior",   label: "Exterior",   behaviorClass: "spatial",    parentId: null,     builtIn: true },
  { id: "system",     label: "System",     behaviorClass: "functional", parentId: null,     builtIn: true },
  { id: "structure",  label: "Structure",  behaviorClass: "functional", parentId: null,     builtIn: true },
  { id: "hvac",       label: "HVAC",       behaviorClass: "functional", parentId: "system", builtIn: true },
  { id: "plumbing",   label: "Plumbing",   behaviorClass: "functional", parentId: "system", builtIn: true },
  { id: "electrical", label: "Electrical", behaviorClass: "functional", parentId: "system", builtIn: true },
  { id: "safety",     label: "Safety",     behaviorClass: "functional", parentId: "system", builtIn: true },
  { id: "general",    label: "General",    behaviorClass: "functional", parentId: null,     builtIn: true },
];

const BUILT_IN_IDS = new Set(BUILT_IN_TYPES.map(t => t.id));

// Map old categoryType strings → new typeId (for migration)
const OLD_TYPE_MAP = {
  room: "room",
  exterior: "exterior",
  system: "system",
  structure: "structure",
  safety: "safety",
  general: "general",
};

// Well-known category names that map to specific built-in subtypes
const CATEGORY_NAME_MAP = {
  "HVAC": "hvac",
  "Plumbing": "plumbing",
  "Electrical": "electrical",
};

// ─── Load / Save ──────────────────────────────────────────────────────────────

export function loadEntityTypes() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "null");
    if (stored && Array.isArray(stored.types)) return stored;
  } catch {}
  return _defaultEntityTypes();
}

export function saveEntityTypes(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

function _defaultEntityTypes() {
  return { types: [...BUILT_IN_TYPES] };
}

// ─── Migration from old foreman-category-types + foreman-custom-group-types ──

export function migrateToEntityTypes() {
  // Already migrated if foreman-entity-types exists
  if (localStorage.getItem(KEY)) return loadEntityTypes();

  const data = _defaultEntityTypes();

  // Pull in custom group types from old store
  try {
    const oldCustomGroups = JSON.parse(localStorage.getItem("foreman-custom-group-types") || "[]");
    oldCustomGroups.forEach(g => {
      if (!BUILT_IN_IDS.has(g.id)) {
        data.types.push({
          id: g.id,
          label: g.label,
          behaviorClass: "functional", // conservative default
          parentId: null,
          builtIn: false,
        });
      }
    });
  } catch {}

  saveEntityTypes(data);
  return data;
}

// ─── Type lookup helpers ──────────────────────────────────────────────────────

export function getTypeById(id, data) {
  const d = data || loadEntityTypes();
  return d.types.find(t => t.id === id) || null;
}

export function getTypeByLabel(label, data) {
  const d = data || loadEntityTypes();
  return d.types.find(t => t.label.toLowerCase() === label.toLowerCase()) || null;
}

// Walk parent chain to resolve behaviorClass
export function getBehaviorClass(typeId, data) {
  const d = data || loadEntityTypes();
  let id = typeId;
  const visited = new Set();
  while (id) {
    if (visited.has(id)) break;
    visited.add(id);
    const type = d.types.find(t => t.id === id);
    if (!type) break;
    if (type.behaviorClass) return type.behaviorClass;
    id = type.parentId;
  }
  return "functional"; // safe default
}

export function isSpatial(typeId, data) {
  return getBehaviorClass(typeId, data) === "spatial";
}

export function isFunctional(typeId, data) {
  return getBehaviorClass(typeId, data) === "functional";
}

// Returns all types belonging to a behavioral class (including via parent chain)
export function getTypesForClass(behaviorClass, data) {
  const d = data || loadEntityTypes();
  return d.types.filter(t => getBehaviorClass(t.id, d) === behaviorClass);
}

// Returns direct children of a type
export function getSubtypes(parentId, data) {
  const d = data || loadEntityTypes();
  return d.types.filter(t => t.parentId === parentId);
}

// Returns root types (no parent) for a given behavioral class
export function getRootTypesForClass(behaviorClass, data) {
  const d = data || loadEntityTypes();
  return d.types.filter(
    t => !t.parentId && getBehaviorClass(t.id, d) === behaviorClass
  );
}

// ─── Resolve typeId for a category (given its old categoryType string + name) ─

export function resolveTypeId(categoryName, oldCategoryType) {
  // Category name takes precedence for well-known system subtypes
  if (oldCategoryType === "system" && CATEGORY_NAME_MAP[categoryName]) {
    return CATEGORY_NAME_MAP[categoryName];
  }
  return OLD_TYPE_MAP[oldCategoryType] || "general";
}

// ─── CRUD for user-created types ─────────────────────────────────────────────

export function createType(label, behaviorClass, parentId = null) {
  const data = loadEntityTypes();
  const id = `type-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  data.types.push({ id, label, behaviorClass, parentId, builtIn: false });
  saveEntityTypes(data);
  return id;
}

export function createSubtype(label, parentId) {
  const data = loadEntityTypes();
  const parent = data.types.find(t => t.id === parentId);
  if (!parent) throw new Error(`Parent type ${parentId} not found`);
  const behaviorClass = getBehaviorClass(parentId, data);
  const id = `type-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  data.types.push({ id, label, behaviorClass, parentId, builtIn: false });
  saveEntityTypes(data);
  return id;
}

export function renameType(typeId, newLabel) {
  const data = loadEntityTypes();
  const type = data.types.find(t => t.id === typeId);
  if (!type) throw new Error(`Type ${typeId} not found`);
  type.label = newLabel;
  saveEntityTypes(data);
}

export function deleteType(typeId) {
  const data = loadEntityTypes();
  const type = data.types.find(t => t.id === typeId);
  if (!type) return;
  if (type.builtIn) throw new Error("Cannot delete a built-in type");
  // Re-parent any children to the deleted type's parent
  data.types.forEach(t => {
    if (t.parentId === typeId) t.parentId = type.parentId;
  });
  data.types = data.types.filter(t => t.id !== typeId);
  saveEntityTypes(data);
}

// ─── Label resolution (respects user renames) ────────────────────────────────

export function getLabelForType(typeId, data) {
  const d = data || loadEntityTypes();
  const type = d.types.find(t => t.id === typeId);
  return type ? type.label : typeId;
}

// Returns label for a behaviorClass ("spatial" → "Location", "functional" → "System")
export function getLabelForClass(behaviorClass) {
  return behaviorClass === "spatial" ? "Location" : "System";
}
