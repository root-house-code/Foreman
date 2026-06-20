// Unified alert engine for the Alerts Inbox (and, later, the Dashboard Triage panel).
// CONSOLIDATION, NOT NEW CALCULATION: every signal here is derived by reusing the
// functions that already power the Dashboard, Lifecycle, Supplies, and Services
// pages. This module just gathers them into one prioritized, normalized list so a
// single surface — and eventually Triage — can share one engine.
//
// Pure over its inputs (store slices + the maintenance next-dates map); no React,
// no storage writes. An alert is:
//   { id, kind, severity, title, sub, date, detail, nav: { page, state? } }
//   kind     — 'maintenance' | 'chore' | 'warranty' | 'supply' | 'service'
//   severity — 'overdue' | 'soon' | 'info'   (drives color + sort order)

import { overdueTasks, upcomingTasks } from "./dashboardHelpers.js";
import { buildRoster, computeWarranties } from "./lifecycleStats.js";
import { buildSupplyRows } from "./supplies.js";
import { computeNextOccurrenceFromStart } from "./chores.js";

const SEVERITY_ORDER = { overdue: 0, soon: 1, info: 2 };

export const ALERT_KINDS = ["maintenance", "chore", "warranty", "supply", "service"];

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayDiff(target, base) {
  return Math.round((startOfDay(target) - startOfDay(base)) / 86400000);
}

// "due in 3 days" / "due today" / "2 days overdue" — shared by maintenance & chores.
function dueDetail(days) {
  if (days < 0) return `${-days} day${-days === 1 ? "" : "s"} overdue`;
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days} days`;
}

// Mirrors the Dashboard's choreNextDate: stored next date wins, else compute from start.
function choreNextDate(c, choreNextDates) {
  if (choreNextDates[c.id]) return new Date(choreNextDates[c.id]);
  if (!c.startDate) return null;
  return computeNextOccurrenceFromStart(new Date(c.startDate), c.schedule, c.dayOfWeek, c.timeOfDay);
}

export function buildAlerts(
  { itemFieldValues, inventory, supplies, services, chores = [], choreNextDates = {}, nextDatesMap = {}, budget = {} },
  now = new Date()
) {
  const alerts = [];

  // ── Maintenance (overdue + due within 7 days) — reuses dashboardHelpers, which
  //    load rows + next-dates and filter deleted categories/items internally. ──
  overdueTasks(now).forEach(t => {
    alerts.push({
      id: `maint:${t.id}`, kind: "maintenance", severity: "overdue",
      title: t.task, sub: `${t.category} · ${t.item}`,
      date: new Date(t.nextDue), detail: dueDetail(dayDiff(t.nextDue, now)),
      nav: { page: "maintenance" },
    });
  });
  upcomingTasks(7, now).forEach(t => {
    alerts.push({
      id: `maint:${t.id}`, kind: "maintenance", severity: "soon",
      title: t.task, sub: `${t.category} · ${t.item}`,
      date: new Date(t.nextDue), detail: dueDetail(dayDiff(t.nextDue, now)),
      nav: { page: "maintenance" },
    });
  });

  // ── Chores (overdue + due within 7 days) ──
  chores.forEach(c => {
    const d = choreNextDate(c, choreNextDates);
    if (!d) return;
    const days = dayDiff(d, now);
    if (days > 7) return;
    alerts.push({
      id: `chore:${c.id}`, kind: "chore", severity: days < 0 ? "overdue" : "soon",
      title: c.title, sub: c.room || "", date: d, detail: dueDetail(days),
      nav: { page: "chores" },
    });
  });

  // ── Warranties (lapsed ≤30d ago through 90d out) — reuses computeWarranties. ──
  computeWarranties(buildRoster(itemFieldValues, inventory), now).forEach(w => {
    const days = w.days;
    alerts.push({
      id: `warranty:${w.stableKey}`, kind: "warranty",
      severity: days < 0 ? "overdue" : days <= 30 ? "soon" : "info",
      title: `${w.item} warranty`, sub: w.category, date: w.warrantyDate,
      detail: days < 0 ? `lapsed ${-days}d ago` : `expires in ${days}d`,
      nav: { page: "inventory" },
    });
  });

  // ── Supplies (low or out of stock) — reuses buildSupplyRows. ──
  buildSupplyRows(itemFieldValues, inventory, nextDatesMap, supplies)
    .filter(r => r.status === "out" || r.status === "low")
    .forEach(r => {
      alerts.push({
        id: `supply:${r.key}`, kind: "supply",
        severity: r.status === "out" ? "overdue" : "soon",
        title: r.item || r.name || "Supply",
        sub: r.category === "Manual" ? "Manual supply" : `${r.category}${r.spec ? " · " + r.spec : ""}`,
        date: null, detail: r.status === "out" ? "out of stock" : "low stock",
        nav: { page: "supplies" },
      });
    });

  // ── Service renewals (within 30 days, or already past) ──
  Object.values(services?.services ?? {}).forEach(svc => {
    if (!svc.active || !svc.renewalDate) return;
    const d = new Date(svc.renewalDate + "T00:00:00");
    if (isNaN(d)) return;
    const days = dayDiff(d, now);
    if (days > 30) return;
    alerts.push({
      id: `service:${svc.id}`, kind: "service",
      severity: days < 0 ? "overdue" : days <= 7 ? "soon" : "info",
      title: `${svc.name} renewal`, sub: svc.provider || svc.category || "",
      date: d,
      detail: days < 0 ? `renewal ${-days}d overdue` : days === 0 ? "renews today" : `renews in ${days}d`,
      nav: { page: "services" },
    });
  });

  // ── Unlogged planned spend (past months with unreconciled planned items) ──
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  Object.entries(budget.planned || {}).forEach(([ym, items]) => {
    if (ym >= currentYm) return;
    (items || []).forEach(p => {
      if (p.expenseId) return;
      alerts.push({
        id: `planned:${ym}:${p.id}`, kind: "planned", severity: "info",
        title: p.label || "Planned expense",
        sub: `${ym} · ${typeof p.amount === "number" ? "$" + p.amount.toFixed(0) : ""}`,
        date: null, detail: "unlogged",
        nav: { page: "ledger" },
      });
    });
  });

  alerts.sort((a, b) =>
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
    (a.date && b.date ? a.date - b.date : a.date ? -1 : b.date ? 1 : 0)
  );
  return alerts;
}

// Severity tallies for header stats / unread-style counts.
export function summarizeAlerts(alerts) {
  let overdue = 0, soon = 0, info = 0;
  alerts.forEach(a => {
    if (a.severity === "overdue") overdue += 1;
    else if (a.severity === "soon") soon += 1;
    else info += 1;
  });
  return { overdue, soon, info, total: alerts.length };
}
