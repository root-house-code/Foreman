// The Finances → Ledger: one backward-looking list of every paid transaction,
// consolidated from across Foreman. Pure functions over store slices.
//
// Sources:
//   • Expense  — logged repairs/parts (editable on the Ledger)
//   • Utility  — logged monthly bills (edit on the Utilities tab)
//   • Service  — generated per billing cycle, corrected by visits (see serviceCharges.js)
//   • Purchase — inventory items with a price + acquisition date (edit on Inventory)
//   • Mortgage — trailing months of the effective payment (edit on the Forecast tab)

import { buildRoster } from "./lifecycleStats.js";
import { generateServiceCharges } from "./serviceCharges.js";
import { mortgageLedger, hasMortgage } from "./budgetForecast.js";

/**
 * A LedgerRow is the unified "expense" supertype: every kind of money the home
 * costs, projected into one shape regardless of which slice owns it. The subtypes
 * (utility/service/purchase/mortgage) keep their own domain entities and pages;
 * this row is the read-model view over them. Some subtypes are stored discretely
 * (expense, utility), others are *generated* from a definition (service, mortgage)
 * or *derived* from another entity (purchase) — so a ledger row is not always a
 * row you can mutate directly. `refId` + the per-type extras say where it came
 * from and how to edit/delete it (see updateLedgerAmount/deleteLedgerRow in
 * lifecycle-page.jsx, which dispatch on `type`).
 *
 * Common fields (every row):
 * @typedef {Object} LedgerRow
 * @property {string}  id        Stable, unique row id, namespaced by source (e.g. "exp:…", "util:…", "svc:…:YYYY-MM", "buy:…", "mtg:YYYY-MM").
 * @property {string}  date      "YYYY-MM-DD" the cost is attributed to.
 * @property {number}  amount    Dollar amount.
 * @property {("expense"|"utility"|"service"|"purchase"|"mortgage")} type  The subtype.
 * @property {string}  label     Primary display name.
 * @property {string} [sublabel] Secondary detail (e.g. "bill", "scheduled", category, "corrected").
 * @property {string}  source    Originating slice — mirrors `type` ("expense"|"utility"|"service"|"purchase"|"mortgage").
 * @property {string}  refId     Id of the owning entity (expense id, utilityId, service id, item stableKey, or "YYYY-MM" for mortgage).
 *
 * Per-type extras (present only on the noted subtypes):
 * @property {boolean} [editable] expense — always true (the only freely-mutable subtype).
 * @property {Object}  [work]     expense — the linked project/to-do, if any.
 * @property {string}  [billId]   utility — the bill record id (refId is the utility, billId is the bill).
 * @property {string}  [ym]       service — "YYYY-MM" of the charge.
 * @property {string}  [visitId]  service — the visit backing a corrected/off-cycle charge, if any.
 * @property {boolean} [corrected] service — true when a logged visit overrides the scheduled amount.
 * @property {boolean} [offCycle] service — true when the charge is a visit outside the billing cycle.
 */

export const LEDGER_TYPES = ["expense", "utility", "service", "purchase", "mortgage"];
export const LEDGER_TYPE_LABEL = {
  expense:  "Repair / Expense",
  utility:  "Utility",
  service:  "Service",
  purchase: "Item Inventory",
  mortgage: "Mortgage",
};

