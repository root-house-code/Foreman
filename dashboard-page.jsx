import { useState, useMemo, forwardRef } from "react";
import { useForemanStore } from "./lib/store.js";
import { toMonthly } from "./lib/services.js";
import { buildRoster, computeForecast, computeReserve, computeInvested } from "./lib/lifecycleStats.js";
import { buildSupplyRows } from "./lib/supplies.js";
import { monthlyUtilitiesTotal } from "./lib/utilities.js";
import { storageGet, storageSet } from "./lib/storage.js";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import FmHeader from "./src/components/FmHeader.jsx";
import { loadTodos, saveTodos } from "./lib/todos.js";
import { loadData } from "./lib/data.js";
import { loadDeletedCategories } from "./lib/deletedCategories.js";
import { loadDeletedItems } from "./lib/deletedItems.js";
import {
  loadChoreNextDates, loadChoreCompletedDates,
  computeNextOccurrenceFromStart, computeChoreNextDate,
  saveChoreNextDates, saveChoreCompletedDates,
} from "./lib/chores.js";
import { computeNextDate } from "./lib/scheduleInterval.js";
import { loadCategoryTypeOverrides, BUILT_IN_CATEGORY_TYPES } from "./lib/categoryTypes.js";

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
  const [todos, setTodos] = useState(() => loadTodos());
  function persistTodos(next) { setTodos(next); saveTodos(next); }
  function updateTodo(id, patch) { persistTodos(todos.map(t => t.id === id ? { ...t, ...patch } : t)); }
  const projects       = useForemanStore(s => s.projects);
  const updateProject  = useForemanStore(s => s.updateProject);
  const svcData  = useForemanStore(s => s.services ?? { services: {}, visits: {} });
  const activeServices  = useMemo(() => Object.values(svcData.services).filter(s => s.active), [svcData]);
  const monthlyServices = useMemo(() => activeServices.reduce((sum, s) => sum + toMonthly(s.cost, s.billingCycle), 0), [activeServices]);

  const itemFieldValues = useForemanStore(s => s.itemFieldValues);
  const inventory       = useForemanStore(s => s.inventory);
  const lifecycleStat = useMemo(() => {
    const roster = buildRoster(itemFieldValues, inventory);
    const reserve = computeReserve(computeForecast(roster));
    if (reserve.annual > 0) {
      return { value: "$" + Math.round(reserve.annual), color: "var(--fm-amber)", sub: `reserve /yr · ${reserve.count} due soon` };
    }
    const invested = computeInvested(roster);
    return { value: "$" + Math.round(invested.total), color: "var(--fm-brass)", sub: `${invested.priced} items priced` };
  }, [itemFieldValues, inventory]);

  const supplies = useForemanStore(s => s.supplies);
  const utilData = useForemanStore(s => s.utilities);
  const monthlyUtil = useMemo(() => monthlyUtilitiesTotal(utilData), [utilData]);

  // ── Mutable state ────────────────────────────────────────────────────────────
  const [nextDatesMap, setNextDatesMap] = useState(() => storageGet("maintenance-next-dates") ?? {});
  const [completedDatesMap, setCompletedDatesMap] = useState(() => storageGet("maintenance-dates") ?? {});
  const [choreNextDates, setChoreNextDates]           = useState(() => loadChoreNextDates());
  const [choreCompletedDates, setChoreCompletedDates] = useState(() => loadChoreCompletedDates());
  const [logItKey, setLogItKey]   = useState(null);
  const [logItDate, setLogItDate] = useState(() => new Date());
  const [todoSort, setTodoSort] = useState({ col: "status", dir: "asc" });
  const [projSort, setProjSort] = useState({ col: "name",   dir: "asc" });

  function handleTodoSort(col) { setTodoSort(s => ({ col, dir: s.col === col && s.dir === "asc" ? "desc" : "asc" })); }
  function handleProjSort(col) { setProjSort(s => ({ col, dir: s.col === col && s.dir === "asc" ? "desc" : "asc" })); }

  const suppliesToBuy = useMemo(
    () => buildSupplyRows(itemFieldValues, inventory, nextDatesMap, supplies)
      .filter(r => r.status === "out" || r.status === "low").length,
    [itemFieldValues, inventory, nextDatesMap, supplies]
  );

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
      if (!catInfoMap[row.category]) {
        const type = row.categoryType || BUILT_IN_CATEGORY_TYPES[row.category] || "system";
        catInfoMap[row.category] = { type };
      }
    });
    // Include rooms that exist only as chore locations (no maintenance rows)
    chores.forEach(c => {
      if (!c.room || c.room === "Whole House") return;
      if (!catInfoMap[c.room]) {
        catInfoMap[c.room] = { type: "room" };
      }
    });
    const systems = [], rooms = [];
    Object.entries(catInfoMap).forEach(([cat, info]) => {
      const type = overrides[cat] ?? info.type;
      if (type === "room") rooms.push(cat);
      else systems.push(cat);
    });
    return { systems: systems.sort(), rooms: rooms.sort() };
  }, [activeRows, chores]);

  const catHealthMap = useMemo(() => {
    const map = {};
    [...categoryGroups.systems, ...categoryGroups.rooms].forEach(cat => {
      let penalty = 0;
      // Overdue maintenance rows in this category
      activeRows.filter(r => r.category === cat).forEach(row => {
        const d = nextDatesMap[keyOf(row)];
        if (!d) return;
        const dt = new Date(d);
        if (dt >= today) return;
        const weeksOver = Math.max(0, (today - dt) / (7 * 86400000));
        penalty += 8 * (1 + Math.log1p(weeksOver));
      });
      // Overdue chores assigned to this room
      chores.filter(c => c.room === cat).forEach(c => {
        const dt = choreNextDate(c);
        if (!dt || dt >= today) return;
        const weeksOver = Math.max(0, (today - dt) / (7 * 86400000));
        penalty += 4 * (1 + Math.log1p(weeksOver));
      });
      map[cat] = Math.max(0, Math.min(100, Math.round(100 - penalty)));
    });
    return map;
  }, [categoryGroups, activeRows, nextDatesMap, chores, choreNextDates, today]);

  const catNextDueMap = useMemo(() => {
    const map = {};
    activeRows.forEach(row => {
      const d = nextDatesMap[keyOf(row)];
      if (!d || !row.category) return;
      const dt = new Date(d);
      if (!map[row.category] || dt < map[row.category]) map[row.category] = dt;
    });
    // Include chore next dates for rooms that may have no maintenance rows
    chores.forEach(c => {
      if (!c.room || c.room === "Whole House") return;
      const dt = choreNextDate(c);
      if (!dt) return;
      if (!map[c.room] || dt < map[c.room]) map[c.room] = dt;
    });
    return map;
  }, [activeRows, nextDatesMap, chores, choreNextDates]);

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
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "130px 250px 1.2fr 1fr 1fr", marginBottom: "1rem" }}>

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
              { label: "Services", value: "$" + Math.round(monthlyServices), color: "var(--fm-cyan)", sub: `${activeServices.length} active /mo`, nav: () => navigate("services") },
              { label: "Utilities", value: "$" + Math.round(monthlyUtil), color: "var(--fm-cyan)", sub: "/mo est", nav: () => navigate("utilities") },
              { label: "Supplies", value: suppliesToBuy, color: suppliesToBuy > 0 ? "var(--fm-amber)" : "var(--fm-ink-mute)", sub: suppliesToBuy > 0 ? "to buy" : "stocked up", nav: () => navigate("supplies") },
              { label: "Lifecycle", value: lifecycleStat.value, color: lifecycleStat.color, sub: lifecycleStat.sub, nav: () => navigate("lifecycle") },
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
              <span style={sectionTitle}>Triage</span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button style={navLink} onClick={() => navigate("chores")}>&rarr; Chores</button>
                <button style={navLink} onClick={() => navigate("maintenance")}>&rarr; Maintenance</button>
              </div>
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

        {/* To Dos columnar + Projects */}
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "1fr 1fr", marginBottom: "1rem" }}>
          {/* To Dos columnar panel */}
          <div style={{ ...card, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={sectionHeader}>
              <span style={sectionTitle}>To Dos</span>
              <button style={navLink} onClick={() => navigate("board")}>&rarr; To Dos</button>
            </div>
            {todos.length === 0 ? (
              <div style={emptyText}>No to dos yet</div>
            ) : (
              <>
                <div style={{ alignItems: "center", display: "flex", gap: "0.5rem", padding: "0.3rem 0 0.15rem" }}>
                  <ColHeader label="Title"    tip="To do title"             sortKey="title"    sortState={todoSort} onSort={handleTodoSort} style={{ flex: 1, minWidth: 0 }} />
                  <ColHeader label="Status"   tip="Current status"          sortKey="status"   sortState={todoSort} onSort={handleTodoSort} style={{ width: "78px" }} />
                  <ColHeader label="Priority" tip="Priority level"          sortKey="priority" sortState={todoSort} onSort={handleTodoSort} style={{ width: "60px" }} />
                  <ColHeader label="Due"      tip="Target completion date"  sortKey="due"      sortState={todoSort} onSort={handleTodoSort} style={{ width: "60px", textAlign: "right" }} />
                  <ColHeader label="Project"  tip="Linked project, if any"  sortKey="project"  sortState={todoSort} onSort={handleTodoSort} style={{ width: "70px", textAlign: "right" }} />
                </div>
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {sortedBy(
                    todos.filter(t => !t._isOverdueChore && !t._isOverdueMaintenance),
                    todoSort.col, todoSort.dir,
                    {
                      title:    t => t.title?.toLowerCase(),
                      status:   t => STATUS_ORDER[t.status] ?? 1,
                      priority: t => PRIORITY_ORDER[t.priority] ?? 2,
                      due:      t => t.dueDate ? new Date(t.dueDate + "T00:00:00").getTime() : null,
                      project:  t => projects.find(p => p.id === t.projectId)?.name?.toLowerCase() ?? null,
                    }
                  ).map(t => {
                    const proj = projects.find(p => p.id === t.projectId);
                    return <TodoRow key={t.id} t={t} updateTodo={updateTodo} projectName={proj?.name ?? null} />;
                  })}
                </div>
              </>
            )}
          </div>

          {/* Projects columnar panel */}
          <div style={card}>
            <div style={sectionHeader}>
              <span style={sectionTitle}>Projects</span>
              <button style={navLink} onClick={() => navigate("projects")}>&rarr; Projects</button>
            </div>
            {projectsWithProgress.length === 0 ? (
              <div style={emptyText}>No projects yet</div>
            ) : (
              <>
                <div style={{ alignItems: "center", display: "flex", gap: "0.5rem", padding: "0.3rem 0 0.15rem" }}>
                  <ColHeader label="Name"     tip="Project name"                 sortKey="name"     sortState={projSort} onSort={handleProjSort} style={{ flex: 1, minWidth: 0 }} />
                  <ColHeader label="Status"   tip="Current project status"       sortKey="status"   sortState={projSort} onSort={handleProjSort} style={{ width: "78px" }} />
                  <ColHeader label="Priority" tip="Priority level"               sortKey="priority" sortState={projSort} onSort={handleProjSort} style={{ width: "60px" }} />
                  <ColHeader label="Due"      tip="Target completion date"       sortKey="due"      sortState={projSort} onSort={handleProjSort} style={{ width: "60px", textAlign: "right" }} />
                  <ColHeader label="Tasks"    tip="Completed tasks out of total" sortKey="tasks"    sortState={projSort} onSort={handleProjSort} style={{ width: "30px", textAlign: "right" }} />
                </div>
                {sortedBy(
                  projectsWithProgress, projSort.col, projSort.dir,
                  {
                    name:     p => p.name?.toLowerCase(),
                    status:   p => STATUS_ORDER[p.status] ?? 1,
                    priority: p => PRIORITY_ORDER[p.priority] ?? 2,
                    due:      p => p.dueDate ? new Date(p.dueDate + "T00:00:00").getTime() : null,
                    tasks:    p => p.totalTasks > 0 ? p.completedTasks / p.totalTasks : 0,
                  }
                ).map((p, i) => (
                  <ProjectRow key={p.id ?? i} p={p} updateProject={updateProject} />
                ))}
              </>
            )}
          </div>
        </div>

        {/* To Dos summary + Coverage — below */}
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "1fr 1fr", marginBottom: "1rem" }}>
          {/* Original To Dos summary */}
          <div style={card}>
            <div style={sectionHeader}>
              <span style={sectionTitle}>To Do Summary</span>
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
                {highPriorityTodos.slice(0, 5).map((t, i) => (
                  <div key={i} style={rowStyle}>
                    <span style={{ color: PRIORITY_COLORS[t.priority], minWidth: "50px" }}>{t.priority}</span>
                    <span style={{ fontFamily: "var(--fm-sans)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                  </div>
                ))}
                {highPriorityTodos.length > 5 && <div style={{ ...emptyText, marginTop: "0.25rem" }}>+{highPriorityTodos.length - 5} more</div>}
              </>
            )}
          </div>

          {/* Coverage */}
          <div style={card}>
            <div style={sectionHeader}>
              <span style={sectionTitle}>Coverage</span>
              <button style={navLink} onClick={() => navigate("inventory", { expandAll: true })}>&rarr; Inventory</button>
            </div>
            {zeroTaskItemCount === 0 && unscheduledTaskCount === 0 ? (
              <div style={emptyText}>All items have tasks and schedules</div>
            ) : (
              <div style={{ display: "flex", gap: "1.5rem" }}>
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
            )}
          </div>
        </div>

        {/* Schedule timeline */}
        <div style={{ ...card, marginBottom: "1rem" }}>
          <div style={sectionHeader}>
            <span style={sectionTitle}>Schedule · T−30 to T+90</span>
          </div>
          <ScheduleTimeline
            activeRows={activeRows}
            nextDatesMap={nextDatesMap}
            chores={chores}
            choreNextDate={choreNextDate}
            todos={todos}
            projects={projects}
            today={today}
          />
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

