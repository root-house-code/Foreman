import { storageGet, storageSet } from "./storage.js";
import { loadData } from "./data.js";
import { getItemStableKey } from "./itemKeys.js";
import { getEffectiveRowState } from "./inventory.js";
import { parseMonths } from "./scheduleInterval.js";

// Curated catalog of buyable consumables, keyed by exact item name.
// `taskMatch` finds the consuming maintenance task on that item (for cadence + next-due);
// `specFields` compose the "what to buy" string from the item's recorded field values.
// Only genuine buyables are listed — pure clean/test tasks are intentionally excluded.
export const SUPPLY_CATALOG = {
  "Furnace":                   { name: "Air Filter",            unit: "filter",    taskMatch: /replace.*filter|air filter/i,        specFields: ["filter_size", "merv_rating"] },
  "Furnace / Air Handler":     { name: "Air Filter",            unit: "filter",    taskMatch: /replace.*filter|air filter/i,        specFields: ["filter_size", "merv_rating"] },
  "Refrigerator":              { name: "Water Filter",          unit: "filter",    taskMatch: /replace water filter/i,              specFields: ["water_filter"] },
  "Whole-Home Water Filter":   { name: "Filter Cartridge",      unit: "cartridge", taskMatch: /cartridge/i,                         specFields: ["filter_model"] },
  "Reverse Osmosis Filter":    { name: "RO Filters & Membrane", unit: "set",       taskMatch: /replace.*(filter|membrane)/i,        specFields: ["filter_model", "stage_count"] },
  "Water Softener":            { name: "Softener Salt",         unit: "bag",       taskMatch: /salt/i,                              specFields: ["salt_type"] },
  "Humidifier (whole-home)":   { name: "Water Panel",           unit: "panel",     taskMatch: /panel|water panel/i,                 specFields: [] },
  "Range Hood":                { name: "Grease / Charcoal Filter", unit: "filter", taskMatch: /grease filter/i,                     specFields: [] },
  "Smoke Detectors":           { name: "Batteries",             unit: "battery",   taskMatch: /batter/i,                            specFields: ["battery_type"] },
  "Carbon Monoxide Detectors": { name: "Batteries",             unit: "battery",   taskMatch: /batter/i,                            specFields: ["battery_type"] },
  "Smart Smoke / CO Detector": { name: "Batteries",             unit: "battery",   taskMatch: /batter/i,                            specFields: ["battery_type"] },
  "Sump Pump":                 { name: "Backup Battery",        unit: "battery",   taskMatch: /batter/i,                            specFields: [] },
  "Garage Door Opener":        { name: "Backup Battery",        unit: "battery",   taskMatch: /backup batter/i,                     specFields: [] },
  "Video Doorbell":            { name: "Battery",               unit: "battery",   taskMatch: /batter/i,                            specFields: [] },
  "Motion-Sensor Lights":      { name: "Bulbs",                 unit: "bulb",      taskMatch: /bulb/i,                              specFields: [] },
  "Exterior Lighting":         { name: "Bulbs",                 unit: "bulb",      taskMatch: /bulb/i,                              specFields: [] },
};

// Per-field display formatting when composing a spec string.
const SPEC_FORMAT = {
  merv_rating: v => `MERV ${v}`,
  stage_count: v => `${v}-stage`,
};

export function composeSpec(specFields, vals) {
  return (specFields || [])
    .map(f => {
      const v = vals?.[f];
      if (v == null || v === "") return null;
      return SPEC_FORMAT[f] ? SPEC_FORMAT[f](v) : String(v);
    })
    .filter(Boolean)
    .join(" · ");
}

// ── Storage ──────────────────────────────────────────────────────────────────
// Shape: { tracked: { [taskKey]: { qtyOnHand, reorderThreshold, productUrl, notes, lastRestocked } },
//          manual:  { [id]: ManualSupply } }

const KEY = "foreman-supplies";

function load() {
  try { return storageGet(KEY) ?? { tracked: {}, manual: {} }; }
  catch { return { tracked: {}, manual: {} }; }
}

export function loadSupplies() {
  const d = load();
  return { tracked: d.tracked ?? {}, manual: d.manual ?? {} };
}
export function saveSupplies(d) { storageSet(KEY, d); }

// Mutable state for an auto-derived supply, keyed by its consuming task key.
export function setTrackedState(taskKey, patch) {
  const d = loadSupplies();
  d.tracked[taskKey] = { ...d.tracked[taskKey], ...patch };
  saveSupplies(d);
  return d;
}

