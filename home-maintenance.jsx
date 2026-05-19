import { useState, useRef, useEffect, useMemo } from "react";
import FmHeader from "./src/components/FmHeader.jsx";
import FmSubnav from "./src/components/FmSubnav.jsx";
import { loadData, loadCustomData, saveCustomData, loadOverrides, saveOverrides, defaultData } from "./lib/data.js";
import MaintenanceTable from "./components/MaintenanceTable.jsx";
import Legend from "./components/Legend.jsx";
import ReminderSettings from "./components/ReminderSettings.jsx";
import {
  loadReminderModes, saveReminderModes,
  REMINDER_MODES, syncReminders,
} from "./lib/reminders.js";
import { computeNextDate, parseMonths } from "./lib/scheduleInterval.js";
import { getScheduleColor } from "./lib/scheduleColor.js";
import { loadDeletedRows, saveDeletedRows } from "./lib/deletedRows.js";
import { loadDeletedCategories } from "./lib/deletedCategories.js";
import { loadDeletedItems } from "./lib/deletedItems.js";
import { GROUP_ORDER, GROUP_LABELS, loadCategoryTypeOverrides, loadRoomSubtypes, formatRoomLabel } from "./lib/categoryTypes.js";
import { loadEntityTypes, resolveTypeId, isSpatial } from "./lib/entityTypes.js";
import AddTaskModal from "./components/AddTaskModal.jsx";

const DEFAULT_CAT_SET = new Set(defaultData.map(d => d.category));
const DEFAULT_CAT_ORDER = Array.from(new Set(defaultData.map(r => r.category)));

function Pill({ active, onClick, color, children }) {
  const activeColor = color || "var(--fm-brass)";
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "rgba(201,169,110,0.10)" : "transparent",
        border: `1px solid ${active ? activeColor : "var(--fm-hairline2)"}`,
        borderRadius: "var(--fm-radius)",
        color: active ? activeColor : "var(--fm-ink-dim)",
        cursor: "pointer",
        fontFamily: "var(--fm-mono)",
        fontSize: "0.65rem",
        letterSpacing: "0.08em",
        padding: "0.22rem 0.55rem",
        textTransform: "uppercase",
        transition: "all 0.12s",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = activeColor; e.currentTarget.style.color = activeColor; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; } }}
    >
      {children}
    </button>
  );
}

function loadDates(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "{}");
    return Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, new Date(v)])
    );
  } catch {
    return {};
  }
}

function saveDates(key, dates) {
  localStorage.setItem(key, JSON.stringify(
    Object.fromEntries(
      Object.entries(dates).map(([k, v]) => [k, v.toISOString()])
    )
  ));
}

