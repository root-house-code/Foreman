const KEY = "foreman-chore-done-dates";
const RECORDS_KEY = "foreman-chore-completion-records";

export function loadChoreCompletionRecords() {
  try { return JSON.parse(localStorage.getItem(RECORDS_KEY) || "{}"); }
  catch { return {}; }
}

export function saveChoreCompletionRecord(choreId, date, details) {
  const records = loadChoreCompletionRecords();
  records[choreOccurrenceKey(choreId, date)] = {
    choreId,
    completedAt: details.completedAt,
    assignee:    details.assignee  || "",
    room:        details.room      || "",
    roomId:      details.roomId    || null,
    item:        details.item      || "",
    notes:       details.notes     || "",
    savedAt:     Date.now(),
  };
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

export function getChoreCompletionRecord(choreId, date) {
  const records = loadChoreCompletionRecords();
  return records[choreOccurrenceKey(choreId, date)] || null;
}

// Key format: "choreId:YYYY-MM-DD"
export function choreOccurrenceKey(choreId, date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${choreId}:${y}-${m}-${day}`;
}

export function loadChoreCompletions() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); }
  catch { return {}; }
}

export function saveChoreCompletions(completions) {
  localStorage.setItem(KEY, JSON.stringify(completions));
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
