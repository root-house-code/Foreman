import { useState, useMemo, useEffect, Fragment } from "react";
import { useForemanStore } from "./lib/store.js";
import { expectedYears } from "./lib/lifespans.js";
import {
  buildRoster, computeForecast, computeReserve, computeWarranties, computeRepairs12mo,
} from "./lib/lifecycleStats.js";
import { buildLedger, summarizeLedger, summarizeProjectSpend, LEDGER_TYPE_LABEL } from "./lib/ledger.js";
import { loadTodos } from "./lib/todos.js";
import {
  buildForecast, summarize, actualForMonth, hasBudgetInputs, ymKeyOf,
  mortgageLedger, hasMortgage,
} from "./lib/budgetForecast.js";
import {
  loadCategoryTypeOverrides,
  GROUP_LABELS,
} from "./lib/categoryTypes.js";
import {
  loadEntityTypes,
  resolveTypeId,
  getBehaviorClass,
  isExteriorType,
} from "./lib/entityTypes.js";
import { loadData } from "./lib/data.js";
import { loadDeletedCategories } from "./lib/deletedCategories.js";
import FmHeader from "./src/components/FmHeader.jsx";
import FmSubnav from "./src/components/FmSubnav.jsx";
import ConfirmDialog from "./components/ConfirmDialog.jsx";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(n) {
  if (n == null || isNaN(n)) return "—";
  return "$" + Math.round(n).toLocaleString("en-US");
}

