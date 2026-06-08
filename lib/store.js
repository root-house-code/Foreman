import { create } from "zustand";
import { loadRooms, saveRooms } from "./rooms.js";
import { loadFloors, sortFloors } from "./floors.js";
import {
  loadSpatialAssignments, saveSpatialAssignments,
  loadItemFieldValues, saveItemFieldValues,
  SPATIAL_FIELD_NAMES,
} from "./customFields.js";
import { loadInventory } from "./inventory.js";
import { loadFpData, saveFpData } from "./fpData.js";
import { loadData } from "./data.js";
import { getItemStableKey } from "./itemKeys.js";
import { isExteriorType, resolveTypeId, loadEntityTypes, saveEntityTypes } from "./entityTypes.js";
import { loadProjects, saveProjects } from "./projects.js";
import { loadChores, saveChores } from "./chores.js";
import {
  loadServices, saveServices,
  addService as _addService, updateService as _updateService, deleteService as _deleteService,
  addVisit as _addVisit, updateVisit as _updateVisit, deleteVisit as _deleteVisit,
} from "./services.js";

// ── Internal helpers ──────────────────────────────────────────────────────────

function resolveRoomField(room) {
  const typeId = resolveTypeId(room.categoryName || room.label, room.type || "room");
  return isExteriorType(typeId, loadEntityTypes()) ? "exteriorLabel" : "roomLabel";
}

// One-time migration: backfill spatialAssignments from fpData.zoneItems for
// assignments made before the store-based write path was in place.
// Returns the (possibly updated) spatialAssignments object.
function runBackfillMigration(spatial, fpData, rooms) {
  const zoneItems = fpData.zoneItems || {};
  const hasAny = Object.values(zoneItems).some(lz => Object.keys(lz || {}).length > 0);
  if (!hasAny) return spatial;

  const allRows = loadData();
  const catTypeMap = {};
  allRows.forEach(r => {
    if (r.category && r.categoryType && !catTypeMap[r.category]) {
      catTypeMap[r.category] = r.categoryType;
    }
  });

  const etData = loadEntityTypes();
  let next = { ...spatial };
  let changed = false;

  Object.values(zoneItems).forEach(levelZones => {
    Object.entries(levelZones || {}).forEach(([zoneId, items]) => {
      const room = rooms[zoneId];
      if (!room?.label) return;
      const catName = room.categoryName || room.label;
      const oldType = catTypeMap[catName] ?? "system";
      const fieldId = isExteriorType(resolveTypeId(catName, oldType), etData)
        ? "exteriorLabel" : "roomLabel";
      (items || []).forEach(({ cat, item }) => {
        const row = allRows.find(r => r._isCustom && r.category === cat && r.item === item)
                 ?? allRows.find(r => r.category === cat && r.item === item);
        const key = row ? getItemStableKey(row) : `${cat}|${item}`;
        if (!next[key]?.[fieldId]) {
          next = { ...next, [key]: { ...(next[key] || {}), [fieldId]: room.label } };
          changed = true;
        }
      });
    });
  });

  if (changed) {
    saveSpatialAssignments(next);
    return next;
  }
  return spatial;
}

// ── Store ─────────────────────────────────────────────────────────────────────
// Store starts with safe empty defaults. main.jsx calls reloadAll() after
// storageInit() so that the cache is populated before any state is read.

