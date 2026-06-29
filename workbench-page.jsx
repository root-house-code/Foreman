import { useState, useMemo, useCallback } from "react";
import FmHeader from "./src/components/FmHeader.jsx";
import FmSubnav from "./src/components/FmSubnav.jsx";
import { useForemanStore } from "./lib/store.js";
import { storageGet, storageSet } from "./lib/storage.js";
import { loadData } from "./lib/data.js";
import { loadDeletedCategories } from "./lib/deletedCategories.js";
import { loadDeletedItems } from "./lib/deletedItems.js";
import { getEffectiveRowState } from "./lib/inventory.js";
import { getItemStableKey } from "./lib/itemKeys.js";
import { maintenanceKey, saveMaintenanceCompletionRecord } from "./lib/maintenance.js";
import { computeNextDate } from "./lib/scheduleInterval.js";
import { loadChoreNextDates, saveChoreNextDates, computeChoreNextDate } from "./lib/chores.js";
import { toggleChoreCompletion, saveChoreCompletions, loadChoreCompletions, saveChoreCompletionRecord } from "./lib/choreCompletions.js";
import { loadTodos, saveTodos } from "./lib/todos.js";
import { loadRooms } from "./lib/rooms.js";
import {
  loadSessions, saveSessions, addSession, updateSession, deleteSession,
  createWorkSession, createSessionItem, computeSessionEstimate,
  startSession, completeSession, reorderSessions, addItemToSession,
  migrateSessionShape,
} from "./lib/sessions.js";
import MaintenanceCompleteModal from "./components/MaintenanceCompleteModal.jsx";
import ChoreDetailModal from "./components/ChoreDetailModal.jsx";
import InlineEditCell, { toDateInput, dateInputToISO } from "./components/InlineEditCell.jsx";

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_META = {
  maintenance: { label: "MAINT", color: "var(--fm-brass)"   },
  chore:       { label: "CHORE", color: "var(--fm-green)"   },
  todo:        { label: "TODO",  color: "var(--fm-cyan)"    },
  project:     { label: "PROJ",  color: "var(--fm-ink-dim)" },
};

const STATUS_META = {
  planned:     { label: "Planned",     color: "var(--fm-ink-dim)" },
  "in-progress": { label: "In Progress", color: "var(--fm-amber)" },
  complete:    { label: "Complete",    color: "var(--fm-green)"  },
};

const SEV_BAR_COLOR = {
  overdue:  "var(--fm-red)",
  soon:     "var(--fm-amber)",
  upcoming: "transparent",
  none:     "transparent",
};

const TYPE_FILTER_KEYS = {
  Maintenance: "maintenance",
  Chores:      "chore",
  "To Dos":    "todo",
  Projects:    "project",
};

const STATUS_FILTER_KEYS = {
  Overdue:    "overdue",
  "Due Soon": "soon",
  Upcoming:   "upcoming",
  "No Date":  "none",
};

const SEV_ORDER = { overdue: 0, soon: 1, upcoming: 2, none: 3 };

