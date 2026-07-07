import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import useIsMobile from "../src/hooks/useIsMobile.js";
import { sheetOverlay, sheetPanel } from "./ModalShared.jsx";

const fieldLabel = {
  color: "var(--fm-brass-dim)",
  display: "block",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.6rem",
  letterSpacing: "0.12em",
  marginBottom: "0.3rem",
  textTransform: "uppercase",
};

const fieldInput = {
  background: "var(--fm-bg-sunk)",
  border: "var(--fm-border-2)",
  borderRadius: "var(--fm-radius)",
  boxSizing: "border-box",
  color: "var(--fm-ink)",
  fontFamily: "var(--fm-sans)",
  fontSize: "0.78rem",
  outline: "none",
  padding: "0.35rem 0.5rem",
  transition: "border-color 0.12s",
  width: "100%",
};

const fieldSelect = { ...fieldInput, cursor: "pointer" };

// presetWork = { kind: "project" | "todo", id, name } — pre-fills and hides the linkedWork selector.
export default function ExpenseModal({ expense, presetWork, itemOptions = [], onSave, onClose }) {
  const isMobile = useIsMobile();
  const [form, setForm] = useState({
    date: expense?.date || new Date().toISOString().slice(0, 10),
    amount: expense?.amount != null ? String(expense.amount) : "",
    label: expense?.label || "",
    linkedItem: expense?.linkedItem || "",
  });

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }));

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleSave() {
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt <= 0 || !form.date) return;
    const linkedWork = presetWork ? { kind: presetWork.kind, id: presetWork.id } : null;
    onSave({
      date: form.date,
      amount: amt,
      label: form.label.trim(),
      linkedItem: form.linkedItem || null,
      linkedWork,
    });
  }

  const canSave = form.date && parseFloat(form.amount) > 0;

  return createPortal(
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        alignItems: "center", background: "rgba(0,0,0,0.65)", bottom: 0,
        display: "flex", justifyContent: "center", left: 0,
        position: "fixed", right: 0, top: 0, zIndex: 1100,
        ...(isMobile ? sheetOverlay : null),
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={isMobile ? "fm-sheet-panel" : undefined}
        style={{
          background: "var(--fm-bg-panel)", border: "var(--fm-border)",
          borderRadius: "var(--fm-radius-lg)", maxWidth: 480,
          padding: "1.75rem 2rem", width: "90%",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          ...(isMobile ? sheetPanel : null),
        }}
      >
        {/* Header */}
        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: "1.25rem" }}>
          <div style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.15em", textTransform: "uppercase" }}>
            {expense ? "Edit Expense" : "Log Expense"}
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "1rem", lineHeight: 1, padding: "0 0.1rem", transition: "color 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-ink)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-ink-mute)"; }}
          >×</button>
        </div>

        {/* Preset work badge */}
        {presetWork && (
          <div style={{ background: "var(--fm-brass-bg)", border: "1px solid rgba(201,169,110,0.3)", borderRadius: "var(--fm-radius)", color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", marginBottom: "1.25rem", padding: "0.3rem 0.6rem", textTransform: "uppercase" }}>
            {presetWork.kind === "project" ? "Project" : "To Do"}: {presetWork.name}
          </div>
        )}

        {/* Date + Amount row */}
        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.85rem" }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Date</label>
            <input
              type="date"
              value={form.date}
              onChange={e => set("date", e.target.value)}
              style={fieldInput}
              onFocus={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = ""; }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Amount ($)</label>
            <input
              autoFocus
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={e => set("amount", e.target.value)}
              style={fieldInput}
              onFocus={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = ""; }}
            />
          </div>
        </div>

        {/* Description */}
        <div style={{ marginBottom: "0.85rem" }}>
          <label style={fieldLabel}>Description</label>
          <input
            type="text"
            placeholder="What was this for?"
            value={form.label}
            onChange={e => set("label", e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && canSave) handleSave(); }}
            style={fieldInput}
            onFocus={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; }}
            onBlur={e => { e.currentTarget.style.borderColor = ""; }}
          />
        </div>

        {/* Linked item */}
        {itemOptions.length > 0 && (
          <div style={{ marginBottom: "1.25rem" }}>
            <label style={fieldLabel}>Link Item (optional)</label>
            <select
              value={form.linkedItem}
              onChange={e => set("linkedItem", e.target.value)}
              style={fieldSelect}
            >
              <option value="">— None —</option>
              {itemOptions.map(o => (
                <option key={o.stableKey} value={o.stableKey}>{o.category} · {o.item}</option>
              ))}
            </select>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "var(--fm-border-2)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 0.9rem", transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = ""; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
          >Cancel</button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{
              background: canSave ? "var(--fm-brass-bg)" : "transparent",
              border: `1px solid ${canSave ? "rgba(201,169,110,0.4)" : "var(--fm-hairline2)"}`,
              borderRadius: "var(--fm-radius)",
              color: canSave ? "var(--fm-brass)" : "var(--fm-ink-mute)",
              cursor: canSave ? "pointer" : "default",
              fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em",
              padding: "0.4rem 0.9rem", transition: "all 0.15s",
            }}
            onMouseEnter={e => { if (canSave) { e.currentTarget.style.background = "rgba(201,169,110,0.2)"; e.currentTarget.style.borderColor = "var(--fm-brass)"; } }}
            onMouseLeave={e => { if (canSave) { e.currentTarget.style.background = "var(--fm-brass-bg)"; e.currentTarget.style.borderColor = "rgba(201,169,110,0.4)"; } }}
          >Save Expense</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
