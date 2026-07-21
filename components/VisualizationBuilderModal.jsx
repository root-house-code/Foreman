import { useState, useMemo } from "react";
import {
  DATA_SOURCES, DATE_RANGE_PRESETS, MEASURES, FILTER_OPS,
  getSourceFields, getFieldValues, runQuery,
} from "../lib/dashboardQuery.js";
import DashChart, { PALETTE, DEFAULT_COLOR, VALUE_FORMATS } from "./DashChart.jsx";

// Single-workspace visualization editor (Metabase-style): every control visible
// at once in a left rail, live preview on the right, no step wizard. Change
// anything, watch the chart update, save when it looks right.

const CHART_TYPES = [
  { id: "bar-v", label: "Bar",      icon: "▐▐▐",  desc: "Compare categories" },
  { id: "bar-h", label: "Bar (H)",  icon: "▬▬",   desc: "Long labels" },
  { id: "line",  label: "Line",     icon: "╱╲╱",  desc: "Trend over time" },
  { id: "area",  label: "Area",     icon: "▄▟█",  desc: "Volume over time" },
  { id: "pie",   label: "Pie",      icon: "◍",    desc: "Part-to-whole" },
  { id: "donut", label: "Donut",    icon: "◎",    desc: "Part-to-whole" },
  { id: "table", label: "Table",    icon: "▤",    desc: "Exact numbers" },
  { id: "stat",  label: "Stat",     icon: "42",   desc: "One big number" },
];

// Chart types that can take a second dimension (stacked/multi-series).
const SPLITTABLE = new Set(["bar-v", "bar-h", "line", "area", "table"]);

// ── Styles ────────────────────────────────────────────────────────────────────

const inputStyle = {
  background: "var(--fm-bg-sunk)",
  border: "1px solid var(--fm-hairline2)",
  borderRadius: "var(--fm-radius)",
  boxSizing: "border-box",
  color: "var(--fm-ink)",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.7rem",
  outline: "none",
  padding: "0.32rem 0.5rem",
  width: "100%",
};
const selectStyle = { ...inputStyle, cursor: "pointer" };

const sectionLabel = {
  alignItems: "baseline",
  color: "var(--fm-brass-dim)",
  display: "flex",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.58rem",
  gap: "0.5rem",
  justifyContent: "space-between",
  letterSpacing: "0.12em",
  marginBottom: "0.5rem",
  textTransform: "uppercase",
};

const sectionBox = {
  borderBottom: "1px solid var(--fm-hairline)",
  padding: "0.9rem 1.25rem",
};

