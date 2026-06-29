import { storageGet, storageSet } from "./storage.js";

const KEY = "foreman-chore-done-dates";
const RECORDS_KEY = "foreman-chore-completion-records";

export function loadChoreCompletionRecords() {
  try { return storageGet(RECORDS_KEY) ?? {}; }
  catch { return {}; }
}

export function saveChoreCompletionRecord(choreId, date, details) {
  const records = loadChoreCompletionRecords();
  // Normalize assignees to an array; accept either the new `assignees` array or
  // a legacy single `assignee` string. `assignee` is kept as a joined string for
  // backward compatibility (history search, older readers). `duration` is the
  // TOTAL time; per-person time = duration / assignees.length (timekeeping).
  const assignees = Array.isArray(details.assignees)
    ? details.assignees.filter(Boolean)
    : (details.assignee ? [details.assignee] : []);
  records[choreOccurrenceKey(choreId, date)] = {
    choreId,
    completedAt: details.completedAt,
    assignees,
    assignee:    assignees.join(", "),
    room:        details.room      || "",
    roomId:      details.roomId    || null,
    item:        details.item      || "",
    notes:       details.notes     || "",
    duration:    details.duration  || "",
    savedAt:     Date.now(),
  };
  storageSet(RECORDS_KEY, records);
}

// Patch individual fields of an existing completion record (inline history edit).
// `assignees` is kept in sync with `assignee` when either is patched. Returns the
// new records map so callers can mirror it into component state.
export function updateChoreCompletionRecord(key, patch) {
  const records = loadChoreCompletionRecords();
  if (!records[key]) return records;
  const merged = { ...records[key], ...patch };
  if ("assignee" in patch && !("assignees" in patch)) {
    merged.assignees = patch.assignee
      ? patch.assignee.split(",").map(s => s.trim()).filter(Boolean)
      : [];
  }
  if ("assignees" in patch && !("assignee" in patch)) {
    merged.assignee = (merged.assignees || []).join(", ");
  }
  merged.savedAt = Date.now();
  const next = { ...records, [key]: merged };
  storageSet(RECORDS_KEY, next);
  return next;
}

export function getChoreCompletionRecord(choreId, date) {
  const records = loadChoreCompletionRecords();
  return records[choreOccurrenceKey(choreId, date)] || null;
}

export function choreOccurrenceKey(choreId, date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${choreId}:${y}-${m}-${day}`;
}

export function loadChoreCompletions() {
  try { return storageGet(KEY) ?? {}; }
  catch { return {}; }
}

export function saveChoreCompletions(completions) {
  storageSet(KEY, completions);
}

export function isChoreCompleted(completions, choreId, date) {
  return !!completions[choreOccurrenceKey(choreId, date)];
}

export function toggleChoreCompletion(completions, choreId, date) {
  const k = choreOccurrenceKey(choreId, date);
  const next = { ...completions };
  if (next[k]) delete next[k];
  else next[k] = true;
  return next;
}
