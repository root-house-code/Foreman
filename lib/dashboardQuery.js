// Dashboard visualization query engine.
// Reads from Foreman storage and runs groupBy/measure/filter queries.
// runQuery returns { rows, series }:
//   rows   — [{ label, <seriesKey>: number, ... }] (single-series uses key "value")
//   series — ordered series keys; ["value"] when the query has no splitBy
// Month/year group keys sort chronologically (never alphabetically), and month
// series over a bounded range are gap-filled so a quiet month reads as 0, not
// as a skipped tick.

import { storageGet } from "./storage.js";
import { getItemStableKey } from "./itemKeys.js";

// ── Date range presets ────────────────────────────────────────────────────────

export const DATE_RANGE_PRESETS = {
  "last-30-days": {
    label: "Last 30 days",
    getRange() { const to = new Date(); const from = new Date(to); from.setDate(from.getDate() - 30); return { from, to }; },
  },
  "last-3-months": {
    label: "Last 3 months",
    getRange() { const to = new Date(); const from = new Date(to); from.setMonth(from.getMonth() - 3); return { from, to }; },
  },
  "last-6-months": {
    label: "Last 6 months",
    getRange() { const to = new Date(); const from = new Date(to); from.setMonth(from.getMonth() - 6); return { from, to }; },
  },
  "last-12-months": {
    label: "Last 12 months",
    getRange() { const to = new Date(); const from = new Date(to); from.setMonth(from.getMonth() - 12); return { from, to }; },
  },
  "this-year": {
    label: "This year",
    getRange() { const to = new Date(); const from = new Date(to.getFullYear(), 0, 1); return { from, to }; },
  },
  "all-time": {
    label: "All time",
    getRange() { return { from: null, to: null }; },
  },
};

// ── Measures ──────────────────────────────────────────────────────────────────

export const MEASURES = [
  { id: "count",    label: "Count",          needsField: false, desc: "Number of records in each group" },
  { id: "sum",      label: "Sum",            needsField: true,  desc: "Sum of a numeric field" },
  { id: "avg",      label: "Average",        needsField: true,  desc: "Average of a numeric field" },
  { id: "min",      label: "Minimum",        needsField: true,  desc: "Smallest value of a numeric field" },
  { id: "max",      label: "Maximum",        needsField: true,  desc: "Largest value of a numeric field" },
  { id: "distinct", label: "Distinct count", needsField: true,  fieldType: "any", desc: "Number of unique values of a field" },
];

// ── Data source definitions ───────────────────────────────────────────────────

