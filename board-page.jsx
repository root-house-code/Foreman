import { useState, useMemo, useEffect, forwardRef } from "react";
import { fieldLabel, fieldInput, DueDateBtn, STATUS_COLUMNS, PRIORITY_LABELS } from "./components/ModalShared.jsx";
import FmHeader from "./src/components/FmHeader.jsx";
import FmSubnav from "./src/components/FmSubnav.jsx";
import { createPortal } from "react-dom";
import DatePicker from "react-datepicker";
import { loadTodos, saveTodos, createTodo } from "./lib/todos.js";
import { loadProjects, saveProjects, createProject } from "./lib/projects.js";
import { loadData } from "./lib/data.js";
import { loadEntityTypes, isSpatial, isFunctional, resolveTypeId } from "./lib/entityTypes.js";
import { loadCategoryTypeOverrides } from "./lib/categoryTypes.js";
import AssigneeInput from "./components/AssigneeInput.jsx";
import TodoModal from "./components/TodoModal.jsx";
import { loadDeletedCategories } from "./lib/deletedCategories.js";
import { loadDeletedItems } from "./lib/deletedItems.js";
import { computeNextDate } from "./lib/scheduleInterval.js";
import {
  loadChores, loadChoreNextDates, saveChoreNextDates,
  loadChoreCompletedDates, saveChoreCompletedDates, computeChoreNextDate,
} from "./lib/chores.js";

const PRIORITY_COLORS = {
  low:    "var(--fm-green)",
  medium: "var(--fm-brass)",
  high:   "var(--fm-amber)",
  urgent: "var(--fm-red)",
};

const PRIORITY_HEX = {
  low:    "#7fb087",
  medium: "#c9a96e",
  high:   "#e0b266",
  urgent: "#e07b6a",
};

