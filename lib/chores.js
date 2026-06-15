import { storageGet, storageSet } from "./storage.js";
import { defaultChores } from "../data/defaultChores.js";

export function createChore({ title = "", room = "Whole House", roomId = null, item = "", schedule = "every 1 weeks", dayOfWeek = null, timeOfDay = null, assignee = "", startDate = null, notes = "", duration = null } = {}) {
  return {
    id: `chore-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    room,
    roomId,
    item,
    schedule,
    dayOfWeek,
    timeOfDay,
    assignee,
    startDate,
    notes,
    duration,            // estimated effort in minutes; null → use the heuristic
    createdAt: new Date().toISOString(),
  };
}

export function computeNextOccurrenceFromStart(startDate, schedule, dayOfWeek, timeOfDay) {
  let base = new Date(startDate);

  if (dayOfWeek !== null && dayOfWeek !== undefined) {
    const daysUntil = (dayOfWeek - base.getDay() + 7) % 7;
    if (daysUntil > 0) base.setDate(base.getDate() + daysUntil);
  }
  if (timeOfDay) {
    const [h, m] = timeOfDay.split(":").map(Number);
    base.setHours(h, m, 0, 0);
  } else {
    base.setHours(0, 0, 0, 0);
  }

  const now = new Date();
  if (base >= now) return base;

  let candidate = base;
  while (candidate < now) {
    candidate = computeChoreNextDate(candidate, schedule, dayOfWeek, timeOfDay);
  }
  return candidate;
}

export function loadChores() {
  const data = storageGet("foreman-chores");
  if (!data) {
    const seeded = defaultChores.map((c, i) => ({
      ...createChore(c),
      id: `chore-default-${i}`,
    }));
    saveChores(seeded);
    return seeded;
  }
  return data;
}

export function saveChores(arr) {
  storageSet("foreman-chores", arr);
}

export function computeChoreNextDate(baseDate, schedule, dayOfWeek, timeOfDay) {
  const s = (schedule || "").toLowerCase();
  const d = new Date(baseDate);

  const daysMatch   = s.match(/every\s+(\d+)\s*days?/);
  const weeksMatch  = s.match(/every\s+(\d+)\s*weeks?/);
  const monthsMatch = s.match(/every\s+(\d+)\s*months?/);
  const yearsMatch  = s.match(/every\s+(\d+)\s*years?/);

  if (daysMatch)        d.setDate(d.getDate() + parseInt(daysMatch[1]));
  else if (weeksMatch)  d.setDate(d.getDate() + parseInt(weeksMatch[1]) * 7);
  else if (monthsMatch) d.setMonth(d.getMonth() + parseInt(monthsMatch[1]));
  else if (yearsMatch)  d.setFullYear(d.getFullYear() + parseInt(yearsMatch[1]));
  else                  d.setDate(d.getDate() + 7);

  if (dayOfWeek !== null && dayOfWeek !== undefined) {
    const daysUntil = (dayOfWeek - d.getDay() + 7) % 7;
    if (daysUntil > 0) d.setDate(d.getDate() + daysUntil);
  }

  if (timeOfDay) {
    const [h, m] = timeOfDay.split(":").map(Number);
    d.setHours(h, m, 0, 0);
  } else {
    d.setHours(0, 0, 0, 0);
  }

  return d;
}

export function loadChoreNextDates() {
  return storageGet("chore-next-dates") ?? {};
}
export function saveChoreNextDates(obj) {
  storageSet("chore-next-dates", obj);
}
export function loadChoreCompletedDates() {
  return storageGet("chore-completed-dates") ?? {};
}
export function saveChoreCompletedDates(obj) {
  storageSet("chore-completed-dates", obj);
}
export function loadChoreNotes() {
  return storageGet("chore-notes") ?? {};
}
export function saveChoreNotes(obj) {
  storageSet("chore-notes", obj);
}
