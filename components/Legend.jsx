const FREQ_ITEMS = [
  { label: "Weekly / Monthly",   color: "#4ade80" },
  { label: "Every 3–6 months",   color: "#4ade80" },
  { label: "Twice a year",       color: "#60a5fa" },
  { label: "Annually",           color: "#f59e0b" },
  { label: "Every 2–10 years",   color: "#c084fc" },
  { label: "As needed",          color: "#a8a29c" },
];

const labelStyle = {
  color: "#a8a29c",
  fontFamily: "monospace",
  fontSize: "0.68rem",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  marginRight: "0.25rem",
};

export default function Legend({ activeColors, onToggle }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: "1.25rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center" }}>
        <span style={labelStyle}>Frequency:</span>
        {FREQ_ITEMS.map(({ label, color }) => {
          const active = activeColors.has(color);
          return (
            <div
              key={label}
              onClick={() => onToggle(color)}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#1a1f2e"; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
              style={{
                alignItems: "center",
                background: active ? `${color}18` : "transparent",
                border: `1px solid ${active ? `${color}40` : "transparent"}`,
                borderRadius: "3px",
                cursor: "pointer",
                display: "flex",
                gap: "0.35rem",
                padding: "0.2rem 0.5rem",
                transition: "background 0.15s, border-color 0.15s",
              }}
            >
              <div style={{ background: color, borderRadius: "50%", flexShrink: 0, height: 8, width: 8 }} />
              <span style={{ color: active ? color : "#6a6070", fontFamily: "monospace", fontSize: "0.68rem", transition: "color 0.15s" }}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