function TodoCard({ todo, onEdit, isDragging, onDragStart, onDragEnd, onStatusChange }) {
  const isOverdue = todo.dueDate && todo.status !== "done" && new Date(todo.dueDate) < new Date();
  const isDone = todo.status === "done";
  const priorityColor = PRIORITY_COLORS[todo.priority] || "var(--fm-brass)";
  const priorityHex = PRIORITY_HEX[todo.priority] || "#c9a96e";

  return (
    <div
      draggable
      onDragStart={e => { e.stopPropagation(); onDragStart(); }}
      onDragEnd={onDragEnd}
      onClick={onEdit}
      style={{
        background: "var(--fm-bg-panel)",
        border: "var(--fm-border)",
        borderLeft: `3px solid ${priorityHex}`,
        borderRadius: "var(--fm-radius)",
        cursor: "grab",
        marginBottom: "0.5rem",
        opacity: isDragging ? 0.4 : 1,
        padding: "0.6rem 0.7rem 0.45rem",
        transition: "border-color 0.15s, opacity 0.15s",
        userSelect: "none",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline)"; }}
    >
      {/* Priority + overdue label row */}
      <div style={{ alignItems: "center", display: "flex", gap: "0.5rem", marginBottom: "0.3rem" }}>
        <span style={{ color: priorityColor, fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          {PRIORITY_LABELS[todo.priority] || "Medium"}
        </span>
        {todo._isOverdueMaintenance && (
          <span style={{ background: "rgba(224,123,106,0.1)", border: "1px solid rgba(224,123,106,0.3)", borderRadius: "var(--fm-radius)", color: "var(--fm-red)", fontFamily: "var(--fm-mono)", fontSize: "0.52rem", letterSpacing: "0.08em", padding: "0.05rem 0.3rem", textTransform: "uppercase" }}>
            Maint.
          </span>
        )}
      </div>

      {/* Title */}
      <div style={{ color: isDone ? "var(--fm-ink-mute)" : "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.82rem", lineHeight: 1.35, marginBottom: "0.4rem", textDecoration: isDone ? "line-through" : "none" }}>
        {todo.title}
      </div>

      {/* Labels */}
      {todo.labels?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem", marginBottom: "0.35rem" }}>
          {todo.labels.map(label => (
            <span key={label} style={{ background: "transparent", border: "var(--fm-border-2)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.06em", padding: "0.1rem 0.3rem" }}>
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Meta row */}
      <div style={{ alignItems: "flex-end", display: "flex", gap: "0.5rem", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          {(todo.linkedCategory || todo.linkedItem || todo.linkedRoom || todo.linkedSystem) && (
            <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.2rem", marginBottom: "0.15rem" }}>
              {(todo.linkedRoom || (todo.linkedCategory && !todo.linkedSystem)) && (
                <span style={{ border: "var(--fm-border)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.56rem", letterSpacing: "0.04em", overflow: "hidden", padding: "0.1rem 0.3rem", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {todo.linkedRoom || todo.linkedCategory}{todo.linkedItem ? ` › ${todo.linkedItem}` : ""}
                </span>
              )}
              {todo.linkedSystem && (
                <span style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.08em", padding: "0.1rem 0.3rem", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                  {todo.linkedSystem.slice(0, 4).toUpperCase()}
                </span>
              )}
            </div>
          )}
          {todo.assignee && (
            <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-sans)", fontSize: "0.68rem" }}>{todo.assignee}</div>
          )}
        </div>
        <div style={{ flexShrink: 0, textAlign: "right" }}>
          {todo.tasks?.length > 0 && (() => {
            const doneCount = todo.tasks.filter(t => t.completed).length;
            return (
              <div style={{ color: doneCount === todo.tasks.length ? "var(--fm-green)" : "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem" }}>
                {doneCount}/{todo.tasks.length}
              </div>
            );
          })()}
          {todo.estimatedCost != null && (
            <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem" }}>
              ${Number(todo.estimatedCost).toLocaleString()}
            </div>
          )}
          {todo.dueDate && (
            <div style={{ color: isOverdue ? "var(--fm-red)" : "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem" }}>
              {new Date(todo.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
          )}
        </div>
      </div>

      {/* Move buttons */}
      <div style={{ borderTop: "1px solid var(--fm-hairline)", display: "flex", gap: "0.2rem", marginTop: "0.4rem", paddingTop: "0.35rem" }} onClick={e => e.stopPropagation()}>
        {STATUS_COLUMNS.filter(c => c.key !== todo.status).map(c => (
          <button
            key={c.key}
            onClick={e => { e.stopPropagation(); onStatusChange(todo.id, c.key); }}
            style={{ background: "transparent", border: "var(--fm-border)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.52rem", letterSpacing: "0.04em", padding: "0.12rem 0.4rem", textTransform: "uppercase", transition: "all 0.12s" }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-ink)"; e.currentTarget.style.borderColor = "var(--fm-hairline2)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-ink-mute)"; e.currentTarget.style.borderColor = "var(--fm-hairline)"; }}
          >
            → {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MaintenanceCompletionModal({ todo, rowDataByKey, onConfirm, onClose }) {
  const rowData = todo._maintenanceKey ? rowDataByKey[todo._maintenanceKey] : null;
  const { schedule, season } = rowData || {};
  const [lastCompleted, setLastCompleted] = useState(new Date());
  const [nextDate, setNextDate] = useState(null);

  function handleFollowSchedule() {
    if (!schedule) return;
    const computed = computeNextDate(lastCompleted, schedule, season);
    if (computed) setNextDate(computed);
  }

  return createPortal(
    <div
      onClick={onClose}
      style={{ alignItems: "center", background: "rgba(0,0,0,0.75)", bottom: 0, display: "flex", justifyContent: "center", left: 0, position: "fixed", right: 0, top: 0, zIndex: 1100 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: "var(--fm-bg-panel)", border: "var(--fm-border)", borderRadius: "var(--fm-radius-lg)", maxWidth: 420, padding: "1.75rem 2rem", width: "90%" }}
      >
        <div style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.15em", marginBottom: "0.35rem", textTransform: "uppercase" }}>
          Log Maintenance Completion
        </div>
        <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-serif)", fontSize: "0.88rem", marginBottom: "1.5rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {todo.linkedItem || todo.linkedCategory} — {todo.title.replace(/^Overdue:\s*/i, "")}
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={fieldLabel}>Last Completed On</label>
          <DatePicker
            selected={lastCompleted}
            onChange={date => { if (date) { setLastCompleted(date); setNextDate(null); } }}
            dateFormat="MMM d, yyyy"
            customInput={<DueDateBtn value={lastCompleted.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} />}
            popperPlacement="bottom-start"
            maxDate={new Date()}
          />
        </div>

        <div style={{ marginBottom: "0.5rem" }}>
          <label style={fieldLabel}>Next Maintenance Date</label>
          <DatePicker
            selected={nextDate}
            onChange={date => setNextDate(date || null)}
            dateFormat="MMM d, yyyy"
            customInput={<DueDateBtn value={nextDate ? nextDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null} />}
            popperPlacement="bottom-start"
            isClearable
          />
        </div>

        {schedule && (
          <div style={{ marginBottom: "1.5rem" }}>
            <button
              onClick={handleFollowSchedule}
              style={{ background: "var(--fm-brass-bg)", border: "1px solid rgba(201,169,110,0.3)", borderRadius: "var(--fm-radius)", color: "var(--fm-brass)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", letterSpacing: "0.06em", marginTop: "0.5rem", padding: "0.35rem 0.7rem", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(201,169,110,0.3)"; }}
            >
              Follow Recommended Schedule
            </button>
            <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", marginTop: "0.3rem" }}>
              {schedule}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "var(--fm-border-2)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 0.9rem", transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ lastCompleted, nextDate })}
            style={{ background: "var(--fm-brass-bg)", border: "1px solid rgba(201,169,110,0.4)", borderRadius: "var(--fm-radius)", color: "var(--fm-brass)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 0.9rem", transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(201,169,110,0.2)"; e.currentTarget.style.borderColor = "var(--fm-brass)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "var(--fm-brass-bg)"; e.currentTarget.style.borderColor = "rgba(201,169,110,0.4)"; }}
          >
            Confirm &amp; Mark Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function BoardPage({ navigate }) {
  const [todos, setTodos] = useState(() => loadTodos());
  const [projects, setProjects] = useState(() => loadProjects());
  const [modalState, setModalState] = useState(null);
  const [maintenanceCompletionTodo, setMaintenanceCompletionTodo] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [activeCategory, setActiveCategory] = useState("All");
  const [assigneeFilter, setAssigneeFilter] = useState(null);
  const [addingProject, setAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [chores] = useState(() => loadChores());
  const [choreNextDates, setChoreNextDates] = useState(() => loadChoreNextDates());
  const [choreCompletedDates, setChoreCompletedDates] = useState(() => loadChoreCompletedDates());
  const [showChoresOnly, setShowChoresOnly] = useState(false);

  const rows = useMemo(() => loadData(), []);
  const deletedCategories = useMemo(() => loadDeletedCategories(), []);
  const deletedItems = useMemo(() => loadDeletedItems(), []);

  const categoryItems = useMemo(() => {
    const map = {};
    rows.forEach(row => {
      if (deletedCategories.has(row.category)) return;
      if (row._isBlankCategory || !row.category || !row.item) return;
      if (deletedItems.has(`${row.category}|${row.item}`)) return;
      if (!map[row.category]) map[row.category] = [];
      if (!map[row.category].includes(row.item)) map[row.category].push(row.item);
    });
    return map;
  }, [rows, deletedCategories, deletedItems]);

  const categories = Object.keys(categoryItems);

  const entityTypeData = useMemo(() => loadEntityTypes(), []);
  const categoryTypeOverrides = useMemo(() => loadCategoryTypeOverrides(), []);

  const defaultCatTypes = useMemo(() => {
    const map = {};
    rows.forEach(r => { if (r.category && r.categoryType && !map[r.category]) map[r.category] = r.categoryType; });
    return map;
  }, [rows]);

  const spatialCategories = useMemo(() =>
    categories.filter(c => isSpatial(resolveTypeId(c, categoryTypeOverrides[c] ?? defaultCatTypes[c] ?? "general"), entityTypeData)).sort(),
    [categories, categoryTypeOverrides, defaultCatTypes, entityTypeData]);

  const functionalCategories = useMemo(() =>
    categories.filter(c => isFunctional(resolveTypeId(c, categoryTypeOverrides[c] ?? defaultCatTypes[c] ?? "general"), entityTypeData)).sort(),
    [categories, categoryTypeOverrides, defaultCatTypes, entityTypeData]);

  const rowDataByKey = useMemo(() => {
    const map = {};
    rows.forEach(row => {
      if (!row.category || !row.item || !row.task || row._isBlankCategory) return;
      map[`${row.category}|${row.item}|${row.task}`] = { schedule: row.schedule, season: row.season ?? null };
    });
    return map;
  }, [rows]);

  // Auto-generate overdue maintenance To Dos on mount
  useEffect(() => {
    const nextDatesRaw = JSON.parse(localStorage.getItem("maintenance-next-dates") || "{}");
    const currentTodos = loadTodos();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const newTodos = [];
    rows.forEach(row => {
      if (!row.category || !row.item || !row.task || row._isBlankCategory) return;
      if (deletedCategories.has(row.category)) return;
      if (deletedItems.has(`${row.category}|${row.item}`)) return;

      const key = `${row.category}|${row.item}|${row.task}`;
      const nextDateStr = nextDatesRaw[key];
      if (!nextDateStr) return;
      if (new Date(nextDateStr) >= today) return;
      if (currentTodos.some(t => t._maintenanceKey === key)) return;
      if (currentTodos.some(t => !t._maintenanceKey && t.linkedCategory === row.category && t.linkedItem === row.item)) return;

      newTodos.push(createTodo({
        title: `Overdue: ${row.task}`,
        linkedCategory: row.category,
        linkedItem: row.item,
        status: "not-started",
        priority: "high",
        _maintenanceKey: key,
        _isOverdueMaintenance: true,
      }));
    });

    if (newTodos.length === 0) return;
    const merged = [...currentTodos, ...newTodos];
    saveTodos(merged);
    setTodos(merged);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-generate overdue chore To Dos on mount
  useEffect(() => {
    const nextDatesRaw = loadChoreNextDates();
    const currentTodos = loadTodos();
    const now = new Date();

    const newTodos = [];
    chores.forEach(chore => {
      const nextDateStr = nextDatesRaw[chore.id];
      const nextDate = nextDateStr ? new Date(nextDateStr) : null;
      if (nextDate && nextDate >= now) return;
      if (currentTodos.some(t => t._choreId === chore.id && t.status !== "done")) return;

      newTodos.push(createTodo({
        title: chore.title,
        linkedCategory: chore.room,
        status: "not-started",
        priority: "medium",
        _choreId: chore.id,
        _isOverdueChore: true,
      }));
    });

    if (newTodos.length === 0) return;
    const merged = [...currentTodos, ...newTodos];
    saveTodos(merged);
    setTodos(merged);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function persistTodos(next) { setTodos(next); saveTodos(next); }
  function persistProjects(next) { setProjects(next); saveProjects(next); }

  function advanceChoreDate(todo) {
    const chore = chores.find(c => c.id === todo._choreId);
    if (!chore) return;
    const today = new Date();
    const updatedCompleted = { ...choreCompletedDates, [chore.id]: today.toISOString() };
    const nextDate = computeChoreNextDate(today, chore.schedule, chore.dayOfWeek, chore.timeOfDay);
    const updatedNext = { ...choreNextDates, [chore.id]: nextDate.toISOString() };
    saveChoreCompletedDates(updatedCompleted);
    saveChoreNextDates(updatedNext);
    setChoreCompletedDates(updatedCompleted);
    setChoreNextDates(updatedNext);
  }

  function handleCreateProject() {
    const name = newProjectName.trim();
    setAddingProject(false);
    setNewProjectName("");
    if (!name) return;
    const proj = createProject({ name });
    persistProjects([...projects, proj]);
    setSelectedProjectId(proj.id);
  }

  function handleSaveTodo(form) {
    const now = new Date().toISOString();
    if (modalState && modalState !== "new" && typeof modalState === "object" && modalState.id) {
      const prev = modalState;
      const existing = todos.find(t => t.id === prev.id);
      if (form.status === "done" && existing?.status !== "done" && existing?._isOverdueMaintenance) {
        setMaintenanceCompletionTodo({ ...existing, ...form });
        setModalState(null);
        return;
      }
      if (form.status === "done" && existing?.status !== "done" && existing?._isOverdueChore) {
        advanceChoreDate(existing);
      }
      persistTodos(todos.map(t => t.id === prev.id ? {
        ...t, ...form,
        completedDate: form.status === "done" && t.status !== "done" ? now
          : form.status !== "done" ? null
          : t.completedDate,
      } : t));
    } else {
      const colKey = (modalState && modalState.colKey) || "not-started";
      persistTodos([...todos, createTodo({ ...form, status: form.status || colKey })]);
    }
    setModalState(null);
  }

  function handleDelete(id) { persistTodos(todos.filter(t => t.id !== id)); }

  function markDone(id) {
    const now = new Date().toISOString();
    persistTodos(todos.map(t => t.id === id ? { ...t, status: "done", completedDate: now } : t));
  }

  function handleStatusChange(id, status) {
    if (status === "done") {
      const todo = todos.find(t => t.id === id);
      if (todo?._isOverdueMaintenance && todo.status !== "done") {
        setMaintenanceCompletionTodo(todo);
        return;
      }
      if (todo?._isOverdueChore && todo.status !== "done") {
        advanceChoreDate(todo);
      }
    }
    const now = new Date().toISOString();
    persistTodos(todos.map(t => t.id === id ? {
      ...t, status,
      completedDate: status === "done" ? now : null,
    } : t));
  }

  function handleDrop(colKey) {
    if (!dragging) return;
    if (colKey === "done") {
      const todo = todos.find(t => t.id === dragging);
      if (todo?._isOverdueMaintenance && todo.status !== "done") {
        setMaintenanceCompletionTodo(todo);
        setDragging(null);
        setDragOverCol(null);
        return;
      }
      if (todo?._isOverdueChore && todo.status !== "done") {
        advanceChoreDate(todo);
      }
    }
    handleStatusChange(dragging, colKey);
    setDragging(null);
    setDragOverCol(null);
  }

  function handleMaintenanceComplete({ lastCompleted, nextDate }) {
    const todo = maintenanceCompletionTodo;
    if (!todo) return;
    const key = todo._maintenanceKey;
    if (key) {
      const completedDates = JSON.parse(localStorage.getItem("maintenance-dates") || "{}");
      completedDates[key] = lastCompleted.toISOString();
      localStorage.setItem("maintenance-dates", JSON.stringify(completedDates));
      if (nextDate) {
        const nextDates = JSON.parse(localStorage.getItem("maintenance-next-dates") || "{}");
        nextDates[key] = nextDate.toISOString();
        localStorage.setItem("maintenance-next-dates", JSON.stringify(nextDates));
      }
    }
    markDone(todo.id);
    setMaintenanceCompletionTodo(null);
  }

  const todoCategories = useMemo(() => {
    const cats = new Set(todos.filter(t => t.linkedCategory && !t._isOverdueChore).map(t => t.linkedCategory));
    return Array.from(cats).sort();
  }, [todos]);

  const assignees = useMemo(() => {
    const set = new Set(todos.filter(t => t.assignee).map(t => t.assignee));
    return [...set].sort();
  }, [todos]);

  const filteredTodos = useMemo(() => todos.filter(t => {
    if (selectedProjectId && t.projectId !== selectedProjectId) return false;
    if (activeCategory !== "All" && t.linkedCategory !== activeCategory) return false;
    if (!showChoresOnly && t._isOverdueChore) return false;
    if (assigneeFilter && t.assignee !== assigneeFilter) return false;
    return true;
  }), [todos, selectedProjectId, activeCategory, showChoresOnly, assigneeFilter]);

  const todosByStatus = useMemo(() => {
    const map = { "not-started": [], "in-progress": [], "done": [] };
    filteredTodos.forEach(t => { if (map[t.status]) map[t.status].push(t); });
    return map;
  }, [filteredTodos]);

  const modalTodo = modalState && modalState !== "new" && typeof modalState === "object" && modalState.id
    ? modalState : null;

  const sidebarTodos = useMemo(() => {
    const nonChore = todos.filter(t => !t._isOverdueChore);
    return activeCategory === "All" ? nonChore : nonChore.filter(t => t.linkedCategory === activeCategory);
  }, [todos, activeCategory]);

  const pillBase = { borderRadius: "var(--fm-radius)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", padding: "0.22rem 0.6rem", textTransform: "uppercase", transition: "all 0.12s" };

  return (
    <div style={{ background: "var(--fm-bg)", color: "var(--fm-ink)", display: "flex", flexDirection: "column", fontFamily: "var(--fm-sans)", height: "100vh", overflow: "hidden" }}>

      {modalState !== null && (
        <TodoModal
          todo={modalTodo} categories={categories} categoryItems={categoryItems}
          spatialCategories={spatialCategories} functionalCategories={functionalCategories}
          projects={projects}
          onSave={handleSaveTodo} onClose={() => setModalState(null)}
          onDelete={modalTodo ? () => handleDelete(modalTodo.id) : null}
        />
      )}

      {maintenanceCompletionTodo && (
        <MaintenanceCompletionModal
          todo={maintenanceCompletionTodo}
          rowDataByKey={rowDataByKey}
          onConfirm={handleMaintenanceComplete}
          onClose={() => setMaintenanceCompletionTodo(null)}
        />
      )}

      <FmHeader active="To Dos" tagline="To Dos" />
      <FmSubnav
        tabs={["Board", "List", "By priority", "By project"]}
        active="Board"
        stats={[
          { value: todosByStatus["not-started"].length, label: "not started" },
          { value: todosByStatus["in-progress"].length, color: "var(--fm-amber)", label: "in progress" },
          { value: todosByStatus["done"].length, color: "var(--fm-green)", label: "done" },
        ]}
      />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Sidebar */}
        <aside style={{ borderRight: "var(--fm-border)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden", width: 220 }}>

          {/* Projects */}
          <div style={{ borderBottom: "var(--fm-border)", display: "flex", flexDirection: "column", flexShrink: 0, maxHeight: "45%", minHeight: 100 }}>
            <div style={{ alignItems: "center", borderBottom: "var(--fm-border)", display: "flex", flexShrink: 0, justifyContent: "space-between", padding: "0.55rem 0.8rem" }}>
              <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.15em", textTransform: "uppercase" }}>Projects</span>
              <button
                onClick={() => { setAddingProject(true); setNewProjectName(""); }}
                style={{ background: "none", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.9rem", lineHeight: 1, padding: "0.1rem 0.2rem", transition: "color 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-brass)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-ink-mute)"; }}
              >+</button>
            </div>
            <div style={{ overflowY: "auto" }}>
              {[{ id: null, name: "All" }, ...projects].map(proj => {
                const isActive = selectedProjectId === proj.id;
                return (
                  <div
                    key={proj.id ?? "__all"}
                    onClick={() => setSelectedProjectId(proj.id === selectedProjectId ? null : proj.id)}
                    style={{ background: isActive ? "var(--fm-brass-bg)" : "transparent", borderLeft: `2px solid ${isActive ? "var(--fm-brass)" : "transparent"}`, color: isActive ? "var(--fm-brass)" : "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-sans)", fontSize: "0.78rem", overflow: "hidden", padding: "0.4rem 0.8rem", textOverflow: "ellipsis", transition: "background 0.1s, color 0.1s", whiteSpace: "nowrap" }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--fm-bg-raised)"; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                  >
                    {proj.name}
                  </div>
                );
              })}
              {addingProject && (
                <div style={{ padding: "0.35rem 0.65rem" }}>
                  <input
                    autoFocus value={newProjectName} onChange={e => setNewProjectName(e.target.value)}
                    placeholder="Project name..."
                    onKeyDown={e => {
                      if (e.key === "Enter") { e.preventDefault(); handleCreateProject(); }
                      if (e.key === "Escape") { setAddingProject(false); setNewProjectName(""); }
                    }}
                    onBlur={handleCreateProject}
                    style={{ ...fieldInput, fontSize: "0.75rem", padding: "0.3rem 0.4rem" }}
                  />
                </div>
              )}
              {projects.length === 0 && !addingProject && (
                <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.72rem", padding: "0.75rem 0.8rem" }}>No projects yet</div>
              )}
            </div>
          </div>

          {/* To Dos list */}
          <div style={{ display: "flex", flex: 1, flexDirection: "column", overflow: "hidden" }}>
            <div style={{ borderBottom: "var(--fm-border)", flexShrink: 0, padding: "0.55rem 0.8rem 0.5rem" }}>
              <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.15em", textTransform: "uppercase" }}>To Dos</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.2rem", marginTop: "0.45rem" }}>
                {["All", ...todoCategories].map(cat => {
                  const isActive = activeCategory === cat;
                  return (
                    <button key={cat} onClick={() => setActiveCategory(cat)} style={{ ...pillBase, background: isActive ? "var(--fm-brass-bg)" : "transparent", border: isActive ? "1px solid rgba(201,169,110,0.5)" : "var(--fm-border)", color: isActive ? "var(--fm-brass)" : "var(--fm-ink-mute)", fontSize: "0.55rem", padding: "0.15rem 0.4rem" }}>
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {sidebarTodos.length === 0 ? (
                <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.72rem", padding: "0.75rem 0.8rem" }}>No to dos</div>
              ) : sidebarTodos.map(todo => {
                const priorityHex = PRIORITY_HEX[todo.priority] || "#c9a96e";
                return (
                  <div
                    key={todo.id}
                    onClick={() => setModalState(todo)}
                    style={{ alignItems: "center", background: "transparent", borderBottom: "var(--fm-border)", borderLeft: `3px solid ${priorityHex}`, cursor: "pointer", display: "flex", gap: "0.4rem", padding: "0.4rem 0.7rem 0.4rem 0.55rem", transition: "background 0.1s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--fm-bg-raised)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-sans)", fontSize: "0.75rem", overflow: "hidden", textDecoration: todo.status === "done" ? "line-through" : "none", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {todo.title}
                      </div>
                      {todo.dueDate && (
                        <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem" }}>
                          {new Date(todo.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Main kanban area */}
        <div style={{ display: "flex", flex: 1, flexDirection: "column", overflow: "hidden" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem 1.5rem 4rem" }}>

            {/* Filter + action bar */}
            <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "1.25rem" }}>
              {/* Assignee pills */}
              {assignees.map(a => {
                const isActive = assigneeFilter === a;
                return (
                  <button
                    key={a}
                    onClick={() => setAssigneeFilter(prev => prev === a ? null : a)}
                    style={{ ...pillBase, background: isActive ? "var(--fm-brass-bg)" : "transparent", border: isActive ? "1px solid rgba(201,169,110,0.5)" : "var(--fm-border-2)", color: isActive ? "var(--fm-brass)" : "var(--fm-ink-mute)" }}
                    onMouseEnter={e => { if (!isActive) { e.currentTarget.style.color = "var(--fm-ink-dim)"; e.currentTarget.style.borderColor = "var(--fm-ink-mute)"; } }}
                    onMouseLeave={e => { if (!isActive) { e.currentTarget.style.color = "var(--fm-ink-mute)"; e.currentTarget.style.borderColor = "var(--fm-hairline2)"; } }}
                  >
                    {a}
                  </button>
                );
              })}

              <div style={{ flex: 1 }} />

              <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem" }}>
                {filteredTodos.length} item{filteredTodos.length !== 1 ? "s" : ""}
              </span>

              <button
                onClick={() => setShowChoresOnly(prev => !prev)}
                style={{ ...pillBase, background: showChoresOnly ? "var(--fm-brass-bg)" : "transparent", border: showChoresOnly ? "1px solid rgba(201,169,110,0.5)" : "var(--fm-border-2)", color: showChoresOnly ? "var(--fm-brass)" : "var(--fm-ink-mute)" }}
                onMouseEnter={e => { if (!showChoresOnly) { e.currentTarget.style.color = "var(--fm-ink-dim)"; e.currentTarget.style.borderColor = "var(--fm-ink-mute)"; } }}
                onMouseLeave={e => { if (!showChoresOnly) { e.currentTarget.style.color = "var(--fm-ink-mute)"; e.currentTarget.style.borderColor = "var(--fm-hairline2)"; } }}
              >
                Chores
              </button>

              <button
                onClick={() => setModalState("new")}
                style={{ ...pillBase, background: "var(--fm-brass-bg)", border: "1px solid rgba(201,169,110,0.4)", color: "var(--fm-brass)" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(201,169,110,0.4)"}
              >
                + New To Do
              </button>
            </div>

            {/* Kanban columns */}
            <div style={{ alignItems: "flex-start", display: "flex", gap: "0.85rem" }}>
              {STATUS_COLUMNS.map(col => {
                const colTodos = todosByStatus[col.key];
                const isDragTarget = !!dragging && dragOverCol === col.key;
                return (
                  <div
                    key={col.key}
                    onDragEnter={() => dragging && setDragOverCol(col.key)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => handleDrop(col.key)}
                    style={{ background: isDragTarget ? "var(--fm-bg-raised)" : "var(--fm-bg-panel)", border: isDragTarget ? "1px solid rgba(201,169,110,0.4)" : "var(--fm-border)", borderRadius: "var(--fm-radius)", flex: 1, minHeight: 240, padding: "0.7rem", transition: "background 0.15s, border-color 0.15s" }}
                  >
                    {/* Column header */}
                    <div style={{ alignItems: "baseline", display: "flex", justifyContent: "space-between", marginBottom: "0.85rem" }}>
                      <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.15em", textTransform: "uppercase" }}>
                        {col.label}
                      </span>
                      <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-serif)", fontSize: "1.15rem", lineHeight: 1 }}>
                        {colTodos.length}
                      </span>
                    </div>

                    {colTodos.map(todo => (
                      <TodoCard
                        key={todo.id}
                        todo={todo}
                        onEdit={() => setModalState(todo)}
                        isDragging={dragging === todo.id}
                        onDragStart={() => setDragging(todo.id)}
                        onDragEnd={() => { setDragging(null); setDragOverCol(null); }}
                        onStatusChange={handleStatusChange}
                      />
                    ))}

                    <button
                      onClick={() => setModalState({ colKey: col.key })}
                      style={{ background: "none", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.06em", marginTop: "0.25rem", padding: "0.3rem 0", textAlign: "left", transition: "color 0.15s", width: "100%" }}
                      onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-brass)"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-ink-mute)"; }}
                    >
                      + Add
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