export function addManual(supply) {
  const d = loadSupplies();
  d.manual[supply.id] = supply;
  saveSupplies(d);
  return d;
}
export function updateManual(id, patch) {
  const d = loadSupplies();
  if (!d.manual[id]) return d;
  d.manual[id] = { ...d.manual[id], ...patch, id };
  saveSupplies(d);
  return d;
}
export function deleteManual(id) {
  const d = loadSupplies();
  delete d.manual[id];
  saveSupplies(d);
  return d;
}

// ── Derivation ───────────────────────────────────────────────────────────────

/**
 * Scans owned inventory items in the catalog and produces one supply row each,
 * joining the consuming maintenance task (cadence + next-due) and the item's
 * recorded spec fields, merged with any stored tracked state.
 */
export function deriveAutoSupplies(itemFieldValues, inventory, nextDatesMap, suppliesState) {
  const rows = loadData();
  const tracked = suppliesState?.tracked || {};

  const byItem = {}; // stableKey -> { category, item, stableKey, tasks: [] }
  rows.forEach(row => {
    if (!row.category || !row.item || !SUPPLY_CATALOG[row.item]) return;
    if (getEffectiveRowState(inventory, row) !== "included") return;
    const stableKey = getItemStableKey(row);
    (byItem[stableKey] ??= { category: row.category, item: row.item, stableKey, tasks: [] }).tasks.push(row);
  });

  const out = [];
  Object.values(byItem).forEach(({ category, item, stableKey, tasks }) => {
    const def = SUPPLY_CATALOG[item];
    const taskRow = tasks.find(r => def.taskMatch.test(r.task));
    if (!taskRow) return; // no consuming task on this item — nothing to resupply
    const taskKey = `${category}|${item}|${taskRow.task}`;
    const nextDueIso = nextDatesMap?.[taskKey];
    const vals = itemFieldValues?.[stableKey] || {};
    const st = tracked[taskKey] || {};
    out.push({
      source: "auto",
      key: taskKey,
      taskKey,
      category,
      item,
      stableKey,
      name: def.name,
      unit: def.unit,
      spec: composeSpec(def.specFields, vals),
      cadenceMonths: parseMonths(taskRow.schedule),
      nextDue: nextDueIso ? new Date(nextDueIso) : null,
      qtyOnHand: st.qtyOnHand ?? null,
      reorderThreshold: st.reorderThreshold ?? 1,
      productUrl: st.productUrl || "",
      notes: st.notes || "",
    });
  });
  return out;
}

export function supplyStatus(qtyOnHand, reorderThreshold) {
  if (qtyOnHand == null) return "untracked";
  if (qtyOnHand <= 0) return "out";
  if (qtyOnHand <= (reorderThreshold ?? 1)) return "low";
  return "ok";
}

// Unified list of auto-derived + manual supplies, each tagged with its status.
// Shared by the Supplies page and the Dashboard so they agree exactly.
export function buildSupplyRows(itemFieldValues, inventory, nextDatesMap, suppliesState) {
  const auto = deriveAutoSupplies(itemFieldValues, inventory, nextDatesMap, suppliesState);
  const manual = Object.values(suppliesState?.manual ?? {}).map(m => ({
    source: "manual",
    key: m.id,
    id: m.id,
    category: "Manual",
    item: m.label,
    name: "",
    spec: m.spec || "",
    cadenceMonths: m.cadenceMonths ?? null,
    nextDue: null,
    qtyOnHand: m.qtyOnHand ?? null,
    reorderThreshold: m.reorderThreshold ?? 1,
    productUrl: m.productUrl || "",
    notes: m.notes || "",
  }));
  return [...auto, ...manual].map(r => ({ ...r, status: supplyStatus(r.qtyOnHand, r.reorderThreshold) }));
}

// If a maintenance task consumes a tracked supply, returns its key/name/qty; else null.
// Used by the maintenance completion flow to offer a one-tap stock decrement.
export function consumingTaskInfo(category, item, task, suppliesState) {
  const def = SUPPLY_CATALOG[item];
  if (!def || !def.taskMatch.test(task || "")) return null;
  const taskKey = `${category}|${item}|${task}`;
  const tracked = suppliesState?.tracked?.[taskKey];
  return { taskKey, name: def.name, qtyOnHand: tracked?.qtyOnHand ?? null };
}
