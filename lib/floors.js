const KEY = "foreman-floors";

/**
 * Floor Shape:
 * {
 *   id: "f1",                              // unique identifier
 *   kind: "floor" | "attic" | "basement" | "yard",
 *   number: 1,                             // for numbered floors only
 *   label: "Floor 1",                      // editable label
 *   glyph: "1"                             // display character in rail
 * }
 *
 * Sort order (top to bottom):
 * - Yard (sortOrder -100)
 * - Attic (sortOrder -10)
 * - Numbered Floors (sortOrder -number, so Floor 3 comes before Floor 2)
 * - Basement (sortOrder 100)
 *
 * Attic, basement, and yard are UNIQUE — only one of each can exist.
 */

const FLOOR_KINDS = {
  yard: { glyph: "G", defaultLabel: "Yard", detail: "Lot & exterior", sortOrder: -100, unique: true },
  attic: { glyph: "A", defaultLabel: "Attic", detail: "Roof space", sortOrder: -10, unique: true },
  floor: { glyph: "#", defaultLabel: "Floor", detail: "Living level", sortOrder: 0, unique: false },
  basement: { glyph: "B", defaultLabel: "Basement", detail: "Mechanical", sortOrder: 100, unique: true },
};

export function loadFloors() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function saveFloors(floors) {
  localStorage.setItem(KEY, JSON.stringify(floors));
}

/**
 * Get default initial state: one Floor 1
 */
export function getDefaultFloors() {
  return [{ id: "f1", kind: "floor", number: 1, label: "Floor 1", glyph: "1" }];
}

/**
 * Initialize floors if empty
 */
export function initializeFloors() {
  const floors = loadFloors();
  if (floors.length === 0) {
    saveFloors(getDefaultFloors());
    return getDefaultFloors();
  }
  return floors;
}

/**
 * Sort key for a floor (used by sortFloors)
 */
function floorSortKey(f) {
  if (f.kind === "floor") return -f.number;
  return FLOOR_KINDS[f.kind].sortOrder;
}

/**
 * Sort floors in display order
 */
export function sortFloors(floors) {
  const hasCustomOrder = floors.some(f => f.customOrder != null);
  if (hasCustomOrder) {
    return [...floors].sort((a, b) => (a.customOrder ?? 999) - (b.customOrder ?? 999));
  }
  return [...floors].sort((a, b) => floorSortKey(a) - floorSortKey(b));
}

/**
 * Create a new floor
 */
export function createFloor(kind, number = null) {
  const floors = loadFloors();

  // Check unique constraint
  if (FLOOR_KINDS[kind].unique) {
    const exists = floors.some((f) => f.kind === kind);
    if (exists) {
      throw new Error(`Only one ${kind} is allowed`);
    }
  }

  const id = `f-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const kind_config = FLOOR_KINDS[kind];

  let label = kind_config.defaultLabel;
  let glyph = kind_config.glyph;

  if (kind === "floor" && number != null) {
    label = `Floor ${number}`;
    glyph = String(number);
  }

  const newFloor = {
    id,
    kind,
    number: kind === "floor" ? number : null,
    label,
    glyph,
  };

  floors.push(newFloor);
  saveFloors(sortFloors(floors));
  return newFloor;
}

/**
 * Update a floor
 */
export function updateFloor(floorId, updates) {
  const floors = loadFloors();
  const idx = floors.findIndex((f) => f.id === floorId);

  if (idx === -1) {
    throw new Error(`Floor ${floorId} not found`);
  }

  floors[idx] = {
    ...floors[idx],
    ...updates,
    id: floorId,  // never allow id to change
  };

  saveFloors(sortFloors(floors));
  return floors[idx];
}

/**
 * Delete a floor (must not be the last one)
 */
export function deleteFloor(floorId) {
  const floors = loadFloors();

  if (floors.length === 1) {
    throw new Error("Cannot delete the last floor — at least one floor must exist");
  }

  const filtered = floors.filter((f) => f.id !== floorId);
  saveFloors(filtered);
}

/**
 * Get all floors in sort order
 */
export function getFloorsInOrder() {
  return sortFloors(loadFloors());
}

/**
 * Check if a floor kind already exists
 */
export function floorKindExists(kind) {
  const floors = loadFloors();
  return floors.some((f) => f.kind === kind);
}

/**
 * Get highest numbered floor for numbered floors
 */
export function getHighestFloorNumber() {
  const floors = loadFloors();
  const numbered = floors.filter((f) => f.kind === "floor");
  if (numbered.length === 0) return 0;
  return Math.max(...numbered.map((f) => f.number));
}

/**
 * Create default seed rooms for a new floor (used by Inventory Room Builder)
 * Returns array of room records ready to be saved
 */
export function getSeedRoomsForFloor(kind, number = null) {
  // This is a placeholder — actual seed rooms will be defined in Room Builder
  // For now, return a single starter room
  const id = `starter-${Date.now()}`;
  return [
    {
      id,
      floorId: null,  // Will be set when floor is created
      label: "New room",
      type: "room",
      points: [{ x: 10, y: 6 }, { x: 26, y: 6 }, { x: 26, y: 16 }, { x: 10, y: 16 }],
      items: [],
    },
  ];
}
