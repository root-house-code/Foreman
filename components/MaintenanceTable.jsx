import { useState } from "react";
import { createPortal } from "react-dom";
import ScheduleBadge from "./ScheduleBadge.jsx";
import MaintenanceCompleteModal from "./MaintenanceCompleteModal.jsx";
import { saveMaintenanceCompletionRecord } from "../lib/maintenance.js";
import DateCell from "./DateCell.jsx";
import FollowButton from "./FollowButton.jsx";
import ReminderButton from "./ReminderButton.jsx";
import ComboCell from "./ComboCell.jsx";
import SelectCell from "./SelectCell.jsx";
import SchedulePicker from "./SchedulePicker.jsx";
import Tooltip from "./Tooltip.jsx";
import MaintenanceDetailModal from "./MaintenanceDetailModal.jsx";
import { SEASON_OPTIONS } from "../lib/scheduleOptions.js";
import { CATEGORY_TIPS, ITEM_TIPS, TASK_TIPS } from "../lib/tooltips.js";
import useIsMobile from "../src/hooks/useIsMobile.js";
import { sheetOverlay, sheetPanel } from "./ModalShared.jsx";

// ─── System tag abbreviations ─────────────────────────────────────────────────
const SYS_ABBR = {
  "HVAC": "HVAC", "Plumbing": "PLM", "Electrical": "ELEC",
  "Appliances": "APPL", "Exterior": "EXT", "Structure": "STRC",
  "Safety": "SAF", "General": "GEN", "Roofing": "ROOF",
  "Landscaping": "LAND", "Pool": "POOL", "Irrigation": "IRR",
};
function getSysTag(cat) {
  return SYS_ABBR[cat] || (cat || "").slice(0, 4).toUpperCase();
}

// ─── Status computation ───────────────────────────────────────────────────────
function computeStatus(key, nextDates, loggedRows) {
  if (loggedRows.has(key)) return { text: "logged", color: "var(--fm-cyan)" };
  const nd = nextDates[key];
  if (!nd) return { text: "—", color: "var(--fm-ink-mute)" };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const copy = new Date(nd); copy.setHours(0, 0, 0, 0);
  const diffDays = Math.round((copy - today) / 86400000);
  if (diffDays < 0)  return { text: `${Math.abs(diffDays)}d late`, color: "var(--fm-red)" };
  if (diffDays === 0) return { text: "today",         color: "var(--fm-amber)" };
  if (diffDays <= 14) return { text: `T+${diffDays}d`, color: "var(--fm-amber)" };
  return { text: `T+${diffDays}d`, color: "var(--fm-ink-dim)" };
}

// ─── Column definitions ───────────────────────────────────────────────────────
const COLUMNS = [
  { label: "Status",   sortKey: "nextDate",      width: "90px"  },
  { label: "System",   sortKey: "category",      width: "55px"  },
  { label: "Item",     sortKey: "item",           width: "11%"   },
  { label: "Task",     sortKey: "task",           width: "17%"   },
  { label: "Schedule", sortKey: "schedule",       width: "10%"   },
  { label: "Season",   sortKey: "season",         width: "70px"  },
  { label: "Last",     sortKey: "lastCompleted",  width: "10%"   },
  { label: "Next",     sortKey: "nextDate",       width: "10%"   },
  { label: "↻",        sortKey: null,             width: "36px"  },
  { label: "Note",     sortKey: null,             width: "34px"  },
  { label: "Alert",    sortKey: null,             width: "34px"  },
  { label: "",         sortKey: null,             width: "58px"  },
  { label: "",         sortKey: null,             width: "30px"  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function TaskCell({ value, onChange, tooltip }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (!editing) {
    return (
      <Tooltip text={tooltip}>
        <span
          onClick={() => { setDraft(value || ""); setEditing(true); }}
          style={{ color: "var(--fm-ink-dim)", cursor: "text", display: "block", fontFamily: "var(--fm-sans)", fontSize: "0.78rem", minHeight: "1.2em" }}
        >
          {value || "Task"}
        </span>
      </Tooltip>
    );
  }

  return (
    <input
      autoFocus
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); onChange(draft); }}
      onKeyDown={e => {
        if (e.key === "Enter") { e.preventDefault(); setEditing(false); onChange(draft); }
        if (e.key === "Escape") setEditing(false);
      }}
      style={{
        background: "var(--fm-bg-sunk)",
        border: "1px solid var(--fm-hairline2)",
        borderRadius: "var(--fm-radius)",
        color: "var(--fm-ink)",
        fontFamily: "var(--fm-sans)",
        fontSize: "0.78rem",
        outline: "none",
        padding: "0.2rem 0.4rem",
        width: "100%",
        boxSizing: "border-box",
      }}
    />
  );
}