const hintText = { color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", lineHeight: 1.5, marginTop: "0.4rem" };

function chipStyle(active) {
  return {
    background: active ? "var(--fm-brass-bg)" : "var(--fm-bg-sunk)",
    border: `1px solid ${active ? "var(--fm-brass)" : "var(--fm-hairline)"}`,
    borderRadius: "var(--fm-radius)",
    color: active ? "var(--fm-brass)" : "var(--fm-ink-dim)",
    cursor: "pointer",
    fontFamily: "var(--fm-mono)",
    fontSize: "0.62rem",
    padding: "0.3rem 0.6rem",
    transition: "all 0.1s",
  };
}

function Toggle({ on, onToggle, label }) {
  return (
    <button onClick={onToggle} style={{ alignItems: "center", background: "transparent", border: "none", cursor: "pointer", display: "flex", gap: "0.55rem", padding: 0 }}>
      <span style={{ alignItems: "center", background: on ? "var(--fm-brass)" : "var(--fm-bg-sunk)", border: `1px solid ${on ? "var(--fm-brass)" : "var(--fm-hairline2)"}`, borderRadius: 999, display: "flex", height: 16, justifyContent: on ? "flex-end" : "flex-start", padding: 2, transition: "all 0.12s", width: 30 }}>
        <span style={{ background: on ? "var(--fm-bg)" : "var(--fm-ink-mute)", borderRadius: "50%", height: 10, width: 10 }} />
      </span>
      <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem" }}>{label}</span>
    </button>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export default function VisualizationBuilderModal({ initialConfig = null, onSave, onClose }) {
  const [chartType,    setChartType]    = useState(initialConfig?.chartType ?? "bar-v");
  const [sourceId,     setSourceId]     = useState(initialConfig?.query?.source ?? "");
  const [groupBy,      setGroupBy]      = useState(initialConfig?.query?.groupBy ?? "");
  const [splitBy,      setSplitBy]      = useState(initialConfig?.query?.splitBy ?? "");
  const [measure,      setMeasure]      = useState(initialConfig?.query?.measure ?? "count");
  const [measureField, setMeasureField] = useState(initialConfig?.query?.measureField ?? "");
  const [filters,      setFilters]      = useState(initialConfig?.query?.filter ?? []);
  const [dateRange,    setDateRange]    = useState(initialConfig?.query?.dateRange ?? "last-12-months");
  const [sortBy,       setSortBy]       = useState(initialConfig?.query?.sortBy ?? "value");
  const [sortDir,      setSortDir]      = useState(initialConfig?.query?.sortDir ?? "desc");
  const [limit,        setLimit]        = useState(initialConfig?.query?.limit ?? 10);
  const [showLabels,   setShowLabels]   = useState(initialConfig ? (initialConfig.showLabels ?? false) : true);
  const [showLegend,   setShowLegend]   = useState(initialConfig ? (initialConfig.showLegend ?? false) : true);
  const [format,       setFormat]       = useState(initialConfig?.format ?? "number");
  const [color,        setColor]        = useState(initialConfig?.color ?? DEFAULT_COLOR);
  const [panelTitle,   setPanelTitle]   = useState(initialConfig?.title ?? "");

  const sourceDef     = DATA_SOURCES[sourceId];
  const sourceFields  = useMemo(() => getSourceFields(sourceId), [sourceId]);
  const numericFields = useMemo(() => sourceFields.filter(f => f.type === "number"), [sourceFields]);
  const groupFields   = useMemo(() => sourceFields.filter(f => f.type !== "number"), [sourceFields]);
  const measureDef    = MEASURES.find(m => m.id === measure);
  const measureFieldOptions = measureDef?.fieldType === "any" ? sourceFields : numericFields;
  const isStat  = chartType === "stat";
  const canSplit = SPLITTABLE.has(chartType) && !isStat;
  const hasDate = !!sourceDef?.dateField;

  function pickSource(id) {
    setSourceId(id);
    setGroupBy("");
    setSplitBy("");
    setMeasureField("");
    setFilters([]);
    setFormat(DATA_SOURCES[id]?.defaultFormat ?? "number");
  }

  // Time on the x-axis reads left→right — when grouping by month/year default
  // the sort to chronological instead of by value.
  function pickGroupBy(field) {
    setGroupBy(field);
    if (field === "month" || field === "year") { setSortBy("label"); setSortDir("asc"); }
  }

  function pickChartType(id) {
    setChartType(id);
    if (id === "stat") { setGroupBy(""); setSplitBy(""); }
    if (!SPLITTABLE.has(id)) setSplitBy("");
  }

  const queryConfig = useMemo(() => ({
    source: sourceId, measure, measureField, groupBy, splitBy: canSplit ? splitBy : "",
    filter: filters, dateRange, sortBy, sortDir, limit,
  }), [sourceId, measure, measureField, groupBy, splitBy, canSplit, filters, dateRange, sortBy, sortDir, limit]);

  const preview = useMemo(() => {
    if (!sourceId || (!groupBy && !isStat)) return { rows: [], series: ["value"] };
    try { return runQuery(queryConfig); }
    catch { return { rows: [], series: ["value"] }; }
  }, [queryConfig, sourceId, groupBy, isStat]);

  const statSub = useMemo(() => {
    if (!isStat || !sourceDef) return "";
    const m = MEASURES.find(x => x.id === measure);
    return `${m?.label ?? measure}${measureField ? ` · ${measureField}` : ""} — ${sourceDef.label}`;
  }, [isStat, sourceDef, measure, measureField]);

  function canSave() {
    if (!sourceId || !panelTitle.trim()) return false;
    if (!isStat && !groupBy) return false;
    if (measureDef?.needsField && !measureField) return false;
    return true;
  }

  const saveBlocker = !sourceId ? "Pick a data source"
    : (!isStat && !groupBy) ? "Pick a group-by field"
    : (measureDef?.needsField && !measureField) ? "Pick a measure field"
    : !panelTitle.trim() ? "Name the panel"
    : null;

  function handleSave() {
    onSave({
      title: panelTitle.trim() || "Custom Chart",
      chartType, showLabels, showLegend, format, color,
      query: queryConfig,
    });
  }

  function addFilter() {
    setFilters(fs => [...fs, { field: sourceFields[0]?.field ?? "", op: "eq", value: "" }]);
  }
  function updateFilter(i, patch) {
    setFilters(fs => fs.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  }
  function removeFilter(i) {
    setFilters(fs => fs.filter((_, idx) => idx !== i));
  }

  const singleSeries = !canSplit || !splitBy;

  return (
    <div
      style={{ alignItems: "center", background: "rgba(0,0,0,0.75)", bottom: 0, display: "flex", justifyContent: "center", left: 0, position: "fixed", right: 0, top: 0, zIndex: 400 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "var(--fm-bg)", border: "1px solid var(--fm-hairline2)", borderRadius: 8, display: "flex", flexDirection: "column", height: "88vh", maxWidth: 980, overflow: "hidden", width: "94%" }}>

        {/* Header: mode label + inline title */}
        <div style={{ alignItems: "center", borderBottom: "1px solid var(--fm-hairline)", display: "flex", flexShrink: 0, gap: "1rem", padding: "0.85rem 1.5rem" }}>
          <span style={{ color: "var(--fm-brass-dim)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>
            {initialConfig ? "Edit Visualization" : "New Visualization"}
          </span>
          <input
            type="text"
            value={panelTitle}
            onChange={e => setPanelTitle(e.target.value)}
            placeholder="Untitled panel — name it here"
            style={{ ...inputStyle, background: "transparent", border: "none", borderBottom: "1px solid var(--fm-hairline2)", borderRadius: 0, flex: 1, fontFamily: "var(--fm-serif)", fontSize: "0.95rem", padding: "0.2rem 0.1rem" }}
            onFocus={e => e.currentTarget.style.borderBottomColor = "var(--fm-brass)"}
            onBlur={e => e.currentTarget.style.borderBottomColor = "var(--fm-hairline2)"}
          />
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.75rem", padding: 0 }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-mute)"}
          >✕</button>
        </div>

        {/* Body: left control rail + live preview */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

          {/* ── Left rail ── */}
          <div style={{ borderRight: "1px solid var(--fm-hairline)", flexShrink: 0, overflowY: "auto", width: 372 }}>

            {/* Chart type */}
            <div style={sectionBox}>
              <div style={sectionLabel}><span>Chart</span></div>
              <div style={{ display: "grid", gap: "0.35rem", gridTemplateColumns: "repeat(4, 1fr)" }}>
                {CHART_TYPES.map(ct => (
                  <button key={ct.id} onClick={() => pickChartType(ct.id)} title={ct.desc}
                    style={{ ...chipStyle(chartType === ct.id), display: "flex", flexDirection: "column", alignItems: "center", gap: "0.15rem", padding: "0.4rem 0.2rem" }}>
                    <span style={{ fontSize: "0.85rem", lineHeight: 1 }}>{ct.icon}</span>
                    <span style={{ fontSize: "0.56rem" }}>{ct.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Data */}
            <div style={sectionBox}>
              <div style={sectionLabel}><span>Data</span></div>
              <select value={sourceId} onChange={e => pickSource(e.target.value)} style={selectStyle}>
                <option value="">— pick a data source —</option>
                {Object.entries(DATA_SOURCES).map(([id, def]) => (
                  <option key={id} value={id}>{def.label}</option>
                ))}
              </select>
              {sourceDef && <div style={hintText}>{sourceDef.description}</div>}
            </div>

            {/* Summarize */}
            <div style={sectionBox}>
              <div style={sectionLabel}><span>Summarize</span></div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginBottom: measureDef?.needsField ? "0.55rem" : 0 }}>
                {MEASURES.map(m => (
                  <button key={m.id} onClick={() => { setMeasure(m.id); if (!m.needsField) setMeasureField(""); }} title={m.desc} style={chipStyle(measure === m.id)}>
                    {m.label}
                  </button>
                ))}
              </div>
              {measureDef?.needsField && (
                measureFieldOptions.length === 0 ? (
                  <div style={hintText}>This source has no numeric fields — use Count or Distinct count</div>
                ) : (
                  <select value={measureField} onChange={e => setMeasureField(e.target.value)} style={selectStyle}>
                    <option value="">— of which field? —</option>
                    {measureFieldOptions.map(f => <option key={f.field} value={f.field}>{f.label}</option>)}
                  </select>
                )
              )}
            </div>

            {/* Group by + Split by */}
            {!isStat && (
              <div style={sectionBox}>
                <div style={sectionLabel}><span>Group by</span></div>
                <select value={groupBy} onChange={e => pickGroupBy(e.target.value)} style={selectStyle} disabled={!sourceId}>
                  <option value="">— pick a field —</option>
                  {groupFields.map(f => <option key={f.field} value={f.field}>{f.label}</option>)}
                </select>
                {canSplit && (
                  <>
                    <div style={{ ...sectionLabel, marginBottom: "0.35rem", marginTop: "0.7rem" }}><span>Split by <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--fm-ink-mute)" }}>(optional)</span></span></div>
                    <select value={splitBy} onChange={e => setSplitBy(e.target.value)} style={selectStyle} disabled={!sourceId}>
                      <option value="">— none —</option>
                      {groupFields.filter(f => f.field !== groupBy).map(f => <option key={f.field} value={f.field}>{f.label}</option>)}
                    </select>
                    {splitBy && <div style={hintText}>One {chartType.startsWith("bar") ? "stacked segment" : "series"} per {sourceFields.find(f => f.field === splitBy)?.label?.toLowerCase() ?? splitBy} — up to 6, the rest fold into “Other”</div>}
                  </>
                )}
              </div>
            )}

            {/* Filters */}
            <div style={sectionBox}>
              <div style={sectionLabel}>
                <span>Filters</span>
                <button onClick={addFilter} disabled={!sourceId}
                  style={{ background: "transparent", border: "none", color: sourceId ? "var(--fm-brass-dim)" : "var(--fm-ink-mute)", cursor: sourceId ? "pointer" : "default", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", padding: 0 }}>
                  + add
                </button>
              </div>
              {filters.length === 0 ? (
                <div style={{ ...hintText, marginTop: 0 }}>All records included</div>
              ) : filters.map((f, i) => (
                <div key={i} style={{ display: "flex", gap: "0.35rem", marginBottom: "0.4rem" }}>
                  <select value={f.field} onChange={e => updateFilter(i, { field: e.target.value, value: "" })} style={{ ...selectStyle, flex: 3 }}>
                    {sourceFields.map(sf => <option key={sf.field} value={sf.field}>{sf.label}</option>)}
                  </select>
                  <select value={f.op} onChange={e => updateFilter(i, { op: e.target.value })} style={{ ...selectStyle, flex: 2 }}>
                    {FILTER_OPS.map(op => <option key={op.id} value={op.id}>{op.label}</option>)}
                  </select>
                  <input value={f.value} onChange={e => updateFilter(i, { value: e.target.value })} placeholder="value…"
                    list={`viz-filter-values-${i}`} style={{ ...inputStyle, flex: 3 }} />
                  <datalist id={`viz-filter-values-${i}`}>
                    {getFieldValues(sourceId, f.field).map(v => <option key={v} value={v} />)}
                  </datalist>
                  <button onClick={() => removeFilter(i)} style={{ background: "transparent", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0 0.15rem" }}
                    onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                    onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-mute)"}>✕</button>
                </div>
              ))}
            </div>

            {/* Range & sort */}
            <div style={sectionBox}>
              <div style={sectionLabel}><span>Range &amp; Sort</span></div>
              {hasDate && (
                <div style={{ marginBottom: "0.55rem" }}>
                  <select value={dateRange} onChange={e => setDateRange(e.target.value)} style={selectStyle}>
                    {Object.entries(DATE_RANGE_PRESETS).map(([id, def]) => (
                      <option key={id} value={id}>{def.label}</option>
                    ))}
                  </select>
                </div>
              )}
              {!isStat && (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...selectStyle, flex: 2 }}>
                    <option value="value">Sort by value</option>
                    <option value="label">Sort by label</option>
                  </select>
                  <select value={sortDir} onChange={e => setSortDir(e.target.value)} style={{ ...selectStyle, flex: 2 }}>
                    <option value="desc">Desc</option>
                    <option value="asc">Asc</option>
                  </select>
                  <input type="number" min={1} max={50} value={limit} title="Max groups shown"
                    onChange={e => setLimit(Number(e.target.value))} style={{ ...inputStyle, flex: 1 }} />
                </div>
              )}
              {(groupBy === "month" || groupBy === "year") && sortBy === "label" && (
                <div style={hintText}>Sorted chronologically; empty months show as 0</div>
              )}
            </div>

            {/* Appearance */}
            <div style={{ ...sectionBox, borderBottom: "none" }}>
              <div style={sectionLabel}><span>Appearance</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <select value={format} onChange={e => setFormat(e.target.value)} style={{ ...selectStyle, flex: 1 }} title="Value format">
                    {VALUE_FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </div>
                {!isStat && chartType !== "table" && (
                  <Toggle on={showLabels} onToggle={() => setShowLabels(v => !v)} label="Value labels" />
                )}
                {(chartType === "pie" || chartType === "donut") && (
                  <Toggle on={showLegend} onToggle={() => setShowLegend(v => !v)} label="Legend" />
                )}
                {(singleSeries && chartType !== "pie" && chartType !== "donut" && chartType !== "table") && (
                  <div style={{ alignItems: "center", display: "flex", gap: "0.45rem" }}>
                    <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", marginRight: "0.15rem" }}>Color</span>
                    {PALETTE.map(c => (
                      <button key={c} onClick={() => setColor(c)} title={c}
                        style={{ background: c, border: color === c ? "2px solid var(--fm-ink)" : "2px solid transparent", borderRadius: "50%", cursor: "pointer", height: 16, padding: 0, width: 16 }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Right: live preview ── */}
          <div style={{ background: "var(--fm-bg-raised)", display: "flex", flex: 1, flexDirection: "column", padding: "1.25rem" }}>
            <div style={{ background: "var(--fm-bg-panel)", border: "var(--fm-border)", borderRadius: "var(--fm-radius-lg)", display: "flex", flex: 1, flexDirection: "column", overflow: "hidden" }}>
              <div style={{ borderBottom: "1px solid var(--fm-hairline)", color: "var(--fm-brass-dim)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.12em", padding: "0.65rem 1.25rem 0.55rem", textTransform: "uppercase" }}>
                {panelTitle.trim() || "Untitled panel"}
              </div>
              <div style={{ flex: 1, minHeight: 0, padding: "0.75rem 1.25rem 1rem" }}>
                {(!sourceId || (!groupBy && !isStat)) ? (
                  <div style={{ alignItems: "center", color: "var(--fm-hairline2)", display: "flex", flexDirection: "column", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", gap: "0.4rem", height: "100%", justifyContent: "center" }}>
                    <span style={{ fontSize: "1.4rem", opacity: 0.6 }}>◫</span>
                    {!sourceId ? "Pick a data source to begin" : "Pick a group-by field"}
                  </div>
                ) : (
                  <DashChart
                    chartType={chartType}
                    data={preview.rows}
                    series={preview.series}
                    showLabels={showLabels}
                    showLegend={showLegend}
                    format={format}
                    color={color}
                    statSub={statSub}
                  />
                )}
              </div>
            </div>
            <div style={{ color: "var(--fm-ink-mute)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.6rem", marginTop: "0.55rem" }}>
              {sourceId && (groupBy || isStat)
                ? `${preview.rows.length} group${preview.rows.length === 1 ? "" : "s"}${preview.series.length > 1 ? ` × ${preview.series.length} series` : ""} — updates live as you adjust`
                : "Preview appears here"}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ alignItems: "center", borderTop: "1px solid var(--fm-hairline)", display: "flex", flexShrink: 0, gap: "0.75rem", justifyContent: "flex-end", padding: "0.8rem 1.5rem" }}>
          {saveBlocker && (
            <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", marginRight: "auto" }}>{saveBlocker}</span>
          )}
          <button onClick={onClose}
            style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.4rem 1rem" }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}>Cancel</button>
          <button
            onClick={() => canSave() && handleSave()}
            disabled={!canSave()}
            style={{ background: "var(--fm-brass-bg)", border: "1px solid var(--fm-brass)", borderRadius: "var(--fm-radius)", color: "var(--fm-brass)", cursor: canSave() ? "pointer" : "not-allowed", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", opacity: canSave() ? 1 : 0.4, padding: "0.4rem 1.25rem", transition: "background 0.12s" }}
            onMouseEnter={e => { if (canSave()) e.currentTarget.style.background = "var(--fm-brass)22"; }}
            onMouseLeave={e => e.currentTarget.style.background = "var(--fm-brass-bg)"}
          >{initialConfig ? "Save Changes" : "Add to Dashboard"}</button>
        </div>
      </div>
    </div>
  );
}
