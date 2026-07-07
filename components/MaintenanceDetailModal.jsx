import { createPortal } from "react-dom";
import useIsMobile from "../src/hooks/useIsMobile.js";
import { sheetOverlay, sheetPanel } from "./ModalShared.jsx";

function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function MaintenanceDetailModal({
  row,
  note,
  onNoteChange,
  completedDate,
  nextDate,
  onLogIt,
  onClose,
}) {
  const isMobile = useIsMobile();
  const meta = [
    row.schedule  && ["Schedule",   row.schedule],
    row.season    && ["Season",     row.season.charAt(0).toUpperCase() + row.season.slice(1)],
    completedDate && ["Last done",  fmtDate(completedDate)],
    nextDate      && ["Next due",   fmtDate(nextDate)],
  ].filter(Boolean);

  return createPortal(
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        alignItems: "center",
        background: "rgba(0,0,0,0.7)",
        bottom: 0,
        display: "flex",
        justifyContent: "center",
        left: 0,
        position: "fixed",
        right: 0,
        top: 0,
        zIndex: 1100,
        ...(isMobile ? sheetOverlay : null),
      }}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        className={isMobile ? "fm-sheet-panel" : undefined}
        style={{
          background: "#0f1117",
          border: "1px solid #a8a29c",
          borderRadius: "6px",
          display: "flex",
          flexDirection: "column",
          maxWidth: "460px",
          padding: "1.75rem 2rem",
          width: "90%",
          ...(isMobile ? sheetPanel : null),
        }}
      >
        {/* Breadcrumb + close */}
        <div style={{ alignItems: "flex-start", display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
          <div>
            <div style={{ color: "#8b7d6b", fontFamily: "monospace", fontSize: "0.6rem", letterSpacing: "0.15em", marginBottom: "0.3rem", textTransform: "uppercase" }}>
              Maintenance · {row.category}
            </div>
            <div style={{ color: "#f0e6d3", fontFamily: "'Georgia','Times New Roman',serif", fontSize: "1.1rem", marginBottom: "0.2rem" }}>
              {row.item}
            </div>
            <div style={{ color: "#a8a29c", fontFamily: "monospace", fontSize: "0.78rem" }}>
              {row.task}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#a8a29c",
              cursor: "pointer",
              fontSize: "1.2rem",
              lineHeight: 1,
              marginLeft: "1rem",
              padding: "0.1rem 0.3rem",
              transition: "color 0.12s",
            }}
            onMouseEnter={e => e.currentTarget.style.color = "#e8e4dd"}
            onMouseLeave={e => e.currentTarget.style.color = "#a8a29c"}
          >×</button>
        </div>

        {/* Meta fields */}
        {meta.length > 0 && (
          <div style={{ borderTop: "1px solid #1e2330", display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "1.25rem", paddingTop: "1rem" }}>
            {meta.map(([label, value]) => (
              <div key={label} style={{ display: "flex", gap: "0.75rem" }}>
                <span style={{ color: "#a8a29c", fontFamily: "monospace", fontSize: "0.6rem", letterSpacing: "0.1em", minWidth: "5.5rem", paddingTop: "0.2rem", textTransform: "uppercase" }}>
                  {label}
                </span>
                <span style={{ color: "#e8e4dd", fontFamily: "monospace", fontSize: "0.72rem" }}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Notes */}
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={{ color: "#8b7d6b", display: "block", fontFamily: "monospace", fontSize: "0.6rem", letterSpacing: "0.14em", marginBottom: "0.5rem", textTransform: "uppercase" }}>
            Notes
          </label>
          <textarea
            value={note}
            onChange={e => onNoteChange(e.target.value)}
            placeholder="Add notes about this task…"
            rows={4}
            style={{
              background: "#0a0c11",
              border: "1px solid #2b3140",
              borderRadius: "3px",
              boxSizing: "border-box",
              color: "#e8e4dd",
              fontFamily: "monospace",
              fontSize: "0.8rem",
              lineHeight: 1.6,
              outline: "none",
              padding: "0.6rem 0.75rem",
              resize: "vertical",
              transition: "border-color 0.12s",
              width: "100%",
            }}
            onFocus={e => e.currentTarget.style.borderColor = "#c9a96e"}
            onBlur={e => e.currentTarget.style.borderColor = "#2b3140"}
          />
        </div>

        {/* Footer */}
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "1px solid #a8a29c", borderRadius: "3px", color: "#a8a29c", cursor: "pointer", fontFamily: "monospace", fontSize: "0.78rem", padding: "0.45rem 1rem", transition: "all 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.color = "#8b7d6b"}
            onMouseLeave={e => e.currentTarget.style.color = "#a8a29c"}
          >Close</button>
          {onLogIt && (
            <button
              onClick={() => { onClose(); onLogIt(); }}
              style={{ background: "#4ade8022", border: "1px solid #4ade80", borderRadius: "3px", color: "#4ade80", cursor: "pointer", fontFamily: "monospace", fontSize: "0.78rem", padding: "0.45rem 1.25rem", transition: "all 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background = "#4ade8033"}
              onMouseLeave={e => e.currentTarget.style.background = "#4ade8022"}
            >Log Completion</button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
