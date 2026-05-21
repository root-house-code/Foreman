export function loadMaintenanceStartDates() {
  return JSON.parse(localStorage.getItem("maintenance-start-dates") || "{}");
}
export function saveMaintenanceStartDates(obj) {
  localStorage.setItem("maintenance-start-dates", JSON.stringify(obj));
}
export function maintenanceKey(row) {
  return `${row.category}|${row.item}|${row.task}`;
}

const RECORDS_KEY = "foreman-maintenance-completion-records";

export function loadMaintenanceCompletionRecords() {
  try { return JSON.parse(localStorage.getItem(RECORDS_KEY) || "{}"); }
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
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}
