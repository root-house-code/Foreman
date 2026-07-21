import { useState } from "react";
import { useForemanStore } from "../lib/store.js";
import { FIXED_UTILITY_TYPES, UTILITY_BILLING_CYCLES, DEFAULT_UNIT } from "../lib/utilities.js";

const CONFIDENCE_COLORS = {
  high:   "var(--fm-brass)",
  medium: "#c9a96e",
  low:    "var(--fm-ink-dim)",
};

function fmtAmount(a) {
  if (a == null || a === "") return "—";
  return "$" + Number(a).toFixed(2);
}

function fmtPeriod(pm) {
  if (!pm) return "—";
  const [y, m] = pm.split("-").map(Number);
  if (!y || !m) return pm;
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function displayUtilityType(u) {
  return u.type === "Other" ? (u.customType || "Other") : (u.type || "Unknown");
}

const fieldLabel = {
  color: "var(--fm-ink-mute)", display: "block", fontFamily: "var(--fm-mono)",
  fontSize: "0.55rem", letterSpacing: "0.1em", marginBottom: "0.2rem", textTransform: "uppercase",
};
const fieldInput = {
  background: "var(--fm-bg-sunk)", border: "var(--fm-border-2)", borderRadius: "var(--fm-radius)",
  color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.78rem",
  outline: "none", padding: "0.35rem 0.5rem", width: "100%", boxSizing: "border-box",
};
const fieldSelect = { ...fieldInput, cursor: "pointer" };

// One candidate row. `resolution` is per-candidate edit state:
// { utilityId | "__new__", vendorName, accountNumber, amount, periodMonth, dueDate, billingCycle, utilityType, usage }
function BillRow({ candidate, selected, expanded, resolution, utilities, onToggle, onExpand, onChange }) {
  const dup = candidate.likelyDuplicate;
  const confColor = CONFIDENCE_COLORS[candidate.confidence] || "var(--fm-ink-dim)";
  const effectiveType = resolution.utilityId === "__new__"
    ? resolution.utilityType
    : displayUtilityType(utilities.find(u => u.id === resolution.utilityId) || {});
  const unitLabel = DEFAULT_UNIT[effectiveType];

  return (
    <div style={{
      borderBottom: "1px solid var(--fm-hairline)",
      opacity: selected ? 1 : 0.45,
      transition: "opacity 0.1s",
    }}>
      <div style={{ alignItems: "flex-start", display: "flex", gap: "0.7rem", padding: "0.65rem 1.25rem" }}>
        <div
          onClick={onToggle}
          style={{ alignItems: "center", border: `1px solid ${selected ? "var(--fm-brass)" : "var(--fm-ink-dim)"}`, borderRadius: "2px", cursor: "pointer", display: "flex", flexShrink: 0, height: 14, justifyContent: "center", marginTop: 3, width: 14 }}
        >
          {selected && <span style={{ color: "var(--fm-brass)", fontSize: "0.55rem", lineHeight: 1 }}>✓</span>}
        </div>

        <div onClick={onExpand} style={{ cursor: "pointer", flex: 1, minWidth: 0 }}>
          <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.2rem" }}>
            <span style={{ background: `${confColor}18`, border: `1px solid ${confColor}40`, borderRadius: "2px", color: confColor, fontFamily: "var(--fm-mono)", fontSize: "0.54rem", letterSpacing: "0.06em", padding: "0.1rem 0.35rem", textTransform: "uppercase" }}>
              {resolution.utilityType || candidate.utilityType}
            </span>
            <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.75rem" }}>
              {resolution.vendorName || candidate.vendorName || "Unknown provider"}
            </span>
            <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.75rem" }}>
              {fmtAmount(resolution.amount)}
            </span>
            <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem" }}>
              {fmtPeriod(resolution.periodMonth)}
            </span>
            {dup && (
              <span style={{ background: "#f8717118", border: "1px solid #f8717140", borderRadius: "2px", color: "var(--fm-red)", fontFamily: "var(--fm-mono)", fontSize: "0.52rem", letterSpacing: "0.06em", padding: "0.1rem 0.35rem", textTransform: "uppercase" }}>
                possible duplicate
              </span>
            )}
          </div>
          <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {candidate.subject || "(no subject)"}
          </div>
        </div>

        <a
          href={`https://mail.google.com/mail/u/0/#all/${candidate.messageId}`}
          onClick={e => {
            e.stopPropagation();
            if (window.foreman?.isElectron) { e.preventDefault(); window.open(`https://mail.google.com/mail/u/0/#all/${candidate.messageId}`, "_blank"); }
          }}
          target="_blank"
          rel="noreferrer"
          title="View source email in Gmail"
          style={{ alignSelf: "center", color: "var(--fm-ink-dim)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.58rem", textDecoration: "none" }}
        >
          view ↗
        </a>
      </div>

      {expanded && (
        <div style={{ display: "grid", gap: "0.6rem", gridTemplateColumns: "1fr 1fr", padding: "0 1.25rem 0.9rem 3rem" }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={fieldLabel}>Utility</label>
            <select
              style={fieldSelect}
              value={resolution.utilityId}
              onChange={e => onChange({ utilityId: e.target.value })}
            >
              <option value="__new__">+ Create new utility ({resolution.utilityType})</option>
              {utilities.map(u => (
                <option key={u.id} value={u.id}>{u.name} — {displayUtilityType(u)}</option>
              ))}
            </select>
          </div>

          {resolution.utilityId === "__new__" && (
            <>
              <div>
                <label style={fieldLabel}>New utility name</label>
                <input style={fieldInput} value={resolution.vendorName || ""} onChange={e => onChange({ vendorName: e.target.value })} placeholder="Provider name" />
              </div>
              <div>
                <label style={fieldLabel}>Type</label>
                <select style={fieldSelect} value={resolution.utilityType} onChange={e => onChange({ utilityType: e.target.value })}>
                  {FIXED_UTILITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={fieldLabel}>Billing cycle</label>
                <select style={fieldSelect} value={resolution.billingCycle || "monthly"} onChange={e => onChange({ billingCycle: e.target.value })}>
                  {UTILITY_BILLING_CYCLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </>
          )}

          <div>
            <label style={fieldLabel}>Amount</label>
            <input style={fieldInput} type="number" min="0" step="0.01" value={resolution.amount ?? ""} onChange={e => onChange({ amount: e.target.value === "" ? null : Number(e.target.value) })} />
          </div>
          <div>
            <label style={fieldLabel}>Period (month)</label>
            <input style={fieldInput} type="month" value={resolution.periodMonth || ""} onChange={e => onChange({ periodMonth: e.target.value })} />
          </div>
          <div>
            <label style={fieldLabel}>Due date</label>
            <input style={fieldInput} type="date" value={resolution.dueDate || ""} onChange={e => onChange({ dueDate: e.target.value })} />
          </div>
          <div>
            <label style={fieldLabel}>Account #</label>
            <input style={fieldInput} value={resolution.accountNumber || ""} onChange={e => onChange({ accountNumber: e.target.value })} />
          </div>
          {unitLabel && (
            <div>
              <label style={fieldLabel}>Usage ({unitLabel})</label>
              <input style={fieldInput} type="number" min="0" step="any" value={resolution.usage ?? ""} onChange={e => onChange({ usage: e.target.value === "" ? null : Number(e.target.value) })} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function GmailBillReview({ candidates, onDone, onCancel }) {
  const utilData = useForemanStore(s => s.utilities);
  const addUtility = useForemanStore(s => s.addUtility);
  const addBill = useForemanStore(s => s.addBill);
  const utilities = Object.values(utilData?.utilities ?? {});

  // Default resolution per candidate: prefer an existing utility of the same type,
  // else create-new. Duplicates start deselected.
  const [rows] = useState(() => candidates.map(c => {
    const match = utilities.find(u => displayUtilityType(u).toLowerCase() === String(c.utilityType || "").toLowerCase());
    return {
      candidate: c,
      resolution: {
        utilityId: match ? match.id : "__new__",
        utilityType: c.utilityType || "Other",
        vendorName: c.vendorName || "",
        accountNumber: c.accountNumber || "",
        amount: c.amount,
        periodMonth: c.periodMonth || "",
        dueDate: c.dueDate || "",
        billingCycle: c.billingCycle || "monthly",
        usage: c.usage,
      },
    };
  }));

  const [resolutions, setResolutions] = useState(() => rows.map(r => r.resolution));
  const [selected, setSelected] = useState(() => new Set(candidates.map((c, i) => (c.likelyDuplicate ? null : i)).filter(i => i !== null)));
  const [expanded, setExpanded] = useState(null);

  function toggle(i) {
    setSelected(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }
  function toggleAll() {
    setSelected(prev => prev.size === candidates.length ? new Set() : new Set(candidates.map((_, i) => i)));
  }
  function changeResolution(i, patch) {
    setResolutions(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }

  function handleImport() {
    let importedCount = 0;
    for (let i = 0; i < candidates.length; i++) {
      if (!selected.has(i)) continue;
      const r = resolutions[i];
      let utilityId = r.utilityId;

      if (utilityId === "__new__") {
        const isFixedType = FIXED_UTILITY_TYPES.includes(r.utilityType);
        utilityId = "util-" + Date.now() + "-" + i;
        addUtility({
          id: utilityId,
          name: r.vendorName || r.utilityType,
          type: isFixedType ? r.utilityType : "Other",
          customType: isFixedType ? "" : r.utilityType,
          providerName: r.vendorName || "",
          accountNumber: r.accountNumber || "",
          unitLabel: DEFAULT_UNIT[r.utilityType] ?? "",
          typicalAmount: r.amount != null ? Number(r.amount) : null,
          billingCycle: r.billingCycle || "monthly",
          dueDayOfMonth: null,
          autopay: false,
          notes: "Added from Gmail bill import",
          active: true,
        });
      }

      addBill({
        id: "bill-" + Date.now() + "-" + i,
        utilityId,
        periodMonth: r.periodMonth || new Date().toISOString().slice(0, 7),
        amount: r.amount != null ? Number(r.amount) : null,
        usage: r.usage != null ? Number(r.usage) : null,
        dueDate: r.dueDate || "",
        paid: false,
        notes: "Imported from Gmail — " + (candidates[i].subject || ""),
      });
      importedCount++;
    }
    onDone(importedCount);
  }

  const selectedCount = selected.size;

  return (
    <div
      style={{ alignItems: "center", background: "rgba(0,0,0,0.75)", bottom: 0, display: "flex", justifyContent: "center", left: 0, position: "fixed", right: 0, top: 0, zIndex: 1000 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{ background: "var(--fm-bg-panel)", border: "1px solid var(--fm-ink-dim)", borderRadius: "8px", display: "flex", flexDirection: "column", maxHeight: "85vh", maxWidth: 640, overflow: "hidden", width: "92%" }}>

        <div style={{ borderBottom: "1px solid var(--fm-hairline)", flexShrink: 0, padding: "1.25rem 1.5rem 1rem" }}>
          <div style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.15em", marginBottom: "0.35rem", textTransform: "uppercase" }}>
            Gmail Bill Review
          </div>
          <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "1.05rem", marginBottom: "0.5rem" }}>
            Select bills to add to Foreman
          </div>
          <div style={{ alignItems: "center", display: "flex", gap: "0.6rem", justifyContent: "space-between" }}>
            <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem" }}>
              Found {candidates.length} {candidates.length === 1 ? "candidate" : "candidates"} · {selectedCount} selected
            </span>
            <button onClick={toggleAll} style={{ background: "none", border: "none", color: selectedCount === candidates.length ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.06em", padding: 0 }}>
              {selectedCount === candidates.length ? "deselect all" : "select all"}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {candidates.map((c, i) => (
            <BillRow
              key={c.messageId}
              candidate={c}
              selected={selected.has(i)}
              expanded={expanded === i}
              resolution={resolutions[i]}
              utilities={utilities}
              onToggle={() => toggle(i)}
              onExpand={() => setExpanded(expanded === i ? null : i)}
              onChange={patch => changeResolution(i, patch)}
            />
          ))}
          {candidates.length === 0 && (
            <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", padding: "2.5rem 1.5rem", textAlign: "center" }}>
              No bill candidates found.
            </div>
          )}
        </div>

        <div style={{ alignItems: "center", borderTop: "1px solid var(--fm-hairline)", display: "flex", flexShrink: 0, gap: "0.75rem", justifyContent: "flex-end", padding: "1rem 1.25rem" }}>
          <button
            onClick={onCancel}
            style={{ background: "transparent", border: "1px solid var(--fm-ink-dim)", borderRadius: "3px", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.45rem 1rem" }}
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={selectedCount === 0}
            style={{ background: selectedCount > 0 ? "var(--fm-brass-bg)" : "transparent", border: `1px solid ${selectedCount > 0 ? "var(--fm-brass)" : "var(--fm-ink-dim)"}`, borderRadius: "3px", color: selectedCount > 0 ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: selectedCount > 0 ? "pointer" : "default", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.45rem 1.25rem" }}
          >
            Import Selected ({selectedCount})
          </button>
        </div>
      </div>
    </div>
  );
}
