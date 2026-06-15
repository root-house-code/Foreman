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

  const [expenseForm, setExpenseForm] = useState(null); // null = closed
  const [ledgerTab, setLedgerTab] = useState("History"); // Ledger page subnav: History | Summary
  const [expandedYm, setExpandedYm] = useState(null);   // Budget tab: open month
  const [plannedForm, setPlannedForm] = useState({ label: "", amount: "" });
  const [invSort, setInvSort] = useState({ key: "invested", dir: "desc" });

  // Sort column for the "Invested by System & Room" table (applied within each
  // section). Switching column picks a sensible default direction: names ascending,
  // numbers descending; clicking the active column toggles direction.
  function toggleInvSort(key) {
    setInvSort(s => s.key === key
      ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
      : { key, dir: key === "category" ? "asc" : "desc" });
  }

  function openAddExpense() {
    setExpenseForm({ date: new Date().toISOString().slice(0, 10), amount: "", label: "", linkedItem: "", linkedWork: "" });
  }
  function saveExpenseForm() {
    const amt = parseFloat(expenseForm.amount);
    if (isNaN(amt) || !expenseForm.date) return;
    const lw = expenseForm.linkedWork ? { kind: expenseForm.linkedWork.split(":")[0], id: expenseForm.linkedWork.split(":").slice(1).join(":") } : null;
    const payload = { date: expenseForm.date, amount: amt, label: (expenseForm.label || "").trim(), linkedItem: expenseForm.linkedItem || null, linkedWork: lw };
    if (expenseForm.id) updateExpense(expenseForm.id, payload);
    else addExpense({ id: "exp-" + Date.now(), ...payload });
    setExpenseForm(null);
  }

  // Deep-link from the command palette: open the Add Expense form on the Ledger.
  useEffect(() => {
    if (view === "ledger" && navState?.openAdd) openAddExpense();
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
  const itemOptions = useMemo(
    () => [...roster].sort((a, b) => a.category.localeCompare(b.category) || a.item.localeCompare(b.item)),
    [roster]
  );

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
  const projectSpend  = useMemo(() => summarizeProjectSpend(expensesMap, projects), [expensesMap, projects]);

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
  }), [svcData, utilData, reserve.annual, repairs12mo, budgetWarranties, budget]);
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
      <FmHeader active={view === "ledger" ? "Ledger" : view === "mortgage" ? "Mortgage" : "Forecast"} tagline={view === "ledger" ? "spending & history" : view === "mortgage" ? "financing" : "forward projection"} />

      {view === "ledger" && (
        <FmSubnav
          tabs={["History", "Summary"]}
          active={ledgerTab}
          onTabChange={setLedgerTab}
          stats={[
            { value: fmtMoney(ledgerSummary.t12Total), label: "spent /12mo", color: "var(--fm-amber)" },
            { value: fmtMoney(totalInvested), label: "invested", color: "var(--fm-brass)" },
          ]}
        />
      )}

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 1000, padding: "1.75rem 2.25rem" }}>

          {view === "ledger" && ledgerTab === "Summary" && (
            <>
              {/* Headline spend */}
              <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(3, 1fr)", marginBottom: "1.5rem" }}>
                <SummaryCard label="Total Invested" value={fmtMoney(totalInvested)} sub={`${pricedCount} of ${totalCount} items priced`} color="var(--fm-brass)" />
                <SummaryCard label="Spent · 12 mo" value={fmtMoney(ledgerSummary.t12Total)} sub="all paid, trailing year" color="var(--fm-amber)" />
                <SummaryCard label="Spent · all-time" value={fmtMoney(ledgerSummary.allTotal)} sub="everything recorded" color="var(--fm-cyan)" />
              </div>

              {/* Spend by type */}
              <SpendByType summary={ledgerSummary} />

              {/* Project spend (estimated vs actual) */}
              {projectSpend.length > 0 && <ProjectSpend rows={projectSpend} navigate={navigate} />}

              {/* Invested by system & room */}
              <div style={{ ...card, marginBottom: "1.5rem" }}>
                <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: "0.9rem" }}>
                  <span style={sectionTitle}>Invested by System &amp; Room</span>
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
                        <SortTh label="Invested" col="invested" sort={invSort} onSort={toggleInvSort} align="right" />
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
            </>
          )}

          {view === "ledger" && ledgerTab === "History" && (
            <>
              {/* Transaction history */}
              <div style={{ ...card, marginBottom: "1.5rem" }}>
                <div style={{ alignItems: "center", display: "flex", justifyContent: "flex-end", marginBottom: "0.9rem" }}>
                  {!expenseForm && <button onClick={openAddExpense} style={pillBtn}>+ Add Expense</button>}
                </div>

                {expenseForm && (
                  <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
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

                <LedgerTable rows={ledger} onEditExpense={editExpenseRow} onDeleteExpense={deleteExpense} onCorrectService={correctServiceCharge} navigate={navigate} />
              </div>
            </>
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
                {/* Hero: run rate */}
                <div style={{ ...card, marginBottom: "1.5rem" }}>
                  <div style={{ alignItems: "flex-end", display: "flex", flexWrap: "wrap", gap: "1.5rem", justifyContent: "space-between" }}>
                    <div>
                      <div style={sectionTitle}>Cost to Operate · Next 12 Months</div>
                      <div style={{ color: "var(--fm-brass)", fontFamily: "var(--fm-serif)", fontSize: "2.4rem", fontWeight: 500, letterSpacing: "-0.01em", margin: "0.3rem 0 0.1rem", whiteSpace: "nowrap" }}>
                        {fmtMoney(budgetSummary.avgMonthly)}<span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.8rem" }}> / mo avg</span>
                      </div>
                      <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem" }}>
                        {fmtMoney(budgetSummary.annualTotal)} projected over the year
                      </div>
                      {mortgageOn && (
                        <div style={{ borderTop: "1px solid var(--fm-hairline)", marginTop: "0.7rem", paddingTop: "0.55rem" }}>
                          <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>+ Mortgage · Total Monthly Outlay</div>
                          <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "1.5rem", fontWeight: 500, margin: "0.2rem 0 0", whiteSpace: "nowrap" }}>
                            {fmtMoney(budgetSummary.avgMonthly + mortgageRoll.avgMonthly)}<span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.7rem" }}> / mo</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", maxWidth: 460 }}>
                      {[
                        ["Services", catAverages.services, "var(--fm-brass)"],
                        ["Utilities", catAverages.utilities, "var(--fm-cyan)"],
                        ["Reserve", catAverages.reserve, "var(--fm-amber)"],
                        ["Repairs", catAverages.repairs, "var(--fm-ink-dim)"],
                        ["Planned", catAverages.planned, "var(--fm-green)"],
                      ].filter(([, v]) => v > 0).map(([label, v, color]) => (
                        <div key={label} style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline)", borderRadius: "var(--fm-radius)", padding: "0.45rem 0.7rem", minWidth: 92 }}>
                          <div style={{ color, fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</div>
                          <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.85rem", marginTop: "0.15rem" }}>{fmtMoney(v)}<span style={{ color: "var(--fm-ink-mute)", fontSize: "0.6rem" }}>/mo</span></div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ borderTop: "1px solid var(--fm-hairline)", color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", lineHeight: 1.6, marginTop: "1rem", paddingTop: "0.75rem" }}>
                    Logged so far this month: <span style={{ color: "var(--fm-ink)" }}>{fmtMoney(currentActual)}</span> of ~{fmtMoney(budgetMonths[0]?.total)} projected.
                  </div>
                </div>

                {/* Target + run-rate toggles */}
                <div style={{ ...card, marginBottom: "1.5rem" }}>
                  <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "1.5rem", justifyContent: "space-between" }}>
                    <div style={{ alignItems: "center", display: "flex", gap: "0.75rem" }}>
                      <span style={sectionTitle}>Monthly Target</span>
                      <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.7rem" }}>$</span>
                      <input
                        type="number" step="10" min="0" placeholder="none"
                        value={budget.monthlyTarget ?? ""}
                        onChange={e => setBudgetSettings({ monthlyTarget: e.target.value === "" ? null : parseFloat(e.target.value) })}
                        style={{ ...inputStyle, width: 110 }}
                      />
                      {budget.monthlyTarget > 0 && (() => {
                        const delta = budgetSummary.avgMonthly - budget.monthlyTarget;
                        const over = delta > 0;
                        return (
                          <span style={{ color: over ? "var(--fm-red)" : "var(--fm-green)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem" }}>
                            {over ? "▲" : "▼"} {fmtMoney(Math.abs(delta))}/mo {over ? "over" : "under"}
                          </span>
                        );
                      })()}
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <ToggleChip on={budget.includeReserve} label="Reserve" onClick={() => setBudgetSettings({ includeReserve: !budget.includeReserve })} />
                      <ToggleChip on={budget.includeRepairsBaseline} label="Repairs baseline" onClick={() => setBudgetSettings({ includeRepairsBaseline: !budget.includeRepairsBaseline })} />
                    </div>
                  </div>
                </div>

                {/* Chart */}
                <div style={{ ...card, marginBottom: "1.5rem" }}>
                  <div style={{ marginBottom: "1rem" }}><span style={sectionTitle}>Projected Outflow by Month</span></div>
                  <BudgetChart months={budgetMonths} target={budget.monthlyTarget || 0} />
                </div>

                {/* Heaviest-month callout */}
                {budgetSummary.heaviest && (
                  <div style={{ ...card, alignItems: "center", display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
                    <div style={{ borderRight: "1px solid var(--fm-hairline2)", paddingRight: "1rem", whiteSpace: "nowrap" }}>
                      <div style={sectionTitle}>Heaviest Month</div>
                      <div style={{ color: "var(--fm-amber)", fontFamily: "var(--fm-serif)", fontSize: "1.5rem", fontWeight: 500, margin: "0.25rem 0 0" }}>{budgetSummary.heaviest.label}</div>
                    </div>
                    <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-sans)", fontSize: "0.82rem", lineHeight: 1.6 }}>
                      <span style={{ color: "var(--fm-ink)", fontWeight: 500 }}>{fmtMoney(budgetSummary.heaviest.total)}</span> expected{heavyReason(budgetSummary.heaviest)}. Set aside a little extra ahead of it.
                    </div>
                  </div>
                )}

                {/* Month-by-month table */}
                <div style={card}>
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
                              <td style={{ ...tdCell, color: "var(--fm-ink)", fontWeight: 500, textAlign: "right", paddingRight: 0 }}>{fmtMoney(m.total)}</td>
                            </tr>
                            {open && (
                              <tr>
                                <td colSpan={7} style={{ background: "var(--fm-bg-sunk)", borderBottom: "1px solid var(--fm-hairline)", padding: "0.9rem 1rem" }}>
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
                                    <div style={detailLabel}>Planned one-offs</div>
                                    {(m.planned || []).map(p => (
                                      <div key={p.id} style={detailRow}>
                                        <span style={{ color: "var(--fm-ink-dim)" }}>{p.label || "—"}</span>
                                        <span style={{ alignItems: "center", display: "flex", gap: "0.6rem" }}>
                                          <span style={{ color: "var(--fm-green)" }}>{fmtMoney(p.amount)}</span>
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
                                      >+ Plan</button>
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
  const cats = sortInvestedCats(group.cats, sort);
  return (
    <>
      <tr>
        <td colSpan={5} style={{ padding: "0.9rem 0 0.35rem" }}>
          <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.16em", textTransform: "uppercase" }}>
            {group.label}
          </span>
        </td>
      </tr>
      {cats.map(c => {
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
];

function BudgetChart({ months, target }) {
  const [hover, setHover] = useState(null);
  const H = 150;
  const max = Math.max(target || 0, ...months.map(m => m.total), 1);
  return (
    <div style={{ position: "relative" }}>
      <div style={{ alignItems: "flex-end", display: "flex", gap: "0.4rem", height: H, position: "relative" }}>
        {target > 0 && (
          <div style={{ borderTop: "1px dashed var(--fm-amber)", bottom: (target / max) * H, left: 0, position: "absolute", right: 0, zIndex: 2 }}>
            <span style={{ background: "var(--fm-bg-panel)", color: "var(--fm-amber)", fontFamily: "var(--fm-mono)", fontSize: "0.5rem", padding: "0 0.25rem", position: "absolute", right: 0, top: -7 }}>target</span>
          </div>
        )}
        {months.map((m, i) => {
          const barH = (m.total / max) * H;
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
                  return <div key={key} style={{ background: color, height: `${(v / m.total) * 100}%`, opacity: hover === i ? 1 : 0.85, width: "100%" }} />;
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
      <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", marginBottom: "0.35rem" }}>{m.label} · {fmtMoney(m.total)}</div>
      {[
        ["Services", m.servicesTotal, "var(--fm-brass)"],
        ["Utilities", m.utilities, "var(--fm-cyan)"],
        ["Reserve", m.reserve, "var(--fm-amber)"],
        ["Repairs", m.repairs, "var(--fm-ink-dim)"],
        ["Planned", m.plannedTotal, "var(--fm-green)"],
      ].filter(([, v]) => v > 0).map(([label, v, color]) => (
        <div key={label} style={{ display: "flex", fontFamily: "var(--fm-mono)", fontSize: "0.56rem", gap: "0.5rem", justifyContent: "space-between" }}>
          <span style={{ color }}>{label}</span><span style={{ color: "var(--fm-ink-dim)" }}>{fmtMoney(v)}</span>
        </div>
      ))}
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

// Spend totals by type — trailing-12 and all-time — from the ledger.
function SpendByType({ summary }) {
  const order = ["expense", "service", "utility", "mortgage", "purchase"];
  const present = order.filter(t => (summary.all[t] || 0) > 0 || (summary.t12[t] || 0) > 0);
  if (present.length === 0) return null;
  return (
    <div style={{ ...card, marginBottom: "1.5rem" }}>
      <div style={{ marginBottom: "0.9rem" }}><span style={sectionTitle}>Spend by Type</span></div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={thCell}>Type</th>
            <th style={{ ...thCell, textAlign: "right" }}>Trailing 12 mo</th>
            <th style={{ ...thCell, textAlign: "right", paddingRight: 0 }}>All-time</th>
          </tr>
        </thead>
        <tbody>
          {present.map(t => (
            <tr key={t}>
              <td style={{ ...tdCell, color: "var(--fm-ink)" }}>{LEDGER_TYPE_LABEL[t]}</td>
              <td style={{ ...tdCell, textAlign: "right" }}>{fmtMoney(summary.t12[t] || 0)}</td>
              <td style={{ ...tdCell, textAlign: "right", paddingRight: 0 }}>{fmtMoney(summary.all[t] || 0)}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...tdCell, borderBottom: "1px solid var(--fm-hairline2)", color: "var(--fm-ink-mute)" }}>Total</td>
            <td style={{ ...tdCell, borderBottom: "1px solid var(--fm-hairline2)", color: "var(--fm-brass)", textAlign: "right" }}>{fmtMoney(summary.t12Total)}</td>
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

const LEDGER_FILTERS = [["all", "All"], ["expense", "Repairs"], ["utility", "Utilities"], ["service", "Services"], ["purchase", "Purchases"], ["mortgage", "Mortgage"]];
const LEDGER_TYPE_COLOR = { expense: "var(--fm-amber)", utility: "var(--fm-cyan)", service: "var(--fm-brass)", purchase: "var(--fm-brass-dim)", mortgage: "var(--fm-ink-dim)" };

// The unified transaction table: filter by type, sort by column, edit expenses,
// correct service charges inline, open the source for read-only rows.
function LedgerTable({ rows, onEditExpense, onDeleteExpense, onCorrectService, navigate }) {
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState({ key: "date", dir: "desc" });
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");

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
  function openSource(row) {
    if (row.type === "utility") navigate("utilities");
    else if (row.type === "purchase") navigate("inventory");
    else if (row.type === "mortgage") navigate("forecast");
    else if (row.type === "service") navigate("services");
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
          <thead>
            <tr>
              <SortTh label="Date" col="date" sort={sort} onSort={toggleSort} />
              <SortTh label="Type" col="type" sort={sort} onSort={toggleSort} />
              <th style={thCell}>Description</th>
              <SortTh label="Amount" col="amount" sort={sort} onSort={toggleSort} align="right" />
              <th style={{ ...thCell, textAlign: "right", paddingRight: 0 }} />
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id}>
                <td style={{ ...tdCell, color: "var(--fm-brass-dim)", whiteSpace: "nowrap" }}>{fmtDay(r.date)}</td>
                <td style={tdCell}><span style={{ color: LEDGER_TYPE_COLOR[r.type] || "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{LEDGER_TYPE_LABEL[r.type]}</span></td>
                <td style={{ ...tdCell, color: "var(--fm-ink)" }}>{r.label}{r.sublabel ? <span style={{ color: "var(--fm-ink-mute)" }}> · {r.sublabel}</span> : null}</td>
                <td style={{ ...tdCell, color: "var(--fm-ink)", textAlign: "right", whiteSpace: "nowrap" }}>
                  {editing === r.id ? (
                    <input
                      autoFocus type="number" min="0" step="0.01" value={draft}
                      onChange={e => setDraft(e.target.value)}
                      onBlur={() => { onCorrectService(r, draft); setEditing(null); }}
                      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); else if (e.key === "Escape") setEditing(null); }}
                      style={{ ...inputStyle, textAlign: "right", width: 90 }}
                    />
                  ) : fmtMoney(r.amount)}
                </td>
                <td style={{ ...tdCell, textAlign: "right", paddingRight: 0, whiteSpace: "nowrap" }}>
                  {r.type === "expense" ? (
                    <>
                      <button onClick={() => onEditExpense(r.refId)} style={rowBtn}>edit</button>
                      <button onClick={() => onDeleteExpense(r.refId)} style={{ ...rowBtn, color: "var(--fm-red)" }}>delete</button>
                    </>
                  ) : r.type === "service" ? (
                    <button onClick={() => { setDraft(String(r.amount)); setEditing(r.id); }} style={rowBtn} title="Correct this charge">correct</button>
                  ) : (
                    <button onClick={() => openSource(r)} style={rowBtn}>open</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
