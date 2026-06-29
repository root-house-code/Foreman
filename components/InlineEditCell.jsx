import { useState } from "react";

// A table cell that turns into an editor on double-click. Used by every history
// tab so the editing affordance is identical everywhere: double-click a value,
// type / pick / toggle, then Enter or blur to commit (Escape cancels).
//
// The component is deliberately domain-agnostic — it hands the raw input value
// back through `onCommit(raw)` and lets the page coerce + persist it. Pass a
// formatted `display` for how the value reads when idle, and `editValue` for the
// string the editor should seed with when it differs from `display` (e.g. an
// ISO date shown as "Jun 28, 2026" but edited as "2026-06-28").
//
// type: "text" | "number" | "date" | "month" | "select" | "boolean"
export default function InlineEditCell({
  value,
  editValue,
  display,
  type = "text",
  options,
  onCommit,
  editable = true,
  placeholder = "—",
  style,
  inputStyle,
  step,
  min,
  title,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const isEmpty = value === "" || value == null || (Array.isArray(value) && value.length === 0);
  const shown = display != null ? display : (isEmpty ? placeholder : value);

  if (!editable) return <td style={style}>{shown}</td>;

  // Booleans have no editor — a double-click just flips them.
  if (type === "boolean") {
    return (
      <td
        style={{ ...style, cursor: "pointer", userSelect: "none" }}
        title={title || "Double-click to toggle"}
        onDoubleClick={() => onCommit(!value)}
      >
        {shown}
      </td>
    );
  }

  const seed = editValue != null ? editValue : (value ?? "");

  function begin() {
    setDraft(String(seed ?? ""));
    setEditing(true);
  }
  function commit() {
    setEditing(false);
    if (String(draft) !== String(seed ?? "")) onCommit(draft);
  }
  function cancel() {
    setEditing(false);
  }

  if (!editing) {
    return (
      <td style={{ ...style, cursor: "pointer" }} title={title || "Double-click to edit"} onDoubleClick={begin}>
        {shown}
      </td>
    );
  }

  const baseInput = {
    background: "var(--fm-bg-sunk)",
    border: "1px solid var(--fm-brass)",
    borderRadius: "var(--fm-radius)",
    boxSizing: "border-box",
    color: "var(--fm-ink)",
    fontFamily: "var(--fm-mono)",
    fontSize: "0.72rem",
    outline: "none",
    padding: "0.2rem 0.35rem",
    width: "100%",
    ...inputStyle,
  };

  if (type === "select") {
    return (
      <td style={style}>
        <select
          autoFocus
          value={draft}
          style={{ ...baseInput, appearance: "none", cursor: "pointer" }}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
        >
          {(options || []).map(o => <option key={String(o.value)} value={o.value ?? ""}>{o.label}</option>)}
        </select>
      </td>
    );
  }

  const inputType = type === "number" ? "number"
    : type === "date" ? "date"
    : type === "month" ? "month"
    : "text";

  return (
    <td style={style}>
      <input
        autoFocus
        type={inputType}
        value={draft}
        step={step}
        min={min}
        style={baseInput}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") cancel();
        }}
      />
    </td>
  );
}

// ── Shared value helpers ──────────────────────────────────────────────────────

// ISO timestamp or Date → "YYYY-MM-DD" for a <input type="date"> seed.
export function toDateInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d)) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// "YYYY-MM-DD" from a date input → ISO timestamp anchored at local noon, so the
// calendar day can't drift across timezones when re-read.
export function dateInputToISO(str) {
  if (!str) return "";
  const d = new Date(`${str}T12:00:00`);
  if (isNaN(d)) return "";
  return d.toISOString();
}
