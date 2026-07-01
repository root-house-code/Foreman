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
import {
  loadExpenses, saveExpenses,
  addExpense as _addExpense, updateExpense as _updateExpense, deleteExpense as _deleteExpense,
} from "./expenses.js";
import { loadLifespanOverrides, saveLifespanOverrides } from "./lifespanOverrides.js";
import {
  loadSupplies, setTrackedState as _setTrackedState,
  addManual as _addManualSupply, updateManual as _updateManualSupply, deleteManual as _deleteManualSupply,
} from "./supplies.js";
import {
  loadUtilities,
  addUtility as _addUtility, updateUtility as _updateUtility, deleteUtility as _deleteUtility,
  addBill as _addBill, updateBill as _updateBill, deleteBill as _deleteBill,
} from "./utilities.js";
import {
  loadSessions,
  addSession as _addSession, updateSession as _updateSession, deleteSession as _deleteSession,
} from "./sessions.js";
import {
  loadBudget,
  setBudgetSettings as _setBudgetSettings,
  addPlanned as _addPlanned, removePlanned as _removePlanned, markPlannedLogged as _markPlannedLogged,
  setMortgage as _setMortgage,
  setMortgageOverride as _setMortgageOverride,
  clearMortgageOverride as _clearMortgageOverride,
} from "./budget.js";
import { storageGet, storageSet } from "./storage.js";

// ── Page UI state helpers ─────────────────────────────────────────────────────
// Per-page view configuration (active tab, sort, filters) that survives within-
// session navigation and is also written to storage for cross-reload persistence.

const PAGE_UI_KEY = "foreman-page-ui-state";
function loadPageUIState() {
  try { return storageGet(PAGE_UI_KEY) ?? {}; } catch { return {}; }
}

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
  expenses:          {},
  lifespanOverrides: {},   // { [itemName]: years } — overrides curated EXPECTED_LIFESPAN
  supplies:          { tracked: {}, manual: {} },
  utilities:         { utilities: {}, bills: {} },
  sessions:          {},
  budget:            { monthlyTarget: null, includeReserve: true, includeRepairsBaseline: true, planned: {}, mortgage: { label: "Mortgage", defaultMonthly: null, escrowMonthly: null, overrides: {} } },
  entityTypes:       { types: [] },

  // ── UI state ─────────────────────────────────────────────────────────────
  selectedItemKey:   null,

  // ── Page UI state ────────────────────────────────────────────────────────
  // Per-page configuration (active tab, sort, filters). Empty at init;
  // populated by reloadAll() after storage is ready.
  pageUIState: {},

  setPageUIState(pageId, updates) {
    set(state => {
      const next = {
        ...state.pageUIState,
        [pageId]: { ...(state.pageUIState[pageId] ?? {}), ...updates },
      };
      storageSet(PAGE_UI_KEY, next);
      return { pageUIState: next };
    });
  },

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

  setRoomUse(zoneId, use) {
    set(state => {
      const room = state.rooms[zoneId];
      if (!room) return {};
      const nextRoom = { ...room };
      if (use) nextRoom.use = use;
      else delete nextRoom.use;
      const nextRooms = { ...state.rooms, [zoneId]: nextRoom };
      saveRooms(nextRooms);
      return { rooms: nextRooms };
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

  // ── Expense actions ──────────────────────────────────────────────────────
  setExpenses(data)       { saveExpenses(data); set({ expenses: data }); },
  addExpense(exp)         { set({ expenses: _addExpense(exp) }); },
  updateExpense(id, upd)  { set({ expenses: _updateExpense(id, upd) }); },
  deleteExpense(id)       { set({ expenses: _deleteExpense(id) }); },

  // Set (or clear, when years is null/invalid) the expected-lifespan override for
  // an item name. Shared by the Replacement Forecast and Default Values tables.
  setLifespanOverride(itemName, years) {
    set(state => {
      const next = { ...state.lifespanOverrides };
      const n = Number(years);
      if (years == null || years === "" || isNaN(n) || n <= 0) delete next[itemName];
      else next[itemName] = n;
      saveLifespanOverrides(next);
      return { lifespanOverrides: next };
    });
  },

  // ── Supplies actions ─────────────────────────────────────────────────────
  setSupplyState(taskKey, patch) { set({ supplies: _setTrackedState(taskKey, patch) }); },
  addManualSupply(s)             { set({ supplies: _addManualSupply(s) }); },
  updateManualSupply(id, upd)    { set({ supplies: _updateManualSupply(id, upd) }); },
  deleteManualSupply(id)         { set({ supplies: _deleteManualSupply(id) }); },

  // ── Utilities actions ────────────────────────────────────────────────────
  addUtility(u)           { set({ utilities: _addUtility(u) }); },
  updateUtility(id, upd)  { set({ utilities: _updateUtility(id, upd) }); },
  deleteUtility(id)       { set({ utilities: _deleteUtility(id) }); },
  addBill(b)              { set({ utilities: _addBill(b) }); },
  updateBill(id, upd)     { set({ utilities: _updateBill(id, upd) }); },
  deleteBill(id)          { set({ utilities: _deleteBill(id) }); },

  // ── Work session actions ─────────────────────────────────────────────────
  addSession(s)           { set({ sessions: _addSession(s) }); },
  updateSession(id, upd)  { set({ sessions: _updateSession(id, upd) }); },
  deleteSession(id)       { set({ sessions: _deleteSession(id) }); },

  // ── Budget actions ───────────────────────────────────────────────────────
  setBudgetSettings(upd)  { set({ budget: _setBudgetSettings(upd) }); },
  addPlanned(ym, item)              { set({ budget: _addPlanned(ym, item) }); },
  removePlanned(ym, id)             { set({ budget: _removePlanned(ym, id) }); },
  markPlannedLogged(ym, id, expId)  { set({ budget: _markPlannedLogged(ym, id, expId) }); },
  setMortgage(upd)            { set({ budget: _setMortgage(upd) }); },
  setMortgageOverride(ym, a)  { set({ budget: _setMortgageOverride(ym, a) }); },
  clearMortgageOverride(ym)   { set({ budget: _clearMortgageOverride(ym) }); },

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
      expenses:           loadExpenses(),
      lifespanOverrides:  loadLifespanOverrides(),
      supplies:           loadSupplies(),
      utilities:          loadUtilities(),
      sessions:           loadSessions(),
      budget:             loadBudget(),
      entityTypes:        loadEntityTypes(),
      pageUIState:        loadPageUIState(),
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

// ── Page UI state hook ────────────────────────────────────────────────────────
// Returns [uiState, setUIState] for the given page identifier.
// uiState is the stored config object; setUIState(updates) merges updates in.
// Initialize useState with a getter: useState(() => uiState.key ?? defaultValue)
// Wrap setters: function setX(v) { setX_(v); setUIState({ x: v }); }
// Sets must be serialized as arrays before storing: [...mySet]

// Stable empty object returned when a page has no stored UI state yet.
// Using a module-level constant prevents Zustand's Object.is selector comparison
// from always seeing a "new" value (??{} would create a fresh reference each
// time the selector runs, causing spurious re-renders on every store update).
const _EMPTY_PAGE_UI = {};

export function usePageUIState(pageId) {
  const state = useForemanStore(s => s.pageUIState[pageId] ?? _EMPTY_PAGE_UI);
  const setter = useForemanStore(s => s.setPageUIState);
  return [state, (updates) => setter(pageId, updates)];
}