export function buildLedger({ expensesMap, utilData, svcData, itemFieldValues, inventory, budget, projects, todos }, now = new Date()) {
  const rows = [];

  // Project / to-do names for attributed expenses.
  const projById = Object.fromEntries((projects || []).map(p => [p.id, p]));
  const todoById = Object.fromEntries((todos || []).map(t => [t.id, t]));
  const workName = (lw) => {
    if (!lw) return "";
    if (lw.kind === "project") return projById[lw.id]?.name || "Project";
    if (lw.kind === "todo") return todoById[lw.id]?.title || "To-Do";
    return "";
  };

  // Expenses (editable inline)
  Object.values(expensesMap || {}).forEach(e => {
    if (e.amount == null) return;
    rows.push({ id: `exp:${e.id}`, date: e.date, amount: Number(e.amount) || 0, type: "expense", label: e.label || "Expense", sublabel: workName(e.linkedWork), work: e.linkedWork || null, source: "expense", refId: e.id, editable: true });
  });

  // Utility bills (read-only; edit on the Utilities tab)
  const utils = utilData?.utilities || {};
  Object.values(utilData?.bills || {}).forEach(b => {
    if (b.amount == null || !b.periodMonth) return;
    const u = utils[b.utilityId];
    rows.push({ id: `util:${b.id}`, date: `${b.periodMonth}-01`, amount: Number(b.amount) || 0, type: "utility", label: u?.name || u?.type || "Utility", sublabel: "bill", source: "utility", refId: b.utilityId, billId: b.id });
  });

  // Service charges (generated per cycle; correctable inline via a visit override)
  const visitsAll = Object.values(svcData?.visits || {});
  Object.values(svcData?.services || {}).forEach(svc => {
    const visits = visitsAll.filter(v => v.serviceId === svc.id);
    generateServiceCharges(svc, visits, now).forEach(c => {
      // A charge corrected to $0 is a ledger-side suppression ("delete this entry") — skip it.
      if (c.corrected && c.amount === 0) return;
      rows.push({
        id: `svc:${svc.id}:${c.ym}`, date: c.date, amount: c.amount, type: "service",
        label: svc.name || "Service", sublabel: c.offCycle ? "visit" : (c.corrected ? "logged" : "scheduled"),
        source: "service", refId: svc.id, ym: c.ym, visitId: c.visitId, corrected: c.corrected, offCycle: !!c.offCycle,
      });
    });
  });

  // Inventory purchases (read-only; edit on Inventory)
  buildRoster(itemFieldValues, inventory).forEach(it => {
    if (it.price == null || !it.installIso) return;
    rows.push({ id: `buy:${it.stableKey}`, date: it.installIso, amount: Number(it.price) || 0, type: "purchase", label: it.item, sublabel: it.category, source: "purchase", refId: it.stableKey });
  });

  // Mortgage payments — trailing 12 months of the effective payment
  if (hasMortgage(budget?.mortgage)) {
    mortgageLedger(budget.mortgage, { now, back: 11, forward: 1 }).forEach(m => {
      if (!m.total) return;
      rows.push({ id: `mtg:${m.ym}`, date: `${m.ym}-01`, amount: m.total, type: "mortgage", label: budget.mortgage.label || "Mortgage", sublabel: m.overridden ? "corrected" : "", source: "mortgage", refId: m.ym });
    });
  }

  rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return rows;
}

// Totals by type plus grand total, all-time and trailing-12-months.
export function summarizeLedger(rows, now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const all = {}, t12 = {};
  let allTotal = 0, t12Total = 0;
  rows.forEach(r => {
    all[r.type] = (all[r.type] || 0) + r.amount;
    allTotal += r.amount;
    if (r.date && r.date >= cutoffIso) {
      t12[r.type] = (t12[r.type] || 0) + r.amount;
      t12Total += r.amount;
    }
  });
  return { all, t12, allTotal, t12Total };
}

// Per-project estimated-vs-actual: actual = expenses attributed to the project.
export function summarizeProjectSpend(expensesMap, projects) {
  const actual = {};
  Object.values(expensesMap || {}).forEach(e => {
    if (e.linkedWork?.kind === "project" && e.amount != null) {
      actual[e.linkedWork.id] = (actual[e.linkedWork.id] || 0) + (Number(e.amount) || 0);
    }
  });
  return (projects || [])
    .map(p => ({ id: p.id, name: p.name, estimated: Number(p.estimatedCost) || 0, actual: actual[p.id] || 0 }))
    .filter(r => r.actual > 0 || r.estimated > 0)
    .sort((a, b) => b.actual - a.actual || b.estimated - a.estimated);
}
