import { useState, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, Legend,
} from "recharts";
import { DATA_SOURCES, DATE_RANGE_PRESETS, getSourceFields, runQuery } from "../lib/dashboardQuery.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const CHART_TYPES = [
  { id: "bar-v",   label: "Bar",        icon: "▐▐▐▌", desc: "Category comparisons" },
  { id: "bar-h",   label: "Bar (H)",    icon: "━━━━",  desc: "Long category labels" },
  { id: "line",    label: "Line",       icon: "╱╲╱╲", desc: "Trends over time" },
  { id: "area",    label: "Area",       icon: "▄▄▄▄", desc: "Volume emphasis" },
  { id: "pie",     label: "Pie",        icon: "◍",     desc: "Part-to-whole" },
  { id: "donut",   label: "Donut",      icon: "◎",     desc: "Part-to-whole (modern)" },
  { id: "table",   label: "Table",      icon: "▤",     desc: "Raw grouped data" },
];

const COLORS = ["var(--fm-brass)", "var(--fm-cyan)", "var(--fm-green)", "var(--fm-amber)", "var(--fm-red)", "var(--fm-ink-dim)"];
const COLORS_HEX = ["#c9a96e", "#5fb6c5", "#7fb087", "#e0b266", "#e07b6a", "#6b6560"];

const FILTER_OPS = [
  { id: "eq",       label: "equals" },
  { id: "neq",      label: "not equals" },
  { id: "contains", label: "contains" },
  { id: "gt",       label: "greater than" },
  { id: "lt",       label: "less than" },
];

const STEPS = ["Chart Type", "Data Source", "Group By", "Measure", "Filters", "Date Range", "Preview", "Name & Save"];

// ── Styles ────────────────────────────────────────────────────────────────────

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
  width: "100%",
};

const selectStyle = { ...inputStyle, cursor: "pointer" };

const cardStyle = (active) => ({
  background: active ? "var(--fm-brass-bg)" : "var(--fm-bg-sunk)",
  border: `1px solid ${active ? "var(--fm-brass)" : "var(--fm-hairline)"}`,
  borderRadius: "var(--fm-radius-lg)",
  color: active ? "var(--fm-brass)" : "var(--fm-ink-dim)",
  cursor: "pointer",
  padding: "0.65rem 0.85rem",
  transition: "all 0.12s",
});

const btnPrimary = {
  background: "var(--fm-brass-bg)",
  border: "1px solid var(--fm-brass)",
  borderRadius: "var(--fm-radius)",
  color: "var(--fm-brass)",
  cursor: "pointer",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.72rem",
  padding: "0.4rem 1.25rem",
  transition: "background 0.12s",
};

const btnSecondary = {
  background: "transparent",
  border: "1px solid var(--fm-hairline2)",
  borderRadius: "var(--fm-radius)",
  color: "var(--fm-ink-dim)",
  cursor: "pointer",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.72rem",
  padding: "0.4rem 1rem",
  transition: "all 0.12s",
};

// ── Data-label helpers ──────────────────────────────────────────────────────
// Keep value labels short so they don't overflow small panels.
export const fmtLabelValue = (v) => (typeof v === "number" ? (v % 1 === 0 ? v : Number(v.toFixed(1))) : v);

// Pie/donut value label, drawn at the slice centroid so it never overflows.
export function renderPieValueLabel({ cx, cy, midAngle, innerRadius, outerRadius, value }) {
  const RAD = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RAD);
  const y = cy + r * Math.sin(-midAngle * RAD);
  return (
    <text x={x} y={y} fill="var(--fm-ink)" fontFamily="var(--fm-mono)" fontSize={10} textAnchor="middle" dominantBaseline="central">
      {fmtLabelValue(value)}
    </text>
  );
}

