import { useState, useRef } from "react";
import { getScheduleColor } from "../lib/scheduleColor.js";
import MultiAssigneeInput from "./MultiAssigneeInput.jsx";
import ComboInput from "./ComboInput.jsx";

// Format a whole/partial minute count as "H:MM" (>= 60) or "Mm" (< 60).
function fmtSplit(mins) {
  const rounded = Math.round(mins);
  if (rounded >= 60) {
    const h = Math.floor(rounded / 60);
    const m = rounded % 60;
    return `${h}:${String(m).padStart(2, "0")}`;
  }
  return `${rounded}m`;
}

const CAL_DOWS_LONG  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const CAL_MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function formatTimeOfDay(t) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function formatDate(date) {
  return `${CAL_DOWS_LONG[date.getDay()]}, ${CAL_MONTHS_LONG[date.getMonth()]} ${date.getDate()}`;
}

function toISODate(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

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

const segInputStyle = {
  background: "#0a0c11",
  border: "1px solid #2b3140",
  borderRadius: "3px",
  color: "#e8e4dd",
  fontFamily: "monospace",
  fontSize: "0.85rem",
  outline: "none",
  padding: "0.3rem 0",
  textAlign: "center",
  width: "2.6rem",
  boxSizing: "border-box",
  transition: "border-color 0.12s",
};

export default function ChoreDetailModal({ chore, date, isDone, onToggleDone, onMarkDone, roomItemsMap = {}, onClose }) {
  const [hovered, setHovered] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    completedAt: toISODate(date),
    assignees:   chore.assignee ? [chore.assignee] : [],
    room:        chore.room     || "",
    item:        "",
    notes:       "",
    durHH:       "",
    durMM:       "",
  });

  const mmRef = useRef(null);

  const color = getScheduleColor(chore.schedule);
  const dateLabel = formatDate(date);

  const btnDone = {
    background: isDone ? "#4ade8022" : "transparent",
    border: `1px solid ${isDone ? "#4ade80" : "#a8a29c"}`,
    borderRadius: "3px",
    color: isDone ? "#4ade80" : "#a8a29c",
    cursor: "pointer",
    fontFamily: "monospace",
    fontSize: "0.78rem",
    padding: "0.45rem 1.25rem",
    transition: "all 0.15s",
  };

  function handleMarkDoneClick() {
    if (isDone) { onToggleDone(); return; }
    setShowForm(true);
  }

  function handleConfirm() {
    const { durHH, durMM, ...rest } = form;
    const duration = (durHH || durMM)
      ? `${(durHH || "0").padStart(2, "0")}:${(durMM || "0").padStart(2, "0")}`
      : "";
    onMarkDone?.({ ...rest, duration });
    onClose();
  }

  // Each assignee is credited the full chore time (not a split).
  const totalMinutes = (parseInt(form.durHH, 10) || 0) * 60 + (parseInt(form.durMM, 10) || 0);
  const numAssignees = form.assignees.length;
  const perPersonLabel = totalMinutes > 0 && numAssignees > 1
    ? `${fmtSplit(totalMinutes)} each · ${numAssignees} people`
    : null;

  function handleHHChange(e) {
    const v = e.target.value.replace(/\D/g, "").slice(0, 2);
    setForm(f => ({ ...f, durHH: v }));
    if (v.length === 2) mmRef.current?.focus();
  }

  function handleMMChange(e) {
    let v = e.target.value.replace(/\D/g, "").slice(0, 2);
    if (v.length === 2 && parseInt(v, 10) > 59) v = "59";
    setForm(f => ({ ...f, durMM: v }));
  }

  return (
    <div
      style={{ alignItems: "center", background: "rgba(0,0,0,0.7)", bottom: 0, display: "flex", justifyContent: "center", left: 0, position: "fixed", right: 0, top: 0, zIndex: 300 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#0f1117", border: "1px solid #a8a29c", borderRadius: "6px", maxWidth: 460, padding: "1.75rem 2rem", width: "90%" }}>

        {/* Label row */}
        <div style={{ alignItems: "center", display: "flex", gap: "0.5rem", marginBottom: "0.3rem" }}>
          <span style={{ background: color, borderRadius: "50%", display: "inline-block", flexShrink: 0, height: "8px", width: "8px" }} />
          <span style={{ color: "#8b7d6b", fontFamily: "monospace", fontSize: "0.6rem", letterSpacing: "0.15em", textTransform: "uppercase" }}>Chore</span>
        </div>

        {/* Title */}
        <div style={{ color: isDone ? "#a8a29c" : "#f0e6d3", fontFamily: "'Georgia','Times New Roman',serif", fontSize: "1.15rem", marginBottom: "0.25rem", textDecoration: isDone ? "line-through" : "none" }}>
          {chore.title}
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
                chore.room      && ["Room",     chore.room],
                chore.schedule  && ["Schedule", chore.schedule],
                chore.timeOfDay && ["Time",     formatTimeOfDay(chore.timeOfDay)],
                chore.assignee  && ["Assignee", chore.assignee],
                chore.notes     && ["Notes",    chore.notes],
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
                onClick={handleMarkDoneClick}
                style={btnDone}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
              >
                {isDone ? "✓ Done — Unmark" : "Mark Done"}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Completion form */}
            <div style={{ borderTop: "1px solid #1e2330", display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "1.5rem", paddingTop: "1rem" }}>
              <div style={{ color: "#8b7d6b", fontFamily: "monospace", fontSize: "0.6rem", letterSpacing: "0.15em", marginBottom: "0.25rem", textTransform: "uppercase" }}>Log completion details</div>

              <div style={{ alignItems: "flex-start", display: "flex", gap: "0.75rem" }}>
                <span style={labelStyle}>Date</span>
                <input
                  type="date"
                  value={form.completedAt}
                  onChange={e => setForm(f => ({ ...f, completedAt: e.target.value }))}
                  style={inputStyle}
                  onFocus={e => e.currentTarget.style.borderColor = "#c9a96e"}
                  onBlur={e => e.currentTarget.style.borderColor = "#2b3140"}
                />
              </div>
              <div style={{ alignItems: "flex-start", display: "flex", gap: "0.75rem" }}>
                <span style={labelStyle}>Room</span>
                <div style={{ flex: 1 }}>
                  <ComboInput
                    value={form.room}
                    onChange={v => setForm(f => ({ ...f, room: v }))}
                    options={Object.keys(roomItemsMap)}
                    placeholder="Which room?"
                    style={inputStyle}
                  />
                </div>
              </div>
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
              <div style={{ alignItems: "flex-start", display: "flex", gap: "0.75rem" }}>
                <span style={labelStyle}>Item</span>
                <div style={{ flex: 1 }}>
                  <ComboInput
                    value={form.item}
                    onChange={v => setForm(f => ({ ...f, item: v }))}
                    options={roomItemsMap[form.room] || []}
                    placeholder="Item in this room…"
                    style={inputStyle}
                  />
                </div>
              </div>
              <div style={{ alignItems: "flex-start", display: "flex", gap: "0.75rem" }}>
                <span style={labelStyle}>Assignees</span>
                <div style={{ flex: 1 }}>
                  <MultiAssigneeInput
                    value={form.assignees}
                    onChange={vals => setForm(f => ({ ...f, assignees: vals }))}
                    placeholder="Who completed this?"
                    style={{ ...inputStyle, padding: "0.3rem 0.5rem", fontSize: "0.75rem" }}
                  />
                </div>
              </div>

              {/* Time tracking — structured HH : MM entry */}
              <div style={{ alignItems: "center", display: "flex", gap: "0.75rem" }}>
                <span style={{ ...labelStyle, paddingTop: 0 }}>Time</span>
                <div style={{ alignItems: "center", display: "flex", gap: "0.4rem" }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.durHH}
                    onChange={handleHHChange}
                    placeholder="HH"
                    maxLength={2}
                    style={segInputStyle}
                    onFocus={e => e.currentTarget.style.borderColor = "#c9a96e"}
                    onBlur={e => e.currentTarget.style.borderColor = "#2b3140"}
                  />
                  <span style={{ color: "#a8a29c", fontFamily: "monospace", fontSize: "0.9rem", lineHeight: 1, userSelect: "none" }}>:</span>
                  <input
                    ref={mmRef}
                    type="text"
                    inputMode="numeric"
                    value={form.durMM}
                    onChange={handleMMChange}
                    placeholder="MM"
                    maxLength={2}
                    style={segInputStyle}
                    onFocus={e => e.currentTarget.style.borderColor = "#c9a96e"}
                    onBlur={e => e.currentTarget.style.borderColor = "#2b3140"}
                  />
                  <span style={{ color: "#6b6560", fontFamily: "monospace", fontSize: "0.6rem", letterSpacing: "0.08em", marginLeft: "0.25rem", textTransform: "uppercase" }}>optional</span>
                </div>
              </div>

              {perPersonLabel && (
                <div style={{ alignItems: "center", display: "flex", gap: "0.75rem" }}>
                  <span style={{ ...labelStyle, paddingTop: 0 }} />
                  <span style={{ color: "#c9a96e", fontFamily: "monospace", fontSize: "0.65rem", letterSpacing: "0.04em" }}>
                    ↳ {perPersonLabel}
                  </span>
                </div>
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
