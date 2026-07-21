import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, Legend,
} from "recharts";

// Shared chart renderer for the dashboard's custom visualizations. Used by both
// the live dashboard panels and the builder preview so the two never drift.
//
// Categorical palette: 6 fixed slots in fixed assignment order (brass, teal,
// coral, violet, green, pink), validated for CVD separation, chroma, lightness
// band, and 3:1 contrast against the dark panel surface (dataviz six-checks;
// light-mode contrast is covered by value labels + tooltips + the table view).
// A 7th series never mints a new hue — the query engine folds overflow into
// "Other", and pie/donut fold overflow slices below.
export const PALETTE = ["#b98b3e", "#189cb6", "#cf5f4e", "#8f75dd", "#55a05e", "#c06a9e"];
export const DEFAULT_COLOR = PALETTE[0];

export const VALUE_FORMATS = [
  { id: "number",   label: "Number" },
  { id: "currency", label: "Currency ($)" },
  { id: "minutes",  label: "Duration (minutes)" },
];

export function fmtValue(v, format = "number") {
  if (v == null || isNaN(v)) return "—";
  const n = Number(v);
  if (format === "currency") {
    const abs = Math.abs(n);
    if (abs >= 10000) return `$${(n / 1000).toFixed(abs >= 100000 ? 0 : 1)}k`;
    return n % 1 === 0 ? `$${n.toLocaleString("en-US")}` : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (format === "minutes") {
    const mins = Math.round(n);
    if (mins >= 60) { const h = Math.floor(mins / 60), m = mins % 60; return m > 0 ? `${h}h ${m}m` : `${h}h`; }
    return `${mins}m`;
  }
  if (Math.abs(n) >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return n % 1 === 0 ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

// Pie/donut value label, drawn at the slice centroid so it never overflows.
function renderPieValueLabel(format) {
  return function PieValueLabel({ cx, cy, midAngle, innerRadius, outerRadius, value }) {
    const RAD = Math.PI / 180;
    const r = innerRadius + (outerRadius - innerRadius) * 0.55;
    const x = cx + r * Math.cos(-midAngle * RAD);
    const y = cy + r * Math.sin(-midAngle * RAD);
    return (
      <text x={x} y={y} fill="var(--fm-ink)" fontFamily="var(--fm-mono)" fontSize={10} textAnchor="middle" dominantBaseline="central">
        {fmtValue(value, format)}
      </text>
    );
  };
}

const LEGEND_PROPS = {
  verticalAlign: "bottom",
  align: "center",
  iconSize: 8,
  iconType: "circle",
  wrapperStyle: { fontFamily: "var(--fm-mono)", fontSize: "0.62rem", paddingTop: 4 },
};

const AXIS_TICK  = { fill: "var(--fm-ink-mute)", fontSize: 9, fontFamily: "var(--fm-mono)" };
const AXIS_TICK_CAT = { fill: "var(--fm-ink-dim)", fontSize: 9, fontFamily: "var(--fm-mono)" };
const SURFACE = "var(--fm-bg-panel)";

function TooltipContent({ active, payload, label, format }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div style={{ background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline2)", borderRadius: 3, fontFamily: "var(--fm-mono)", fontSize: "0.65rem", padding: "0.45rem 0.6rem" }}>
      {label != null && <div style={{ color: "var(--fm-ink-mute)", marginBottom: payload.length ? "0.25rem" : 0 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ alignItems: "center", color: "var(--fm-ink-dim)", display: "flex", gap: "0.4rem" }}>
          <span style={{ background: p.color || p.payload?.fill, borderRadius: "50%", display: "inline-block", height: 7, width: 7 }} />
          {p.name !== "value" && <span>{p.name}</span>}
          <span style={{ color: "var(--fm-ink)", marginLeft: "auto", paddingLeft: "0.6rem" }}>{fmtValue(p.value, format)}</span>
        </div>
      ))}
    </div>
  );
}

// Fold rows beyond the palette's 6 slots into "Other" for part-to-whole forms —
// a 7th slice never gets a 7th hue, and micro-slices become unreadable anyway.
function foldPieRows(rows, valueKey) {
  if (rows.length <= PALETTE.length) return rows;
  const sorted = [...rows].sort((a, b) => (b[valueKey] ?? 0) - (a[valueKey] ?? 0));
  const kept = sorted.slice(0, PALETTE.length - 1);
  const other = sorted.slice(PALETTE.length - 1).reduce((s, r) => s + (r[valueKey] ?? 0), 0);
  return [...kept, { label: "Other", [valueKey]: other }];
}

/**
 * props: chartType, data (rows), series (["value"] or split keys),
 *        showLabels, showLegend, format, color, statSub (stat tile subtitle)
 */
export default function DashChart({ chartType, data, series = ["value"], showLabels = false, showLegend = false, format = "number", color = DEFAULT_COLOR, statSub = "" }) {
  const rows = data ?? [];
  const multi = series.length > 1 || (series.length === 1 && series[0] !== "value");
  const keys = multi ? series : ["value"];
  const colorOf = (i) => multi ? PALETTE[i % PALETTE.length] : color;

  if (chartType === "stat") {
    const total = rows.reduce((s, r) => s + keys.reduce((ss, k) => ss + (Number(r[k]) || 0), 0), 0);
    return (
      <div style={{ alignItems: "center", display: "flex", flexDirection: "column", height: "100%", justifyContent: "center" }}>
        <div style={{ color, fontFamily: "var(--fm-serif)", fontSize: "2.6rem", fontWeight: 300, lineHeight: 1.1 }}>{fmtValue(total, format)}</div>
        {statSub && <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", marginTop: "0.35rem", textTransform: "uppercase" }}>{statSub}</div>}
      </div>
    );
  }

  if (!rows.length) {
    return <div style={{ alignItems: "center", color: "var(--fm-ink-mute)", display: "flex", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", height: "100%", justifyContent: "center" }}>No data — adjust settings</div>;
  }

  // Legend: always present for ≥2 series (identity is never color-alone);
  // single series never needs one (the panel title names it).
  const legend = multi ? <Legend {...LEGEND_PROPS} /> : null;
  const tooltip = <Tooltip content={<TooltipContent format={format} />} cursor={{ fill: "var(--fm-hairline)", opacity: 0.35 }} />;
  const yTickFmt = (v) => fmtValue(v, format);
  // Selective labels: single-series only — multi-series bars + labels = noise,
  // and the legend + tooltip already carry the values.
  const barLabel = (pos) => (showLabels && !multi)
    ? <LabelList dataKey="value" position={pos} fill="var(--fm-ink-dim)" fontFamily="var(--fm-mono)" fontSize={9} formatter={(v) => fmtValue(v, format)} />
    : null;

  if (chartType === "bar-v") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 20 }} barCategoryGap="25%">
          <XAxis dataKey="label" tick={AXIS_TICK} angle={rows.length > 5 ? -30 : 0} textAnchor={rows.length > 5 ? "end" : "middle"} interval={0} />
          <YAxis tick={AXIS_TICK} tickFormatter={yTickFmt} width={44} />
          {tooltip}{legend}
          {keys.map((k, i) => (
            <Bar key={k} dataKey={k} stackId={multi ? "s" : undefined} fill={colorOf(i)} fillOpacity={0.85}
              stroke={multi ? SURFACE : undefined} strokeWidth={multi ? 1 : 0}
              radius={multi ? 0 : [4, 4, 0, 0]}>
              {i === keys.length - 1 ? barLabel("top") : null}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "bar-h") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 76, bottom: 4 }} barCategoryGap="25%">
          <XAxis type="number" tick={AXIS_TICK} tickFormatter={yTickFmt} />
          <YAxis type="category" dataKey="label" tick={AXIS_TICK_CAT} width={72} />
          {tooltip}{legend}
          {keys.map((k, i) => (
            <Bar key={k} dataKey={k} stackId={multi ? "s" : undefined} fill={colorOf(i)} fillOpacity={0.85}
              stroke={multi ? SURFACE : undefined} strokeWidth={multi ? 1 : 0}
              radius={multi ? 0 : [0, 4, 4, 0]}>
              {i === keys.length - 1 ? barLabel("right") : null}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "line") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 20 }}>
          <XAxis dataKey="label" tick={AXIS_TICK} angle={rows.length > 5 ? -30 : 0} textAnchor={rows.length > 5 ? "end" : "middle"} interval={0} />
          <YAxis tick={AXIS_TICK} tickFormatter={yTickFmt} width={44} />
          {tooltip}{legend}
          {keys.map((k, i) => (
            <Line key={k} dataKey={k} stroke={colorOf(i)} strokeWidth={2}
              dot={{ r: 3, fill: colorOf(i), strokeWidth: 0 }} activeDot={{ r: 5 }}>
              {i === keys.length - 1 ? barLabel("top") : null}
            </Line>
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "area") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 20 }}>
          <XAxis dataKey="label" tick={AXIS_TICK} angle={rows.length > 5 ? -30 : 0} textAnchor={rows.length > 5 ? "end" : "middle"} interval={0} />
          <YAxis tick={AXIS_TICK} tickFormatter={yTickFmt} width={44} />
          {tooltip}{legend}
          {keys.map((k, i) => (
            <Area key={k} dataKey={k} stackId={multi ? "s" : undefined} stroke={colorOf(i)} strokeWidth={2}
              fill={colorOf(i)} fillOpacity={multi ? 0.45 : 0.15}>
              {i === keys.length - 1 ? barLabel("top") : null}
            </Area>
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "pie" || chartType === "donut") {
    const pieRows = foldPieRows(rows, "value");
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={pieRows} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius="72%"
            innerRadius={chartType === "donut" ? "52%" : "0%"} paddingAngle={2}
            stroke={SURFACE} strokeWidth={2}
            label={showLabels ? renderPieValueLabel(format) : false} labelLine={false}>
            {pieRows.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.85} />)}
          </Pie>
          {showLegend && <Legend {...LEGEND_PROPS} />}
          <Tooltip content={<TooltipContent format={format} />} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "table") {
    const cols = multi ? keys : ["value"];
    const th = { background: "var(--fm-bg-panel)", borderBottom: "1px solid var(--fm-hairline2)", color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", fontWeight: 400, letterSpacing: "0.1em", padding: "0.25rem 0.5rem", position: "sticky", textTransform: "uppercase", top: 0 };
    return (
      <div style={{ height: "100%", overflow: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>Label</th>
              {cols.map(c => <th key={c} style={{ ...th, textAlign: "right" }}>{c === "value" ? "Value" : c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--fm-hairline)" }}>
                <td style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", padding: "0.28rem 0.5rem" }}>{row.label}</td>
                {cols.map(c => (
                  <td key={c} style={{ color: "var(--fm-brass)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", padding: "0.28rem 0.5rem", textAlign: "right" }}>{fmtValue(row[c], format)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
}
