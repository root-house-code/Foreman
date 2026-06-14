import { useState } from "react";

/**
 * A single-select filter rendered as a dropdown, mirroring the header nav's
 * NavGroup UI/UX (trigger + rotating chevron, hover/click to open, a floating
 * menu of options with hover-highlighted rows). Replaces rows of FilterPills.
 *
 *   options:      [{ value, label, color? }]
 *   value:        the currently selected value
 *   onChange:     (value) => void
 *   defaultValue: value treated as "no filter" (trigger stays un-highlighted);
 *                 falls back to the first option.
 */
export function FilterDropdown({ value, options = [], onChange, color, defaultValue, minWidth = 150 }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value) || options[0];
  const baseValue = defaultValue !== undefined ? defaultValue : options[0]?.value;
  const selColor = selected?.color || color || "var(--fm-brass)";
  const active = open || (selected && selected.value !== baseValue);

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          alignItems: "center",
          background: active ? "var(--fm-brass-bg)" : "transparent",
          border: `1px solid ${active ? selColor : "var(--fm-hairline2)"}`,
          borderRadius: "var(--fm-radius)",
          color: active ? selColor : "var(--fm-ink-dim)",
          cursor: "pointer",
          display: "inline-flex",
          fontFamily: "var(--fm-mono)",
          fontSize: "0.65rem",
          gap: 5,
          letterSpacing: "0.08em",
          padding: "0.22rem 0.55rem",
          textTransform: "uppercase",
          transition: "all 0.12s",
          whiteSpace: "nowrap",
        }}
      >
        {selected ? selected.label : ""}
        <span style={{ fontSize: 8, opacity: 0.7, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.12s" }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            background: "var(--fm-bg-raised)",
            border: "1px solid var(--fm-hairline2)",
            borderRadius: 4,
            boxShadow: "0 8px 24px #00000055",
            display: "flex",
            flexDirection: "column",
            gap: 1,
            left: 0,
            marginTop: 2,
            maxHeight: 320,
            minWidth,
            overflowY: "auto",
            padding: 4,
            position: "absolute",
            top: "100%",
            zIndex: 60,
          }}
        >
          {options.map(opt => {
            const isActive = opt.value === value;
            const optColor = opt.color || "var(--fm-brass)";
            return (
              <button
                key={String(opt.value)}
                onClick={() => { setOpen(false); onChange(opt.value); }}
                style={{
                  background: isActive ? "var(--fm-brass-bg)" : "transparent",
                  border: "none",
                  borderRadius: 3,
                  color: isActive ? optColor : "var(--fm-ink-dim)",
                  cursor: "pointer",
                  fontFamily: "var(--fm-mono)",
                  fontSize: "0.65rem",
                  letterSpacing: "0.08em",
                  padding: "6px 10px",
                  textAlign: "left",
                  textTransform: "uppercase",
                  transition: "color 0.12s, background 0.12s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.color = "var(--fm-ink)"; e.currentTarget.style.background = "var(--fm-bg-panel)"; } }}
                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.color = "var(--fm-ink-dim)"; e.currentTarget.style.background = "transparent"; } }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function FilterPill({ active, color, onClick, children }) {
  const c = color || "var(--fm-brass)";
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "var(--fm-brass-bg)" : "transparent",
        border: `1px solid ${active ? c : "var(--fm-hairline2)"}`,
        borderRadius: "var(--fm-radius)",
        color: active ? c : "var(--fm-ink-dim)",
        cursor: "pointer",
        fontFamily: "var(--fm-mono)",
        fontSize: "0.65rem",
        letterSpacing: "0.08em",
        padding: "0.22rem 0.55rem",
        textTransform: "uppercase",
        transition: "all 0.12s",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = c; e.currentTarget.style.color = c; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; } }}
    >{children}</button>
  );
}

export function FilterRow({ label, children, hidden, labelWidth }) {
  if (hidden) return null;
  return (
    <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
      <span style={{
        color: "var(--fm-brass-dim)",
        fontFamily: "var(--fm-mono)",
        fontSize: "0.58rem",
        letterSpacing: "0.14em",
        minWidth: labelWidth || "68px",
        textTransform: "uppercase",
      }}>{label}</span>
      {children}
    </div>
  );
}
