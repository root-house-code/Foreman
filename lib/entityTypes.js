import { storageGet, storageSet } from "./storage.js";

const KEY = "foreman-entity-types";

// ─── Built-in types ───────────────────────────────────────────────────────────

export const BUILT_IN_TYPES = [
  { id: "room",       label: "Rooms",      behaviorClass: "spatial",    parentId: null,     builtIn: true },
  { id: "exterior",   label: "Exterior",   behaviorClass: "spatial",    parentId: null,     builtIn: true },
  { id: "system",     label: "System",     behaviorClass: "functional", parentId: null,     builtIn: true },
  { id: "structure",  label: "Structure",  behaviorClass: "functional", parentId: null,     builtIn: true },
  { id: "hvac",       label: "HVAC",       behaviorClass: "functional", parentId: "system",     builtIn: true },
  { id: "plumbing",   label: "Plumbing",   behaviorClass: "functional", parentId: "system",     builtIn: true },
  { id: "electrical", label: "Electrical", behaviorClass: "functional", parentId: "system",     builtIn: true },
  { id: "safety",     label: "Safety",     behaviorClass: "functional", parentId: "system",     builtIn: true },
  { id: "doors",      label: "Doors",      behaviorClass: "functional", parentId: "structure",  builtIn: true },
  { id: "windows",    label: "Windows",    behaviorClass: "functional", parentId: "structure",  builtIn: true },
  { id: "gutters",    label: "Gutters",    behaviorClass: "functional", parentId: "structure",  builtIn: true },
  { id: "siding",     label: "Siding",     behaviorClass: "functional", parentId: "structure",  builtIn: true },
];

const BUILT_IN_IDS = new Set(BUILT_IN_TYPES.map(t => t.id));

const OLD_TYPE_MAP = {
  room: "room",
  exterior: "exterior",
  system: "system",
  structure: "structure",
  safety: "safety",
  general: "system",
};

const CATEGORY_NAME_MAP = {
  "HVAC": "hvac",
  "Plumbing": "plumbing",
  "Electrical": "electrical",
  "Safety": "safety",
};

// ─── Load / Save ──────────────────────────────────────────────────────────────

export function loadEntityTypes() {
  try {
    const stored = storageGet(KEY);
    if (stored && Array.isArray(stored.types)) {
      const validBuiltInIds = new Set(BUILT_IN_TYPES.map(t => t.id));
      const userTypes = stored.types.filter(t => !t.builtIn || validBuiltInIds.has(t.id));
      const existingIds = new Set(userTypes.map(t => t.id));
      BUILT_IN_TYPES.forEach(bt => {
        if (!existingIds.has(bt.id)) {
          userTypes.push({ ...bt });
        } else {
          const existing = userTypes.find(t => t.id === bt.id);
          if (existing) Object.assign(existing, bt);
        }
      });
      const reconciled = { ...stored, types: userTypes };
      saveEntityTypes(reconciled);
      return reconciled;
    }
  } catch {}
  return _defaultEntityTypes();
}

export function saveEntityTypes(data) {
  storageSet(KEY, data);
}

function _defaultEntityTypes() {
  return { types: [...BUILT_IN_TYPES] };
}

// ─── Migration from old foreman-category-types + foreman-custom-group-types ──

export function migrateToEntityTypes() {
  if (storageGet(KEY)) return loadEntityTypes();

  const data = _defaultEntityTypes();

  try {
    const oldCustomGroups = storageGet("foreman-custom-group-types") ?? [];
    oldCustomGroups.forEach(g => {
      if (!BUILT_IN_IDS.has(g.id)) {
        data.types.push({
          id: g.id,
          label: g.label,
          behaviorClass: "functional",
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
  return "functional";
}

export function isSpatial(typeId, data) {
  return getBehaviorClass(typeId, data) === "spatial";
}

export function isFunctional(typeId, data) {
  return getBehaviorClass(typeId, data) === "functional";
}

export function isExteriorType(typeId, data) {
  const d = data || loadEntityTypes();
  let id = typeId;
  const visited = new Set();
  while (id) {
    if (visited.has(id)) break;
    visited.add(id);
    if (id === "exterior") return true;
    const type = d.types.find(t => t.id === id);
    if (!type) break;
    id = type.parentId;
  }
  return false;
}

export function isStructureType(typeId, data) {
  const d = data || loadEntityTypes();
  let id = typeId;
  const visited = new Set();
  while (id) {
    if (visited.has(id)) break;
    visited.add(id);
    if (id === "structure") return true;
    const type = d.types.find(t => t.id === id);
    if (!type) break;
    id = type.parentId;
  }
  return false;
}

export function getTypesForClass(behaviorClass, data) {
  const d = data || loadEntityTypes();
  return d.types.filter(t => getBehaviorClass(t.id, d) === behaviorClass);
}

export function getSubtypes(parentId, data) {
  const d = data || loadEntityTypes();
  return d.types.filter(t => t.parentId === parentId);
}

export function getRootTypesForClass(behaviorClass, data) {
  const d = data || loadEntityTypes();
  return d.types.filter(
    t => !t.parentId && getBehaviorClass(t.id, d) === behaviorClass
  );
}

// ─── Resolve typeId ───────────────────────────────────────────────────────────

export function resolveTypeId(categoryName, oldCategoryType) {
  if (oldCategoryType === "system" && CATEGORY_NAME_MAP[categoryName]) {
    return CATEGORY_NAME_MAP[categoryName];
  }
  return OLD_TYPE_MAP[oldCategoryType] || "system";
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
  data.types.forEach(t => {
    if (t.parentId === typeId) t.parentId = type.parentId;
  });
  data.types = data.types.filter(t => t.id !== typeId);
  saveEntityTypes(data);
}

// ─── Label resolution ─────────────────────────────────────────────────────────

export function getLabelForType(typeId, data) {
  const d = data || loadEntityTypes();
  const type = d.types.find(t => t.id === typeId);
  return type ? type.label : typeId;
}

export function getLabelForClass(behaviorClass) {
  return behaviorClass === "spatial" ? "Location" : "System";
}