function fmtDate(d) {
  if (!d || isNaN(d)) return "—";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function fmtDay(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function lifeColor(remaining, pct) {
  if (remaining <= 0) return "var(--fm-red)";
  if (remaining <= 2 || pct <= 15) return "var(--fm-amber)";
  if (pct <= 40) return "var(--fm-brass)";
  return "var(--fm-green)";
}

function remainingLabel(remaining) {
  if (remaining <= 0) return remaining > -1 ? "Due now" : `${Math.round(-remaining)} yr overdue`;
  if (remaining < 1) return "< 1 yr left";
  return `${remaining < 10 ? remaining.toFixed(1) : Math.round(remaining)} yr left`;
}

const CLASS_ORDER = ["system", "room", "exterior"];

function classLabel(cls) {
  return GROUP_LABELS[cls] ?? (cls ? cls.charAt(0).toUpperCase() + cls.slice(1) : "Other");
}

// ── Style constants ───────────────────────────────────────────────────────────

const card = {
  background: "var(--fm-bg-panel)",
  border: "var(--fm-border)",
  borderRadius: "var(--fm-radius-lg)",
  padding: "1.25rem 1.5rem",
};

const thCell = {
  borderBottom: "1px solid var(--fm-hairline2)",
  color: "var(--fm-brass-dim)",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.58rem",
  fontWeight: 400,
  letterSpacing: "0.12em",
  padding: "0 0.75rem 0.5rem 0",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

const tdCell = {
  borderBottom: "1px solid var(--fm-hairline)",
  color: "var(--fm-ink-dim)",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.72rem",
  padding: "0.55rem 0.75rem 0.55rem 0",
  verticalAlign: "middle",
};

const sectionTitle = {
  color: "var(--fm-ink-mute)",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.6rem",
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

// ── Page ───────────────────────────────────────────────────────────────────────

function FinancesPage({ navigate, navState, view }) {

  const itemFieldValues = useForemanStore(s => s.itemFieldValues);
  const inventory       = useForemanStore(s => s.inventory);
  const svcData         = useForemanStore(s => s.services);
  const utilData        = useForemanStore(s => s.utilities);
  const expensesMap     = useForemanStore(s => s.expenses);
  const addExpense      = useForemanStore(s => s.addExpense);
  const updateExpense   = useForemanStore(s => s.updateExpense);
  const deleteExpense   = useForemanStore(s => s.deleteExpense);
  const lifespanOverrides = useForemanStore(s => s.lifespanOverrides); // type-level defaults (forecast fallback)
  const budget            = useForemanStore(s => s.budget);
  const setBudgetSettings = useForemanStore(s => s.setBudgetSettings);
  const addPlanned        = useForemanStore(s => s.addPlanned);
  const removePlanned     = useForemanStore(s => s.removePlanned);
  const setMortgage          = useForemanStore(s => s.setMortgage);
  const setMortgageOverride  = useForemanStore(s => s.setMortgageOverride);
  const clearMortgageOverride = useForemanStore(s => s.clearMortgageOverride);
  const updateBill        = useForemanStore(s => s.updateBill);
  const deleteBill        = useForemanStore(s => s.deleteBill);
  const deleteVisit       = useForemanStore(s => s.deleteVisit);
  const setCustomField    = useForemanStore(s => s.setCustomField);

  const markPlannedLogged = useForemanStore(s => s.markPlannedLogged);
  const [expenseForm, setExpenseForm] = useState(null); // null = closed
  const [ledgerTab, setLedgerTab] = useState("Ledger"); // Ledger page subnav: Ledger | Summary | Purchases
  const [globalDateStart, setGlobalDateStart] = useState("");
  const [globalDateEnd, setGlobalDateEnd]   = useState("");
  const [filterMode, setFilterMode] = useState("allTime"); // allTime | trailing | custom
  const [trailingMonths, setTrailingMonths] = useState(12);
  const [editingTrailing, setEditingTrailing] = useState(false);
  const [trailingDraft, setTrailingDraft] = useState("");
  const [forecastHorizon, setForecastHorizon] = useState(12);
  const [editingHorizon, setEditingHorizon] = useState(false);
  const [horizonDraft, setHorizonDraft] = useState("");
  const [expandedYm, setExpandedYm] = useState(null);   // Budget tab: open month
  const [plannedForm, setPlannedForm] = useState({ label: "", amount: "" });
  const [invSort, setInvSort] = useState({ key: "invested", dir: "desc" });
  const [selectedLedgerId, setSelectedLedgerId] = useState(null); // clicked ledger row
  const [editingLedgerId, setEditingLedgerId] = useState(null);   // row whose amount is being edited inline
  const [ledgerDraft, setLedgerDraft] = useState("");
  const [pendingDeleteRow, setPendingDeleteRow] = useState(null); // ledger row awaiting delete confirm

  // Sort column for the "Invested by System & Room" table (applied within each
  // section). Switching column picks a sensible default direction: names ascending,
  // numbers descending; clicking the active column toggles direction.
  function toggleInvSort(key) {
    setInvSort(s => s.key === key
      ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
      : { key, dir: key === "category" ? "asc" : "desc" });
  }

  function openAddExpense(prefill = {}) {
    setExpenseForm({ date: prefill.date || new Date().toISOString().slice(0, 10), amount: prefill.amount ?? "", label: prefill.label || "", linkedItem: "", linkedWork: "", plannedRef: prefill.plannedRef || null });
  }
  function saveExpenseForm() {
    const amt = parseFloat(expenseForm.amount);
    if (isNaN(amt) || !expenseForm.date) return;
    const lw = expenseForm.linkedWork ? { kind: expenseForm.linkedWork.split(":")[0], id: expenseForm.linkedWork.split(":").slice(1).join(":") } : null;
    const payload = { date: expenseForm.date, amount: amt, label: (expenseForm.label || "").trim(), linkedItem: expenseForm.linkedItem || null, linkedWork: lw };
    if (expenseForm.id) {
      updateExpense(expenseForm.id, payload);
    } else {
      const newId = "exp-" + Date.now();
      addExpense({ id: newId, ...payload });
      if (expenseForm.plannedRef) markPlannedLogged(expenseForm.plannedRef.ym, expenseForm.plannedRef.id, newId);
    }
    setExpenseForm(null);
  }

  // Deep-link to the Ledger with the Add Expense form open — from the command
  // palette (empty) or a planned one-off's "+ Add Expense" (prefilled).
  useEffect(() => {
    if (view === "ledger" && navState?.openAdd) openAddExpense(navState.prefill || {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Classify EVERY defined category by its display class (full taxonomy) ──────
  // Mirrors Inventory's authoritative typing — override ?? (categoryType from data
  // rows, custom-wins) ?? "system", run through the entity-type model — so a room
  // is never silently bucketed as "system" just because an item's row carries no
  // categoryType (e.g. items created in a floor-plan zone). Functional types (HVAC,
  // Plumbing, Electrical, Safety, and user-created systems) group under Systems;
  // spatial types split into Rooms and Exteriors. Built from the full category
  // taxonomy — not just categories that own items — so every defined system / room /
  // exterior is represented even before any item or price is recorded.
  const categoryClass = useMemo(() => {
    const overrides = loadCategoryTypeOverrides();
    const entityData = loadEntityTypes();
    const deleted = loadDeletedCategories();
    const catTypeMap = {};
    const cats = new Set();
    loadData().forEach(row => {
      if (!row.category) return;
      if (!row._isCustom && deleted.has(row.category)) return;
      cats.add(row.category);
      if (row.categoryType && (!catTypeMap[row.category] || row._isCustom)) {
        catTypeMap[row.category] = row.categoryType;
      }
    });
    const map = {};
    cats.forEach(cat => {
      const typeId = resolveTypeId(cat, overrides[cat] ?? catTypeMap[cat] ?? "system");
      map[cat] = getBehaviorClass(typeId, entityData) === "spatial"
        ? (isExteriorType(typeId, entityData) ? "exterior" : "room")
        : "system";
    });
    return map;
  }, [inventory]);

  // ── Build the item roster (shared lib), tagged with each item's display class ──
  const roster = useMemo(
    () => buildRoster(itemFieldValues, inventory)
      .map(it => ({ ...it, cls: categoryClass[it.category] ?? "system" })),
    [itemFieldValues, inventory, categoryClass]
  );

  // ── Item options for linking expenses ────────────────────────────────────────
  const itemOptions = useMemo(() => {
    const seen = new Set();
    return [...roster]
      .sort((a, b) => a.category.localeCompare(b.category) || a.item.localeCompare(b.item))
      .filter(it => {
        const key = `${it.category}|${it.item}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [roster]);

  // ── Expenses + unified ledger (backward: all paid transactions) ───────────────
  const repairs12mo = useMemo(() => computeRepairs12mo(expensesMap), [expensesMap]);
  const addVisit    = useForemanStore(s => s.addVisit);
  const updateVisit = useForemanStore(s => s.updateVisit);
  const projects    = useForemanStore(s => s.projects);
  const todos       = useMemo(() => loadTodos(), []);
  const ledger = useMemo(
    () => buildLedger({ expensesMap, utilData, svcData, itemFieldValues, inventory, budget, projects, todos }),
    [expensesMap, utilData, svcData, itemFieldValues, inventory, budget, projects, todos]
  );
  const ledgerSummary = useMemo(() => summarizeLedger(ledger), [ledger]);
  const filteredLedger = useMemo(() => {
    if (filterMode === "allTime") return ledger;
    if (filterMode === "trailing") {
      const today = new Date().toISOString().slice(0, 10);
      const d = new Date(); d.setMonth(d.getMonth() - trailingMonths);
      const start = d.toISOString().slice(0, 10);
      return ledger.filter(r => r.date && r.date >= start && r.date <= today);
    }
    return ledger.filter(r =>
      (!globalDateStart || r.date >= globalDateStart) &&
      (!globalDateEnd   || r.date <= globalDateEnd)
    );
  }, [ledger, filterMode, trailingMonths, globalDateStart, globalDateEnd]);
  const projectSpend  = useMemo(() => summarizeProjectSpend(expensesMap, projects), [expensesMap, projects]);
  // The currently selected ledger row (null when nothing selected or it scrolled out of the filter).
  const selectedLedgerRow = useMemo(
    () => filteredLedger.find(r => r.id === selectedLedgerId) || null,
    [filteredLedger, selectedLedgerId]
  );

  // Correct a generated service charge: write/update a visit override for its month
  // (clearing reverts to the scheduled amount). Open an existing expense for editing.
  function correctServiceCharge(row, amount) {
    const val = (amount === "" || amount == null) ? null : Number(amount);
    if (row.visitId) updateVisit(row.visitId, { overrideCost: val });
    else if (val != null) addVisit({ id: "visit-" + Date.now(), serviceId: row.refId, date: `${row.ym}-01`, overrideCost: val, techName: "", notes: "Ledger correction", linkedItems: [] });
  }
  function editExpenseRow(refId) {
    const e = expensesMap[refId];
    if (e) setExpenseForm({ id: e.id, date: e.date, amount: String(e.amount ?? ""), label: e.label || "", linkedItem: e.linkedItem || "", linkedWork: e.linkedWork ? `${e.linkedWork.kind}:${e.linkedWork.id}` : "" });
  }

  // Inline amount edit, routed to each row type's source-of-truth.
  function updateLedgerAmount(row, amount) {
    const val = (amount === "" || amount == null) ? NaN : Number(amount);
    if (isNaN(val) || val < 0) return;
    switch (row.type) {
      case "expense":  updateExpense(row.refId, { amount: val }); break;
      case "utility":  if (row.billId) updateBill(row.billId, { amount: val }); break;
      case "service":  correctServiceCharge(row, val); break;
      case "purchase": setCustomField(row.refId, "purchase_price", String(val)); break;
      case "mortgage": setMortgageOverride(row.refId, val); break;
      default: break;
    }
  }
  // Delete a ledger entry by removing/suppressing its source record. Generated rows
  // (service, mortgage) have no discrete record, so we suppress that month to $0,
  // which drops it from the ledger; purchase clears the item's price (item stays).
  function deleteLedgerRow(row) {
    switch (row.type) {
      case "expense":  deleteExpense(row.refId); break;
      case "utility":  if (row.billId) deleteBill(row.billId); break;
      case "service":  if (row.offCycle && row.visitId) deleteVisit(row.visitId); else correctServiceCharge(row, 0); break;
      case "purchase": setCustomField(row.refId, "purchase_price", ""); break;
      case "mortgage": setMortgageOverride(row.refId, 0); break;
      default: break;
    }
  }

  // ── Selected-row actions (Edit / Delete live in the panel header) ──────────────
  // Select a row (toggles off if already selected); any in-progress inline edit is cancelled.
  function selectLedgerRow(id) {
    setEditingLedgerId(null);
    setSelectedLedgerId(cur => (cur === id ? null : id));
  }
  // Edit the selected row: expenses open the full form; other types edit the amount inline.
  function editSelectedLedgerRow() {
    const row = selectedLedgerRow;
    if (!row) return;
    if (row.type === "expense") { editExpenseRow(row.refId); setSelectedLedgerId(null); }
    else { setEditingLedgerId(row.id); setLedgerDraft(String(row.amount)); }
  }
  function commitLedgerEdit() {
    if (!editingLedgerId) return;
    const row = filteredLedger.find(r => r.id === editingLedgerId);
    if (row) updateLedgerAmount(row, ledgerDraft);
    setEditingLedgerId(null);
  }
  function confirmDeleteSelected() {
    deleteLedgerRow(pendingDeleteRow);
    setPendingDeleteRow(null);
    setSelectedLedgerId(null);
  }

  // ── Aggregate by category, then group categories by class ─────────────────────
  const { classGroups, totalInvested, pricedCount, totalCount } = useMemo(() => {
    const catMap = {};
    // Seed every defined category so empty systems / rooms / exteriors still appear
    // (e.g. a Plumbing or user-created system with no priced items yet).
    Object.entries(categoryClass).forEach(([category, cls]) => {
      catMap[category] = { category, cls, items: 0, priced: 0, invested: 0 };
    });
    let totalInvested = 0, pricedCount = 0;
    roster.forEach(it => {
      const c = (catMap[it.category] ??= { category: it.category, cls: it.cls, items: 0, priced: 0, invested: 0 });
      c.items += 1;
      if (it.price != null) { c.priced += 1; c.invested += it.price; totalInvested += it.price; pricedCount += 1; }
    });

    const byClass = {};
    Object.values(catMap).forEach(c => { (byClass[c.cls] ??= []).push(c); });

    const orderedClasses = [
      ...CLASS_ORDER.filter(cls => byClass[cls]),
      ...Object.keys(byClass).filter(cls => !CLASS_ORDER.includes(cls)).sort(),
    ];
    const classGroups = orderedClasses.map(cls => ({
      cls,
      label: classLabel(cls),
      cats: byClass[cls].sort((a, b) => b.invested - a.invested || a.category.localeCompare(b.category)),
      subtotal: byClass[cls].reduce((s, c) => s + c.invested, 0),
      items: byClass[cls].reduce((s, c) => s + c.items, 0),
      priced: byClass[cls].reduce((s, c) => s + c.priced, 0),
    }));

    return { classGroups, totalInvested, pricedCount, totalCount: roster.length };
  }, [roster, categoryClass]);


  // ── Replacement forecast, reserve, warranties (shared lib) ─────────────────────
  const forecast   = useMemo(() => computeForecast(roster, new Date(), lifespanOverrides), [roster, lifespanOverrides]);
  const reserve    = useMemo(() => computeReserve(forecast), [forecast]);

  // ── Budget / cash-flow forecast (forward 12 months) ───────────────────────────
  const budgetWarranties = useMemo(() => computeWarranties(roster, new Date(), 0, 366), [roster]);
  const budgetMonths = useMemo(() => buildForecast({
    svcData, utilData,
    reserveAnnual: reserve.annual,
    repairs12mo,
    warranties: budgetWarranties,
    planned: budget.planned,
    mortgage: budget.mortgage,
    opts: { includeReserve: budget.includeReserve, includeRepairsBaseline: budget.includeRepairsBaseline },
    horizon: forecastHorizon,
  }), [svcData, utilData, reserve.annual, repairs12mo, budgetWarranties, budget, forecastHorizon]);
  const budgetSummary = useMemo(() => summarize(budgetMonths), [budgetMonths]);

  // ── Mortgage (recurring bill: default + per-month overrides) ───────────────────
  const mortgageOn = hasMortgage(budget.mortgage);
  const mortLedger = useMemo(() => mortgageLedger(budget.mortgage), [budget.mortgage]);
  const mortgageRoll = useMemo(() => {
    const fwd = budgetMonths.map(m => m.mortgage);
    const annual = fwd.reduce((s, v) => s + v, 0);
    return { avgMonthly: annual / (budgetMonths.length || 1), annual };
  }, [budgetMonths]);
  const budgetInputs  = useMemo(() => hasBudgetInputs({ svcData, utilData, expensesMap }), [svcData, utilData, expensesMap]);
  const currentActual = useMemo(() => actualForMonth(ymKeyOf(new Date()), { utilData, expensesMap, svcData }), [utilData, expensesMap, svcData]);
  const pendingPlanned = useMemo(() => {
    const currentYm = ymKeyOf(new Date());
    const out = [];
    Object.entries(budget.planned || {}).forEach(([ym, items]) => {
      if (ym >= currentYm) return;
      (items || []).forEach(p => { if (!p.expenseId) out.push({ ...p, ym }); });
    });
    return out.sort((a, b) => b.ym.localeCompare(a.ym));
  }, [budget.planned]);
  const catAverages = useMemo(() => {
    const n = budgetMonths.length || 1;
    const s = budgetMonths.reduce((a, m) => ({
      services: a.services + m.servicesTotal, utilities: a.utilities + m.utilities,
      reserve: a.reserve + m.reserve, repairs: a.repairs + m.repairs, planned: a.planned + m.plannedTotal,
    }), { services: 0, utilities: 0, reserve: 0, repairs: 0, planned: 0 });
    return { services: s.services / n, utilities: s.utilities / n, reserve: s.reserve / n, repairs: s.repairs / n, planned: s.planned / n };
  }, [budgetMonths]);

  return (
    <div style={{ height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column", background: "var(--fm-bg)", fontFamily: "var(--fm-sans)", color: "var(--fm-ink)" }}>
      <FmHeader active={view === "ledger" ? "Spending" : view === "mortgage" ? "Mortgage" : "Forecast"} tagline={view === "ledger" ? "spending & history" : view === "mortgage" ? "financing" : "forward projection"} />

      {view === "ledger" && (
        <FmSubnav
          tabs={["Ledger", "Inventory Purchases"]}
          active={ledgerTab}
          onTabChange={setLedgerTab}
          stats={[
            { value: fmtMoney(ledgerSummary.allTotal), label: "total spent", color: "var(--fm-amber)" },
            { value: fmtMoney(totalInvested), label: "spent on items", color: "var(--fm-brass)" },
          ]}
        />
      )}

      <div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0, overflow: (view === "ledger" && ledgerTab === "Ledger") ? "hidden" : "auto" }}>
        <div style={{ display: (view === "ledger" && ledgerTab === "Ledger") ? "flex" : undefined, flex: (view === "ledger" && ledgerTab === "Ledger") ? 1 : undefined, flexDirection: "column", maxWidth: (view === "ledger" && ledgerTab === "Ledger") || view === "forecast" ? "none" : 1000, minHeight: 0, padding: "1.75rem 2.25rem" }}>

          {view === "ledger" && ledgerTab === "Ledger" && (
            <div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}>
            <div style={{ alignItems: "center", display: "flex", flexShrink: 0, gap: 8, marginBottom: "0.75rem" }}>
              <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>Date range</span>
              {/* All-time pill */}
              <button
                onClick={() => { setFilterMode("allTime"); setGlobalDateStart(""); setGlobalDateEnd(""); }}
                style={{ background: filterMode === "allTime" ? "var(--fm-brass-bg)" : "var(--fm-bg-sunk)", border: `1px solid ${filterMode === "allTime" ? "var(--fm-brass)" : "var(--fm-hairline2)"}`, borderRadius: 3, color: filterMode === "allTime" ? "var(--fm-brass)" : "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.1em", padding: "3px 8px", textTransform: "uppercase" }}
              >All-time</button>
              {/* Trailing X mo pill */}
              <span
                onClick={() => { if (filterMode !== "trailing") setFilterMode("trailing"); }}
                style={{ alignItems: "center", background: filterMode === "trailing" ? "var(--fm-brass-bg)" : "var(--fm-bg-sunk)", border: `1px solid ${filterMode === "trailing" ? "var(--fm-brass)" : "var(--fm-hairline2)"}`, borderRadius: 3, color: filterMode === "trailing" ? "var(--fm-brass)" : "var(--fm-ink-mute)", cursor: "pointer", display: "inline-flex", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.1em", padding: "3px 8px", textTransform: "uppercase", userSelect: "none" }}
              >
                {"Trailing "}
                {editingTrailing ? (
                  <input
                    type="number" autoFocus value={trailingDraft} min={1} max={120}
                    onChange={e => setTrailingDraft(e.target.value)}
                    onBlur={() => { const v = parseInt(trailingDraft, 10); if (v > 0 && v <= 120) setTrailingMonths(v); setEditingTrailing(false); }}
                    onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditingTrailing(false); }}
                    onClick={e => e.stopPropagation()}
                    style={{ background: "transparent", border: "none", borderBottom: "1px dashed currentColor", color: "inherit", fontFamily: "inherit", fontSize: "inherit", letterSpacing: 0, outline: "none", padding: "0 1px", textAlign: "center", textTransform: "none", width: 26 }}
                  />
                ) : (
                  <span
                    onClick={e => { e.stopPropagation(); setFilterMode("trailing"); setTrailingDraft(String(trailingMonths)); setEditingTrailing(true); }}
                    style={{ borderBottom: "1px dashed currentColor", lineHeight: 1, padding: "0 1px" }}
                  >{trailingMonths}</span>
                )}
                {" mo"}
              </span>
              {/* Custom date inputs */}
              <input
                type="date" value={globalDateStart}
                onChange={e => { setGlobalDateStart(e.target.value); setFilterMode("custom"); }}
                style={{ background: "var(--fm-bg-sunk)", border: `1px solid ${filterMode === "custom" ? "var(--fm-cyan)" : "var(--fm-hairline2)"}`, borderRadius: 3, color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", outline: "none", padding: "3px 6px" }}
              />
              <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem" }}>–</span>
              <input
                type="date" value={globalDateEnd}
                onChange={e => { setGlobalDateEnd(e.target.value); setFilterMode("custom"); }}
                style={{ background: "var(--fm-bg-sunk)", border: `1px solid ${filterMode === "custom" ? "var(--fm-cyan)" : "var(--fm-hairline2)"}`, borderRadius: 3, color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", outline: "none", padding: "3px 6px" }}
              />
              {filterMode === "custom" && (globalDateStart || globalDateEnd) && (
                <button onClick={() => { setFilterMode("allTime"); setGlobalDateStart(""); setGlobalDateEnd(""); }} style={{ background: "none", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", lineHeight: 1, padding: "0 2px" }}>×</button>
              )}
            </div>
            <div style={{ alignItems: "stretch", display: "flex", flex: 1, gap: "1.5rem", minHeight: 0 }}>
              {/* Left: summary sidebar — sticky (full height, scrollable if tall) */}
              <div style={{ flexShrink: 0, minHeight: 0, overflowY: "auto", paddingTop: "0.1rem", width: 720 }}>
                <SpendByType summary={ledgerSummary} rows={ledger} classGroups={classGroups} customStart={globalDateStart} customEnd={globalDateEnd} trailingMonths={trailingMonths} onTrailingMonthsChange={setTrailingMonths} />
              </div>
              {/* Right: transaction table — flex column, ledger rows scroll */}
              <div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0, minWidth: 0 }}>
                {pendingPlanned.length > 0 && (
                  <div style={{ ...card, flexShrink: 0, marginBottom: "1rem" }}>
                    <div style={{ alignItems: "center", display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
                      <span style={{ background: "var(--fm-amber)", borderRadius: "50%", flexShrink: 0, height: 7, width: 7 }} />
                      <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>Unlogged Planned Spend</span>
                    </div>
                    {pendingPlanned.map(p => (
                      <div key={`${p.ym}:${p.id}`} style={{ alignItems: "center", borderTop: "1px solid var(--fm-hairline)", display: "flex", gap: "0.75rem", padding: "0.5rem 0" }}>
                        <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", flexShrink: 0 }}>{p.ym}</span>
                        <span style={{ color: "var(--fm-ink-dim)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.82rem" }}>{p.label || "—"}</span>
                        <span style={{ color: "var(--fm-amber)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", flexShrink: 0 }}>{fmtMoney(p.amount)}</span>
                        <button
                          onClick={() => openAddExpense({ date: `${p.ym}-01`, amount: String(p.amount), label: p.label, plannedRef: { ym: p.ym, id: p.id } })}
                          style={{ ...pillBtn, flexShrink: 0, fontSize: "0.55rem" }}
                        >+ ADD EXPENSE</button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ ...card, display: "flex", flex: 1, flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
                  <div style={{ alignItems: "center", display: "flex", flexShrink: 0, gap: "0.5rem", justifyContent: "flex-end", marginBottom: "0.9rem" }}>
                    {!expenseForm && selectedLedgerRow && (
                      <>
                        <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.06em", marginRight: "auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {fmtDay(selectedLedgerRow.date)} · {selectedLedgerRow.label}
                        </span>
                        <button onClick={editSelectedLedgerRow} style={pillBtn}>Edit Expense</button>
                        <button onClick={() => setPendingDeleteRow(selectedLedgerRow)} style={dangerPillBtn}>Delete Expense</button>
                      </>
                    )}
                    {!expenseForm && <button onClick={() => openAddExpense()} style={pillBtn}>+ Add Expense</button>}
                  </div>

                  {expenseForm && (
                    <div style={{ alignItems: "center", display: "flex", flexShrink: 0, flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
                      <input type="date" value={expenseForm.date} onChange={e => setExpenseForm(f => ({ ...f, date: e.target.value }))} style={{ ...inputStyle, width: 140 }} />
                      <input type="number" step="0.01" min="0" placeholder="Amount" value={expenseForm.amount} onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))} style={{ ...inputStyle, width: 100 }} />
                      <input type="text" placeholder="Description" value={expenseForm.label} onChange={e => setExpenseForm(f => ({ ...f, label: e.target.value }))} style={{ ...inputStyle, flex: 1, minWidth: 150 }} />
                      <select value={expenseForm.linkedItem} onChange={e => setExpenseForm(f => ({ ...f, linkedItem: e.target.value }))} style={{ ...inputStyle, maxWidth: 200 }}>
                        <option value="">— Link item (optional) —</option>
                        {itemOptions.map(o => <option key={o.stableKey} value={o.stableKey}>{o.category} · {o.item}</option>)}
                      </select>
                      <select value={expenseForm.linkedWork} onChange={e => setExpenseForm(f => ({ ...f, linkedWork: e.target.value }))} style={{ ...inputStyle, maxWidth: 200 }}>
                        <option value="">— Project / To-Do (optional) —</option>
                        {projects.length > 0 && <optgroup label="Projects">{projects.map(p => <option key={p.id} value={`project:${p.id}`}>{p.name}</option>)}</optgroup>}
                        {todos.length > 0 && <optgroup label="To-Dos">{todos.map(t => <option key={t.id} value={`todo:${t.id}`}>{t.title}</option>)}</optgroup>}
                      </select>
                      <button onClick={saveExpenseForm} style={pillBtn}>Save</button>
                      <button onClick={() => setExpenseForm(null)} style={cancelBtn}>Cancel</button>
                    </div>
                  )}

                  <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: "0.75rem", scrollbarGutter: "stable" }}>
                    <LedgerTable
                      rows={filteredLedger}
                      selectedId={selectedLedgerId}
                      onSelect={selectLedgerRow}
                      editingId={editingLedgerId}
                      draft={ledgerDraft}
                      onDraftChange={setLedgerDraft}
                      onCommitEdit={commitLedgerEdit}
                      onCancelEdit={() => setEditingLedgerId(null)}
                    />
                  </div>
                </div>
              </div>
            </div>
            </div>
          )}

          <ConfirmDialog
            open={!!pendingDeleteRow}
            title="Delete entry"
            message={deleteMessage(pendingDeleteRow)}
            confirmLabel="Delete"
            onConfirm={confirmDeleteSelected}
            onCancel={() => setPendingDeleteRow(null)}
          />

          {view === "ledger" && ledgerTab === "Inventory Purchases" && (
            <div style={{ ...card, marginBottom: "1.5rem" }}>
              <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: "0.9rem" }}>
                <span style={sectionTitle}>Purchases by Category</span>
                <button onClick={() => navigate("inventory")} style={navLink}>&rarr; Inventory</button>
              </div>
              {pricedCount === 0 ? (
                <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.82rem", lineHeight: 1.7, padding: "0.5rem 0" }}>
                  No purchase prices recorded yet. Add a <span style={{ color: "var(--fm-ink-dim)" }}>Purchase Price</span> to any item in Inventory and it will roll up here, grouped by system and room.
                </div>
              ) : (
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr>
                      <SortTh label="Category" col="category" sort={invSort} onSort={toggleInvSort} />
                      <SortTh label="Items" col="items" sort={invSort} onSort={toggleInvSort} align="right" />
                      <SortTh label="Priced" col="priced" sort={invSort} onSort={toggleInvSort} align="right" />
                      <SortTh label="Purchased" col="invested" sort={invSort} onSort={toggleInvSort} align="right" />
                      <SortTh label="Share" col="share" sort={invSort} onSort={toggleInvSort} align="right" last />
                    </tr>
                  </thead>
                  <tbody>
                    {classGroups.map(group => (
                      <ClassBlock key={group.cls} group={group} totalInvested={totalInvested} sort={invSort} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {view === "mortgage" && (
            <MortgageCard
              mortgage={budget.mortgage}
              ledger={mortLedger}
              roll={mortgageRoll}
              onSet={setMortgage}
              onOverride={setMortgageOverride}
              onClear={clearMortgageOverride}
            />
          )}

          {view === "forecast" && (
            !budgetInputs ? (
              <div style={card}>
                <div style={{ marginBottom: "0.75rem" }}><span style={sectionTitle}>Operating Budget</span></div>
                <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-sans)", fontSize: "0.85rem", lineHeight: 1.8, maxWidth: 560 }}>
                  Foreman builds a forward 12-month run-rate from what your home actually costs to operate. To project it, add at least one of:
                  <div style={{ marginTop: "0.75rem", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    <button onClick={() => navigate("services")} style={inlineLink}>a recurring service</button>
                    <span style={{ color: "var(--fm-ink-mute)" }}>·</span>
                    <button onClick={() => navigate("utilities")} style={inlineLink}>a utility bill</button>
                    <span style={{ color: "var(--fm-ink-mute)" }}>·</span>
                    <button onClick={() => navigate("ledger")} style={inlineLink}>a logged expense</button>
                  </div>
                  <div style={{ marginTop: "0.75rem", color: "var(--fm-ink-mute)" }}>
                    Once there's data, this tab projects each month's expected outflow — services, seasonal utilities, replacement reserve, a repairs baseline, and anything you plan ahead.
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Horizon setter */}
                <div style={{ alignItems: "center", display: "flex", gap: 6, marginBottom: "1.25rem" }}>
                  <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>Forecast horizon</span>
                  {editingHorizon ? (
                    <input
                      type="number" autoFocus value={horizonDraft} min={1} max={60}
                      onChange={e => setHorizonDraft(e.target.value)}
                      onBlur={() => { const v = parseInt(horizonDraft, 10); if (v > 0 && v <= 60) setForecastHorizon(v); setEditingHorizon(false); }}
                      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditingHorizon(false); }}
                      style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-brass)", borderRadius: 3, color: "var(--fm-brass)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", outline: "none", padding: "3px 6px", textAlign: "center", width: 40 }}
                    />
                  ) : (
                    <span
                      onClick={() => { setHorizonDraft(String(forecastHorizon)); setEditingHorizon(true); }}
                      style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: 3, color: "var(--fm-brass)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", padding: "3px 10px" }}
                    >{forecastHorizon}</span>
                  )}
                  <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>months</span>
                  <span style={{ background: "var(--fm-hairline)", height: 12, margin: "0 6px", width: 1 }} />
                  <ToggleChip on={budget.includeReserve} label="Reserve" onClick={() => setBudgetSettings({ includeReserve: !budget.includeReserve })} />
                  <ToggleChip on={budget.includeRepairsBaseline} label="Repairs baseline" onClick={() => setBudgetSettings({ includeRepairsBaseline: !budget.includeRepairsBaseline })} />
                </div>
                {/* Two-column layout: left = hero + chart stacked, right = month-by-month */}
                <div style={{ alignItems: "stretch", display: "flex", gap: "1.5rem", marginBottom: "1.5rem" }}>

                {/* Left column: Total Forecasted Spend + chart */}
                <div style={{ display: "flex", flex: 1, flexDirection: "column", gap: "1.5rem", minWidth: 0 }}>
                {/* Hero: run rate */}
                {(() => {
                  const cur = budgetMonths[0];
                  const thisMonthProjected = (cur?.total || 0) + (mortgageOn ? (cur?.mortgage || 0) : 0);
                  const colW = { mo: 82, horizon: 92, thisMonth: 92 };
                  const thisMonthGap = { marginRight: 32 };
                  const colStyle = (w) => ({ fontFamily: "var(--fm-mono)", fontSize: "0.7rem", textAlign: "right", width: w });
                  const hdrStyle = (w) => ({ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.52rem", letterSpacing: "0.12em", textAlign: "right", textTransform: "uppercase", width: w });
                  return (
                    <div style={{ ...card }}>
                      <div style={{ marginBottom: "0.9rem" }}><span style={sectionTitle}>Total Forecasted Spend</span></div>
                      <div style={{ borderTop: "1px solid var(--fm-hairline)", paddingTop: "0.85rem" }}>
                        {/* Column headers */}
                        <div style={{ alignItems: "baseline", display: "flex", marginBottom: "0.5rem" }}>
                          <span style={{ flex: 1 }} />
                          <span style={{ ...hdrStyle(colW.thisMonth), ...thisMonthGap }}>{cur?.shortLabel ?? "This Mo"}</span>
                          <span style={hdrStyle(colW.mo)}>Mo Avg</span>
                          <span style={hdrStyle(colW.horizon)}>{forecastHorizon} Mo</span>
                        </div>
                        {[
                          mortgageOn               && ["Mortgage",         mortgageRoll.avgMonthly,  mortgageRoll.annual,                    cur?.mortgage      || 0, "var(--fm-ink-dim)", null],
                          catAverages.services > 0 && ["Services",         catAverages.services,     catAverages.services  * forecastHorizon, cur?.servicesTotal || 0, "var(--fm-brass)",   null],
                          catAverages.utilities > 0&& ["Utilities",        catAverages.utilities,    catAverages.utilities * forecastHorizon, cur?.utilities     || 0, "var(--fm-cyan)",    null],
                          catAverages.reserve > 0  && [`Reserve (${reserve.count} items)`, catAverages.reserve, catAverages.reserve * forecastHorizon, cur?.reserve || 0, "var(--fm-amber)", "lifespans"],
                          catAverages.repairs > 0  && ["Repairs Baseline", catAverages.repairs,      catAverages.repairs   * forecastHorizon, cur?.repairs       || 0, "var(--fm-ink-dim)", null],
                          catAverages.planned > 0  && ["Planned",          catAverages.planned,      catAverages.planned   * forecastHorizon, cur?.plannedTotal  || 0, "var(--fm-green)",   null],
                        ].filter(Boolean).map(([label, monthly, horizonTotal, thisMonth, color, navTarget]) => (
                          <div key={label} style={{ alignItems: "baseline", display: "flex", marginBottom: "0.42rem" }}>
                            <span
                              style={{ color, cursor: navTarget ? "pointer" : "default", flex: 1, fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.04em", textDecoration: navTarget ? "underline" : "none", textDecorationStyle: "dotted" }}
                              onClick={navTarget ? () => navigate(navTarget) : undefined}
                            >{label}</span>
                            <span style={{ ...colStyle(colW.thisMonth), ...thisMonthGap, color: "var(--fm-ink-dim)" }}>{fmtMoney(thisMonth)}</span>
                            <span style={{ ...colStyle(colW.mo),      color: "var(--fm-ink)" }}>{fmtMoney(monthly)}</span>
                            <span style={{ ...colStyle(colW.horizon), color: "var(--fm-ink-dim)" }}>{fmtMoney(horizonTotal)}</span>
                          </div>
                        ))}
                        {/* Projected total row */}
                        <div style={{ alignItems: "baseline", borderTop: "1px solid var(--fm-hairline2)", display: "flex", marginTop: "0.5rem", paddingTop: "0.5rem" }}>
                          <span style={{ color: "var(--fm-ink-mute)", flex: 1, fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.04em" }}>Projected</span>
                          <span style={{ ...colStyle(colW.thisMonth), ...thisMonthGap, color: "var(--fm-ink)", fontWeight: 500 }}>{fmtMoney(thisMonthProjected)}</span>
                          <span style={{ ...colStyle(colW.mo),      color: "var(--fm-ink)", fontWeight: 500 }}>{fmtMoney(budgetSummary.avgMonthly + (mortgageOn ? mortgageRoll.avgMonthly : 0))}</span>
                          <span style={{ ...colStyle(colW.horizon), color: "var(--fm-ink)", fontWeight: 500 }}>{fmtMoney(budgetSummary.annualTotal + (mortgageOn ? mortgageRoll.annual : 0))}</span>
                        </div>
                        {/* Logged row */}
                        <div style={{ alignItems: "baseline", display: "flex", marginTop: "0.3rem" }}>
                          <span style={{ color: "var(--fm-ink-mute)", flex: 1, fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.04em" }}>Logged</span>
                          <span style={{ ...colStyle(colW.thisMonth), ...thisMonthGap, color: "var(--fm-amber)" }}>{fmtMoney(currentActual)}</span>
                          <span style={{ ...colStyle(colW.mo),      color: "var(--fm-ink-mute)" }}>—</span>
                          <span style={{ ...colStyle(colW.horizon), color: "var(--fm-ink-mute)" }}>—</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Chart: Forecasted X Months — fills remaining left-column height */}
                <div style={{ ...card, display: "flex", flex: 1, flexDirection: "column", minWidth: 0 }}>
                  <div style={{ alignItems: "center", display: "flex", gap: "1rem", marginBottom: "1rem" }}>
                    <span style={{ ...sectionTitle, whiteSpace: "nowrap" }}>Forecasted {forecastHorizon} Months</span>
                    <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.08em", marginLeft: "auto", textTransform: "uppercase" }}>Target</span>
                    <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.7rem" }}>$</span>
                    <input
                      type="number" step="10" min="0" placeholder="none"
                      value={budget.monthlyTarget ?? ""}
                      onChange={e => setBudgetSettings({ monthlyTarget: e.target.value === "" ? null : parseFloat(e.target.value) })}
                      style={{ ...inputStyle, width: 90 }}
                    />
                    {budget.monthlyTarget > 0 && (() => {
                      const delta = budgetSummary.avgMonthly - budget.monthlyTarget;
                      const over = delta > 0;
                      return (
                        <span style={{ display: "flex", flexDirection: "column", fontFamily: "var(--fm-mono)", gap: "0.15rem" }}>
                          <span style={{ color: "var(--fm-ink-mute)", fontSize: "0.58rem" }}>avg {fmtMoney(budgetSummary.avgMonthly)}/mo excl. mortgage</span>
                          <span style={{ color: over ? "var(--fm-red)" : "var(--fm-green)", fontSize: "0.65rem" }}>{over ? "▲" : "▼"} {fmtMoney(Math.abs(delta))}/mo {over ? "over" : "under"}</span>
                        </span>
                      );
                    })()}
                  </div>
                  <BudgetChart months={budgetMonths} target={budget.monthlyTarget || 0} heaviest={budgetSummary.heaviest} />
                </div>
                </div>{/* end left column */}

                {/* Right column: Month by Month */}
                <div style={{ ...card, flex: 1, minWidth: 0, overflow: "auto" }}>
                  <div style={{ marginBottom: "0.9rem" }}><span style={sectionTitle}>Month by Month</span></div>
                  <table style={{ borderCollapse: "collapse", width: "100%" }}>
                    <thead>
                      <tr>
                        <th style={thCell}>Month</th>
                        <th style={{ ...thCell, textAlign: "right" }}>Services</th>
                        <th style={{ ...thCell, textAlign: "right" }}>Utilities</th>
                        <th style={{ ...thCell, textAlign: "right" }}>Reserve</th>
                        <th style={{ ...thCell, textAlign: "right" }}>Repairs</th>
                        <th style={{ ...thCell, textAlign: "right" }}>Planned</th>
                        {mortgageOn && <th style={{ ...thCell, textAlign: "right", color: "var(--fm-purple)" }}>Mortgage</th>}
                        <th style={{ ...thCell, textAlign: "right", paddingRight: 0 }}>Projected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {budgetMonths.map(m => {
                        const open = expandedYm === m.ym;
                        return (
                          <Fragment key={m.ym}>
                            <tr onClick={() => setExpandedYm(open ? null : m.ym)} style={{ cursor: "pointer" }}>
                              <td style={{ ...tdCell, color: m.isCurrent ? "var(--fm-brass)" : "var(--fm-ink)", whiteSpace: "nowrap" }}>
                                <span style={{ color: "var(--fm-ink-mute)", marginRight: "0.4rem" }}>{open ? "▾" : "▸"}</span>
                                {m.label}{m.isCurrent && <span style={{ color: "var(--fm-brass-dim)", fontSize: "0.55rem" }}> · now</span>}
                                {m.markers.length > 0 && <span title={`${m.markers.length} warranty expir${m.markers.length > 1 ? "ies" : "y"}`} style={{ color: "var(--fm-amber)", marginLeft: "0.4rem" }}>⚑</span>}
                              </td>
                              <td style={{ ...tdCell, textAlign: "right" }}>{m.servicesTotal > 0 ? fmtMoney(m.servicesTotal) : "—"}</td>
                              <td style={{ ...tdCell, textAlign: "right" }}>{m.utilities > 0 ? fmtMoney(m.utilities) : "—"}</td>
                              <td style={{ ...tdCell, textAlign: "right" }}>{m.reserve > 0 ? fmtMoney(m.reserve) : "—"}</td>
                              <td style={{ ...tdCell, textAlign: "right" }}>{m.repairs > 0 ? fmtMoney(m.repairs) : "—"}</td>
                              <td style={{ ...tdCell, textAlign: "right", color: m.plannedTotal > 0 ? "var(--fm-green)" : "var(--fm-ink-mute)" }}>{m.plannedTotal > 0 ? fmtMoney(m.plannedTotal) : "—"}</td>
                              {mortgageOn && <td style={{ ...tdCell, textAlign: "right", color: m.mortgage > 0 ? "var(--fm-purple)" : "var(--fm-ink-mute)" }}>{m.mortgage > 0 ? fmtMoney(m.mortgage) : "—"}</td>}
                              <td style={{ ...tdCell, color: "var(--fm-ink)", fontWeight: 500, textAlign: "right", paddingRight: 0 }}>{fmtMoney(m.outlay ?? m.total)}</td>
                            </tr>
                            {open && (
                              <tr>
                                <td colSpan={mortgageOn ? 8 : 7} style={{ background: "var(--fm-bg-sunk)", borderBottom: "1px solid var(--fm-hairline)", padding: "0.9rem 1rem" }}>
                                  {m.isCurrent && (
                                    <div style={{ ...detailRow, color: "var(--fm-brass-dim)", marginBottom: "0.6rem" }}>
                                      <span>Logged so far this month</span>
                                      <span style={{ color: "var(--fm-ink)" }}>{fmtMoney(currentActual)} <span style={{ color: "var(--fm-ink-mute)" }}>of ~{fmtMoney(m.total)}</span></span>
                                    </div>
                                  )}
                                  {m.services.length > 0 && (
                                    <div style={{ marginBottom: "0.6rem" }}>
                                      <div style={detailLabel}>Service charges</div>
                                      {m.services.map(s => (
                                        <div key={s.name} style={detailRow}><span style={{ color: "var(--fm-ink-dim)" }}>{s.name}</span><span style={{ color: "var(--fm-ink)" }}>{fmtMoney(s.amount)}</span></div>
                                      ))}
                                    </div>
                                  )}
                                  {m.markers.length > 0 && (
                                    <div style={{ marginBottom: "0.6rem" }}>
                                      <div style={detailLabel}>Warranties lapsing</div>
                                      {m.markers.map(w => (
                                        <div key={w.stableKey} style={detailRow}><span style={{ color: "var(--fm-ink-dim)" }}>{w.item}</span><span style={{ color: "var(--fm-amber)" }}>{w.category}</span></div>
                                      ))}
                                    </div>
                                  )}
                                  <div>
                                    <div style={detailLabel}>Planned one-off expenses</div>
                                    {(m.planned || []).map(p => (
                                      <div key={p.id} style={detailRow}>
                                        <span style={{ color: "var(--fm-ink-dim)" }}>{p.label || "—"}</span>
                                        <span style={{ alignItems: "center", display: "flex", gap: "0.6rem" }}>
                                          <span style={{ color: "var(--fm-green)" }}>{fmtMoney(p.amount)}</span>
                                          {m.isCurrent && !p.expenseId && (
                                            <button
                                              onClick={() => navigate("ledger", { openAdd: true, prefill: { date: new Date().toISOString().slice(0, 10), amount: String(p.amount), label: p.label, plannedRef: { ym: m.ym, id: p.id } } })}
                                              style={{ ...pillBtn, fontSize: "0.55rem" }}
                                            >+ ADD EXPENSE</button>
                                          )}
                                          {p.expenseId && <span style={{ color: "var(--fm-green)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem" }}>✓ logged</span>}
                                          <button onClick={() => removePlanned(m.ym, p.id)} style={{ ...rowBtn, color: "var(--fm-red)", marginLeft: 0 }}>remove</button>
                                        </span>
                                      </div>
                                    ))}
                                    <div style={{ alignItems: "center", display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                                      <input
                                        type="text" placeholder="e.g. property tax"
                                        value={plannedForm.label}
                                        onChange={e => setPlannedForm(f => ({ ...f, label: e.target.value }))}
                                        style={{ ...inputStyle, flex: 1, minWidth: 120 }}
                                      />
                                      <input
                                        type="number" step="0.01" min="0" placeholder="Amount"
                                        value={plannedForm.amount}
                                        onChange={e => setPlannedForm(f => ({ ...f, amount: e.target.value }))}
                                        style={{ ...inputStyle, width: 100 }}
                                      />
                                      <button
                                        onClick={() => {
                                          const amt = parseFloat(plannedForm.amount);
                                          if (isNaN(amt)) return;
                                          addPlanned(m.ym, { id: "pl-" + Date.now(), label: plannedForm.label.trim(), amount: amt });
                                          setPlannedForm({ label: "", amount: "" });
                                        }}
                                        style={pillBtn}
                                      >+ Add Planned One-off</button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", lineHeight: 1.6, marginTop: "0.9rem" }}>
                    Projection is a run-rate, not a bill. Services follow each contract's billing cycle; utilities use a seasonal average of your logged bills; reserve and repairs are spread evenly. Maintenance tasks carry no cost, so they aren't priced here — log a repair on the Ledger to feed the baseline.
                  </div>
                </div>
                </div>{/* end two-column layout */}
              </>
            )
          )}

        </div>
      </div>
    </div>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────────

const navLink = {
  background: "transparent",
  border: "none",
  color: "var(--fm-ink-mute)",
  cursor: "pointer",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.62rem",
  letterSpacing: "0.08em",
  padding: 0,
  textTransform: "uppercase",
};

const inputStyle = {
  background: "var(--fm-bg-sunk)",
  border: "1px solid var(--fm-hairline2)",
  borderRadius: 3,
  color: "var(--fm-ink)",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.72rem",
  outline: "none",
  padding: "0.3rem 0.5rem",
};

const pillBtn = {
  background: "var(--fm-brass-bg)",
  border: "1px solid var(--fm-brass)",
  borderRadius: 3,
  color: "var(--fm-brass)",
  cursor: "pointer",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.62rem",
  letterSpacing: "0.08em",
  padding: "0.3rem 0.65rem",
  textTransform: "uppercase",
};

const cancelBtn = {
  background: "transparent",
  border: "1px solid var(--fm-hairline2)",
  borderRadius: 3,
  color: "var(--fm-ink-mute)",
  cursor: "pointer",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.62rem",
  letterSpacing: "0.08em",
  padding: "0.3rem 0.65rem",
  textTransform: "uppercase",
};

const dangerPillBtn = {
  background: "transparent",
  border: "1px solid var(--fm-red)",
  borderRadius: 3,
  color: "var(--fm-red)",
  cursor: "pointer",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.62rem",
  letterSpacing: "0.08em",
  padding: "0.3rem 0.65rem",
  textTransform: "uppercase",
};

const rowBtn = {
  background: "transparent",
  border: "none",
  color: "var(--fm-ink-mute)",
  cursor: "pointer",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.6rem",
  letterSpacing: "0.06em",
  marginLeft: "0.6rem",
  padding: 0,
  textTransform: "uppercase",
};

const inlineLink = {
  background: "transparent",
  border: "none",
  color: "var(--fm-brass)",
  cursor: "pointer",
  fontFamily: "var(--fm-sans)",
  fontSize: "0.85rem",
  padding: 0,
  textDecoration: "underline",
  textUnderlineOffset: "2px",
};

const detailLabel = {
  color: "var(--fm-brass-dim)",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.55rem",
  letterSpacing: "0.12em",
  marginBottom: "0.3rem",
  textTransform: "uppercase",
};

const detailRow = {
  alignItems: "center",
  display: "flex",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.68rem",
  justifyContent: "space-between",
  padding: "0.15rem 0",
};

const fieldLabel = {
  alignItems: "center",
  color: "var(--fm-ink-mute)",
  display: "flex",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.62rem",
  letterSpacing: "0.04em",
};

function LifeBar({ pct, color }) {
  return (
    <div style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline)", borderRadius: 2, flexShrink: 0, height: 7, overflow: "hidden", width: 90 }}>
      <div style={{ background: color, height: "100%", width: `${pct}%` }} />
    </div>
  );
}

// Click-to-edit expected-lifespan cell. Writes the PER-ITEM lifespan field via
// onSave(stableKey, "estimated_lifespan", years) — empty clears it back to the
// item type's default. The same per-item value is editable from item details.
function EditableYears({ stableKey, value, overridden, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  function commit() {
    onSave(stableKey, "estimated_lifespan", val.trim() === "" ? "" : parseFloat(val));
    setEditing(false);
  }
  if (editing) {
    return (
      <input
        type="number" min="0" step="1" autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); else if (e.key === "Escape") setEditing(false); }}
        style={{ ...inputStyle, padding: "0.1rem 0.3rem", textAlign: "right", width: 52 }}
        title="Expected lifespan in years — blank to reset to default"
      />
    );
  }
  return (
    <span
      onClick={() => { setVal(value == null ? "" : String(value)); setEditing(true); }}
      title="Click to edit expected lifespan (applies to all items of this type)"
      style={{ borderBottom: "1px dashed var(--fm-hairline2)", color: overridden ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: "pointer" }}
    >
      {value} yr
    </span>
  );
}

// Replacement Forecast — lives on the Inventory page. Self-contained: reads the
// store, builds the roster, and projects replacement timing. The "Life" column
// edits each item's own estimated_lifespan (which overrides its type default).
export function ReplacementForecast() {
  const itemFieldValues   = useForemanStore(s => s.itemFieldValues);
  const inventory         = useForemanStore(s => s.inventory);
  const lifespanOverrides = useForemanStore(s => s.lifespanOverrides);
  const setCustomField    = useForemanStore(s => s.setCustomField);

  const roster       = useMemo(() => buildRoster(itemFieldValues, inventory), [itemFieldValues, inventory]);
  const forecast     = useMemo(() => computeForecast(roster, new Date(), lifespanOverrides), [roster, lifespanOverrides]);
  const reserve      = useMemo(() => computeReserve(forecast), [forecast]);
  const warranties   = useMemo(() => computeWarranties(roster), [roster]);
  const missingDates = useMemo(
    () => roster.filter(it => (it.estimatedLifespan ?? expectedYears(it.item, lifespanOverrides)) != null && !it.installIso).length,
    [roster, lifespanOverrides]
  );

  // Default: Remaining ascending — longest overdue first through longest left.
  const [sort, setSort] = useState({ key: "remaining", dir: "asc" });
  function toggleSort(key) {
    setSort(s => s.key === key
      ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
      : { key, dir: (key === "item" || key === "category" || key === "remaining") ? "asc" : "desc" });
  }
  const sortedForecast = useMemo(() => sortForecastRows(forecast, sort), [forecast, sort]);

  return (
    <div style={{ maxWidth: 1000, paddingTop: "0.25rem", width: "100%" }}>
      {/* Reserve callout */}
      <div style={{ ...card, alignItems: "center", display: "flex", gap: "1.5rem", marginBottom: "1.5rem" }}>
        <div style={{ borderRight: "1px solid var(--fm-hairline2)", paddingRight: "1.5rem" }}>
          <div style={sectionTitle}>Replacement Reserve</div>
          <div style={{ color: "var(--fm-amber)", fontFamily: "var(--fm-serif)", fontSize: "1.9rem", fontWeight: 500, letterSpacing: "-0.01em", margin: "0.3rem 0 0.1rem", whiteSpace: "nowrap" }}>
            {reserve.annual > 0 ? fmtMoney(reserve.annual) : "—"}<span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.7rem" }}> / yr</span>
          </div>
          <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem" }}>suggested set-aside</div>
        </div>
        <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-sans)", fontSize: "0.82rem", lineHeight: 1.65 }}>
          {reserve.count > 0 ? (
            <>
              <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>{reserve.count} item{reserve.count !== 1 ? "s" : ""}</span> {reserve.count !== 1 ? "are" : "is"} within ~5 years of expected replacement
              {reserve.priced < reserve.count && <span style={{ color: "var(--fm-amber)" }}> · {reserve.count - reserve.priced} need a price to be costed</span>}.
              {" "}Setting aside the amount at left each year covers the cost as each reaches end of life.
            </>
          ) : (
            <>Nothing is within five years of expected replacement. As items age, the recommended annual reserve appears here.</>
          )}
        </div>
      </div>

      {/* Warranty strip */}
      {warranties.length > 0 && (
        <div style={{ ...card, marginBottom: "1.5rem" }}>
          <div style={{ marginBottom: "0.75rem" }}><span style={sectionTitle}>Warranties Expiring Soon</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {warranties.map(w => {
              const expired = w.days < 0;
              return (
                <div key={w.stableKey} style={{ alignItems: "center", display: "flex", gap: "0.75rem" }}>
                  <span style={{ background: expired ? "var(--fm-red)" : "var(--fm-amber)", borderRadius: "50%", flexShrink: 0, height: 6, width: 6 }} />
                  <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.8rem", minWidth: 200 }}>{w.item}</span>
                  <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", flex: 1 }}>{w.category}</span>
                  <span style={{ color: expired ? "var(--fm-red)" : "var(--fm-amber)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", whiteSpace: "nowrap" }}>
                    {expired ? `expired ${Math.abs(w.days)}d ago` : `${w.days}d left`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Forecast table */}
      <div style={card}>
        <div style={{ marginBottom: "0.9rem" }}>
          <span style={sectionTitle}>By Item · Soonest First</span>
        </div>
        {forecast.length === 0 ? (
          <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.82rem", lineHeight: 1.7, padding: "0.5rem 0" }}>
            Nothing to forecast yet. Add an <span style={{ color: "var(--fm-ink-dim)" }}>Install Date</span> (or Purchase Date) to items in Inventory and Foreman will project their replacement timing against expected lifespans.
          </div>
        ) : (
          <>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <SortTh label="Item" col="item" sort={sort} onSort={toggleSort} />
                  <SortTh label="Category" col="category" sort={sort} onSort={toggleSort} />
                  <SortTh label="Installed" col="installed" sort={sort} onSort={toggleSort} align="right" />
                  <SortTh label="Age" col="age" sort={sort} onSort={toggleSort} align="right" />
                  <SortTh label="Life" col="life" sort={sort} onSort={toggleSort} align="right" />
                  <SortTh label="Remaining" col="remaining" sort={sort} onSort={toggleSort} align="center" />
                  <SortTh label="Est. Replace" col="estReplace" sort={sort} onSort={toggleSort} align="right" last />
                </tr>
              </thead>
              <tbody>
                {sortedForecast.map(f => {
                  const color = lifeColor(f.remaining, f.pct);
                  return (
                    <tr key={f.stableKey}>
                      <td style={{ ...tdCell, color: "var(--fm-ink)" }}>{f.item}</td>
                      <td style={tdCell}>{f.category}</td>
                      <td style={{ ...tdCell, textAlign: "right", whiteSpace: "nowrap" }}>
                        {f.installSource !== "install" && <span style={{ color: "var(--fm-ink-mute)" }} title={`Based on ${f.installSource} date`}>~</span>}
                        {fmtDate(f.installed)}
                      </td>
                      <td style={{ ...tdCell, textAlign: "right" }}>{f.age.toFixed(1)} yr</td>
                      <td style={{ ...tdCell, textAlign: "right" }}>
                        <EditableYears stableKey={f.stableKey} value={f.exp} overridden={f.estimatedLifespan != null} onSave={setCustomField} />
                      </td>
                      <td style={tdCell}>
                        <div style={{ alignItems: "center", display: "flex", gap: "0.55rem", justifyContent: "flex-end" }}>
                          <span style={{ color, fontFamily: "var(--fm-mono)", fontSize: "0.62rem", whiteSpace: "nowrap" }}>{remainingLabel(f.remaining)}</span>
                          <LifeBar pct={f.pct} color={color} />
                        </div>
                      </td>
                      <td style={{ ...tdCell, color: f.estCost != null ? "var(--fm-ink-dim)" : "var(--fm-ink-mute)", textAlign: "right", paddingRight: 0 }}>{f.estCost != null ? fmtMoney(f.estCost) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", lineHeight: 1.6, marginTop: "0.9rem" }}>
              Est. Replace uses the recorded purchase price as a placeholder. “~” marks an age derived from a purchase or manufactured date rather than an install date.
              {missingDates > 0 && <> · {missingDates} item{missingDates !== 1 ? "s have" : " has"} an expected lifespan but no date yet.</>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub, color, onClick }) {
  return (
    <div
      style={{ ...card, cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
    >
      <div style={sectionTitle}>{label}</div>
      <div style={{ color: color || "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "1.6rem", fontWeight: 500, letterSpacing: "-0.01em", margin: "0.35rem 0 0.15rem" }}>{value}</div>
      <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.04em" }}>{sub}</div>
    </div>
  );
}

// Column header for the Invested table — click to sort rows within each section.
function SortTh({ label, col, sort, onSort, align = "left", last = false }) {
  const active = sort.key === col;
  return (
    <th
      onClick={() => onSort(col)}
      title={`Sort by ${label}`}
      style={{ ...thCell, textAlign: align, ...(last ? { paddingRight: 0 } : null), color: active ? "var(--fm-brass)" : "var(--fm-brass-dim)", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.color = "var(--fm-brass-dim)"; }}
    >
      {label}
      <span style={{ fontSize: "0.7em", marginLeft: 4, opacity: active ? 1 : 0.3 }}>{active ? (sort.dir === "asc" ? "▲" : "▼") : "▾"}</span>
    </th>
  );
}

// Sort a section's category rows by the chosen column. Share sorts by invested
// (it's proportional). Name is the stable tiebreak, always ascending.
function sortInvestedCats(cats, sort) {
  const mul = sort.dir === "asc" ? 1 : -1;
  const valOf = (c) => {
    switch (sort.key) {
      case "category": return c.category.toLowerCase();
      case "items":    return c.items;
      case "priced":   return c.priced;
      default:         return c.invested; // "invested" and "share"
    }
  };
  return [...cats].sort((a, b) => {
    const av = valOf(a), bv = valOf(b);
    const primary = (typeof av === "string" ? av.localeCompare(bv) : av - bv) * mul;
    return primary !== 0 ? primary : a.category.localeCompare(b.category);
  });
}

// Sort the replacement-forecast rows by the chosen column. Items missing a value
// (e.g. no Est. Replace) always sort last; ties fall back to most-overdue-first.
function sortForecastRows(rows, sort) {
  const mul = sort.dir === "asc" ? 1 : -1;
  const valOf = (f) => {
    switch (sort.key) {
      case "item":       return f.item.toLowerCase();
      case "category":   return (f.category || "").toLowerCase();
      case "installed":  return f.installed ? f.installed.getTime() : null;
      case "age":        return f.age;
      case "life":       return f.exp;
      case "estReplace": return f.estCost;
      default:           return f.remaining; // "remaining"
    }
  };
  return [...rows].sort((a, b) => {
    const av = valOf(a), bv = valOf(b);
    if (av == null && bv != null) return 1;
    if (bv == null && av != null) return -1;
    let primary = 0;
    if (av != null && bv != null) primary = (typeof av === "string" ? av.localeCompare(bv) : av - bv) * mul;
    if (primary !== 0) return primary;
    return (a.remaining - b.remaining) || a.item.localeCompare(b.item);
  });
}

function ClassBlock({ group, totalInvested, sort }) {
  const [open, setOpen] = useState(false);
  const cats = sortInvestedCats(group.cats, sort);
  return (
    <>
      <tr onClick={() => setOpen(o => !o)} style={{ cursor: "pointer" }}>
        <td colSpan={5} style={{ padding: "0.9rem 0 0.35rem" }}>
          <span style={{ alignItems: "center", display: "inline-flex", gap: "0.4rem" }}>
            <span style={{ color: "var(--fm-ink-mute)", fontSize: "0.55rem", transition: "transform 0.12s", display: "inline-block", transform: open ? "rotate(90deg)" : "none" }}>▶</span>
            <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.16em", textTransform: "uppercase" }}>
              {group.label}
            </span>
          </span>
        </td>
      </tr>
      {open && cats.map(c => {
        const share = totalInvested > 0 ? (c.invested / totalInvested) * 100 : 0;
        return (
          <tr key={c.category}>
            <td style={{ ...tdCell, color: "var(--fm-ink)" }}>{c.category}</td>
            <td style={{ ...tdCell, textAlign: "right" }}>{c.items}</td>
            <td style={{ ...tdCell, textAlign: "right", color: c.priced < c.items ? "var(--fm-amber)" : "var(--fm-ink-dim)" }}>{c.priced}</td>
            <td style={{ ...tdCell, color: "var(--fm-ink)", textAlign: "right" }}>{fmtMoney(c.invested)}</td>
            <td style={{ ...tdCell, textAlign: "right", paddingRight: 0 }}>{share >= 0.5 ? share.toFixed(0) + "%" : "—"}</td>
          </tr>
        );
      })}
      <tr>
        <td style={{ ...tdCell, borderBottom: "1px solid var(--fm-hairline2)", color: "var(--fm-ink-mute)" }}>{group.label} subtotal</td>
        <td style={{ ...tdCell, borderBottom: "1px solid var(--fm-hairline2)", textAlign: "right", color: "var(--fm-ink-mute)" }}>{group.items}</td>
        <td style={{ ...tdCell, borderBottom: "1px solid var(--fm-hairline2)", textAlign: "right", color: "var(--fm-ink-mute)" }}>{group.priced}</td>
        <td style={{ ...tdCell, borderBottom: "1px solid var(--fm-hairline2)", color: "var(--fm-brass)", textAlign: "right" }}>{fmtMoney(group.subtotal)}</td>
        <td style={{ ...tdCell, borderBottom: "1px solid var(--fm-hairline2)", textAlign: "right", paddingRight: 0 }} />
      </tr>
    </>
  );
}

// ── Budget subcomponents ────────────────────────────────────────────────────────

function MortgageCard({ mortgage, ledger, roll, onSet, onOverride, onClear }) {
  const [editingYm, setEditingYm] = useState(null);
  const [editVal, setEditVal]     = useState("");

  const def    = mortgage.defaultMonthly;
  const escrow = Number(mortgage.escrowMonthly) || 0;
  const hasDefault = (Number(def) || 0) > 0;
  const pi = Math.max((Number(def) || 0) - escrow, 0);

  function startEdit(row) { setEditingYm(row.ym); setEditVal(String(row.total || "")); }
  function cancelEdit()   { setEditingYm(null); setEditVal(""); }
  function commitEdit(ym) {
    const v = parseFloat(editVal);
    if (!isNaN(v)) onOverride(ym, v);
    cancelEdit();
  }

  return (
    <div style={{ ...card, marginBottom: "1.5rem" }}>
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: "0.9rem" }}>
        <span style={sectionTitle}>Mortgage</span>
        {hasDefault && <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem" }}>{fmtMoney(roll.avgMonthly)}/mo avg · {fmtMoney(roll.annual)}/yr</span>}
      </div>

      {/* Setup */}
      <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "1.25rem", marginBottom: hasDefault ? "1rem" : 0 }}>
        <label style={fieldLabel}>
          Monthly payment
          <span style={{ color: "var(--fm-ink-mute)", margin: "0 0.3rem" }}>$</span>
          <input type="number" step="10" min="0" placeholder="0"
            value={def ?? ""}
            onChange={e => onSet({ defaultMonthly: e.target.value === "" ? null : parseFloat(e.target.value) })}
            style={{ ...inputStyle, width: 110 }} />
        </label>
        <label style={fieldLabel}>
          of which escrow
          <span style={{ color: "var(--fm-ink-mute)", margin: "0 0.3rem" }}>$</span>
          <input type="number" step="10" min="0" placeholder="0"
            value={mortgage.escrowMonthly ?? ""}
            onChange={e => onSet({ escrowMonthly: e.target.value === "" ? null : parseFloat(e.target.value) })}
            style={{ ...inputStyle, width: 100 }} />
        </label>
        {hasDefault && (
          <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem" }}>
            = {fmtMoney(pi)} P&amp;I + {fmtMoney(Math.min(escrow, Number(def) || 0))} escrow
          </span>
        )}
      </div>

      {!hasDefault ? (
        <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.8rem", lineHeight: 1.6, marginTop: "0.5rem" }}>
          Enter your monthly mortgage payment to fold it into your cash-flow outlook. It projects forward every month; you can correct any individual month once it's set.
        </div>
      ) : (
        <>
          {escrow > 0 && (
            <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", lineHeight: 1.6, marginBottom: "0.75rem" }}>
              Escrow already covers taxes &amp; insurance — don't also log those as a service or planned cost, or they'll be counted twice.
            </div>
          )}
          <div style={{ ...detailLabel, marginBottom: "0.4rem" }}>Payment by month · click an amount to correct it</div>
          <div style={{ display: "flex", flexDirection: "column", maxHeight: 260, overflowY: "auto" }}>
            {ledger.map(row => {
              const editing = editingYm === row.ym;
              return (
                <div key={row.ym} style={{
                  alignItems: "center", borderBottom: "1px solid var(--fm-hairline)",
                  display: "flex", gap: "0.6rem", justifyContent: "space-between", padding: "0.4rem 0",
                  opacity: row.isPast && !row.overridden ? 0.65 : 1,
                }}>
                  <span style={{ color: row.isCurrent ? "var(--fm-brass)" : "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", minWidth: 96, whiteSpace: "nowrap" }}>
                    {row.label}{row.isCurrent && <span style={{ color: "var(--fm-brass-dim)", fontSize: "0.55rem" }}> · now</span>}
                  </span>
                  <span style={{ color: "var(--fm-ink-mute)", flex: 1, fontFamily: "var(--fm-mono)", fontSize: "0.56rem" }}>
                    {row.escrow > 0 ? `${fmtMoney(row.pi)} P&I · ${fmtMoney(row.escrow)} escrow` : ""}
                  </span>
                  {row.overridden && !editing && (
                    <button onClick={() => onClear(row.ym)} style={{ ...rowBtn, marginLeft: 0 }} title="Reset to default">reset</button>
                  )}
                  {editing ? (
                    <span style={{ alignItems: "center", display: "flex", gap: "0.4rem" }}>
                      <input autoFocus type="number" step="10" min="0" value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") commitEdit(row.ym); if (e.key === "Escape") cancelEdit(); }}
                        style={{ ...inputStyle, width: 88 }} />
                      <button onClick={() => commitEdit(row.ym)} style={pillBtn}>Save</button>
                    </span>
                  ) : (
                    <button onClick={() => startEdit(row)}
                      style={{ background: "transparent", border: "none", color: row.overridden ? "var(--fm-brass)" : "var(--fm-ink)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", minWidth: 70, padding: 0, textAlign: "right" }}
                      title={row.overridden ? "Overridden — click to change" : "Click to set this month"}>
                      {fmtMoney(row.total)}{row.overridden && <span style={{ color: "var(--fm-brass-dim)" }}> *</span>}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.52rem", marginTop: "0.6rem" }}>
            * a corrected month · every other month falls back to the default payment.
          </div>
        </>
      )}
    </div>
  );
}

function ToggleChip({ on, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        alignItems: "center",
        background: on ? "var(--fm-brass-bg)" : "transparent",
        border: `1px solid ${on ? "var(--fm-brass)" : "var(--fm-hairline2)"}`,
        borderRadius: 3,
        color: on ? "var(--fm-brass)" : "var(--fm-ink-mute)",
        cursor: "pointer",
        display: "inline-flex",
        fontFamily: "var(--fm-mono)",
        fontSize: "0.62rem",
        gap: "0.35rem",
        letterSpacing: "0.06em",
        padding: "0.3rem 0.65rem",
        textTransform: "uppercase",
      }}
    >
      <span>{on ? "✓" : "○"}</span>{label}
    </button>
  );
}

const BUDGET_SEGMENTS = [
  ["servicesTotal", "var(--fm-brass)"],
  ["utilities", "var(--fm-cyan)"],
  ["reserve", "var(--fm-amber)"],
  ["repairs", "var(--fm-ink-dim)"],
  ["plannedTotal", "var(--fm-green)"],
  ["mortgage", "var(--fm-purple)"],
];

function BudgetChart({ months, target, heaviest }) {
  const [hover, setHover] = useState(null);
  const H = 300;
  const max = Math.max(target || 0, ...months.map(m => m.outlay ?? m.total), 1);
  return (
    <div style={{ position: "relative" }}>
      <div style={{ alignItems: "flex-end", display: "flex", gap: "0.4rem", height: H, position: "relative" }}>
        {target > 0 && (
          <div style={{ borderTop: "1px dashed var(--fm-amber)", bottom: (target / max) * H, left: 0, position: "absolute", right: 0, zIndex: 2 }}>
            <span style={{ background: "var(--fm-bg-panel)", color: "var(--fm-amber)", fontFamily: "var(--fm-mono)", fontSize: "0.5rem", padding: "0 0.25rem", position: "absolute", right: 0, top: -7 }}>target</span>
          </div>
        )}
        {months.map((m, i) => {
          const outlay = m.outlay ?? m.total;
          const barH = (outlay / max) * H;
          return (
            <div
              key={m.ym}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(h => (h === i ? null : h))}
              style={{ alignItems: "center", cursor: "default", display: "flex", flex: 1, flexDirection: "column", justifyContent: "flex-end", position: "relative" }}
            >
              {hover === i && <ChartTip m={m} />}
              <div style={{
                background: "var(--fm-bg-sunk)",
                border: m.isCurrent ? "1px solid var(--fm-brass)" : "1px solid var(--fm-hairline)",
                borderRadius: "2px 2px 0 0",
                display: "flex",
                flexDirection: "column-reverse",
                height: Math.max(barH, 2),
                overflow: "hidden",
                width: "100%",
              }}>
                {BUDGET_SEGMENTS.map(([key, color]) => {
                  const v = m[key] || 0;
                  if (v <= 0) return null;
                  return <div key={key} style={{ background: color, height: `${(v / outlay) * 100}%`, opacity: hover === i ? 1 : 0.85, width: "100%" }} />;
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem" }}>
        {months.map(m => (
          <div key={m.ym} style={{ color: m.isCurrent ? "var(--fm-brass)" : "var(--fm-ink-mute)", flex: 1, fontFamily: "var(--fm-mono)", fontSize: "0.5rem", textAlign: "center" }}>{m.shortLabel}</div>
        ))}
      </div>
      {heaviest && (
        <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", marginTop: "0.6rem" }}>
          heaviest <span style={{ color: "var(--fm-amber)" }}>{heaviest.label}</span>
          <span style={{ color: "var(--fm-ink-mute)" }}> · </span>
          <span style={{ color: "var(--fm-ink)" }}>{fmtMoney(heaviest.total)}</span>
        </div>
      )}
    </div>
  );
}

function ChartTip({ m }) {
  return (
    <div style={{
      background: "var(--fm-bg-raised)",
      border: "var(--fm-border)",
      borderRadius: "var(--fm-radius)",
      bottom: "calc(100% + 6px)",
      boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
      left: "50%",
      minWidth: 150,
      padding: "0.55rem 0.7rem",
      position: "absolute",
      transform: "translateX(-50%)",
      zIndex: 5,
    }}>
      <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", marginBottom: "0.35rem" }}>{m.label} · {fmtMoney(m.outlay ?? m.total)}</div>
      {(() => {
        const rows = [
          ["Services", m.servicesTotal, "var(--fm-brass)"],
          ["Utilities", m.utilities, "var(--fm-cyan)"],
          ["Reserve", m.reserve, "var(--fm-amber)"],
          ["Repairs", m.repairs, "var(--fm-ink-dim)"],
          ["Planned", m.plannedTotal, "var(--fm-green)"],
          ["Mortgage", m.mortgage, "var(--fm-purple)"],
        ].filter(([, v]) => v > 0);
        const sum = rows.reduce((acc, [, v]) => acc + v, 0);
        return (
          <>
            {rows.map(([label, v, color]) => (
              <div key={label} style={{ display: "flex", fontFamily: "var(--fm-mono)", fontSize: "0.56rem", gap: "0.5rem", justifyContent: "space-between" }}>
                <span style={{ color }}>{label}</span><span style={{ color: "var(--fm-ink-dim)" }}>{fmtMoney(v)}</span>
              </div>
            ))}
            {rows.length > 1 && (
              <div style={{ borderTop: "1px solid var(--fm-hairline2)", display: "flex", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", fontWeight: 500, gap: "0.5rem", justifyContent: "space-between", marginTop: "0.3rem", paddingTop: "0.3rem" }}>
                <span style={{ color: "var(--fm-ink-mute)" }}>Total</span><span style={{ color: "var(--fm-ink)" }}>{fmtMoney(sum)}</span>
              </div>
            )}
          </>
        );
      })()}
      {m.markers.length > 0 && (
        <div style={{ borderTop: "1px solid var(--fm-hairline)", color: "var(--fm-amber)", fontFamily: "var(--fm-mono)", fontSize: "0.52rem", marginTop: "0.35rem", paddingTop: "0.3rem" }}>
          ⚑ {m.markers.length} warranty expir{m.markers.length > 1 ? "ies" : "y"}
        </div>
      )}
    </div>
  );
}

// Short prose explaining what drives a heavy month, for the callout.
function heavyReason(m) {
  const parts = [];
  if (m.services.length) parts.push(m.services.slice(0, 2).map(s => s.name).join(" & "));
  if (m.plannedTotal > 0) parts.push("planned costs");
  if (m.markers.length) parts.push("a warranty lapse");
  if (!parts.length) return "";
  return ` — driven by ${parts.join(", ")}`;
}

// Finances nav-group pages. Both render the shared FinancesPage with a view flag:
// Ledger = backward (spend history), Forecast = forward (projection).
export function LedgerPage(props)   { return <FinancesPage {...props} view="ledger" />; }
export function ForecastPage(props) { return <FinancesPage {...props} view="forecast" />; }
export function MortgagePage(props) { return <FinancesPage {...props} view="mortgage" />; }

// Item Lifespans — a standalone Property page wrapping the replacement forecast.
export function ItemLifespansPage() {
  return (
    <div style={{ height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column", background: "var(--fm-bg)", fontFamily: "var(--fm-sans)", color: "var(--fm-ink)" }}>
      <FmHeader active="Item Lifespans" tagline="aging & replacement" />
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 1000, padding: "1.75rem 2.25rem" }}>
          <ReplacementForecast />
        </div>
      </div>
    </div>
  );
}

// Spend totals by type — trailing-12 and all-time — from the ledger.
function SpendByType({ summary, rows = [], classGroups = [], customStart: externalStart, customEnd: externalEnd, trailingMonths: externalTrailing, onTrailingMonthsChange }) {
  const [localTrailing, setLocalTrailing] = useState(12);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [localStart, setLocalStart] = useState("");
  const [localEnd, setLocalEnd] = useState("");
  const [editingCustom, setEditingCustom] = useState(false);

  const controlled = externalStart !== undefined;
  const customStart = controlled ? (externalStart || "") : localStart;
  const customEnd   = controlled ? (externalEnd   || "") : localEnd;

  const controlledTrailing = externalTrailing !== undefined;
  const trailingMonths = controlledTrailing ? externalTrailing : localTrailing;
  const setTrailingMonths = controlledTrailing
    ? v => onTrailingMonthsChange?.(v)
    : setLocalTrailing;
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [openClasses, setOpenClasses] = useState(new Set());
  const [openTypes, setOpenTypes] = useState(new Set());

  function toggleType(t) {
    setOpenTypes(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; });
  }

  const catToClass = useMemo(() => {
    const map = {};
    classGroups.forEach(g => g.cats.forEach(c => { map[c.category] = g.cls; }));
    return map;
  }, [classGroups]);

  const tN = useMemo(() => {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - trailingMonths);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    const byType = {}, byClass = {}, byCat = {};
    let total = 0, projectTotal = 0;
    rows.forEach(r => {
      if (r.date && r.date >= cutoffIso) {
        byType[r.type] = (byType[r.type] || 0) + r.amount;
        total += r.amount;
        if (r.work?.kind === "project") projectTotal += r.amount;
        if (r.type === "purchase") {
          const cls = catToClass[r.sublabel] || "Other";
          byClass[cls] = (byClass[cls] || 0) + r.amount;
          byCat[r.sublabel] = (byCat[r.sublabel] || 0) + r.amount;
        }
      }
    });
    return { byType, total, projectTotal, byClass, byCat };
  }, [rows, trailingMonths, catToClass]);

  const tCustom = useMemo(() => {
    if (!customStart && !customEnd) return null;
    const byType = {}, byClass = {}, byCat = {};
    let total = 0, projectTotal = 0;
    rows.forEach(r => {
      if (!r.date) return;
      if (customStart && r.date < customStart) return;
      if (customEnd && r.date > customEnd) return;
      byType[r.type] = (byType[r.type] || 0) + r.amount;
      total += r.amount;
      if (r.work?.kind === "project") projectTotal += r.amount;
      if (r.type === "purchase") {
        const cls = catToClass[r.sublabel] || "Other";
        byClass[cls] = (byClass[cls] || 0) + r.amount;
        byCat[r.sublabel] = (byCat[r.sublabel] || 0) + r.amount;
      }
    });
    return { byType, total, projectTotal, byClass, byCat };
  }, [rows, customStart, customEnd, catToClass]);

  const projectAllTime = useMemo(
    () => rows.filter(r => r.work?.kind === "project").reduce((s, r) => s + r.amount, 0),
    [rows]
  );

  // Generic subcategory grouping for all non-purchase types.
  const subgroups = useMemo(() => {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - trailingMonths);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    const result = {}; // { [type]: { [subkey]: { allTime, tN, tCustom } } }
    const bump = (type, key, r) => {
      if (!result[type]) result[type] = {};
      if (!result[type][key]) result[type][key] = { allTime: 0, tN: 0, tCustom: 0 };
      result[type][key].allTime += r.amount;
      if (r.date && r.date >= cutoffIso) result[type][key].tN += r.amount;
      if ((customStart || customEnd) && r.date &&
          (!customStart || r.date >= customStart) && (!customEnd || r.date <= customEnd))
        result[type][key].tCustom += r.amount;
    };
    rows.forEach(r => {
      const key = r.type === "mortgage"
        ? (r.date?.slice(0, 4) || "Unknown")
        : (r.label || "Other");
      bump(r.type, key, r);
      if (r.work?.kind === "project") bump("project", r.sublabel || "Unknown Project", r);
    });
    // Sort each type's subkeys by allTime descending (mortgage: descending year)
    const sorted = {};
    Object.entries(result).forEach(([t, keys]) => {
      sorted[t] = Object.entries(keys)
        .sort((a, b) => b[1].allTime - a[1].allTime)
        .map(([label, vals]) => ({ label, ...vals }));
    });
    return sorted;
  }, [rows, trailingMonths, customStart, customEnd]);

  function toggleClass(cls) {
    setOpenClasses(prev => {
      const next = new Set(prev);
      if (next.has(cls)) next.delete(cls); else next.add(cls);
      return next;
    });
  }

  function fmtShort(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
  }

  const customLabel = (customStart || customEnd)
    ? `${customStart ? fmtShort(customStart) : "…"} – ${customEnd ? fmtShort(customEnd) : "…"}`
    : controlled ? "Date Range" : "Custom";

  const dateInputStyle = {
    background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: 2,
    color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem",
    outline: "none", padding: "2px 4px",
  };

  const order = ["expense", "service", "utility", "mortgage", "purchase"];
  const present = order.filter(t => (summary.all[t] || 0) > 0 || (tN.byType[t] || 0) > 0);
  if (present.length === 0) return null;

  return (
    <div style={{ ...card, marginBottom: "1.5rem" }}>
      <div style={{ marginBottom: "0.9rem" }}><span style={sectionTitle}>Spend by Type</span></div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={thCell}>Type</th>
            <th style={{ ...thCell, textAlign: "right" }}>
              {controlled ? (
                <span style={{ color: tCustom ? "var(--fm-cyan)" : "var(--fm-ink-mute)", whiteSpace: "nowrap" }}>{customLabel}</span>
              ) : editingCustom ? (
                <div style={{ alignItems: "center", display: "flex", gap: 4, justifyContent: "flex-end" }}>
                  <input type="date" value={customStart} onChange={e => setLocalStart(e.target.value)} style={dateInputStyle} />
                  <span style={{ color: "var(--fm-ink-mute)" }}>–</span>
                  <input type="date" value={customEnd} onChange={e => setLocalEnd(e.target.value)} style={dateInputStyle} />
                  <button onClick={() => setEditingCustom(false)} style={{ background: "none", border: "none", color: "var(--fm-brass)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", padding: 0 }}>✓</button>
                </div>
              ) : (
                <span
                  onClick={() => setEditingCustom(true)}
                  title="Click to set date range"
                  style={{ borderBottom: `1px dashed ${tCustom ? "var(--fm-cyan)" : "var(--fm-ink-mute)"}`, color: tCustom ? "var(--fm-cyan)" : "var(--fm-ink-mute)", cursor: "pointer", whiteSpace: "nowrap" }}
                >{customLabel}</span>
              )}
            </th>
            <th style={{ ...thCell, textAlign: "right" }}>
              {"Trailing "}
              {editing ? (
                <input
                  type="number" autoFocus value={draft} min={1} max={120}
                  onChange={e => setDraft(e.target.value)}
                  onBlur={() => {
                    const v = parseInt(draft, 10);
                    if (v > 0 && v <= 120) setTrailingMonths(v);
                    setEditing(false);
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setEditing(false);
                  }}
                  style={{ background: "transparent", border: "none", borderBottom: "1px solid var(--fm-brass)", color: "var(--fm-brass)", fontFamily: "var(--fm-mono)", fontSize: "inherit", outline: "none", padding: "0 2px", textAlign: "center", width: 36 }}
                />
              ) : (
                <span
                  onClick={() => { setDraft(String(trailingMonths)); setEditing(true); }}
                  title="Click to change"
                  style={{ borderBottom: "1px dashed var(--fm-ink-mute)", color: "var(--fm-brass)", cursor: "pointer" }}
                >{trailingMonths}</span>
              )}
              {" mo"}
            </th>
            <th style={{ ...thCell, textAlign: "right", paddingRight: 0 }}>All-time</th>
          </tr>
        </thead>
        <tbody>
          {present.map(t => t === "purchase" ? (
            <Fragment key="purchase">
              <tr onClick={() => setPurchaseOpen(o => !o)} style={{ cursor: "pointer" }}>
                <td style={{ ...tdCell, color: "var(--fm-ink)" }}>
                  <span style={{ alignItems: "center", display: "inline-flex", gap: "0.4rem" }}>
                    <span style={{ color: "var(--fm-ink-mute)", display: "inline-block", fontSize: "0.5rem", transition: "transform 0.12s", transform: purchaseOpen ? "rotate(90deg)" : "none" }}>▶</span>
                    {LEDGER_TYPE_LABEL["purchase"]}
                  </span>
                </td>
                <td style={{ ...tdCell, color: tCustom ? "var(--fm-cyan)" : "var(--fm-ink-mute)", textAlign: "right" }}>
                  {tCustom ? fmtMoney(tCustom.byType["purchase"] || 0) : "—"}
                </td>
                <td style={{ ...tdCell, textAlign: "right" }}>{fmtMoney(tN.byType["purchase"] || 0)}</td>
                <td style={{ ...tdCell, textAlign: "right", paddingRight: 0 }}>{fmtMoney(summary.all["purchase"] || 0)}</td>
              </tr>
              {purchaseOpen && classGroups.map(g => {
                const clsOpen = openClasses.has(g.cls);
                return (
                  <Fragment key={g.cls}>
                    <tr onClick={() => toggleClass(g.cls)} style={{ cursor: "pointer" }}>
                      <td style={{ ...tdCell, color: "var(--fm-ink-dim)", paddingLeft: "1.25rem" }}>
                        <span style={{ alignItems: "center", display: "inline-flex", gap: "0.4rem" }}>
                          <span style={{ color: "var(--fm-ink-mute)", display: "inline-block", fontSize: "0.5rem", transition: "transform 0.12s", transform: clsOpen ? "rotate(90deg)" : "none" }}>▶</span>
                          {g.label}
                        </span>
                      </td>
                      <td style={{ ...tdCell, color: tCustom ? "var(--fm-cyan)" : "var(--fm-ink-mute)", textAlign: "right" }}>
                        {tCustom ? fmtMoney(tCustom.byClass[g.cls] || 0) : "—"}
                      </td>
                      <td style={{ ...tdCell, color: "var(--fm-ink-dim)", textAlign: "right" }}>{fmtMoney(tN.byClass[g.cls] || 0)}</td>
                      <td style={{ ...tdCell, color: "var(--fm-ink-dim)", textAlign: "right", paddingRight: 0 }}>{fmtMoney(g.subtotal)}</td>
                    </tr>
                    {clsOpen && g.cats.map(c => (
                      <tr key={c.category}>
                        <td style={{ ...tdCell, color: "var(--fm-ink-mute)", paddingLeft: "2.5rem" }}>{c.category}</td>
                        <td style={{ ...tdCell, color: tCustom ? "var(--fm-cyan)" : "var(--fm-ink-mute)", textAlign: "right" }}>
                          {tCustom ? fmtMoney(tCustom.byCat[c.category] || 0) : "—"}
                        </td>
                        <td style={{ ...tdCell, color: "var(--fm-ink-mute)", textAlign: "right" }}>{fmtMoney(tN.byCat[c.category] || 0)}</td>
                        <td style={{ ...tdCell, color: "var(--fm-ink-mute)", textAlign: "right", paddingRight: 0 }}>{fmtMoney(c.invested)}</td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </Fragment>
          ) : (() => {
            const isOpen = openTypes.has(t);
            const subs = subgroups[t] || [];
            return (
              <Fragment key={t}>
                <tr onClick={() => subs.length && toggleType(t)} style={{ cursor: subs.length ? "pointer" : "default" }}>
                  <td style={{ ...tdCell, color: "var(--fm-ink)" }}>
                    <span style={{ alignItems: "center", display: "inline-flex", gap: "0.4rem" }}>
                      {subs.length > 0 && <span style={{ color: "var(--fm-ink-mute)", display: "inline-block", fontSize: "0.5rem", transition: "transform 0.12s", transform: isOpen ? "rotate(90deg)" : "none" }}>▶</span>}
                      {LEDGER_TYPE_LABEL[t]}
                    </span>
                  </td>
                  <td style={{ ...tdCell, color: tCustom ? "var(--fm-cyan)" : "var(--fm-ink-mute)", textAlign: "right" }}>
                    {tCustom ? fmtMoney(tCustom.byType[t] || 0) : "—"}
                  </td>
                  <td style={{ ...tdCell, textAlign: "right" }}>{fmtMoney(tN.byType[t] || 0)}</td>
                  <td style={{ ...tdCell, textAlign: "right", paddingRight: 0 }}>{fmtMoney(summary.all[t] || 0)}</td>
                </tr>
                {isOpen && subs.map(s => (
                  <tr key={s.label}>
                    <td style={{ ...tdCell, color: "var(--fm-ink-mute)", paddingLeft: "1.25rem" }}>{s.label}</td>
                    <td style={{ ...tdCell, color: tCustom ? "var(--fm-cyan)" : "var(--fm-ink-mute)", textAlign: "right" }}>{tCustom ? fmtMoney(s.tCustom) : "—"}</td>
                    <td style={{ ...tdCell, color: "var(--fm-ink-dim)", textAlign: "right" }}>{fmtMoney(s.tN)}</td>
                    <td style={{ ...tdCell, color: "var(--fm-ink-dim)", textAlign: "right", paddingRight: 0 }}>{fmtMoney(s.allTime)}</td>
                  </tr>
                ))}
              </Fragment>
            );
          })())}
          {(() => {
            const projOpen = openTypes.has("project");
            const subs = subgroups["project"] || [];
            return (
              <Fragment key="project">
                <tr onClick={() => toggleType("project")} style={{ cursor: subs.length ? "pointer" : "default" }}>
                  <td style={{ ...tdCell, color: "var(--fm-ink)" }}>
                    <span style={{ alignItems: "center", display: "inline-flex", gap: "0.4rem" }}>
                      {subs.length > 0 && <span style={{ color: "var(--fm-ink-mute)", display: "inline-block", fontSize: "0.5rem", transition: "transform 0.12s", transform: projOpen ? "rotate(90deg)" : "none" }}>▶</span>}
                      Projects
                    </span>
                  </td>
                  <td style={{ ...tdCell, color: tCustom ? "var(--fm-cyan)" : "var(--fm-ink-mute)", textAlign: "right" }}>
                    {tCustom ? fmtMoney(tCustom.projectTotal) : "—"}
                  </td>
                  <td style={{ ...tdCell, textAlign: "right" }}>{fmtMoney(tN.projectTotal)}</td>
                  <td style={{ ...tdCell, textAlign: "right", paddingRight: 0 }}>{fmtMoney(projectAllTime)}</td>
                </tr>
                {projOpen && subs.map(s => (
                  <tr key={s.label}>
                    <td style={{ ...tdCell, color: "var(--fm-ink-mute)", paddingLeft: "1.25rem" }}>{s.label}</td>
                    <td style={{ ...tdCell, color: tCustom ? "var(--fm-cyan)" : "var(--fm-ink-mute)", textAlign: "right" }}>{tCustom ? fmtMoney(s.tCustom) : "—"}</td>
                    <td style={{ ...tdCell, color: "var(--fm-ink-dim)", textAlign: "right" }}>{fmtMoney(s.tN)}</td>
                    <td style={{ ...tdCell, color: "var(--fm-ink-dim)", textAlign: "right", paddingRight: 0 }}>{fmtMoney(s.allTime)}</td>
                  </tr>
                ))}
              </Fragment>
            );
          })()}
          <tr>
            <td style={{ ...tdCell, borderBottom: "1px solid var(--fm-hairline2)", color: "var(--fm-ink-mute)" }}>Total</td>
            <td style={{ ...tdCell, borderBottom: "1px solid var(--fm-hairline2)", color: tCustom ? "var(--fm-cyan)" : "var(--fm-ink-mute)", textAlign: "right" }}>
              {tCustom ? fmtMoney(tCustom.total) : "—"}
            </td>
            <td style={{ ...tdCell, borderBottom: "1px solid var(--fm-hairline2)", color: "var(--fm-brass)", textAlign: "right" }}>{fmtMoney(tN.total)}</td>
            <td style={{ ...tdCell, borderBottom: "1px solid var(--fm-hairline2)", color: "var(--fm-brass)", textAlign: "right", paddingRight: 0 }}>{fmtMoney(summary.allTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// Estimated-vs-actual spend per project (actual = attributed expenses).
function ProjectSpend({ rows, navigate }) {
  return (
    <div style={{ ...card, marginBottom: "1.5rem" }}>
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: "0.9rem" }}>
        <span style={sectionTitle}>Project Spend</span>
        <button onClick={() => navigate("projects")} style={navLink}>&rarr; Projects</button>
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={thCell}>Project</th>
            <th style={{ ...thCell, textAlign: "right" }}>Estimated</th>
            <th style={{ ...thCell, textAlign: "right", paddingRight: 0 }}>Spent</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const over = r.estimated > 0 && r.actual > r.estimated;
            return (
              <tr key={r.id}>
                <td style={{ ...tdCell, color: "var(--fm-ink)" }}>{r.name}</td>
                <td style={{ ...tdCell, textAlign: "right" }}>{r.estimated > 0 ? fmtMoney(r.estimated) : "—"}</td>
                <td style={{ ...tdCell, color: over ? "var(--fm-amber)" : "var(--fm-ink)", textAlign: "right", paddingRight: 0 }}>{r.actual > 0 ? fmtMoney(r.actual) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const LEDGER_FILTERS = [["all", "All"], ["expense", "Repairs"], ["utility", "Utilities"], ["service", "Services"], ["purchase", "Inventory"], ["mortgage", "Mortgage"]];
const LEDGER_TYPE_COLOR = { expense: "var(--fm-amber)", utility: "var(--fm-cyan)", service: "var(--fm-brass)", purchase: "var(--fm-brass-dim)", mortgage: "var(--fm-ink-dim)" };

// Per-type delete warning — derived rows (utility/purchase) mutate source data on
// other pages; generated rows (service/mortgage) are suppressed, not truly removed.
function deleteMessage(row) {
  if (!row) return "";
  const what = `“${row.label}”${row.sublabel ? ` · ${row.sublabel}` : ""}`;
  switch (row.type) {
    case "utility":  return `Delete the utility bill ${what}? This removes the bill from the Utilities page too.`;
    case "purchase": return `Clear the purchase price for ${what}? The item stays in Inventory — only its recorded price is removed.`;
    case "service":  return row.offCycle
      ? `Delete the logged visit ${what}? This removes the visit from the Services page too.`
      : `Remove the service charge ${what} from the ledger? This month's charge will be suppressed (set to $0). Restore it on the Services page.`;
    case "mortgage": return `Remove the mortgage payment ${what} from the ledger? This month will be set to $0. Restore it on the Mortgage page.`;
    default:         return `Delete ${what}? This can't be undone.`;
  }
}

// The unified transaction table: filter by type, sort by column, and select a row
// to act on it (Edit / Delete live in the panel header). The selected row's amount
// can be edited inline (driven by the parent).
function LedgerTable({ rows, selectedId, onSelect, editingId, draft, onDraftChange, onCommitEdit, onCancelEdit }) {
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState({ key: "date", dir: "desc" });

  const filtered = useMemo(() => {
    const base = filter === "all" ? rows : rows.filter(r => r.type === filter);
    const mul = sort.dir === "asc" ? 1 : -1;
    const valOf = (r) => sort.key === "amount" ? r.amount : sort.key === "type" ? r.type : (r.date || "");
    return [...base].sort((a, b) => {
      const av = valOf(a), bv = valOf(b);
      const p = (typeof av === "number" ? av - bv : String(av).localeCompare(String(bv))) * mul;
      return p !== 0 ? p : (b.date || "").localeCompare(a.date || "");
    });
  }, [rows, filter, sort]);

  function toggleSort(key) {
    setSort(s => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "type" ? "asc" : "desc" });
  }

  if (rows.length === 0) {
    return (
      <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.82rem", lineHeight: 1.7, padding: "0.25rem 0" }}>
        Nothing recorded yet. Log a repair above, add utility bills or services on their tabs, or enter purchase prices in Inventory — it all consolidates here.
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.85rem" }}>
        {LEDGER_FILTERS.map(([t, lbl]) => {
          const on = filter === t;
          return (
            <button key={t} onClick={() => setFilter(t)}
              style={{ background: on ? "var(--fm-brass-bg)" : "transparent", border: `1px solid ${on ? "var(--fm-brass)" : "var(--fm-hairline2)"}`, borderRadius: 3, color: on ? "var(--fm-brass)" : "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.06em", padding: "0.25rem 0.6rem", textTransform: "uppercase" }}>
              {lbl}
            </button>
          );
        })}
      </div>
      {filtered.length === 0 ? (
        <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.8rem", padding: "0.5rem 0" }}>No {LEDGER_TYPE_LABEL[filter]?.toLowerCase() || ""} entries.</div>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead style={{ background: "var(--fm-bg-panel)", position: "sticky", top: 0, zIndex: 5 }}>
            <tr>
              <SortTh label="Date" col="date" sort={sort} onSort={toggleSort} />
              <SortTh label="Type" col="type" sort={sort} onSort={toggleSort} />
              <th style={thCell}>Description</th>
              <SortTh label="Amount" col="amount" sort={sort} onSort={toggleSort} align="right" last />
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const selected = selectedId === r.id;
              const isEditing = editingId === r.id;
              return (
                <tr
                  key={r.id}
                  onClick={() => onSelect(r.id)}
                  style={{ background: selected ? "var(--fm-brass-bg)" : "transparent", cursor: "pointer" }}
                >
                  <td style={{ ...tdCell, color: "var(--fm-brass-dim)", whiteSpace: "nowrap" }}>{fmtDay(r.date)}</td>
                  <td style={tdCell}><span style={{ color: LEDGER_TYPE_COLOR[r.type] || "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{LEDGER_TYPE_LABEL[r.type]}</span></td>
                  <td style={{ ...tdCell, color: "var(--fm-ink)" }}>{r.label}{r.sublabel ? <span style={{ color: "var(--fm-ink-mute)" }}> · {r.sublabel}</span> : null}</td>
                  <td style={{ ...tdCell, color: "var(--fm-ink)", paddingRight: 0, textAlign: "right", whiteSpace: "nowrap" }}>
                    {isEditing ? (
                      <input
                        autoFocus type="number" min="0" step="0.01" value={draft}
                        onClick={e => e.stopPropagation()}
                        onChange={e => onDraftChange(e.target.value)}
                        onBlur={onCommitEdit}
                        onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); else if (e.key === "Escape") onCancelEdit(); }}
                        style={{ ...inputStyle, textAlign: "right", width: 90 }}
                      />
                    ) : fmtMoney(r.amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
