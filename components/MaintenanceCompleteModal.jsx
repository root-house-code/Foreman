import { useState, useEffect } from "react";
import { computeNextDate } from "../lib/scheduleInterval.js";
import { useForemanStore } from "../lib/store.js";
import { consumingTaskInfo } from "../lib/supplies.js";
import AssigneeInput from "./AssigneeInput.jsx";
import useIsMobile from "../src/hooks/useIsMobile.js";
import { sheetOverlay, sheetPanel } from "./ModalShared.jsx";

const CAL_DOWS_LONG   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const CAL_MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function formatDate(date) {
  return `${CAL_DOWS_LONG[date.getDay()]}, ${CAL_MONTHS_LONG[date.getMonth()]} ${date.getDate()}`;
}

function toISODate(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function parseLocalDate(isoStr) {
  // Parse YYYY-MM-DD without UTC shift
  return new Date(isoStr + "T12:00:00");
}

const SCHEDULE_OPTIONS = [
  { value: "every 1 months",  label: "Every month"     },
  { value: "every 2 months",  label: "Every 2 months"  },
  { value: "every 3 months",  label: "Every 3 months"  },
  { value: "every 6 months",  label: "Every 6 months"  },
  { value: "every 1 years",   label: "Annually"        },
  { value: "every 2 years",   label: "Every 2 years"   },
  { value: "every 3 years",   label: "Every 3 years"   },
  { value: "every 5 years",   label: "Every 5 years"   },
  { value: "every 10 years",  label: "Every 10 years"  },
  { value: "as needed",       label: "As needed"       },
];

const SEASON_OPTIONS = [
  { value: null,     label: "None"   },
  { value: "spring", label: "Spring" },
  { value: "summer", label: "Summer" },
  { value: "fall",   label: "Fall"   },
  { value: "winter", label: "Winter" },
];

const inputStyle = {
  background: "#0a0c11",
  border: "1px solid #2b3140",
  borderRadius: "3px",
  color: "#e8e4dd",
  fontFamily: "monospace",
  fontSize: "0.75rem",
  outline: "none",
  padding: "0.3rem 0.5rem",
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle = {
  color: "#a8a29c",
  fontFamily: "monospace",
  fontSize: "0.62rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  minWidth: "5rem",
  paddingTop: "0.35rem",
  flexShrink: 0,
};

function buildInitialNext(completedAt, schedule, season) {
  if (!completedAt || !schedule) return "";
  const computed = computeNextDate(parseLocalDate(completedAt), schedule, season);
  return computed ? toISODate(computed) : "";
}

export default function MaintenanceCompleteModal({ row, date, isCompleted, lastDate, onMarkDone, onClose, onRowEdit }) {
  const isMobile = useIsMobile();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(() => {
    const completedAt = toISODate(date);
    const schedule    = row.schedule || "";
    const season      = row.season ?? null;
    return {
      completedAt,
      schedule,
      season,
      nextDate: buildInitialNext(completedAt, schedule, season),
      assignee: "",
      notes: "",
    };
  });

  // Recompute nextDate whenever completedAt, schedule, or season changes
  useEffect(() => {
    const { completedAt, schedule, season } = form;
    if (!completedAt || !schedule) return;
    const computed = computeNextDate(parseLocalDate(completedAt), schedule, season);
    if (computed) setForm(f => ({ ...f, nextDate: toISODate(computed) }));
  }, [form.completedAt, form.schedule, form.season]);

  // Supplies: if this task consumes a tracked supply, offer a one-tap stock decrement
  const supplies = useForemanStore(s => s.supplies);
  const setSupplyState = useForemanStore(s => s.setSupplyState);
  const supplyInfo = consumingTaskInfo(row.category, row.item, row.task, supplies);
  const canDecrement = supplyInfo && supplyInfo.qtyOnHand != null && supplyInfo.qtyOnHand > 0;
  const [decrementSupply, setDecrementSupply] = useState(true);

  const dateLabel = formatDate(date);

  // Build schedule select options; prepend current value if not in the standard list
  const scheduleOptions = SCHEDULE_OPTIONS.some(o => o.value === row.schedule)
    ? SCHEDULE_OPTIONS
    : [{ value: row.schedule || "", label: row.schedule || "—" }, ...SCHEDULE_OPTIONS];

  const btnDone = {
    background: isCompleted ? "#4ade8022" : "transparent",
    border: `1px solid ${isCompleted ? "#4ade80" : "#a8a29c"}`,
    borderRadius: "3px",
    color: isCompleted ? "#4ade80" : "#a8a29c",
    cursor: "pointer",
    fontFamily: "monospace",
    fontSize: "0.78rem",
    padding: "0.45rem 1.25rem",
    transition: "all 0.15s",
  };

  function handleConfirm() {
    if (form.schedule !== (row.schedule || "")) onRowEdit?.("schedule", form.schedule);
    if (form.season !== (row.season ?? null))   onRowEdit?.("season",   form.season);
    if (canDecrement && decrementSupply) {
      setSupplyState(supplyInfo.taskKey, { qtyOnHand: Math.max(0, supplyInfo.qtyOnHand - 1) });
    }
    onMarkDone(
      parseLocalDate(form.completedAt),
      form.notes,
      form.nextDate ? parseLocalDate(form.nextDate) : null,
      form.assignee,
    );
    onClose();
  }

  return (
    <div
      style={{ alignItems: "center", background: "rgba(0,0,0,0.7)", bottom: 0, display: "flex", justifyContent: "center", left: 0, position: "fixed", right: 0, top: 0, zIndex: 300, ...(isMobile ? sheetOverlay : null) }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={isMobile ? "fm-sheet-panel" : undefined} style={{ background: "#0f1117", border: "1px solid #a8a29c", borderRadius: "6px", maxWidth: 460, padding: "1.75rem 2rem", width: "90%", ...(isMobile ? sheetPanel : null) }}>

        {/* Label row */}
        <div style={{ alignItems: "center", display: "flex", gap: "0.5rem", marginBottom: "0.3rem" }}>
          <span style={{ background: "#c9a96e", borderRadius: "50%", display: "inline-block", flexShrink: 0, height: "8px", width: "8px" }} />
          <span style={{ color: "#8b7d6b", fontFamily: "monospace", fontSize: "0.6rem", letterSpacing: "0.15em", textTransform: "uppercase" }}>Maintenance</span>
        </div>

        {/* Title */}
        <div style={{ color: isCompleted ? "#a8a29c" : "#f0e6d3", fontFamily: "'Georgia','Times New Roman',serif", fontSize: "1.15rem", marginBottom: "0.1rem", textDecoration: isCompleted ? "line-through" : "none" }}>
          {row.item}
        </div>

        {/* Subtitle (task) */}
        <div style={{ color: "#8b7d6b", fontFamily: "monospace", fontSize: "0.72rem", marginBottom: "0.2rem" }}>
          {row.task}
        </div>

        {/* Date */}
        <div style={{ color: "#c9a96e", fontFamily: "monospace", fontSize: "0.72rem", marginBottom: "1.25rem" }}>
          {dateLabel}
        </div>

        {!showForm ? (
          <>
            {/* Meta */}
            <div style={{ borderTop: "1px solid #1e2330", display: "flex", flexDirection: "column", gap: "0.45rem", marginBottom: "1.5rem", paddingTop: "1rem" }}>
              {[
                row.category && ["System",   row.category],
                row.schedule && ["Schedule", row.schedule],
                row.season   && ["Season",   row.season.charAt(0).toUpperCase() + row.season.slice(1)],
                lastDate     && ["Last",     formatDate(lastDate)],
              ].filter(Boolean).map(([label, value]) => (
                <div key={label} style={{ display: "flex", gap: "0.75rem" }}>
                  <span style={{ color: "#a8a29c", fontFamily: "monospace", fontSize: "0.62rem", letterSpacing: "0.1em", minWidth: "5rem", textTransform: "uppercase" }}>{label}</span>
                  <span style={{ color: "#e8e4dd", fontFamily: "monospace", fontSize: "0.72rem" }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                onClick={onClose}
                style={{ background: "transparent", border: "1px solid #a8a29c", borderRadius: "3px", color: "#a8a29c", cursor: "pointer", fontFamily: "monospace", fontSize: "0.78rem", padding: "0.45rem 1rem" }}
                onMouseEnter={e => e.currentTarget.style.color = "#8b7d6b"}
                onMouseLeave={e => e.currentTarget.style.color = "#a8a29c"}
              >Close</button>
              <button
                onClick={() => isCompleted ? onMarkDone(null, null) : setShowForm(true)}
                style={btnDone}
              >
                {isCompleted ? "✓ Done — Unmark" : "Mark Done"}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Completion form */}
            <div style={{ borderTop: "1px solid #1e2330", display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "1.5rem", paddingTop: "1rem" }}>
              <div style={{ color: "#8b7d6b", fontFamily: "monospace", fontSize: "0.6rem", letterSpacing: "0.15em", marginBottom: "0.25rem", textTransform: "uppercase" }}>Log completion details</div>

              {/* Schedule */}
              <div style={{ alignItems: "flex-start", display: "flex", gap: "0.75rem" }}>
                <span style={labelStyle}>Schedule</span>
                <select
                  value={form.schedule}
                  onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))}
                  style={{ ...inputStyle, cursor: "pointer" }}
                  onFocus={e => e.currentTarget.style.borderColor = "#c9a96e"}
                  onBlur={e => e.currentTarget.style.borderColor = "#2b3140"}
                >
                  {scheduleOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Season */}
              <div style={{ alignItems: "flex-start", display: "flex", gap: "0.75rem" }}>
                <span style={labelStyle}>Season</span>
                <select
                  value={form.season ?? ""}
                  onChange={e => setForm(f => ({ ...f, season: e.target.value || null }))}
                  style={{ ...inputStyle, cursor: "pointer" }}
                  onFocus={e => e.currentTarget.style.borderColor = "#c9a96e"}
                  onBlur={e => e.currentTarget.style.borderColor = "#2b3140"}
                >
                  {SEASON_OPTIONS.map(o => (
                    <option key={String(o.value)} value={o.value ?? ""}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Last completed */}
              <div style={{ alignItems: "flex-start", display: "flex", gap: "0.75rem" }}>
                <span style={labelStyle}>Last</span>
                <input
                  type="date"
                  value={form.completedAt}
                  onChange={e => setForm(f => ({ ...f, completedAt: e.target.value }))}
                  style={inputStyle}
                  onFocus={e => e.currentTarget.style.borderColor = "#c9a96e"}
                  onBlur={e => e.currentTarget.style.borderColor = "#2b3140"}
                />
              </div>

              {/* Next date */}
              <div style={{ alignItems: "flex-start", display: "flex", gap: "0.75rem" }}>
                <span style={labelStyle}>Next</span>
                <input
                  type="date"
                  value={form.nextDate}
                  onChange={e => setForm(f => ({ ...f, nextDate: e.target.value }))}
                  style={inputStyle}
                  onFocus={e => e.currentTarget.style.borderColor = "#c9a96e"}
                  onBlur={e => e.currentTarget.style.borderColor = "#2b3140"}
                />
              </div>

              {/* Assignee */}
              <div style={{ alignItems: "flex-start", display: "flex", gap: "0.75rem" }}>
                <span style={labelStyle}>Assignee</span>
                <div style={{ flex: 1 }}>
                  <AssigneeInput
                    value={form.assignee}
                    onChange={v => setForm(f => ({ ...f, assignee: v }))}
                    placeholder="Who completed this?"
                    style={{ ...inputStyle, padding: "0.3rem 0.5rem", fontSize: "0.75rem" }}
                  />
                </div>
              </div>

              {/* Notes */}
              <div style={{ alignItems: "flex-start", display: "flex", gap: "0.75rem" }}>
                <span style={labelStyle}>Notes</span>
                <input
                  type="text"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  style={inputStyle}
                  onFocus={e => e.currentTarget.style.borderColor = "#c9a96e"}
                  onBlur={e => e.currentTarget.style.borderColor = "#2b3140"}
                />
              </div>

              {/* Supplies decrement */}
              {canDecrement && (
                <label style={{ alignItems: "center", cursor: "pointer", display: "flex", gap: "0.5rem", marginTop: "0.1rem" }}>
                  <input type="checkbox" checked={decrementSupply} onChange={e => setDecrementSupply(e.target.checked)} style={{ accentColor: "#c9a96e", cursor: "pointer" }} />
                  <span style={{ color: "#a8a29c", fontFamily: "monospace", fontSize: "0.68rem" }}>
                    Use one {supplyInfo.name} from supplies <span style={{ color: "#8b7d6b" }}>({supplyInfo.qtyOnHand} on hand)</span>
                  </span>
                </label>
              )}
            </div>

            {/* Form actions */}
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowForm(false)}
                style={{ background: "transparent", border: "1px solid #a8a29c", borderRadius: "3px", color: "#a8a29c", cursor: "pointer", fontFamily: "monospace", fontSize: "0.78rem", padding: "0.45rem 1rem" }}
                onMouseEnter={e => e.currentTarget.style.color = "#8b7d6b"}
                onMouseLeave={e => e.currentTarget.style.color = "#a8a29c"}
              >Back</button>
              <button
                onClick={handleConfirm}
                style={{ background: "#4ade8022", border: "1px solid #4ade80", borderRadius: "3px", color: "#4ade80", cursor: "pointer", fontFamily: "monospace", fontSize: "0.78rem", padding: "0.45rem 1.25rem", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#4ade8033"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#4ade8022"; }}
              >Confirm</button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
