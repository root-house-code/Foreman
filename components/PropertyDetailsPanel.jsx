import Tooltip from "./Tooltip.jsx";

// Property-level summary shown in the floor plan's right sidebar when no zone
// is selected. Purely presentational — the caller computes beds/baths and the
// attribute rows, so this panel stays an extensible seam for future property
// attributes (year built, lot size, address, …): just append to `attributes`.
// Each attribute may carry an optional `tip` for an explanatory hover tooltip.

const labelStyle = {
  color: "var(--fm-ink-dim)",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.54rem",
  letterSpacing: "0.1em",
  marginBottom: "0.2rem",
  textTransform: "uppercase",
};

const heroValueStyle = {
  color: "var(--fm-ink)",
  fontFamily: "var(--fm-serif)",
  fontSize: "1.75rem",
  fontWeight: 400,
  lineHeight: 1,
};

export default function PropertyDetailsPanel({ beds, baths, attributes = [] }) {
  return (
    <div>
      {/* Header */}
      <div style={{ padding: "0.7rem 1rem 0.4rem" }}>
        <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Property Details
        </span>
      </div>
      <div style={{ borderBottom: "1px solid var(--fm-hairline)" }} />

      {/* Beds / Baths hero */}
      <div style={{ display: "flex" }}>
        {[
          { label: "Beds", value: beds },
          { label: "Baths", value: baths },
        ].map(({ label, value }, i) => (
          <div key={label} style={{ borderRight: i < 1 ? "1px solid var(--fm-hairline)" : "none", flex: 1, padding: "0.75rem 1rem" }}>
            <div style={labelStyle}>{label}</div>
            <div style={heroValueStyle}>{value}</div>
          </div>
        ))}
      </div>
      <div style={{ borderBottom: "1px solid var(--fm-hairline)" }} />

      {/* Attribute rows */}
      {attributes.length > 0 && (
        <div style={{ padding: "0.35rem 0" }}>
          {attributes.map(({ label, value, tip }) => (
            <div key={label} style={{ alignItems: "baseline", display: "flex", justifyContent: "space-between", gap: "0.75rem", padding: "0.3rem 1rem" }}>
              <Tooltip text={tip}>
                <span style={{ color: "var(--fm-ink-dim)", cursor: tip ? "help" : "default", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</span>
              </Tooltip>
              <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.78rem", textAlign: "right" }}>{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
