import { useState, useMemo, useEffect } from "react";
import RGL, { WidthProvider } from "react-grid-layout/legacy";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

// Classic v1 flat-prop API (react-grid-layout/legacy). WidthProvider measures
// the container automatically — no manual width wiring needed. The v2 config
// API (gridConfig/dragConfig/resizeConfig) is a beta; legacy is stable + documented.
const GridLayout = WidthProvider(RGL);
import { useForemanStore } from "./lib/store.js";
import { toMonthly } from "./lib/services.js";
import { buildRoster, computeForecast, computeReserve, computeInvested, computeRepairs12mo } from "./lib/lifecycleStats.js";
import { buildForecast, summarize } from "./lib/budgetForecast.js";
import { buildSupplyRows } from "./lib/supplies.js";
import { monthlyUtilitiesTotal } from "./lib/utilities.js";
import { storageGet, storageSet } from "./lib/storage.js";
import FmHeader from "./src/components/FmHeader.jsx";
import { loadTodos } from "./lib/todos.js";
import { loadData } from "./lib/data.js";
import { loadDeletedCategories } from "./lib/deletedCategories.js";
import { loadDeletedItems } from "./lib/deletedItems.js";
import {
  loadChoreNextDates, loadChoreCompletedDates, computeNextOccurrenceFromStart,
} from "./lib/chores.js";
import { loadCategoryTypeOverrides, BUILT_IN_CATEGORY_TYPES } from "./lib/categoryTypes.js";
import { runQuery } from "./lib/dashboardQuery.js";
import VisualizationBuilderModal, { fmtLabelValue, renderPieValueLabel, LEGEND_PROPS } from "./components/VisualizationBuilderModal.jsx";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, Legend,
} from "recharts";

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];


const DEFAULT_LAYOUT = [
  { i: "health-dial",   x: 0,  y: 0,  w: 2,  h: 8, minW: 2, minH: 5 },
  { i: "at-a-glance",   x: 2,  y: 0,  w: 4,  h: 8, minW: 2, minH: 4 },
  { i: "systems",       x: 6,  y: 0,  w: 3,  h: 8, minW: 2, minH: 4 },
  { i: "rooms",         x: 9,  y: 0,  w: 3,  h: 8, minW: 2, minH: 4 },
  { i: "schedule",      x: 0,  y: 8,  w: 12, h: 6, minW: 4, minH: 4 },
  { i: "completions",   x: 0,  y: 14, w: 12, h: 6, minW: 4, minH: 4 },
];

