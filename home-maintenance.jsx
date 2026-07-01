import { useState, useRef, useEffect, useMemo } from "react";
import { storageGet, storageSet } from "./lib/storage.js";
import FmHeader from "./src/components/FmHeader.jsx";
import FmSubnav from "./src/components/FmSubnav.jsx";
import { loadData, loadCustomData, saveCustomData, loadOverrides, saveOverrides, defaultData } from "./lib/data.js";
import MaintenanceTable from "./components/MaintenanceTable.jsx";
import Legend from "./components/Legend.jsx";
import {
  loadReminderModes, saveReminderModes,
  REMINDER_MODES,
} from "./lib/reminders.js";
import { computeNextDate, parseMonths } from "./lib/scheduleInterval.js";
import { getScheduleColor } from "./lib/scheduleColor.js";
import { loadDeletedRows, saveDeletedRows } from "./lib/deletedRows.js";
import { loadDeletedCategories } from "./lib/deletedCategories.js";
import { loadDeletedItems } from "./lib/deletedItems.js";
import { GROUP_ORDER, GROUP_LABELS, loadCategoryTypeOverrides, loadRoomSubtypes, formatRoomLabel } from "./lib/categoryTypes.js";
import { resolveTypeId, isSpatial, isFunctional, isExteriorType } from "./lib/entityTypes.js";
import { useForemanStore, usePageUIState } from "./lib/store.js";
import { getItemStableKey } from "./lib/itemKeys.js";
import { loadMaintenanceCompletionRecords, updateMaintenanceCompletionRecord, deleteMaintenanceCompletionRecord } from "./lib/maintenance.js";
import ConfirmDialog from "./components/ConfirmDialog.jsx";
import AddTaskModal from "./components/AddTaskModal.jsx";
import { FilterDropdown, FilterRow } from "./components/FilterPill.jsx";
import InlineEditCell, { toDateInput, dateInputToISO } from "./components/InlineEditCell.jsx";

const DEFAULT_CAT_SET = new Set(defaultData.map(d => d.category));
const DEFAULT_CAT_ORDER = Array.from(new Set(defaultData.map(r => r.category)));

function loadDates(key) {
  try {
    const raw = storageGet(key) ?? {};
    return Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, new Date(v)])
    );
  } catch {
    return {};
  }
}

function saveDates(key, dates) {
  storageSet(key, Object.fromEntries(
    Object.entries(dates).map(([k, v]) => [k, v.toISOString()])
  ));
}

