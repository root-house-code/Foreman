import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import useIsMobile from "../src/hooks/useIsMobile.js";
import { sheetOverlay, sheetPanel } from "./ModalShared.jsx";
import { storageGet, storageSet } from "../lib/storage.js";
import { loadData, loadCustomData, saveCustomData, loadOverrides, saveOverrides } from "../lib/data.js";
import { loadDeletedRows, saveDeletedRows } from "../lib/deletedRows.js";
import { loadDeletedItems } from "../lib/deletedItems.js";
import { loadDeletedCategories } from "../lib/deletedCategories.js";
import { loadItemDetails } from "../lib/itemDetails.js";
import { loadItemFieldSchemas, saveItemFieldSchemas } from "../lib/customFields.js";
import { getItemStableKey } from "../lib/itemKeys.js";
import { UNIVERSAL_FIELDS, ITEM_FIELDS, TYPE_FIELDS } from "../lib/fieldLibrary.js";
import { expectedYears } from "../lib/lifespans.js";
import { BUILT_IN_ITEM_TYPES } from "../lib/itemTypes.js";
import { ITEM_SUBTYPES } from "../lib/itemSubtypes.js";
import { loadCategoryTypeOverrides } from "../lib/categoryTypes.js";
import { resolveTypeId, isSpatial, isFunctional, isExteriorType as isExteriorTypeUtil } from "../lib/entityTypes.js";
import { getManufacturers } from "../lib/manufacturers.js";
import { getModels } from "../lib/models.js";
import { loadTodos, saveTodos, createTodo } from "../lib/todos.js";
import { createProject } from "../lib/projects.js";
import { useForemanStore } from "../lib/store.js";
import { SEASON_OPTIONS } from "../lib/scheduleOptions.js";
import { loadGroqApiKey } from "../lib/groqConfig.js";
import FollowButton from "./FollowButton.jsx";
import SchedulePicker from "./SchedulePicker.jsx";
import AddTaskModal from "./AddTaskModal.jsx";
import ModelComboField from "./ModelComboField.jsx";

const PRIORITY_COLORS = {
  low:    "var(--fm-green)",
  medium: "var(--fm-brass)",
  high:   "var(--fm-amber)",
  urgent: "var(--fm-red)",
};

