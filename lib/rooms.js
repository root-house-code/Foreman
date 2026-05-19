import { loadSpatialCategories } from "./categoryTypes.js";

const KEY = "foreman-rooms";

/**
 * Room Shape:
 * {
 *   id: "room-uuid",                     // unique identifier
 *   floorId: "f1",                       // floor this room belongs to
 *   label: "Kitchen",                    // editable room name
 *   type: "room" | "utility" | "outdoor", // room type
 *   points: [{ x, y }, ...],             // polygon vertices (snap to 0.5-unit grid)
 *   items: [{ cat, item }, ...],         // items placed in this room
 *   categoryName: "Kitchen",             // bridge: links to maintenance category string
 * }
 */

export function loadRooms() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    return raw;
  } catch {
    return {};
  }
}

export function saveRooms(rooms) {
  localStorage.setItem(KEY, JSON.stringify(rooms));
}

/**
 * Get rooms for a specific floor
 */
export function getRoomsForFloor(floorId) {
  const rooms = loadRooms();
  return Object.values(rooms).filter((r) => r.floorId === floorId);
}

/**
 * Create a new room
 */
export function createRoom(floorId, label, type = "room", points = []) {
  const rooms = loadRooms();
  const id = `room-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  rooms[id] = {
    id,
    floorId,
    label,
    type,
    points: points || [],
    items: [],
  };

  saveRooms(rooms);
  return rooms[id];
}

/**
 * Update a room
 */
export function updateRoom(roomId, updates) {
  const rooms = loadRooms();

  if (!rooms[roomId]) {
    throw new Error(`Room ${roomId} not found`);
  }

  rooms[roomId] = {
    ...rooms[roomId],
    ...updates,
    id: roomId,  // never allow id to change
  };

  saveRooms(rooms);
  return rooms[roomId];
}

/**
 * Delete a room
 */
export function deleteRoom(roomId) {
  const rooms = loadRooms();
  delete rooms[roomId];
  saveRooms(rooms);
}

/**
 * Add item to a room. item ref: { cat, item }
 */
export function addItemToRoom(roomId, cat, item) {
  const rooms = loadRooms();

  if (!rooms[roomId]) {
    throw new Error(`Room ${roomId} not found`);
  }

  const items = rooms[roomId].items || [];
  if (!items.some(i => i.cat === cat && i.item === item)) {
    rooms[roomId].items = [...items, { cat, item }];
  }

  saveRooms(rooms);
}

/**
 * Remove item from a room. item ref: { cat, item }
 */
export function removeItemFromRoom(roomId, cat, item) {
  const rooms = loadRooms();

  if (!rooms[roomId]) {
    throw new Error(`Room ${roomId} not found`);
  }

  rooms[roomId].items = (rooms[roomId].items || []).filter(i => !(i.cat === cat && i.item === item));
  saveRooms(rooms);
}

/**
 * Find which room an item is in (one-place-per-item invariant). item ref: { cat, item }
 */
export function findRoomForItem(cat, item) {
  const rooms = loadRooms();
  return Object.values(rooms).find(r => (r.items || []).some(i => i.cat === cat && i.item === item)) || null;
}

/**
 * Check if an item is already placed somewhere
 */
export function isItemPlaced(cat, item) {
  return findRoomForItem(cat, item) !== null;
}

/**
 * Seed foreman-rooms from existing Spatial categories if the store is empty.
 * Called once at app startup. Safe to call repeatedly — no-op if rooms already exist.
 */
export function initRoomsFromCategories(floorId = "lvl-1") {
  const rooms = loadRooms();
  if (Object.keys(rooms).length > 0) return rooms;

  const spatialCats = loadSpatialCategories();
  spatialCats.forEach(catName => {
    const id = `room-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    rooms[id] = {
      id,
      floorId,
      label: catName,
      type: "room",
      points: [],
      items: [],
      categoryName: catName,
    };
  });

  saveRooms(rooms);
  return rooms;
}
