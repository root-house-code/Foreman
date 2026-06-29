import { storageGet, storageSet } from "./storage.js";

export function loadMaintenanceStartDates() {
  return storageGet("maintenance-start-dates") ?? {};
}
export function saveMaintenanceStartDates(obj) {
  storageSet("maintenance-start-dates", obj);
}
export function maintenanceKey(row) {
  return `${row.category}|${row.item}|${row.task}`;
}

const RECORDS_KEY = "foreman-maintenance-completion-records";

export function loadMaintenanceCompletionRecords() {
  try { return storageGet(RECORDS_KEY) ?? {}; }
  catch { return {}; }
}

export function saveMaintenanceCompletionRecord(key, details) {
  const records = loadMaintenanceCompletionRecords();
  records[key] = {
    completedAt: details.completedAt || "",
    assignee:    details.assignee    || "",
    notes:       details.notes       || "",
    savedAt:     Date.now(),
  };
  storageSet(RECORDS_KEY, records);
}

// Patch individual fields of an existing completion record (inline history edit).
// Returns the new records map so callers can mirror it into component state.
export function updateMaintenanceCompletionRecord(key, patch) {
  const records = loadMaintenanceCompletionRecords();
  if (!records[key]) return records;
  const next = { ...records, [key]: { ...records[key], ...patch, savedAt: Date.now() } };
  storageSet(RECORDS_KEY, next);
  return next;
}