export const DATA_SOURCES = {
  "maintenance-completions": {
    label: "Maintenance Completions",
    description: "Logged maintenance task completions with date, category, item, and assignee",
    dateField: "completedAt",
    fields: [
      { field: "category",   label: "Category",   type: "string" },
      { field: "item",       label: "Item",        type: "string" },
      { field: "task",       label: "Task",        type: "string" },
      { field: "assignee",   label: "Assignee",    type: "string" },
      { field: "month",      label: "Month",       type: "derived" },
      { field: "year",       label: "Year",        type: "derived" },
    ],
  },
  "chore-completions": {
    label: "Chore Completions",
    description: "Logged chore completions with date, room, assignee, and duration",
    dateField: "completedAt",
    // Expanded to one row per assignee only when a query groups/filters by
    // assignee (see runQuery), so each person is credited the full chore time.
    expand: { field: "assignee", listKey: "assignees" },
    fields: [
      { field: "title",           label: "Chore Title", type: "string" },
      { field: "room",            label: "Room",        type: "string" },
      { field: "assignee",        label: "Assignee",    type: "string" },
      { field: "durationMinutes", label: "Minutes",     type: "number" },
      { field: "month",           label: "Month",       type: "derived" },
      { field: "year",            label: "Year",        type: "derived" },
    ],
  },
  "spending": {
    label: "Spending",
    description: "Expense records from the ledger",
    dateField: "date",
    defaultFormat: "currency",
    fields: [
      { field: "category", label: "Category", type: "string" },
      { field: "payee",    label: "Payee",    type: "string" },
      { field: "amount",   label: "Amount",   type: "number" },
      { field: "month",    label: "Month",    type: "derived" },
      { field: "year",     label: "Year",     type: "derived" },
    ],
  },
  "services": {
    label: "Services",
    description: "Active recurring services and their monthly cost",
    dateField: null,
    defaultFormat: "currency",
    fields: [
      { field: "name",         label: "Service Name",  type: "string" },
      { field: "category",     label: "Category",      type: "string" },
      { field: "billingCycle", label: "Billing Cycle", type: "string" },
      { field: "monthlyCost",  label: "Monthly Cost",  type: "number" },
    ],
  },
  "utilities": {
    label: "Utility Bills",
    description: "Utility bills by type, provider, and billing month",
    dateField: "date",
    defaultFormat: "currency",
    fields: [
      { field: "type",    label: "Utility Type", type: "string" },
      { field: "utility", label: "Utility Name", type: "string" },
      { field: "amount",  label: "Amount",       type: "number" },
      { field: "usage",   label: "Usage",        type: "number" },
      { field: "month",   label: "Month",        type: "derived" },
      { field: "year",    label: "Year",         type: "derived" },
    ],
  },
  "inventory": {
    label: "Inventory",
    description: "Home inventory items by category and room",
    dateField: null,
    fields: [
      { field: "category", label: "Category", type: "string" },
      { field: "item",     label: "Item",     type: "string" },
      { field: "room",     label: "Room",     type: "string" },
    ],
  },
  "work-sessions": {
    label: "Work Sessions",
    description: "Work sessions with status, assignee, and duration",
    dateField: "completedAt",
    fields: [
      { field: "status",         label: "Status",           type: "string" },
      { field: "assignee",       label: "Assignee",         type: "string" },
      { field: "estMinutes",     label: "Planned Minutes",  type: "number" },
      { field: "actualMinutes",  label: "Actual Minutes",   type: "number" },
      { field: "month",          label: "Month",            type: "derived" },
    ],
  },
};

export function getSourceFields(sourceId) {
  return DATA_SOURCES[sourceId]?.fields ?? [];
}

// ── Raw record loaders ────────────────────────────────────────────────────────

function loadMaintenanceCompletions() {
  const raw = storageGet("foreman-maintenance-completion-records") ?? {};
  const records = [];
  Object.entries(raw).forEach(([key, details]) => {
    const [category, item, task] = key.split("|");
    records.push({
      category: category || "",
      item: item || "",
      task: task || "",
      assignee: details.assignee || "",
      completedAt: details.completedAt || null,
    });
  });
  return records;
}

function parseDurationMinutes(str) {
  if (!str || typeof str !== "string") return 0;
  const [h, m] = str.split(":").map(n => parseInt(n, 10) || 0);
  return h * 60 + m;
}

function loadChoreCompletionRecords() {
  const raw = storageGet("foreman-chore-completion-records") ?? {};
  const records = [];
  Object.entries(raw).forEach(([key, entry]) => {
    if (!entry) return;
    const assignees = Array.isArray(entry.assignees) && entry.assignees.length
      ? entry.assignees
      : (entry.assignee ? [entry.assignee] : [""]);
    records.push({
      title: entry.title || entry.choreId || key,
      room: entry.room || "",
      assignee: assignees.join(", "),
      assignees,
      durationMinutes: parseDurationMinutes(entry.duration),
      completedAt: entry.completedAt || entry.date || null,
    });
  });
  return records;
}

function loadSpendingRecords() {
  const raw = storageGet("foreman-expenses") ?? {};
  const records = [];
  Object.values(raw).forEach(exp => {
    if (Array.isArray(exp)) {
      exp.forEach(e => records.push({ category: e.category || "", payee: e.payee || "", amount: Number(e.amount) || 0, date: e.date || null }));
    } else if (exp && typeof exp === "object") {
      records.push({ category: exp.category || "", payee: exp.payee || "", amount: Number(exp.amount) || 0, date: exp.date || null });
    }
  });
  return records;
}

const CYCLE_MONTHS = { monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, annual: 12 };

function loadServiceRecords() {
  const raw = storageGet("foreman-services") ?? { services: {}, visits: {} };
  return Object.values(raw.services ?? {}).filter(s => s.active !== false).map(s => ({
    name: s.name || "",
    category: s.category || "General",
    billingCycle: s.billingCycle || "monthly",
    monthlyCost: (Number(s.cost) || 0) / (CYCLE_MONTHS[s.billingCycle] || 1),
  }));
}

