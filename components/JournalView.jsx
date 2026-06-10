import { useState, useMemo } from "react";
import { JOURNAL_TYPES } from "../lib/journal.js";
import { FilterPill } from "./FilterPill.jsx";

const TYPE_META = {
  maintenance: { label: "Maintenance", color: "var(--fm-brass)" },
  chore:       { label: "Chore",       color: "var(--fm-green)" },
  service:     { label: "Service",     color: "var(--fm-cyan)" },
  utility:     { label: "Utility",     color: "var(--fm-cyan)" },
  expense:     { label: "Expense",     color: "var(--fm-amber)" },
  project:     { label: "Project",     color: "var(--fm-amber)" },
};

// Where clicking an event navigates (expenses live on the Lifecycle page).
const TYPE_TARGET = {
  maintenance: "maintenance",
  chore:       "chores",
  service:     "services",
  utility:     "utilities",
  expense:     "lifecycle",
  project:     "projects",
};

function fmtMoney(n) {
  if (n == null || isNaN(n)) return "";
  return "$" + Math.round(n).toLocaleString("en-US");
}
function fmtDay(iso) {
  const [y, m, d] = (iso || "").split("-").map(Number);
  if (!y || !m || !d) return iso || "";
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtMonthHeader(ym) {
  const [y, m] = (ym || "").split("-").map(Number);
  if (!y || !m) return ym || "";
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

const labelStyle = {
  color: "var(--fm-ink-mute)",
  flexShrink: 0,
  fontFamily: "var(--fm-mono)",
  fontSize: "0.6rem",
  letterSpacing: "0.08em",
  marginRight: "0.25rem",
  textTransform: "uppercase",
  width: 50,
};

const searchStyle = {
  background: "var(--fm-bg-sunk)",
  border: "var(--fm-border-2)",
  borderRadius: "var(--fm-radius)",
  color: "var(--fm-ink)",
  fontFamily: "var(--fm-sans)",
  fontSize: "0.8rem",
  outline: "none",
  padding: "0.35rem 0.7rem",
  width: 260,
};

const emptyStyle = {
  color: "var(--fm-ink-dim)",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.82rem",
  lineHeight: 1.7,
  maxWidth: 460,
};

function JournalRow({ e, onNavigate }) {
  const meta = TYPE_META[e.type] || { label: e.type, color: "var(--fm-ink-dim)" };
  const sub = [e.subtitle, e.person].filter(Boolean).join(" · ");
  const target = onNavigate ? TYPE_TARGET[e.type] : null;
  return (
    <div
      onClick={target ? () => onNavigate(target) : undefined}
      title={target ? `Open ${meta.label}` : undefined}
      style={{ alignItems: "center", borderBottom: "1px solid var(--fm-hairline)", cursor: target ? "pointer" : "default", display: "flex", gap: "0.85rem", padding: "0.5rem 0.4rem", transition: "background 0.12s" }}
      onMouseEnter={target ? e2 => { e2.currentTarget.style.background = "var(--fm-bg-raised)"; } : undefined}
      onMouseLeave={target ? e2 => { e2.currentTarget.style.background = "transparent"; } : undefined}
    >
      <span style={{ color: "var(--fm-brass-dim)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.62rem", minWidth: 50, whiteSpace: "nowrap" }}>{fmtDay(e.date)}</span>
      <span style={{ background: "var(--fm-bg-sunk)", border: `1px solid ${meta.color}`, borderRadius: "var(--fm-radius)", color: meta.color, flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.52rem", letterSpacing: "0.06em", minWidth: 74, padding: "0.1rem 0.4rem", textAlign: "center", textTransform: "uppercase" }}>{meta.label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.82rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</div>
        {sub && (
          <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", marginTop: "0.1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
        )}
      </div>
      {e.amount != null && (
        <span style={{ color: "var(--fm-ink-dim)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.7rem", whiteSpace: "nowrap" }}>{fmtMoney(e.amount)}</span>
      )}
    </div>
  );
}

export default function JournalView({ events = [], navigate }) {
  const [typeFilter, setTypeFilter]     = useState("ALL");
  const [areaFilter, setAreaFilter]     = useState("ALL");
  const [personFilter, setPersonFilter] = useState("ALL");
  const [search, setSearch]             = useState("");

  const persons = useMemo(() => {
    const s = new Set();
    events.forEach(e => { if (e.person) s.add(e.person); });
    return [...s].sort();
  }, [events]);

  const areas = useMemo(() => {
    const s = new Set();
    events.forEach(e => { if (e.system) s.add(e.system); if (e.room) s.add(e.room); });
    return [...s].sort();
  }, [events]);

  const filtered = useMemo(() => events.filter(e => {
    if (typeFilter !== "ALL" && e.type !== typeFilter) return false;
    if (areaFilter !== "ALL" && e.system !== areaFilter && e.room !== areaFilter) return false;
    if (personFilter !== "ALL" && e.person !== personFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (
        !(e.title    || "").toLowerCase().includes(q) &&
        !(e.subtitle || "").toLowerCase().includes(q) &&
        !(e.notes    || "").toLowerCase().includes(q) &&
        !(e.person   || "").toLowerCase().includes(q) &&
        !(e.system   || "").toLowerCase().includes(q) &&
        !(e.room     || "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  }), [events, typeFilter, areaFilter, personFilter, search]);

  const groups = useMemo(() => {
    const m = new Map();
    filtered.forEach(e => {
      const ym = e.date.slice(0, 7);
      if (!m.has(ym)) m.set(ym, []);
      m.get(ym).push(e);
    });
    return [...m.entries()];
  }, [filtered]);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "var(--fm-spacing-5xl)" }}>

      {/* Type filter */}
      <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.6rem" }}>
        <span style={labelStyle}>Type</span>
        <FilterPill active={typeFilter === "ALL"} onClick={() => setTypeFilter("ALL")}>All</FilterPill>
        {JOURNAL_TYPES.map(t => (
          <FilterPill key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>{TYPE_META[t].label}</FilterPill>
        ))}
      </div>

      {/* Area filter (system ∪ room) */}
      {areas.length > 0 && (
        <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.6rem" }}>
          <span style={labelStyle}>Area</span>
          <FilterPill active={areaFilter === "ALL"} onClick={() => setAreaFilter("ALL")}>All</FilterPill>
          {areas.map(a => (
            <FilterPill key={a} active={areaFilter === a} onClick={() => setAreaFilter(a)}>{a}</FilterPill>
          ))}
        </div>
      )}

      {/* Person filter */}
      {persons.length > 0 && (
        <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.6rem" }}>
          <span style={labelStyle}>Person</span>
          <FilterPill active={personFilter === "ALL"} onClick={() => setPersonFilter("ALL")}>All</FilterPill>
          {persons.map(p => (
            <FilterPill key={p} active={personFilter === p} onClick={() => setPersonFilter(p)}>{p}</FilterPill>
          ))}
        </div>
      )}

      <div style={{ marginBottom: "1rem" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search the journal…"
          style={searchStyle}
          onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
          onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"}
        />
      </div>

      {events.length === 0 ? (
        <p style={emptyStyle}>
          Nothing logged yet. Completed maintenance, chores, service visits, utility bills, and expenses appear here automatically as you record them — building the story of your home.
        </p>
      ) : filtered.length === 0 ? (
        <p style={emptyStyle}>No entries match your filter.</p>
      ) : (
        groups.map(([ym, evs]) => (
          <div key={ym} style={{ marginBottom: "1.5rem" }}>
            <div style={{ borderBottom: "1px solid var(--fm-hairline2)", color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.14em", marginBottom: "0.35rem", paddingBottom: "0.35rem", textTransform: "uppercase" }}>
              {fmtMonthHeader(ym)}
            </div>
            {evs.map(e => <JournalRow key={e.id} e={e} onNavigate={navigate} />)}
          </div>
        ))
      )}
    </div>
  );
}
