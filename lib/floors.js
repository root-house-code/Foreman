import { storageGet, storageSet } from "./storage.js";

const KEY = "foreman-floors";

const FLOOR_KINDS = {
  yard:     { glyph: "G", defaultLabel: "Yard",     detail: "Lot & exterior", sortOrder: -100, unique: true },
  attic:    { glyph: "A", defaultLabel: "Attic",    detail: "Roof space",     sortOrder: -10,  unique: true },
  floor:    { glyph: "#", defaultLabel: "Floor",    detail: "Living level",   sortOrder: 0,    unique: false },
  basement: { glyph: "B", defaultLabel: "Basement", detail: "Mechanical",     sortOrder: 100,  unique: true },
};

export function loadFloors() {
  try {
    const raw = storageGet(KEY);
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function saveFloors(floors) {
  storageSet(KEY, floors);
}

export function getDefaultFloors() {
  return [{ id: "f1", kind: "floor", number: 1, label: "Floor 1", glyph: "1" }];
}

export function initializeFloors() {
  const floors = loadFloors();
  if (floors.length === 0) {
    saveFloors(getDefaultFloors());
    return getDefaultFloors();
  }
  return floors;
}

function floorSortKey(f) {
  if (f.kind === "floor") return -f.number;
  return FLOOR_KINDS[f.kind].sortOrder;
}

export function sortFloors(floors) {
  const hasCustomOrder = floors.some(f => f.customOrder != null);
  if (hasCustomOrder) {
    return [...floors].sort((a, b) => (a.customOrder ?? 999) - (b.customOrder ?? 999));
  }
  return [...floors].sort((a, b) => floorSortKey(a) - floorSortKey(b));
}

export function createFloor(kind, number = null) {
  const floors = loadFloors();

  if (FLOOR_KINDS[kind].unique) {
    const exists = floors.some((f) => f.kind === kind);
    if (exists) throw new Error(`Only one ${kind} is allowed`);
  }

  const id = `f-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const kind_config = FLOOR_KINDS[kind];

  let label = kind_config.defaultLabel;
  let glyph = kind_config.glyph;

  if (kind === "floor" && number != null) {
    label = `Floor ${number}`;
    glyph = String(number);
  }

  const newFloor = { id, kind, number: kind === "floor" ? number : null, label, glyph };
  floors.push(newFloor);
  saveFloors(sortFloors(floors));
  return newFloor;
}

export function updateFloor(floorId, updates) {
  const floors = loadFloors();
  const idx = floors.findIndex((f) => f.id === floorId);
  if (idx === -1) throw new Error(`Floor ${floorId} not found`);
  floors[idx] = { ...floors[idx], ...updates, id: floorId };
  saveFloors(sortFloors(floors));
  return floors[idx];
}

export function deleteFloor(floorId) {
  const floors = loadFloors();
  if (floors.length === 1) throw new Error("Cannot delete the last floor — at least one floor must exist");
  saveFloors(floors.filter((f) => f.id !== floorId));
}

export function getFloorsInOrder() {
  return sortFloors(loadFloors());
}

export function floorKindExists(kind) {
  return loadFloors().some((f) => f.kind === kind);
}

export function getHighestFloorNumber() {
  const numbered = loadFloors().filter((f) => f.kind === "floor");
  if (numbered.length === 0) return 0;
  return Math.max(...numbered.map((f) => f.number));
}

export function getSeedRoomsForFloor(kind, number = null) {
  const id = `starter-${Date.now()}`;
  return [
    {
      id,
      floorId: null,
      label: "New room",
      type: "room",
      points: [{ x: 10, y: 6 }, { x: 26, y: 6 }, { x: 26, y: 16 }, { x: 10, y: 16 }],
      items: [],
    },
  ];
}