// Shared legend styling (pie/donut category key). Kept here so the builder
// preview and the live dashboard panel render an identical legend.
export const LEGEND_PROPS = {
  verticalAlign: "bottom",
  align: "center",
  iconSize: 8,
  iconType: "circle",
  wrapperStyle: { fontFamily: "var(--fm-mono)", fontSize: "0.62rem", paddingTop: 4 },
};

// Small pill toggle used for the Display options (labels / legend).
function ToggleRow({ on, onToggle, label }) {
  return (
    <button
      onClick={onToggle}
      style={{ alignItems: "center", background: "transparent", border: "none", cursor: "pointer", display: "flex", gap: "0.6rem", marginBottom: "0.55rem", padding: 0 }}
    >
      <span style={{ alignItems: "center", background: on ? "var(--fm-brass)" : "var(--fm-bg-sunk)", border: `1px solid ${on ? "var(--fm-brass)" : "var(--fm-hairline2)"}`, borderRadius: 999, display: "flex", height: 18, justifyContent: on ? "flex-end" : "flex-start", padding: 2, transition: "all 0.12s", width: 32 }}>
        <span style={{ background: on ? "var(--fm-bg)" : "var(--fm-ink-mute)", borderRadius: "50%", height: 12, width: 12 }} />
      </span>
      <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem" }}>{label}</span>
    </button>
  );
}

// ── Chart Preview ─────────────────────────────────────────────────────────────

