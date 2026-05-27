import { storageGet, storageSet } from "./storage.js";
import { loadSpatialCategories } from "./categoryTypes.js";

const KEY = "foreman-rooms";

export function loadRooms() {
  try { return storageGet(KEY) ?? {}; }
  catch { return {}; }
}

export function saveRooms(rooms) {
  storageSet(KEY, rooms);
}

export function getRoomsForFloor(floorId) {
  const rooms = loadRooms();
  return Object.values(rooms).filter((r) => r.floorId === floorId);
}

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

export function updateRoom(roomId, updates) {
  const rooms = loadRooms();

  if (!rooms[roomId]) {
    throw new Error(`Room ${roomId} not found`);
  }

  rooms[roomId] = {
    ...rooms[roomId],
    ...updates,
    id: roomId,
  };

  saveRooms(rooms);
  return rooms[roomId];
}

export function deleteRoom(roomId) {
  const rooms = loadRooms();
  delete rooms[roomId];
  saveRooms(rooms);
}

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

export function removeItemFromRoom(roomId, cat, item) {
  const rooms = loadRooms();

  if (!rooms[roomId]) {
    throw new Error(`Room ${roomId} not found`);
  }

  rooms[roomId].items = (rooms[roomId].items || []).filter(i => !(i.cat === cat && i.item === item));
  saveRooms(rooms);
}

export function findRoomForItem(cat, item) {
  const rooms = loadRooms();
  return Object.values(rooms).find(r => (r.items || []).some(i => i.cat === cat && i.item === item)) || null;
}

export function isItemPlaced(cat, item) {
  return findRoomForItem(cat, item) !== null;
}

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