// Panels removed from the dashboard; drop them from any saved layout so the
// grid doesn't reserve stale slots for users who had them positioned.
const REMOVED_PANEL_IDS = new Set(["due-this-week", "coverage"]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function keyOf(row) { return `${row.category}|${row.item}|${row.task}`; }

function fmtDate(d) {
  if (!d) return "—";
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const card = {
  background: "var(--fm-bg-panel)",
  border: "var(--fm-border)",
  borderRadius: "var(--fm-radius-lg)",
  padding: "1.25rem 1.5rem",
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
  transition: "color 0.12s",
};

const emptyText = {
  color: "var(--fm-ink-dim)",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.72rem",
  padding: "0.5rem 0",
};


// ── DashboardPanel ────────────────────────────────────────────────────────────

function DashboardPanel({ title, children, onDeepLink, deepLinkLabel, isEditMode = false }) {
  const [hoverLink, setHoverLink] = useState(false);
  return (
    <div style={{ background: "var(--fm-bg-panel)", border: isEditMode ? "1px dashed var(--fm-brass)" : "var(--fm-border)", borderRadius: "var(--fm-radius-lg)", cursor: isEditMode ? "grab" : "default", display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", transition: "border 0.15s", userSelect: isEditMode ? "none" : "auto" }}>
      <div
        style={{ alignItems: "center", background: isEditMode ? "rgba(201,169,110,0.06)" : "transparent", borderBottom: "1px solid var(--fm-hairline)", display: "flex", flexShrink: 0, justifyContent: "space-between", padding: isEditMode ? "0.7rem 1.25rem 0.6rem" : "0.65rem 1.25rem 0.55rem" }}
      >
        <span style={sectionTitle}>{title}</span>
        <div style={{ alignItems: "center", display: "flex", gap: "0.75rem" }}>
          {!isEditMode && onDeepLink && (
            <button
              onClick={e => { e.stopPropagation(); onDeepLink(); }}
              onMouseEnter={() => setHoverLink(true)}
              onMouseLeave={() => setHoverLink(false)}
              style={{ ...navLink, color: hoverLink ? "var(--fm-brass-dim)" : "var(--fm-ink-mute)" }}
            >
              → {deepLinkLabel || "View"}
            </button>
          )}
          <span style={{ color: isEditMode ? "var(--fm-brass)" : "var(--fm-hairline2)", fontSize: isEditMode ? "0.85rem" : "0.7rem", lineHeight: 1, opacity: isEditMode ? 0.7 : 1, transition: "color 0.15s" }}>⠿</span>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "0.75rem 1.25rem 1rem" }}>
        {children}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage({ navigate }) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const in7Days  = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() + 7); return d; }, [today]);
  const in30Days = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() + 30); return d; }, [today]);

  // ── Data ──────────────────────────────────────────────────────────────────

  const rows              = useMemo(() => loadData(), []);
  const deletedCategories = useMemo(() => loadDeletedCategories(), []);
  const deletedItems      = useMemo(() => loadDeletedItems(), []);
  const chores       = useForemanStore(s => s.chores);
  const projects     = useForemanStore(s => s.projects);
  const svcData      = useForemanStore(s => s.services ?? { services: {}, visits: {} });
  const itemFieldValues = useForemanStore(s => s.itemFieldValues);
  const inventory    = useForemanStore(s => s.inventory);
  const supplies     = useForemanStore(s => s.supplies);
  const utilData     = useForemanStore(s => s.utilities);
  const expensesMap  = useForemanStore(s => s.expenses);
  const budget       = useForemanStore(s => s.budget);

  const todos             = useMemo(() => loadTodos(), []);
  const nextDatesMap      = useMemo(() => storageGet("maintenance-next-dates") ?? {}, []);
  const completedDatesMap = useMemo(() => storageGet("maintenance-dates") ?? {}, []);
  const choreNextDates    = useMemo(() => loadChoreNextDates(), []);
  const choreCompletedDates = useMemo(() => loadChoreCompletedDates(), []);

  const activeServices  = useMemo(() => Object.values(svcData.services).filter(s => s.active), [svcData]);
  const monthlyServices = useMemo(() => activeServices.reduce((sum, s) => sum + toMonthly(s.cost, s.billingCycle), 0), [activeServices]);
  const monthlyUtil     = useMemo(() => monthlyUtilitiesTotal(utilData), [utilData]);

  const lifecycleStat = useMemo(() => {
    const roster  = buildRoster(itemFieldValues, inventory);
    const reserve = computeReserve(computeForecast(roster));
    if (reserve.annual > 0) return { value: "$" + Math.round(reserve.annual), color: "var(--fm-amber)", sub: `reserve /yr · ${reserve.count} due soon` };
    const invested = computeInvested(roster);
    return { value: "$" + Math.round(invested.total), color: "var(--fm-brass)", sub: `${invested.priced} items priced` };
  }, [itemFieldValues, inventory]);

  const runCost = useMemo(() => {
    const roster  = buildRoster(itemFieldValues, inventory);
    const reserve = computeReserve(computeForecast(roster));
    const months  = buildForecast({
      svcData, utilData,
      reserveAnnual: reserve.annual,
      repairs12mo: computeRepairs12mo(expensesMap),
      planned: budget.planned,
      opts: { includeReserve: budget.includeReserve, includeRepairsBaseline: budget.includeRepairsBaseline },
    });
    return summarize(months).avgMonthly;
  }, [itemFieldValues, inventory, svcData, utilData, expensesMap, budget]);

  const suppliesToBuy = useMemo(
    () => buildSupplyRows(itemFieldValues, inventory, nextDatesMap, supplies).filter(r => r.status === "out" || r.status === "low").length,
    [itemFieldValues, inventory, nextDatesMap, supplies]
  );

  // ── Derived: maintenance ─────────────────────────────────────────────────

  const activeRows = useMemo(() =>
    rows.filter(row =>
      !row._isBlankCategory && row.category && row.item && row.task &&
      !deletedCategories.has(row.category) &&
      !deletedItems.has(`${row.category}|${row.item}`)
    ),
    [rows, deletedCategories, deletedItems]
  );

  const overdueItems = useMemo(() =>
    activeRows.filter(row => { const d = nextDatesMap[keyOf(row)]; return d && new Date(d) < today; })
      .sort((a, b) => new Date(nextDatesMap[keyOf(a)]) - new Date(nextDatesMap[keyOf(b)])),
    [activeRows, nextDatesMap, today]
  );

  const upcomingItems = useMemo(() =>
    activeRows.filter(row => {
      const d = nextDatesMap[keyOf(row)];
      if (!d) return false;
      const dt = new Date(d);
      return dt >= today && dt <= in30Days;
    }),
    [activeRows, nextDatesMap, today, in30Days]
  );

  // ── Derived: chores ──────────────────────────────────────────────────────

  function choreNextDate(c) {
    if (choreNextDates[c.id]) return new Date(choreNextDates[c.id]);
    if (!c.startDate) return null;
    return computeNextOccurrenceFromStart(new Date(c.startDate), c.schedule, c.dayOfWeek, c.timeOfDay);
  }

  const overdueChores = useMemo(() => chores.filter(c => { const d = choreNextDate(c); return d && d < today; }), [chores, choreNextDates, today]);
  const upcomingChores = useMemo(() => chores.filter(c => { const d = choreNextDate(c); return d && d >= today && d <= in7Days; }), [chores, choreNextDates, today, in7Days]);

  // ── Derived: todos ───────────────────────────────────────────────────────

  const todoStatusCounts = useMemo(() => {
    const c = { "not-started": 0, "in-progress": 0, done: 0 };
    todos.forEach(t => { if (c[t.status] != null) c[t.status]++; });
    return c;
  }, [todos]);

  // ── Completions chart ────────────────────────────────────────────────────

  const completionsByMonth = useMemo(() => {
    const result = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today); d.setMonth(d.getMonth() - i);
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

  const maxCompletions = useMemo(() => Math.max(...completionsByMonth.map(b => b.maint + b.chores), 1), [completionsByMonth]);

  // ── Health score ─────────────────────────────────────────────────────────

  const healthScore = useMemo(() => {
    let penalty = 0;
    overdueItems.forEach(row => {
      const d = nextDatesMap[keyOf(row)];
      if (!d) return;
      penalty += 8 * (1 + Math.log1p(Math.max(0, (today - new Date(d)) / (1000 * 60 * 60 * 24 * 7))));
    });
    overdueChores.forEach(c => {
      const nd = choreNextDate(c);
      if (!nd) return;
      penalty += 4 * (1 + Math.log1p(Math.max(0, (today - nd) / (1000 * 60 * 60 * 24 * 7))));
    });
    return Math.max(0, Math.min(100, Math.round(100 - penalty)));
  }, [overdueItems, overdueChores, nextDatesMap, choreNextDates, today]);

  // ── Category groups ───────────────────────────────────────────────────────

  const categoryGroups = useMemo(() => {
    const overrides = loadCategoryTypeOverrides();
    const catInfoMap = {};
    activeRows.forEach(row => {
      if (!row.category || catInfoMap[row.category]) return;
      catInfoMap[row.category] = { type: row.categoryType || BUILT_IN_CATEGORY_TYPES[row.category] || "system" };
    });
    chores.forEach(c => {
      if (!c.room || c.room === "Whole House" || catInfoMap[c.room]) return;
      catInfoMap[c.room] = { type: "room" };
    });
    const systems = [], rooms = [];
    Object.entries(catInfoMap).forEach(([cat, info]) => {
      (overrides[cat] ?? info.type) === "room" ? rooms.push(cat) : systems.push(cat);
    });
    return { systems: systems.sort(), rooms: rooms.sort() };
  }, [activeRows, chores]);

  const catHealthMap = useMemo(() => {
    const map = {};
    [...categoryGroups.systems, ...categoryGroups.rooms].forEach(cat => {
      let penalty = 0;
      activeRows.filter(r => r.category === cat).forEach(row => {
        const d = nextDatesMap[keyOf(row)]; if (!d) return;
        const dt = new Date(d); if (dt >= today) return;
        penalty += 8 * (1 + Math.log1p(Math.max(0, (today - dt) / (7 * 86400000))));
      });
      chores.filter(c => c.room === cat).forEach(c => {
        const dt = choreNextDate(c); if (!dt || dt >= today) return;
        penalty += 4 * (1 + Math.log1p(Math.max(0, (today - dt) / (7 * 86400000))));
      });
      map[cat] = Math.max(0, Math.min(100, Math.round(100 - penalty)));
    });
    return map;
  }, [categoryGroups, activeRows, nextDatesMap, chores, choreNextDates, today]);

  const catNextDueMap = useMemo(() => {
    const map = {};
    activeRows.forEach(row => {
      const d = nextDatesMap[keyOf(row)]; if (!d || !row.category) return;
      const dt = new Date(d);
      if (!map[row.category] || dt < map[row.category]) map[row.category] = dt;
    });
    chores.forEach(c => {
      if (!c.room || c.room === "Whole House") return;
      const dt = choreNextDate(c); if (!dt) return;
      if (!map[c.room] || dt < map[c.room]) map[c.room] = dt;
    });
    return map;
  }, [activeRows, nextDatesMap, chores, choreNextDates]);

  const totalOverdue   = overdueItems.length + overdueChores.length;
  const openTodosCount = todoStatusCounts["not-started"] + todoStatusCounts["in-progress"];

  // ── Layout ────────────────────────────────────────────────────────────────

  const [layout, setLayout] = useState(() => {
    const saved = storageGet("foreman-dashboard-layout");
    if (saved && Array.isArray(saved) && saved.length > 0) {
      return saved
        .filter(item => !REMOVED_PANEL_IDS.has(item.i))
        .map(({ isDraggable, isResizable, ...item }) => item);
    }
    return DEFAULT_LAYOUT;
  });

  function cleanLayout(newLayout) {
    return newLayout.map(({ isDraggable, isResizable, ...item }) => item);
  }

  function handleLayoutChange(newLayout) {
    const clean = cleanLayout(newLayout);
    setLayout(clean);
    storageSet("foreman-dashboard-layout", clean);
  }

  function handleResetLayout() {
    setLayout([...DEFAULT_LAYOUT]);
    storageSet("foreman-dashboard-layout", DEFAULT_LAYOUT);
  }

  // ── Custom panels ─────────────────────────────────────────────────────────

  const [customPanels, setCustomPanels] = useState(() => storageGet("foreman-dashboard-custom-panels") ?? []);
  const [builderOpen,  setBuilderOpen]  = useState(false);
  const [editingPanel, setEditingPanel] = useState(null);

  function persistCustomPanels(panels) {
    setCustomPanels(panels);
    storageSet("foreman-dashboard-custom-panels", panels);
  }

  function handleAddPanel(config) {
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newPanels = [...customPanels, { id, ...config }];
    persistCustomPanels(newPanels);
    const newLayout = [...cleanLayout(layout), { i: id, x: 0, y: Infinity, w: 6, h: 6, minW: 3, minH: 3 }];
    setLayout(newLayout);
    storageSet("foreman-dashboard-layout", newLayout);
    setBuilderOpen(false);
    setEditingPanel(null);
  }

  function handleUpdatePanel(config) {
    const updated = customPanels.map(p => p.id === editingPanel ? { ...p, ...config } : p);
    persistCustomPanels(updated);
    setEditingPanel(null);
  }

  function handleDeletePanel(id) {
    persistCustomPanels(customPanels.filter(p => p.id !== id));
    const newLayout = cleanLayout(layout.filter(l => l.i !== id));
    setLayout(newLayout);
    storageSet("foreman-dashboard-layout", newLayout);
  }

  // ── Edit mode ─────────────────────────────────────────────────────────────

  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    if (!isEditMode) return;
    const onKey = e => { if (e.key === "Escape") setIsEditMode(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isEditMode]);


  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: "var(--fm-bg)", color: "var(--fm-ink)", display: "flex", flexDirection: "column", fontFamily: "var(--fm-sans)", height: "100vh", overflow: "hidden" }}>
      <FmHeader active="Dashboard" tagline="Dashboard" />

      {/* Subbar — two modes */}
      {isEditMode ? (
        <div style={{ alignItems: "center", background: "rgba(201,169,110,0.07)", borderBottom: "1px solid var(--fm-brass)", display: "flex", gap: "1rem", justifyContent: "space-between", padding: "0.55rem 1.5rem" }}>
          <span style={{ color: "var(--fm-brass)", fontFamily: "var(--fm-mono)", fontSize: "0.63rem", letterSpacing: "0.09em" }}>
            ◉ ARRANGING LAYOUT &nbsp;·&nbsp; drag panel headers to move &nbsp;·&nbsp; drag corners to resize &nbsp;·&nbsp; Esc to exit
          </span>
          <div style={{ alignItems: "center", display: "flex", gap: "0.6rem" }}>
            <button
              onClick={handleResetLayout}
              style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.06em", padding: "0.25rem 0.7rem", transition: "all 0.1s" }}
              onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink)"}
              onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
            >Reset</button>
            <button
              onClick={() => setIsEditMode(false)}
              style={{ background: "var(--fm-brass)", border: "none", borderRadius: "var(--fm-radius)", color: "var(--fm-bg)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.08em", padding: "0.28rem 0.9rem", transition: "opacity 0.1s" }}
              onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
              onMouseLeave={e => e.currentTarget.style.opacity = "1"}
            >✓ Done</button>
          </div>
        </div>
      ) : (
        <div style={{ alignItems: "center", background: "var(--fm-bg-raised)", borderBottom: "var(--fm-border)", display: "flex", gap: "0.75rem", justifyContent: "flex-end", padding: "0.5rem 1.5rem" }}>
          <button
            onClick={() => { setEditingPanel(null); setBuilderOpen(true); }}
            style={{ background: "var(--fm-brass-bg)", border: "1px solid var(--fm-brass)", borderRadius: "var(--fm-radius)", color: "var(--fm-brass)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.06em", padding: "0.2rem 0.75rem", transition: "all 0.12s" }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--fm-brass)22"}
            onMouseLeave={e => e.currentTarget.style.background = "var(--fm-brass-bg)"}
          >+ Add Visualization</button>
          <button
            onClick={() => setIsEditMode(true)}
            style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.06em", padding: "0.2rem 0.75rem", transition: "all 0.12s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
          >⊞ Arrange Panels</button>
        </div>
      )}

      {/* Resize handle styling — only visible in edit mode */}
      {isEditMode && (
        <style>{`
          .react-resizable-handle-se {
            width: 30px !important;
            height: 30px !important;
          }
          .react-resizable-handle-se::after {
            right: 5px !important;
            bottom: 5px !important;
            width: 13px !important;
            height: 13px !important;
            border-right: 2.5px solid #c9a96e !important;
            border-bottom: 2.5px solid #c9a96e !important;
          }
        `}</style>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "0.75rem 1rem 3rem" }}>
        <GridLayout
          layout={layout}
          cols={12}
          rowHeight={36}
          margin={[10, 10]}
          isDraggable={isEditMode}
          isResizable={isEditMode}
          draggableCancel="button,a,input,select,textarea"
          onLayoutChange={handleLayoutChange}
          useCSSTransforms
        >
          {/* Health Dial */}
          <div key="health-dial" style={{ overflow: "hidden" }}>
            <DashboardPanel isEditMode={isEditMode} title="Home Health">
              <div style={{ alignItems: "center", display: "flex", flexDirection: "column", gap: "0.2rem", justifyContent: "center", paddingTop: "0.5rem" }}>
                <CircleHealthDial score={healthScore} />
              </div>
            </DashboardPanel>
          </div>

          {/* At a Glance */}
          <div key="at-a-glance" style={{ overflow: "hidden" }}>
            <DashboardPanel isEditMode={isEditMode} title="At a Glance">
              <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                {[
                  { label: "Overdue",   value: totalOverdue,              color: totalOverdue > 0 ? "var(--fm-red)" : "var(--fm-green)", sub: totalOverdue > 0 ? `${overdueItems.length}m · ${overdueChores.length}c` : "all clear", nav: () => navigate("workbench") },
                  { label: "Upcoming",  value: upcomingItems.length,      color: "var(--fm-amber)",                                       sub: "maint · 30 days",   nav: () => navigate("maintenance") },
                  { label: "Chores",    value: upcomingChores.length,     color: upcomingChores.length > 0 ? "var(--fm-amber)" : "var(--fm-ink-dim)", sub: "due this week", nav: () => navigate("chores") },
                  { label: "To Dos",    value: openTodosCount,            color: "var(--fm-ink-mute)",                                    sub: `${todoStatusCounts["in-progress"]} in progress`, nav: () => navigate("board") },
                  { label: "Services",  value: "$" + Math.round(monthlyServices), color: "var(--fm-cyan)", sub: `${activeServices.length} active /mo`, nav: () => navigate("services") },
                  { label: "Utilities", value: "$" + Math.round(monthlyUtil), color: "var(--fm-cyan)",    sub: "/mo est",                nav: () => navigate("utilities") },
                  { label: "Supplies",  value: suppliesToBuy,             color: suppliesToBuy > 0 ? "var(--fm-amber)" : "var(--fm-ink-mute)", sub: suppliesToBuy > 0 ? "to buy" : "stocked up", nav: () => navigate("supplies") },
                  { label: "Run cost",  value: runCost > 0 ? "$" + Math.round(runCost) : "—", color: "var(--fm-brass)", sub: "/mo to operate", nav: () => navigate("forecast") },
                  { label: "Finances",  value: lifecycleStat.value,       color: lifecycleStat.color,                                     sub: lifecycleStat.sub,   nav: () => navigate("ledger") },
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
            </DashboardPanel>
          </div>

          {/* Systems */}
          <div key="systems" style={{ overflow: "hidden" }}>
            <DashboardPanel isEditMode={isEditMode} title="Systems" onDeepLink={() => navigate("maintenance")} deepLinkLabel="Maintenance">
              <ArchSection cats={categoryGroups.systems} catHealthMap={catHealthMap} catNextDueMap={catNextDueMap} emptyMsg="No systems in inventory" unstyled />
            </DashboardPanel>
          </div>

          {/* Rooms */}
          <div key="rooms" style={{ overflow: "hidden" }}>
            <DashboardPanel isEditMode={isEditMode} title="Rooms" onDeepLink={() => navigate("maintenance")} deepLinkLabel="Maintenance">
              <ArchSection cats={categoryGroups.rooms} catHealthMap={catHealthMap} catNextDueMap={catNextDueMap} emptyMsg="No rooms added yet" unstyled />
            </DashboardPanel>
          </div>

          {/* Schedule */}
          <div key="schedule" style={{ overflow: "hidden" }}>
            <DashboardPanel isEditMode={isEditMode} title="Schedule · T−30 to T+90">
              <ScheduleTimeline
                activeRows={activeRows}
                nextDatesMap={nextDatesMap}
                chores={chores}
                choreNextDate={choreNextDate}
                todos={todos}
                projects={projects}
                today={today}
              />
            </DashboardPanel>
          </div>

          {/* Completions */}
          <div key="completions" style={{ overflow: "hidden" }}>
            <DashboardPanel isEditMode={isEditMode} title="Completed · Last 6 Months">
              <div style={{ alignItems: "center", display: "flex", gap: "0.9rem", marginBottom: "0.5rem" }}>
                {[["var(--fm-brass)", "Maintenance"], ["var(--fm-green)", "Chores"]].map(([color, label]) => (
                  <span key={label} style={{ alignItems: "center", color: "var(--fm-ink-dim)", display: "flex", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", gap: "0.3rem" }}>
                    <span style={{ background: color, borderRadius: "1px", display: "inline-block", height: "6px", opacity: 0.55, width: "10px" }} />
                    {label}
                  </span>
                ))}
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
            </DashboardPanel>
          </div>
          {/* Custom panels */}
          {customPanels.map(panel => (
            <div key={panel.id}>
              <CustomPanel
                isEditMode={isEditMode}
                panel={panel}
                onEdit={() => { setEditingPanel(panel.id); setBuilderOpen(true); }}
                onDelete={() => handleDeletePanel(panel.id)}
              />
            </div>
          ))}
        </GridLayout>
      </div>

      {/* Visualization builder modal */}
      {builderOpen && (
        <VisualizationBuilderModal
          initialConfig={editingPanel ? customPanels.find(p => p.id === editingPanel) : null}
          onSave={editingPanel ? handleUpdatePanel : handleAddPanel}
          onClose={() => { setBuilderOpen(false); setEditingPanel(null); }}
        />
      )}
    </div>
  );
}

// ── Custom panel ─────────────────────────────────────────────────────────────

const CUSTOM_COLORS_HEX = ["#c9a96e", "#5fb6c5", "#7fb087", "#e0b266", "#e07b6a", "#6b6560"];

function CustomPanel({ panel, onEdit, onDelete, isEditMode = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const data = useMemo(() => {
    try { return runQuery(panel.query); }
    catch { return []; }
  }, [panel.query]);

  const tooltipStyle = { background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline2)", borderRadius: 3, fontFamily: "var(--fm-mono)", fontSize: "0.65rem" };
  const ct = panel.chartType;
  const showLabels = panel.showLabels ?? false;
  const showLegend = panel.showLegend ?? false;
  const barLabel  = (pos) => showLabels ? <LabelList dataKey="value" position={pos} fill="var(--fm-ink-dim)" fontFamily="var(--fm-mono)" fontSize={9} formatter={fmtLabelValue} /> : null;

  function renderChart() {
    if (!data || data.length === 0) {
      return <div style={{ alignItems: "center", color: "var(--fm-ink-mute)", display: "flex", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", height: "100%", justifyContent: "center" }}>No data</div>;
    }
    if (ct === "bar-v") {
      return <ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 20 }}><XAxis dataKey="label" tick={{ fill: "var(--fm-ink-mute)", fontSize: 9, fontFamily: "var(--fm-mono)" }} angle={-30} textAnchor="end" interval={0} /><YAxis tick={{ fill: "var(--fm-ink-mute)", fontSize: 9, fontFamily: "var(--fm-mono)" }} /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="value" fill="#c9a96e" fillOpacity={0.75} radius={[2,2,0,0]}>{barLabel("top")}</Bar></BarChart></ResponsiveContainer>;
    }
    if (ct === "bar-h") {
      return <ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 70, bottom: 4 }}><XAxis type="number" tick={{ fill: "var(--fm-ink-mute)", fontSize: 9, fontFamily: "var(--fm-mono)" }} /><YAxis type="category" dataKey="label" tick={{ fill: "var(--fm-ink-dim)", fontSize: 9, fontFamily: "var(--fm-mono)" }} width={68} /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="value" fill="#c9a96e" fillOpacity={0.75} radius={[0,2,2,0]}>{barLabel("right")}</Bar></BarChart></ResponsiveContainer>;
    }
    if (ct === "line") {
      return <ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 20 }}><XAxis dataKey="label" tick={{ fill: "var(--fm-ink-mute)", fontSize: 9, fontFamily: "var(--fm-mono)" }} angle={-30} textAnchor="end" interval={0} /><YAxis tick={{ fill: "var(--fm-ink-mute)", fontSize: 9, fontFamily: "var(--fm-mono)" }} /><Tooltip contentStyle={tooltipStyle} /><Line dataKey="value" stroke="#c9a96e" strokeWidth={2} dot={{ r: 3, fill: "#c9a96e" }}>{barLabel("top")}</Line></LineChart></ResponsiveContainer>;
    }
    if (ct === "area") {
      return <ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 20 }}><XAxis dataKey="label" tick={{ fill: "var(--fm-ink-mute)", fontSize: 9, fontFamily: "var(--fm-mono)" }} angle={-30} textAnchor="end" interval={0} /><YAxis tick={{ fill: "var(--fm-ink-mute)", fontSize: 9, fontFamily: "var(--fm-mono)" }} /><Tooltip contentStyle={tooltipStyle} /><Area dataKey="value" stroke="#c9a96e" fill="#c9a96e" fillOpacity={0.15} strokeWidth={2}>{barLabel("top")}</Area></AreaChart></ResponsiveContainer>;
    }
    if (ct === "pie" || ct === "donut") {
      return <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius="70%" innerRadius={ct === "donut" ? "50%" : "0%"} paddingAngle={2} label={showLabels ? renderPieValueLabel : false} labelLine={false}>{data.map((_, i) => <Cell key={i} fill={CUSTOM_COLORS_HEX[i % CUSTOM_COLORS_HEX.length]} fillOpacity={0.8} />)}</Pie>{showLegend && <Legend {...LEGEND_PROPS} />}<Tooltip contentStyle={tooltipStyle} /></PieChart></ResponsiveContainer>;
    }
    if (ct === "table") {
      return <div style={{ height: "100%", overflow: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%" }}><thead><tr>{["Label","Value"].map(h=><th key={h} style={{ borderBottom: "1px solid var(--fm-hairline2)", color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", fontWeight: 400, letterSpacing: "0.1em", padding: "0.25rem 0.5rem", textAlign: "left", textTransform: "uppercase" }}>{h}</th>)}</tr></thead><tbody>{data.map((row,i)=><tr key={i} style={{ borderBottom: "1px solid var(--fm-hairline)" }}><td style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", padding: "0.28rem 0.5rem" }}>{row.label}</td><td style={{ color: "var(--fm-brass)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", padding: "0.28rem 0.5rem", textAlign: "right" }}>{typeof row.value === "number" ? row.value.toFixed(row.value % 1 === 0 ? 0 : 2) : row.value}</td></tr>)}</tbody></table></div>;
    }
    return null;
  }

  return (
    <div style={{ background: "var(--fm-bg-panel)", border: isEditMode ? "1px dashed var(--fm-brass)" : "var(--fm-border)", borderRadius: "var(--fm-radius-lg)", cursor: isEditMode ? "grab" : "default", display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", transition: "border 0.15s", userSelect: isEditMode ? "none" : "auto" }}>
      <div style={{ alignItems: "center", background: isEditMode ? "rgba(201,169,110,0.06)" : "transparent", borderBottom: "1px solid var(--fm-hairline)", display: "flex", flexShrink: 0, justifyContent: "space-between", padding: "0.65rem 1.25rem 0.55rem" }}>
        <span style={{ color: isEditMode ? "var(--fm-brass)" : "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase" }}>{panel.title}</span>
        <div style={{ alignItems: "center", display: "flex", gap: "0.5rem" }}>
          <span style={{ color: isEditMode ? "var(--fm-brass)" : "var(--fm-hairline2)", fontSize: isEditMode ? "0.85rem" : "0.7rem", opacity: isEditMode ? 0.7 : 1, transition: "color 0.15s" }}>⠿</span>
          <div style={{ overflow: "hidden" }}>
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); }}
              style={{ background: "transparent", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0 0.2rem" }}
              onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink)"}
              onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-mute)"}
            >⋯</button>
            {menuOpen && (
              <div
                onMouseLeave={() => setMenuOpen(false)}
                style={{ background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline2)", borderRadius: 4, boxShadow: "0 6px 20px #00000055", display: "flex", flexDirection: "column", gap: 1, minWidth: 110, padding: 4, position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 50 }}
              >
                {[["Edit", onEdit], ["Delete", onDelete]].map(([label, fn]) => (
                  <button key={label} onClick={e => { e.stopPropagation(); setMenuOpen(false); fn(); }}
                    style={{ background: "transparent", border: "none", borderRadius: 3, color: label === "Delete" ? "var(--fm-red)" : "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", padding: "0.35rem 0.6rem", textAlign: "left" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--fm-bg-panel)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >{label}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "hidden", padding: "0.75rem 1.25rem 1rem" }}>
        {renderChart()}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CircleHealthDial({ score }) {
  const [hovered, setHovered] = useState(false);
  const r = 36, cx = 50, cy = 52;
  const circ  = 2 * Math.PI * r;
  const arcLen = circ * 0.75;
  const fillLen = Math.max(0, (score / 100) * arcLen);
  const color = score >= 80 ? "var(--fm-green)" : score >= 50 ? "var(--fm-amber)" : "var(--fm-red)";
  const band  = score >= 80 ? "On track" : score >= 50 ? "Needs attention" : "Falling behind";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ alignItems: "center", display: "flex", flexDirection: "column", gap: "0.2rem", justifyContent: "center", position: "relative" }}
    >
      <svg viewBox="0 0 100 104" width="88" height="88">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--fm-hairline2)" strokeWidth={7}
          strokeDasharray={`${arcLen} ${circ - arcLen}`} strokeLinecap="round"
          transform={`rotate(225 ${cx} ${cy})`} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={7} strokeOpacity={0.85}
          strokeDasharray={`${fillLen} ${circ - fillLen}`} strokeLinecap="round"
          transform={`rotate(225 ${cx} ${cy})`} style={{ transition: "stroke-dasharray 0.4s ease" }} />
        <text x={cx} y={cy - 3} textAnchor="middle" dominantBaseline="middle"
          fill={color} fontFamily="var(--fm-serif)" fontSize="24" fontWeight="300">{score}</text>
        <text x={cx} y={cy + 14} textAnchor="middle"
          fill="var(--fm-ink-mute)" fontFamily="var(--fm-mono)" fontSize="7" letterSpacing="0.5">/100</text>
      </svg>
      <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem" }}>{band}</div>
      {hovered && (
        <div style={{ background: "var(--fm-bg-raised)", border: "var(--fm-border)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", left: "50%", lineHeight: 1.55, padding: "0.5rem 0.7rem", pointerEvents: "none", position: "absolute", top: "calc(100% + 8px)", transform: "translateX(-50%)", whiteSpace: "normal", width: "240px", zIndex: 100 }}>
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

function sortedBy(arr, col, dir, getters) {
  return [...arr].sort((a, b) => {
    const va = getters[col]?.(a), vb = getters[col]?.(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1; if (vb == null) return -1;
    const cmp = typeof va === "string" ? va.localeCompare(vb) : va - vb;
    return dir === "asc" ? cmp : -cmp;
  });
}

function ColHeader({ label, tip, style: extraStyle = {}, sortKey, sortState, onSort }) {
  const [visible, setVisible] = useState(false);
  const isActive = sortKey && sortState?.col === sortKey;
  const isClickable = !!(sortKey && onSort);
  return (
    <span style={{ position: "relative", cursor: isClickable ? "pointer" : "default", userSelect: "none", ...extraStyle }}
      onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}
      onClick={isClickable ? () => onSort(sortKey) : undefined}
    >
      <span style={{ alignItems: "center", borderBottom: `1px ${isClickable ? "solid" : "dotted"} ${isActive ? "var(--fm-brass)" : "var(--fm-hairline2)"}`, color: isActive ? "var(--fm-brass)" : "var(--fm-ink-mute)", display: "inline-flex", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", gap: "0.2rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        {label}
        {isActive && <span style={{ fontSize: "0.45rem", lineHeight: 1 }}>{sortState.dir === "asc" ? "▲" : "▼"}</span>}
      </span>
      {visible && tip && (
        <span style={{ background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline2)", borderRadius: "4px", bottom: "calc(100% + 6px)", boxShadow: "0 4px 12px #00000040", color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", left: "50%", lineHeight: 1.5, padding: "0.4rem 0.6rem", pointerEvents: "none", position: "absolute", transform: "translateX(-50%)", whiteSpace: "nowrap", zIndex: 50 }}>
          {tip}
        </span>
      )}
    </span>
  );
}

function ArchSection({ cats, catHealthMap, catNextDueMap, emptyMsg, unstyled = false }) {
  const [sortCol, setSortCol] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const sortState = { col: sortCol, dir: sortDir };

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  }

  const sortedCats = useMemo(() => sortedBy(cats, sortCol, sortDir, {
    name:    cat => cat.toLowerCase(),
    score:   cat => catHealthMap[cat] ?? 100,
    nextDue: cat => catNextDueMap[cat] ? catNextDueMap[cat].getTime() : null,
  }), [cats, sortCol, sortDir, catHealthMap, catNextDueMap]);

  const content = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {cats.length > 0 && (
        <div style={{ alignItems: "center", display: "flex", flexShrink: 0, gap: "0.75rem", padding: "0.15rem 0 0.15rem" }}>
          <ColHeader label="Name"     sortKey="name"    sortState={sortState} onSort={handleSort} style={{ flex: "0 0 100px" }} />
          <ColHeader label="Health"   sortKey="score"   sortState={sortState} onSort={handleSort} style={{ flex: 1 }} />
          <ColHeader label="Score"    sortKey="score"   sortState={sortState} onSort={handleSort} style={{ flex: "0 0 30px", textAlign: "right" }} />
          <ColHeader label="Next Due" sortKey="nextDue" sortState={sortState} onSort={handleSort} style={{ flex: "0 0 46px", textAlign: "right" }} />
        </div>
      )}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {cats.length === 0 ? (
          <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.5rem 0" }}>{emptyMsg}</div>
        ) : sortedCats.map(cat => {
          const score = catHealthMap[cat] ?? 100;
          const nextDue = catNextDueMap[cat];
          return (
            <div key={cat} style={{ alignItems: "center", borderBottom: "1px solid var(--fm-hairline)", display: "flex", gap: "0.75rem", padding: "0.4rem 0" }}>
              <span style={{ color: "var(--fm-ink-dim)", flex: "0 0 100px", fontFamily: "var(--fm-sans)", fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat}</span>
              <HealthBar score={score} />
              <span style={{ color: score >= 80 ? "var(--fm-green)" : score >= 50 ? "var(--fm-amber)" : "var(--fm-red)", flex: "0 0 30px", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", textAlign: "right" }}>{score}</span>
              <span style={{ color: "var(--fm-ink-mute)", flex: "0 0 46px", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", textAlign: "right" }}>{fmtDate(nextDue)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (unstyled) return content;

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {content}
    </div>
  );
}

const SCHED_PAST = 30, SCHED_FUTURE = 90, SCHED_TOTAL = 120;
const DOT_R = 4, DOT_GAP = 3, TRACK_H = 72;
const TYPE_COLOR = { maint: "var(--fm-brass)", chore: "var(--fm-green)", todo: "var(--fm-cyan)", project: "var(--fm-amber)" };
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
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ background: color, borderRadius: "50%", boxShadow: item.days < 0 ? `0 0 4px ${uc}` : "none", cursor: "default", height: DOT_R * 2, left: `${((item.days + SCHED_PAST) / SCHED_TOTAL) * 100}%`, opacity: item.days > 30 ? 0.55 : 1, position: "absolute", top: item.y, transform: "translateX(-50%)", width: DOT_R * 2, zIndex: hover ? 20 : 1 }}
    >
      {hover && (
        <div style={{ background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline2)", borderRadius: "4px", bottom: "calc(100% + 7px)", boxShadow: "0 4px 14px #00000050", color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", left: "50%", lineHeight: 1.5, maxWidth: "220px", minWidth: "130px", padding: "0.4rem 0.6rem", pointerEvents: "none", position: "absolute", transform: "translateX(-50%)", whiteSpace: "nowrap", zIndex: 50 }}>
          <div style={{ color, fontSize: "0.5rem", letterSpacing: "0.1em", marginBottom: "0.2rem", textTransform: "uppercase" }}>{TYPE_LABEL[item.type]}</div>
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
    const d = nextDatesMap[keyOf(row)]; if (!d) return;
    const days = Math.round((new Date(d) - today) / 86400000);
    if (days < -SCHED_PAST || days > SCHED_FUTURE) return;
    items.push({ type: "maint", label: `${row.category} · ${row.task}`, days });
  });
  chores.forEach(c => {
    const dt = choreNextDate(c); if (!dt) return;
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

  const byDay = {};
  items.forEach(item => { (byDay[item.days] ??= []).push(item); });
  const dots = [];
  Object.entries(byDay).forEach(([dayStr, group]) => {
    group.forEach((item, i) => {
      const y = TRACK_H - DOT_R * 2 - i * (DOT_R * 2 + DOT_GAP);
      if (y >= 0) dots.push({ ...item, y });
    });
  });

  const monthMarkers = [];
  for (let d = -SCHED_PAST + 1; d <= SCHED_FUTURE; d++) {
    const dt = new Date(today); dt.setDate(dt.getDate() + d);
    if (dt.getDate() === 1) monthMarkers.push({ x: ((d + SCHED_PAST) / SCHED_TOTAL) * 100, label: dt.toLocaleDateString("en-US", { month: "short" }) });
  }

  const todayX = (SCHED_PAST / SCHED_TOTAL) * 100;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <div style={{ height: TRACK_H, position: "relative", width: "100%" }}>
        <div style={{ background: "var(--fm-brass)", bottom: 0, left: `${todayX}%`, opacity: 0.3, position: "absolute", top: 0, width: "1px" }} />
        {dots.map((dot, i) => <SchedDot key={i} item={dot} />)}
      </div>
      <div style={{ background: "var(--fm-hairline2)", height: "1px", width: "100%" }} />
      <div style={{ height: "18px", position: "relative", width: "100%" }}>
        <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.48rem", left: 0, position: "absolute", top: "4px" }}>T−30d</span>
        <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.5rem", left: `${todayX}%`, position: "absolute", top: "4px", transform: "translateX(-50%)" }}>TODAY</span>
        {monthMarkers.map(m => (
          <span key={m.x} style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.48rem", left: `${m.x}%`, position: "absolute", top: "4px", transform: "translateX(-50%)" }}>{m.label}</span>
        ))}
        <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.48rem", position: "absolute", right: 0, top: "4px" }}>T+90d</span>
      </div>
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