export const useForemanStore = create((set) => ({

  // ── Spatial ─────────────────────────────────────────────────────────────────
  rooms:             {},
  floors:            [],
  fpData:            { placements: {}, zoneItems: {}, pins: {}, drawings: {}, version: 3 },

  // ── Inventory ───────────────────────────────────────────────────────────────
  spatialAssignments: {},   // { [stableKey]: { roomLabel?, exteriorLabel? } }
  itemFieldValues:    {},   // { [stableKey]: { manufacturer?, model?, item_type?, ... } }
  inventory:          {},

  // ── Domain data ──────────────────────────────────────────────────────────
  projects:          [],
  chores:            [],
  services:          { services: {}, visits: {} },
  entityTypes:       { types: [] },

  // ── UI state ─────────────────────────────────────────────────────────────
  selectedItemKey:   null,

  // ── Spatial actions ─────────────────────────────────────────────────────────

  assignItemToZone(stableKey, label, isExterior) {
    const field = isExterior ? "exteriorLabel" : "roomLabel";
    set(state => {
      const next = {
        ...state.spatialAssignments,
        [stableKey]: { ...(state.spatialAssignments[stableKey] || {}), [field]: label },
      };
      saveSpatialAssignments(next);
      return { spatialAssignments: next };
    });
  },

  removeItemFromZone(stableKey, isExterior) {
    const field = isExterior ? "exteriorLabel" : "roomLabel";
    set(state => {
      const entry = state.spatialAssignments[stableKey];
      if (!entry?.[field]) return {};
      const next = { ...state.spatialAssignments };
      const nextEntry = { ...entry };
      delete nextEntry[field];
      next[stableKey] = nextEntry;
      saveSpatialAssignments(next);
      return { spatialAssignments: next };
    });
  },

  renameRoom(zoneId, newLabel) {
    set(state => {
      const room = state.rooms[zoneId];
      if (!room || room.label === newLabel) return {};
      const oldLabel = room.label;
      const field = resolveRoomField(room);

      const nextRooms = {
        ...state.rooms,
        [zoneId]: { ...room, label: newLabel, categoryName: newLabel },
      };

      const nextSpatial = { ...state.spatialAssignments };
      Object.keys(nextSpatial).forEach(key => {
        if (nextSpatial[key]?.[field] === oldLabel) {
          nextSpatial[key] = { ...nextSpatial[key], [field]: newLabel };
        }
      });

      saveRooms(nextRooms);
      saveSpatialAssignments(nextSpatial);
      return { rooms: nextRooms, spatialAssignments: nextSpatial };
    });
  },

  deleteRoom(zoneId) {
    set(state => {
      const room = state.rooms[zoneId];
      if (!room) return {};
      const label = room.label;
      const field = resolveRoomField(room);

      const nextRooms = { ...state.rooms };
      delete nextRooms[zoneId];

      const nextSpatial = { ...state.spatialAssignments };
      Object.keys(nextSpatial).forEach(key => {
        if (nextSpatial[key]?.[field] === label) {
          const nextEntry = { ...nextSpatial[key] };
          delete nextEntry[field];
          nextSpatial[key] = nextEntry;
        }
      });

      saveRooms(nextRooms);
      saveSpatialAssignments(nextSpatial);
      return { rooms: nextRooms, spatialAssignments: nextSpatial };
    });
  },

  // ── fpData actions ───────────────────────────────────────────────────────────

  // Saves non-assignment fpData changes (zone polygons, pins, drawings).
  // zoneItems is intentionally excluded — assignments live in customFieldValues.
  updateFpData(newData) {
    set({ fpData: newData });
    saveFpData(newData);
  },

  // ── Inventory actions ────────────────────────────────────────────────────────

  openItemDetail(key)  { set({ selectedItemKey: key }); },
  closeItemDetail()    { set({ selectedItemKey: null }); },

  // ── Projects actions ─────────────────────────────────────────────────────
  setProjects(arr)         { saveProjects(arr);  set({ projects: arr }); },
  addProject(project)      { set(s => { const n = [...s.projects, project]; saveProjects(n); return { projects: n }; }); },
  updateProject(id, patch) { set(s => { const n = s.projects.map(p => p.id === id ? { ...p, ...patch } : p); saveProjects(n); return { projects: n }; }); },
  deleteProject(id)        { set(s => { const n = s.projects.filter(p => p.id !== id); saveProjects(n); return { projects: n }; }); },

  // ── Chores actions ───────────────────────────────────────────────────────
  setChores(arr) { saveChores(arr); set({ chores: arr }); },

  // ── Services actions ─────────────────────────────────────────────────────
  setServices(data)       { saveServices(data); set({ services: data }); },
  addService(svc)         { set({ services: _addService(svc) }); },
  updateService(id, upd)  { set({ services: _updateService(id, upd) }); },
  deleteService(id)       { set({ services: _deleteService(id) }); },
  addVisit(v)             { set({ services: _addVisit(v) }); },
  updateVisit(id, upd)    { set({ services: _updateVisit(id, upd) }); },
  deleteVisit(id)         { set({ services: _deleteVisit(id) }); },

  // ── Entity types action ──────────────────────────────────────────────────
  setEntityTypes(data) { saveEntityTypes(data); set({ entityTypes: data }); },

  setCustomField(stableKey, fieldId, value) {
    if (SPATIAL_FIELD_NAMES.has(fieldId)) {
      set(state => {
        const next = {
          ...state.spatialAssignments,
          [stableKey]: { ...(state.spatialAssignments[stableKey] || {}), [fieldId]: value },
        };
        saveSpatialAssignments(next);
        return { spatialAssignments: next };
      });
    } else {
      set(state => {
        const next = {
          ...state.itemFieldValues,
          [stableKey]: { ...(state.itemFieldValues[stableKey] || {}), [fieldId]: value },
        };
        saveItemFieldValues(next);
        return { itemFieldValues: next };
      });
    }
  },

  // ── Full reload ──────────────────────────────────────────────────────────────
  // Call after profile import, data reset, or any out-of-band storage write.

  reloadAll() {
    const fpData = loadFpData();   // migration may create rooms — must run first
    const rooms  = loadRooms();    // load after migration so new room IDs are present
    const spatial = runBackfillMigration(loadSpatialAssignments(), fpData, rooms);
    set({
      rooms,
      floors:             sortFloors(loadFloors()),
      fpData,
      spatialAssignments: spatial,
      itemFieldValues:    loadItemFieldValues(),
      inventory:          loadInventory(),
      projects:           loadProjects(),
      chores:             loadChores(),
      services:           loadServices(),
      entityTypes:        loadEntityTypes(),
    });
  },
}));

// ── Selectors ─────────────────────────────────────────────────────────────────

// zoneItems: { [zoneLabel]: stableKey[] }
// Groups spatialAssignments entries by their assigned zone label.
// Replaces fpData.zoneItems (which is now a legacy field, no longer written).
// Usage: const zoneItems = useForemanStore(selectZoneItems);
export function selectZoneItems(state) {
  const map = {};
  Object.entries(state.spatialAssignments).forEach(([key, vals]) => {
    if (vals?.roomLabel)     { (map[vals.roomLabel]     ??= []).push(key); }
    if (vals?.exteriorLabel) { (map[vals.exteriorLabel] ??= []).push(key); }
  });
  return map;
}

// Merges spatialAssignments + itemFieldValues into a single per-key object.
// Use as a Zustand selector — prefer two separate subscriptions + useMemo in
// hot components so each slice triggers re-renders independently.
// Usage: const allFields = useForemanStore(selectAllFieldValues);
export function selectAllFieldValues(state) {
  const out = {};
  Object.entries(state.spatialAssignments).forEach(([k, v]) => { out[k] = { ...v }; });
  Object.entries(state.itemFieldValues).forEach(([k, v]) => {
    out[k] = out[k] ? { ...out[k], ...v } : { ...v };
  });
  return out;
}