export default function HomeMaintenanceTable({ navigate, navState }) {
  const [rows, setRows] = useState(() => loadData());
  const [uiState, setUIState] = usePageUIState("maintenance");

  const [activeTab, _setActiveTab] = useState(() => uiState.activeTab ?? "All tasks");
  function setActiveTab(v) { _setActiveTab(v); setUIState({ activeTab: v }); }

  const [completionRecords, setCompletionRecords] = useState(() => loadMaintenanceCompletionRecords());

  function handleHistoryEdit(key, field, raw) {
    const patch = field === "completedAt" ? { completedAt: dateInputToISO(raw) } : { [field]: raw };
    setCompletionRecords(updateMaintenanceCompletionRecord(key, patch));
  }
  const [pendingDelete, setPendingDelete] = useState(null);
  function handleDeleteHistory(key) {
    setCompletionRecords(deleteMaintenanceCompletionRecord(key));
  }

  const [activeStatus, _setActiveStatus] = useState(() => uiState.activeStatus ?? "ALL");
  function setActiveStatus(v) { _setActiveStatus(v); setUIState({ activeStatus: v }); }

  const [locationFilter, _setLocationFilter] = useState(() => uiState.locationFilter ?? "ALL");
  function setLocationFilter(v) { _setLocationFilter(v); setUIState({ locationFilter: v }); }

  const [levelFilter, _setLevelFilter] = useState(() => uiState.levelFilter ?? "ALL");
  function setLevelFilter(v) { _setLevelFilter(v); setUIState({ levelFilter: v }); }

  const [typeFilter, _setTypeFilter] = useState(() => uiState.typeFilter ?? "ALL");
  function setTypeFilter(v) { _setTypeFilter(v); setUIState({ typeFilter: v }); }

  const [search, setSearch] = useState("");
  const [historySearch, setHistorySearch] = useState("");

  const [historyCatFilter, _setHistoryCatFilter] = useState(() => uiState.historyCatFilter ?? "ALL");
  function setHistoryCatFilter(v) { _setHistoryCatFilter(v); setUIState({ historyCatFilter: v }); }

  const [activeFrequencies, _setActiveFrequencies] = useState(() => new Set(uiState.activeFrequencies ?? []));
  function setActiveFrequencies(v) { _setActiveFrequencies(v); setUIState({ activeFrequencies: [...v] }); }

  const [activeSeason, _setActiveSeason] = useState(() => uiState.activeSeason ?? "ALL");
  function setActiveSeason(v) { _setActiveSeason(v); setUIState({ activeSeason: v }); }

  const [tasklessMode, setTasklessMode] = useState("none"); // "none" | "only" | "mixed"
  // Inline edits buffered on a taskless placeholder row before it has a task name.
  // Keyed by `${category}|${item}`; merged into the synthetic row, committed on task entry.
  const [tasklessDrafts, setTasklessDrafts] = useState({});
  const [addRowHovered, setAddRowHovered] = useState(false);
  const [addTaskModalOpen, setAddTaskModalOpen] = useState(false);

  const [sortCols, _setSortCols] = useState(() => uiState.sortCols ?? []);
  function setSortCols(updater) {
    _setSortCols(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      setUIState({ sortCols: next });
      return next;
    });
  }
  const [deletedRows, setDeletedRows] = useState(() => loadDeletedRows());
  const [deletedCategories] = useState(() => loadDeletedCategories());
  const [deletedItems] = useState(() => loadDeletedItems());
  const [categoryTypeOverrides] = useState(() => loadCategoryTypeOverrides());
  const [roomSubtypes] = useState(() => loadRoomSubtypes());
  const entityTypeData    = useForemanStore(s => s.entityTypes);
  const fpPlacements      = useForemanStore(s => s.fpData.placements ?? {});
  const invFloors         = useForemanStore(s => s.floors);
  const invRooms          = useForemanStore(s => s.rooms);
  const customFieldValues  = useForemanStore(s => s.itemFieldValues);
  const spatialAssignments = useForemanStore(s => s.spatialAssignments);
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

  const catTypeMap = useMemo(() => {
    const map = {};
    rows.forEach(row => {
      if (!row.category) return;
      if (!row._isCustom && deletedCategories.has(row.category)) return;
      if (!map[row.category] && !row._isCustom && !row._isBlankCategory) {
        if (row.categoryType) map[row.category] = row.categoryType;
      }
    });
    return map;
  }, [rows, deletedCategories]);

  const allActiveCats = useMemo(() => {
    const s = new Set();
    rows.forEach(row => {
      if (!row.category) return;
      if (!row._isCustom && deletedCategories.has(row.category)) return;
      if (row._isBlankCategory) { if (row._isCustom) s.add(row.category); return; }
      s.add(row.category);
    });
    return Array.from(s);
  }, [rows, deletedCategories]);

  const categoryGroups = useMemo(() => {
    const groupTypeSet = new Set(GROUP_ORDER);
    return GROUP_ORDER.map(type => ({
      type,
      label: GROUP_LABELS[type],
      tabs: allActiveCats
        .filter(cat => {
          const oldType = categoryTypeOverrides[cat] ?? catTypeMap[cat] ?? "system";
          const typeId = resolveTypeId(cat, oldType);
          if (groupTypeSet.has(typeId)) return typeId === type;
          if (isSpatial(typeId, entityTypeData)) return type === "room";
          return type === "system";
        })
        .sort((a, b) => a.localeCompare(b)),
    }));
  }, [allActiveCats, catTypeMap, categoryTypeOverrides, entityTypeData]);

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

  const locationCats = useMemo(() => {
    const fromCats = allActiveCats.filter(cat => {
      const typeId = resolveTypeId(cat, categoryTypeOverrides[cat] ?? catTypeMap[cat] ?? "system");
      return isSpatial(typeId, entityTypeData);
    });
    const fromLabels = Object.values(spatialAssignments || {})
      .flatMap(v => [v?.roomLabel, v?.exteriorLabel]).filter(Boolean);
    return [...new Set([...fromCats, ...fromLabels])].sort();
  }, [allActiveCats, catTypeMap, categoryTypeOverrides, entityTypeData, spatialAssignments]);


  const typeOptions = useMemo(() => {
    const seen = new Set();
    rows.forEach(r => {
      if (!r.category || r._isBlankCategory) return;
      const v = customFieldValues?.[`${r.category}|${r.item}`]?.item_type;
      if (v) seen.add(v);
    });
    return [...seen].sort();
  }, [rows, customFieldValues]);


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
      storageSet("maintenance-notes", next);
      return next;
    });
  }

  const [completedDates, setCompletedDates] = useState(() => loadDates("maintenance-dates"));
  const [nextDates, setNextDates] = useState(() => loadDates("maintenance-next-dates"));
  const [notes, setNotes] = useState(() => storageGet("maintenance-notes") ?? {});
  const [followSchedule, setFollowSchedule] = useState(() => storageGet("maintenance-follow") ?? {});
  const [reminderModes, setReminderModes] = useState(() => loadReminderModes());

  function handleCycleReminderMode(key) {
    setReminderModes(prev => {
      const cur = REMINDER_MODES.includes(prev[key]) ? prev[key] : "off";
      const nextIdx = (REMINDER_MODES.indexOf(cur) + 1) % REMINDER_MODES.length;
      const next = { ...prev, [key]: REMINDER_MODES[nextIdx] };
      saveReminderModes(next);
      return next;
    });
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
        storageSet("maintenance-notes", next);
        return next;
      });
    }
    if (form.followSchedule) {
      setFollowSchedule(prev => {
        const next = { ...prev, [key]: true };
        storageSet("maintenance-follow", next);
        return next;
      });
    }

    setAddTaskModalOpen(false);
  }

  // Edit handler for synthetic taskless placeholder rows. Entering a non-empty
  // task name commits the row as a real custom task (carrying any buffered
  // schedule/season); other edits are buffered until then.
  function handleTasklessEdit(rowId, field, value) {
    const ident = tasklessById[rowId];
    if (!ident) return;
    const draftKey = `${ident.category}|${ident.item}`;

    if (field === "task" && value && value.trim()) {
      const draft = tasklessDrafts[draftKey] || {};
      handleSaveNewTask({
        category: ident.category,
        item:     draft.item ?? ident.item,
        task:     value.trim(),
        schedule: draft.schedule ?? null,
        season:   draft.season ?? null,
      });
      setTasklessDrafts(prev => { const n = { ...prev }; delete n[draftKey]; return n; });
      return;
    }

    setTasklessDrafts(prev => ({ ...prev, [draftKey]: { ...prev[draftKey], [field]: value } }));
  }

  function handleRowEdit(rowId, field, value) {
    if (tasklessById[rowId]) { handleTasklessEdit(rowId, field, value); return; }
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
        storageSet("maintenance-follow", next);
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
      storageSet("maintenance-follow", next);
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
    // Taskless placeholder: nothing persisted yet — just discard any buffered edits.
    if (row._isTaskless) {
      setTasklessDrafts(prev => { const n = { ...prev }; delete n[`${row.category}|${row.item}`]; return n; });
      return;
    }
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

      if (locationFilter !== "ALL") {
        const sa = spatialAssignments?.[getItemStableKey(row)] || {};
        const loc = row.category === locationFilter ? locationFilter
          : (sa.roomLabel || sa.exteriorLabel || "");
        if (loc !== locationFilter) return false;
      }
      if (levelFilter !== "ALL") {
        const placedRoomIds = Object.keys(fpPlacements[levelFilter] || {});
        const placedLabels = new Set(placedRoomIds.map(rid => invRooms[rid]?.label).filter(Boolean));
        if (!placedLabels.has(row.category)) return false;
      }
      if (typeFilter !== "ALL" && (customFieldValues?.[`${row.category}|${row.item}`]?.item_type || "") !== typeFilter) return false;

      // Status filter
      if (activeStatus !== "ALL") {
        const nd = nextDates[key];
        if (activeStatus === "OVERDUE" && (!nd || nd >= today)) return false;
        if (activeStatus === "SOON"    && (!nd || nd < today || nd > in30Days)) return false;
        if (activeStatus === "SCHED"   && !nd) return false;
        if (activeStatus === "OK"      && (!nd || nd < today || nd <= in30Days)) return false;
      }

      if (activeFrequencies.size > 0 && !activeFrequencies.has(getScheduleColor(row.schedule))) return false;
      if (activeSeason !== "ALL" && row.season !== activeSeason) return false;

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
  }, [rows, activeStatus, locationFilter, levelFilter, typeFilter, fpPlacements, invRooms, customFieldValues, spatialAssignments, activeFrequencies, activeSeason, search, deletedRows, deletedCategories, deletedItems, sortCols, nextDates]);

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

  const tasklessItems = useMemo(() => {
    const withTasks = new Set();
    const allItems  = new Map();
    rows.forEach(row => {
      if (!row.category || !row.item) return;
      if (!row._isCustom && deletedCategories.has(row.category)) return;
      if (deletedItems.has(`${row.category}|${row.item}`)) return;
      const itemKey = `${row.category}|${row.item}`;
      if (!allItems.has(itemKey)) allItems.set(itemKey, { category: row.category, item: row.item });
      if (row.task && !row._isBlankCategory && !deletedRows.has(`${itemKey}|${row.task}`)) {
        withTasks.add(itemKey);
      }
    });
    const result = [];
    allItems.forEach((item, key) => { if (!withTasks.has(key)) result.push(item); });
    return result.sort((a, b) => a.category.localeCompare(b.category) || a.item.localeCompare(b.item));
  }, [rows, deletedRows, deletedCategories, deletedItems]);

  // Synthetic placeholder rows for taskless items, rendered inside the main table.
  // Only category/item are filled; task/schedule/season are empty (or buffered drafts)
  // and editable inline. Entering a task name promotes the row to a real custom task.
  const tasklessRows = useMemo(() => tasklessItems.map(({ category, item }) => {
    const draft = tasklessDrafts[`${category}|${item}`] || {};
    return {
      _id: `taskless::${category}::${item}`,
      _isCustom: true,
      _isTaskless: true,
      _defaultKey: null,
      category,
      item,
      task: "",
      schedule: null,
      season: null,
      ...draft,
    };
  }), [tasklessItems, tasklessDrafts]);

  const tasklessById = useMemo(() => {
    const map = {};
    tasklessItems.forEach(({ category, item }) => {
      map[`taskless::${category}::${item}`] = { category, item };
    });
    return map;
  }, [tasklessItems]);

  // If every taskless item gets a task while viewing them, the toggle button
  // disappears — drop back to the normal view so it can't get stuck.
  useEffect(() => {
    if (tasklessItems.length === 0 && tasklessMode !== "none") setTasklessMode("none");
  }, [tasklessItems, tasklessMode]);

  const historyEntries = useMemo(() => {
    return Object.entries(completionRecords)
      .map(([key, rec]) => {
        const [category, item, task] = key.split("|");
        return { key, category, item, task, ...rec };
      })
      .filter(e => e.completedAt)
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  }, [completionRecords]);

  const historyCats = useMemo(() => {
    const seen = new Set();
    historyEntries.forEach(e => { if (e.category) seen.add(e.category); });
    return [...seen].sort();
  }, [historyEntries]);

  const filteredHistoryEntries = useMemo(() => {
    return historyEntries.filter(e => {
      if (historyCatFilter !== "ALL" && e.category !== historyCatFilter) return false;
      if (historySearch.trim()) {
        const q = historySearch.toLowerCase();
        if (
          !(e.category || "").toLowerCase().includes(q) &&
          !(e.item     || "").toLowerCase().includes(q) &&
          !(e.task     || "").toLowerCase().includes(q) &&
          !(e.assignee || "").toLowerCase().includes(q) &&
          !(e.notes    || "").toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [historyEntries, historyCatFilter, historySearch]);

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
          active={activeTab}
          onTabChange={setActiveTab}
          stats={activeTab === "History"
            ? [{ value: filteredHistoryEntries.length, label: "logged" }]
            : [
                { value: activeTaskCount, label: "tracked" },
                { value: maintenanceStats.overdue, color: "var(--fm-red)", label: "overdue" },
                { value: maintenanceStats.soon, color: "var(--fm-amber)", label: "due ≤7d" },
                { value: filtered.length, label: "shown" },
              ]
          }
        />
      </div>

      {activeTab === "History" && (
        <div style={{ flex: 1, overflow: "auto", padding: "var(--fm-spacing-5xl) var(--fm-spacing-5xl) 4rem" }}>

          {/* Filter bar */}
          <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
            <FilterDropdown
              value={historyCatFilter}
              onChange={setHistoryCatFilter}
              options={[{ value: "ALL", label: "All" }, ...historyCats.map(cat => ({ value: cat, label: cat }))]}
            />
            <div style={{ flex: 1 }} />
            <input
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
              placeholder="Search…"
              style={{ background: "var(--fm-bg-sunk)", border: "var(--fm-border-2)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.8rem", outline: "none", padding: "0.35rem 0.7rem", transition: "border-color 0.12s", width: "200px" }}
              onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
              onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"}
            />
          </div>

          {historyEntries.length === 0 ? (
            <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.82rem", margin: 0 }}>
              No history logged yet. Use &quot;Log It&quot; on any task to record a completion.
            </p>
          ) : filteredHistoryEntries.length === 0 ? (
            <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.82rem", margin: 0 }}>
              No results match your filter.
            </p>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  {["Date", "Category", "Item", "Task", "Who", "Notes"].map(h => (
                    <th key={h} style={{ borderBottom: "1px solid var(--fm-hairline2)", color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", fontWeight: 400, letterSpacing: "0.12em", padding: "0 0.75rem 0.5rem 0", textAlign: "left", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                  <th style={{ borderBottom: "1px solid var(--fm-hairline2)", width: "2rem" }} />
                </tr>
              </thead>
              <tbody>
                {filteredHistoryEntries.map(e => {
                  const d = new Date(e.completedAt);
                  const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                  return (
                    <tr key={e.key} style={{ borderBottom: "1px solid var(--fm-hairline)" }}>
                      <InlineEditCell
                        type="date"
                        value={e.completedAt}
                        editValue={toDateInput(e.completedAt)}
                        display={dateStr}
                        onCommit={raw => handleHistoryEdit(e.key, "completedAt", raw)}
                        style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.55rem 0.75rem 0.55rem 0", whiteSpace: "nowrap" }}
                      />
                      <td style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.55rem 0.75rem 0.55rem 0", whiteSpace: "nowrap" }}>{e.category}</td>
                      <td style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.55rem 0.75rem 0.55rem 0" }}>{e.item}</td>
                      <td style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.55rem 0.75rem 0.55rem 0" }}>{e.task}</td>
                      <InlineEditCell
                        value={e.assignee}
                        onCommit={raw => handleHistoryEdit(e.key, "assignee", raw)}
                        style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.55rem 0.75rem 0.55rem 0", whiteSpace: "nowrap" }}
                      />
                      <InlineEditCell
                        value={e.notes}
                        onCommit={raw => handleHistoryEdit(e.key, "notes", raw)}
                        style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.55rem 0 0.55rem 0" }}
                      />
                      <td style={{ padding: "0.25rem 0 0.25rem 0.25rem", width: "2rem" }}>
                        <button
                          onClick={() => setPendingDelete(e.key)}
                          style={{ background: "none", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", fontSize: "1rem", lineHeight: 1, padding: "0.2rem 0.4rem" }}
                          onMouseEnter={ev => ev.currentTarget.style.color = "var(--fm-red)"}
                          onMouseLeave={ev => ev.currentTarget.style.color = "var(--fm-ink-mute)"}
                          title="Delete record"
                        >×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete Record"
        message="This completion record will be permanently deleted. This cannot be undone."
        onConfirm={() => { handleDeleteHistory(pendingDelete); setPendingDelete(null); }}
        onCancel={() => setPendingDelete(null)}
      />

      {activeTab === "All tasks" && <div style={{ flex: 1, overflow: "auto", padding: "var(--fm-spacing-5xl) var(--fm-spacing-5xl) 4rem" }}>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center", marginBottom: "1.25rem" }}>
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
          {tasklessItems.length > 0 && (
            <button
              onClick={() => setTasklessMode(m => m === "none" ? "only" : m === "only" ? "mixed" : "none")}
              style={{
                background: tasklessMode !== "none" ? "#c9a96e18" : "transparent",
                border: `1px solid ${tasklessMode !== "none" ? "var(--fm-brass)" : "var(--fm-ink-dim)"}`,
                borderRadius: "3px",
                color: tasklessMode !== "none" ? "var(--fm-brass)" : "var(--fm-ink-mute)",
                cursor: "pointer",
                fontFamily: "var(--fm-mono)",
                fontSize: "0.72rem",
                letterSpacing: "0.08em",
                padding: "0.4rem 0.9rem",
                transition: "all 0.15s",
                whiteSpace: "nowrap",
              }}
            >
              {tasklessMode === "none"  && `${tasklessItems.length} items without tasks`}
              {tasklessMode === "only"  && "Taskless only ✕"}
              {tasklessMode === "mixed" && "Taskless + all ✕"}
            </button>
          )}
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
        </div>
        {/* Filter pills — Status / System / Room */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginBottom: "0.6rem" }}>
          <FilterRow label="Status" labelWidth="54px">
            <FilterDropdown
              value={activeStatus}
              onChange={setActiveStatus}
              options={[
                { value: "ALL",     label: "All" },
                { value: "OVERDUE", label: "Overdue", color: "var(--fm-red)"   },
                { value: "SOON",    label: "Soon",    color: "var(--fm-amber)" },
                { value: "SCHED",   label: "Sched" },
                { value: "OK",      label: "OK",      color: "var(--fm-green)" },
              ]}
            />
          </FilterRow>
          <FilterRow label="Location" labelWidth="54px" hidden={locationCats.length === 0}>
            <FilterDropdown
              value={locationFilter}
              onChange={setLocationFilter}
              options={[{ value: "ALL", label: "All" }, ...locationCats.map(cat => ({ value: cat, label: cat }))]}
            />
          </FilterRow>
          <FilterRow label="Level" labelWidth="54px" hidden={invFloors.length === 0}>
            <FilterDropdown
              value={levelFilter}
              onChange={setLevelFilter}
              options={[{ value: "ALL", label: "All" }, ...invFloors.map(lvl => ({ value: lvl.id, label: lvl.label }))]}
            />
          </FilterRow>
          <FilterRow label="Type" labelWidth="54px" hidden={typeOptions.length === 0}>
            <FilterDropdown
              value={typeFilter}
              onChange={setTypeFilter}
              options={[{ value: "ALL", label: "All" }, ...typeOptions.map(t => ({ value: t, label: t }))]}
            />
          </FilterRow>
          <FilterRow label="Season" labelWidth="54px">
            <FilterDropdown
              value={activeSeason}
              onChange={setActiveSeason}
              options={[
                { value: "ALL",    label: "All" },
                { value: "spring", label: "Spring" },
                { value: "summer", label: "Summer" },
                { value: "fall",   label: "Fall"   },
                { value: "winter", label: "Winter" },
              ]}
            />
          </FilterRow>
        </div>

        <Legend activeColors={activeFrequencies} onToggle={handleToggleFrequency} />

        {/* Taskless-mode banner: placeholder rows for items without tasks are
            woven into the table below; fill in a Task to create the task. */}
        {tasklessMode !== "none" && tasklessItems.length > 0 && (
          <div style={{ alignItems: "center", display: "flex", gap: "0.75rem", marginBottom: "0.6rem" }}>
            <span style={{ color: "var(--fm-brass)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              {tasklessMode === "only" ? "Items without tasks" : "Items without tasks + scheduled"}
            </span>
            <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem" }}>
              {tasklessItems.length} {tasklessItems.length === 1 ? "item has" : "items have"} no task — fill in the Task field on a highlighted row to create one
            </span>
          </div>
        )}

        <MaintenanceTable
          rows={tasklessMode === "only"  ? tasklessRows
              : tasklessMode === "mixed" ? [...tasklessRows, ...filtered]
              : filtered}
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
      </div>}

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