// foreman-utilities is { utilities: {id: {...}}, bills: {id: {utilityId, periodMonth,
// amount, usage, ...}} } — bills carry a "YYYY-MM" periodMonth, not a full date.
function loadUtilityRecords() {
  const raw = storageGet("foreman-utilities") ?? {};
  const utils = raw.utilities ?? {};
  return Object.values(raw.bills ?? {}).map(b => {
    const u = utils[b.utilityId] || {};
    return {
      type: u.type === "Other" ? (u.customType || "Other") : (u.type || "Unknown"),
      utility: u.name || "Unknown",
      amount: Number(b.amount) || 0,
      usage: Number(b.usage) || 0,
      date: b.periodMonth ? b.periodMonth + "-15T00:00:00" : null,
    };
  });
}

function loadInventoryRecords() {
  const rows = storageGet("home-maintenance-data") ?? [];
  const custom = storageGet("foreman-custom-data") ?? [];
  const spatial = storageGet("foreman-spatial-assignments") ?? {};
  const seen = new Set();
  const records = [];
  [...rows, ...custom].forEach(row => {
    if (!row.category || !row.item || row._isBlankCategory) return;
    const k = `${row.category}|${row.item}`;
    if (seen.has(k)) return;
    seen.add(k);
    const sp = spatial[getItemStableKey(row)] || {};
    records.push({ category: row.category, item: row.item, room: sp.roomLabel || sp.exteriorLabel || "Unassigned" });
  });
  return records;
}

function loadWorkSessionRecords() {
  const raw = storageGet("foreman-sessions") ?? {};
  return Object.values(raw).map(s => ({
    status: s.status || "planned",
    assignee: s.assignees?.[0] || s.assignee || "",
    completedAt: s.completedAt || s.endedAt || null,
    estMinutes: Number(s.estimatedDuration) || 0,
    actualMinutes: Number(s.actualDuration) || 0,
  }));
}

export function getDataSource(sourceId) {
  switch (sourceId) {
    case "maintenance-completions": return loadMaintenanceCompletions();
    case "chore-completions":       return loadChoreCompletionRecords();
    case "spending":                return loadSpendingRecords();
    case "services":                return loadServiceRecords();
    case "utilities":               return loadUtilityRecords();
    case "inventory":               return loadInventoryRecords();
    case "work-sessions":           return loadWorkSessionRecords();
    default: return [];
  }
}

// Distinct observed values for a field — feeds the builder's filter-value
// suggestions so users pick from real data instead of guessing spellings.
export function getFieldValues(sourceId, field) {
  const dateField = DATA_SOURCES[sourceId]?.dateField;
  const seen = new Set();
  getDataSource(sourceId).forEach(r => {
    const v = resolveField(r, field, dateField);
    if (v !== null && v !== "" && v !== "Unknown") seen.add(String(v));
  });
  return [...seen].sort().slice(0, 50);
}

// ── Derived field resolvers ───────────────────────────────────────────────────

// Months resolve to a "YYYY-MM" sort key; formatMonthLabel renders it for display.
function monthKey(record, dateField) {
  const d = dateField && record[dateField] ? new Date(record[dateField]) : null;
  if (!d || isNaN(d)) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthLabel(key) {
  const [y, m] = String(key).split("-").map(Number);
  if (!y || !m) return String(key);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });
}

function resolveField(record, field, dateField) {
  if (field === "month") return monthKey(record, dateField) ?? "Unknown";
  if (field === "year") {
    const d = dateField && record[dateField] ? new Date(record[dateField]) : null;
    if (!d || isNaN(d)) return "Unknown";
    return String(d.getFullYear());
  }
  return record[field] ?? null;
}

// ── Date range filter ─────────────────────────────────────────────────────────

function resolveRange(dateRange) {
  return typeof dateRange === "string"
    ? (DATE_RANGE_PRESETS[dateRange]?.getRange() ?? { from: null, to: null })
    : (dateRange ?? { from: null, to: null });
}

