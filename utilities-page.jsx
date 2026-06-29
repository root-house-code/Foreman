import { useState, useMemo, useEffect } from "react";
import { useForemanStore } from "./lib/store.js";
import { FIXED_UTILITY_TYPES, DEFAULT_UNIT, estimatedMonthly, monthlyUtilitiesTotal, UTILITY_BILLING_CYCLES, utilityCycleLabel } from "./lib/utilities.js";
import FmHeader from "./src/components/FmHeader.jsx";
import FmSubnav from "./src/components/FmSubnav.jsx";
import { FilterDropdown } from "./components/FilterPill.jsx";
import InlineEditCell from "./components/InlineEditCell.jsx";

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
  billingCycle: "monthly",
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

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Payment Cycle</label>
            <select style={fieldSelect} value={form.billingCycle} onChange={e => set("billingCycle", e.target.value)}>
              {UTILITY_BILLING_CYCLES.map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
            </select>
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

// ── Cost-over-time chart ──────────────────────────────────────────────────────

const CHART_PALETTE = [
  "var(--fm-cyan)", "var(--fm-brass)", "var(--fm-green)", "var(--fm-amber)",
  "var(--fm-purple)", "var(--fm-red)", "var(--fm-brass-dim)", "var(--fm-ink-dim)",
];
const MONTH_ABBR = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function BarTip({ title, rows, total }) {
  return (
    <div style={{ background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline2)", borderRadius: 3, bottom: "100%", boxShadow: "0 6px 18px #00000055", left: "50%", marginBottom: 6, minWidth: 110, padding: "0.4rem 0.55rem", position: "absolute", transform: "translateX(-50%)", whiteSpace: "nowrap", zIndex: 10 }}>
      <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", marginBottom: rows.length ? "0.3rem" : 0 }}>{title}</div>
      {rows.map(([label, v, color]) => (
        <div key={label} style={{ display: "flex", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", gap: "0.6rem", justifyContent: "space-between" }}>
          <span style={{ color }}>{label}</span><span style={{ color: "var(--fm-ink-dim)" }}>{fmtCost(v)}</span>
        </div>
      ))}
      {rows.length > 1 && (
        <div style={{ borderTop: "1px solid var(--fm-hairline2)", display: "flex", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", fontWeight: 500, gap: "0.6rem", justifyContent: "space-between", marginTop: "0.3rem", paddingTop: "0.3rem" }}>
          <span style={{ color: "var(--fm-ink-mute)" }}>Total</span><span style={{ color: "var(--fm-ink)" }}>{fmtCost(total)}</span>
        </div>
      )}
      {rows.length === 0 && <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem" }}>{fmtCost(total)}</div>}
    </div>
  );
}

const segBtn = (on) => ({
  background: on ? "var(--fm-brass-bg)" : "transparent",
  border: `1px solid ${on ? "var(--fm-brass)" : "var(--fm-hairline2)"}`,
  borderRadius: 3,
  color: on ? "var(--fm-brass)" : "var(--fm-ink-mute)",
  cursor: "pointer",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.58rem",
  letterSpacing: "0.06em",
  padding: "0.25rem 0.6rem",
  textTransform: "uppercase",
});

// ── Pie (Totals) helpers ──────────────────────────────────────────────────────

const SEASON_ORDER = ["Winter", "Spring", "Summer", "Fall"];
const SEASON_COLOR = { Winter: "var(--fm-cyan)", Spring: "var(--fm-green)", Summer: "var(--fm-amber)", Fall: "var(--fm-brass)" };
function seasonOf(month) {
  if (month === 12 || month <= 2) return "Winter";
  if (month <= 5) return "Spring";
  if (month <= 8) return "Summer";
  return "Fall";
}

const miniTitle = { color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.12em", marginBottom: "0.75rem", textTransform: "uppercase" };

// SVG path for a pie wedge from angle a0→a1 (radians) about (cx,cy).
function arcPath(cx, cy, r, a0, a1) {
  const pt = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
}

// Sum `amount` over rows, bucketed by keyFn.
function sumBy(rows, keyFn) {
  const m = {};
  rows.forEach(r => { const k = keyFn(r); if (k == null) return; m[k] = (m[k] || 0) + r.amount; });
  return m;
}

// Turn a {label: total} map into colored slices, sorted by value (or a fixed order),
// grouping the long tail past `cap` into an "Other" wedge.
function toSlices(map, colorFor, { cap = 6, order } = {}) {
  let entries = Object.entries(map).filter(([, v]) => v > 0);
  if (order) entries.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  else entries.sort((a, b) => b[1] - a[1]);
  let slices = entries.map(([label, value]) => ({ label, value, color: colorFor(label) }));
  if (!order && slices.length > cap) {
    const head = slices.slice(0, cap);
    const rest = slices.slice(cap).reduce((s, x) => s + x.value, 0);
    if (rest > 0) head.push({ label: "Other", value: rest, color: "var(--fm-ink-dim)" });
    slices = head;
  }
  return slices;
}

function MiniPie({ title, slices }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) {
    return (
      <div>
        <div style={miniTitle}>{title}</div>
        <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", padding: "1.5rem 0", textAlign: "center" }}>no data</div>
      </div>
    );
  }
  let ang = -Math.PI / 2;
  const arcs = slices.map(s => { const start = ang; ang += (s.value / total) * 2 * Math.PI; return { ...s, start, end: ang }; });
  return (
    <div>
      <div style={miniTitle}>{title}</div>
      <div style={{ alignItems: "center", display: "flex", gap: "1.1rem" }}>
        <svg viewBox="0 0 100 100" width={130} height={130} style={{ flexShrink: 0 }}>
          {arcs.length === 1
            ? <circle cx="50" cy="50" r="46" fill={arcs[0].color} />
            : arcs.map((a, i) => <path key={i} d={arcPath(50, 50, 46, a.start, a.end)} fill={a.color} stroke="var(--fm-bg-panel)" strokeWidth="1" />)}
        </svg>
        <div style={{ display: "flex", flex: 1, flexDirection: "column", gap: "0.35rem", minWidth: 0 }}>
          {slices.map(s => (
            <div key={s.label} style={{ alignItems: "baseline", display: "flex", fontFamily: "var(--fm-mono)", fontSize: "0.7rem", gap: "0.45rem" }}>
              <span style={{ alignSelf: "center", background: s.color, borderRadius: 2, flexShrink: 0, height: 11, width: 11 }} />
              <span style={{ color: "var(--fm-ink-dim)", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: 88 }}>{s.label}</span>
              <span style={{ color: "var(--fm-ink)", flexShrink: 0, textAlign: "left", width: 56 }}>${Math.round(s.value).toLocaleString("en-US")}</span>
              <span style={{ color: "var(--fm-ink-mute)", flexShrink: 0, textAlign: "left", width: 34 }}>{Math.round((s.value / total) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Bar chart of logged utility bills over time. Timeline = one stacked bar per calendar
// month (segmented by type) in chronological order; Year-over-year = a Jan–Dec axis with
// one bar per year per month, so the same month across years sits together (seasonality);
// Totals = a grid of composition pies (by type, season, account, year).
function UtilityHistoryChart({ bills, utilitiesById }) {
  const [mode, setMode] = useState("timeline"); // "timeline" | "year" | "totals"
  const [hover, setHover] = useState(null);

  const rows = useMemo(() => bills
    .filter(b => b.periodMonth && b.amount != null)
    .map(b => {
      const [y, m] = b.periodMonth.split("-").map(Number);
      const u = utilitiesById[b.utilityId] || {};
      const type = u.type === "Other" ? (u.customType || "Other") : (u.type || "Other");
      return { ym: b.periodMonth, year: y, month: m, amount: Number(b.amount) || 0, type, name: u.name || "—" };
    }), [bills, utilitiesById]);

  const types = useMemo(() => [...new Set(rows.map(r => r.type))].sort(), [rows]);
  const typeColor = useMemo(() => Object.fromEntries(types.map((t, i) => [t, CHART_PALETTE[i % CHART_PALETTE.length]])), [types]);
  const years = useMemo(() => [...new Set(rows.map(r => r.year))].sort(), [rows]);
  const yearColor = useMemo(() => Object.fromEntries(years.map((y, i) => [y, CHART_PALETTE[i % CHART_PALETTE.length]])), [years]);

  // Continuous months from first to last logged (gaps included, so missed bills show).
  const timeline = useMemo(() => {
    if (rows.length === 0) return [];
    const sorted = [...rows].sort((a, b) => a.ym.localeCompare(b.ym));
    const f = sorted[0], l = sorted[sorted.length - 1];
    const out = [];
    let yy = f.year, mm = f.month;
    while (yy < l.year || (yy === l.year && mm <= l.month)) {
      out.push({ key: `${yy}-${String(mm).padStart(2, "0")}`, year: yy, month: mm, byType: {}, total: 0 });
      mm++; if (mm > 12) { mm = 1; yy++; }
    }
    const byKey = Object.fromEntries(out.map(b => [b.key, b]));
    rows.forEach(r => {
      const b = byKey[r.ym]; if (!b) return;
      b.byType[r.type] = (b.byType[r.type] || 0) + r.amount;
      b.total += r.amount;
    });
    return out;
  }, [rows]);

  // month(1-12) × year totals for the year-over-year view.
  const yoy = useMemo(() => {
    const cells = {};
    rows.forEach(r => { const k = `${r.month}:${r.year}`; cells[k] = (cells[k] || 0) + r.amount; });
    return cells;
  }, [rows]);

  if (rows.length === 0) return null;

  const BODY_H = 240; // shared content height so all three modes make an equal-height panel
  const tlMax = Math.max(1, ...timeline.map(b => b.total));
  const yoyMax = Math.max(1, ...Object.values(yoy));
  const legend = mode === "timeline" ? types.map(t => [t, typeColor[t]]) : years.map(y => [String(y), yearColor[y]]);
  const Legend = () => (legend.length > 0 ? (
    <div style={{ display: "flex", flexShrink: 0, flexWrap: "wrap", gap: "0.75rem", marginTop: "0.6rem" }}>
      {legend.map(([label, color]) => (
        <span key={label} style={{ alignItems: "center", color: "var(--fm-ink-mute)", display: "inline-flex", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", gap: "0.3rem" }}>
          <span style={{ background: color, borderRadius: 1, display: "inline-block", height: 8, width: 8 }} />{label}
        </span>
      ))}
    </div>
  ) : null);

  return (
    <div style={{ background: "var(--fm-bg-panel)", border: "var(--fm-border)", borderRadius: "var(--fm-radius-lg)", marginBottom: "1.25rem", padding: "1.1rem 1.35rem" }}>
      <div style={{ alignItems: "center", display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
        <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.16em", textTransform: "uppercase" }}>Cost Over Time</span>
        <div style={{ display: "flex", gap: "0.35rem", marginLeft: "auto" }}>
          {[["timeline", "Timeline"], ["year", "Year over year"], ["totals", "Totals"]].map(([m, lbl]) => (
            <button key={m} onClick={() => { setMode(m); setHover(null); }} style={segBtn(mode === m)}>{lbl}</button>
          ))}
        </div>
      </div>

      <div style={{ height: BODY_H }}>
        {mode === "timeline" && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ alignItems: "flex-end", display: "flex", flex: 1, gap: 2, minHeight: 0 }}>
              {timeline.map(b => {
                const active = hover === b.key;
                return (
                  <div key={b.key}
                    onMouseEnter={() => setHover(b.key)} onMouseLeave={() => setHover(h => (h === b.key ? null : h))}
                    style={{ alignItems: "center", display: "flex", flex: 1, flexDirection: "column", height: "100%", justifyContent: "flex-end", position: "relative" }}>
                    {active && b.total > 0 && <BarTip title={fmtMonth(b.key)} rows={types.map(t => [t, b.byType[t] || 0, typeColor[t]]).filter(r => r[1] > 0)} total={b.total} />}
                    <div style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline)", borderRadius: "2px 2px 0 0", display: "flex", flexDirection: "column-reverse", height: `${(b.total / tlMax) * 100}%`, minHeight: b.total > 0 ? 2 : 0, overflow: "hidden", width: "100%" }}>
                      {types.map(t => { const v = b.byType[t] || 0; if (v <= 0) return null; return <div key={t} style={{ background: typeColor[t], height: `${(v / b.total) * 100}%`, opacity: active ? 1 : 0.85, width: "100%" }} />; })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", flexShrink: 0, gap: 2, marginTop: "0.4rem" }}>
              {timeline.map((b, i) => (
                <div key={b.key} style={{ color: "var(--fm-ink-mute)", flex: 1, fontFamily: "var(--fm-mono)", fontSize: "0.5rem", textAlign: "center" }}>
                  {b.month === 1 || i === 0 ? `'${String(b.year).slice(2)}` : ""}
                </div>
              ))}
            </div>
            <Legend />
          </div>
        )}

        {mode === "year" && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ alignItems: "flex-end", display: "flex", flex: 1, gap: "0.5rem", minHeight: 0 }}>
              {MONTH_ABBR.slice(1).map((lbl, idx) => {
                const month = idx + 1;
                return (
                  <div key={month} style={{ alignItems: "flex-end", display: "flex", flex: 1, gap: 1, height: "100%", justifyContent: "center" }}>
                    {years.map(y => {
                      const v = yoy[`${month}:${y}`] || 0;
                      const key = `${month}:${y}`;
                      const active = hover === key;
                      return (
                        <div key={y}
                          onMouseEnter={() => setHover(key)} onMouseLeave={() => setHover(h => (h === key ? null : h))}
                          style={{ alignItems: "flex-end", display: "flex", flex: 1, height: "100%", position: "relative" }}>
                          {active && v > 0 && <BarTip title={`${lbl} ${y}`} rows={[]} total={v} />}
                          <div style={{ background: v > 0 ? yearColor[y] : "transparent", border: v > 0 ? "none" : "1px dashed var(--fm-hairline)", borderRadius: "2px 2px 0 0", height: v > 0 ? `${(v / yoyMax) * 100}%` : 0, minHeight: v > 0 ? 2 : 0, opacity: active ? 1 : 0.85, width: "100%" }} />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", flexShrink: 0, gap: "0.5rem", marginTop: "0.4rem" }}>
              {MONTH_ABBR.slice(1).map(lbl => (
                <div key={lbl} style={{ color: "var(--fm-ink-mute)", flex: 1, fontFamily: "var(--fm-mono)", fontSize: "0.5rem", textAlign: "center" }}>{lbl}</div>
              ))}
            </div>
            <Legend />
          </div>
        )}

        {mode === "totals" && (
          <div style={{ alignItems: "center", display: "grid", gap: "1.75rem", gridTemplateColumns: "repeat(3, 1fr)", height: "100%" }}>
            <MiniPie title="By Type" slices={toSlices(sumBy(rows, r => r.type), t => typeColor[t] || "var(--fm-ink-dim)")} />
            <MiniPie title="By Season" slices={toSlices(sumBy(rows, r => seasonOf(r.month)), s => SEASON_COLOR[s], { order: SEASON_ORDER })} />
            <MiniPie title="By Year" slices={toSlices(sumBy(rows, r => String(r.year)), y => yearColor[y] || "var(--fm-ink-dim)", { cap: 8 })} />
          </div>
        )}
      </div>
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

  // Chart respects the type filter but not the text search (search narrows the table only).
  const chartBills = useMemo(() => {
    if (histTypeFilter === "ALL") return allBills;
    return allBills.filter(b => {
      const util = utilData?.utilities?.[b.utilityId] ?? {};
      const t = util.type === "Other" ? (util.customType || "Other") : util.type;
      return t === histTypeFilter;
    });
  }, [allBills, utilData, histTypeFilter]);

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
  // Inline history edit (double-click a cell). Numbers coerce; blanks clear.
  function editBillField(id, field, raw) {
    let v = raw;
    if (field === "amount" || field === "usage") {
      v = raw === "" ? null : Number(raw);
      if (v != null && Number.isNaN(v)) return;
    }
    updateBill(id, { [field]: v });
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
                  <th style={thCell}>Cycle</th>
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
                        <td style={tdCell}>{utilityCycleLabel(util.billingCycle)}</td>
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
                          <td colSpan={10} style={{ background: "var(--fm-bg-sunk)", borderBottom: "1px solid var(--fm-hairline)", padding: "0.75rem 0.75rem 0.75rem 2.5rem" }}>
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

          {allBills.length > 0 && (
            <UtilityHistoryChart bills={chartBills} utilitiesById={utilData?.utilities ?? {}} />
          )}

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
                      <InlineEditCell
                        type="month"
                        value={b.periodMonth}
                        display={fmtMonth(b.periodMonth)}
                        onCommit={raw => editBillField(b.id, "periodMonth", raw)}
                        style={{ ...tdCell, color: "var(--fm-brass-dim)", whiteSpace: "nowrap" }}
                      />
                      <td style={{ ...tdCell, color: "var(--fm-ink)", fontFamily: "var(--fm-sans)" }}>{util.name || "—"}</td>
                      <td style={tdCell}>{util.id ? displayType(util) : "—"}</td>
                      <InlineEditCell
                        type="number"
                        step="0.01"
                        value={b.amount}
                        display={fmtCost(b.amount)}
                        onCommit={raw => editBillField(b.id, "amount", raw)}
                        style={{ ...tdCell, color: "var(--fm-ink)", whiteSpace: "nowrap" }}
                      />
                      <InlineEditCell
                        type="number"
                        step="any"
                        value={b.usage}
                        display={fmtUsage(b.usage, util.unitLabel)}
                        onCommit={raw => editBillField(b.id, "usage", raw)}
                        style={{ ...tdCell, whiteSpace: "nowrap" }}
                      />
                      <InlineEditCell
                        type="boolean"
                        value={!!b.paid}
                        display={b.paid ? <span style={{ color: "var(--fm-green)" }}>✓</span> : "—"}
                        onCommit={next => editBillField(b.id, "paid", next)}
                        style={tdCell}
                      />
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
