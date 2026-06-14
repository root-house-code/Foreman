// Work Sessions ("Workbench") — pure, React-free data layer.
// Sessions are a batch-execution record: plan a set of due tasks, run them one
// at a time, and keep a durable per-item result log. Storage mirrors the
// foreman-expenses pattern: a map keyed by id under one key.

import { storageGet, storageSet } from "./storage.js";
import { loadData } from "./data.js";
import { loadDeletedCategories } from "./deletedCategories.js";
import { loadDeletedItems } from "./deletedItems.js";
import { getEffectiveRowState } from "./inventory.js";
import { getItemStableKey } from "./itemKeys.js";
import { maintenanceKey } from "./maintenance.js";
import { loadChoreNextDates } from "./chores.js";
import { loadTodos } from "./todos.js";

const KEY = "foreman-sessions";

function rand5() { return Math.random().toString(36).slice(2, 7); }

function load() {
  try { return storageGet(KEY) ?? {}; }
  catch { return {}; }
}

export function loadSessions() { return load(); }
export function saveSessions(data) { storageSet(KEY, data); }

export function addSession(session) {
  const data = load();
  data[session.id] = session;
  saveSessions(data);
  return data;
}

export function updateSession(id, updates) {
  const data = load();
  if (!data[id]) return data;
  data[id] = { ...data[id], ...updates, id };
  saveSessions(data);
  return data;
}

export function deleteSession(id) {
  const data = load();
  delete data[id];
  saveSessions(data);
  return data;
}

export function createSession({ title = "", assignee = "", items = [] } = {}) {
  return {
    id: `session-${Date.now()}-${rand5()}`,
    status: "active",
    title,
    assignee,
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    endedAt: null,
    items,
  };
}

// Snapshot label/sublabel/room at plan time — maintenance composite keys break
// on rename, and History must still render meaningfully.
export function createSessionItem({ kind, ref, choreDate = null, label, sublabel = "", room = "", estMinutes = null }) {
  return {
    id: `si-${rand5()}${rand5()}`,
    kind,                 // "maintenance" | "chore" | "todo"
    ref,                  // maintenance: "cat|item|task"; chore: choreId; todo: todoId
    choreDate,            // "YYYY-MM-DD" occurrence (chores only)
    label,
    sublabel,
    room,
    estMinutes,
    result: null,         // null | "done" | "skipped" | "blocked"
    resultNotes: "",
    completedAt: null,
    spawnedTodoId: null,
  };
}

// ── Effort estimate (display-only keyword heuristic; v1 stores on the item) ───

export function estimateMinutes(kind, taskText = "") {
  if (kind === "chore") return 15;
  const t = (taskText || "").toLowerCase();
  if (/replace|swap|filter|battery|bulb/.test(t)) return 10;
  if (/test|check|inspect/.test(t)) return 15;
  if (/clean|flush|drain|lubricat/.test(t)) return 30;
  return 20;
}

// ── Candidate building ────────────────────────────────────────────────────────
// One candidate per due/overdue maintenance task and chore, plus open to-dos
// due within `todoWindowDays`. Caller filters further (room/category/window).
//
// Candidate: { kind, ref, choreDate, label, sublabel, room, category, dueDate: Date,
//              estMinutes, stableKey? (maintenance only) }

export function buildSessionCandidates({ chores = [], todos = null, inventory = {}, spatialAssignments = {}, now = new Date(), todoWindowDays = 7 } = {}) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const out = [];

  // Maintenance — mirror the Dashboard's activeRows exclusions + inventory state.
  const rows = loadData();
  const deletedCategories = loadDeletedCategories();
  const deletedItems = loadDeletedItems();
  const nextDates = storageGet("maintenance-next-dates") ?? {};
  rows.forEach(row => {
    if (row._isBlankCategory || !row.category || !row.item || !row.task) return;
    if (deletedCategories.has(row.category)) return;
    if (deletedItems.has(`${row.category}|${row.item}`)) return;
    if (getEffectiveRowState(inventory, row) !== "included") return;
    const key = maintenanceKey(row);
    const d = nextDates[key];
    if (!d) return;
    const due = new Date(d);
    if (isNaN(due)) return;
    const stableKey = getItemStableKey(row);
    const spatial = spatialAssignments[stableKey] || {};
    out.push({
      kind: "maintenance",
      ref: key,
      choreDate: null,
      label: `${row.item} · ${row.task}`,
      sublabel: row.category,
      category: row.category,
      room: spatial.roomLabel || spatial.exteriorLabel || "General",
      dueDate: due,
      estMinutes: estimateMinutes("maintenance", row.task),
      stableKey,
      row, // live row — used by the runner for schedule/season; not persisted
    });
  });

  // Chores — due when next date is known.
  const choreNext = loadChoreNextDates();
  chores.forEach(c => {
    const d = choreNext[c.id];
    if (!d) return;
    const due = new Date(d);
    if (isNaN(due)) return;
    out.push({
      kind: "chore",
      ref: c.id,
      choreDate: due.toISOString().slice(0, 10),
      label: c.title,
      sublabel: c.item || "Chore",
      category: c.room || "Chore",
      room: c.room || "General",
      dueDate: due,
      estMinutes: estimateMinutes("chore", c.title),
      chore: c, // live chore — used by the runner for schedule; not persisted
    });
  });

  // To-dos — open, dated within the window.
  const windowEnd = new Date(today); windowEnd.setDate(windowEnd.getDate() + todoWindowDays);
  (todos ?? loadTodos()).forEach(t => {
    if (t.status === "done" || !t.dueDate) return;
    const due = new Date(t.dueDate + "T00:00:00");
    if (isNaN(due) || due > windowEnd) return;
    out.push({
      kind: "todo",
      ref: t.id,
      choreDate: null,
      label: t.title,
      sublabel: t.linkedItem || "To Do",
      category: t.linkedCategory || "To Do",
      room: t.linkedRoom || t.linkedExterior || "General",
      dueDate: due,
      estMinutes: estimateMinutes("todo", t.title),
    });
  });

  return out.sort((a, b) => a.dueDate - b.dueDate);
}

// Room-by-room ordering for the runner: group items by room (insertion order of
// first appearance, "General" last), preserving due order within each room.
export function orderByRoom(items) {
  const groups = new Map();
  items.forEach(it => {
    const room = it.room || "General";
    if (!groups.has(room)) groups.set(room, []);
    groups.get(room).push(it);
  });
  const rooms = [...groups.keys()].sort((a, b) => {
    if (a === "General") return 1;
    if (b === "General") return -1;
    return 0; // stable: keep first-appearance order otherwise
  });
  return rooms.flatMap(r => groups.get(r));
}