function inDateRange(record, dateField, range) {
  if (!dateField) return true;
  const { from, to } = range;
  if (!from && !to) return true;
  const d = record[dateField] ? new Date(record[dateField]) : null;
  if (!d || isNaN(d)) return false;
  if (from && d < from) return false;
  if (to   && d > to)   return false;
  return true;
}

// ── Field filter ──────────────────────────────────────────────────────────────

export const FILTER_OPS = [
  { id: "eq",       label: "equals" },
  { id: "neq",      label: "not equals" },
  { id: "contains", label: "contains" },
  { id: "gt",       label: ">" },
  { id: "gte",      label: "≥" },
  { id: "lt",       label: "<" },
  { id: "lte",      label: "≤" },
];

function matchesFilters(record, filters, dateField) {
  if (!filters || filters.length === 0) return true;
  return filters.every(f => {
    const val = resolveField(record, f.field, dateField);
    const fv  = f.value;
    switch (f.op) {
      case "eq":       return String(val).toLowerCase() === String(fv).toLowerCase();
      case "neq":      return String(val).toLowerCase() !== String(fv).toLowerCase();
      case "contains": return String(val).toLowerCase().includes(String(fv).toLowerCase());
      case "gt":       return Number(val) >  Number(fv);
      case "gte":      return Number(val) >= Number(fv);
      case "lt":       return Number(val) <  Number(fv);
      case "lte":      return Number(val) <= Number(fv);
      default: return true;
    }
  });
}

// ── Aggregation helpers ───────────────────────────────────────────────────────

function newAgg() { return { sum: 0, count: 0, min: null, max: null, distinct: new Set() }; }

function feedAgg(agg, record, measure, measureField, dateField) {
  agg.count++;
  if (!measureField) return;
  const v = resolveField(record, measureField, dateField);
  if (measure === "distinct") { if (v !== null && v !== "") agg.distinct.add(String(v)); return; }
  const n = Number(v ?? 0);
  agg.sum += n;
  agg.min = agg.min === null ? n : Math.min(agg.min, n);
  agg.max = agg.max === null ? n : Math.max(agg.max, n);
}

function finishAgg(agg, measure) {
  switch (measure) {
    case "sum":      return agg.sum;
    case "avg":      return agg.count > 0 ? agg.sum / agg.count : 0;
    case "min":      return agg.min ?? 0;
    case "max":      return agg.max ?? 0;
    case "distinct": return agg.distinct.size;
    default:         return agg.count;
  }
}

// Palette has 6 fixed categorical slots; a 7th series folds into "Other"
// rather than minting a new hue (smallest-total series get folded).
const MAX_SERIES = 6;

// ── Query runner ──────────────────────────────────────────────────────────────

/**
 * Config shape:
 *   source, measure, measureField, groupBy, splitBy?,
 *   filter: [{field, op, value}], dateRange, sortBy, sortDir, limit
 *
 * Returns { rows, series }.
 */