function NoteIconButton({ hasNote, onClick }) {
  const color = hasNote ? "var(--fm-brass)" : "var(--fm-ink-mute)";
  return (
    <button
      onClick={onClick}
      title={hasNote ? "View / edit note" : "Add note"}
      style={{
        background: "transparent",
        border: "none",
        color,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0.15rem",
        transition: "color 0.12s",
      }}
      onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"}
      onMouseLeave={e => e.currentTarget.style.color = color}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    </button>
  );
}

// ─── Main table ───────────────────────────────────────────────────────────────

export default function MaintenanceTable({
  rows,
  allRows,
  completedDates, onDateChange,
  nextDates, onNextDateChange,
  followSchedule, onToggleFollow,
  reminderModes, onCycleReminderMode,
  notes, onNoteChange,
  onRowEdit,
  onDeleteRow,
  sortCols, onHeaderClick,
  stickyTop,
}) {
  const [confirmRow, setConfirmRow] = useState(null);
  const [loggedRows, setLoggedRows] = useState(new Set());
  const [detailRow, setDetailRow] = useState(null);
  const [completionRow, setCompletionRow] = useState(null); // { row, key }
  const isMobile = useIsMobile();

  function handleModalMarkDone(key, row, completedDate, notes, nextDateOverride, assignee) {
    if (!completedDate) {
      onDateChange(key, null);
      return;
    }
    saveMaintenanceCompletionRecord(key, { completedAt: completedDate.toISOString(), assignee, notes });
    onDateChange(key, completedDate);
    if (nextDateOverride) onNextDateChange(key, nextDateOverride);
    setLoggedRows(prev => new Set([...prev, key]));
    setTimeout(() => setLoggedRows(prev => { const n = new Set(prev); n.delete(key); return n; }), 3000);
  }

  // Pre-compute item grouping: first occurrence of category+item gets name shown
  const groupedRows = rows.map((row, idx) => {
    const itemKey = `${row.category}|${row.item}`;
    const prevKey  = idx > 0 ? `${rows[idx-1].category}|${rows[idx-1].item}` : null;
    return { ...row, _isFirstForItem: itemKey !== prevKey };
  });

  const thStyle = (col) => {
    const sortEntry = (sortCols || []).find(s => s.col === col.sortKey);
    const isPrimary = sortEntry && (sortCols || [])[0]?.col === col.sortKey;
    return {
      background: "var(--fm-bg-raised)",
      borderBottom: "1px solid var(--fm-hairline2)",
      color: "var(--fm-brass-dim)",
      cursor: col.sortKey ? "pointer" : "default",
      fontFamily: "var(--fm-mono)",
      fontSize: "var(--fm-tag-size)",
      fontWeight: "normal",
      letterSpacing: "0.12em",
      padding: "0.6rem 0.5rem",
      position: "sticky",
      textAlign: "left",
      textTransform: "uppercase",
      top: stickyTop ?? 0,
      userSelect: "none",
      whiteSpace: "nowrap",
      width: col.width,
      zIndex: 10,
      _sortEntry: sortEntry,
      _isPrimary: isPrimary,
    };
  };

  // Modals are shared between the desktop table and the mobile card list.
  const modals = (
    <>
      {completionRow && createPortal(
        <MaintenanceCompleteModal
          row={completionRow.row}
          date={nextDates[completionRow.key] || new Date()}
          isCompleted={!!completedDates[completionRow.key]}
          lastDate={completedDates[completionRow.key] || null}
          onMarkDone={(completedDate, notes, nextDateOverride, assignee) =>
            handleModalMarkDone(completionRow.key, completionRow.row, completedDate, notes, nextDateOverride, assignee)
          }
          onRowEdit={(field, value) => onRowEdit(completionRow.row._id, field, value)}
          onClose={() => setCompletionRow(null)}
        />,
        document.body
      )}

      {detailRow && createPortal(
        <MaintenanceDetailModal
          row={detailRow}
          note={notes[`${detailRow.category}|${detailRow.item}|${detailRow.task}`] ?? ""}
          onNoteChange={text => onNoteChange(`${detailRow.category}|${detailRow.item}|${detailRow.task}`, text)}
          completedDate={completedDates[`${detailRow.category}|${detailRow.item}|${detailRow.task}`] ?? null}
          nextDate={nextDates[`${detailRow.category}|${detailRow.item}|${detailRow.task}`] ?? null}
          onLogIt={() => setCompletionRow({ row: detailRow, key: `${detailRow.category}|${detailRow.item}|${detailRow.task}` })}
          onClose={() => setDetailRow(null)}
        />,
        document.body
      )}

      {confirmRow && createPortal(
        <DeleteConfirmModal
          row={confirmRow}
          onConfirm={() => { onDeleteRow(confirmRow); setConfirmRow(null); }}
          onCancel={() => setConfirmRow(null)}
        />,
        document.body
      )}
    </>
  );

  // ── Mobile: tappable card list ──────────────────────────────────────────────
  // One card per task, status carried by the left edge. Tap opens the detail
  // sheet (notes, meta, log); "Log it" jumps straight to the completion sheet.
  if (isMobile) {
    return (
      <div>
        {groupedRows.map((row) => {
          const key = `${row.category}|${row.item}|${row.task}`;
          const status = computeStatus(key, nextDates, loggedRows);
          const isTaskless = row._isTaskless;
          const hasNote = !!(notes[key] || "").trim();
          const nextD = nextDates[key];
          const lastD = completedDates[key];
          const fmtShort = d => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
          return (
            <div
              key={row._id || key}
              onClick={e => {
                if (e.target.closest("button,input,select,textarea")) return;
                if (!isTaskless) setDetailRow(row);
              }}
              style={{
                background: isTaskless ? "rgba(201,169,110,0.07)" : "var(--fm-bg-raised)",
                border: "1px solid var(--fm-hairline)",
                borderLeft: `3px solid ${isTaskless ? "var(--fm-brass)" : status.color}`,
                borderRadius: 8,
                marginBottom: 8,
                padding: "10px 12px",
              }}
            >
              <div style={{ alignItems: "center", display: "flex", gap: 8, marginBottom: 4 }}>
                <span style={{ color: status.color, fontFamily: "var(--fm-mono)", fontSize: "0.66rem", letterSpacing: "0.04em" }}>{status.text}</span>
                <span style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: 3, color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.56rem", letterSpacing: "0.08em", padding: "1px 5px", textTransform: "uppercase" }}>{getSysTag(row.category)}</span>
                {hasNote && <span style={{ color: "var(--fm-brass)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem" }}>✎</span>}
                <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", marginLeft: "auto", whiteSpace: "nowrap" }}>
                  {nextD ? `next ${fmtShort(nextD)}` : ""}
                </span>
              </div>
              <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.92rem", fontWeight: 500, lineHeight: 1.35 }}>{row.item}</div>
              <div style={{ alignItems: "flex-end", display: "flex", gap: 10, justifyContent: "space-between", marginTop: 2 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-sans)", fontSize: "0.82rem", lineHeight: 1.4 }}>
                    {row.task || (isTaskless ? "No task yet — use + Add Task" : "")}
                  </div>
                  <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.04em", marginTop: 4 }}>
                    {[row.schedule, lastD ? `last ${fmtShort(lastD)}` : null].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {!isTaskless && (
                  <button
                    onClick={() => setCompletionRow({ row, key })}
                    style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: 6, color: "var(--fm-brass)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.66rem", letterSpacing: "0.08em", minHeight: 38, padding: "0 14px", textTransform: "uppercase", whiteSpace: "nowrap" }}
                  >Log it</button>
                )}
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.8rem", padding: "3rem 1rem", textAlign: "center" }}>
            No results found.
          </div>
        )}
        {modals}
      </div>
    );
  }

  return (
    <div style={{ background: "var(--fm-bg-raised)", border: "var(--fm-border)", borderRadius: "var(--fm-radius)" }}>
      <table style={{ borderCollapse: "collapse", fontSize: "0.8rem", minWidth: "900px", width: "100%" }}>
        <thead>
          <tr>
            {COLUMNS.map((col, i) => {
              const sortEntry = (sortCols || []).find(s => s.col === col.sortKey);
              const isPrimary = sortEntry && (sortCols || [])[0]?.col === col.sortKey;
              return (
                <th
                  key={i}
                  onClick={() => col.sortKey && onHeaderClick?.(col.sortKey, false)}
                  style={{
                    background: "var(--fm-bg-raised)",
                    borderBottom: "1px solid var(--fm-hairline2)",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
                    color: "var(--fm-brass-dim)",
                    cursor: col.sortKey ? "pointer" : "default",
                    fontFamily: "var(--fm-mono)",
                    fontSize: "var(--fm-tag-size)",
                    fontWeight: "normal",
                    letterSpacing: "0.12em",
                    padding: "0.6rem 0.5rem",
                    position: "sticky",
                    textAlign: "left",
                    textTransform: "uppercase",
                    top: stickyTop ?? 0,
                    userSelect: "none",
                    whiteSpace: "nowrap",
                    width: col.width,
                    zIndex: 10,
                  }}
                >
                  {col.label}
                  {sortEntry && (
                    <span style={{ color: isPrimary ? "var(--fm-brass)" : "var(--fm-ink-dim)", marginLeft: "0.25rem" }}>
                      {sortEntry.dir === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {groupedRows.map((row, idx) => {
            const isEven    = idx % 2 === 0;
            const isTaskless = row._isTaskless;
            const baseBg    = isTaskless ? "rgba(201,169,110,0.06)" : (isEven ? "var(--fm-bg-raised)" : "var(--fm-bg-panel)");
            const hoverBg   = isTaskless ? "rgba(201,169,110,0.12)" : "var(--fm-bg-panel)";
            const key       = `${row.category}|${row.item}|${row.task}`;
            const status  = computeStatus(key, nextDates, loggedRows);
            const sysTag  = getSysTag(row.category);
            const hasNote = !!(notes[key] || "").trim();

            const categoryOptions = [...new Set((allRows || []).map(r => r.category).filter(Boolean))];
            const itemOptions = [...new Set((allRows || []).filter(r => r.category === row.category).map(r => r.item).filter(Boolean))];

            return (
              <tr
                key={row._id || key}
                style={{ background: baseBg, borderBottom: "1px solid var(--fm-hairline)", boxShadow: isTaskless ? "inset 3px 0 0 var(--fm-brass)" : "none", cursor: "pointer", transition: "background 0.1s" }}
                onMouseEnter={e => e.currentTarget.style.background = hoverBg}
                onMouseLeave={e => e.currentTarget.style.background = baseBg}
                onClick={e => {
                  if (e.target.closest("button,input,select,textarea")) return;
                  if (isTaskless) return; // placeholder rows are edit-in-place, no detail modal
                  setDetailRow(row);
                }}
              >
                {/* Status dot + text */}
                <td style={{ padding: "0.45rem 0.5rem", verticalAlign: "middle", whiteSpace: "nowrap" }}>
                  <span style={{ alignItems: "center", display: "inline-flex", gap: "0.35rem" }}>
                    <span style={{ background: status.color, borderRadius: "50%", display: "inline-block", flexShrink: 0, height: "6px", width: "6px" }} />
                    <span style={{ color: status.color, fontFamily: "var(--fm-mono)", fontSize: "0.68rem", letterSpacing: "0.04em" }}>
                      {status.text}
                    </span>
                  </span>
                </td>

                {/* System tag */}
                <td style={{ padding: "0.45rem 0.5rem", verticalAlign: "middle" }}>
                  <span style={{
                    background: "var(--fm-bg-sunk)",
                    border: "1px solid var(--fm-hairline2)",
                    borderRadius: "var(--fm-radius)",
                    color: "var(--fm-ink-dim)",
                    display: "inline-block",
                    fontFamily: "var(--fm-mono)",
                    fontSize: "0.58rem",
                    letterSpacing: "0.08em",
                    padding: "0.1rem 0.35rem",
                    textTransform: "uppercase",
                  }}>
                    {sysTag}
                  </span>
                </td>

                {/* Item (grouped) */}
                <td style={{ padding: "0.45rem 0.5rem", verticalAlign: "middle" }}>
                  {row._isFirstForItem ? (
                    <ComboCell
                      value={row.item}
                      options={itemOptions}
                      placeholder="Item"
                      onChange={v => onRowEdit(row._id, "item", v)}
                      tooltip={!row._isCustom ? ITEM_TIPS[row.item] : undefined}
                    />
                  ) : (
                    <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem" }}>╰</span>
                  )}
                </td>

                {/* Task */}
                <td style={{ padding: "0.45rem 0.5rem", verticalAlign: "middle" }}>
                  <TaskCell
                    value={row.task}
                    onChange={v => onRowEdit(row._id, "task", v)}
                    tooltip={!row._isCustom ? TASK_TIPS[`${row.category}|${row.item}|${row.task}`] : undefined}
                  />
                </td>

                {/* Schedule */}
                <td style={{ padding: "0.45rem 0.5rem", verticalAlign: "middle" }}>
                  <SchedulePicker value={row.schedule || null} onChange={v => onRowEdit(row._id, "schedule", v)} />
                </td>

                {/* Season */}
                <td style={{ padding: "0.45rem 0.5rem", verticalAlign: "middle" }}>
                  <SelectCell value={row.season ?? null} options={SEASON_OPTIONS} placeholder="—" onChange={v => onRowEdit(row._id, "season", v)} />
                </td>

                {/* Last completed */}
                <td style={{ padding: "0.45rem 0.5rem", verticalAlign: "middle" }}>
                  <DateCell date={completedDates[key] ?? null} onChange={date => onDateChange(key, date)} />
                </td>

                {/* Next due */}
                <td style={{ padding: "0.45rem 0.5rem", verticalAlign: "middle" }}>
                  <DateCell date={nextDates[key] ?? null} onChange={date => onNextDateChange(key, date)} />
                </td>

                {/* Follow schedule */}
                <td style={{ padding: "0.45rem 0.25rem", textAlign: "center", verticalAlign: "middle" }}>
                  <FollowButton schedule={row.schedule} checked={followSchedule[key] ?? false} onToggle={() => onToggleFollow(key, row.schedule)} />
                </td>

                {/* Notes icon */}
                <td style={{ padding: "0.45rem 0.25rem", textAlign: "center", verticalAlign: "middle" }}>
                  <NoteIconButton hasNote={hasNote} onClick={() => setDetailRow(row)} />
                </td>

                {/* Reminder */}
                <td style={{ padding: "0.45rem 0.25rem", textAlign: "center", verticalAlign: "middle" }}>
                  <ReminderButton schedule={row.schedule} mode={reminderModes?.[key] ?? "off"} onCycle={() => onCycleReminderMode?.(key)} />
                </td>

                {/* Log it */}
                <td style={{ padding: "0.45rem 0.5rem", verticalAlign: "middle" }}>
                  <button
                    onClick={() => setCompletionRow({ row, key })}
                    style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "var(--fm-radius)", color: "var(--fm-brass-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.08em", padding: "0.2rem 0.45rem", textTransform: "uppercase", transition: "all 0.12s", whiteSpace: "nowrap" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; e.currentTarget.style.color = "var(--fm-brass-dim)"; }}
                  >Log it</button>
                </td>

                {/* Delete */}
                <td style={{ padding: "0.45rem 0.3rem", textAlign: "center", verticalAlign: "middle" }}>
                  <button
                    onClick={() => setConfirmRow(row)}
                    title="Delete row"
                    style={{ background: "none", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", fontSize: "0.85rem", lineHeight: 1, padding: "0.1rem 0.25rem", transition: "color 0.12s" }}
                    onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                    onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-mute)"}
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {rows.length === 0 && (
        <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.8rem", padding: "3rem", textAlign: "center" }}>
          No results found.
        </div>
      )}

      {modals}
    </div>
  );
}

// ─── Delete confirm modal ─────────────────────────────────────────────────────

function DeleteConfirmModal({ row, onConfirm, onCancel }) {
  const isCustom = row._isCustom;
  const isMobile = useIsMobile();
  return (
    <div onClick={onCancel} style={{ alignItems: "center", background: "rgba(0,0,0,0.6)", bottom: 0, display: "flex", justifyContent: "center", left: 0, position: "fixed", right: 0, top: 0, zIndex: 1000, ...(isMobile ? sheetOverlay : null) }}>
      <div onClick={e => e.stopPropagation()} className={isMobile ? "fm-sheet-panel" : undefined} style={{ background: "var(--fm-bg-panel)", border: "var(--fm-border)", borderRadius: "var(--fm-radius-lg)", maxWidth: "420px", padding: "1.75rem 2rem", width: "90%", ...(isMobile ? sheetPanel : null) }}>
        <div style={{ color: "var(--fm-red)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.15em", marginBottom: "0.75rem", textTransform: "uppercase" }}>
          {isCustom ? "Permanently Delete Task" : "Remove from Schedule"}
        </div>
        <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-sans)", fontSize: "0.82rem", lineHeight: 1.6, margin: "0 0 0.5rem" }}>
          <strong style={{ color: "var(--fm-ink)" }}>{row.task}</strong>
        </p>
        <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-sans)", fontSize: "0.78rem", lineHeight: 1.6, margin: "0 0 1.5rem" }}>
          {isCustom
            ? "This will permanently delete this task. This cannot be undone."
            : "This will remove this task from your maintenance schedule. You can restore it anytime from the Guide page."}
        </p>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ background: "transparent", border: "var(--fm-border-2)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.4rem 1rem", transition: "all 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
          >Cancel</button>
          <button onClick={onConfirm} style={{ background: "rgba(224,123,106,0.10)", border: "1px solid var(--fm-red)", borderRadius: "var(--fm-radius)", color: "var(--fm-red)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.4rem 1rem", transition: "all 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(224,123,106,0.20)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(224,123,106,0.10)"}
          >{isCustom ? "Delete" : "Remove"}</button>
        </div>
      </div>
    </div>
  );
}