function ChartPreview({ chartType, data, showLabels = false, showLegend = false }) {
  if (!data || data.length === 0) {
    return <div style={{ alignItems: "center", color: "var(--fm-ink-mute)", display: "flex", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", height: "100%", justifyContent: "center" }}>No data — adjust settings</div>;
  }

  const tooltipStyle = { background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline2)", borderRadius: 3, fontFamily: "var(--fm-mono)", fontSize: "0.65rem" };

  if (chartType === "bar-v") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
          <XAxis dataKey="label" tick={{ fill: "var(--fm-ink-mute)", fontSize: 10, fontFamily: "var(--fm-mono)" }} angle={-35} textAnchor="end" interval={0} />
          <YAxis tick={{ fill: "var(--fm-ink-mute)", fontSize: 10, fontFamily: "var(--fm-mono)" }} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="value" fill="#c9a96e" fillOpacity={0.75} radius={[2, 2, 0, 0]}>
            {showLabels && <LabelList dataKey="value" position="top" fill="var(--fm-ink-dim)" fontFamily="var(--fm-mono)" fontSize={10} formatter={fmtLabelValue} />}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "bar-h") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 80, bottom: 4 }}>
          <XAxis type="number" tick={{ fill: "var(--fm-ink-mute)", fontSize: 10, fontFamily: "var(--fm-mono)" }} />
          <YAxis type="category" dataKey="label" tick={{ fill: "var(--fm-ink-dim)", fontSize: 10, fontFamily: "var(--fm-mono)" }} width={76} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="value" fill="#c9a96e" fillOpacity={0.75} radius={[0, 2, 2, 0]}>
            {showLabels && <LabelList dataKey="value" position="right" fill="var(--fm-ink-dim)" fontFamily="var(--fm-mono)" fontSize={10} formatter={fmtLabelValue} />}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "line") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
          <XAxis dataKey="label" tick={{ fill: "var(--fm-ink-mute)", fontSize: 10, fontFamily: "var(--fm-mono)" }} angle={-35} textAnchor="end" interval={0} />
          <YAxis tick={{ fill: "var(--fm-ink-mute)", fontSize: 10, fontFamily: "var(--fm-mono)" }} />
          <Tooltip contentStyle={tooltipStyle} />
          <Line dataKey="value" stroke="#c9a96e" strokeWidth={2} dot={{ r: 3, fill: "#c9a96e" }}>
            {showLabels && <LabelList dataKey="value" position="top" fill="var(--fm-ink-dim)" fontFamily="var(--fm-mono)" fontSize={10} formatter={fmtLabelValue} />}
          </Line>
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "area") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
          <XAxis dataKey="label" tick={{ fill: "var(--fm-ink-mute)", fontSize: 10, fontFamily: "var(--fm-mono)" }} angle={-35} textAnchor="end" interval={0} />
          <YAxis tick={{ fill: "var(--fm-ink-mute)", fontSize: 10, fontFamily: "var(--fm-mono)" }} />
          <Tooltip contentStyle={tooltipStyle} />
          <Area dataKey="value" stroke="#c9a96e" fill="#c9a96e" fillOpacity={0.15} strokeWidth={2}>
            {showLabels && <LabelList dataKey="value" position="top" fill="var(--fm-ink-dim)" fontFamily="var(--fm-mono)" fontSize={10} formatter={fmtLabelValue} />}
          </Area>
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "pie" || chartType === "donut") {
    const innerR = chartType === "donut" ? "55%" : "0%";
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius="70%" innerRadius={innerR} paddingAngle={2}
            label={showLabels ? renderPieValueLabel : false} labelLine={false}>
            {data.map((_, i) => <Cell key={i} fill={COLORS_HEX[i % COLORS_HEX.length]} fillOpacity={0.8} />)}
          </Pie>
          {showLegend && <Legend {...LEGEND_PROPS} />}
          <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [value, name]} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "table") {
    return (
      <div style={{ height: "100%", overflow: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              {["Label", "Value"].map(h => (
                <th key={h} style={{ borderBottom: "1px solid var(--fm-hairline2)", color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", fontWeight: 400, letterSpacing: "0.1em", padding: "0.3rem 0.5rem", textAlign: "left", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--fm-hairline)" }}>
                <td style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.7rem", padding: "0.3rem 0.5rem" }}>{row.label}</td>
                <td style={{ color: "var(--fm-brass)", fontFamily: "var(--fm-mono)", fontSize: "0.7rem", padding: "0.3rem 0.5rem", textAlign: "right" }}>{typeof row.value === "number" ? row.value.toFixed(row.value % 1 === 0 ? 0 : 2) : row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export default function VisualizationBuilderModal({ initialConfig = null, onSave, onClose }) {
  const [step, setStep] = useState(0);

  const [chartType,    setChartType]    = useState(initialConfig?.chartType   ?? "bar-v");
  const [sourceId,     setSourceId]     = useState(initialConfig?.query?.source ?? "");
  const [groupBy,      setGroupBy]      = useState(initialConfig?.query?.groupBy ?? "");
  const [measure,      setMeasure]      = useState(initialConfig?.query?.measure ?? "count");
  const [measureField, setMeasureField] = useState(initialConfig?.query?.measureField ?? "");
  const [filters,      setFilters]      = useState(initialConfig?.query?.filter ?? []);
  const [dateRange,    setDateRange]    = useState(initialConfig?.query?.dateRange ?? "last-12-months");
  const [sortBy,       setSortBy]       = useState(initialConfig?.query?.sortBy ?? "value");
  const [sortDir,      setSortDir]      = useState(initialConfig?.query?.sortDir ?? "desc");
  const [limit,        setLimit]        = useState(initialConfig?.query?.limit ?? 10);
  // New charts default to labels/legend on; editing a pre-existing panel keeps
  // its current look (legacy panels with no flag render without them).
  const [showLabels,   setShowLabels]   = useState(initialConfig ? (initialConfig.showLabels ?? false) : true);
  const [showLegend,   setShowLegend]   = useState(initialConfig ? (initialConfig.showLegend ?? false) : true);
  const [panelTitle,   setPanelTitle]   = useState(initialConfig?.title ?? "");

  const sourceFields = useMemo(() => getSourceFields(sourceId), [sourceId]);
  const numericFields = useMemo(() => sourceFields.filter(f => f.type === "number"), [sourceFields]);

  const queryConfig = useMemo(() => ({
    source: sourceId, measure, measureField, groupBy,
    filter: filters, dateRange, sortBy, sortDir, limit,
  }), [sourceId, measure, measureField, groupBy, filters, dateRange, sortBy, sortDir, limit]);

  const previewData = useMemo(() => {
    if (!sourceId || !groupBy) return [];
    try { return runQuery(queryConfig); }
    catch { return []; }
  }, [queryConfig]);

  // ── Validation ───────────────────────────────────────────────────────────────

  function canProceed() {
    if (step === 0) return !!chartType;
    if (step === 1) return !!sourceId;
    if (step === 2) return !!groupBy;
    if (step === 3) return measure === "count" || !!measureField;
    return true;
  }

  // The chart is complete enough to save from any step: a renderable query plus
  // a title. Lets users (especially when editing) flip a toggle and save without
  // clicking through every remaining step.
  function canSave() {
    return !!sourceId && !!groupBy && (measure === "count" || !!measureField) && !!panelTitle.trim();
  }

  // ── Filter helpers ────────────────────────────────────────────────────────────

  function addFilter() {
    setFilters(fs => [...fs, { field: sourceFields[0]?.field ?? "", op: "eq", value: "" }]);
  }
  function updateFilter(i, patch) {
    setFilters(fs => fs.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  }
  function removeFilter(i) {
    setFilters(fs => fs.filter((_, idx) => idx !== i));
  }

  // ── Save ──────────────────────────────────────────────────────────────────────

  function handleSave() {
    onSave({
      title:     panelTitle.trim() || "Custom Chart",
      chartType,
      showLabels,
      showLegend,
      query:     queryConfig,
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const labelStyle = { color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", marginBottom: "0.35rem", textTransform: "uppercase" };

  return (
    <div
      style={{ alignItems: "center", background: "rgba(0,0,0,0.75)", bottom: 0, display: "flex", justifyContent: "center", left: 0, position: "fixed", right: 0, top: 0, zIndex: 400 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "var(--fm-bg)", border: "1px solid var(--fm-hairline2)", borderRadius: 8, display: "flex", flexDirection: "column", height: "85vh", maxWidth: 820, overflow: "hidden", width: "92%" }}>

        {/* Header */}
        <div style={{ alignItems: "center", borderBottom: "1px solid var(--fm-hairline)", display: "flex", flexShrink: 0, justifyContent: "space-between", padding: "1rem 1.5rem" }}>
          <div style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>
            {initialConfig ? "Edit Visualization" : "New Visualization"} — {STEPS[step]}
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: 0 }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-mute)"}
          >✕</button>
        </div>

        {/* Step indicator */}
        <div style={{ alignItems: "center", borderBottom: "1px solid var(--fm-hairline)", display: "flex", flexShrink: 0, gap: 0, overflowX: "auto", padding: "0.5rem 1.5rem" }}>
          {STEPS.map((s, i) => (
            <button
              key={i}
              onClick={() => i < step ? setStep(i) : null}
              style={{ alignItems: "center", background: "transparent", border: "none", color: i === step ? "var(--fm-brass)" : i < step ? "var(--fm-ink-dim)" : "var(--fm-hairline2)", cursor: i < step ? "pointer" : "default", display: "flex", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", gap: "0.3rem", letterSpacing: "0.06em", padding: "0.2rem 0.5rem", whiteSpace: "nowrap" }}
            >
              <span style={{ alignItems: "center", background: i === step ? "var(--fm-brass)" : i < step ? "var(--fm-ink-dim)" : "var(--fm-hairline2)", borderRadius: "50%", color: i <= step ? "var(--fm-bg)" : "var(--fm-bg)", display: "flex", fontSize: "0.55rem", height: "16px", justifyContent: "center", width: "16px" }}>
                {i < step ? "✓" : i + 1}
              </span>
              {s}
              {i < STEPS.length - 1 && <span style={{ color: "var(--fm-hairline)", marginLeft: "0.35rem" }}>›</span>}
            </button>
          ))}
        </div>

        {/* Body (left: form, right: live preview) */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

          {/* Left: Step form */}
          <div style={{ borderRight: "1px solid var(--fm-hairline)", display: "flex", flexDirection: "column", overflowY: "auto", padding: "1.5rem", width: "55%" }}>

            {/* Step 0: Chart type */}
            {step === 0 && (
              <div>
                <div style={labelStyle}>Select chart type</div>
                <div style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "1fr 1fr" }}>
                  {CHART_TYPES.map(ct => (
                    <button key={ct.id} onClick={() => setChartType(ct.id)} style={cardStyle(chartType === ct.id)}>
                      <div style={{ fontSize: "1.1rem", marginBottom: "0.2rem" }}>{ct.icon}</div>
                      <div style={{ fontSize: "0.72rem", fontFamily: "var(--fm-serif)", marginBottom: "0.1rem" }}>{ct.label}</div>
                      <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem" }}>{ct.desc}</div>
                    </button>
                  ))}
                </div>

                {chartType !== "table" && (
                  <div style={{ borderTop: "1px solid var(--fm-hairline)", marginTop: "1.25rem", paddingTop: "1rem" }}>
                    <div style={labelStyle}>Display</div>
                    <ToggleRow on={showLabels} onToggle={() => setShowLabels(v => !v)} label="Show value labels on the chart" />
                    {(chartType === "pie" || chartType === "donut") && (
                      <ToggleRow on={showLegend} onToggle={() => setShowLegend(v => !v)} label="Show legend (category key)" />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 1: Data source */}
            {step === 1 && (
              <div>
                <div style={labelStyle}>Select data source</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                  {Object.entries(DATA_SOURCES).map(([id, def]) => (
                    <button key={id} onClick={() => { setSourceId(id); setGroupBy(""); setMeasureField(""); setFilters([]); }} style={cardStyle(sourceId === id)}>
                      <div style={{ fontSize: "0.78rem", fontFamily: "var(--fm-serif)", marginBottom: "0.15rem" }}>{def.label}</div>
                      <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem" }}>{def.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Group by */}
            {step === 2 && (
              <div>
                <div style={labelStyle}>Group results by</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  {sourceFields.map(f => (
                    <button key={f.field} onClick={() => setGroupBy(f.field)} style={cardStyle(groupBy === f.field)}>
                      <div style={{ fontFamily: "var(--fm-mono)", fontSize: "0.72rem" }}>{f.label}</div>
                      <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem" }}>{f.field}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: Measure */}
            {step === 3 && (
              <div>
                <div style={labelStyle}>Measure</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginBottom: "1rem" }}>
                  {[["count", "Count", "Number of records in each group"],
                    ["sum", "Sum", "Sum of a numeric field"],
                    ["avg", "Average", "Average of a numeric field"]].map(([id, name, desc]) => (
                    <button key={id} onClick={() => setMeasure(id)} style={cardStyle(measure === id)}>
                      <div style={{ fontFamily: "var(--fm-serif)", fontSize: "0.78rem", marginBottom: "0.1rem" }}>{name}</div>
                      <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem" }}>{desc}</div>
                    </button>
                  ))}
                </div>

                {(measure === "sum" || measure === "avg") && (
                  <div>
                    <div style={labelStyle}>Numeric field</div>
                    {numericFields.length === 0 ? (
                      <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem" }}>No numeric fields in this source</div>
                    ) : (
                      <select value={measureField} onChange={e => setMeasureField(e.target.value)} style={selectStyle}>
                        <option value="">— select field —</option>
                        {numericFields.map(f => <option key={f.field} value={f.field}>{f.label}</option>)}
                      </select>
                    )}
                  </div>
                )}

                <div style={{ borderTop: "1px solid var(--fm-hairline)", display: "flex", gap: "1rem", marginTop: "1.25rem", paddingTop: "1rem" }}>
                  <div style={{ flex: 1 }}>
                    <div style={labelStyle}>Sort by</div>
                    <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={selectStyle}>
                      <option value="value">Value</option>
                      <option value="label">Label</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={labelStyle}>Direction</div>
                    <select value={sortDir} onChange={e => setSortDir(e.target.value)} style={selectStyle}>
                      <option value="desc">Descending</option>
                      <option value="asc">Ascending</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={labelStyle}>Limit</div>
                    <input type="number" min={1} max={50} value={limit} onChange={e => setLimit(Number(e.target.value))} style={inputStyle} />
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Filters */}
            {step === 4 && (
              <div>
                <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <div style={labelStyle}>Filters (optional)</div>
                  <button onClick={addFilter} style={btnSecondary}
                    onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink)"}
                    onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}>
                    + Add filter
                  </button>
                </div>
                {filters.length === 0 ? (
                  <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem" }}>No filters — all records included</div>
                ) : (
                  filters.map((f, i) => (
                    <div key={i} style={{ alignItems: "center", borderBottom: "1px solid var(--fm-hairline)", display: "flex", gap: "0.5rem", marginBottom: "0.5rem", paddingBottom: "0.5rem" }}>
                      <select value={f.field} onChange={e => updateFilter(i, { field: e.target.value })} style={{ ...selectStyle, flex: 2 }}>
                        {sourceFields.map(sf => <option key={sf.field} value={sf.field}>{sf.label}</option>)}
                      </select>
                      <select value={f.op} onChange={e => updateFilter(i, { op: e.target.value })} style={{ ...selectStyle, flex: 2 }}>
                        {FILTER_OPS.map(op => <option key={op.id} value={op.id}>{op.label}</option>)}
                      </select>
                      <input value={f.value} onChange={e => updateFilter(i, { value: e.target.value })} placeholder="value…" style={{ ...inputStyle, flex: 2 }} />
                      <button onClick={() => removeFilter(i)} style={{ background: "transparent", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.75rem", padding: "0.1rem 0.25rem" }}
                        onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                        onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-mute)"}>✕</button>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Step 5: Date range */}
            {step === 5 && (
              <div>
                <div style={labelStyle}>Date range</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  {Object.entries(DATE_RANGE_PRESETS).map(([id, def]) => (
                    <button key={id} onClick={() => setDateRange(id)} style={cardStyle(dateRange === id)}>
                      <div style={{ fontFamily: "var(--fm-serif)", fontSize: "0.78rem" }}>{def.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 6: Preview */}
            {step === 6 && (
              <div style={{ height: "100%" }}>
                <div style={labelStyle}>Live preview</div>
                <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", marginBottom: "0.75rem" }}>
                  {previewData.length} data points — {sourceId ? DATA_SOURCES[sourceId]?.label : "no source"}
                </div>
                <div style={{ height: 240 }}>
                  <ChartPreview chartType={chartType} data={previewData} showLabels={showLabels} showLegend={showLegend} />
                </div>
              </div>
            )}

            {/* Step 7: Name + Save */}
            {step === 7 && (
              <div>
                <div style={labelStyle}>Panel title</div>
                <input
                  type="text"
                  value={panelTitle}
                  onChange={e => setPanelTitle(e.target.value)}
                  placeholder="My Visualization"
                  style={{ ...inputStyle, fontSize: "0.88rem", marginBottom: "1.5rem" }}
                  autoFocus
                  onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
                  onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"}
                />
                <div style={{ background: "var(--fm-bg-panel)", border: "1px solid var(--fm-hairline)", borderRadius: "var(--fm-radius-lg)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", padding: "0.75rem 1rem" }}>
                  {[
                    ["Chart",  CHART_TYPES.find(c => c.id === chartType)?.label ?? chartType],
                    ["Source", DATA_SOURCES[sourceId]?.label ?? "—"],
                    ["Group",  (sourceFields.find(f => f.field === groupBy)?.label ?? groupBy) || "—"],
                    ["Measure", measure + (measureField ? ` of ${measureField}` : "")],
                    ["Date",   DATE_RANGE_PRESETS[dateRange]?.label ?? dateRange],
                    ["Filters", filters.length > 0 ? `${filters.length} active` : "None"],
                    ["Labels", chartType === "table" ? "n/a" : showLabels ? "On" : "Off"],
                    ["Legend", (chartType === "pie" || chartType === "donut") ? (showLegend ? "On" : "Off") : "n/a"],
                  ].map(([k, v]) => (
                    <div key={k} style={{ alignItems: "baseline", color: "var(--fm-ink-dim)", display: "flex", gap: "0.75rem", marginBottom: "0.3rem" }}>
                      <span style={{ color: "var(--fm-ink-mute)", minWidth: "50px", textTransform: "uppercase" }}>{k}</span>
                      <span>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Always-visible preview */}
          <div style={{ background: "var(--fm-bg-panel)", display: "flex", flex: 1, flexDirection: "column", padding: "1.25rem" }}>
            <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.1em", marginBottom: "0.5rem", textTransform: "uppercase" }}>Preview</div>
            <div style={{ flex: 1 }}>
              {(!sourceId || !groupBy) ? (
                <div style={{ alignItems: "center", color: "var(--fm-hairline2)", display: "flex", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", height: "100%", justifyContent: "center" }}>
                  Configure source + group to see preview
                </div>
              ) : (
                <ChartPreview chartType={chartType} data={previewData} showLabels={showLabels} showLegend={showLegend} />
              )}
            </div>
            <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", marginTop: "0.5rem" }}>
              {previewData.length} groups
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ alignItems: "center", borderTop: "1px solid var(--fm-hairline)", display: "flex", flexShrink: 0, gap: "0.75rem", justifyContent: "flex-end", padding: "0.85rem 1.5rem" }}>
          <button onClick={onClose} style={btnSecondary}
            onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}>Cancel</button>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} style={btnSecondary}
              onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink)"}
              onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}>&larr; Back</button>
          )}
          {step < STEPS.length - 1 ? (
            <>
              <button
                onClick={() => canSave() && handleSave()}
                disabled={!canSave()}
                title={canSave() ? "Save and close" : "Pick a source, group, measure, and title first"}
                style={{ background: "transparent", border: "1px solid var(--fm-brass)", borderRadius: "var(--fm-radius)", color: "var(--fm-brass)", cursor: canSave() ? "pointer" : "not-allowed", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", opacity: canSave() ? 1 : 0.4, padding: "0.4rem 1rem", transition: "background 0.12s" }}
                onMouseEnter={e => { if (canSave()) e.currentTarget.style.background = "var(--fm-brass)22"; }}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >Save</button>
              <button
                onClick={() => canProceed() && setStep(s => s + 1)}
                disabled={!canProceed()}
                style={{ ...btnPrimary, opacity: canProceed() ? 1 : 0.4, cursor: canProceed() ? "pointer" : "not-allowed" }}
                onMouseEnter={e => { if (canProceed()) e.currentTarget.style.background = "var(--fm-brass)22"; }}
                onMouseLeave={e => e.currentTarget.style.background = "var(--fm-brass-bg)"}
              >Next &rarr;</button>
            </>
          ) : (
            <button
              onClick={handleSave}
              disabled={!panelTitle.trim()}
              style={{ ...btnPrimary, opacity: panelTitle.trim() ? 1 : 0.4, cursor: panelTitle.trim() ? "pointer" : "not-allowed" }}
              onMouseEnter={e => { if (panelTitle.trim()) e.currentTarget.style.background = "var(--fm-brass)22"; }}
              onMouseLeave={e => e.currentTarget.style.background = "var(--fm-brass-bg)"}
            >{initialConfig ? "Save" : "Add to Dashboard"}</button>
          )}
        </div>
      </div>
    </div>
  );
}