const TABS = ["Queue", "History"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function dueLabel(days) {
  if (days === null) return { text: "—",           color: "var(--fm-ink-mute)" };
  if (days < 0)      return { text: `${-days}d late`, color: "var(--fm-red)"   };
  if (days === 0)    return { text: "today",        color: "var(--fm-amber)"  };
  if (days === 1)    return { text: "tomorrow",     color: "var(--fm-amber)"  };
  if (days <= 7)     return { text: `in ${days}d`,  color: "var(--fm-amber)"  };
  return               { text: `in ${days}d`,  color: "var(--fm-ink-mute)" };
}

function fmtMinutes(min) {
  if (!min) return "—";
  if (min >= 60) { const h = Math.floor(min / 60), m = min % 60; return m ? `${h}h ${m}m` : `${h}h`; }
  return `${min}m`;
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtTimeBlock(tb) {
  if (!tb || (!tb.start && !tb.end)) return null;
  if (tb.start && tb.end) return `${tb.start} – ${tb.end}`;
  return tb.start || tb.end;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const actionBtnStyle = {
  background: "transparent",
  border: "1px solid var(--fm-hairline2)",
  borderRadius: "var(--fm-radius)",
  color: "var(--fm-ink-dim)",
  cursor: "pointer",
  flexShrink: 0,
  fontFamily: "var(--fm-mono)",
  fontSize: "0.6rem",
  letterSpacing: "0.06em",
  padding: "0.2rem 0.6rem",
  transition: "all 0.12s",
};

const pillStyle = (active, color = "var(--fm-brass)") => ({
  background: active ? color + "18" : "var(--fm-bg-sunk)",
  border: `1px solid ${active ? color : "var(--fm-hairline)"}`,
  borderRadius: "var(--fm-radius)",
  color: active ? color : "var(--fm-ink-dim)",
  cursor: "pointer",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.6rem",
  letterSpacing: "0.08em",
  padding: "0.25rem 0.6rem",
  textTransform: "uppercase",
  transition: "all 0.12s",
  whiteSpace: "nowrap",
});

const statusPillStyle = (active) => ({
  background: active ? "var(--fm-bg-panel)" : "transparent",
  border: `1px solid ${active ? "var(--fm-hairline2)" : "transparent"}`,
  borderRadius: "var(--fm-radius)",
  color: active ? "var(--fm-ink-dim)" : "var(--fm-ink-mute)",
  cursor: "pointer",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.6rem",
  letterSpacing: "0.08em",
  padding: "0.25rem 0.5rem",
  textTransform: "uppercase",
  transition: "all 0.12s",
});

const inputStyle = {
  background: "var(--fm-bg-sunk)",
  border: "1px solid var(--fm-hairline2)",
  borderRadius: "var(--fm-radius)",
  boxSizing: "border-box",
  color: "var(--fm-ink)",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.72rem",
  outline: "none",
  padding: "0.3rem 0.5rem",
  transition: "border-color 0.12s",
  width: "100%",
};

const labelStyle = {
  color: "var(--fm-ink-mute)",
  flexShrink: 0,
  fontFamily: "var(--fm-mono)",
  fontSize: "0.6rem",
  letterSpacing: "0.08em",
  minWidth: "4.5rem",
  paddingTop: "0.35rem",
  textTransform: "uppercase",
};

const segInputStyle = {
  background: "var(--fm-bg-sunk)",
  border: "1px solid var(--fm-hairline2)",
  borderRadius: "var(--fm-radius)",
  color: "var(--fm-ink)",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.82rem",
  outline: "none",
  padding: "0.28rem 0",
  textAlign: "center",
  transition: "border-color 0.12s",
  width: "2.5rem",
};

// ── QueueRow ──────────────────────────────────────────────────────────────────

function QueueRow({ item, sessions, onMaintLog, onChoreLog, onTodoDone, onProjectOpen, onAddToSession }) {
  const [hovered, setHovered] = useState(false);
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false);
  const meta = TYPE_META[item.type];
  const due  = dueLabel(item.days);

  const plannedSessions = useMemo(
    () => Object.values(sessions).filter(s => s.status === "planned" || s.status === "in-progress").sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)),
    [sessions]
  );

  let action;
  if (item.type === "maintenance") {
    action = <button onClick={e => { e.stopPropagation(); onMaintLog(); }} style={actionBtnStyle} onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink)"} onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}>Log</button>;
  } else if (item.type === "chore") {
    action = <button onClick={e => { e.stopPropagation(); onChoreLog(); }} style={actionBtnStyle} onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink)"} onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}>Log</button>;
  } else if (item.type === "todo") {
    action = <button onClick={e => { e.stopPropagation(); onTodoDone(); }} style={{ ...actionBtnStyle, borderColor: "var(--fm-green)55", color: "var(--fm-green)" }} onMouseEnter={e => e.currentTarget.style.background = "var(--fm-green)12"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>✓ Done</button>;
  } else if (item.type === "project") {
    action = <button onClick={e => { e.stopPropagation(); onProjectOpen(); }} style={actionBtnStyle} onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink)"} onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}>Open →</button>;
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setSessionPickerOpen(false); }}
      style={{
        alignItems: "center",
        background: hovered ? "var(--fm-bg-panel)" : "transparent",
        borderBottom: "1px solid var(--fm-hairline)",
        borderLeft: `2px solid ${SEV_BAR_COLOR[item.severity]}`,
        display: "flex",
        gap: "0.65rem",
        padding: "0.55rem 0.75rem 0.55rem 0.85rem",
        position: "relative",
        transition: "background 0.1s",
      }}
    >
      {/* Type badge */}
      <span style={{ background: meta.color + "18", border: `1px solid ${meta.color}44`, borderRadius: 2, color: meta.color, flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.5rem", letterSpacing: "0.06em", minWidth: 36, padding: "2px 5px", textAlign: "center" }}>
        {meta.label}
      </span>

      {/* Title + sub */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.8rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.title}
        </div>
        {(item.sub || (item.room && item.room !== "General")) && (
          <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", marginTop: "0.08rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[item.sub, item.room && item.room !== "General" ? item.room : null].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>

      {/* Due label */}
      <span style={{ color: due.color, flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.62rem", minWidth: 60, textAlign: "right" }}>
        {due.text}
      </span>

      {/* Add to session */}
      {hovered && plannedSessions.length > 0 && (
        <div style={{ position: "relative" }}>
          <button
            onClick={e => { e.stopPropagation(); setSessionPickerOpen(o => !o); }}
            style={{ ...actionBtnStyle, color: "var(--fm-brass-dim)", borderColor: "var(--fm-brass)44" }}
            title="Add to session"
          >
            + Session
          </button>
          {sessionPickerOpen && (
            <div style={{ background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline2)", borderRadius: 4, boxShadow: "0 6px 20px #00000055", display: "flex", flexDirection: "column", gap: 1, minWidth: 180, padding: 4, position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 50 }}>
              {plannedSessions.map(s => (
                <button
                  key={s.id}
                  onClick={e => { e.stopPropagation(); onAddToSession(s.id, item); setSessionPickerOpen(false); }}
                  style={{ background: "transparent", border: "none", borderRadius: 3, color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", padding: "0.4rem 0.6rem", textAlign: "left" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--fm-bg-panel)"; e.currentTarget.style.color = "var(--fm-ink)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
                >
                  {s.title || "Untitled Session"}
                  {s.date && <span style={{ color: "var(--fm-ink-mute)", marginLeft: "0.4rem" }}>{fmtDate(s.date)}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Primary action */}
      {action}
    </div>
  );
}

// ── NewSessionModal ───────────────────────────────────────────────────────────

function NewSessionModal({ onSave, onClose }) {
  const [title, setTitle] = useState("Work Session");
  const [date, setDate]   = useState("");
  const [startHH, setStartHH] = useState("");
  const [startMM, setStartMM] = useState("");
  const [endHH,   setEndHH]   = useState("");
  const [endMM,   setEndMM]   = useState("");
  const [notes,   setNotes]   = useState("");
  const [assignees, setAssignees] = useState("");

  const startMMRef = useState(null);
  const endHHRef   = useState(null);
  const endMMRef   = useState(null);

  function handleSave() {
    const timeBlock = (startHH || startMM || endHH || endMM) ? {
      start: (startHH || endHH) ? `${(startHH || "0").padStart(2,"0")}:${(startMM || "0").padStart(2,"0")}` : null,
      end:   (endHH || endMM)   ? `${(endHH   || "0").padStart(2,"0")}:${(endMM   || "0").padStart(2,"0")}` : null,
    } : null;
    onSave({
      title:     title.trim() || "Work Session",
      date:      date || null,
      timeBlock: timeBlock?.start || timeBlock?.end ? timeBlock : null,
      assignees: assignees.split(",").map(a => a.trim()).filter(Boolean),
      notes:     notes.trim(),
    });
  }

  function onDigit(val, setVal, nextRef, max) {
    const v = val.replace(/\D/g, "").slice(0, 2);
    if (v.length === 2 && parseInt(v, 10) > max) return max === 59 ? "59" : v.slice(0, 1);
    setVal(v);
    if (v.length === 2 && nextRef?.[0]) nextRef[0].focus?.();
    return v;
  }

  const fieldRow = (label, children) => (
    <div style={{ alignItems: "flex-start", display: "flex", gap: "0.75rem", marginBottom: "0.65rem" }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );

  return (
    <div style={{ alignItems: "center", background: "rgba(0,0,0,0.7)", bottom: 0, display: "flex", justifyContent: "center", left: 0, position: "fixed", right: 0, top: 0, zIndex: 300 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--fm-bg)", border: "1px solid var(--fm-hairline2)", borderRadius: 6, maxWidth: 420, padding: "1.75rem 2rem", width: "90%" }}>
        <div style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.14em", marginBottom: "1rem", textTransform: "uppercase" }}>New Work Session</div>

        {fieldRow("Title",
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} style={inputStyle}
            onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
            onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"} />
        )}
        {fieldRow("Date",
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle}
            onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
            onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"} />
        )}
        {fieldRow("Time block",
          <div style={{ alignItems: "center", display: "flex", gap: "0.35rem" }}>
            <input type="text" inputMode="numeric" value={startHH} placeholder="HH" maxLength={2} style={segInputStyle}
              onChange={e => { const v = e.target.value.replace(/\D/g,"").slice(0,2); setStartHH(v); if(v.length===2 && startMMRef[0]) startMMRef[0].focus?.(); }}
              onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
              onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"} />
            <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)" }}>:</span>
            <input ref={el => startMMRef[0] = el} type="text" inputMode="numeric" value={startMM} placeholder="MM" maxLength={2} style={segInputStyle}
              onChange={e => { let v = e.target.value.replace(/\D/g,"").slice(0,2); if(v.length===2&&parseInt(v)>59)v="59"; setStartMM(v); if(v.length===2&&endHHRef[0]) endHHRef[0].focus?.(); }}
              onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
              onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"} />
            <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", margin: "0 0.2rem" }}>–</span>
            <input ref={el => endHHRef[0] = el} type="text" inputMode="numeric" value={endHH} placeholder="HH" maxLength={2} style={segInputStyle}
              onChange={e => { const v = e.target.value.replace(/\D/g,"").slice(0,2); setEndHH(v); if(v.length===2&&endMMRef[0]) endMMRef[0].focus?.(); }}
              onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
              onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"} />
            <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)" }}>:</span>
            <input ref={el => endMMRef[0] = el} type="text" inputMode="numeric" value={endMM} placeholder="MM" maxLength={2} style={segInputStyle}
              onChange={e => { let v = e.target.value.replace(/\D/g,"").slice(0,2); if(v.length===2&&parseInt(v)>59)v="59"; setEndMM(v); }}
              onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
              onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"} />
            <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", marginLeft: "0.25rem" }}>optional</span>
          </div>
        )}
        {fieldRow("Assignees",
          <input type="text" value={assignees} onChange={e => setAssignees(e.target.value)} placeholder="Spencer, Alex…" style={inputStyle}
            onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
            onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"} />
        )}
        {fieldRow("Notes",
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)} style={inputStyle}
            onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
            onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"} />
        )}

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "1.25rem" }}>
          <button onClick={onClose} style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: 3, color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.4rem 1rem" }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}>Cancel</button>
          <button onClick={handleSave} style={{ background: "var(--fm-brass-bg)", border: "1px solid var(--fm-brass)", borderRadius: 3, color: "var(--fm-brass)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.4rem 1.25rem" }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--fm-brass)22"}
            onMouseLeave={e => e.currentTarget.style.background = "var(--fm-brass-bg)"}>Create Session</button>
        </div>
      </div>
    </div>
  );
}

// ── SessionCard ───────────────────────────────────────────────────────────────

function SessionCard({ session, onStart, onComplete, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const sm = STATUS_META[session.status] || STATUS_META.planned;
  const tb = fmtTimeBlock(session.timeBlock);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "var(--fm-bg-raised)" : "var(--fm-bg-sunk)",
        border: "1px solid var(--fm-hairline)",
        borderRadius: "var(--fm-radius-lg)",
        marginBottom: "0.5rem",
        padding: "0.75rem 0.85rem",
        transition: "background 0.12s",
      }}
    >
      {/* Title row */}
      <div style={{ alignItems: "flex-start", display: "flex", gap: "0.5rem", marginBottom: "0.3rem" }}>
        <div style={{ color: "var(--fm-ink)", flex: 1, fontFamily: "var(--fm-serif)", fontSize: "0.88rem" }}>
          {session.title || "Untitled Session"}
        </div>
        <span style={{ background: sm.color + "18", border: `1px solid ${sm.color}44`, borderRadius: 2, color: sm.color, flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.5rem", letterSpacing: "0.06em", padding: "2px 6px" }}>
          {sm.label}
        </span>
      </div>

      {/* Meta row */}
      <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", marginBottom: "0.5rem" }}>
        {[
          session.date && fmtDate(session.date),
          tb,
          session.estimatedDuration ? fmtMinutes(session.estimatedDuration) + " est." : null,
          session.items?.length ? `${session.items.length} item${session.items.length !== 1 ? "s" : ""}` : "No items",
        ].filter(Boolean).join(" · ")}
      </div>

      {/* Item list */}
      {session.items?.length > 0 && (
        <div style={{ borderTop: "1px solid var(--fm-hairline)", marginBottom: "0.5rem", paddingTop: "0.4rem" }}>
          {session.items.slice(0, 4).map(item => (
            <div key={item.id} style={{ alignItems: "center", color: item.result === "done" ? "var(--fm-ink-mute)" : "var(--fm-ink-dim)", display: "flex", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", gap: "0.4rem", padding: "0.12rem 0", textDecoration: item.result === "done" ? "line-through" : "none" }}>
              <span style={{ color: item.result === "done" ? "var(--fm-green)" : "var(--fm-hairline2)" }}>
                {item.result === "done" ? "✓" : "○"}
              </span>
              {item.label}
            </div>
          ))}
          {session.items.length > 4 && (
            <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", paddingTop: "0.1rem" }}>+{session.items.length - 4} more</div>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "0.4rem" }}>
        {session.status === "planned" && (
          <button onClick={onStart} style={{ ...actionBtnStyle, color: "var(--fm-amber)", borderColor: "var(--fm-amber)55" }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--fm-amber)12"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>Start</button>
        )}
        {session.status === "in-progress" && (
          <button onClick={onComplete} style={{ ...actionBtnStyle, color: "var(--fm-green)", borderColor: "var(--fm-green)55" }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--fm-green)12"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>Complete</button>
        )}
        <div style={{ flex: 1 }} />
        {hovered && (
          <button onClick={onDelete} style={{ ...actionBtnStyle, color: "var(--fm-red-dim, #7a2020)", borderColor: "transparent" }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--fm-red-dim, #7a2020)"}>Remove</button>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WorkbenchPage({ navigate, navState }) {
  const chores          = useForemanStore(s => s.chores);
  const projects        = useForemanStore(s => s.projects);
  const inventory       = useForemanStore(s => s.inventory);
  const spatialAssignments = useForemanStore(s => s.spatialAssignments);

  const [activeTab,    setActiveTab]    = useState("Queue");
  const [typeFilter,   setTypeFilter]   = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const [choreCompletions, setChoreCompletions] = useState(() => loadChoreCompletions());
  const [choreNextDates,   setChoreNextDates]   = useState(() => loadChoreNextDates());
  const [nextDatesMap,     setNextDatesMap]     = useState(() => storageGet("maintenance-next-dates") ?? {});
  const [todos,            setTodos]            = useState(() => loadTodos());

  // Sessions state
  const [sessionsMap, setSessionsMap] = useState(() => {
    const raw = loadSessions();
    const migrated = {};
    Object.values(raw).forEach(s => { const m = migrateSessionShape(s); migrated[m.id] = m; });
    return migrated;
  });
  const [newSessionOpen, setNewSessionOpen] = useState(false);

  const [completingMaint, setCompletingMaint] = useState(null);
  const [completingChore, setCompletingChore] = useState(null);

  const rows              = useMemo(() => loadData(), []);
  const deletedCategories = useMemo(() => loadDeletedCategories(), []);
  const deletedItems      = useMemo(() => loadDeletedItems(), []);
  const rooms             = useMemo(() => loadRooms(), []);

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  const roomItemsMap = useMemo(() => {
    const map = {};
    Object.values(rooms).forEach(r => { map[r.label] = []; });
    return map;
  }, [rooms]);

  // ── Unified queue ──────────────────────────────────────────────────────────

  const allItems = useMemo(() => {
    const items = [];

    rows.forEach(row => {
      if (row._isBlankCategory || !row.category || !row.item || !row.task) return;
      if (deletedCategories.has(row.category)) return;
      if (deletedItems.has(`${row.category}|${row.item}`)) return;
      if (getEffectiveRowState(inventory, row) !== "included") return;
      const key = maintenanceKey(row);
      const d = nextDatesMap[key];
      if (!d) return;
      const due = new Date(d);
      if (isNaN(due)) return;
      const days = Math.round((due - today) / 86400000);
      const stableKey = getItemStableKey(row);
      const spatial = spatialAssignments[stableKey] || {};
      items.push({
        type: "maintenance", id: key, key,
        title: row.task,
        sub:   `${row.category} · ${row.item}`,
        room:  spatial.roomLabel || spatial.exteriorLabel || "General",
        due, days,
        severity: days < 0 ? "overdue" : days <= 7 ? "soon" : "upcoming",
        row,
      });
    });

    chores.forEach(c => {
      const d = choreNextDates[c.id];
      const due  = d ? new Date(d) : null;
      const days = due ? Math.round((due - today) / 86400000) : null;
      items.push({
        type: "chore", id: c.id,
        title: c.title,
        sub:   c.item || c.room || "Chore",
        room:  c.room || "General",
        due, days,
        severity: days === null ? "none" : days < 0 ? "overdue" : days <= 7 ? "soon" : "upcoming",
        chore: c,
      });
    });

    todos.filter(t => t.status !== "done").forEach(t => {
      const due  = t.dueDate ? new Date(t.dueDate + "T00:00:00") : null;
      const days = due ? Math.round((due - today) / 86400000) : null;
      items.push({
        type: "todo", id: t.id,
        title: t.title,
        sub:   t.linkedItem || t.linkedCategory || "To Do",
        room:  t.linkedRoom || t.linkedExterior || "General",
        due, days,
        severity: days === null ? "none" : days < 0 ? "overdue" : days <= 7 ? "soon" : "upcoming",
        todo: t,
      });
    });

    (Array.isArray(projects) ? projects : []).filter(p => p.status !== "done" && p.status !== "complete").forEach(p => {
      const dateStr = p.dueDate || p.targetDate;
      const due  = dateStr ? new Date(dateStr + "T00:00:00") : null;
      const days = due ? Math.round((due - today) / 86400000) : null;
      items.push({
        type: "project", id: p.id,
        title: p.name || p.title || "Untitled Project",
        sub:   p.linkedCategory || p.category || "Project",
        room:  p.linkedRoom || "General",
        due, days,
        severity: days === null ? "none" : days < 0 ? "overdue" : days <= 7 ? "soon" : "upcoming",
        project: p,
      });
    });

    const s = SEV_ORDER;
    return items.sort((a, b) => {
      const sd = s[a.severity] - s[b.severity];
      if (sd !== 0) return sd;
      if (a.due && b.due) return a.due - b.due;
      if (a.due) return -1; if (b.due) return 1;
      return 0;
    });
  }, [rows, chores, todos, projects, deletedCategories, deletedItems, inventory, spatialAssignments, choreNextDates, nextDatesMap, today]);

  const filteredItems = useMemo(() => allItems.filter(item => {
    if (typeFilter !== "All" && item.type !== TYPE_FILTER_KEYS[typeFilter]) return false;
    if (statusFilter !== "All" && item.severity !== STATUS_FILTER_KEYS[statusFilter]) return false;
    return true;
  }), [allItems, typeFilter, statusFilter]);

  const counts = useMemo(() => {
    const c = { All: allItems.length, Maintenance: 0, Chores: 0, "To Dos": 0, Projects: 0 };
    allItems.forEach(i => { if (i.type === "maintenance") c.Maintenance++; else if (i.type === "chore") c.Chores++; else if (i.type === "todo") c["To Dos"]++; else if (i.type === "project") c.Projects++; });
    return c;
  }, [allItems]);

  const overdueCnt = useMemo(() => allItems.filter(i => i.severity === "overdue").length, [allItems]);
  const soonCnt    = useMemo(() => allItems.filter(i => i.severity === "soon").length,    [allItems]);

  // ── Session helpers ────────────────────────────────────────────────────────

  const upcomingSessions = useMemo(
    () => Object.values(sessionsMap).filter(s => s.status === "planned" || s.status === "in-progress").sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)),
    [sessionsMap]
  );

  const completedSessions = useMemo(
    () => Object.values(sessionsMap).filter(s => s.status === "complete").sort((a, b) => new Date(b.completedAt ?? b.endedAt ?? 0) - new Date(a.completedAt ?? a.endedAt ?? 0)),
    [sessionsMap]
  );

  function persistSessions(map) { setSessionsMap(map); saveSessions(map); }

  // Inline history edit (double-click a cell on the History tab).
  function editSessionField(id, field, raw) {
    const s = sessionsMap[id];
    if (!s) return;
    let v = raw;
    if (field === "completedAt") v = dateInputToISO(raw);
    else if (field === "actualDuration") {
      v = raw === "" ? null : Number(raw);
      if (v != null && Number.isNaN(v)) return;
    } else if (field === "assignees") {
      v = raw ? raw.split(",").map(x => x.trim()).filter(Boolean) : [];
    }
    persistSessions({ ...sessionsMap, [id]: { ...s, [field]: v } });
  }

  function handleCreateSession(fields) {
    const session = createWorkSession(fields);
    const next = { ...sessionsMap, [session.id]: session };
    persistSessions(next);
    setNewSessionOpen(false);
  }

  function handleStartSession(id) {
    persistSessions(startSession(id));
  }

  function handleCompleteSession(id) {
    persistSessions(completeSession(id));
  }

  function handleDeleteSession(id) {
    const next = { ...sessionsMap };
    delete next[id];
    persistSessions(next);
  }

  function handleAddToSession(sessionId, item) {
    const si = createSessionItem({
      kind:       item.type,
      ref:        item.key || item.id,
      choreDate:  item.type === "chore" ? item.due?.toISOString().slice(0, 10) : null,
      label:      item.title,
      sublabel:   item.sub || "",
      room:       item.room || "General",
      estMinutes: item.type === "maintenance" ? 20 : item.type === "chore" ? (item.chore?.duration ?? 15) : 15,
    });
    persistSessions(addItemToSession(sessionId, si));
  }

  // ── Completion handlers ────────────────────────────────────────────────────

  function handleMaintDone(form) {
    const { key, row } = completingMaint;
    saveMaintenanceCompletionRecord(key, form);
    if (form.nextDate) {
      const updated = { ...nextDatesMap, [key]: new Date(form.nextDate + "T12:00:00").toISOString() };
      storageSet("maintenance-next-dates", updated);
      setNextDatesMap(updated);
    } else if (form.completedAt && (form.schedule || row.schedule)) {
      const next = computeNextDate(new Date(form.completedAt + "T12:00:00"), form.schedule || row.schedule, form.season ?? row.season ?? null);
      if (next) {
        const updated = { ...nextDatesMap, [key]: next.toISOString() };
        storageSet("maintenance-next-dates", updated);
        setNextDatesMap(updated);
      }
    }
    setCompletingMaint(null);
  }

  function handleChoreMarkDone(details) {
    const { chore, date } = completingChore;
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    const updatedCompletions = toggleChoreCompletion(choreCompletions, chore.id, d);
    saveChoreCompletions(updatedCompletions);
    setChoreCompletions(updatedCompletions);
    saveChoreCompletionRecord(chore.id, d, details);
    const nextOcc = computeChoreNextDate(d, chore.schedule, chore.dayOfWeek, chore.timeOfDay);
    const updated = { ...choreNextDates, [chore.id]: nextOcc.toISOString() };
    saveChoreNextDates(updated);
    setChoreNextDates(updated);
    setCompletingChore(null);
  }

  function handleTodoDone(item) {
    const updated = todos.map(t => t.id === item.id ? { ...t, status: "done", completedAt: new Date().toISOString() } : t);
    saveTodos(updated);
    setTodos(updated);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: "var(--fm-bg)", color: "var(--fm-ink)", display: "flex", flexDirection: "column", fontFamily: "var(--fm-sans)", height: "100vh", overflow: "hidden" }}>
      <FmHeader active="Workbench" tagline="Workbench" />

      <FmSubnav
        tabs={TABS}
        active={activeTab}
        onTabChange={setActiveTab}
        stats={[
          { value: overdueCnt, label: "overdue",  color: overdueCnt > 0 ? "var(--fm-red)"   : "var(--fm-green)" },
          { value: soonCnt,    label: "due soon", color: soonCnt    > 0 ? "var(--fm-amber)" : "var(--fm-ink)"   },
          { value: allItems.length, label: "total" },
        ]}
      />

      {/* ── Queue tab ── */}
      {activeTab === "Queue" && (
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

          {/* Work Queue */}
          <div style={{ display: "flex", flex: 1, flexDirection: "column", minWidth: 0, overflowY: "auto", padding: "1.25rem 1.5rem 3rem" }}>
            <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "1rem" }}>
              {["All", "Maintenance", "Chores", "To Dos", "Projects"].map(t => (
                <button key={t} onClick={() => setTypeFilter(t)} style={pillStyle(typeFilter === t)}>
                  {t}{counts[t] !== undefined ? ` · ${counts[t]}` : ""}
                </button>
              ))}
              <span style={{ background: "var(--fm-hairline)", height: 14, margin: "0 0.15rem", width: 1 }} />
              {["All", "Overdue", "Due Soon", "Upcoming", "No Date"].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)} style={statusPillStyle(statusFilter === s)}>{s}</button>
              ))}
            </div>

            {filteredItems.length === 0 ? (
              <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.82rem", paddingTop: "4rem", textAlign: "center" }}>
                {allItems.length === 0 ? "Nothing due. You're all caught up." : "No items match this filter."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {filteredItems.map(item => (
                  <QueueRow
                    key={`${item.type}-${item.id}`}
                    item={item}
                    sessions={sessionsMap}
                    onMaintLog={() => setCompletingMaint({ row: item.row, key: item.key, nextDue: item.due })}
                    onChoreLog={() => setCompletingChore({ chore: item.chore, date: item.due || today })}
                    onTodoDone={() => handleTodoDone(item)}
                    onProjectOpen={() => navigate("Projects", { projectId: item.id })}
                    onAddToSession={handleAddToSession}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Session Planner */}
          <div style={{ background: "var(--fm-bg-panel)", borderLeft: "var(--fm-border)", display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto", padding: "1.25rem 1.25rem 2rem", width: "28%" }}>
            <div style={{ alignItems: "center", display: "flex", marginBottom: "0.85rem" }}>
              <div style={{ color: "var(--fm-brass-dim)", flex: 1, fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>Work Sessions</div>
              <button
                onClick={() => setNewSessionOpen(true)}
                style={{ background: "var(--fm-brass-bg)", border: "1px solid var(--fm-brass)", borderRadius: "var(--fm-radius)", color: "var(--fm-brass)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.06em", padding: "0.2rem 0.6rem" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--fm-brass)22"}
                onMouseLeave={e => e.currentTarget.style.background = "var(--fm-brass-bg)"}
              >+ New</button>
            </div>

            {upcomingSessions.length === 0 ? (
              <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.7rem", lineHeight: 1.55 }}>
                No sessions planned yet. Create a session, then add items from the queue using the "+ Session" button on any row.
              </div>
            ) : (
              upcomingSessions.map(s => (
                <SessionCard
                  key={s.id}
                  session={s}
                  onStart={() => handleStartSession(s.id)}
                  onComplete={() => handleCompleteSession(s.id)}
                  onDelete={() => handleDeleteSession(s.id)}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* ── History tab ── */}
      {activeTab === "History" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem 2rem 3rem" }}>
          {completedSessions.length === 0 ? (
            <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.82rem", margin: 0 }}>
              No completed sessions yet. Complete a work session to start your history.
            </p>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  {["Date", "Session", "Items", "Est. Time", "Actual Time", "Assignees"].map(h => (
                    <th key={h} style={{ borderBottom: "1px solid var(--fm-hairline2)", color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", fontWeight: 400, letterSpacing: "0.12em", padding: "0 0.75rem 0.5rem 0", textAlign: "left", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {completedSessions.map(s => {
                  const doneCount = (s.items ?? []).filter(i => i.result === "done").length;
                  return (
                    <tr key={s.id} style={{ borderBottom: "1px solid var(--fm-hairline)" }}>
                      <InlineEditCell
                        type="date"
                        value={s.completedAt || s.endedAt}
                        editValue={toDateInput(s.completedAt || s.endedAt)}
                        display={fmtDate(s.completedAt || s.endedAt)}
                        onCommit={raw => editSessionField(s.id, "completedAt", raw)}
                        style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.55rem 0.75rem 0.55rem 0", whiteSpace: "nowrap" }}
                      />
                      <InlineEditCell
                        value={s.title}
                        display={s.title || "Untitled Session"}
                        onCommit={raw => editSessionField(s.id, "title", raw)}
                        style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.55rem 0.75rem 0.55rem 0" }}
                      />
                      <td style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.55rem 0.75rem 0.55rem 0", whiteSpace: "nowrap" }}>{doneCount} / {(s.items ?? []).length}</td>
                      <td style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.55rem 0.75rem 0.55rem 0", whiteSpace: "nowrap" }}>{fmtMinutes(s.estimatedDuration)}</td>
                      <InlineEditCell
                        type="number"
                        min="0"
                        value={s.actualDuration}
                        display={fmtMinutes(s.actualDuration)}
                        title="Double-click to edit (minutes)"
                        onCommit={raw => editSessionField(s.id, "actualDuration", raw)}
                        style={{ color: s.actualDuration ? "var(--fm-ink)" : "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.55rem 0.75rem 0.55rem 0", whiteSpace: "nowrap" }}
                      />
                      <InlineEditCell
                        value={(s.assignees ?? []).join(", ") || s.assignee || ""}
                        display={(s.assignees ?? []).join(", ") || s.assignee || "—"}
                        title="Double-click to edit (comma-separated)"
                        onCommit={raw => editSessionField(s.id, "assignees", raw)}
                        style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.55rem 0 0.55rem 0" }}
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
      {newSessionOpen && <NewSessionModal onSave={handleCreateSession} onClose={() => setNewSessionOpen(false)} />}

      {completingMaint && (
        <MaintenanceCompleteModal
          row={completingMaint.row}
          date={completingMaint.nextDue || today}
          isCompleted={false}
          lastDate={null}
          onMarkDone={handleMaintDone}
          onClose={() => setCompletingMaint(null)}
        />
      )}
      {completingChore && (
        <ChoreDetailModal
          chore={completingChore.chore}
          date={completingChore.date}
          isDone={false}
          roomItemsMap={roomItemsMap}
          onToggleDone={() => setCompletingChore(null)}
          onMarkDone={handleChoreMarkDone}
          onClose={() => setCompletingChore(null)}
        />
      )}
    </div>
  );
}
