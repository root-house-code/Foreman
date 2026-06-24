import { storageGet, storageSet } from "./storage.js";
import { loadFloors, saveFloors } from "./floors.js";
import { loadRooms, saveRooms } from "./rooms.js";

const FP_KEY = "inventory-floor-plan-v2";

// ── Shape helpers ─────────────────────────────────────────────────────────────

export function rectToPolygon({ x, y, w, h }) {
  return { points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] };
}

// L-shape: a w×h bounding box with a (notchW × notchH) rectangle removed from the
// top-right corner, so the foot of the L runs along the bottom and the left.
export function lShapeToPolygon({ x, y, w, h, notchW, notchH }) {
  return { points: [
    { x, y },
    { x: x + w - notchW, y },
    { x: x + w - notchW, y: y + notchH },
    { x: x + w,          y: y + notchH },
    { x: x + w,          y: y + h },
    { x,                 y: y + h },
  ] };
}

// U-shape: a w×h bounding box with a (gapW × gapDepth) rectangle removed from the
// top edge, centered horizontally — the opening of the U faces up.
export function uShapeToPolygon({ x, y, w, h, gapW, gapDepth }) {
  const gx = x + (w - gapW) / 2;
  return { points: [
    { x, y },
    { x: gx,        y },
    { x: gx,        y: y + gapDepth },
    { x: gx + gapW, y: y + gapDepth },
    { x: gx + gapW, y },
    { x: x + w,     y },
    { x: x + w,     y: y + h },
    { x,            y: y + h },
  ] };
}

// Dispatch to a shape generator by name. `dims` is in canvas units, origin is the
// shape's top-left corner. Unknown shapes fall back to a plain rectangle.
export function shapeToPolygon(shape, { x, y }, dims) {
  if (shape === "L") return lShapeToPolygon({ x, y, ...dims });
  if (shape === "U") return uShapeToPolygon({ x, y, ...dims });
  return rectToPolygon({ x, y, w: dims.w, h: dims.h });
}

// ── Migrations ────────────────────────────────────────────────────────────────

function migratePlacements(placements) {
  const result = {};
  for (const lvl of Object.keys(placements)) {
    result[lvl] = {};
    for (const cat of Object.keys(placements[lvl])) {
      const r = placements[lvl][cat];
      result[lvl][cat] = r.points ? r : rectToPolygon(r);
    }
  }
  return result;
}

function migrateToV3(data) {
  // 1. Migrate fpData.levels → lib/floors.js.
  // Always overwrite when data.levels is present — the original IDs must be used so
  // that placements and rooms stay in sync after the migration.
  if (Array.isArray(data.levels) && data.levels.length > 0) {
    const migratedFloors = data.levels.map(level => {
      const name = level.name || "Floor 1";
      let kind = "floor", number = 1, glyph = "1";
      if (name === "Basement") { kind = "basement"; glyph = "B"; number = null; }
      else if (name === "Attic") { kind = "attic"; glyph = "A"; number = null; }
      else if (name.toLowerCase().includes("yard") || name.toLowerCase().includes("exterior")) {
        kind = "yard"; glyph = "G"; number = null;
      } else {
        const m = name.match(/^Floor\s+(\d+)$/i);
        number = m ? parseInt(m[1]) : 1;
        glyph = String(number);
      }
      return { id: level.id, kind, number, label: name, glyph };
    });
    saveFloors(migratedFloors);
  }

  // 2. Rekey placements, zoneItems: catName → roomId using lib/rooms.js entities
  let allRooms = loadRooms();
  const newPlacements = {};
  const newZoneItems = {};
  const catToRoomMap = {};

  for (const levelId of Object.keys(data.placements)) {
    newPlacements[levelId] = {};
    newZoneItems[levelId] = {};
    catToRoomMap[levelId] = {};
    for (const catName of Object.keys(data.placements[levelId])) {
      let room = Object.values(allRooms).find(r =>
        r.floorId === levelId && (r.label === catName || r.categoryName === catName)
      );
      if (!room) room = Object.values(allRooms).find(r =>
        r.label === catName || r.categoryName === catName
      );
      if (!room) {
        const id = `room-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        room = { id, floorId: levelId, label: catName, type: "room", points: [], items: [], categoryName: catName };
        allRooms[id] = room;
      } else if (room.floorId !== levelId) {
        allRooms[room.id] = { ...room, floorId: levelId };
        room = allRooms[room.id];
      }
      catToRoomMap[levelId][catName] = room.id;
      newPlacements[levelId][room.id] = data.placements[levelId][catName];
      const zi = data.zoneItems?.[levelId]?.[catName];
      if (zi) newZoneItems[levelId][room.id] = zi;
    }
  }
  saveRooms(allRooms);

  // 3. Migrate pin zone refs: catName → roomId
  const newPins = {};
  for (const levelId of Object.keys(data.pins || {})) {
    newPins[levelId] = (data.pins[levelId] || []).map(pin => ({
      ...pin,
      zone: catToRoomMap[levelId]?.[pin.zone] || pin.zone,
    }));
  }

  const newData = { ...data, placements: newPlacements, zoneItems: newZoneItems, pins: newPins, version: 3 };
  delete newData.levels;
  saveFpData(newData);
  return newData;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function loadFpData() {
  try {
    const raw = storageGet(FP_KEY);
    const hasLevels = raw && Array.isArray(raw.levels) && raw.levels.length > 0;
    const isV3 = raw && raw.version >= 3 && raw.placements;
    if (hasLevels || isV3) {
      let data = { zoneItems: {}, pins: {}, drawings: {}, ...raw, placements: migratePlacements(raw.placements || {}) };
      if (!raw.version || raw.version < 2) {
        const DX = 500, DY = 340;
        const newPlacements = {};
        for (const lvl of Object.keys(data.placements)) {
          newPlacements[lvl] = {};
          for (const cat of Object.keys(data.placements[lvl])) {
            newPlacements[lvl][cat] = { points: data.placements[lvl][cat].points.map(p => ({ x: p.x + DX, y: p.y + DY })) };
          }
        }
        const newPins = {};
        for (const lvl of Object.keys(data.pins || {})) {
          newPins[lvl] = (data.pins[lvl] || []).map(p => ({ ...p, x: p.x + DX, y: p.y + DY }));
        }
        data = { ...data, placements: newPlacements, pins: newPins, version: 2 };
        saveFpData(data);
      }
      if (data.version < 3) {
        data = migrateToV3(data);
      }
      return data;
    }
  } catch {}
  // Do NOT save defaults here — this function may be called before storageInit()
  // populates the cache. Floor initialization happens in main.jsx after storageInit.
  return { placements: {}, zoneItems: {}, pins: {}, drawings: {}, version: 3 };
}

export function saveFpData(data) {
  storageSet(FP_KEY, data);
}
