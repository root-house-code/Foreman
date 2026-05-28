import { useState, useMemo, forwardRef } from "react";
import { useForemanStore } from "./lib/store.js";
import { storageGet, storageSet } from "./lib/storage.js";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import FmHeader from "./src/components/FmHeader.jsx";
import { loadTodos } from "./lib/todos.js";
import { loadData } from "./lib/data.js";
import { loadDeletedCategories } from "./lib/deletedCategories.js";
import { loadDeletedItems } from "./lib/deletedItems.js";
import {
  loadChoreNextDates, loadChoreCompletedDates,
  computeNextOccurrenceFromStart, computeChoreNextDate,
  saveChoreNextDates, saveChoreCompletedDates,
} from "./lib/chores.js";
import { computeNextDate } from "./lib/scheduleInterval.js";
import { loadCategoryTypeOverrides } from "./lib/categoryTypes.js";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const SYS_ABBR = {
  "HVAC": "HVAC", "Plumbing": "PLM", "Electrical": "ELEC", "Appliances": "APPL",
  "Exterior": "EXT", "Structure": "STRC", "Safety": "SAF", "General": "GEN",
  "Roofing": "ROOF", "Landscaping": "LAND", "Pool": "POOL", "Irrigation": "IRR",
};

function getSysTag(cat) {
  return SYS_ABBR[cat] || (cat || "").slice(0, 4).toUpperCase();
}

function keyOf(row) {
  return `${row.category}|${row.item}|${row.task}`;
}

