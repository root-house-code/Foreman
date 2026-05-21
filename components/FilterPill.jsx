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