export default function HomeMaintenanceTable({ navigate, navState }) {
  const [rows, setRows] = useState(() => loadData());
  const [activeStatus, setActiveStatus] = useState("ALL");
  const [systemFilter, setSystemFilter] = useState("ALL");
  const [structureFilter, setStructureFilter] = useState("ALL");
  const [roomFilter, setRoomFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [activeFrequencies, setActiveFrequencies] = useState(new Set());
  const [activeSeasons, setActiveSeasons] = useState(new Set());
  const [addRowHovered, setAddRowHovered] = useState(false);
  const [addTaskModalOpen, setAddTaskModalOpen] = useState(false);
  const [sortCols, setSortCols] = useState([]);
  const [deletedRows, setDeletedRows] = useState(() => loadDeletedRows());
  const [deletedCategories] = useState(() => loadDeletedCategories());
  const [deletedItems] = useState(() => loadDeletedItems());
  const [categoryTypeOverrides] = useState(() => loadCategoryTypeOverrides());
  const [roomSubtypes] = useState(() => loadRoomSubtypes());
  const [entityTypeData] = useState(() => loadEntityTypes());
  const pageHeaderRef = useRef(null);
  const [pageHeaderHeight, setPageHeaderHeight] = useState(0);

  useEffect(() => {
    const el = pageHeaderRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => setPageHeaderHeight(entry.contentRect.height));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!navState) return;
    if (navState.status) setActiveStatus(navState.status);
    if (navState.search != null) setSearch(navState.search);
  }, []);

  const categoryGroups = useMemo(() => {
    // Build fallback type map ONLY from built-in (non-custom, non-blank) rows.
    // Sentinel/custom rows are excluded so wrongly-tagged rows don't pollute the map.
    const catTypeMap = {};
    rows.forEach(row => {
      if (!row.category) return;
      if (!row._isCustom && deletedCategories.has(row.category)) return;
      if (!catTypeMap[row.category] && !row._isCustom && !row._isBlankCategory) {
        if (row.categoryType) catTypeMap[row.category] = row.categoryType;
      }
    });

    // Show categories that have tasks, plus any user-created categories (even
    // if they have no tasks yet — user created them and expects to see them).
    const catsWithContent = new Set();
    rows.forEach(row => {
      if (!row.category) return;
      if (!row._isCustom && deletedCategories.has(row.category)) return;
      if (row._isBlankCategory) {
        if (row._isCustom) catsWithContent.add(row.category);
        return;
      }
      catsWithContent.add(row.category);
    });

    const groupTypeSet = new Set(GROUP_ORDER);

    return GROUP_ORDER.map(type => ({
      type,
      label: GROUP_LABELS[type],
      tabs: Array.from(catsWithContent)
        .filter(cat => {
          const oldType = categoryTypeOverrides[cat] ?? catTypeMap[cat] ?? "general";
          const typeId = resolveTypeId(cat, oldType);
          // Map typeId to GROUP_ORDER bucket
          if (groupTypeSet.has(typeId)) return typeId === type;
          // User-created spatial types → "room" bucket
          if (isSpatial(typeId, entityTypeData)) return type === "room";
          // User-created functional subtypes → "system" bucket
          return type === "system";
        })
        .sort((a, b) => a.localeCompare(b)),
    }));
  }, [rows, deletedCategories, categoryTypeOverrides, entityTypeData]);

  const categoryLabels = useMemo(() => {
    const labels = {};
    categoryGroups.forEach(group => {
      if (group.type !== "room") return;
      group.tabs.forEach(cat => {
        const label = formatRoomLabel(cat, roomSubtypes);
        if (label !== cat) labels[cat] = label;
      });
    });
    return labels;
  }, [categoryGroups, roomSubtypes]);

  // Functional non-structure categories → Systems filter row
  const systemCats = useMemo(() => {
    return categoryGroups
      .filter(g => g.type === "system" || g.type === "safety" || g.type === "general")
      .flatMap(g => g.tabs)
      .sort();
  }, [categoryGroups]);

  // Structure-rooted categories → Structure filter row
  const structureCats = useMemo(() => {
    return categoryGroups.find(g => g.type === "structure")?.tabs ?? [];
  }, [categoryGroups]);

  // Spatial categories (room + exterior) → Rooms filter row
  const roomCats = useMemo(() => {
    return categoryGroups
      .filter(g => g.type === "room" || g.type === "exterior")
      .flatMap(g => g.tabs)
      .sort();
  }, [categoryGroups]);


  const activeTaskCount = useMemo(() => {
    let count = 0;
    rows.forEach(row => {
      if (row._isBlankCategory || !row.category || !row.item || !row.task) return;
      if (!row._isCustom && deletedCategories.has(row.category)) return;
      if (deletedItems.has(`${row.category}|${row.item}`)) return;
      if (deletedRows.has(`${row.category}|${row.item}|${row.task}`)) return;
      count++;
    });
    return count;
  }, [rows, deletedCategories, deletedItems, deletedRows]);

  const activeCategoryCount = useMemo(() => {
    const seen = new Set();
    rows.forEach(row => {
      if (row._isBlankCategory || !row.category || !row.item || !row.task) return;
      if (!row._isCustom && deletedCategories.has(row.category)) return;
      if (deletedItems.has(`${row.category}|${row.item}`)) return;
      if (deletedRows.has(`${row.category}|${row.item}|${row.task}`)) return;
      seen.add(row.category);
    });
    return seen.size;
  }, [rows, deletedCategories, deletedItems, deletedRows]);

  const rowDataByKey = useMemo(() => Object.fromEntries(
    rows.map(row => [
      `${row.category}|${row.item}|${row.task}`,
      { schedule: row.schedule, season: row.season ?? null },
    ])
  ), [rows]);

  function handleToggleFrequency(color) {
    setActiveFrequencies(prev => {
      const next = new Set(prev);
      next.has(color) ? next.delete(color) : next.add(color);
      return next;
    });
  }

  function handleNoteChange(key, text) {
    setNotes(prev => {
      const next = { ...prev, [key]: text };
      localStorage.setItem("maintenance-notes", JSON.stringify(next));
      return next;
    });
  }

  function handleToggleSeason(season) {
    setActiveSeasons(prev => {
      const next = new Set(prev);
      next.has(season) ? next.delete(season) : next.add(season);
      return next;
    });
  }

  const [completedDates, setCompletedDates] = useState(() => loadDates("maintenance-dates"));
  const [nextDates, setNextDates] = useState(() => loadDates("maintenance-next-dates"));
  const [notes, setNotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem("maintenance-notes") || "{}"); }
    catch { return {}; }
  });
  const [followSchedule, setFollowSchedule] = useState(() => {
    try { return JSON.parse(localStorage.getItem("maintenance-follow") || "{}"); }
    catch { return {}; }
  });
  const [reminderModes, setReminderModes] = useState(() => loadReminderModes());
  const [remindersOpen, setRemindersOpen] = useState(false);

  function handleCycleReminderMode(key) {
    setReminderModes(prev => {
      const cur = REMINDER_MODES.includes(prev[key]) ? prev[key] : "off";
      const nextIdx = (REMINDER_MODES.indexOf(cur) + 1) % REMINDER_MODES.length;
      const next = { ...prev, [key]: REMINDER_MODES[nextIdx] };
      saveReminderModes(next);
      return next;
    });
  }

  async function handleSyncReminders() {
    return syncReminders({ rows, nextDates, modes: reminderModes });
  }

  function handleSaveNewTask(form) {
    const newRow = {
      _id: `custom-${Date.now()}`,
      _isCustom: true,
      _defaultKey: null,
      category: form.category.trim(),
      item:     form.item.trim(),
      task:     form.task.trim(),
      schedule: form.schedule,
      season:   form.season ?? null,
    };
    const customs = loadCustomData();
    saveCustomData([newRow, ...customs]);
    setRows(prev => [newRow, ...prev]);

    const key = `${newRow.category}|${newRow.item}|${newRow.task}`;
    if (form.lastCompleted) {
      setCompletedDates(prev => {
        const next = { ...prev, [key]: new Date(form.lastCompleted) };
        saveDates("maintenance-dates", next);
        return next;
      });
    }
    if (form.nextDate) {
      setNextDates(prev => {
        const next = { ...prev, [key]: new Date(form.nextDate) };
        saveDates("maintenance-next-dates", next);
        return next;
      });
    }
    if (form.notes) {
      setNotes(prev => {
        const next = { ...prev, [key]: form.notes };
        localStorage.setItem("maintenance-notes", JSON.stringify(next));
        return next;
      });
    }
    if (form.followSchedule) {
      setFollowSchedule(prev => {
        const next = { ...prev, [key]: true };
        localStorage.setItem("maintenance-follow", JSON.stringify(next));
        return next;
      });
    }

    setAddTaskModalOpen(false);
  }

  function handleRowEdit(rowId, field, value) {
    setRows(prev => {
      const updated = prev.map(r => r._id === rowId ? { ...r, [field]: value } : r);
      const row = updated.find(r => r._id === rowId);
      if (row._isCustom) {
        const customs = updated.filter(r => r._isCustom);
        saveCustomData(customs);
      } else {
        const overrides = loadOverrides();
        const { _id, _isCustom, _defaultKey, ...fields } = row;
        overrides[_defaultKey] = fields;
        saveOverrides(overrides);
      }
      return updated;
    });
  }

  function handleDateChange(key, date) {
    setCompletedDates(prev => {
      const next = { ...prev };
      if (date) next[key] = date; else delete next[key];
      saveDates("maintenance-dates", next);
      return next;
    });

    if (date && followSchedule[key]) {
      const entry = rowDataByKey[key];
      if (entry) {
        const { schedule, season } = entry;
        const computed = computeNextDate(date, schedule, season);
        if (computed) {
          setNextDates(prev => {
            const next = { ...prev, [key]: computed };
            saveDates("maintenance-next-dates", next);
            return next;
          });
        }
      }
    }
  }

  function handleNextDateChange(key, date) {
    if (date && followSchedule[key]) {
      setFollowSchedule(prev => {
        const next = { ...prev, [key]: false };
        localStorage.setItem("maintenance-follow", JSON.stringify(next));
        return next;
      });
    }
    setNextDates(prev => {
      const next = { ...prev };
      if (date) next[key] = date; else delete next[key];
      saveDates("maintenance-next-dates", next);
      return next;
    });
  }

  function handleToggleFollow(key) {
    const turningOn = !followSchedule[key];
    setFollowSchedule(prev => {
      const next = { ...prev, [key]: turningOn };
      localStorage.setItem("maintenance-follow", JSON.stringify(next));
      return next;
    });

    if (turningOn) {
      const base = completedDates[key] ?? new Date();
      const entry = rowDataByKey[key];
      if (entry) {
        const { schedule, season } = entry;
        const computed = computeNextDate(base, schedule, season);
        if (computed) {
          setNextDates(prev => {
            const next = { ...prev, [key]: computed };
            saveDates("maintenance-next-dates", next);
            return next;
          });
        }
      }
    }
  }


  function handleDeleteRow(row) {
    const key = `${row.category}|${row.item}|${row.task}`;
    if (row._isCustom) {
      setRows(prev => {
        const updated = prev.filter(r => r._id !== row._id);
        saveCustomData(updated.filter(r => r._isCustom));
        return updated;
      });
    } else {
      setDeletedRows(prev => {
        const next = new Set(prev);
        next.add(key);
        saveDeletedRows(next);
        return next;
      });
    }
  }

  function handleHeaderClick(col, shiftKey) {
    setSortCols(prev => {
      if (!shiftKey || prev.length === 0) {
        const isPrimary = prev[0]?.col === col;
        return [{ col, dir: isPrimary && prev[0].dir === "asc" ? "desc" : "asc" }];
      }
      const primary = prev[0];
      if (primary?.col === col) return prev;
      const existing = prev[1]?.col === col ? prev[1] : null;
      return [primary, { col, dir: existing ? (existing.dir === "asc" ? "desc" : "asc") : "asc" }];
    });
  }

  function getSortValue(row, col) {
    const key = `${row.category}|${row.item}|${row.task}`;
    switch (col) {
      case "category":     return (row.category || "").toLowerCase();
      case "item":         return (row.item || "").toLowerCase();
      case "task":         return (row.task || "").toLowerCase();
      case "schedule":     return parseMonths(row.schedule || "");
      case "season":       return row.season || "";
      case "lastCompleted": return completedDates[key] ?? null;
      case "nextDate":     return nextDates[key] ?? null;
      case "notes":        return (notes[key] || "").toLowerCase();
      default:             return "";
    }
  }

  function compareSortValues(av, bv, col, dir) {
    const aEmpty = av === null || av === undefined || av === "";
    const bEmpty = bv === null || bv === undefined || bv === "";
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return -1;
    if (bEmpty) return 1;
    let raw;
    if (col === "schedule") raw = av - bv;
    else if (col === "lastCompleted" || col === "nextDate") raw = av.getTime() - bv.getTime();
    else raw = av.localeCompare(bv);
    return dir === "asc" ? raw : -raw;
  }

  const filtered = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const in30Days = new Date(today); in30Days.setDate(in30Days.getDate() + 30);

    const base = rows.filter(row => {
      const key = `${row.category}|${row.item}|${row.task}`;
      if (row._isBlankCategory || !row.task) return false;
      if (!row._isCustom && deletedCategories.has(row.category)) return false;
      if (deletedItems.has(`${row.category}|${row.item}`)) return false;
      if (deletedRows.has(key)) return false;

      if (systemFilter !== "ALL" && row.category !== systemFilter) return false;
      if (structureFilter !== "ALL" && row.category !== structureFilter) return false;
      if (roomFilter !== "ALL" && row.category !== roomFilter) return false;

      // Status filter
      if (activeStatus !== "ALL") {
        const nd = nextDates[key];
        if (activeStatus === "OVERDUE" && (!nd || nd >= today)) return false;
        if (activeStatus === "SOON"    && (!nd || nd < today || nd > in30Days)) return false;
        if (activeStatus === "SCHED"   && !nd) return false;
        if (activeStatus === "OK"      && (!nd || nd < today || nd <= in30Days)) return false;
      }

      if (activeFrequencies.size > 0 && !activeFrequencies.has(getScheduleColor(row.schedule))) return false;
      if (activeSeasons.size > 0 && !(row.season && activeSeasons.has(row.season))) return false;

      const q = search.toLowerCase();
      if (q && !(
        (row.category || "").toLowerCase().includes(q) ||
        (row.item     || "").toLowerCase().includes(q) ||
        (row.task     || "").toLowerCase().includes(q) ||
        (row.schedule || "").toLowerCase().includes(q)
      )) return false;

      return true;
    });

    if (sortCols.length > 0) {
      return base.sort((a, b) => {
        for (const { col, dir } of sortCols) {
          const cmp = compareSortValues(getSortValue(a, col), getSortValue(b, col), col, dir);
          if (cmp !== 0) return cmp;
        }
        return 0;
      });
    }

    return base.sort((a, b) => {
      const rank = r => DEFAULT_CAT_ORDER.indexOf(r.category) === -1 ? Infinity : DEFAULT_CAT_ORDER.indexOf(r.category);
      const diff = rank(a) - rank(b);
      if (diff !== 0) return diff;
      if (a._isCustom !== b._isCustom) return a._isCustom ? -1 : 1;
      return 0;
    });
  }, [rows, activeStatus, systemFilter, structureFilter, roomFilter, activeFrequencies, activeSeasons, search, deletedRows, deletedCategories, deletedItems, sortCols, nextDates]);

  const maintenanceStats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const in7Days = new Date(today); in7Days.setDate(in7Days.getDate() + 7);
    let overdue = 0, soon = 0;
    rows.forEach(row => {
      const key = `${row.category}|${row.item}|${row.task}`;
      if (row._isBlankCategory || !row.task) return;
      if (!row._isCustom && deletedCategories.has(row.category)) return;
      if (deletedItems.has(`${row.category}|${row.item}`)) return;
      if (deletedRows.has(key)) return;
      const nd = nextDates[key];
      if (!nd) return;
      if (nd < today) overdue++;
      else if (nd <= in7Days) soon++;
    });
    return { overdue, soon };
  }, [rows, deletedCategories, deletedItems, deletedRows, nextDates]);

  return (
    <div style={{
      height: "100vh",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      background: "var(--fm-bg)",
      fontFamily: "var(--fm-serif)",
      color: "var(--fm-ink)",
    }}>
      <div ref={pageHeaderRef}>
        <FmHeader active="Maintenance" tagline="Maintenance" />
        <FmSubnav
          tabs={["All tasks", "History"]}
          active="All tasks"
          stats={[
            { value: activeTaskCount, label: "tracked" },
            { value: maintenanceStats.overdue, color: "var(--fm-red)", label: "overdue" },
            { value: maintenanceStats.soon, color: "var(--fm-amber)", label: "due ≤7d" },
            { value: filtered.length, label: "shown" },
          ]}
        />
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "var(--fm-spacing-5xl) var(--fm-spacing-5xl) 4rem" }}>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center", marginBottom: "1.25rem" }}>
          <p style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.85rem", margin: 0 }}>
            {activeTaskCount} maintenance item{activeTaskCount !== 1 ? "s" : ""} across {activeCategoryCount} categor{activeCategoryCount !== 1 ? "ies" : "y"}
          </p>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search items, types, schedules…"
            style={{
              background: "var(--fm-bg-sunk)",
              border: "1px solid var(--fm-ink-dim)",
              borderRadius: "4px",
              color: "var(--fm-ink)",
              fontSize: "0.82rem",
              marginLeft: "auto",
              padding: "0.5rem 0.85rem",
              width: "260px",
              fontFamily: "var(--fm-mono)",
              outline: "none",
            }}
          />
          <span style={{ color: "var(--fm-ink-dim)", fontSize: "0.78rem", fontFamily: "var(--fm-mono)" }}>
            {filtered.length} results
          </span>
          <button
            onClick={() => setAddTaskModalOpen(true)}
            onMouseEnter={() => setAddRowHovered(true)}
            onMouseLeave={() => setAddRowHovered(false)}
            style={{
              background: "transparent",
              border: `1px solid ${addRowHovered ? "var(--fm-brass)" : "var(--fm-ink-dim)"}`,
              borderRadius: "3px",
              color: addRowHovered ? "var(--fm-brass)" : "var(--fm-brass-dim)",
              cursor: "pointer",
              fontFamily: "var(--fm-mono)",
              fontSize: "0.72rem",
              letterSpacing: "0.08em",
              padding: "0.4rem 0.9rem",
              transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}
          >
            + ADD TASK
          </button>
          <button
            onClick={() => setRemindersOpen(true)}
            className="foreman-reminders-header-btn"
            style={{
              background: "transparent",
              border: "1px solid var(--fm-ink-dim)",
              borderRadius: "3px",
              color: "var(--fm-brass-dim)",
              cursor: "pointer",
              fontFamily: "var(--fm-mono)",
              fontSize: "0.72rem",
              letterSpacing: "0.08em",
              padding: "0.4rem 0.9rem",
              transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-brass-dim)"; }}
          >
            REMINDERS
          </button>
        </div>
        {/* Filter pills — Status / System / Room */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginBottom: "0.6rem" }}>
          {/* Status */}
          <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
            <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.14em", minWidth: "54px", textTransform: "uppercase" }}>Status</span>
            {[
              { key: "ALL",     label: "All" },
              { key: "OVERDUE", label: "Overdue", color: "var(--fm-red)"   },
              { key: "SOON",    label: "Soon",    color: "var(--fm-amber)" },
              { key: "SCHED",   label: "Sched" },
              { key: "OK",      label: "OK",      color: "var(--fm-green)" },
            ].map(({ key, label, color }) => (
              <Pill key={key} active={activeStatus === key} color={color} onClick={() => setActiveStatus(key)}>{label}</Pill>
            ))}
          </div>

          {systemCats.length > 0 && (
            <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
              <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.14em", minWidth: "54px", textTransform: "uppercase" }}>Systems</span>
              <Pill active={systemFilter === "ALL"} onClick={() => setSystemFilter("ALL")}>All</Pill>
              {systemCats.map(cat => (
                <Pill key={cat} active={systemFilter === cat} onClick={() => setSystemFilter(cat)}>{cat}</Pill>
              ))}
            </div>
          )}
          {structureCats.length > 0 && (
            <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
              <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.14em", minWidth: "54px", textTransform: "uppercase" }}>Structure</span>
              <Pill active={structureFilter === "ALL"} onClick={() => setStructureFilter("ALL")}>All</Pill>
              {structureCats.map(cat => (
                <Pill key={cat} active={structureFilter === cat} onClick={() => setStructureFilter(cat)}>{cat}</Pill>
              ))}
            </div>
          )}
          {roomCats.length > 0 && (
            <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
              <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.14em", minWidth: "54px", textTransform: "uppercase" }}>Rooms</span>
              <Pill active={roomFilter === "ALL"} onClick={() => setRoomFilter("ALL")}>All</Pill>
              {roomCats.map(cat => (
                <Pill key={cat} active={roomFilter === cat} onClick={() => setRoomFilter(cat)}>{cat}</Pill>
              ))}
            </div>
          )}
        </div>

        <Legend
          activeColors={activeFrequencies}
          onToggle={handleToggleFrequency}
          activeSeasons={activeSeasons}
          onToggleSeason={handleToggleSeason}
        />
        <MaintenanceTable
          rows={filtered}
          allRows={rows}
          completedDates={completedDates}
          onDateChange={handleDateChange}
          nextDates={nextDates}
          onNextDateChange={handleNextDateChange}
          followSchedule={followSchedule}
          onToggleFollow={handleToggleFollow}
          reminderModes={reminderModes}
          onCycleReminderMode={handleCycleReminderMode}
          notes={notes}
          onNoteChange={handleNoteChange}
          onRowEdit={handleRowEdit}
          onDeleteRow={handleDeleteRow}
          sortCols={sortCols}
          onHeaderClick={handleHeaderClick}
          stickyTop={0}
        />
      </div>

      <ReminderSettings
        open={remindersOpen}
        onClose={() => setRemindersOpen(false)}
        onSync={handleSyncReminders}
        enabledCount={Object.values(reminderModes).filter(m => m && m !== "off").length}
      />

      {addTaskModalOpen && (
        <AddTaskModal
          categories={categoryGroups.flatMap(g => g.tabs)}
          rows={rows}
          onSave={handleSaveNewTask}
          onClose={() => setAddTaskModalOpen(false)}
        />
      )}
    </div>
  );
}
