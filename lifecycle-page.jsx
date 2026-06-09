import { useState, useMemo } from "react";
import { useForemanStore } from "./lib/store.js";
import { toMonthly } from "./lib/services.js";
import { monthlyUtilitiesTotal } from "./lib/utilities.js";
import { expectedYears } from "./lib/lifespans.js";
import {
  buildRoster, computeForecast, computeReserve, computeWarranties, computeRepairs12mo,
} from "./lib/lifecycleStats.js";
import {
  loadCategoryTypeOverrides,
  BUILT_IN_CATEGORY_TYPES,
  GROUP_LABELS,
} from "./lib/categoryTypes.js";
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

const CLASS_ORDER = ["system", "room", "exterior", "safety"];

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

export default function LifecyclePage({ navigate }) {
  const [activeTab, setActiveTab] = useState("Cost of Ownership");

  const itemFieldValues = useForemanStore(s => s.itemFieldValues);
  const inventory       = useForemanStore(s => s.inventory);
  const svcData         = useForemanStore(s => s.services);
  const utilData        = useForemanStore(s => s.utilities);
  const expensesMap     = useForemanStore(s => s.expenses);
  const addExpense      = useForemanStore(s => s.addExpense);
  const updateExpense   = useForemanStore(s => s.updateExpense);
  const deleteExpense   = useForemanStore(s => s.deleteExpense);

  const [expenseForm, setExpenseForm] = useState(null); // null = closed

  function openAddExpense() {
    setExpenseForm({ date: new Date().toISOString().slice(0, 10), amount: "", label: "", linkedItem: "" });
  }
  function saveExpenseForm() {
    const amt = parseFloat(expenseForm.amount);
    if (isNaN(amt) || !expenseForm.date) return;
    const payload = { date: expenseForm.date, amount: amt, label: (expenseForm.label || "").trim(), linkedItem: expenseForm.linkedItem || null };
    if (expenseForm.id) updateExpense(expenseForm.id, payload);
    else addExpense({ id: "exp-" + Date.now(), ...payload });
    setExpenseForm(null);
  }

  // ── Build the item roster (shared lib), then tag each with its display class ───
  const roster = useMemo(() => {
    const overrides = loadCategoryTypeOverrides();
    const classOf = (category, categoryType) =>
      overrides[category] ?? categoryType ?? BUILT_IN_CATEGORY_TYPES[category] ?? "system";
    return buildRoster(itemFieldValues, inventory)
      .map(it => ({ ...it, cls: classOf(it.category, it.categoryType) }));
  }, [itemFieldValues, inventory]);

  // ── Item lookup + options for linking expenses ────────────────────────────────
  const { itemsByKey, itemOptions } = useMemo(() => {
    const itemsByKey = {};
    roster.forEach(it => { itemsByKey[it.stableKey] = { item: it.item, category: it.category }; });
    const itemOptions = [...roster].sort((a, b) =>
      a.category.localeCompare(b.category) || a.item.localeCompare(b.item));
    return { itemsByKey, itemOptions };
  }, [roster]);

  // ── Expenses ──────────────────────────────────────────────────────────────────
  const repairs12mo = useMemo(() => computeRepairs12mo(expensesMap), [expensesMap]);
  const expensesSorted = useMemo(
    () => Object.values(expensesMap || {}).sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [expensesMap]
  );

  // ── Aggregate by category, then group categories by class ─────────────────────
  const { classGroups, totalInvested, pricedCount, totalCount } = useMemo(() => {
    const catMap = {};
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
  }, [roster]);

  // ── Service spend ─────────────────────────────────────────────────────────────
  const { activeServices, monthlyService } = useMemo(() => {
    const all = Object.values(svcData?.services ?? {});
    const activeServices = all.filter(s => s.active);
    const monthlyService = activeServices.reduce((sum, s) => sum + toMonthly(s.cost, s.billingCycle), 0);
    return { activeServices, monthlyService };
  }, [svcData]);

  const annualService = monthlyService * 12;
  const monthlyUtil = useMemo(() => monthlyUtilitiesTotal(utilData), [utilData]);
  const annualUtil = monthlyUtil * 12;

  // ── Replacement forecast, reserve, warranties (shared lib) ─────────────────────
  const forecast   = useMemo(() => computeForecast(roster), [roster]);
  const reserve    = useMemo(() => computeReserve(forecast), [forecast]);
  const warranties = useMemo(() => computeWarranties(roster), [roster]);
  // Items that have a curated lifespan but no date — forecastable once dated.
  const missingDates = useMemo(
    () => roster.filter(it => expectedYears(it.item) != null && !it.installIso).length,
    [roster]
  );

  return (
    <div style={{ height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column", background: "var(--fm-bg)", fontFamily: "var(--fm-sans)", color: "var(--fm-ink)" }}>
      <FmHeader active="Lifecycle" tagline="cost & lifespan" />

      <FmSubnav
        tabs={["Cost of Ownership", "Replacement Forecast"]}
        active={activeTab}
        onTabChange={setActiveTab}
        stats={activeTab === "Cost of Ownership"
          ? [
              { value: fmtMoney(totalInvested), label: "invested", color: "var(--fm-brass)" },
              { value: fmtMoney(annualService), label: "/yr services", color: "var(--fm-cyan)" },
            ]
          : [
              { value: reserve.annual > 0 ? fmtMoney(reserve.annual) : "—", label: "/yr reserve", color: "var(--fm-amber)" },
              { value: forecast.length, label: "forecast", color: "var(--fm-ink)" },
            ]
        }
      />

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 1000, padding: "1.75rem 2.25rem" }}>

          {activeTab === "Cost of Ownership" && (
            <>
              {/* Summary cards */}
              <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(4, 1fr)", marginBottom: "1.5rem" }}>
                <SummaryCard label="Total Invested" value={fmtMoney(totalInvested)} sub={`${pricedCount} of ${totalCount} items priced`} color="var(--fm-brass)" />
                <SummaryCard label="Repairs · 12 mo" value={fmtMoney(repairs12mo)} sub="logged repair & part costs" color="var(--fm-amber)" />
                <SummaryCard label="Annual Services" value={fmtMoney(annualService)} sub={`${activeServices.length} active contract${activeServices.length !== 1 ? "s" : ""}`} color="var(--fm-cyan)" onClick={() => navigate("services")} />
                <SummaryCard label="Annual Utilities" value={fmtMoney(annualUtil)} sub="est. from monthly bills" color="var(--fm-cyan)" onClick={() => navigate("utilities")} />
              </div>

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
                        <th style={thCell}>Category</th>
                        <th style={{ ...thCell, textAlign: "right" }}>Items</th>
                        <th style={{ ...thCell, textAlign: "right" }}>Priced</th>
                        <th style={{ ...thCell, textAlign: "right" }}>Invested</th>
                        <th style={{ ...thCell, textAlign: "right", paddingRight: 0 }}>Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classGroups.map(group => (
                        <ClassBlock key={group.cls} group={group} totalInvested={totalInvested} />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Expense log */}
              <div style={{ ...card, marginBottom: "1.5rem" }}>
                <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: "0.9rem" }}>
                  <span style={sectionTitle}>Expense Log</span>
                  {!expenseForm && <button onClick={openAddExpense} style={pillBtn}>+ Add Expense</button>}
                </div>

                {expenseForm && (
                  <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
                    <input type="date" value={expenseForm.date} onChange={e => setExpenseForm(f => ({ ...f, date: e.target.value }))} style={{ ...inputStyle, width: 140 }} />
                    <input type="number" step="0.01" min="0" placeholder="Amount" value={expenseForm.amount} onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))} style={{ ...inputStyle, width: 100 }} />
                    <input type="text" placeholder="Description" value={expenseForm.label} onChange={e => setExpenseForm(f => ({ ...f, label: e.target.value }))} style={{ ...inputStyle, flex: 1, minWidth: 150 }} />
                    <select value={expenseForm.linkedItem} onChange={e => setExpenseForm(f => ({ ...f, linkedItem: e.target.value }))} style={{ ...inputStyle, maxWidth: 220 }}>
                      <option value="">— Link item (optional) —</option>
                      {itemOptions.map(o => <option key={o.stableKey} value={o.stableKey}>{o.category} · {o.item}</option>)}
                    </select>
                    <button onClick={saveExpenseForm} style={pillBtn}>Save</button>
                    <button onClick={() => setExpenseForm(null)} style={cancelBtn}>Cancel</button>
                  </div>
                )}

                {expensesSorted.length === 0 ? (
                  !expenseForm && (
                    <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.82rem", lineHeight: 1.7, padding: "0.25rem 0" }}>
                      No expenses logged yet. Track one-off repairs and parts here — link one to an inventory item to attribute the cost to its system or room.
                    </div>
                  )
                ) : (
                  <table style={{ borderCollapse: "collapse", width: "100%" }}>
                    <thead>
                      <tr>
                        <th style={thCell}>Date</th>
                        <th style={thCell}>Description</th>
                        <th style={thCell}>Item</th>
                        <th style={{ ...thCell, textAlign: "right" }}>Amount</th>
                        <th style={{ ...thCell, textAlign: "right", paddingRight: 0 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {expensesSorted.map(e => {
                        const linked = e.linkedItem ? itemsByKey[e.linkedItem] : null;
                        return (
                          <tr key={e.id}>
                            <td style={{ ...tdCell, color: "var(--fm-brass-dim)", whiteSpace: "nowrap" }}>{fmtDay(e.date)}</td>
                            <td style={{ ...tdCell, color: "var(--fm-ink)" }}>{e.label || "—"}</td>
                            <td style={tdCell}>{linked ? `${linked.category} · ${linked.item}` : "—"}</td>
                            <td style={{ ...tdCell, color: "var(--fm-ink)", textAlign: "right" }}>{fmtMoney(e.amount)}</td>
                            <td style={{ ...tdCell, textAlign: "right", paddingRight: 0, whiteSpace: "nowrap" }}>
                              <button onClick={() => setExpenseForm({ id: e.id, date: e.date, amount: String(e.amount ?? ""), label: e.label || "", linkedItem: e.linkedItem || "" })} style={rowBtn}>edit</button>
                              <button onClick={() => deleteExpense(e.id)} style={{ ...rowBtn, color: "var(--fm-red)" }}>delete</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Service spend detail */}
              {activeServices.length > 0 && (
                <div style={card}>
                  <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: "0.9rem" }}>
                    <span style={sectionTitle}>Service Spend</span>
                    <button onClick={() => navigate("services")} style={navLink}>&rarr; Services</button>
                  </div>
                  <table style={{ borderCollapse: "collapse", width: "100%" }}>
                    <thead>
                      <tr>
                        <th style={thCell}>Service</th>
                        <th style={thCell}>Provider</th>
                        <th style={{ ...thCell, textAlign: "right" }}>Cost</th>
                        <th style={{ ...thCell, textAlign: "right" }}>Cycle</th>
                        <th style={{ ...thCell, textAlign: "right", paddingRight: 0 }}>/ Year</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeServices
                        .slice()
                        .sort((a, b) => toMonthly(b.cost, b.billingCycle) - toMonthly(a.cost, a.billingCycle))
                        .map(s => (
                          <tr key={s.id}>
                            <td style={{ ...tdCell, color: "var(--fm-ink)" }}>{s.name}</td>
                            <td style={tdCell}>{s.providerName || "—"}</td>
                            <td style={{ ...tdCell, textAlign: "right" }}>{s.cost != null ? fmtMoney(s.cost) : "—"}</td>
                            <td style={{ ...tdCell, textAlign: "right" }}>{s.billingCycle}</td>
                            <td style={{ ...tdCell, color: "var(--fm-cyan)", textAlign: "right", paddingRight: 0 }}>{fmtMoney(toMonthly(s.cost, s.billingCycle) * 12)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {activeTab === "Replacement Forecast" && (
            <>
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
                <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: "0.9rem" }}>
                  <span style={sectionTitle}>By Item · Soonest First</span>
                  <button onClick={() => navigate("inventory")} style={navLink}>&rarr; Inventory</button>
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
                          <th style={thCell}>Item</th>
                          <th style={thCell}>Category</th>
                          <th style={{ ...thCell, textAlign: "right" }}>Installed</th>
                          <th style={{ ...thCell, textAlign: "right" }}>Age</th>
                          <th style={{ ...thCell, textAlign: "right" }}>Life</th>
                          <th style={{ ...thCell, textAlign: "center" }}>Remaining</th>
                          <th style={{ ...thCell, textAlign: "right", paddingRight: 0 }}>Est. Replace</th>
                        </tr>
                      </thead>
                      <tbody>
                        {forecast.map(f => {
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
                              <td style={{ ...tdCell, textAlign: "right" }}>{f.exp} yr</td>
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
            </>
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

function LifeBar({ pct, color }) {
  return (
    <div style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline)", borderRadius: 2, flexShrink: 0, height: 7, overflow: "hidden", width: 90 }}>
      <div style={{ background: color, height: "100%", width: `${pct}%` }} />
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

function ClassBlock({ group, totalInvested }) {
  return (
    <>
      <tr>
        <td colSpan={5} style={{ padding: "0.9rem 0 0.35rem" }}>
          <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.16em", textTransform: "uppercase" }}>
            {group.label}
          </span>
        </td>
      </tr>
      {group.cats.map(c => {
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