export function runQuery(config = {}) {
  const {
    source,
    measure    = "count",
    measureField,
    groupBy,
    splitBy    = "",
    filter     = [],
    dateRange  = "all-time",
    sortBy     = "value",
    sortDir    = "desc",
    limit      = null,
  } = config;

  const sourceDef = DATA_SOURCES[source];
  if (!sourceDef) return { rows: [], series: ["value"] };

  let records  = getDataSource(source);
  const dateField = sourceDef.dateField;
  const range = resolveRange(dateRange);

  // Expand multi-value rows (e.g. chore assignees) into one row per value, but
  // ONLY when the query is scoped to that field — grouped/split by it or
  // filtered on it. Scoped queries credit each value the full measure;
  // unscoped groupings keep one wall-clock row per record (no double count).
  const expand = sourceDef.expand;
  if (expand && (groupBy === expand.field || splitBy === expand.field || filter.some(f => f.field === expand.field))) {
    records = records.flatMap(r => {
      const vals = Array.isArray(r[expand.listKey]) && r[expand.listKey].length
        ? r[expand.listKey]
        : [r[expand.field] ?? ""];
      return vals.map(v => ({ ...r, [expand.field]: v }));
    });
  }

  // buckets: groupKey -> (splitKey -> agg); single-series uses splitKey "value"
  const buckets = new Map();

  records.forEach(record => {
    if (!inDateRange(record, dateField, range)) return;
    if (!matchesFilters(record, filter, dateField)) return;

    const gKey = groupBy ? String(resolveField(record, groupBy, dateField) ?? "Unknown") : "Total";
    const sKey = splitBy ? String(resolveField(record, splitBy, dateField) ?? "Unknown") : "value";

    if (!buckets.has(gKey)) buckets.set(gKey, new Map());
    const splitMap = buckets.get(gKey);
    if (!splitMap.has(sKey)) splitMap.set(sKey, newAgg());
    feedAgg(splitMap.get(sKey), record, measure, measureField, dateField);
  });

  // Gap-fill months: a month with no records is a real 0, not a missing tick.
  if (groupBy === "month" && buckets.size > 0) {
    const keys = [...buckets.keys()].filter(k => /^\d{4}-\d{2}$/.test(k)).sort();
    if (keys.length > 0) {
      const startKey = range.from ? `${range.from.getFullYear()}-${String(range.from.getMonth() + 1).padStart(2, "0")}` : keys[0];
      const endKey   = range.to   ? `${range.to.getFullYear()}-${String(range.to.getMonth() + 1).padStart(2, "0")}`   : keys[keys.length - 1];
      let [y, m] = startKey.split("-").map(Number);
      for (let guard = 0; guard < 240; guard++) {
        const k = `${y}-${String(m).padStart(2, "0")}`;
        if (k > endKey) break;
        if (!buckets.has(k)) buckets.set(k, new Map());
        m++; if (m > 12) { m = 1; y++; }
      }
    }
  }

  // Series identity: alphabetical (stable — filters don't repaint survivors);
  // month/year splits sort chronologically. Overflow folds smallest into "Other".
  let series;
  if (!splitBy) {
    series = ["value"];
  } else {
    const totals = new Map();
    buckets.forEach(splitMap => splitMap.forEach((agg, sKey) => {
      totals.set(sKey, (totals.get(sKey) ?? 0) + finishAgg(agg, measure));
    }));
    let all = [...totals.keys()].sort();
    if (all.length > MAX_SERIES) {
      const keep = new Set([...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_SERIES - 1).map(([k]) => k));
      buckets.forEach(splitMap => {
        [...splitMap.entries()].forEach(([sKey, agg]) => {
          if (keep.has(sKey)) return;
          if (!splitMap.has("Other")) splitMap.set("Other", newAgg());
          const other = splitMap.get("Other");
          other.sum += agg.sum; other.count += agg.count;
          other.min = other.min === null ? agg.min : (agg.min === null ? other.min : Math.min(other.min, agg.min));
          other.max = other.max === null ? agg.max : (agg.max === null ? other.max : Math.max(other.max, agg.max));
          agg.distinct.forEach(v => other.distinct.add(v));
          splitMap.delete(sKey);
        });
      });
      all = [...[...keep].sort(), "Other"];
    }
    series = all;
  }

  const isMonthGroup = groupBy === "month";
  let rows = [...buckets.entries()].map(([gKey, splitMap]) => {
    const row = { label: isMonthGroup ? formatMonthLabel(gKey) : gKey, _sortKey: gKey };
    let total = 0;
    series.forEach(sKey => {
      const v = splitMap.has(sKey) ? finishAgg(splitMap.get(sKey), measure) : 0;
      row[sKey] = v;
      total += v;
    });
    row._total = total;
    return row;
  });

  // Sort: month/year labels always sort chronologically when sorting by label.
  rows.sort((a, b) => {
    let cmp;
    if (sortBy === "label") {
      cmp = isMonthGroup || groupBy === "year"
        ? String(a._sortKey).localeCompare(String(b._sortKey))
        : a.label.localeCompare(b.label);
    } else {
      cmp = a._total - b._total;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  if (limit && limit > 0 && rows.length > limit) {
    // A chronologically-ascending time series keeps its most RECENT periods
    // when truncated — cutting the newest months off a trend chart is never
    // what anyone means by "limit".
    const chronoAsc = (isMonthGroup || groupBy === "year") && sortBy === "label" && sortDir === "asc";
    rows = chronoAsc ? rows.slice(rows.length - limit) : rows.slice(0, limit);
  }
  rows.forEach(r => { delete r._sortKey; delete r._total; });

  return { rows, series };
}
