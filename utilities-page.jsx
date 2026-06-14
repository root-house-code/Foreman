import { useState, useMemo, useEffect } from "react";
import { useForemanStore } from "./lib/store.js";
import { FIXED_UTILITY_TYPES, DEFAULT_UNIT, estimatedMonthly, monthlyUtilitiesTotal } from "./lib/utilities.js";
import FmHeader from "./src/components/FmHeader.jsx";
import FmSubnav from "./src/components/FmSubnav.jsx";
import { FilterDropdown } from "./components/FilterPill.jsx";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtCost(cost) {
  if (cost == null || cost === "") return "—";
  return "$" + Number(cost).toFixed(2);
}

function fmtMonth(periodMonth) {
  if (!periodMonth) return "—";
  const [y, m] = periodMonth.split("-").map(Number);
  if (!y || !m) return periodMonth;
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function displayType(util) {
  return util.type === "Other" ? (util.customType || "Other") : (util.type || "—");
}

function fmtUsage(usage, unitLabel) {
  if (usage == null || usage === "" || !unitLabel) return "—";
  return `${Number(usage).toLocaleString("en-US")} ${unitLabel}`;
}

// ── Style constants (shared with the Services page conventions) ────────────────

const thCell = {
  borderBottom: "1px solid var(--fm-hairline2)",
  color: "var(--fm-brass-dim)",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.58rem",
  fontWeight: 400,
  letterSpacing: "0.12em",
  padding: "0 0.75rem 0.5rem 0",
  textAlign: "left",
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

const fieldLabel = {
  color: "var(--fm-ink-mute)",
  display: "block",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.6rem",
  letterSpacing: "0.1em",
  marginBottom: "0.25rem",
  textTransform: "uppercase",
};

const fieldInput = {
  background: "var(--fm-bg-sunk)",
  border: "var(--fm-border-2)",
  borderRadius: "var(--fm-radius)",
  color: "var(--fm-ink)",
  fontFamily: "var(--fm-sans)",
  fontSize: "0.82rem",
  outline: "none",
  padding: "0.4rem 0.6rem",
  width: "100%",
  boxSizing: "border-box",
};

const fieldSelect = { ...fieldInput, cursor: "pointer" };

const modalOverlay = {
  alignItems: "flex-start",
  background: "rgba(0,0,0,0.6)",
  bottom: 0,
  display: "flex",
  justifyContent: "center",
  left: 0,
  overflowY: "auto",
  position: "fixed",
  right: 0,
  top: 0,
  zIndex: 200,
};

const modalBox = {
  background: "var(--fm-bg-panel)",
  border: "var(--fm-border)",
  borderRadius: "var(--fm-radius-lg)",
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  margin: "4rem auto",
  maxWidth: 540,
  padding: "1.5rem",
  width: "90%",
};

const btnPrimary = {
  background: "var(--fm-brass-bg)",
  border: "1px solid var(--fm-brass)",
  borderRadius: "var(--fm-radius)",
  color: "var(--fm-brass)",
  cursor: "pointer",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.72rem",
  letterSpacing: "0.06em",
  padding: "0.4rem 0.9rem",
};

const btnGhost = {
  background: "transparent",
  border: "1px solid var(--fm-hairline2)",
  borderRadius: "var(--fm-radius)",
  color: "var(--fm-ink-dim)",
  cursor: "pointer",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.72rem",
  padding: "0.4rem 0.9rem",
};

const btnDanger = {
  background: "transparent",
  border: "1px solid var(--fm-red)",
  borderRadius: "var(--fm-radius)",
  color: "var(--fm-red)",
  cursor: "pointer",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.72rem",
  padding: "0.4rem 0.7rem",
};

const EMPTY_UTILITY = {
  name: "",
  type: "Electricity",
  customType: "",
  providerName: "",
  accountNumber: "",
  unitLabel: DEFAULT_UNIT["Electricity"] ?? "",
  typicalAmount: "",
  dueDayOfMonth: "",
  autopay: false,
  notes: "",
  active: true,
};

const EMPTY_BILL = {
  periodMonth: new Date().toISOString().slice(0, 7),
  amount: "",
  usage: "",
  dueDate: "",
  paid: false,
  notes: "",
};

// ── UtilityModal ───────────────────────────────────────────────────────────────

function UtilityModal({ initial, isEdit, onSave, onClose }) {
  const [form, setForm] = useState(() => ({ ...EMPTY_UTILITY, ...initial }));
  function set(field, val) { setForm(f => ({ ...f, [field]: val })); }

  function handleTypeChange(type) {
    setForm(f => ({ ...f, type, unitLabel: DEFAULT_UNIT[type] ?? "" }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const id = isEdit ? initial.id : "util-" + Date.now();
    onSave({
      ...form,
      id,
      typicalAmount: form.typicalAmount === "" ? null : Number(form.typicalAmount),
      dueDayOfMonth: form.dueDayOfMonth === "" ? null : Number(form.dueDayOfMonth),
      active: isEdit ? form.active : true,
    });
  }

  return (
    <div style={modalOverlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={handleSubmit} style={modalBox}>
        <div style={{ borderBottom: "1px solid var(--fm-hairline)", paddingBottom: "0.75rem" }}>
          <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "1.1rem" }}>
            {isEdit ? "Edit Utility" : "Add Utility"}
          </span>
        </div>

        <div>
          <label style={fieldLabel}>Name *</label>
          <input required style={fieldInput} value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. PG&E Electric" />
        </div>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Type</label>
            <select style={fieldSelect} value={form.type} onChange={e => handleTypeChange(e.target.value)}>
              {FIXED_UTILITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {form.type === "Other" && (
            <div style={{ flex: 1 }}>
              <label style={fieldLabel}>Custom Type</label>
              <input style={fieldInput} value={form.customType} onChange={e => set("customType", e.target.value)} placeholder="e.g. Recycling" />
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <div style={{ flex: 2 }}>
            <label style={fieldLabel}>Provider</label>
            <input style={fieldInput} value={form.providerName} onChange={e => set("providerName", e.target.value)} placeholder="e.g. ComEd" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Account #</label>
            <input style={fieldInput} value={form.accountNumber} onChange={e => set("accountNumber", e.target.value)} placeholder="optional" />
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Usage Unit</label>
            <input style={fieldInput} value={form.unitLabel} onChange={e => set("unitLabel", e.target.value)} placeholder="kWh / therms / gallons (blank = flat)" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Typical Monthly ($)</label>
            <input style={fieldInput} type="number" min="0" step="0.01" value={form.typicalAmount} onChange={e => set("typicalAmount", e.target.value)} placeholder="estimate" />
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Due Day of Month</label>
            <input style={fieldInput} type="number" min="1" max="31" value={form.dueDayOfMonth} onChange={e => set("dueDayOfMonth", e.target.value)} placeholder="e.g. 15" />
          </div>
          <div style={{ flex: 1, paddingBottom: "0.45rem" }}>
            <label style={{ ...fieldLabel, display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", marginBottom: 0 }}>
              <input type="checkbox" checked={form.autopay} onChange={e => set("autopay", e.target.checked)} />
              Autopay
            </label>
          </div>
        </div>

        <div>
          <label style={fieldLabel}>Notes</label>
          <textarea style={{ ...fieldInput, resize: "vertical", minHeight: 64 }} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Account login, rate plan, notes…" />
        </div>

        {isEdit && (
          <div>
            <label style={{ ...fieldLabel, display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
              <input type="checkbox" checked={form.active} onChange={e => set("active", e.target.checked)} />
              Active
            </label>
          </div>
        )}

        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button type="button" style={btnGhost} onClick={onClose}>Cancel</button>
          <button type="submit" style={btnPrimary}>{isEdit ? "Save" : "Add Utility"}</button>
        </div>
      </form>
    </div>
  );
}

// ── BillModal ──────────────────────────────────────────────────────────────────

function BillModal({ utility, initial, isEdit, onSave, onClose }) {
  const [form, setForm] = useState(() => ({ ...EMPTY_BILL, ...(initial || {}), utilityId: utility?.id || initial?.utilityId || "" }));
  function set(field, val) { setForm(f => ({ ...f, [field]: val })); }

  // When opened from History without a pre-selected utility, allow selecting one.
  const utilData = useForemanStore(s => s.utilities);
  const allUtilities = Object.values(utilData?.utilities ?? {}).filter(u => u.active);
  const effectiveUtil = utility || allUtilities.find(u => u.id === form.utilityId) || null;
  const unitLabel = effectiveUtil?.unitLabel || "";

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.utilityId || form.amount === "") return;
    const id = isEdit ? initial.id : "bill-" + Date.now();
    onSave({
      ...form,
      id,
      amount: Number(form.amount),
      usage: form.usage === "" ? null : Number(form.usage),
    });
  }

  return (
    <div style={modalOverlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={handleSubmit} style={modalBox}>
        <div style={{ borderBottom: "1px solid var(--fm-hairline)", paddingBottom: "0.75rem" }}>
          <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "1.1rem" }}>
            {isEdit ? "Edit Bill" : "Log Bill"}
          </span>
          {utility && (
            <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.7rem", marginLeft: "0.75rem" }}>
              {utility.name}
            </span>
          )}
        </div>

        {!utility && (
          <div>
            <label style={fieldLabel}>Utility *</label>
            <select required style={fieldSelect} value={form.utilityId} onChange={e => set("utilityId", e.target.value)}>
              <option value="">Select a utility…</option>
              {allUtilities.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Billing Period</label>
            <input required style={fieldInput} type="month" value={form.periodMonth} onChange={e => set("periodMonth", e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Amount ($) *</label>
            <input required style={fieldInput} type="number" min="0" step="0.01" value={form.amount} onChange={e => set("amount", e.target.value)} placeholder="0.00" />
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          {unitLabel && (
            <div style={{ flex: 1 }}>
              <label style={fieldLabel}>Usage ({unitLabel})</label>
              <input style={fieldInput} type="number" min="0" step="any" value={form.usage} onChange={e => set("usage", e.target.value)} placeholder="optional" />
            </div>
          )}
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Due Date</label>
            <input style={fieldInput} type="date" value={form.dueDate} onChange={e => set("dueDate", e.target.value)} />
          </div>
        </div>

        <div>
          <label style={{ ...fieldLabel, display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
            <input type="checkbox" checked={form.paid} onChange={e => set("paid", e.target.checked)} />
            Paid
          </label>
        </div>

        <div>
          <label style={fieldLabel}>Notes</label>
          <textarea style={{ ...fieldInput, resize: "vertical", minHeight: 56 }} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Rate changes, disputes, etc." />
        </div>

        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button type="button" style={btnGhost} onClick={onClose}>Cancel</button>
          <button type="submit" style={btnPrimary}>{isEdit ? "Save" : "Log Bill"}</button>
        </div>
      </form>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function UtilitiesPage({ navigate, navState }) {
  const utilData      = useForemanStore(s => s.utilities);
  const addUtility    = useForemanStore(s => s.addUtility);
  const updateUtility = useForemanStore(s => s.updateUtility);
  const deleteUtility = useForemanStore(s => s.deleteUtility);
  const addBill       = useForemanStore(s => s.addBill);
  const updateBill    = useForemanStore(s => s.updateBill);
  const deleteBill    = useForemanStore(s => s.deleteBill);

  const allUtilities = useMemo(() => Object.values(utilData?.utilities ?? {}), [utilData]);
  const allBills     = useMemo(() => Object.values(utilData?.bills ?? {}), [utilData]);

  const [activeTab, setActiveTab] = useState("Utilities");

  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [typeFilter, setTypeFilter]     = useState("ALL");
  const [search, setSearch]             = useState("");
  const [expandedId, setExpandedId]     = useState(null);

  // Deep-link from the command palette: pre-fill search, or open the Log Bill modal.
  useEffect(() => {
    if (navState?.search != null) { setActiveTab("Utilities"); setStatusFilter("ALL"); setSearch(navState.search); }
    if (navState?.openAdd) { setBillUtil(null); setBillFromHistory(true); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [histTypeFilter, setHistTypeFilter] = useState("ALL");
  const [histSearch, setHistSearch]         = useState("");

  const [addOpen, setAddOpen]           = useState(false);
  const [editUtil, setEditUtil]         = useState(null);
  const [billUtil, setBillUtil]         = useState(null);     // utility to log a bill for (null = general)
  const [billFromHistory, setBillFromHistory] = useState(false);
  const [editBill, setEditBill]         = useState(null);     // { bill, utility }
  const [confirmDeleteUtilId, setConfirmDeleteUtilId] = useState(null);
  const [confirmDeleteBillId, setConfirmDeleteBillId] = useState(null);

  // Categories present in data
  const presentTypes = useMemo(() => {
    const types = new Set(allUtilities.map(u => u.type === "Other" ? (u.customType || "Other") : u.type));
    return FIXED_UTILITY_TYPES.filter(t => t === "Other" ? false : types.has(t))
      .concat([...types].filter(t => !FIXED_UTILITY_TYPES.includes(t)));
  }, [allUtilities]);

  // Bills helpers
  function billsFor(utilityId) {
    return allBills.filter(b => b.utilityId === utilityId);
  }
  function latestBill(utilityId) {
    return billsFor(utilityId).sort((a, b) => (b.periodMonth || "").localeCompare(a.periodMonth || ""))[0] || null;
  }

  // Filtered utilities
  const filtered = useMemo(() => {
    let list = allUtilities;
    if (statusFilter === "ACTIVE") list = list.filter(u => u.active);
    if (typeFilter !== "ALL") {
      list = list.filter(u => {
        const t = u.type === "Other" ? (u.customType || "Other") : u.type;
        return t === typeFilter;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u =>
        u.name.toLowerCase().includes(q) ||
        (u.providerName || "").toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [allUtilities, statusFilter, typeFilter, search]);

  const activeUtilities = useMemo(() => allUtilities.filter(u => u.active), [allUtilities]);
  const estMonthlyTotal = useMemo(() => monthlyUtilitiesTotal(utilData), [utilData]);

  // Filtered bills (History tab)
  const filteredBills = useMemo(() => {
    return allBills
      .filter(b => {
        const util = utilData?.utilities?.[b.utilityId] ?? {};
        const t = util.type === "Other" ? (util.customType || "Other") : util.type;
        if (histTypeFilter !== "ALL" && t !== histTypeFilter) return false;
        if (histSearch.trim()) {
          const q = histSearch.toLowerCase();
          if (
            !(util.name || "").toLowerCase().includes(q) &&
            !(b.notes || "").toLowerCase().includes(q)
          ) return false;
        }
        return true;
      })
      .sort((a, b) => (b.periodMonth || "").localeCompare(a.periodMonth || ""));
  }, [allBills, utilData, histTypeFilter, histSearch]);

  // Handlers
  function handleSaveUtility(obj) {
    if (editUtil) updateUtility(obj.id, obj);
    else addUtility(obj);
    setAddOpen(false);
    setEditUtil(null);
  }
  function handleDeleteUtility(id) {
    deleteUtility(id); // lib deleteUtility also prunes all of this utility's bills
    if (expandedId === id) setExpandedId(null);
    setConfirmDeleteUtilId(null);
  }
  function handleSaveBill(obj) {
    if (editBill) { updateBill(obj.id, obj); setEditBill(null); }
    else addBill(obj);
    setBillUtil(null);
    setBillFromHistory(false);
  }
  function handleDeleteBill(id) {
    deleteBill(id);
    setConfirmDeleteBillId(null);
  }
  function openEditBill(bill) {
    const util = utilData?.utilities?.[bill.utilityId] ?? null;
    setEditBill({ bill, utility: util });
  }

  const searchInputStyle = { background: "var(--fm-bg-sunk)", border: "var(--fm-border-2)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.8rem", outline: "none", padding: "0.35rem 0.7rem", width: 200 };

  return (
    <div style={{ height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column", background: "var(--fm-bg)", fontFamily: "var(--fm-sans)", color: "var(--fm-ink)" }}>

      <FmHeader active="Utilities" tagline="Utilities" />

      <FmSubnav
        tabs={["Utilities", "History"]}
        active={activeTab}
        onTabChange={setActiveTab}
        stats={activeTab === "Utilities"
          ? [
              { value: activeUtilities.length, label: "active" },
              { value: "$" + Math.round(estMonthlyTotal), label: "/mo est", color: "var(--fm-cyan)" },
            ]
          : [{ value: filteredBills.length, label: "bills logged" }]
        }
      />

      {/* ── Utilities tab ── */}
      {activeTab === "Utilities" && (
        <div style={{ flex: 1, overflow: "auto", padding: "var(--fm-spacing-5xl)" }}>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.6rem", alignItems: "center" }}>
            <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", marginRight: "0.25rem", width: 44, flexShrink: 0 }}>Status</span>
            <FilterDropdown
              value={statusFilter}
              onChange={setStatusFilter}
              options={[{ value: "ACTIVE", label: "Active" }, { value: "ALL", label: "All" }]}
            />
            <div style={{ flex: 1 }} />
            <button style={btnPrimary} onClick={() => setAddOpen(true)}>+ Add Utility</button>
          </div>

          {presentTypes.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.6rem", alignItems: "center" }}>
              <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", marginRight: "0.25rem", width: 44, flexShrink: 0 }}>Type</span>
              <FilterDropdown
                value={typeFilter}
                onChange={setTypeFilter}
                options={[{ value: "ALL", label: "All" }, ...presentTypes.map(t => ({ value: t, label: t }))]}
              />
            </div>
          )}

          <div style={{ marginBottom: "1rem" }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search utilities or providers…"
              style={{ ...searchInputStyle, width: 260 }}
              onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
              onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"}
            />
          </div>

          {filtered.length === 0 ? (
            <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.82rem" }}>
              {allUtilities.length === 0
                ? "No utilities yet. Click \"+ Add Utility\" to add your first account."
                : "No utilities match the current filter."}
            </p>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ ...thCell, width: 24 }} />
                  <th style={thCell}>Name</th>
                  <th style={thCell}>Type</th>
                  <th style={thCell}>Provider</th>
                  <th style={thCell}>Latest Bill</th>
                  <th style={thCell}>Est. /mo</th>
                  <th style={thCell}>Due</th>
                  <th style={thCell}>Status</th>
                  <th style={{ ...thCell, width: 80 }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map(util => {
                  const isExpanded = expandedId === util.id;
                  const uBills = billsFor(util.id).sort((a, b) => (b.periodMonth || "").localeCompare(a.periodMonth || ""));
                  const latest = latestBill(util.id);
                  const est = estimatedMonthly(util, uBills);
                  return (
                    <>
                      <tr
                        key={util.id}
                        style={{ cursor: "pointer", opacity: util.active ? 1 : 0.5 }}
                        onClick={() => setExpandedId(isExpanded ? null : util.id)}
                      >
                        <td style={{ ...tdCell, color: "var(--fm-ink-mute)", fontSize: "0.7rem" }}>{isExpanded ? "▾" : "▸"}</td>
                        <td style={{ ...tdCell, color: "var(--fm-ink)", fontFamily: "var(--fm-sans)" }}>{util.name}</td>
                        <td style={tdCell}>{displayType(util)}</td>
                        <td style={tdCell}>{util.providerName || "—"}</td>
                        <td style={tdCell}>{latest ? fmtCost(latest.amount) : "—"}</td>
                        <td style={{ ...tdCell, color: "var(--fm-cyan)" }}>{est ? fmtCost(est) : "—"}</td>
                        <td style={tdCell}>{util.dueDayOfMonth ? `Day ${util.dueDayOfMonth}` : "—"}</td>
                        <td style={tdCell}>
                          <span style={{
                            background: util.active ? "rgba(127,176,135,0.12)" : "var(--fm-bg-sunk)",
                            border: `1px solid ${util.active ? "var(--fm-green)" : "var(--fm-hairline2)"}`,
                            borderRadius: "var(--fm-radius)",
                            color: util.active ? "var(--fm-green)" : "var(--fm-ink-mute)",
                            fontFamily: "var(--fm-mono)",
                            fontSize: "0.6rem",
                            letterSpacing: "0.08em",
                            padding: "0.1rem 0.35rem",
                            textTransform: "uppercase",
                          }}>
                            {util.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td style={{ ...tdCell, whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
                          {confirmDeleteUtilId === util.id ? (
                            <>
                              <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", marginRight: "0.4rem" }}>Delete + bills?</span>
                              <button style={{ ...btnDanger, fontSize: "0.62rem", padding: "0.2rem 0.5rem", marginRight: "0.35rem" }} onClick={() => handleDeleteUtility(util.id)}>Yes</button>
                              <button style={{ ...btnGhost, fontSize: "0.62rem", padding: "0.2rem 0.5rem" }} onClick={() => setConfirmDeleteUtilId(null)}>No</button>
                            </>
                          ) : (
                            <>
                              <button style={{ ...btnGhost, fontSize: "0.62rem", padding: "0.2rem 0.5rem", marginRight: "0.35rem" }} onClick={() => setEditUtil(util)}>Edit</button>
                              <button style={{ ...btnDanger, fontSize: "0.62rem", padding: "0.2rem 0.5rem" }} onClick={() => setConfirmDeleteUtilId(util.id)} title="Delete utility and all its bills">✕</button>
                            </>
                          )}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr key={util.id + "-exp"}>
                          <td colSpan={9} style={{ background: "var(--fm-bg-sunk)", borderBottom: "1px solid var(--fm-hairline)", padding: "0.75rem 0.75rem 0.75rem 2.5rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.6rem" }}>
                              <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                                Bills ({uBills.length})
                              </span>
                              <button style={{ ...btnPrimary, fontSize: "0.62rem", padding: "0.2rem 0.55rem" }} onClick={e => { e.stopPropagation(); setBillUtil(util); }}>+ Log Bill</button>
                            </div>

                            {uBills.length === 0 ? (
                              <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", margin: 0 }}>No bills logged yet.</p>
                            ) : (
                              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                                <thead>
                                  <tr>
                                    {["Period", "Amount", "Usage", "Due", "Paid", ""].map(h => (
                                      <th key={h} style={{ ...thCell, fontSize: "0.54rem" }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {uBills.map(b => (
                                    <tr key={b.id}>
                                      <td style={{ ...tdCell, fontSize: "0.68rem", whiteSpace: "nowrap", color: "var(--fm-brass-dim)" }}>{fmtMonth(b.periodMonth)}</td>
                                      <td style={{ ...tdCell, fontSize: "0.68rem", whiteSpace: "nowrap", color: "var(--fm-ink)" }}>{fmtCost(b.amount)}</td>
                                      <td style={{ ...tdCell, fontSize: "0.68rem", whiteSpace: "nowrap" }}>{fmtUsage(b.usage, util.unitLabel)}</td>
                                      <td style={{ ...tdCell, fontSize: "0.68rem", whiteSpace: "nowrap" }}>{b.dueDate ? fmtDate(b.dueDate) : "—"}</td>
                                      <td style={{ ...tdCell, fontSize: "0.68rem" }}>{b.paid ? <span style={{ color: "var(--fm-green)" }}>✓</span> : "—"}</td>
                                      <td style={{ ...tdCell, whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
                                        {confirmDeleteBillId === b.id ? (
                                          <>
                                            <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", marginRight: "0.35rem" }}>Delete?</span>
                                            <button style={{ ...btnDanger, fontSize: "0.58rem", padding: "0.15rem 0.4rem", marginRight: "0.3rem" }} onClick={() => handleDeleteBill(b.id)}>Yes</button>
                                            <button style={{ ...btnGhost, fontSize: "0.58rem", padding: "0.15rem 0.4rem" }} onClick={() => setConfirmDeleteBillId(null)}>No</button>
                                          </>
                                        ) : (
                                          <>
                                            <button style={{ ...btnGhost, fontSize: "0.58rem", padding: "0.15rem 0.4rem", marginRight: "0.3rem" }} onClick={() => openEditBill(b)}>Edit</button>
                                            <button style={{ ...btnDanger, fontSize: "0.58rem", padding: "0.15rem 0.4rem" }} onClick={() => setConfirmDeleteBillId(b.id)} title="Delete this bill">✕</button>
                                          </>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── History tab ── */}
      {activeTab === "History" && (
        <div style={{ flex: 1, overflow: "auto", padding: "var(--fm-spacing-5xl)" }}>

          <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
            <FilterDropdown
              value={histTypeFilter}
              onChange={setHistTypeFilter}
              options={[{ value: "ALL", label: "All" }, ...presentTypes.map(t => ({ value: t, label: t }))]}
            />
            <div style={{ flex: 1 }} />
            <button style={btnPrimary} onClick={() => { setBillUtil(null); setBillFromHistory(true); }}>+ Log Bill</button>
            <input
              value={histSearch}
              onChange={e => setHistSearch(e.target.value)}
              placeholder="Search…"
              style={searchInputStyle}
              onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
              onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"}
            />
          </div>

          {allBills.length === 0 ? (
            <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.82rem" }}>
              No bills logged yet. Use &quot;Log Bill&quot; on any utility to record a monthly bill.
            </p>
          ) : filteredBills.length === 0 ? (
            <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.82rem" }}>No results match your filter.</p>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  {["Period", "Utility", "Type", "Amount", "Usage", "Paid"].map(h => (
                    <th key={h} style={thCell}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredBills.map(b => {
                  const util = utilData?.utilities?.[b.utilityId] ?? {};
                  return (
                    <tr key={b.id} style={{ borderBottom: "1px solid var(--fm-hairline)" }}>
                      <td style={{ ...tdCell, color: "var(--fm-brass-dim)", whiteSpace: "nowrap" }}>{fmtMonth(b.periodMonth)}</td>
                      <td style={{ ...tdCell, color: "var(--fm-ink)", fontFamily: "var(--fm-sans)" }}>{util.name || "—"}</td>
                      <td style={tdCell}>{util.id ? displayType(util) : "—"}</td>
                      <td style={{ ...tdCell, color: "var(--fm-ink)", whiteSpace: "nowrap" }}>{fmtCost(b.amount)}</td>
                      <td style={{ ...tdCell, whiteSpace: "nowrap" }}>{fmtUsage(b.usage, util.unitLabel)}</td>
                      <td style={tdCell}>{b.paid ? <span style={{ color: "var(--fm-green)" }}>✓</span> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      {(addOpen || editUtil) && (
        <UtilityModal
          initial={editUtil ?? {}}
          isEdit={!!editUtil}
          onSave={handleSaveUtility}
          onClose={() => { setAddOpen(false); setEditUtil(null); }}
        />
      )}

      {(billUtil !== null || billFromHistory) && !editBill && (
        <BillModal
          utility={billUtil}
          initial={null}
          isEdit={false}
          onSave={handleSaveBill}
          onClose={() => { setBillUtil(null); setBillFromHistory(false); }}
        />
      )}

      {editBill && (
        <BillModal
          utility={editBill.utility}
          initial={editBill.bill}
          isEdit={true}
          onSave={handleSaveBill}
          onClose={() => setEditBill(null)}
        />
      )}
    </div>
  );
}
