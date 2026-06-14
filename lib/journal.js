// Home Journal — a derived, reverse-chronological feed of everything that has
// happened to the house, aggregated from logs the app already writes. Pure and
// React-free (mirrors lib/lifecycleStats.js); writes nothing.
//
// JournalEvent: { id, type, date: "YYYY-MM-DD", title, subtitle, system, room,
//                 person, amount, notes }
// type ∈ "maintenance" | "chore" | "service" | "utility" | "expense" | "project"

export const JOURNAL_TYPES = ["maintenance", "chore", "service", "utility", "expense", "project", "session"];

function toISO(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10);
  const s = String(v);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

/**
 * Builds the unified journal from already-persisted logs.
 * All inputs are plain data (store slices + the two completion-record maps).
 */
export function buildJournal({
  maintenanceRecords = {},
  choreRecords = {},
  chores = [],
  services = { services: {}, visits: {} },
  utilities = { utilities: {}, bills: {} },
  expenses = {},
  projects = [],
  sessions = {},
} = {}) {
  const events = [];

  // ── Maintenance (latest completion per task) ──────────────────────────────
  Object.entries(maintenanceRecords).forEach(([key, rec]) => {
    const date = toISO(rec.completedAt);
    if (!date) return;
    const [category, item, task] = key.split("|");
    events.push({
      id: "m:" + key,
      type: "maintenance",
      date,
      title: [item, task].filter(Boolean).join(" · ") || task || "Maintenance",
      subtitle: category || "",
      system: category || "",
      room: "",
      person: rec.assignee || "",
      amount: null,
      notes: rec.notes || "",
    });
  });

  // ── Chores (per occurrence) ───────────────────────────────────────────────
  const choreById = {};
  chores.forEach(c => { choreById[c.id] = c; });
  Object.entries(choreRecords).forEach(([key, rec]) => {
    const keyDate = key.slice(key.lastIndexOf(":") + 1);
    const date = toISO(rec.completedAt) || toISO(keyDate);
    if (!date) return;
    const chore = choreById[rec.choreId];
    events.push({
      id: "c:" + key,
      type: "chore",
      date,
      title: chore?.title || rec.item || "Chore",
      subtitle: rec.room || chore?.room || "",
      system: "",
      room: rec.room || chore?.room || "",
      person: rec.assignee || "",
      amount: null,
      notes: rec.notes || "",
    });
  });

  // ── Service visits ────────────────────────────────────────────────────────
  const svcMap = services?.services || {};
  Object.values(services?.visits || {}).forEach(v => {
    const date = toISO(v.date);
    if (!date) return;
    const svc = svcMap[v.serviceId] || {};
    const cost = v.overrideCost != null ? v.overrideCost : svc.cost;
    events.push({
      id: "s:" + v.id,
      type: "service",
      date,
      title: svc.name || "Service visit",
      subtitle: v.techName ? `Tech: ${v.techName}` : (svc.providerName || ""),
      system: "",
      room: "",
      person: "",
      amount: cost != null ? Number(cost) : null,
      notes: v.notes || "",
    });
  });

  // ── Utility bills ─────────────────────────────────────────────────────────
  const utilMap = utilities?.utilities || {};
  Object.values(utilities?.bills || {}).forEach(b => {
    const date = toISO(b.periodMonth ? b.periodMonth + "-01" : null);
    if (!date) return;
    const u = utilMap[b.utilityId] || {};
    const usageLabel = (b.usage != null && u.unitLabel) ? `${b.usage} ${u.unitLabel}` : "";
    const typeLabel = u.type === "Other" ? (u.customType || "") : (u.type || "");
    events.push({
      id: "u:" + b.id,
      type: "utility",
      date,
      title: u.name || "Utility bill",
      subtitle: usageLabel || typeLabel,
      system: "",
      room: "",
      person: "",
      amount: b.amount != null ? Number(b.amount) : null,
      notes: "",
    });
  });

  // ── Expenses ──────────────────────────────────────────────────────────────
  Object.values(expenses || {}).forEach(e => {
    const date = toISO(e.date);
    if (!date) return;
    events.push({
      id: "e:" + e.id,
      type: "expense",
      date,
      title: e.label || "Expense",
      subtitle: "",
      system: "",
      room: "",
      person: "",
      amount: e.amount != null ? Number(e.amount) : null,
      notes: "",
    });
  });

  // ── Projects (logged at creation) ─────────────────────────────────────────
  projects.forEach(p => {
    const date = toISO(p.createdAt);
    if (!date) return;
    events.push({
      id: "p:" + p.id,
      type: "project",
      date,
      title: p.name || "Project",
      subtitle: p.status ? `Project · ${p.status.replace("-", " ")}` : "Project",
      system: p.linkedSystem || "",
      room: p.linkedRoom || "",
      person: p.assignee || "",
      amount: null,
      notes: p.description || "",
    });
  });

  // ── Work sessions (one event per completed session) ───────────────────────
  Object.values(sessions || {}).forEach(s => {
    if (s.status !== "done") return;
    const date = toISO(s.endedAt);
    if (!date) return;
    const counts = { done: 0, skipped: 0, blocked: 0 };
    (s.items || []).forEach(i => { if (counts[i.result] !== undefined) counts[i.result] += 1; });
    events.push({
      id: "w:" + s.id,
      type: "session",
      date,
      title: s.title || "Work session",
      subtitle: `${counts.done} done · ${counts.skipped} skipped${counts.blocked ? ` · ${counts.blocked} blocked` : ""}`,
      system: "",
      room: "",
      person: s.assignee || "",
      amount: null,
      notes: "",
    });
  });

  return events
    .filter(e => e.date)
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}
