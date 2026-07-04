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

// ── Work Session (Phase 3+) ───────────────────────────────────────────────────
// Full-featured session: scheduled, sequenced, multi-assignee, history-persisted.
// Backward-compatible with the legacy `createSession` shape above.

export function createWorkSession({
  title      = "Work Session",
  date       = null,
  timeBlock  = null,
  assignees  = [],
  notes      = "",
  items      = [],
} = {}) {
  const existing = loadSessions();
  const maxSeq   = Object.values(existing).reduce((m, s) => Math.max(m, s.sequence ?? 0), 0);
  return {
    id:                `session-${Date.now()}-${rand5()}`,
    title,
    date,
    timeBlock,
    sequence:          maxSeq + 1,
    status:            "planned",
    assignees,
    assignee:          assignees[0] ?? "",
    items,
    estimatedDuration: computeSessionEstimate(items),
    actualDuration:    null,
    notes,
    createdAt:         new Date().toISOString(),
    startedAt:         null,
    endedAt:           null,
    completedAt:       null,
  };
}

export function computeSessionEstimate(items) {
  return items.reduce((sum, i) => sum + (i.estMinutes ?? 0), 0);
}

export function startSession(id) {
  return updateSession(id, { status: "in-progress", startedAt: new Date().toISOString() });
}

export function completeSession(id, { actualDuration = null, notes = "" } = {}) {
  const now = new Date().toISOString();
  return updateSession(id, { status: "complete", endedAt: now, completedAt: now, actualDuration, notes });
}

export function reorderSessions(sessionsMap, fromId, toId) {
  const arr = Object.values(sessionsMap).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const fromIdx = arr.findIndex(s => s.id === fromId);
  const toIdx   = arr.findIndex(s => s.id === toId);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return sessionsMap;
  const [moved] = arr.splice(fromIdx, 1);
  arr.splice(toIdx, 0, moved);
  const next = { ...sessionsMap };
  arr.forEach((s, i) => { next[s.id] = { ...s, sequence: i + 1 }; });
  return next;
}

export function addItemToSession(id, item) {
  const data = load();
  if (!data[id]) return data;
  const items = [...(data[id].items ?? []), item];
  data[id] = { ...data[id], items, estimatedDuration: computeSessionEstimate(items) };
  saveSessions(data);
  return data;
}

export function removeItemFromSession(sessionId, itemId) {
  const data = load();
  if (!data[sessionId]) return data;
  const items = (data[sessionId].items ?? []).filter(i => i.id !== itemId);
  data[sessionId] = { ...data[sessionId], items, estimatedDuration: computeSessionEstimate(items) };
  saveSessions(data);
  return data;
}

// Migrate old "active" sessions to "planned" so they appear in the queue.
export function migrateSessionShape(session) {
  if (session.status === "active") return { ...session, status: "planned", sequence: session.sequence ?? 1 };
  return session;
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

// Stable identity for a candidate across rebuilds — keyed on what it points at,
// not its position. Shared with the Workbench so estimate overrides line up.
export function candidateKey(c) {
  return `${c.kind}:${c.ref}:${c.choreDate || ""}`;
}

// ── Effort estimate (keyword heuristic; user can override per task) ────────────

export function estimateMinutes(kind, taskText = "") {
  if (kind === "chore") return 15;
  const t = (taskText || "").toLowerCase();
  if (/replace|swap|filter|battery|bulb/.test(t)) return 10;
  if (/test|check|inspect/.test(t)) return 15;
  if (/clean|flush|drain|lubricat/.test(t)) return 30;
  return 20;
}

// User-set estimate overrides, keyed by candidateKey. A thin map persisted apart
// from the heuristic so a manual minute count survives reloads and rebuilds and
// flows into the planned session; clearing one reverts to the heuristic.
const EST_KEY = "foreman-session-estimates";

export function loadEstimateOverrides() {
  try { return storageGet(EST_KEY) ?? {}; }
  catch { return {}; }
}

export function setEstimateOverride(key, minutes) {
  const data = loadEstimateOverrides();
  data[key] = minutes;
  storageSet(EST_KEY, data);
  return data;
}

export function clearEstimateOverride(key) {
  const data = loadEstimateOverrides();
  delete data[key];
  storageSet(EST_KEY, data);
  return data;
}

// ── Candidate building ────────────────────────────────────────────────────────
// One candidate per due/overdue maintenance task and chore, plus open to-dos
// due within `todoWindowDays`. Caller filters further (room/category/window).
//
// Candidate: { kind, ref, choreDate, label, sublabel, room, category, dueDate: Date,
//              estMinutes, stableKey? (maintenance only) }

export function buildSessionCandidates({ chores = [], todos = null, projects = null, inventory = {}, spatialAssignments = {}, now = new Date(), todoWindowDays = 7 } = {}) {
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
      // A chore carries its own duration (shared with the Chores page); the
      // keyword heuristic only supplies the initial value when it's unset.
      estMinutes: c.duration ?? estimateMinutes("chore", c.title),
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

  // Projects — open, with a due or target date.
  (projects ?? []).forEach(p => {
    if (p.status === "done" || p.status === "complete") return;
    const dateStr = p.dueDate || p.targetDate;
    if (!dateStr) return;
    const due = new Date(dateStr + "T00:00:00");
    if (isNaN(due)) return;
    out.push({
      kind:       "project",
      ref:        p.id,
      choreDate:  null,
      label:      p.name || p.title || "Project",
      sublabel:   p.category || "Project",
      category:   p.category || "Project",
      room:       p.room || "General",
      dueDate:    due,
      estMinutes: p.estimatedMinutes ?? estimateMinutes("project", p.name || p.title || ""),
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
