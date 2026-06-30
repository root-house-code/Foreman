// Dashboard visualization query engine.
// Reads from Foreman storage and runs groupBy/measure/filter queries,
// returning { label, value } arrays suitable for any chart type.

import { storageGet } from "./storage.js";

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
      { field: "title",           label: "Chore Title",         type: "string" },
      { field: "room",            label: "Room",                type: "string" },
      { field: "assignee",        label: "Assignee",            type: "string" },
      { field: "duration",        label: "Duration",            type: "string" },
      { field: "durationMinutes", label: "Minutes", type: "number" },
      { field: "month",           label: "Month",               type: "derived" },
      { field: "year",            label: "Year",                type: "derived" },
    ],
  },
  "spending": {
    label: "Spending",
    description: "Expense records from the ledger",
    dateField: "date",
    fields: [
      { field: "category", label: "Category",  type: "string" },
      { field: "payee",    label: "Payee",      type: "string" },
      { field: "amount",   label: "Amount",     type: "number" },
      { field: "month",    label: "Month",      type: "derived" },
      { field: "year",     label: "Year",       type: "derived" },
    ],
  },
  "services": {
    label: "Services",
    description: "Active recurring services and their monthly cost",
    dateField: null,
    fields: [
      { field: "name",         label: "Service Name",   type: "string" },
      { field: "category",     label: "Category",       type: "string" },
      { field: "billingCycle", label: "Billing Cycle",  type: "string" },
    ],
  },
  "utilities": {
    label: "Utilities",
    description: "Utility bills by type and month",
    dateField: "date",
    fields: [
      { field: "type",    label: "Utility Type", type: "string" },
      { field: "amount",  label: "Amount",        type: "number" },
      { field: "month",   label: "Month",         type: "derived" },
      { field: "year",    label: "Year",          type: "derived" },
    ],
  },
  "inventory": {
    label: "Inventory",
    description: "Home inventory items by category, room, and condition",
    dateField: null,
    fields: [
      { field: "category",  label: "Category",  type: "string" },
      { field: "item",      label: "Item",       type: "string" },
      { field: "condition", label: "Condition",  type: "string" },
      { field: "room",      label: "Room",       type: "string" },
    ],
  },
  "work-sessions": {
    label: "Work Sessions",
    description: "Completed work sessions with status, assignees, and duration",
    dateField: "completedAt",
    fields: [
      { field: "status",    label: "Status",      type: "string" },
      { field: "assignee",  label: "Assignee",    type: "string" },
      { field: "month",     label: "Month",       type: "derived" },
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
      notes: details.notes || "",
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
    // One row per completion carrying the FULL chore time. runQuery expands this
    // into one row per assignee ONLY when the query is scoped to assignee (group
    // or filter) — so per-assignee views credit each person the full time, while
    // other groupings keep a single wall-clock row per completion (no double count).
    const assignees = Array.isArray(entry.assignees) && entry.assignees.length
      ? entry.assignees
      : (entry.assignee ? [entry.assignee] : [""]);
    records.push({
      title: entry.title || entry.choreId || key,
      room: entry.room || "",
      assignee: assignees.join(", "),
      assignees,
      duration: entry.duration || "",
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

function loadServiceRecords() {
  const raw = storageGet("foreman-services") ?? { services: {}, visits: {} };
  return Object.values(raw.services ?? {}).map(s => ({
    name: s.name || "",
    category: s.category || "General",
    billingCycle: s.billingCycle || "monthly",
    active: s.active !== false,
  }));
}

function loadUtilityRecords() {
  const raw = storageGet("foreman-utilities") ?? {};
  const records = [];
  Object.values(raw).forEach(util => {
    if (!util || !util.bills) return;
    util.bills.forEach(b => {
      records.push({ type: util.type || "Unknown", amount: Number(b.amount) || 0, date: b.date || null });
    });
  });
  return records;
}

function loadInventoryRecords() {
  const raw = storageGet("foreman-inventory") ?? {};
  const rows = storageGet("home-maintenance-data") ?? [];
  const seen = new Set();
  const records = [];
  rows.forEach(row => {
    if (!row.category || !row.item || row._isBlankCategory) return;
    const k = `${row.category}|${row.item}`;
    if (seen.has(k)) return;
    seen.add(k);
    records.push({ category: row.category, item: row.item, condition: row.condition || "", room: row.room || "" });
  });
  return records;
}

function loadWorkSessionRecords() {
  const raw = storageGet("foreman-sessions") ?? {};
  return Object.values(raw).map(s => ({
    title: s.title || "",
    status: s.status || "planned",
    assignee: s.assignees?.[0] || s.assignee || "",
    completedAt: s.completedAt || s.endedAt || null,
    estimatedDuration: s.estimatedDuration || 0,
    actualDuration: s.actualDuration || null,
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

// ── Derived field resolvers ───────────────────────────────────────────────────

function resolveField(record, field, dateField) {
  if (field === "month") {
    const d = dateField && record[dateField] ? new Date(record[dateField]) : null;
    if (!d || isNaN(d)) return "Unknown";
    return d.toLocaleString("en-US", { year: "numeric", month: "short" });
  }
  if (field === "year") {
    const d = dateField && record[dateField] ? new Date(record[dateField]) : null;
    if (!d || isNaN(d)) return "Unknown";
    return String(d.getFullYear());
  }
  return record[field] ?? null;
}

// ── Date range filter ─────────────────────────────────────────────────────────

function inDateRange(record, dateField, dateRange) {
  if (!dateField || !dateRange) return true;
  const { from, to } = typeof dateRange === "string"
    ? (DATE_RANGE_PRESETS[dateRange]?.getRange() ?? { from: null, to: null })
    : dateRange;
  if (!from && !to) return true;
  const d = record[dateField] ? new Date(record[dateField]) : null;
  if (!d || isNaN(d)) return false;
  if (from && d < from) return false;
  if (to   && d > to)   return false;
  return true;
}

// ── Field filter ──────────────────────────────────────────────────────────────

function matchesFilters(record, filters, dateField) {
  if (!filters || filters.length === 0) return true;
  return filters.every(f => {
    const val = resolveField(record, f.field, dateField);
    const fv  = f.value;
    switch (f.op) {
      case "eq":       return String(val).toLowerCase() === String(fv).toLowerCase();
      case "neq":      return String(val).toLowerCase() !== String(fv).toLowerCase();
      case "contains": return String(val).toLowerCase().includes(String(fv).toLowerCase());
      case "gt":       return Number(val) > Number(fv);
      case "lt":       return Number(val) < Number(fv);
      default: return true;
    }
  });
}

// ── Query runner ──────────────────────────────────────────────────────────────

/**
 * Run a query config against a data source.
 *
 * Config shape:
 *   source:       "maintenance-completions" | ...
 *   measure:      "count" | "sum" | "avg"
 *   measureField: string | null  (required for sum/avg)
 *   groupBy:      string
 *   filter:       [{ field, op, value }]
 *   dateRange:    preset key | { from, to } | null
 *   sortBy:       "value" | "label"
 *   sortDir:      "asc" | "desc"
 *   limit:        number | null
 *
 * Returns: [{ label: string, value: number }]
 */
export function runQuery(config = {}) {
  const {
    source,
    measure    = "count",
    measureField,
    groupBy,
    filter     = [],
    dateRange  = "all-time",
    sortBy     = "value",
    sortDir    = "desc",
    limit      = null,
  } = config;

  const sourceDef = DATA_SOURCES[source];
  if (!sourceDef) return [];

  let records  = getDataSource(source);
  const dateField = sourceDef.dateField;

  // Expand multi-value rows (e.g. chore assignees) into one row per value, but
  // ONLY when the query is scoped to that field — grouped by it or filtered on
  // it. Scoped queries credit each value the full measure (per-assignee time);
  // unscoped groupings keep one wall-clock row per record (no double counting).
  const expand = sourceDef.expand;
  if (expand && (groupBy === expand.field || filter.some(f => f.field === expand.field))) {
    records = records.flatMap(r => {
      const vals = Array.isArray(r[expand.listKey]) && r[expand.listKey].length
        ? r[expand.listKey]
        : [r[expand.field] ?? ""];
      return vals.map(v => ({ ...r, [expand.field]: v }));
    });
  }

  const buckets = {};

  records.forEach(record => {
    if (!inDateRange(record, dateField, dateRange)) return;
    if (!matchesFilters(record, filter, dateField)) return;

    const key = groupBy ? String(resolveField(record, groupBy, dateField) ?? "Unknown") : "Total";

    if (!buckets[key]) buckets[key] = { sum: 0, count: 0 };
    buckets[key].count++;
    if ((measure === "sum" || measure === "avg") && measureField) {
      buckets[key].sum += Number(resolveField(record, measureField, dateField) ?? 0);
    }
  });

  let result = Object.entries(buckets).map(([label, b]) => ({
    label,
    value: measure === "sum" ? b.sum : measure === "avg" && b.count > 0 ? b.sum / b.count : b.count,
  }));

  // Sort
  result.sort((a, b) => {
    const va = sortBy === "value" ? a.value : a.label;
    const vb = sortBy === "value" ? b.value : b.label;
    const cmp = typeof va === "string" ? va.localeCompare(vb) : va - vb;
    return sortDir === "asc" ? cmp : -cmp;
  });

  if (limit && limit > 0) result = result.slice(0, limit);

  return result;
}