function compressImage(file, maxWidth = 1200, quality = 0.75) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ItemDetailPanel — the shared item detail sidebar used by both the Inventory
// page and the Item Lifespans page. Self-contained: reads inventory/field/task
// data from the store + storage and manages its own editing state, so a host
// page only needs to hand it { selectedItem, onClose, navigate }.
//
// selectedItem: { category, item, stableKey? } | null
// onClose:      called when the × in the header is clicked
// navigate:     page navigation fn (used by the "View all on …" footer links)
// showClose:    whether to render the header × (default true)
export default function ItemDetailPanel({ selectedItem, onClose, navigate, showClose = true, onMaintenanceChanged }) {
  const isMobile = useIsMobile();
  // Phones: the side panel becomes a full-screen takeover when an item is
  // selected (and disappears entirely when none is), so it must always be
  // closable there.
  if (isMobile) showClose = true;
  // ── Store-backed data ────────────────────────────────────────────────────
  const _itemFieldValues    = useForemanStore(s => s.itemFieldValues);
  const _spatialAssignments = useForemanStore(s => s.spatialAssignments);
  const entityTypeData      = useForemanStore(s => s.entityTypes);
  const projects            = useForemanStore(s => s.projects);
  const lifespanOverrides   = useForemanStore(s => s.lifespanOverrides);
  const customFieldValues = useMemo(() => {
    const out = {};
    const keys = new Set([...Object.keys(_spatialAssignments), ...Object.keys(_itemFieldValues)]);
    keys.forEach(k => { out[k] = { ...(_spatialAssignments[k] || {}), ...(_itemFieldValues[k] || {}) }; });
    return out;
  }, [_spatialAssignments, _itemFieldValues]);

  // ── Storage-backed data (with a local reload for maintenance rows) ─────────
  const [rows, setRows]                 = useState(() => loadData());
  const [deletedCategories]             = useState(() => loadDeletedCategories());
  const [deletedItems]                  = useState(() => loadDeletedItems());
  const [deletedRows, setDeletedRows]   = useState(() => loadDeletedRows());
  const [itemDetails]                   = useState(() => loadItemDetails());
  const [itemFieldSchemas, setItemFieldSchemas] = useState(() => loadItemFieldSchemas());
  const [todos, setTodos]               = useState(() => loadTodos());
  const [nextDatesMap]                  = useState(() => storageGet("maintenance-next-dates") ?? {});
  const [categoryTypeOverrides]         = useState(() => loadCategoryTypeOverrides());
  function reload() { setRows(loadData()); onMaintenanceChanged?.(); }

  // ── Panel-local UI state ──────────────────────────────────────────────────
  const [detailTab, setDetailTab]       = useState("details");
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [newField, setNewField]         = useState({ name: "", type: "text", options: "" });
  const [addingTask, setAddingTask]     = useState(false);
  const [editingTask, setEditingTask]   = useState(null);
  const [addTaskModalOpen, setAddTaskModalOpen] = useState(false);
  const [newTask, setNewTask]           = useState({ task: "", schedule: "", season: null, lastCompleted: null, nextDate: null, followSchedule: false, notes: "" });
  const [deleteTaskPrompt, setDeleteTaskPrompt] = useState(null);
  const [suggestedTasks, setSuggestedTasks] = useState(null);
  const [suggestedFor, setSuggestedFor] = useState(null);
  const [fetchingTasks, setFetchingTasks] = useState(false);
  const [fetchError, setFetchError]     = useState(null);
  const [addingProject, setAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [deleteProjectPrompt, setDeleteProjectPrompt] = useState(null);
  const [hoveredProjectId, setHoveredProjectId] = useState(null);
  const [addingTodo, setAddingTodo]     = useState(false);
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [deleteTodoPrompt, setDeleteTodoPrompt] = useState(null);
  const [hoveredTodoId, setHoveredTodoId] = useState(null);

  // ── Category taxonomy (mirrors the Inventory page derivations) ─────────────
  const CATEGORY_ITEMS = useMemo(() => {
    const map = {};
    rows.forEach(row => {
      if (!row._isCustom && deletedCategories.has(row.category)) return;
      if (row._isBlankCategory) { if (row.category) map[row.category] = map[row.category] || []; return; }
      if (!row.category || !row.item) return;
      if (deletedItems.has(getItemStableKey(row))) return;
      if (!map[row.category]) map[row.category] = [];
      if (!map[row.category].includes(row.item)) map[row.category].push(row.item);
    });
    return map;
  }, [rows, deletedCategories, deletedItems]);
  const CATEGORIES = Object.keys(CATEGORY_ITEMS);
  const defaultCategoryTypes = useMemo(() => {
    const map = {};
    rows.forEach(row => {
      if (!row.category || !row.categoryType) return;
      if (!map[row.category] || row._isCustom) map[row.category] = row.categoryType;
    });
    return map;
  }, [rows]);
  const effectiveCategoryTypes = useMemo(() => {
    const result = {};
    CATEGORIES.forEach(cat => { result[cat] = categoryTypeOverrides[cat] ?? defaultCategoryTypes[cat] ?? "system"; });
    return result;
  }, [CATEGORIES, categoryTypeOverrides, defaultCategoryTypes]);

  // ── Derived per-item lists ────────────────────────────────────────────────
  const itemTasks = useMemo(() => {
    if (!selectedItem) return [];
    return rows.filter(r =>
      r.category === selectedItem.category &&
      r.item === selectedItem.item &&
      !r._isBlankCategory &&
      r.task &&
      !(!r._isCustom && deletedCategories.has(r.category)) &&
      !deletedItems.has(getItemStableKey(r)) &&
      !deletedRows.has(`${r.category}|${r.item}|${r.task}`)
    );
  }, [rows, selectedItem, deletedRows, deletedCategories, deletedItems]);

  const selectedTodos = useMemo(() => {
    if (!selectedItem) return [];
    return todos.filter(t => t.linkedCategory === selectedItem.category && (t.linkedItem === selectedItem.item || t.linkedItem === null));
  }, [todos, selectedItem]);

  const selectedProjects = useMemo(() => {
    if (!selectedItem) return [];
    return projects.filter(p => p.linkedCategory === selectedItem.category && (p.linkedItem === selectedItem.item || p.linkedItem === null));
  }, [projects, selectedItem]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleCustomFieldValueChange(category, item, fieldId, value, stableKey = null) {
    let key = stableKey;
    if (!key) {
      const row = rows.find(r => r._isCustom && r.category === category && r.item === item)
               ?? rows.find(r => r.category === category && r.item === item);
      key = row ? getItemStableKey(row) : `${category}|${item}`;
    }
    useForemanStore.getState().setCustomField(key, fieldId, value);
  }

  function handleAddItemField(category, item, field, stableKey = null) {
    const key = stableKey ?? `${category}|${item}`;
    const next = { ...itemFieldSchemas, [key]: [...(itemFieldSchemas[key] || []), field] };
    setItemFieldSchemas(next);
    saveItemFieldSchemas(next);
  }

  function handleDeleteItemField(category, item, fieldId, stableKey = null) {
    const key = stableKey ?? `${category}|${item}`;
    const next = { ...itemFieldSchemas, [key]: (itemFieldSchemas[key] || []).filter(f => f.id !== fieldId) };
    setItemFieldSchemas(next);
    saveItemFieldSchemas(next);
  }

  function handleAddTask() {
    if (!newTask.task.trim() || !selectedItem) return;
    const taskName = newTask.task.trim();
    const key = `${selectedItem.category}|${selectedItem.item}|${taskName}`;
    const newRow = { _id: `custom-${Date.now()}`, _isCustom: true, _defaultKey: null, category: selectedItem.category, item: selectedItem.item, task: taskName, schedule: newTask.schedule || "", season: newTask.season || null };
    const customs = loadCustomData();
    saveCustomData([...customs, newRow]);
    if (newTask.lastCompleted) { const dates = storageGet("maintenance-dates") ?? {}; dates[key] = new Date(newTask.lastCompleted).toISOString(); storageSet("maintenance-dates", dates); }
    if (newTask.nextDate) { const nextDates = storageGet("maintenance-next-dates") ?? {}; nextDates[key] = new Date(newTask.nextDate).toISOString(); storageSet("maintenance-next-dates", nextDates); }
    if (newTask.notes) { const notes = storageGet("maintenance-notes") ?? {}; notes[key] = newTask.notes; storageSet("maintenance-notes", notes); }
    if (newTask.followSchedule) { const follow = storageGet("maintenance-follow") ?? {}; follow[key] = true; storageSet("maintenance-follow", follow); }
    reload();
    setAddingTask(false);
    setNewTask({ task: "", schedule: "", season: null, lastCompleted: null, nextDate: null, followSchedule: false, notes: "" });
  }

  function handleAddTaskFromModal(form) {
    if (!selectedItem) return;
    const taskName = form.task.trim();
    const key = `${selectedItem.category}|${selectedItem.item}|${taskName}`;
    const newRow = { _id: `custom-${Date.now()}`, _isCustom: true, _defaultKey: null, category: selectedItem.category, item: selectedItem.item, task: taskName, schedule: form.schedule || "", season: form.season || null };
    const customs = loadCustomData();
    saveCustomData([...customs, newRow]);
    if (form.lastCompleted) { const dates = storageGet("maintenance-dates") ?? {}; dates[key] = new Date(form.lastCompleted).toISOString(); storageSet("maintenance-dates", dates); }
    if (form.nextDate) { const nextDates = storageGet("maintenance-next-dates") ?? {}; nextDates[key] = new Date(form.nextDate).toISOString(); storageSet("maintenance-next-dates", nextDates); }
    if (form.notes) { const notes = storageGet("maintenance-notes") ?? {}; notes[key] = form.notes; storageSet("maintenance-notes", notes); }
    if (form.followSchedule) { const follow = storageGet("maintenance-follow") ?? {}; follow[key] = true; storageSet("maintenance-follow", follow); }
    reload();
    setAddTaskModalOpen(false);
  }

  function handleUpdateTask(originalRow) {
    if (!newTask.task.trim() || !selectedItem) return;
    const taskName = newTask.task.trim();
    if (originalRow._isCustom) {
      const oldKey = `${originalRow.category}|${originalRow.item}|${originalRow.task}`;
      const newKey = `${originalRow.category}|${originalRow.item}|${taskName}`;
      const customs = loadCustomData();
      saveCustomData(customs.map(r => r._id === originalRow._id ? { ...r, task: taskName, schedule: newTask.schedule || "", season: newTask.season || null } : r));
      if (taskName !== originalRow.task) {
        ["maintenance-dates", "maintenance-next-dates", "maintenance-notes", "maintenance-follow"].forEach(k => {
          const d = storageGet(k) ?? {};
          if (d[oldKey] !== undefined) { d[newKey] = d[oldKey]; delete d[oldKey]; storageSet(k, d); }
        });
      }
    } else {
      const key = `${originalRow.category}|${originalRow.item}|${originalRow.task}`;
      const overrides = loadOverrides();
      overrides[key] = { ...(overrides[key] || {}), schedule: newTask.schedule || "", season: newTask.season || null };
      saveOverrides(overrides);
    }
    reload();
    setEditingTask(null);
    setAddingTask(false);
    setNewTask({ task: "", schedule: "", season: null, lastCompleted: null, nextDate: null, followSchedule: false, notes: "" });
  }

  function handleDeleteTask(row) {
    if (row._isCustom) {
      const customs = loadCustomData();
      saveCustomData(customs.filter(r => r._id !== row._id));
      reload();
    } else {
      const key = `${row.category}|${row.item}|${row.task}`;
      const next = new Set([...deletedRows, key]);
      saveDeletedRows(next);
      setDeletedRows(next);
    }
  }

  async function handleFetchTasks(manufacturer, model, item, category) {
    const apiKey = loadGroqApiKey();
    if (!apiKey) {
      setFetchError("Groq API key not configured. Add one in Preferences → Integrations.");
      return;
    }
    setFetchingTasks(true);
    setFetchError(null);
    setSuggestedTasks(null);
    setSuggestedFor({ category, item });
    const scheduleValues = "every 1 month, every 3 months, every 6 months, every 1 year, every 2 years, every 5 years, every 10 years, as needed, every load";
    const prompt = `You are a home maintenance expert. List the manufacturer-recommended maintenance tasks for this appliance.

Manufacturer: ${manufacturer}
Model: ${model || "unknown"}
Appliance type: ${item}

Return ONLY a JSON array with no explanation or markdown. Each object must have exactly these fields:
- "task": string — concise task name (e.g. "Replace water filter")
- "schedule": string — use one of: ${scheduleValues}
- "season": null or one of "spring", "summer", "fall", "winter" (only if the task is season-specific)

Return 5–12 tasks. Include only tasks that are standard for this appliance type.`;
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: prompt }], temperature: 0.2, max_tokens: 1024 }),
      });
      if (!res.ok) throw new Error(`Groq API error ${res.status}`);
      const data = await res.json();
      const raw = data.choices[0].message.content.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(raw);
      setSuggestedTasks(parsed.map(t => ({ ...t, selected: true })));
    } catch (err) {
      setFetchError(err.message);
    } finally {
      setFetchingTasks(false);
    }
  }

  function handleAddSuggestedTasks() {
    if (!suggestedTasks || !suggestedFor) return;
    const toAdd = suggestedTasks.filter(t => t.selected);
    if (toAdd.length === 0) return;
    const customs = loadCustomData();
    const newRows = toAdd.map((t, i) => ({ _id: `custom-${Date.now()}-${i}`, _isCustom: true, _defaultKey: null, category: suggestedFor.category, item: suggestedFor.item, task: t.task, schedule: t.schedule || "", season: t.season || null }));
    saveCustomData([...customs, ...newRows]);
    reload();
    setSuggestedTasks(null);
    setSuggestedFor(null);
  }

  function handleAddTodo() {
    const title = newTodoTitle.trim();
    if (!title || !selectedItem) return;
    const next = [...todos, createTodo({ title, linkedCategory: selectedItem.category, linkedItem: selectedItem.item })];
    setTodos(next);
    saveTodos(next);
    setNewTodoTitle("");
    setAddingTodo(false);
  }

  function handleDeleteTodo(todo) {
    const next = todos.filter(t => t.id !== todo.id);
    setTodos(next);
    saveTodos(next);
    setDeleteTodoPrompt(null);
  }

  function handleAddProject() {
    const name = newProjectName.trim();
    if (!name || !selectedItem) return;
    useForemanStore.getState().addProject(createProject({ name, linkedCategory: selectedItem.category, linkedItem: selectedItem.item }));
    setNewProjectName("");
    setAddingProject(false);
  }

  function handleDeleteProject(project) {
    useForemanStore.getState().deleteProject(project.id);
    setDeleteProjectPrompt(null);
  }

  const resetTaskDraft = () => { setAddingTask(false); setEditingTask(null); setNewTask({ task: "", schedule: "", season: null, lastCompleted: null, nextDate: null, followSchedule: false, notes: "" }); };

  return (
    <div style={isMobile
      ? (selectedItem
          ? { background: "var(--fm-bg)", display: "flex", flexDirection: "column", inset: 0, overflow: "hidden", padding: "10px 10px calc(10px + env(safe-area-inset-bottom))", position: "fixed", zIndex: 85 }
          : { display: "none" })
      : { display: "flex", flex: 1, flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
      <div style={{ background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline)", borderRadius: "8px", display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>

        {/* Panel header — item name */}
        <div style={{ alignItems: "flex-start", borderBottom: "1px solid var(--fm-hairline)", display: "flex", flexShrink: 0, padding: "0.75rem 1rem 0.6rem" }}>
          <div style={{ flex: 1 }}>
          {selectedItem ? (
            <>
              <div style={{ color: "var(--fm-brass)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.15em", textTransform: "uppercase" }}>Item</div>
              <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.82rem", marginTop: "0.35rem" }}>
                {selectedItem.item}
                <span style={{ color: "var(--fm-ink-dim)", fontSize: "0.65rem", marginLeft: "0.5rem" }}>— {selectedItem.category}</span>
              </div>
            </>
          ) : (
            <div style={{ color: "var(--fm-brass)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.15em", textTransform: "uppercase" }}>Item Details</div>
          )}
          </div>
          {showClose && (
            <button
              onClick={() => onClose?.()}
              style={{ background: "transparent", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontSize: "1rem", lineHeight: 1, padding: "0 0 0 0.5rem" }}
              title="Close panel"
            >×</button>
          )}
        </div>

        {/* Tab strip */}
        <div style={{ borderBottom: "1px solid var(--fm-hairline)", display: "flex", flexShrink: 0 }}>
          {[
            { id: "details",     label: "Details"     },
            { id: "maintenance", label: "Maintenance" },
            { id: "projects",    label: "Projects"    },
            { id: "todos",       label: "To Dos"      },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setDetailTab(tab.id)}
              style={{
                background: "transparent",
                border: "none",
                borderBottom: detailTab === tab.id ? "2px solid var(--fm-brass)" : "2px solid transparent",
                color: detailTab === tab.id ? "var(--fm-brass)" : "var(--fm-ink-dim)",
                cursor: "pointer",
                flex: 1,
                fontFamily: "var(--fm-mono)",
                fontSize: "0.58rem",
                letterSpacing: "0.1em",
                padding: "0.55rem 0.25rem",
                textTransform: "uppercase",
                transition: "color 0.12s",
              }}
            >{tab.label}</button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: "2rem" }}>

        {detailTab === "details" && (!selectedItem ? (
          <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "2.5rem 1rem", textAlign: "center" }}>
            Select an item to view details
          </div>
        ) : (
          <div style={{ padding: "0.75rem 1rem 0.85rem" }}>
            {(() => {
              const cfKey = selectedItem.stableKey ?? `${selectedItem.category}|${selectedItem.item}`;
              const itmFields = itemFieldSchemas[cfKey] || [];
              const vals = customFieldValues[cfKey] || {};
              const itemTypeField = UNIVERSAL_FIELDS.find(f => f.id === "item_type");
              const manualIds = new Set(itmFields.map(f => f.id));
              const inheritedFields = (TYPE_FIELDS[vals.item_type || ""] || []).filter(f => !manualIds.has(f.id));
              const addedIds = new Set([...manualIds, ...inheritedFields.map(f => f.id), "item_type", "system", "room", "exterior"]);
              const orphanedFields = [...UNIVERSAL_FIELDS, ...(ITEM_FIELDS[selectedItem.item] || [])].filter(
                f => !addedIds.has(f.id) && vals[f.id] != null && vals[f.id] !== ""
              );
              orphanedFields.forEach(f => addedIds.add(f.id));
              const svgArrow = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235a5460'/%3E%3C/svg%3E")`;
              const fieldStyle = { background: "var(--fm-bg)", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", boxSizing: "border-box", color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", outline: "none", padding: "0.3rem 0.5rem", width: "100%" };
              const labelStyle = { color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.12em", textTransform: "uppercase" };
              const chipBtn = { background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline)", borderRadius: "3px", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", letterSpacing: "0.04em", padding: "0.2rem 0.55rem", transition: "all 0.12s" };

              function renderFieldInput(field) {
                const val = vals[field.id] ?? "";
                const onChange = v => handleCustomFieldValueChange(selectedItem.category, selectedItem.item, field.id, v, selectedItem.stableKey);

                if (field.id === "item_type") {
                  const userTypes = Object.values(customFieldValues).map(v => v?.item_type).filter(Boolean);
                  const existingTypes = [...new Set([...BUILT_IN_ITEM_TYPES, ...userTypes])].sort();
                  return <ModelComboField value={val} models={existingTypes} fieldStyle={fieldStyle} onChange={onChange} />;
                }
                if (field.type === "subtype") {
                  const currentType = vals.item_type || "";
                  const subtypeOptions = ITEM_SUBTYPES[currentType];
                  if (subtypeOptions) return (
                    <select value={val} onChange={e => onChange(e.target.value)} style={{ ...fieldStyle, appearance: "none", backgroundImage: svgArrow, backgroundRepeat: "no-repeat", backgroundPosition: "right 0.5rem center", cursor: "pointer", paddingRight: "1.5rem" }} onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"} onBlur={e => e.currentTarget.style.borderColor = "var(--fm-ink-dim)"}>
                      <option value="">—</option>
                      {subtypeOptions.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  );
                  return <input type="text" value={val} onChange={e => onChange(e.target.value)} placeholder="—" style={fieldStyle} onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"} onBlur={e => e.currentTarget.style.borderColor = "var(--fm-ink-dim)"} />;
                }
                if (field.id === "system") {
                  const systemVal = vals.systemCategory || vals.system || "";
                  const systemOptions = CATEGORIES.filter(c => isFunctional(resolveTypeId(c, effectiveCategoryTypes[c] || "system"), entityTypeData)).sort();
                  const defaultSystem = isFunctional(resolveTypeId(selectedItem.category, effectiveCategoryTypes[selectedItem.category] || "system"), entityTypeData) ? selectedItem.category : "";
                  return <ModelComboField value={systemVal || defaultSystem} models={systemOptions} fieldStyle={fieldStyle} onChange={v => handleCustomFieldValueChange(selectedItem.category, selectedItem.item, "systemCategory", v, selectedItem.stableKey)} />;
                }
                if (field.id === "location") {
                  const catTypeId = resolveTypeId(selectedItem.category, effectiveCategoryTypes[selectedItem.category] || "system");
                  const catIsSpatial  = isSpatial(catTypeId, entityTypeData);
                  const catIsExterior = isExteriorTypeUtil(catTypeId, entityTypeData);
                  const roomOpts = CATEGORIES.filter(c => isSpatial(resolveTypeId(c, effectiveCategoryTypes[c] || "system"), entityTypeData)).sort();
                  const extOpts  = CATEGORIES.filter(c => isExteriorTypeUtil(resolveTypeId(c, effectiveCategoryTypes[c] || "system"), entityTypeData)).sort();
                  const allOpts  = [...new Set([...roomOpts, ...extOpts])].sort();
                  const currentRoom = 'roomLabel' in vals ? (vals.roomLabel ?? "") : (catIsSpatial && !catIsExterior ? selectedItem.category : "");
                  const currentExt  = 'exteriorLabel' in vals ? (vals.exteriorLabel ?? "") : (catIsExterior ? selectedItem.category : "");
                  const locVal = currentRoom || currentExt;
                  const extSet = new Set(extOpts);
                  function handleLocationChange(v) {
                    const isExt = extSet.has(v);
                    if (isExt) {
                      handleCustomFieldValueChange(selectedItem.category, selectedItem.item, "exteriorLabel", v || null, selectedItem.stableKey);
                      if (currentRoom) handleCustomFieldValueChange(selectedItem.category, selectedItem.item, "roomLabel", null, selectedItem.stableKey);
                    } else {
                      handleCustomFieldValueChange(selectedItem.category, selectedItem.item, "roomLabel", v || null, selectedItem.stableKey);
                      if (currentExt) handleCustomFieldValueChange(selectedItem.category, selectedItem.item, "exteriorLabel", null, selectedItem.stableKey);
                    }
                  }
                  return <ModelComboField value={locVal} models={allOpts} fieldStyle={fieldStyle} onChange={handleLocationChange} />;
                }
                if (field.id === "manufacturer") {
                  const mfrs = getManufacturers(selectedItem.item);
                  return <ModelComboField value={val} models={mfrs} fieldStyle={fieldStyle} onChange={onChange} />;
                }
                if (field.id === "model") {
                  const mfr = vals.manufacturer || "";
                  const models = getModels(mfr, selectedItem.item);
                  return <ModelComboField value={val} models={models} fieldStyle={fieldStyle} onChange={onChange} />;
                }
                if (field.type === "receipt") {
                  const receipt = vals[field.id];
                  return receipt ? (
                    <div style={{ alignItems: "center", display: "flex", gap: "0.5rem" }}>
                      <img src={receipt} alt="Receipt" onClick={() => window.open(receipt, "_blank")} style={{ border: "1px solid var(--fm-hairline2)", borderRadius: "3px", cursor: "pointer", height: 44, objectFit: "cover", width: 66 }} />
                      <button onClick={() => onChange(null)} style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.1rem 0.3rem", transition: "color 0.15s" }} onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"} onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}>×</button>
                    </div>
                  ) : (
                    <label style={{ cursor: "pointer", lineHeight: 1 }}>
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={async e => { const file = e.target.files[0]; if (!file) return; const dataUrl = await compressImage(file); onChange(dataUrl); e.target.value = ""; }} />
                      <span style={{ border: "1px dashed var(--fm-ink-dim)", borderRadius: "3px", color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.7rem", letterSpacing: "0.08em", padding: "0.25rem 0.65rem", transition: "color 0.15s, border-color 0.15s" }} onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-brass)"; e.currentTarget.style.borderColor = "var(--fm-brass)"; }} onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-ink-dim)"; e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; }}>+ Upload Receipt</span>
                    </label>
                  );
                }
                if (field.type === "list" && field.options?.length > 0) return (
                  <select value={val} onChange={e => onChange(e.target.value)} style={{ ...fieldStyle, appearance: "none", backgroundImage: svgArrow, backgroundRepeat: "no-repeat", backgroundPosition: "right 0.5rem center", cursor: "pointer", paddingRight: "1.5rem" }} onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"} onBlur={e => e.currentTarget.style.borderColor = "var(--fm-ink-dim)"}>
                    <option value="">—</option>
                    {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                );
                return (
                  <input type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} value={val} onChange={e => onChange(e.target.value)} placeholder="—" style={fieldStyle} onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"} onBlur={e => e.currentTarget.style.borderColor = "var(--fm-ink-dim)"} />
                );
              }

              const universalAvail = UNIVERSAL_FIELDS.filter(f => !addedIds.has(f.id));
              const itemLibAvail   = (ITEM_FIELDS[selectedItem.item] || []).filter(f => !addedIds.has(f.id));

              return (
                <>
                  {itemTypeField && (
                    <div style={{ marginBottom: "0.45rem" }}>
                      <div style={{ marginBottom: "0.2rem" }}><span style={labelStyle}>{itemTypeField.name}</span></div>
                      {renderFieldInput(itemTypeField)}
                    </div>
                  )}
                  <div style={{ marginBottom: "0.45rem" }}>
                    <div style={{ marginBottom: "0.2rem" }}><span style={labelStyle}>System</span></div>
                    {renderFieldInput({ id: "system", name: "System", type: "text" })}
                  </div>
                  <div style={{ marginBottom: "0.45rem" }}>
                    <div style={{ marginBottom: "0.2rem" }}><span style={labelStyle}>Location</span></div>
                    {renderFieldInput({ id: "location", name: "Location", type: "text" })}
                  </div>
                  <div style={{ marginBottom: "0.45rem" }}>
                    <div style={{ marginBottom: "0.2rem" }}><span style={labelStyle}>Estimated Lifespan</span></div>
                    {(() => {
                      const typeDefault = expectedYears(selectedItem.item, lifespanOverrides);
                      return (
                        <div style={{ alignItems: "center", display: "flex", gap: "0.4rem" }}>
                          <input
                            type="number" min="0" step="1"
                            value={vals.estimated_lifespan ?? ""}
                            placeholder={typeDefault != null ? `${typeDefault} (default)` : "—"}
                            onChange={e => handleCustomFieldValueChange(selectedItem.category, selectedItem.item, "estimated_lifespan", e.target.value, selectedItem.stableKey)}
                            style={{ ...fieldStyle, width: 110 }}
                            onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
                            onBlur={e => e.currentTarget.style.borderColor = "var(--fm-ink-dim)"}
                          />
                          <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem" }}>yr</span>
                        </div>
                      );
                    })()}
                  </div>
                  {inheritedFields.length > 0 && (
                    <>
                      <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.12em", margin: "0.6rem 0 0.5rem", textTransform: "uppercase" }}>Common</div>
                      {inheritedFields.map(field => (
                        <div key={field.id} style={{ marginBottom: "0.45rem" }}>
                          <div style={{ marginBottom: "0.2rem" }}><span style={labelStyle}>{field.name}</span></div>
                          {renderFieldInput(field)}
                        </div>
                      ))}
                    </>
                  )}
                  {orphanedFields.map(field => (
                    <div key={field.id} style={{ marginBottom: "0.45rem" }}>
                      <div style={{ marginBottom: "0.2rem" }}><span style={labelStyle}>{field.name}</span></div>
                      {renderFieldInput(field)}
                    </div>
                  ))}
                  {itmFields.map(field => (
                    <div key={field.id} style={{ marginBottom: "0.45rem" }}>
                      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: "0.2rem" }}>
                        <span style={labelStyle}>{field.name}</span>
                        <button onClick={() => handleDeleteItemField(selectedItem.category, selectedItem.item, field.id, selectedItem.stableKey)} style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.85rem", lineHeight: 1, padding: "0 0.1rem", transition: "color 0.15s" }} onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"} onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}>×</button>
                      </div>
                      {renderFieldInput(field)}
                    </div>
                  ))}

                  {showFieldPicker && (
                    <div style={{ background: "var(--fm-bg)", border: "1px solid var(--fm-hairline)", borderRadius: "4px", marginBottom: "0.5rem", marginTop: itmFields.length > 0 ? "0.5rem" : 0, padding: "0.6rem 0.75rem" }}>
                      {universalAvail.length > 0 && (
                        <>
                          <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.12em", marginBottom: "0.4rem", textTransform: "uppercase" }}>Common</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.6rem" }}>
                            {universalAvail.map(f => (
                              <button key={f.id} onClick={() => handleAddItemField(selectedItem.category, selectedItem.item, f, selectedItem.stableKey)} style={chipBtn} onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}>{f.name}</button>
                            ))}
                          </div>
                        </>
                      )}
                      {itemLibAvail.length > 0 && (
                        <>
                          <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.12em", marginBottom: "0.4rem", textTransform: "uppercase" }}>For {selectedItem.item}</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.6rem" }}>
                            {itemLibAvail.map(f => (
                              <button key={f.id} onClick={() => handleAddItemField(selectedItem.category, selectedItem.item, f, selectedItem.stableKey)} style={chipBtn} onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}>{f.name}</button>
                            ))}
                          </div>
                        </>
                      )}
                      {universalAvail.length === 0 && itemLibAvail.length === 0 && (
                        <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", marginBottom: "0.5rem" }}>All library fields added</div>
                      )}
                      <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.12em", marginBottom: "0.4rem", textTransform: "uppercase" }}>Custom</div>
                      <div style={{ display: "flex", gap: "0.5rem", marginBottom: newField.type === "list" ? "0.4rem" : "0.5rem" }}>
                        <input autoFocus placeholder="Field name" value={newField.name} onChange={e => setNewField(f => ({ ...f, name: e.target.value }))} style={{ ...fieldStyle, flex: 1 }} onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"} onBlur={e => e.currentTarget.style.borderColor = "var(--fm-ink-dim)"} onKeyDown={e => { if (e.key === "Escape") { setShowFieldPicker(false); setNewField({ name: "", type: "text", options: "" }); } }} />
                        <select value={newField.type} onChange={e => setNewField(f => ({ ...f, type: e.target.value }))} style={{ ...fieldStyle, appearance: "none", backgroundImage: svgArrow, backgroundRepeat: "no-repeat", backgroundPosition: "right 0.4rem center", cursor: "pointer", flex: "0 0 76px", paddingRight: "1.25rem" }} onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"} onBlur={e => e.currentTarget.style.borderColor = "var(--fm-ink-dim)"}>
                          <option value="text">Text</option>
                          <option value="number">Number</option>
                          <option value="date">Date</option>
                          <option value="list">List</option>
                        </select>
                      </div>
                      {newField.type === "list" && (
                        <input placeholder="Options, comma-separated" value={newField.options} onChange={e => setNewField(f => ({ ...f, options: e.target.value }))} style={{ ...fieldStyle, marginBottom: "0.5rem" }} onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"} onBlur={e => e.currentTarget.style.borderColor = "var(--fm-ink-dim)"} />
                      )}
                      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "space-between" }}>
                        <button onClick={() => { setShowFieldPicker(false); setNewField({ name: "", type: "text", options: "" }); }} style={{ background: "transparent", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", padding: "0.25rem 0" }}>Close</button>
                        <button onClick={() => { if (!newField.name.trim()) return; handleAddItemField(selectedItem.category, selectedItem.item, { id: crypto.randomUUID(), name: newField.name.trim(), type: newField.type, options: newField.type === "list" ? newField.options.split(",").map(s => s.trim()).filter(Boolean) : [] }, selectedItem.stableKey); setNewField({ name: "", type: "text", options: "" }); }} disabled={!newField.name.trim()} style={{ background: newField.name.trim() ? "var(--fm-brass)18" : "transparent", border: `1px solid ${newField.name.trim() ? "var(--fm-brass)40" : "var(--fm-ink-dim)"}`, borderRadius: "3px", color: newField.name.trim() ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: newField.name.trim() ? "pointer" : "default", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", padding: "0.25rem 0.65rem" }}>+ Add custom</button>
                      </div>
                    </div>
                  )}

                  {!showFieldPicker && (
                    <button onClick={() => setShowFieldPicker(true)} style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.7rem", letterSpacing: "0.05em", marginTop: itmFields.length > 0 ? "0.4rem" : 0, padding: "0.2rem 0", transition: "color 0.15s" }} onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"} onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}>+ Add Field</button>
                  )}
                </>
              );
            })()}
          </div>
        ))}

        {detailTab === "maintenance" && (!selectedItem ? (
          <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "2.5rem 1rem", textAlign: "center" }}>Select an item to view maintenance</div>
          ) : (
          <>
            {itemTasks.length === 0 ? (
              <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "2rem 1rem 0.5rem", textAlign: "center" }}>No tasks for this item</div>
            ) : (
              <div>
                {itemTasks.map((row, idx) => (
                  <div key={row._id || `${row.task}-${idx}`} style={{ alignItems: "flex-start", background: idx % 2 === 0 ? "var(--fm-bg-raised)" : "#161920", borderBottom: idx < itemTasks.length - 1 ? "1px solid var(--fm-hairline)" : "none", display: "flex", gap: "0.5rem", padding: "0.65rem 1rem" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.78rem", marginBottom: "0.2rem" }}>{row.task}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
                        {row.schedule && <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem" }}>{row.schedule}</span>}
                        {row.season && <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem" }}>{row.season}</span>}
                        {!row.schedule && !nextDatesMap[`${row.category}|${row.item}|${row.task}`] && (
                          <span style={{ background: "#16141c", border: "1px solid #2a2535", borderRadius: "3px", color: "#4a4458", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.04em", padding: "0.1rem 0.35rem" }}>no schedule</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const key = `${row.category}|${row.item}|${row.task}`;
                        const dates = storageGet("maintenance-dates") ?? {};
                        const nextDates = storageGet("maintenance-next-dates") ?? {};
                        const notes = storageGet("maintenance-notes") ?? {};
                        const follow = storageGet("maintenance-follow") ?? {};
                        const d = dates[key];
                        setNewTask({ task: row.task, schedule: row.schedule || "", season: row.season || null, lastCompleted: d ? new Date(d).toISOString().slice(0, 10) : null, nextDate: nextDates[key] ? new Date(nextDates[key]).toISOString().slice(0, 10) : null, notes: notes[key] || "", followSchedule: !!follow[key] });
                        setEditingTask(row);
                        setAddingTask(true);
                      }}
                      title="Edit task"
                      style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.68rem", padding: "0.1rem 0.3rem", transition: "color 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"}
                      onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                    >✎</button>
                    <button
                      onClick={() => setDeleteTaskPrompt(row)}
                      title="Delete task"
                      style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.1rem 0.3rem", transition: "color 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                      onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                    >×</button>
                  </div>
                ))}
              </div>
            )}
            {/* AI suggested tasks */}
            {fetchingTasks && suggestedFor?.category === selectedItem?.category && suggestedFor?.item === selectedItem?.item && (
              <div style={{ borderTop: "1px solid var(--fm-hairline)", padding: "1.25rem 1rem", textAlign: "center" }}>
                <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.7rem", letterSpacing: "0.05em" }}>Fetching tasks…</span>
              </div>
            )}
            {fetchError && suggestedFor?.category === selectedItem?.category && suggestedFor?.item === selectedItem?.item && (
              <div style={{ borderTop: "1px solid var(--fm-hairline)", padding: "0.75rem 1rem" }}>
                <span style={{ color: "var(--fm-red)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem" }}>{fetchError}</span>
              </div>
            )}
            {suggestedTasks && suggestedFor?.category === selectedItem?.category && suggestedFor?.item === selectedItem?.item && (
              <div style={{ borderTop: "1px solid var(--fm-hairline)" }}>
                <div style={{ alignItems: "center", borderBottom: "1px solid var(--fm-hairline)", display: "flex", justifyContent: "space-between", padding: "0.5rem 1rem 0.4rem" }}>
                  <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase" }}>Suggested by AI</span>
                  <button onClick={() => { setSuggestedTasks(null); setSuggestedFor(null); setFetchError(null); }} style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.1rem 0.3rem", transition: "color 0.15s" }} onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"} onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}>×</button>
                </div>
                {suggestedTasks.map((t, idx) => (
                  <label key={idx} style={{ alignItems: "flex-start", background: idx % 2 === 0 ? "var(--fm-bg-raised)" : "#161920", borderBottom: "1px solid var(--fm-hairline)", cursor: "pointer", display: "flex", gap: "0.6rem", padding: "0.55rem 1rem" }}>
                    <input type="checkbox" checked={t.selected} onChange={() => setSuggestedTasks(prev => prev.map((s, i) => i === idx ? { ...s, selected: !s.selected } : s))} style={{ accentColor: "var(--fm-brass)", cursor: "pointer", flexShrink: 0, marginTop: "0.15rem" }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ color: t.selected ? "var(--fm-ink)" : "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", transition: "color 0.15s" }}>{t.task}</div>
                      {t.schedule && <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.63rem", marginTop: "0.1rem" }}>{t.schedule}{t.season ? ` · ${t.season}` : ""}</div>}
                    </div>
                  </label>
                ))}
                <div style={{ padding: "0.6rem 1rem" }}>
                  <button onClick={handleAddSuggestedTasks} disabled={!suggestedTasks.some(t => t.selected)} style={{ background: suggestedTasks.some(t => t.selected) ? "var(--fm-brass)18" : "transparent", border: `1px solid ${suggestedTasks.some(t => t.selected) ? "var(--fm-brass)40" : "var(--fm-ink-dim)"}`, borderRadius: "3px", color: suggestedTasks.some(t => t.selected) ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: suggestedTasks.some(t => t.selected) ? "pointer" : "default", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", letterSpacing: "0.06em", padding: "0.35rem 0.75rem", transition: "all 0.15s" }} onMouseEnter={e => { if (suggestedTasks.some(t => t.selected)) { e.currentTarget.style.background = "var(--fm-brass)30"; e.currentTarget.style.borderColor = "var(--fm-brass)"; } }} onMouseLeave={e => { if (suggestedTasks.some(t => t.selected)) { e.currentTarget.style.background = "var(--fm-brass)18"; e.currentTarget.style.borderColor = "var(--fm-brass)40"; } }}>
                    Add {suggestedTasks.filter(t => t.selected).length} to Schedule
                  </button>
                </div>
              </div>
            )}

            <div style={{ alignItems: "center", borderTop: itemTasks.length > 0 || suggestedTasks ? "1px solid var(--fm-hairline)" : "none", display: "flex", padding: "0.5rem 1rem" }}>
              <button onClick={() => setAddTaskModalOpen(true)} style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.7rem", letterSpacing: "0.05em", padding: "0.2rem 0", transition: "color 0.15s" }} onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"} onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}>+ Add Task</button>
              {(() => {
                const cfKey = selectedItem.stableKey ?? `${selectedItem.category}|${selectedItem.item}`;
                const cfVals = customFieldValues[cfKey] || {};
                const det = itemDetails[cfKey] || itemDetails[`${selectedItem.category}|${selectedItem.item}`] || {};
                const manufacturer = cfVals.manufacturer || det.manufacturer || "";
                const model = cfVals.model || det.model || "";
                return manufacturer && manufacturer !== "Other" ? (
                  <button onClick={() => handleFetchTasks(manufacturer, model, selectedItem.item, selectedItem.category)} style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.7rem", letterSpacing: "0.05em", marginLeft: "auto", padding: "0.2rem 0", transition: "color 0.15s" }} onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"} onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}>
                    {fetchingTasks && suggestedFor?.category === selectedItem?.category && suggestedFor?.item === selectedItem?.item ? "Fetching…" : "Fetch Tasks →"}
                  </button>
                ) : null;
              })()}
            </div>
          </>
        ))}

        {detailTab === "projects" && (!selectedItem ? (
          <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "2.5rem 1rem", textAlign: "center" }}>Select an item to view projects</div>
          ) : (
            <>
              {selectedProjects.length === 0 && !addingProject && (
                <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "1.25rem 1rem 0.5rem", textAlign: "center" }}>No projects</div>
              )}
              {selectedProjects.map((proj, idx) => {
                const isHovered = hoveredProjectId === proj.id;
                return (
                  <div key={proj.id} onMouseEnter={() => setHoveredProjectId(proj.id)} onMouseLeave={() => setHoveredProjectId(null)} style={{ alignItems: "center", background: idx % 2 === 0 ? "var(--fm-bg-raised)" : "#161920", borderBottom: "1px solid var(--fm-hairline)", display: "flex", gap: "0.5rem", padding: "0.5rem 0.75rem" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: proj.status === "done" ? "var(--fm-ink-dim)" : "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", overflow: "hidden", textDecoration: proj.status === "done" ? "line-through" : "none", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{proj.name}</div>
                      {proj.dueDate && (
                        <div style={{ color: proj.status !== "done" && new Date(proj.dueDate) < new Date() ? "var(--fm-red)" : "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem" }}>{new Date(proj.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                      )}
                    </div>
                    <span style={{ background: proj.status === "done" ? "#4ade8018" : proj.status === "in-progress" ? "var(--fm-brass)18" : "var(--fm-ink-dim)", border: `1px solid ${proj.status === "done" ? "#4ade8040" : proj.status === "in-progress" ? "var(--fm-brass)40" : "var(--fm-ink-dim)"}`, borderRadius: "2px", color: proj.status === "done" ? "var(--fm-green)" : proj.status === "in-progress" ? "var(--fm-brass)" : "var(--fm-ink-dim)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.06em", padding: "0.1rem 0.35rem", textTransform: "uppercase" }}>
                      {proj.status === "not-started" ? "To Do" : proj.status === "in-progress" ? "In Progress" : "Done"}
                    </span>
                    <button onClick={() => setDeleteProjectPrompt(proj)} style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.85rem", lineHeight: 1, opacity: isHovered ? 1 : 0, padding: "0 0.1rem", transition: "color 0.15s, opacity 0.1s" }} onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-red)"; }} onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-ink-dim)"; }}>×</button>
                  </div>
                );
              })}
              {addingProject ? (
                <div style={{ padding: "0.5rem 0.75rem" }}>
                  <input autoFocus value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="Project name..." onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddProject(); } if (e.key === "Escape") { e.preventDefault(); setAddingProject(false); setNewProjectName(""); } }} onBlur={handleAddProject} style={{ background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", boxSizing: "border-box", color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", outline: "none", padding: "0.3rem 0.5rem", width: "100%" }} />
                </div>
              ) : (
                <div style={{ padding: "0.5rem 0.75rem" }}>
                  <button onClick={() => setAddingProject(true)} style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.7rem", letterSpacing: "0.05em", padding: "0.2rem 0", transition: "color 0.15s" }} onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-brass)"; }} onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-ink-dim)"; }}>+ Add Project</button>
                </div>
              )}
              <div style={{ borderTop: "1px solid var(--fm-hairline)", padding: "0.4rem 0.75rem", textAlign: "right" }}>
                <button onClick={() => navigate?.("projects")} style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.08em", padding: "0.1rem 0", transition: "color 0.15s" }} onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-brass)"; }} onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-ink-dim)"; }}>View all on Projects →</button>
              </div>
            </>
        ))}

        {detailTab === "todos" && (!selectedItem ? (
          <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "2.5rem 1rem", textAlign: "center" }}>Select an item to view to dos</div>
          ) : (
            <>
              {selectedTodos.length === 0 && !addingTodo && (
                <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "1.25rem 1rem 0.5rem", textAlign: "center" }}>No to dos</div>
              )}
              {selectedTodos.map((todo, idx) => {
                const isOverdue = todo.dueDate && todo.status !== "done" && new Date(todo.dueDate) < new Date();
                const isHovered = hoveredTodoId === todo.id;
                return (
                  <div key={todo.id} onMouseEnter={() => setHoveredTodoId(todo.id)} onMouseLeave={() => setHoveredTodoId(null)} style={{ alignItems: "center", background: idx % 2 === 0 ? "var(--fm-bg-raised)" : "#161920", borderBottom: "1px solid var(--fm-hairline)", borderLeft: `3px solid ${PRIORITY_COLORS[todo.priority] || "var(--fm-brass)"}`, display: "flex", gap: "0.5rem", padding: "0.5rem 0.75rem" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: todo.status === "done" ? "var(--fm-ink-dim)" : "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", overflow: "hidden", textDecoration: todo.status === "done" ? "line-through" : "none", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{todo.title}</div>
                      {todo.dueDate && <div style={{ color: isOverdue ? "var(--fm-red)" : "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem" }}>{new Date(todo.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>}
                    </div>
                    <span style={{ background: todo.status === "done" ? "#4ade8018" : todo.status === "in-progress" ? "var(--fm-brass)18" : "var(--fm-ink-dim)", border: `1px solid ${todo.status === "done" ? "#4ade8040" : todo.status === "in-progress" ? "var(--fm-brass)40" : "var(--fm-ink-dim)"}`, borderRadius: "2px", color: todo.status === "done" ? "var(--fm-green)" : todo.status === "in-progress" ? "var(--fm-brass)" : "var(--fm-ink-dim)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.06em", padding: "0.1rem 0.35rem", textTransform: "uppercase" }}>
                      {todo.status === "not-started" ? "To Do" : todo.status === "in-progress" ? "In Progress" : "Done"}
                    </span>
                    <button onClick={() => setDeleteTodoPrompt(todo)} style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.85rem", lineHeight: 1, opacity: isHovered ? 1 : 0, padding: "0 0.1rem", transition: "color 0.15s, opacity 0.1s" }} onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-red)"; }} onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-ink-dim)"; }}>×</button>
                  </div>
                );
              })}
              {addingTodo ? (
                <div style={{ padding: "0.5rem 0.75rem" }}>
                  <input autoFocus value={newTodoTitle} onChange={e => setNewTodoTitle(e.target.value)} placeholder="To do title..." onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddTodo(); } if (e.key === "Escape") { e.preventDefault(); setAddingTodo(false); setNewTodoTitle(""); } }} onBlur={handleAddTodo} style={{ background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", boxSizing: "border-box", color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", outline: "none", padding: "0.3rem 0.5rem", width: "100%" }} />
                </div>
              ) : (
                <div style={{ padding: "0.5rem 0.75rem" }}>
                  <button onClick={() => setAddingTodo(true)} style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.7rem", letterSpacing: "0.05em", padding: "0.2rem 0", transition: "color 0.15s" }} onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-brass)"; }} onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-ink-dim)"; }}>+ Add To Do</button>
                </div>
              )}
              <div style={{ borderTop: "1px solid var(--fm-hairline)", padding: "0.4rem 0.75rem", textAlign: "right" }}>
                <button onClick={() => navigate?.("board")} style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.08em", padding: "0.1rem 0", transition: "color 0.15s" }} onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-brass)"; }} onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-ink-dim)"; }}>View all on To Dos →</button>
              </div>
            </>
        ))}

        </div>{/* end tab content */}
      </div>{/* end unified panel card */}

      {/* Add / Edit maintenance task modal */}
      {addingTask && selectedItem && createPortal(
        <div onClick={resetTaskDraft} style={{ alignItems: "center", background: "rgba(0,0,0,0.75)", bottom: 0, display: "flex", justifyContent: "center", left: 0, position: "fixed", right: 0, top: 0, zIndex: 1000, ...(isMobile ? sheetOverlay : null) }}>
          <div onClick={e => e.stopPropagation()} className={isMobile ? "fm-sheet-panel" : undefined} style={{ background: "var(--fm-bg)", border: "1px solid var(--fm-hairline2)", borderRadius: "8px", maxWidth: "min(95vw, 1120px)", overflow: "hidden", width: "95vw", ...(isMobile ? sheetPanel : null) }}>
            <div style={{ alignItems: "center", borderBottom: "1px solid var(--fm-hairline)", display: "flex", justifyContent: "space-between", padding: "0.85rem 1.25rem" }}>
              <div>
                <span style={{ color: "var(--fm-brass)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.15em", textTransform: "uppercase" }}>{editingTask ? "Edit Maintenance Task" : "Add Maintenance Task"}</span>
                <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", marginLeft: "0.75rem" }}>{selectedItem.item} — {selectedItem.category}</span>
              </div>
              <button onClick={resetTaskDraft} style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "1rem", padding: "0.1rem 0.3rem", transition: "color 0.15s" }} onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"} onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}>×</button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", fontSize: "0.82rem", width: "100%" }}>
                <thead>
                  <tr>
                    {[
                      { label: "Category", width: "8%" },
                      { label: "Item", width: "10%" },
                      { label: "Type of Maintenance", width: "17%" },
                      { label: "Recommended Schedule", width: "12%" },
                      { label: "Season", width: "7%" },
                      { label: "Last Completed On", width: "12%" },
                      { label: "Next Maintenance Date", width: "13%" },
                      { label: "Notes", width: "9%" },
                    ].map(({ label, width }) => (
                      <th key={label} style={{ background: "var(--fm-bg-panel)", borderBottom: "2px solid var(--fm-hairline2)", color: "var(--fm-brass)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", fontWeight: "normal", letterSpacing: "0.12em", padding: "0.75rem 0.6rem", textAlign: "left", textTransform: "uppercase", whiteSpace: "nowrap", width }}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ background: "var(--fm-bg-raised)" }}>
                    <td style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.5rem 0.6rem", verticalAlign: "middle" }}>{selectedItem.category}</td>
                    <td style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", padding: "0.5rem 0.6rem", verticalAlign: "middle" }}>{selectedItem.item}</td>
                    <td style={{ padding: "0.5rem 0.6rem", verticalAlign: "middle" }}>
                      <input autoFocus value={newTask.task} placeholder="Task name" disabled={editingTask && !editingTask._isCustom} onChange={e => setNewTask(t => ({ ...t, task: e.target.value }))} onKeyDown={e => { if (e.key === "Enter" && newTask.task.trim()) { e.preventDefault(); editingTask ? handleUpdateTask(editingTask) : handleAddTask(); } if (e.key === "Escape") { e.preventDefault(); resetTaskDraft(); } }} style={{ background: "var(--fm-bg-panel)", border: "1px solid var(--fm-hairline2)", borderRadius: "2px", boxSizing: "border-box", color: editingTask && !editingTask._isCustom ? "var(--fm-ink-dim)" : "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.8rem", opacity: editingTask && !editingTask._isCustom ? 0.6 : 1, outline: "none", padding: "0.25rem 0.4rem", width: "100%" }} onFocus={e => { if (!(editingTask && !editingTask._isCustom)) e.currentTarget.style.borderColor = "var(--fm-brass)"; }} onBlur={e => e.currentTarget.style.borderColor = "var(--fm-ink-dim)"} />
                    </td>
                    <td style={{ padding: "0.5rem 0.6rem", verticalAlign: "middle" }}>
                      <SchedulePicker value={newTask.schedule || null} onChange={v => setNewTask(t => ({ ...t, schedule: v || "" }))} />
                    </td>
                    <td style={{ padding: "0.5rem 0.6rem", verticalAlign: "middle" }}>
                      <select value={newTask.season ?? ""} onChange={e => setNewTask(t => ({ ...t, season: e.target.value || null }))} style={{ appearance: "none", background: "var(--fm-bg-panel)", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235a5460'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 0.4rem center", border: "1px solid var(--fm-hairline2)", borderRadius: "2px", boxSizing: "border-box", color: "var(--fm-ink)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", outline: "none", padding: "0.25rem 1.5rem 0.25rem 0.4rem", width: "100%" }} onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"} onBlur={e => e.currentTarget.style.borderColor = "var(--fm-ink-dim)"}>
                        {SEASON_OPTIONS.map(({ value, label }) => <option key={label} value={value ?? ""}>{label}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "0.5rem 0.6rem", verticalAlign: "middle" }}>
                      <input type="date" value={newTask.lastCompleted || ""} onChange={e => setNewTask(t => ({ ...t, lastCompleted: e.target.value || null }))} style={{ background: "var(--fm-bg-panel)", border: "1px solid var(--fm-hairline2)", borderRadius: "2px", boxSizing: "border-box", color: newTask.lastCompleted ? "var(--fm-ink)" : "var(--fm-ink-dim)", colorScheme: "dark", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", outline: "none", padding: "0.25rem 0.4rem", width: "100%" }} onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"} onBlur={e => e.currentTarget.style.borderColor = "var(--fm-ink-dim)"} />
                    </td>
                    <td style={{ padding: "0.5rem 0.6rem", verticalAlign: "middle" }}>
                      <div style={{ alignItems: "center", display: "flex", gap: "0.4rem" }}>
                        <input type="date" value={newTask.nextDate || ""} onChange={e => setNewTask(t => ({ ...t, nextDate: e.target.value || null }))} style={{ background: "var(--fm-bg-panel)", border: "1px solid var(--fm-hairline2)", borderRadius: "2px", boxSizing: "border-box", color: newTask.nextDate ? "var(--fm-ink)" : "var(--fm-ink-dim)", colorScheme: "dark", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", outline: "none", padding: "0.25rem 0.4rem", width: "100%" }} onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"} onBlur={e => e.currentTarget.style.borderColor = "var(--fm-ink-dim)"} />
                        <FollowButton schedule={newTask.schedule} checked={newTask.followSchedule} onToggle={() => setNewTask(t => ({ ...t, followSchedule: !t.followSchedule }))} />
                      </div>
                    </td>
                    <td style={{ padding: "0.5rem 0.6rem", verticalAlign: "middle" }}>
                      <input value={newTask.notes} placeholder="—" onChange={e => setNewTask(t => ({ ...t, notes: e.target.value }))} style={{ background: "var(--fm-bg-panel)", border: "1px solid var(--fm-hairline2)", borderRadius: "2px", boxSizing: "border-box", color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", outline: "none", padding: "0.25rem 0.4rem", width: "100%" }} onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"} onBlur={e => e.currentTarget.style.borderColor = "var(--fm-ink-dim)"} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ borderTop: "1px solid var(--fm-hairline)", display: "flex", gap: "0.75rem", justifyContent: "flex-end", padding: "1rem 1.25rem" }}>
              <button onClick={resetTaskDraft} style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: "var(--fm-brass-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 0.9rem", transition: "all 0.15s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-ink)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-brass-dim)"; }}>Cancel</button>
              <button onClick={editingTask ? () => handleUpdateTask(editingTask) : handleAddTask} disabled={!newTask.task.trim()} style={{ background: newTask.task.trim() ? "var(--fm-brass)18" : "transparent", border: `1px solid ${newTask.task.trim() ? "var(--fm-brass)40" : "var(--fm-ink-dim)"}`, borderRadius: "3px", color: newTask.task.trim() ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: newTask.task.trim() ? "pointer" : "default", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 0.9rem", transition: "all 0.15s" }} onMouseEnter={e => { if (newTask.task.trim()) { e.currentTarget.style.background = "var(--fm-brass)30"; e.currentTarget.style.borderColor = "var(--fm-brass)"; } }} onMouseLeave={e => { if (newTask.task.trim()) { e.currentTarget.style.background = "var(--fm-brass)18"; e.currentTarget.style.borderColor = "var(--fm-brass)40"; } }}>{editingTask ? "Save" : "Add Task"}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {addTaskModalOpen && selectedItem && (
        <AddTaskModal categories={[]} rows={[]} lockCategoryItem initialCategory={selectedItem.category} initialItem={selectedItem.item} onSave={handleAddTaskFromModal} onClose={() => setAddTaskModalOpen(false)} />
      )}

      {deleteTaskPrompt && createPortal(
        <div onClick={() => setDeleteTaskPrompt(null)} style={{ alignItems: "center", background: "rgba(0,0,0,0.7)", bottom: 0, display: "flex", justifyContent: "center", left: 0, position: "fixed", right: 0, top: 0, zIndex: 1000, ...(isMobile ? sheetOverlay : null) }}>
          <div onClick={e => e.stopPropagation()} className={isMobile ? "fm-sheet-panel" : undefined} style={{ background: "var(--fm-bg-panel)", border: "1px solid var(--fm-hairline2)", borderRadius: "8px", maxWidth: 440, padding: "2rem", width: "90%", ...(isMobile ? sheetPanel : null) }}>
            <div style={{ color: "var(--fm-ink)", fontSize: "1.05rem", marginBottom: "0.75rem" }}>Delete "{deleteTaskPrompt.task}"?</div>
            <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.8rem", lineHeight: 1.7, margin: "0 0 1.75rem" }}>
              {deleteTaskPrompt?._isCustom ? "This will permanently remove this task from the maintenance schedule. This action cannot be undone." : "This will remove this task from your maintenance schedule. It can be restored from the Guide page."}
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button onClick={() => setDeleteTaskPrompt(null)} style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: "var(--fm-brass-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 0.9rem", transition: "all 0.15s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-ink)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-brass-dim)"; }}>Cancel</button>
              <button onClick={() => { handleDeleteTask(deleteTaskPrompt); setDeleteTaskPrompt(null); }} style={{ background: "#f8717118", border: "1px solid #f8717140", borderRadius: "3px", color: "var(--fm-red)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 0.9rem", transition: "all 0.15s" }} onMouseEnter={e => { e.currentTarget.style.background = "#f8717130"; e.currentTarget.style.borderColor = "var(--fm-red)"; }} onMouseLeave={e => { e.currentTarget.style.background = "#f8717118"; e.currentTarget.style.borderColor = "#f8717140"; }}>Delete</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {deleteProjectPrompt && createPortal(
        <div onClick={() => setDeleteProjectPrompt(null)} style={{ alignItems: "center", background: "rgba(0,0,0,0.7)", bottom: 0, display: "flex", justifyContent: "center", left: 0, position: "fixed", right: 0, top: 0, zIndex: 1000, ...(isMobile ? sheetOverlay : null) }}>
          <div onClick={e => e.stopPropagation()} className={isMobile ? "fm-sheet-panel" : undefined} style={{ background: "var(--fm-bg-panel)", border: "1px solid var(--fm-hairline2)", borderRadius: "8px", maxWidth: 440, padding: "2rem", width: "90%", ...(isMobile ? sheetPanel : null) }}>
            <div style={{ color: "var(--fm-ink)", fontSize: "1.05rem", marginBottom: "0.75rem" }}>Delete "{deleteProjectPrompt.name}"?</div>
            <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.8rem", lineHeight: 1.7, margin: "0 0 1.75rem" }}>This will permanently delete this project. This action cannot be undone.</p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button onClick={() => setDeleteProjectPrompt(null)} style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: "var(--fm-brass-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 0.9rem", transition: "all 0.15s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-ink)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-brass-dim)"; }}>Cancel</button>
              <button onClick={() => handleDeleteProject(deleteProjectPrompt)} style={{ background: "#f8717118", border: "1px solid #f8717140", borderRadius: "3px", color: "var(--fm-red)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 0.9rem", transition: "all 0.15s" }} onMouseEnter={e => { e.currentTarget.style.background = "#f8717130"; e.currentTarget.style.borderColor = "var(--fm-red)"; }} onMouseLeave={e => { e.currentTarget.style.background = "#f8717118"; e.currentTarget.style.borderColor = "#f8717140"; }}>Delete</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {deleteTodoPrompt && createPortal(
        <div onClick={() => setDeleteTodoPrompt(null)} style={{ alignItems: "center", background: "rgba(0,0,0,0.7)", bottom: 0, display: "flex", justifyContent: "center", left: 0, position: "fixed", right: 0, top: 0, zIndex: 1000, ...(isMobile ? sheetOverlay : null) }}>
          <div onClick={e => e.stopPropagation()} className={isMobile ? "fm-sheet-panel" : undefined} style={{ background: "var(--fm-bg-panel)", border: "1px solid var(--fm-hairline2)", borderRadius: "8px", maxWidth: 440, padding: "2rem", width: "90%", ...(isMobile ? sheetPanel : null) }}>
            <div style={{ color: "var(--fm-ink)", fontSize: "1.05rem", marginBottom: "0.75rem" }}>Delete "{deleteTodoPrompt.title}"?</div>
            <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.8rem", lineHeight: 1.7, margin: "0 0 1.75rem" }}>This will permanently delete this to do. This action cannot be undone.</p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button onClick={() => setDeleteTodoPrompt(null)} style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: "var(--fm-brass-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 0.9rem", transition: "all 0.15s" }} onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-ink)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-brass-dim)"; }}>Cancel</button>
              <button onClick={() => handleDeleteTodo(deleteTodoPrompt)} style={{ background: "#f8717118", border: "1px solid #f8717140", borderRadius: "3px", color: "var(--fm-red)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 0.9rem", transition: "all 0.15s" }} onMouseEnter={e => { e.currentTarget.style.background = "#f8717130"; e.currentTarget.style.borderColor = "var(--fm-red)"; }} onMouseLeave={e => { e.currentTarget.style.background = "#f8717118"; e.currentTarget.style.borderColor = "#f8717140"; }}>Delete</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