const PRIORITY_COLOR = { low: "#7fb087", medium: "#c9a96e", high: "#e0b266", urgent: "#e07b6a" };
const STATUS_STYLE = {
  done:          { bg: "rgba(127,176,135,0.1)", border: "rgba(127,176,135,0.3)", color: "var(--fm-green)" },
  "in-progress": { bg: "var(--fm-brass-bg)",    border: "rgba(201,169,110,0.3)", color: "var(--fm-brass)" },
  "not-started": { bg: "var(--fm-bg-raised)",   border: "var(--fm-hairline2)",   color: "var(--fm-ink-mute)" },
};
const STATUS_LABEL = { "not-started": "Not Started", "in-progress": "In Progress", done: "Done" };
const STATUS_ORDER   = { "in-progress": 0, "not-started": 1, done: 2 };
const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };

function sortedBy(arr, col, dir, getters) {
  return [...arr].sort((a, b) => {
    const va = getters[col]?.(a);
    const vb = getters[col]?.(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    const cmp = typeof va === "string" ? va.localeCompare(vb) : va - vb;
    return dir === "asc" ? cmp : -cmp;
  });
}

function ProjectRow({ p, updateProject }) {
  const [editingDue, setEditingDue] = useState(false);
  const ss = STATUS_STYLE[p.status] ?? STATUS_STYLE["not-started"];
  const priorityColor = PRIORITY_COLOR[p.priority] ?? "#c9a96e";
  const due = p.dueDate
    ? new Date(p.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" })
    : "—";

  const cellSelect = {
    appearance: "none", background: "transparent", border: "none", cursor: "pointer",
    fontFamily: "var(--fm-mono)", fontSize: "0.52rem", letterSpacing: "0.06em",
    outline: "none", padding: 0, textTransform: "uppercase", width: "100%",
  };

  return (
    <div style={{ alignItems: "center", borderBottom: "1px solid var(--fm-hairline)", display: "flex", gap: "0.5rem", padding: "0.4rem 0" }}>
      {/* Name */}
      <span style={{ color: "var(--fm-ink-dim)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.78rem", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>

      {/* Status */}
      <span style={{ background: ss.bg, border: `1px solid ${ss.border}`, borderRadius: "var(--fm-radius)", boxSizing: "border-box", color: ss.color, flexShrink: 0, padding: "0.1rem 0.35rem", width: "78px" }}>
        <select
          value={p.status ?? "not-started"}
          onChange={e => updateProject(p.id, { status: e.target.value })}
          style={{ ...cellSelect, color: ss.color }}
          title="Change status"
        >
          <option value="not-started">Not Started</option>
          <option value="in-progress">In Progress</option>
          <option value="done">Done</option>
        </select>
      </span>

      {/* Priority */}
      <span style={{ alignItems: "center", display: "flex", flexShrink: 0, gap: "0.25rem", width: "60px" }}>
        <span style={{ background: priorityColor, borderRadius: "50%", display: "inline-block", flexShrink: 0, height: "6px", width: "6px" }} />
        <select
          value={p.priority ?? "medium"}
          onChange={e => updateProject(p.id, { priority: e.target.value })}
          style={{ ...cellSelect, color: "var(--fm-ink-mute)", fontSize: "0.6rem", letterSpacing: 0, textTransform: "capitalize" }}
          title="Change priority"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </span>

      {/* Due date */}
      <span style={{ flexShrink: 0, textAlign: "right", width: "60px" }}>
        {editingDue ? (
          <input
            type="date"
            autoFocus
            defaultValue={p.dueDate ?? ""}
            onBlur={e => {
              updateProject(p.id, { dueDate: e.target.value || null });
              setEditingDue(false);
            }}
            onKeyDown={e => { if (e.key === "Escape") setEditingDue(false); }}
            style={{ background: "var(--fm-bg-raised)", border: "1px solid var(--fm-brass)", borderRadius: "3px", color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", outline: "none", padding: "0.1rem 0.2rem", width: "100%" }}
          />
        ) : (
          <span
            onClick={() => setEditingDue(true)}
            title="Set due date"
            style={{ color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem" }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-mute)"}
          >{due}</span>
        )}
      </span>

      {/* Tasks */}
      <span style={{ color: "var(--fm-ink-mute)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.6rem", textAlign: "right", width: "30px" }}>{p.done}/{p.total}</span>
    </div>
  );
}

const SCHED_PAST = 30;
const SCHED_FUTURE = 90;
const SCHED_TOTAL = SCHED_PAST + SCHED_FUTURE;
const DOT_R = 4;
const DOT_GAP = 3;
const TRACK_H = 72;

const TYPE_COLOR = {
  maint:   "var(--fm-brass)",
  chore:   "var(--fm-green)",
  todo:    "var(--fm-cyan)",
  project: "var(--fm-amber)",
};
const TYPE_LABEL = { maint: "Maintenance", chore: "Chore", todo: "To Do", project: "Project" };

function urgencyColor(days) {
  if (days < 0)   return "var(--fm-red)";
  if (days <= 3)  return "var(--fm-amber)";
  if (days <= 14) return "var(--fm-brass)";
  return "var(--fm-ink-dim)";
}

function SchedDot({ item }) {
  const [hover, setHover] = useState(false);
  const uc = urgencyColor(item.days);
  const tc = TYPE_COLOR[item.type];
  const color = item.days < 0 ? uc : tc;
  const dayLabel = item.days === 0 ? "Today" : item.days < 0 ? `${-item.days}d overdue` : `In ${item.days}d`;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: color,
        borderRadius: "50%",
        boxShadow: item.days < 0 ? `0 0 4px ${uc}` : "none",
        cursor: "default",
        height: DOT_R * 2,
        left: `${((item.days + SCHED_PAST) / SCHED_TOTAL) * 100}%`,
        opacity: item.days > 30 ? 0.55 : 1,
        position: "absolute",
        top: item.y,
        transform: "translateX(-50%)",
        width: DOT_R * 2,
        zIndex: hover ? 20 : 1,
      }}
    >
      {hover && (
        <div style={{
          background: "var(--fm-bg-raised)",
          border: "1px solid var(--fm-hairline2)",
          borderRadius: "4px",
          bottom: "calc(100% + 7px)",
          boxShadow: "0 4px 14px #00000050",
          color: "var(--fm-ink-dim)",
          fontFamily: "var(--fm-mono)",
          fontSize: "0.62rem",
          left: "50%",
          lineHeight: 1.5,
          maxWidth: "220px",
          minWidth: "130px",
          padding: "0.4rem 0.6rem",
          pointerEvents: "none",
          position: "absolute",
          transform: "translateX(-50%)",
          whiteSpace: "nowrap",
          zIndex: 50,
        }}>
          <div style={{ color: color, fontSize: "0.5rem", letterSpacing: "0.1em", marginBottom: "0.2rem", textTransform: "uppercase" }}>{TYPE_LABEL[item.type]}</div>
          <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</div>
          <div style={{ color: item.days < 0 ? "var(--fm-red)" : "var(--fm-ink-mute)", fontSize: "0.55rem", marginTop: "0.15rem" }}>{dayLabel}</div>
        </div>
      )}
    </div>
  );
}

function ScheduleTimeline({ activeRows, nextDatesMap, chores, choreNextDate, todos, projects, today }) {
  const items = [];

  activeRows.forEach(row => {
    const d = nextDatesMap[keyOf(row)];
    if (!d) return;
    const days = Math.round((new Date(d) - today) / 86400000);
    if (days < -SCHED_PAST || days > SCHED_FUTURE) return;
    items.push({ type: "maint", label: `${row.category} · ${row.task}`, days });
  });

  chores.forEach(c => {
    const dt = choreNextDate(c);
    if (!dt) return;
    const days = Math.round((dt - today) / 86400000);
    if (days < -SCHED_PAST || days > SCHED_FUTURE) return;
    items.push({ type: "chore", label: c.title, days });
  });

  todos.filter(t => t.dueDate && !t._isOverdueChore && !t._isOverdueMaintenance).forEach(t => {
    const days = Math.round((new Date(t.dueDate + "T00:00:00") - today) / 86400000);
    if (days < -SCHED_PAST || days > SCHED_FUTURE) return;
    items.push({ type: "todo", label: t.title, days });
  });

  projects.filter(p => p.dueDate && p.status !== "done").forEach(p => {
    const days = Math.round((new Date(p.dueDate + "T00:00:00") - today) / 86400000);
    if (days < -SCHED_PAST || days > SCHED_FUTURE) return;
    items.push({ type: "project", label: p.name, days });
  });

  // Group by day, stack vertically bottom-up
  const byDay = {};
  items.forEach(item => {
    (byDay[item.days] ??= []).push(item);
  });
  const dots = [];
  Object.entries(byDay).forEach(([dayStr, group]) => {
    group.forEach((item, i) => {
      const y = TRACK_H - DOT_R * 2 - i * (DOT_R * 2 + DOT_GAP);
      if (y < 0) return;
      dots.push({ ...item, y });
    });
  });

  // Month boundary markers within window
  const monthMarkers = [];
  for (let d = -SCHED_PAST + 1; d <= SCHED_FUTURE; d++) {
    const dt = new Date(today);
    dt.setDate(dt.getDate() + d);
    if (dt.getDate() === 1) {
      monthMarkers.push({ x: ((d + SCHED_PAST) / SCHED_TOTAL) * 100, label: dt.toLocaleDateString("en-US", { month: "short" }) });
    }
  }

  const todayX = (SCHED_PAST / SCHED_TOTAL) * 100;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {/* Dot track */}
      <div style={{ height: TRACK_H, position: "relative", width: "100%" }}>
        {/* Today vertical rule */}
        <div style={{ background: "var(--fm-brass)", bottom: 0, left: `${todayX}%`, opacity: 0.3, position: "absolute", top: 0, width: "1px" }} />
        {dots.map((dot, i) => <SchedDot key={i} item={dot} />)}
      </div>

      {/* Axis line */}
      <div style={{ background: "var(--fm-hairline2)", height: "1px", width: "100%" }} />

      {/* Axis labels */}
      <div style={{ height: "18px", position: "relative", width: "100%" }}>
        <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.48rem", left: 0, position: "absolute", top: "4px" }}>T−30d</span>
        <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.5rem", left: `${todayX}%`, position: "absolute", top: "4px", transform: "translateX(-50%)" }}>TODAY</span>
        {monthMarkers.map(m => (
          <span key={m.x} style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.48rem", left: `${m.x}%`, position: "absolute", top: "4px", transform: "translateX(-50%)" }}>{m.label}</span>
        ))}
        <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.48rem", position: "absolute", right: 0, top: "4px" }}>T+90d</span>
      </div>

      {/* Legend */}
      <div style={{ alignItems: "center", display: "flex", gap: "1.25rem", marginTop: "0.5rem" }}>
        {[["maint","Maintenance"],["chore","Chore"],["todo","To Do"],["project","Project"]].map(([type, label]) => (
          <span key={type} style={{ alignItems: "center", color: "var(--fm-ink-mute)", display: "flex", fontFamily: "var(--fm-mono)", fontSize: "0.52rem", gap: "0.3rem" }}>
            <span style={{ background: TYPE_COLOR[type], borderRadius: "50%", display: "inline-block", height: "6px", width: "6px" }} />
            {label}
          </span>
        ))}
        <span style={{ alignItems: "center", color: "var(--fm-ink-mute)", display: "flex", fontFamily: "var(--fm-mono)", fontSize: "0.52rem", gap: "0.3rem", marginLeft: "0.5rem" }}>
          <span style={{ background: "var(--fm-red)", borderRadius: "50%", display: "inline-block", height: "6px", width: "6px" }} />
          Overdue
        </span>
        <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.52rem", marginLeft: "auto" }}>{dots.length} item{dots.length !== 1 ? "s" : ""} in window</span>
      </div>
    </div>
  );
}

function TodoRow({ t, updateTodo, projectName }) {
  const [editingDue, setEditingDue] = useState(false);
  const ss = STATUS_STYLE[t.status] ?? STATUS_STYLE["not-started"];
  const priorityColor = PRIORITY_COLOR[t.priority] ?? "#c9a96e";
  const due = t.dueDate
    ? new Date(t.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" })
    : "—";

  const cellSelect = {
    appearance: "none", background: "transparent", border: "none", cursor: "pointer",
    fontFamily: "var(--fm-mono)", fontSize: "0.52rem", letterSpacing: "0.06em",
    outline: "none", padding: 0, textTransform: "uppercase", width: "100%",
  };

  return (
    <div style={{ alignItems: "center", borderBottom: "1px solid var(--fm-hairline)", display: "flex", gap: "0.5rem", padding: "0.4rem 0" }}>
      <span style={{ color: t.status === "done" ? "var(--fm-ink-mute)" : "var(--fm-ink-dim)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.78rem", minWidth: 0, overflow: "hidden", textDecoration: t.status === "done" ? "line-through" : "none", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>

      {/* Status */}
      <span style={{ background: ss.bg, border: `1px solid ${ss.border}`, borderRadius: "var(--fm-radius)", boxSizing: "border-box", color: ss.color, flexShrink: 0, padding: "0.1rem 0.35rem", width: "78px" }}>
        <select value={t.status ?? "not-started"} onChange={e => updateTodo(t.id, { status: e.target.value })} style={{ ...cellSelect, color: ss.color }} title="Change status">
          <option value="not-started">Not Started</option>
          <option value="in-progress">In Progress</option>
          <option value="done">Done</option>
        </select>
      </span>

      {/* Priority */}
      <span style={{ alignItems: "center", display: "flex", flexShrink: 0, gap: "0.25rem", width: "60px" }}>
        <span style={{ background: priorityColor, borderRadius: "50%", display: "inline-block", flexShrink: 0, height: "6px", width: "6px" }} />
        <select value={t.priority ?? "medium"} onChange={e => updateTodo(t.id, { priority: e.target.value })} style={{ ...cellSelect, color: "var(--fm-ink-mute)", fontSize: "0.6rem", letterSpacing: 0, textTransform: "capitalize" }} title="Change priority">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </span>

      {/* Due date */}
      <span style={{ flexShrink: 0, textAlign: "right", width: "60px" }}>
        {editingDue ? (
          <input type="date" autoFocus defaultValue={t.dueDate ?? ""}
            onBlur={e => { updateTodo(t.id, { dueDate: e.target.value || null }); setEditingDue(false); }}
            onKeyDown={e => { if (e.key === "Escape") setEditingDue(false); }}
            style={{ background: "var(--fm-bg-raised)", border: "1px solid var(--fm-brass)", borderRadius: "3px", color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", outline: "none", padding: "0.1rem 0.2rem", width: "100%" }}
          />
        ) : (
          <span onClick={() => setEditingDue(true)} title="Set due date"
            style={{ color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem" }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-mute)"}
          >{due}</span>
        )}
      </span>

      {/* Project */}
      <span style={{ color: "var(--fm-ink-mute)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.58rem", overflow: "hidden", textAlign: "right", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "70px" }} title={projectName ?? ""}>{projectName ?? "—"}</span>
    </div>
  );
}

function ColHeader({ label, tip, style: extraStyle = {}, sortKey, sortState, onSort }) {
  const [visible, setVisible] = useState(false);
  const isActive = sortKey && sortState?.col === sortKey;
  const isClickable = !!(sortKey && onSort);
  return (
    <span
      style={{ position: "relative", cursor: isClickable ? "pointer" : "default", userSelect: "none", ...extraStyle }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onClick={isClickable ? () => onSort(sortKey) : undefined}
    >
      <span style={{
        alignItems: "center",
        borderBottom: `1px ${isClickable ? "solid" : "dotted"} ${isActive ? "var(--fm-brass)" : "var(--fm-hairline2)"}`,
        color: isActive ? "var(--fm-brass)" : "var(--fm-ink-mute)",
        display: "inline-flex",
        fontFamily: "var(--fm-mono)",
        fontSize: "0.55rem",
        gap: "0.2rem",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
      }}>
        {label}
        {isActive && <span style={{ fontSize: "0.45rem", lineHeight: 1 }}>{sortState.dir === "asc" ? "▲" : "▼"}</span>}
      </span>
      {visible && tip && (
        <span style={{
          background: "var(--fm-bg-raised)",
          border: "1px solid var(--fm-hairline2)",
          borderRadius: "4px",
          bottom: "calc(100% + 6px)",
          boxShadow: "0 4px 12px #00000040",
          color: "var(--fm-ink-dim)",
          fontFamily: "var(--fm-mono)",
          fontSize: "0.65rem",
          left: "50%",
          lineHeight: 1.5,
          padding: "0.4rem 0.6rem",
          pointerEvents: "none",
          position: "absolute",
          transform: "translateX(-50%)",
          whiteSpace: "nowrap",
          zIndex: 50,
        }}>
          {tip}
        </span>
      )}
    </span>
  );
}

function ArchSection({ title, cats, catHealthMap, catNextDueMap, emptyMsg }) {
  const [sortCol, setSortCol] = useState("name");
  const [sortDir, setSortDir] = useState("asc");

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  }

  const sortState = { col: sortCol, dir: sortDir };

  const sortedCats = useMemo(() => {
    const getters = {
      name:    cat => cat.toLowerCase(),
      score:   cat => catHealthMap[cat] ?? 100,
      nextDue: cat => catNextDueMap[cat] ? catNextDueMap[cat].getTime() : null,
    };
    return sortedBy(cats, sortCol, sortDir, getters);
  }, [cats, sortCol, sortDir, catHealthMap, catNextDueMap]);

  return (
    <div style={{ background: "var(--fm-bg-panel)", border: "var(--fm-border)", borderRadius: "var(--fm-radius-lg)", display: "flex", flexDirection: "column", minHeight: 0, padding: "1.25rem 1.5rem" }}>
      <div style={{ borderBottom: "1px solid var(--fm-hairline)", flexShrink: 0, marginBottom: "0.25rem", paddingBottom: "0.5rem" }}>
        <span style={sectionTitle}>{title}</span>
      </div>
      {cats.length > 0 && (
        <div style={{ alignItems: "center", display: "flex", gap: "0.75rem", padding: "0.3rem 0 0.15rem" }}>
          <ColHeader label="Name"     tip="Category name"                                                         sortKey="name"    sortState={sortState} onSort={handleSort} style={{ flex: "0 0 120px" }} />
          <ColHeader label="Health"   tip="Maintenance health — drops as tasks go overdue"                        sortKey="score"   sortState={sortState} onSort={handleSort} style={{ flex: 1 }} />
          <ColHeader label="Score"    tip="0–100 score; loses points per overdue task, weighted by how late"      sortKey="score"   sortState={sortState} onSort={handleSort} style={{ flex: "0 0 32px", textAlign: "right" }} />
          <ColHeader label="Next Due" tip="Earliest upcoming task due date across all items in this category"     sortKey="nextDue" sortState={sortState} onSort={handleSort} style={{ flex: "0 0 52px", textAlign: "right" }} />
        </div>
      )}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {cats.length === 0 ? (
          <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.5rem 0" }}>{emptyMsg}</div>
        ) : sortedCats.map(cat => {
          const score = catHealthMap[cat] ?? 100;
          const nextDue = catNextDueMap[cat];
          return (
            <div key={cat} style={{ alignItems: "center", borderBottom: "1px solid var(--fm-hairline)", display: "flex", gap: "0.75rem", padding: "0.45rem 0" }}>
              <span style={{ color: "var(--fm-ink-dim)", flex: "0 0 120px", fontFamily: "var(--fm-sans)", fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat}</span>
              <HealthBar score={score} />
              <span style={{ color: score >= 80 ? "var(--fm-green)" : score >= 50 ? "var(--fm-amber)" : "var(--fm-red)", flex: "0 0 32px", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", textAlign: "right" }}>{score}</span>
              <span style={{ color: "var(--fm-ink-mute)", flex: "0 0 52px", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", textAlign: "right" }}>{fmtDate(nextDue)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