function fmtDate(d) {
  if (!d) return "—";
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

const card = {
  background: "var(--fm-bg-panel)",
  border: "var(--fm-border)",
  borderRadius: "var(--fm-radius-lg)",
  padding: "1.25rem 1.5rem",
};

const sectionHeader = {
  alignItems: "center",
  borderBottom: "1px solid var(--fm-hairline)",
  display: "flex",
  justifyContent: "space-between",
  marginBottom: "0.75rem",
  paddingBottom: "0.5rem",
};

const sectionTitle = {
  color: "var(--fm-brass-dim)",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.6rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const navLink = {
  background: "transparent",
  border: "none",
  color: "var(--fm-ink-dim)",
  cursor: "pointer",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.6rem",
  letterSpacing: "0.08em",
  padding: 0,
};

const emptyText = {
  color: "var(--fm-ink-dim)",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.72rem",
  padding: "0.5rem 0",
};

const rowStyle = {
  alignItems: "center",
  borderBottom: "1px solid var(--fm-hairline)",
  color: "var(--fm-ink-dim)",
  display: "flex",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.72rem",
  gap: "0.5rem",
  padding: "0.4rem 0",
};

const LogItInput = forwardRef(({ value, onClick }, ref) => (
  <button
    ref={ref}
    onClick={onClick}
    style={{
      background: "var(--fm-bg-sunk)",
      border: "1px solid var(--fm-hairline2)",
      borderRadius: "var(--fm-radius)",
      color: "var(--fm-ink)",
      cursor: "pointer",
      fontFamily: "var(--fm-mono)",
      fontSize: "0.65rem",
      padding: "0.15rem 0.4rem",
    }}
  >{value}</button>
));
LogItInput.displayName = "LogItInput";

export default function DashboardPage({ navigate }) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const in7Days = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    return d;
  }, [today]);

  const in30Days = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 30);
    return d;
  }, [today]);

  // ── Static data ──────────────────────────────────────────────────────────────
  const rows              = useMemo(() => loadData(), []);
  const deletedCategories = useMemo(() => loadDeletedCategories(), []);
  const deletedItems      = useMemo(() => loadDeletedItems(), []);
  const chores   = useForemanStore(s => s.chores);
  const todos    = useMemo(() => loadTodos(), []);
  const projects = useForemanStore(s => s.projects);

  // ── Mutable state ────────────────────────────────────────────────────────────
  const [nextDatesMap, setNextDatesMap] = useState(() => storageGet("maintenance-next-dates") ?? {});
  const [completedDatesMap, setCompletedDatesMap] = useState(() => storageGet("maintenance-dates") ?? {});
  const [choreNextDates, setChoreNextDates]           = useState(() => loadChoreNextDates());
  const [choreCompletedDates, setChoreCompletedDates] = useState(() => loadChoreCompletedDates());
  const [logItKey, setLogItKey]   = useState(null);
  const [logItDate, setLogItDate] = useState(() => new Date());

  // ── Derived: maintenance ─────────────────────────────────────────────────────
  const activeRows = useMemo(() =>
    rows.filter(row =>
      !row._isBlankCategory && row.category && row.item && row.task &&
      !deletedCategories.has(row.category) &&
      !deletedItems.has(`${row.category}|${row.item}`)
    ),
    [rows, deletedCategories, deletedItems]
  );

  const overdueItems = useMemo(() =>
    activeRows
      .filter(row => { const d = nextDatesMap[keyOf(row)]; return d && new Date(d) < today; })
      .sort((a, b) => new Date(nextDatesMap[keyOf(a)]) - new Date(nextDatesMap[keyOf(b)])),
    [activeRows, nextDatesMap, today]
  );

  const upcomingItems = useMemo(() =>
    activeRows.filter(row => {
      const d = nextDatesMap[keyOf(row)];
      if (!d) return false;
      const date = new Date(d);
      return date >= today && date <= in30Days;
    }),
    [activeRows, nextDatesMap, today, in30Days]
  );

  // ── Derived: chores ──────────────────────────────────────────────────────────
  function choreNextDate(c) {
    if (choreNextDates[c.id]) return new Date(choreNextDates[c.id]);
    if (!c.startDate) return null;
    return computeNextOccurrenceFromStart(new Date(c.startDate), c.schedule, c.dayOfWeek, c.timeOfDay);
  }

  const overdueChores = useMemo(() =>
    chores.filter(c => { const d = choreNextDate(c); return d && d < today; }),
    [chores, choreNextDates, today]
  );

  const upcomingChores = useMemo(() =>
    chores.filter(c => { const d = choreNextDate(c); return d && d >= today && d <= in7Days; }),
    [chores, choreNextDates, today, in7Days]
  );

  // ── Derived: todos / projects ────────────────────────────────────────────────
  const todoStatusCounts = useMemo(() => {
    const counts = { "not-started": 0, "in-progress": 0, "done": 0 };
    todos.forEach(t => { if (counts[t.status] != null) counts[t.status]++; });
    return counts;
  }, [todos]);

  const highPriorityTodos = useMemo(() =>
    todos
      .filter(t => (t.priority === "urgent" || t.priority === "high") && t.status !== "done" && !t._isOverdueChore)
      .sort((a, b) => (a.priority === "urgent" ? -1 : 1)),
    [todos]
  );

  const projectsWithProgress = useMemo(() =>
    projects.map(p => {
      const pt = todos.filter(t => t.projectId === p.id);
      return { ...p, total: pt.length, done: pt.filter(t => t.status === "done").length };
    }),
    [projects, todos]
  );

  // ── Completion chart ─────────────────────────────────────────────────────────
  const completionsByMonth = useMemo(() => {
    const result = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today);
      d.setMonth(d.getMonth() - i);
      result.push({ label: MONTH_LABELS[d.getMonth()], year: d.getFullYear(), month: d.getMonth(), maint: 0, chores: 0 });
    }
    Object.values(completedDatesMap).forEach(dateOrList => {
      const dates = Array.isArray(dateOrList) ? dateOrList : (dateOrList ? [dateOrList] : []);
      dates.forEach(dateStr => {
        const d = new Date(dateStr);
        const bucket = result.find(b => b.year === d.getFullYear() && b.month === d.getMonth());
        if (bucket) bucket.maint++;
      });
    });
    Object.values(choreCompletedDates).forEach(dateStr => {
      if (!dateStr) return;
      const d = new Date(dateStr);
      const bucket = result.find(b => b.year === d.getFullYear() && b.month === d.getMonth());
      if (bucket) bucket.chores++;
    });
    return result;
  }, [completedDatesMap, choreCompletedDates, today]);

  const maxCompletions = useMemo(() =>
    Math.max(...completionsByMonth.map(b => b.maint + b.chores), 1),
    [completionsByMonth]
  );

  // ── Health score ─────────────────────────────────────────────────────────────
  const healthScore = useMemo(() => {
    let penalty = 0;
    overdueItems.forEach(row => {
      const d = nextDatesMap[keyOf(row)];
      if (!d) return;
      const weeksOver = Math.max(0, (today - new Date(d)) / (1000 * 60 * 60 * 24 * 7));
      penalty += 8 * (1 + Math.log1p(weeksOver));
    });
    overdueChores.forEach(c => {
      const nd = choreNextDate(c);
      if (!nd) return;
      const weeksOver = Math.max(0, (today - nd) / (1000 * 60 * 60 * 24 * 7));
      penalty += 4 * (1 + Math.log1p(weeksOver));
    });
    return Math.max(0, Math.min(100, Math.round(100 - penalty)));
  }, [overdueItems, overdueChores, nextDatesMap, choreNextDates, today]);

  // ── Category groups (architecture) ──────────────────────────────────────────
  const categoryGroups = useMemo(() => {
    const overrides = loadCategoryTypeOverrides();
    const catInfoMap = {};
    activeRows.forEach(row => {
      if (!row.category) return;
      if (!catInfoMap[row.category]) catInfoMap[row.category] = { type: row.categoryType || "system" };
    });
    const systems = [], rooms = [];
    Object.entries(catInfoMap).forEach(([cat, info]) => {
      const type = overrides[cat] ?? info.type;
      if (type === "room") rooms.push(cat);
      else systems.push(cat);
    });
    return { systems: systems.sort(), rooms: rooms.sort() };
  }, [activeRows]);

  const catHealthMap = useMemo(() => {
    const map = {};
    [...categoryGroups.systems, ...categoryGroups.rooms].forEach(cat => {
      let penalty = 0;
      activeRows.filter(r => r.category === cat).forEach(row => {
        const d = nextDatesMap[keyOf(row)];
        if (!d) return;
        const dt = new Date(d);
        if (dt >= today) return;
        const weeksOver = Math.max(0, (today - dt) / (7 * 86400000));
        penalty += 8 * (1 + Math.log1p(weeksOver));
      });
      map[cat] = Math.max(0, Math.min(100, Math.round(100 - penalty)));
    });
    return map;
  }, [categoryGroups, activeRows, nextDatesMap, today]);

  const catNextDueMap = useMemo(() => {
    const map = {};
    activeRows.forEach(row => {
      const d = nextDatesMap[keyOf(row)];
      if (!d || !row.category) return;
      const dt = new Date(d);
      if (!map[row.category] || dt < map[row.category]) map[row.category] = dt;
    });
    return map;
  }, [activeRows, nextDatesMap]);

  // ── Triage: overdue + due this week ─────────────────────────────────────────
  const triageItems = useMemo(() => {
    const overdue = [], upcoming = [];
    activeRows.forEach(row => {
      const d = nextDatesMap[keyOf(row)];
      if (!d) return;
      const dt = new Date(d);
      const item = { type: "maint", key: `maint:${keyOf(row)}`, date: dt, label: row.task, sub: row.category, row };
      if (dt < today) overdue.push(item);
      else if (dt <= in7Days) upcoming.push(item);
    });
    chores.forEach(c => {
      const dt = choreNextDate(c);
      if (!dt) return;
      const item = { type: "chore", key: `chore:${c.id}`, date: dt, label: c.title, sub: c.room, chore: c };
      if (dt < today) overdue.push(item);
      else if (dt <= in7Days) upcoming.push(item);
    });
    overdue.sort((a, b) => a.date - b.date);
    upcoming.sort((a, b) => a.date - b.date);
    return [...overdue, ...upcoming];
  }, [activeRows, chores, nextDatesMap, choreNextDates, today, in7Days]);

  // ── Coverage ─────────────────────────────────────────────────────────────────
  const allInventoryItems = useMemo(() => {
    const seen = new Set();
    rows.forEach(row => {
      if (row._isBlankCategory || !row.category || !row.item) return;
      if (deletedCategories.has(row.category)) return;
      if (deletedItems.has(`${row.category}|${row.item}`)) return;
      seen.add(`${row.category}|${row.item}`);
    });
    return seen;
  }, [rows, deletedCategories, deletedItems]);

  const itemsWithTasksSet = useMemo(() =>
    new Set(activeRows.map(r => `${r.category}|${r.item}`)),
    [activeRows]
  );

  const zeroTaskItemCount = useMemo(() =>
    [...allInventoryItems].filter(k => !itemsWithTasksSet.has(k)).length,
    [allInventoryItems, itemsWithTasksSet]
  );

  const unscheduledTaskCount = useMemo(() =>
    activeRows.filter(row => !row.schedule && !nextDatesMap[keyOf(row)]).length,
    [activeRows, nextDatesMap]
  );

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function handleLogIt(item, date) {
    const now = date || new Date();
    if (item.type === "maint") {
      const k = keyOf(item.row);
      const newCompleted = { ...completedDatesMap, [k]: now.toISOString() };
      setCompletedDatesMap(newCompleted);
      storageSet("maintenance-dates", newCompleted);
      const nextDate = computeNextDate(now, item.row.schedule, item.row.season);
      if (nextDate) {
        const newNext = { ...nextDatesMap, [k]: nextDate.toISOString() };
        setNextDatesMap(newNext);
        storageSet("maintenance-next-dates", newNext);
      }
    } else {
      const c = item.chore;
      const base = choreNextDates[c.id] ? new Date(choreNextDates[c.id]) : now;
      const nextDate = computeChoreNextDate(base, c.schedule, c.dayOfWeek, c.timeOfDay);
      const newCompleted = { ...choreCompletedDates, [c.id]: now.toISOString() };
      setChoreCompletedDates(newCompleted);
      saveChoreCompletedDates(newCompleted);
      const newNext = { ...choreNextDates, [c.id]: nextDate.toISOString() };
      setChoreNextDates(newNext);
      saveChoreNextDates(newNext);
    }
    setLogItKey(null);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const openTodosCount = todoStatusCounts["not-started"] + todoStatusCounts["in-progress"];
  const totalOverdue   = overdueItems.length + overdueChores.length;

  function fmtDaysStatus(date) {
    if (!date) return "—";
    const days = Math.round((today - date) / 86400000);
    if (days > 0) return `${days}d late`;
    if (days === 0) return "today";
    return `T+${-days}d`;
  }

  const PRIORITY_COLORS = {
    low: "var(--fm-green)", medium: "var(--fm-brass)", high: "var(--fm-amber)", urgent: "var(--fm-red)",
  };

  return (
    <div style={{ background: "var(--fm-bg)", color: "var(--fm-ink)", display: "flex", flexDirection: "column", fontFamily: "var(--fm-sans)", height: "100vh", overflow: "hidden" }}>
      <FmHeader active="Dashboard" tagline="Dashboard" />

      <div style={{ flex: 1, overflowY: "auto", padding: "var(--fm-spacing-5xl)" }}>

        {/* Top row: health dial · stat summary · triage · systems · rooms */}
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "180px 180px 1.6fr 1fr 1fr", marginBottom: "1rem" }}>

          <CircleHealthDial score={healthScore} />

          {/* Compact stat summary */}
          <div style={{ ...card, display: "flex", flexDirection: "column", gap: "0.55rem" }}>
            <div style={{ borderBottom: "1px solid var(--fm-hairline)", marginBottom: "0.25rem", paddingBottom: "0.5rem" }}>
              <span style={sectionTitle}>At a Glance</span>
            </div>
            {[
              { label: "Overdue",  value: totalOverdue,         color: totalOverdue > 0 ? "var(--fm-red)" : "var(--fm-green)",           sub: totalOverdue > 0 ? `${overdueItems.length}m · ${overdueChores.length}c` : "all clear",        nav: () => navigate("maintenance") },
              { label: "Upcoming", value: upcomingItems.length, color: "var(--fm-amber)",                                                 sub: "maint / 30 days",                                                                              nav: () => navigate("maintenance") },
              { label: "Chores",   value: upcomingChores.length,color: upcomingChores.length > 0 ? "var(--fm-amber)" : "var(--fm-ink-dim)", sub: "due this week",                                                                             nav: () => navigate("chores") },
              { label: "To Dos",   value: openTodosCount,       color: "var(--fm-ink-mute)",                                              sub: `${todoStatusCounts["in-progress"]} in progress`,                                               nav: () => navigate("board") },
            ].map(s => (
              <button key={s.label} onClick={s.nav}
                style={{ alignItems: "baseline", background: "transparent", border: "none", cursor: "pointer", display: "flex", gap: "0.5rem", padding: 0, textAlign: "left", width: "100%" }}
                onMouseEnter={e => e.currentTarget.querySelector(".stat-label").style.color = "var(--fm-brass-dim)"}
                onMouseLeave={e => e.currentTarget.querySelector(".stat-label").style.color = "var(--fm-ink-mute)"}
              >
                <span className="stat-label" style={{ color: "var(--fm-ink-mute)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", transition: "color 0.12s", width: "52px" }}>{s.label}</span>
                <span style={{ color: s.color, fontFamily: "var(--fm-serif)", fontSize: "1.15rem", fontWeight: 300, lineHeight: 1 }}>{s.value}</span>
                <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", lineHeight: 1.3 }}>{s.sub}</span>
              </button>
            ))}
          </div>

          {/* Triage queue */}
          <div style={{ ...card, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ ...sectionHeader, flexShrink: 0 }}>
              <span style={sectionTitle}>Triage · Overdue + Due This Week</span>
              <button style={navLink} onClick={() => navigate("maintenance")}>&rarr; Maintenance</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {triageItems.length === 0 ? (
                <div style={emptyText}>All clear — nothing overdue or due this week</div>
              ) : triageItems.map(item => {
                const isOverdue = item.date < today;
                const tag = item.type === "chore" ? "CHORE" : getSysTag(item.sub);
                const isActive = logItKey === item.key;
                return (
                  <div key={item.key} style={rowStyle}>
                    <div style={{ background: isOverdue ? "var(--fm-red)" : "var(--fm-amber)", borderRadius: "50%", flexShrink: 0, height: "5px", width: "5px" }} />
                    <span style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink-dim)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.06em", padding: "0.1rem 0.35rem" }}>
                      {tag}
                    </span>
                    <span style={{ flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.78rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.type === "maint" && item.sub && <span style={{ color: "var(--fm-ink-mute)" }}>{item.sub} · </span>}
                      {item.label}
                    </span>
                    <span style={{ color: isOverdue ? "var(--fm-red)" : "var(--fm-amber)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.65rem", minWidth: "58px", textAlign: "right" }}>
                      {fmtDaysStatus(item.date)}
                    </span>
                    <div style={{ flexShrink: 0 }}>
                      {isActive ? (
                        <div style={{ alignItems: "center", display: "flex", gap: "0.35rem" }}>
                          <DatePicker
                            selected={logItDate}
                            onChange={date => setLogItDate(date)}
                            dateFormat="MM/dd/yy"
                            popperPlacement="top-end"
                            customInput={<LogItInput />}
                          />
                          <button onClick={() => handleLogIt(item, logItDate)} style={{ background: "transparent", border: "1px solid var(--fm-green)", borderRadius: "var(--fm-radius)", color: "var(--fm-green)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", padding: "0.15rem 0.35rem" }}>✓</button>
                          <button onClick={() => setLogItKey(null)} style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", padding: "0.15rem 0.35rem" }}>✕</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setLogItKey(item.key); setLogItDate(new Date()); }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
                          style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.06em", padding: "0.15rem 0.55rem", transition: "all 0.12s" }}
                        >Log it</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <ArchSection title="Systems" cats={categoryGroups.systems} catHealthMap={catHealthMap} catNextDueMap={catNextDueMap} emptyMsg="No systems in inventory" />
          <ArchSection title="Rooms"   cats={categoryGroups.rooms}   catHealthMap={catHealthMap} catNextDueMap={catNextDueMap} emptyMsg="No rooms added yet" />

        </div>

        {/* Coverage alerts */}
        {(zeroTaskItemCount > 0 || unscheduledTaskCount > 0) && (
          <div style={{ ...card, display: "flex", gap: "2rem", marginBottom: "1rem" }}>
            <div style={{ color: "var(--fm-ink-mute)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.12em", paddingTop: "0.1rem", textTransform: "uppercase" }}>Coverage</div>
            <div style={{ display: "flex", flex: 1, gap: "1.5rem" }}>
              {zeroTaskItemCount > 0 && (
                <button onClick={() => navigate("inventory", { expandAll: true })} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
                  <span style={{ color: "var(--fm-hairline2)", fontFamily: "var(--fm-mono)", fontSize: "1.4rem", fontWeight: 300 }}>{zeroTaskItemCount}</span>
                  <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", marginLeft: "0.4rem" }}>items with no tasks</span>
                </button>
              )}
              {unscheduledTaskCount > 0 && (
                <button onClick={() => navigate("inventory", { expandAll: true })} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
                  <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "1.4rem", fontWeight: 300 }}>{unscheduledTaskCount}</span>
                  <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", marginLeft: "0.4rem" }}>tasks not scheduled</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* To Dos + Projects */}
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "1fr 1fr", marginBottom: "1rem" }}>
          <div style={card}>
            <div style={sectionHeader}>
              <span style={sectionTitle}>To Dos</span>
              <button style={navLink} onClick={() => navigate("board")}>&rarr; To Dos</button>
            </div>
            <div style={{ display: "flex", gap: "1.5rem", marginBottom: "0.75rem" }}>
              {[
                { label: "Not Started", key: "not-started", color: "var(--fm-ink-dim)" },
                { label: "In Progress", key: "in-progress", color: "var(--fm-amber)" },
                { label: "Done",        key: "done",        color: "var(--fm-green)" },
              ].map(s => (
                <div key={s.key} style={{ textAlign: "center" }}>
                  <div style={{ color: s.color, fontFamily: "var(--fm-serif)", fontSize: "1.6rem", fontWeight: 300 }}>{todoStatusCounts[s.key]}</div>
                  <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>{s.label}</div>
                </div>
              ))}
            </div>
            {highPriorityTodos.length === 0 ? (
              <div style={emptyText}>No urgent or high priority items</div>
            ) : (
              <>
                <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.1em", marginBottom: "0.4rem", textTransform: "uppercase" }}>High Priority Open</div>
                {highPriorityTodos.slice(0, 6).map((t, i) => (
                  <div key={i} style={rowStyle}>
                    <span style={{ color: PRIORITY_COLORS[t.priority], minWidth: "50px" }}>{t.priority}</span>
                    <span style={{ fontFamily: "var(--fm-sans)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                  </div>
                ))}
                {highPriorityTodos.length > 6 && <div style={{ ...emptyText, marginTop: "0.25rem" }}>+{highPriorityTodos.length - 6} more</div>}
              </>
            )}
          </div>

          <div style={card}>
            <div style={sectionHeader}>
              <span style={sectionTitle}>Projects</span>
              <button style={navLink} onClick={() => navigate("projects")}>&rarr; Projects</button>
            </div>
            {projectsWithProgress.length === 0 ? (
              <div style={emptyText}>No projects yet</div>
            ) : projectsWithProgress.map((p, i) => {
              const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
              return (
                <div key={i} style={{ marginBottom: "0.85rem" }}>
                  <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                    <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-sans)", fontSize: "0.78rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                    <span style={{ color: "var(--fm-ink-mute)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.6rem", marginLeft: "0.5rem" }}>{p.done}/{p.total}</span>
                  </div>
                  <div style={{ background: "var(--fm-hairline)", borderRadius: "2px", height: "3px", width: "100%" }}>
                    <div style={{ background: pct === 100 ? "var(--fm-green)" : "var(--fm-brass)", borderRadius: "2px", height: "100%", transition: "width 0.3s", width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Schedule timeline stub */}
        <div style={{ ...card, marginBottom: "1rem", overflow: "hidden", position: "relative" }}>
          <div style={{ alignItems: "center", backdropFilter: "blur(3px)", background: "rgba(14,16,20,0.65)", bottom: 0, display: "flex", justifyContent: "center", left: 0, position: "absolute", right: 0, top: 0, zIndex: 2 }}>
            <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase" }}>Coming soon</span>
          </div>
          <div style={sectionHeader}>
            <span style={sectionTitle}>Schedule · T−30 to T+90</span>
          </div>
          <div style={{ alignItems: "center", display: "flex", height: "40px", justifyContent: "space-between", padding: "0 0.25rem", position: "relative" }}>
            <div style={{ background: "var(--fm-hairline)", height: "1px", left: 0, position: "absolute", right: 0, top: "50%" }} />
            {[...Array(9)].map((_, i) => (
              <div key={i} style={{ background: i < 2 ? "var(--fm-red)" : i < 4 ? "var(--fm-amber)" : "var(--fm-brass)", borderRadius: "50%", height: "7px", position: "relative", width: "7px", zIndex: 1 }} />
            ))}
          </div>
          <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", marginTop: "0.25rem", textAlign: "center" }}>T−30d · · · today · · · T+90d</div>
        </div>

        {/* Completion chart */}
        <div style={card}>
          <div style={sectionHeader}>
            <span style={sectionTitle}>Completed · Last 6 Months</span>
            <div style={{ alignItems: "center", display: "flex", gap: "0.9rem" }}>
              <span style={{ alignItems: "center", color: "var(--fm-ink-dim)", display: "flex", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", gap: "0.3rem" }}>
                <span style={{ background: "var(--fm-brass)", borderRadius: "1px", display: "inline-block", height: "6px", opacity: 0.55, width: "10px" }} />
                Maintenance
              </span>
              <span style={{ alignItems: "center", color: "var(--fm-ink-dim)", display: "flex", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", gap: "0.3rem" }}>
                <span style={{ background: "var(--fm-green)", borderRadius: "1px", display: "inline-block", height: "6px", opacity: 0.55, width: "10px" }} />
                Chores
              </span>
            </div>
          </div>
          <div style={{ alignItems: "flex-end", display: "flex", gap: "1rem", height: "80px" }}>
            {completionsByMonth.map((bucket, i) => {
              const total  = bucket.maint + bucket.chores;
              const maxH   = 48;
              const totalH = Math.max((total / maxCompletions) * maxH, total > 0 ? 4 : 0);
              const maintH = total > 0 ? Math.round((bucket.maint / total) * totalH) : 0;
              const choreH = totalH - maintH;
              return (
                <div key={i} style={{ alignItems: "center", display: "flex", flex: 1, flexDirection: "column", gap: "0.4rem" }}>
                  <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem" }}>{total > 0 ? total : ""}</div>
                  <div style={{ display: "flex", flexDirection: "column-reverse", justifyContent: "flex-start", width: "100%" }}>
                    <div style={{ background: bucket.maint > 0 ? "rgba(201,169,110,0.2)" : "var(--fm-hairline)", border: `1px solid ${bucket.maint > 0 ? "rgba(201,169,110,0.3)" : "var(--fm-hairline)"}`, borderRadius: maintH > 0 && choreH === 0 ? "2px 2px 0 0" : "0", height: `${Math.max(maintH, bucket.maint > 0 ? 4 : 0)}px`, minHeight: bucket.maint > 0 ? "4px" : "0", width: "100%" }} />
                    {bucket.chores > 0 && (
                      <div style={{ background: "rgba(127,176,135,0.2)", border: "1px solid rgba(127,176,135,0.3)", borderRadius: "2px 2px 0 0", height: `${Math.max(choreH, 4)}px`, width: "100%" }} />
                    )}
                  </div>
                  <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem" }}>{bucket.label}</div>
                </div>
              );
            })}
          </div>
          {completionsByMonth.every(b => b.maint + b.chores === 0) && (
            <div style={{ ...emptyText, marginTop: "0.5rem" }}>No completed maintenance or chores recorded yet</div>
          )}
        </div>

      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CircleHealthDial({ score }) {
  const [hovered, setHovered] = useState(false);
  const r = 36;
  const cx = 50, cy = 52;
  const circ = 2 * Math.PI * r;
  const arcLen = circ * 0.75;
  const fillLen = Math.max(0, (score / 100) * arcLen);
  const color = score >= 80 ? "var(--fm-green)" : score >= 50 ? "var(--fm-amber)" : "var(--fm-red)";
  const band  = score >= 80 ? "On track" : score >= 50 ? "Needs attention" : "Falling behind";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "var(--fm-bg-raised)" : "var(--fm-bg-panel)",
        border: `1px solid ${hovered ? "var(--fm-hairline2)" : "var(--fm-hairline)"}`,
        borderRadius: "var(--fm-radius-lg)",
        cursor: "default",
        display: "flex",
        flexDirection: "column",
        padding: "0.75rem 1rem",
        position: "relative",
        transition: "all 0.15s",
      }}
    >
      <div style={{ borderBottom: "1px solid var(--fm-hairline)", marginBottom: "0.25rem", paddingBottom: "0.5rem" }}>
        <span style={sectionTitle}>Home Health</span>
      </div>
      <div style={{ alignItems: "center", display: "flex", flex: 1, flexDirection: "column", gap: "0.2rem", justifyContent: "center" }}>
        <svg viewBox="0 0 100 104" width="88" height="88" style={{ display: "block" }}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--fm-hairline2)" strokeWidth={7}
            strokeDasharray={`${arcLen} ${circ - arcLen}`} strokeLinecap="round"
            transform={`rotate(225 ${cx} ${cy})`} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={7} strokeOpacity={0.85}
            strokeDasharray={`${fillLen} ${circ - fillLen}`} strokeLinecap="round"
            transform={`rotate(225 ${cx} ${cy})`}
            style={{ transition: "stroke-dasharray 0.4s ease" }} />
          <text x={cx} y={cy - 3} textAnchor="middle" dominantBaseline="middle"
            fill={color} fontFamily="var(--fm-serif)" fontSize="24" fontWeight="300">{score}</text>
          <text x={cx} y={cy + 14} textAnchor="middle"
            fill="var(--fm-ink-mute)" fontFamily="var(--fm-mono)" fontSize="7" letterSpacing="0.5">/100</text>
        </svg>
        <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem" }}>{band}</div>
      </div>

      {hovered && (
        <div style={{ background: "var(--fm-bg-raised)", border: "var(--fm-border)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", left: "0", lineHeight: 1.55, padding: "0.5rem 0.7rem", pointerEvents: "none", position: "absolute", top: "calc(100% + 8px)", whiteSpace: "normal", width: "280px", zIndex: 100 }}>
          Starts at 100. Each overdue maintenance task subtracts points — more the longer it&apos;s overdue. Chores count half as much.
        </div>
      )}
    </div>
  );
}


function HealthBar({ score }) {
  const cells = 10;
  const filled = Math.round(score / 10);
  const color = score >= 80 ? "var(--fm-green)" : score >= 50 ? "var(--fm-amber)" : "var(--fm-red)";
  return (
    <div style={{ display: "flex", gap: "2px", width: "72px" }}>
      {[...Array(cells)].map((_, i) => (
        <div key={i} style={{ background: i < filled ? color : "var(--fm-hairline)", borderRadius: "1px", flex: 1, height: "5px", opacity: i < filled ? 0.7 : 0.35 }} />
      ))}
    </div>
  );
}

function ArchSection({ title, cats, catHealthMap, catNextDueMap, emptyMsg }) {
  return (
    <div style={{ background: "var(--fm-bg-panel)", border: "var(--fm-border)", borderRadius: "var(--fm-radius-lg)", display: "flex", flexDirection: "column", minHeight: 0, padding: "1.25rem 1.5rem" }}>
      <div style={{ borderBottom: "1px solid var(--fm-hairline)", flexShrink: 0, marginBottom: "0.25rem", paddingBottom: "0.5rem" }}>
        <span style={sectionTitle}>{title}</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {cats.length === 0 ? (
          <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.5rem 0" }}>{emptyMsg}</div>
        ) : cats.map(cat => {
          const score = catHealthMap[cat] ?? 100;
          const nextDue = catNextDueMap[cat];
          return (
            <div key={cat} style={{ alignItems: "center", borderBottom: "1px solid var(--fm-hairline)", display: "flex", gap: "0.75rem", padding: "0.45rem 0" }}>
              <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-sans)", fontSize: "0.75rem", minWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat}</span>
              <HealthBar score={score} />
              <span style={{ color: score >= 80 ? "var(--fm-green)" : score >= 50 ? "var(--fm-amber)" : "var(--fm-red)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", minWidth: "26px", textAlign: "right" }}>{score}</span>
              <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", marginLeft: "auto" }}>{fmtDate(nextDue)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
