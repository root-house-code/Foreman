import { useState, useMemo, useEffect, useRef, forwardRef } from "react";
import FmHeader from "./src/components/FmHeader.jsx";
import FmSubnav from "./src/components/FmSubnav.jsx";
import DatePicker from "react-datepicker";
import { loadTodos, saveTodos, createTodo } from "./lib/todos.js";
import { createProject } from "./lib/projects.js";
import { useForemanStore } from "./lib/store.js";
import { loadData } from "./lib/data.js";
import { loadDeletedCategories } from "./lib/deletedCategories.js";
import { loadDeletedItems } from "./lib/deletedItems.js";
import ImageAttachments from "./components/ImageAttachments.jsx";

const PRIORITY_HEX = {
  low: "#7fb087", medium: "#c9a96e", high: "#e0b266", urgent: "#e07b6a",
};

const fieldLabel = {
  color: "var(--fm-brass-dim)",
  display: "block",
  fontFamily: "var(--fm-mono)",
  fontSize: "0.6rem",
  letterSpacing: "0.12em",
  marginBottom: "0.3rem",
  textTransform: "uppercase",
};

const fieldInput = {
  background: "var(--fm-bg-sunk)",
  border: "var(--fm-border-2)",
  borderRadius: "var(--fm-radius)",
  boxSizing: "border-box",
  color: "var(--fm-ink)",
  fontFamily: "var(--fm-sans)",
  fontSize: "0.78rem",
  outline: "none",
  padding: "0.35rem 0.5rem",
  transition: "border-color 0.12s",
  width: "100%",
};

const fieldSelect = { ...fieldInput, cursor: "pointer" };

const DueDateBtn = forwardRef(({ value, onClick }, ref) => (
  <button
    ref={ref}
    onClick={onClick}
    style={{ ...fieldInput, color: value ? "var(--fm-ink)" : "var(--fm-ink-mute)", cursor: "pointer", textAlign: "left" }}
  >
    {value || "No date"}
  </button>
));

function TaskCheckbox({ completed, onToggle }) {
  return (
    <button
      onClick={onToggle}
      style={{ alignItems: "center", background: completed ? "var(--fm-brass-bg)" : "transparent", border: completed ? "1px solid rgba(201,169,110,0.4)" : "var(--fm-border-2)", borderRadius: "var(--fm-radius)", cursor: "pointer", display: "flex", flexShrink: 0, height: 16, justifyContent: "center", padding: 0, width: 16 }}
    >
      {completed && <span style={{ color: "var(--fm-brass)", fontSize: "0.55rem", lineHeight: 1 }}>✓</span>}
    </button>
  );
}

function statusBadgeStyle(status) {
  if (status === "done") return { background: "rgba(127,176,135,0.1)", border: "1px solid rgba(127,176,135,0.3)", borderRadius: "var(--fm-radius)", color: "var(--fm-green)", display: "inline-block", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.06em", padding: "0.1rem 0.35rem", textTransform: "uppercase" };
  if (status === "in-progress") return { background: "var(--fm-brass-bg)", border: "1px solid rgba(201,169,110,0.3)", borderRadius: "var(--fm-radius)", color: "var(--fm-brass)", display: "inline-block", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.06em", padding: "0.1rem 0.35rem", textTransform: "uppercase" };
  return { background: "var(--fm-bg-raised)", border: "var(--fm-border-2)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink-mute)", display: "inline-block", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.06em", padding: "0.1rem 0.35rem", textTransform: "uppercase" };
}

export default function ProjectsPage({ navigate }) {
  const projects = useForemanStore(s => s.projects);
  const [todos, setTodos] = useState(() => loadTodos());
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedTodoId, setSelectedTodoId] = useState(null);
  const [activeCategory, setActiveCategory] = useState("All");
  const [addingProject, setAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [addingTodoToProject, setAddingTodoToProject] = useState(false);
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [expandedTodos, setExpandedTodos] = useState(() => new Set());
  const [centerAddingTaskFor, setCenterAddingTaskFor] = useState(null);
  const [centerNewTaskTitle, setCenterNewTaskTitle] = useState("");
  const [rightAddingTask, setRightAddingTask] = useState(false);
  const [rightNewTaskTitle, setRightNewTaskTitle] = useState("");
  const [rightPanelForm, setRightPanelForm] = useState(null);
  const [rightPanelType, setRightPanelType] = useState(null);
  const [rightProjectForm, setRightProjectForm] = useState(null);
  const [rightProjectAddingTask, setRightProjectAddingTask] = useState(false);
  const [rightProjectNewTaskTitle, setRightProjectNewTaskTitle] = useState("");
  const [hoveredProjectId, setHoveredProjectId] = useState(null);
  const [renamingProjectId, setRenamingProjectId] = useState(null);
  const [confirmDeleteProject, setConfirmDeleteProject] = useState(null);
  const headerRef = useRef(null);

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
  const allCategories = Object.keys(categoryItems);

  const selectedProject = useMemo(() => projects.find(p => p.id === selectedProjectId) || null, [projects, selectedProjectId]);
  const selectedTodo = useMemo(() => todos.find(t => t.id === selectedTodoId) || null, [todos, selectedTodoId]);
  const projectTodos = useMemo(() => selectedProjectId ? todos.filter(t => t.projectId === selectedProjectId) : [], [todos, selectedProjectId]);

  const todoCategories = useMemo(() => {
    const cats = new Set(todos.filter(t => t.linkedCategory && !t._isOverdueChore).map(t => t.linkedCategory));
    return Array.from(cats).sort();
  }, [todos]);

  const filteredSidebarTodos = useMemo(() => {
    const base = todos.filter(t => !t._isOverdueChore);
    if (activeCategory === "All") return base;
    return base.filter(t => t.linkedCategory === activeCategory);
  }, [todos, activeCategory]);

  const linkedItems = rightPanelForm?.linkedCategory ? (categoryItems[rightPanelForm.linkedCategory] || []) : [];
  const projectLinkedItems = rightProjectForm?.linkedCategory ? (categoryItems[rightProjectForm.linkedCategory] || []) : [];

  // Items linked to this project via todos (for Linked Inventory section)
  const projectLinkedInventory = useMemo(() => {
    const items = new Map();
    projectTodos.forEach(t => {
      if (t.linkedItem && t.linkedCategory) {
        items.set(`${t.linkedCategory}|${t.linkedItem}`, { category: t.linkedCategory, item: t.linkedItem });
      }
    });
    return [...items.values()];
  }, [projectTodos]);

  useEffect(() => {
    const todo = todos.find(t => t.id === selectedTodoId) || null;
    if (todo) {
      setRightPanelForm({
        ...todo,
        labelsText: (todo.labels || []).join(", "),
        estimatedCostText: todo.estimatedCost != null ? String(todo.estimatedCost) : "",
      });
    } else {
      setRightPanelForm(null);
    }
    setRightAddingTask(false);
    setRightNewTaskTitle("");
  }, [selectedTodoId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (rightPanelType !== "project") return;
    const proj = projects.find(p => p.id === selectedProjectId) || null;
    if (proj) {
      setRightProjectForm({
        ...proj,
        labelsText: (proj.labels || []).join(", "),
        estimatedCostText: proj.estimatedCost != null ? String(proj.estimatedCost) : "",
      });
    } else {
      setRightProjectForm(null);
    }
    setRightProjectAddingTask(false);
    setRightProjectNewTaskTitle("");
  }, [selectedProjectId, rightPanelType]); // eslint-disable-line react-hooks/exhaustive-deps

  function persistTodos(next) { setTodos(next); saveTodos(next); }
  function persistProjects(next) { useForemanStore.getState().setProjects(next); }

  function saveProjectField(field, value) {
    if (!selectedProjectId) return;
    persistProjects(projects.map(p => p.id === selectedProjectId ? { ...p, [field]: value } : p));
  }
  function setProjectField(field, value) { setRightProjectForm(f => f ? { ...f, [field]: value } : f); }
  function handleProjectBlur(field) {
    if (!rightProjectForm || !selectedProjectId) return;
    if (field === "labels") {
      const parsed = rightProjectForm.labelsText.split(",").map(l => l.trim()).filter(Boolean);
      saveProjectField("labels", parsed);
    } else if (field === "estimatedCost") {
      const parsed = rightProjectForm.estimatedCostText !== "" ? parseFloat(rightProjectForm.estimatedCostText) : null;
      saveProjectField("estimatedCost", isNaN(parsed) ? null : parsed);
    } else {
      saveProjectField(field, rightProjectForm[field]);
    }
  }
  function handleProjectSelectChange(field, value) { setProjectField(field, value); saveProjectField(field, value); }
  function handleToggleProjectTask(taskId) {
    persistProjects(projects.map(p =>
      p.id === selectedProjectId
        ? { ...p, tasks: (p.tasks || []).map(t => t.id === taskId ? { ...t, completed: !t.completed } : t) }
        : p
    ));
  }
  function handleDeleteProjectTask(taskId) {
    persistProjects(projects.map(p =>
      p.id === selectedProjectId
        ? { ...p, tasks: (p.tasks || []).filter(t => t.id !== taskId) }
        : p
    ));
  }
  function handleRightProjectAddTask() {
    const title = rightProjectNewTaskTitle.trim();
    setRightProjectAddingTask(false);
    setRightProjectNewTaskTitle("");
    if (!title || !selectedProjectId) return;
    const task = { id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, title, completed: false };
    persistProjects(projects.map(p => p.id === selectedProjectId ? { ...p, tasks: [...(p.tasks || []), task] } : p));
  }
  function handleRenameProject(id, name) {
    const trimmed = name.trim();
    setRenamingProjectId(null);
    if (!trimmed) return;
    persistProjects(projects.map(p => p.id === id ? { ...p, name: trimmed } : p));
  }
  function handleDeleteProject(proj) {
    persistProjects(projects.filter(p => p.id !== proj.id));
    persistTodos(todos.map(t => t.projectId === proj.id ? { ...t, projectId: null } : t));
    if (selectedProjectId === proj.id) setSelectedProjectId(null);
    setConfirmDeleteProject(null);
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
  function handleAddTodoToProject() {
    const title = newTodoTitle.trim();
    setAddingTodoToProject(false);
    setNewTodoTitle("");
    if (!title || !selectedProjectId) return;
    const todo = createTodo({ title, projectId: selectedProjectId });
    persistTodos([...todos, todo]);
  }
  function addTask(todoId, title) {
    const t = title.trim();
    if (!t) return;
    const task = { id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, title: t, completed: false };
    persistTodos(todos.map(todo => todo.id === todoId ? { ...todo, tasks: [...(todo.tasks || []), task] } : todo));
  }
  function handleCenterAddTask(todoId) { addTask(todoId, centerNewTaskTitle); setCenterAddingTaskFor(null); setCenterNewTaskTitle(""); }
  function handleRightAddTask() {
    if (!selectedTodoId) return;
    addTask(selectedTodoId, rightNewTaskTitle);
    setRightAddingTask(false);
    setRightNewTaskTitle("");
  }
  function handleToggleTask(todoId, taskId) {
    persistTodos(todos.map(todo =>
      todo.id === todoId
        ? { ...todo, tasks: (todo.tasks || []).map(t => t.id === taskId ? { ...t, completed: !t.completed } : t) }
        : todo
    ));
  }
  function handleDeleteTask(todoId, taskId) {
    persistTodos(todos.map(todo =>
      todo.id === todoId
        ? { ...todo, tasks: (todo.tasks || []).filter(t => t.id !== taskId) }
        : todo
    ));
  }
  function saveRightField(field, value) {
    if (!selectedTodoId) return;
    persistTodos(todos.map(t => t.id === selectedTodoId ? { ...t, [field]: value } : t));
  }
  function setRightField(field, value) { setRightPanelForm(f => f ? { ...f, [field]: value } : f); }
  function handleRightBlur(field) {
    if (!rightPanelForm || !selectedTodoId) return;
    if (field === "labels") {
      const parsed = rightPanelForm.labelsText.split(",").map(l => l.trim()).filter(Boolean);
      saveRightField("labels", parsed);
    } else if (field === "estimatedCost") {
      const parsed = rightPanelForm.estimatedCostText !== "" ? parseFloat(rightPanelForm.estimatedCostText) : null;
      saveRightField("estimatedCost", isNaN(parsed) ? null : parsed);
    } else {
      saveRightField(field, rightPanelForm[field]);
    }
  }
  function handleRightSelectChange(field, value) { setRightField(field, value); saveRightField(field, value); }
  function toggleExpandTodo(id) {
    setExpandedTodos(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const projectDoneCount = projectTodos.filter(t => t.status === "done").length;
  const projectPct = projectTodos.length === 0 ? 0 : Math.round((projectDoneCount / projectTodos.length) * 100);

  return (
    <div style={{ background: "var(--fm-bg)", color: "var(--fm-ink)", display: "flex", flexDirection: "column", fontFamily: "var(--fm-sans)", height: "100vh", overflow: "hidden" }}>

      {confirmDeleteProject && (
        <div
          style={{ alignItems: "center", background: "rgba(0,0,0,0.65)", bottom: 0, display: "flex", justifyContent: "center", left: 0, position: "fixed", right: 0, top: 0, zIndex: 1000 }}
          onMouseDown={e => { if (e.target === e.currentTarget) setConfirmDeleteProject(null); }}
        >
          <div style={{ background: "var(--fm-bg-panel)", border: "var(--fm-border)", borderRadius: "var(--fm-radius-lg)", maxWidth: 420, padding: "1.75rem 2rem", width: "90%" }}>
            <div style={{ color: "var(--fm-red)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.15em", marginBottom: "1rem", textTransform: "uppercase" }}>
              Permanently Delete Project
            </div>
            <p style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.82rem", margin: "0 0 0.5rem" }}>
              <strong>{confirmDeleteProject.name}</strong>
            </p>
            <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-sans)", fontSize: "0.78rem", margin: "0 0 1.5rem" }}>
              This will permanently delete this project. Its to dos will be unlinked but not deleted.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmDeleteProject(null)}
                style={{ background: "transparent", border: "var(--fm-border-2)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 1rem", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
              >Cancel</button>
              <button
                onClick={() => handleDeleteProject(confirmDeleteProject)}
                style={{ background: "rgba(224,123,106,0.1)", border: "1px solid var(--fm-red)", borderRadius: "var(--fm-radius)", color: "var(--fm-red)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 1rem", transition: "background 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(224,123,106,0.2)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(224,123,106,0.1)"}
              >Delete</button>
            </div>
          </div>
        </div>
      )}

      <div ref={headerRef}>
        <FmHeader active="Projects" tagline="Projects" />
        <FmSubnav
          tabs={["Active", "Planned", "Completed", "Archive"]}
          active="Active"
          stats={[
            { value: projects.length, label: "active" },
            { value: todos.filter(t => t.projectId && t.status !== "done").length, label: "open todos" },
            { value: todos.filter(t => t.projectId && t.status === "done").length, color: "var(--fm-green)", label: "completed" },
          ]}
        />
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Left sidebar */}
        <aside style={{ borderRight: "var(--fm-border)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden", width: 240 }}>

          {/* Projects widget */}
          <div style={{ borderBottom: "var(--fm-border)", display: "flex", flexDirection: "column", flexShrink: 0, maxHeight: "45%", minHeight: 100 }}>
            <div style={{ alignItems: "center", borderBottom: "var(--fm-border)", display: "flex", flexShrink: 0, justifyContent: "space-between", padding: "0.55rem 0.85rem" }}>
              <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.15em", textTransform: "uppercase" }}>Projects</span>
              <button
                onClick={() => { setAddingProject(true); setNewProjectName(""); }}
                title="New project"
                style={{ background: "none", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.9rem", lineHeight: 1, padding: "0.1rem 0.2rem", transition: "color 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-brass)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-ink-mute)"; }}
              >+</button>
            </div>
            <div style={{ overflowY: "auto" }}>
              {projects.map(proj => {
                const ptodos = todos.filter(t => t.projectId === proj.id);
                const pdone = ptodos.filter(t => t.status === "done").length;
                const ppct = ptodos.length === 0 ? 0 : Math.round((pdone / ptodos.length) * 100);
                const isActive = selectedProjectId === proj.id;
                const isHovered = hoveredProjectId === proj.id;
                return (
                  <div
                    key={proj.id}
                    onClick={() => { setSelectedProjectId(proj.id); setSelectedTodoId(null); setRightPanelType("project"); }}
                    onMouseEnter={() => setHoveredProjectId(proj.id)}
                    onMouseLeave={() => setHoveredProjectId(null)}
                    style={{ alignItems: "center", background: isActive ? "var(--fm-brass-bg)" : isHovered ? "var(--fm-bg-raised)" : "transparent", borderLeft: `2px solid ${isActive ? "var(--fm-brass)" : "transparent"}`, color: isActive ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: "pointer", display: "flex", fontFamily: "var(--fm-sans)", fontSize: "0.78rem", padding: "0.4rem 0.5rem 0.4rem 0.85rem", transition: "background 0.1s, color 0.1s" }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {renamingProjectId === proj.id ? (
                        <input
                          autoFocus
                          defaultValue={proj.name}
                          onKeyDown={e => {
                            if (e.key === "Enter") { e.preventDefault(); handleRenameProject(proj.id, e.currentTarget.value); }
                            if (e.key === "Escape") { e.preventDefault(); setRenamingProjectId(null); }
                          }}
                          onBlur={e => handleRenameProject(proj.id, e.target.value)}
                          onClick={e => e.stopPropagation()}
                          style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-brass)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.78rem", outline: "none", padding: "0.1rem 0.3rem", width: "100%" }}
                        />
                      ) : (
                        <span onDoubleClick={e => { e.stopPropagation(); setRenamingProjectId(proj.id); }} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {proj.name}
                        </span>
                      )}
                      {ptodos.length > 0 && (
                        <div style={{ alignItems: "center", display: "flex", gap: "0.4rem", marginTop: "3px" }}>
                          <div style={{ background: "var(--fm-hairline2)", borderRadius: "var(--fm-radius)", flex: 1, height: "3px", overflow: "hidden" }}>
                            <div style={{ background: ppct === 100 ? "var(--fm-green)" : "var(--fm-brass)", borderRadius: "var(--fm-radius)", height: "100%", transition: "width 0.3s", width: `${ppct}%` }} />
                          </div>
                          <span style={{ color: isActive ? "var(--fm-brass)" : "var(--fm-ink-mute)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.52rem" }}>{pdone}/{ptodos.length}</span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmDeleteProject(proj); }}
                      style={{ background: "none", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.9rem", lineHeight: 1, opacity: isHovered ? 1 : 0, padding: "0 0.25rem", transition: "color 0.15s, opacity 0.1s" }}
                      onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-red)"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-ink-mute)"; }}
                    >×</button>
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
                <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.72rem", padding: "0.75rem 0.85rem" }}>No projects yet</div>
              )}
            </div>
          </div>

          {/* To Dos widget */}
          <div style={{ display: "flex", flex: 1, flexDirection: "column", overflow: "hidden" }}>
            <div style={{ borderBottom: "var(--fm-border)", flexShrink: 0, padding: "0.55rem 0.85rem 0.5rem" }}>
              <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.15em", textTransform: "uppercase" }}>To Dos</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.2rem", marginTop: "0.45rem" }}>
                {["All", ...todoCategories].map(cat => {
                  const isActive = activeCategory === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      style={{ background: isActive ? "var(--fm-brass-bg)" : "transparent", border: isActive ? "1px solid rgba(201,169,110,0.5)" : "var(--fm-border)", borderRadius: "var(--fm-radius)", color: isActive ? "var(--fm-brass)" : "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.05em", padding: "0.15rem 0.4rem", textTransform: "uppercase", transition: "all 0.12s" }}
                    >{cat}</button>
                  );
                })}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {filteredSidebarTodos.length === 0 ? (
                <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.72rem", padding: "0.75rem 0.85rem" }}>No to dos</div>
              ) : filteredSidebarTodos.map(todo => {
                const priorityHex = PRIORITY_HEX[todo.priority] || "#c9a96e";
                return (
                  <div
                    key={todo.id}
                    onClick={() => { setSelectedTodoId(todo.id); setRightPanelType("todo"); }}
                    style={{ alignItems: "center", background: selectedTodoId === todo.id ? "var(--fm-brass-bg)" : "transparent", borderBottom: "var(--fm-border)", borderLeft: `3px solid ${priorityHex}`, cursor: "pointer", display: "flex", gap: "0.4rem", padding: "0.4rem 0.75rem 0.4rem 0.6rem", transition: "background 0.1s" }}
                    onMouseEnter={e => { if (selectedTodoId !== todo.id) e.currentTarget.style.background = "var(--fm-bg-raised)"; }}
                    onMouseLeave={e => { if (selectedTodoId !== todo.id) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: selectedTodoId === todo.id ? "var(--fm-brass)" : "var(--fm-ink-dim)", fontFamily: "var(--fm-sans)", fontSize: "0.75rem", overflow: "hidden", textDecoration: todo.status === "done" ? "line-through" : "none", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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

        {/* Center panel */}
        <main style={{ display: "flex", flex: 1, flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          {!selectedProject ? (
            <div style={{ alignItems: "center", display: "flex", flex: 1, flexDirection: "column", gap: "0.5rem", justifyContent: "center" }}>
              <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>No project selected</div>
              <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.72rem" }}>Choose a project from the sidebar or create a new one</div>
            </div>
          ) : (
            <div style={{ display: "flex", flex: 1, flexDirection: "column", overflow: "hidden" }}>

              {/* Project header */}
              <div style={{ borderBottom: "var(--fm-border)", flexShrink: 0 }}>
                <div style={{ padding: "0.85rem 1.5rem 0.6rem" }}>
                  <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "1.05rem", marginBottom: "0.15rem" }}>
                    {selectedProject.name}
                  </div>
                  <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem" }}>
                    {projectTodos.length} {projectTodos.length === 1 ? "to do" : "to dos"}
                  </div>
                </div>
                {/* 4-stat strip */}
                <div style={{ borderTop: "var(--fm-border)", display: "flex" }}>
                  {[
                    { label: "Progress", value: `${projectPct}%` },
                    { label: "Budget", value: selectedProject.estimatedCost ? `$${Number(selectedProject.estimatedCost).toLocaleString()}` : "—" },
                    { label: "Items", value: String(projectLinkedInventory.length) },
                    { label: "Due", value: selectedProject.dueDate ? new Date(selectedProject.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—" },
                  ].map(({ label, value }, i, arr) => (
                    <div key={label} style={{ borderRight: i < arr.length - 1 ? "var(--fm-border)" : "none", flex: 1, padding: "0.4rem 0.75rem", textAlign: "center" }}>
                      <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.5rem", letterSpacing: "0.1em", marginBottom: "0.15rem", textTransform: "uppercase" }}>{label}</div>
                      <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "0.88rem" }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Column headers */}
              <div style={{ borderBottom: "var(--fm-border)", display: "flex", flexShrink: 0, padding: "0.35rem 1.5rem 0.35rem 2.5rem" }}>
                <span style={{ color: "var(--fm-brass-dim)", flex: 1, fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>Name</span>
                <span style={{ color: "var(--fm-brass-dim)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.1em", textAlign: "right", textTransform: "uppercase", width: 72 }}>Due</span>
                <span style={{ color: "var(--fm-brass-dim)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.1em", textAlign: "right", textTransform: "uppercase", width: 88 }}>Status</span>
              </div>

              {/* To Do list */}
              <div style={{ flex: 1, overflowY: "auto" }}>
                {projectTodos.map(todo => {
                  const isExpanded = expandedTodos.has(todo.id);
                  const isSelected = selectedTodoId === todo.id;
                  const tasks = todo.tasks || [];
                  const doneTasks = tasks.filter(t => t.completed).length;
                  const isOverdue = todo.dueDate && todo.status !== "done" && new Date(todo.dueDate) < new Date();
                  const priorityHex = PRIORITY_HEX[todo.priority] || "#c9a96e";

                  return (
                    <div key={todo.id} style={{ borderBottom: "var(--fm-border)" }}>
                      <div
                        onClick={() => { const next = isSelected ? null : todo.id; setSelectedTodoId(next); if (next) setRightPanelType("todo"); }}
                        style={{ alignItems: "center", background: isSelected ? "var(--fm-brass-bg)" : "transparent", borderLeft: `3px solid ${isSelected ? "var(--fm-brass)" : priorityHex}`, cursor: "pointer", display: "flex", gap: "0.5rem", padding: "0.6rem 1.5rem 0.6rem 0.85rem", transition: "background 0.1s", userSelect: "none" }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "var(--fm-bg-raised)"; }}
                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                      >
                        <button
                          onClick={e => { e.stopPropagation(); toggleExpandTodo(todo.id); }}
                          style={{ background: "none", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.55rem", padding: 0, width: 12 }}
                        >
                          {isExpanded ? "▼" : "▶"}
                        </button>

                        <span style={{ color: isSelected ? "var(--fm-brass)" : "var(--fm-ink)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.82rem", minWidth: 0, overflow: "hidden", textDecoration: todo.status === "done" ? "line-through" : "none", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {todo.title}
                        </span>

                        {tasks.length > 0 && (
                          <span style={{ color: "var(--fm-ink-mute)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.6rem" }}>
                            {doneTasks}/{tasks.length}
                          </span>
                        )}

                        <span style={{ color: isOverdue ? "var(--fm-red)" : "var(--fm-ink-mute)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.65rem", textAlign: "right", width: 72 }}>
                          {todo.dueDate ? new Date(todo.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                        </span>

                        <span style={{ flexShrink: 0, textAlign: "right", width: 88 }}>
                          <span style={statusBadgeStyle(todo.status)}>
                            {todo.status === "not-started" ? "To Do" : todo.status === "in-progress" ? "In Prog." : "Done"}
                          </span>
                        </span>
                      </div>

                      {isExpanded && (
                        <div style={{ background: "var(--fm-bg-sunk)", paddingBottom: "0.35rem" }}>
                          {tasks.map(task => (
                            <div key={task.id} style={{ alignItems: "center", display: "flex", gap: "0.6rem", padding: "0.3rem 1.5rem 0.3rem 2.6rem" }}>
                              <TaskCheckbox completed={task.completed} onToggle={() => handleToggleTask(todo.id, task.id)} />
                              <span style={{ color: task.completed ? "var(--fm-ink-mute)" : "var(--fm-ink-dim)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.75rem", textDecoration: task.completed ? "line-through" : "none" }}>
                                {task.title}
                              </span>
                              <button
                                onClick={() => handleDeleteTask(todo.id, task.id)}
                                style={{ background: "none", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.7rem", padding: "0 0.2rem", transition: "color 0.15s" }}
                                onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-red)"; }}
                                onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-ink-mute)"; }}
                              >×</button>
                            </div>
                          ))}
                          {centerAddingTaskFor === todo.id ? (
                            <div style={{ alignItems: "center", display: "flex", gap: "0.6rem", padding: "0.3rem 1.5rem 0.3rem 2.6rem" }}>
                              <div style={{ border: "var(--fm-border-2)", borderRadius: "var(--fm-radius)", flexShrink: 0, height: 16, width: 16 }} />
                              <input
                                autoFocus value={centerNewTaskTitle} onChange={e => setCenterNewTaskTitle(e.target.value)}
                                placeholder="Title"
                                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleCenterAddTask(todo.id); } if (e.key === "Escape") { setCenterAddingTaskFor(null); setCenterNewTaskTitle(""); } }}
                                onBlur={() => handleCenterAddTask(todo.id)}
                                style={{ ...fieldInput, flex: 1, fontSize: "0.72rem", padding: "0.2rem 0.4rem" }}
                              />
                            </div>
                          ) : (
                            <button
                              onClick={() => { setCenterAddingTaskFor(todo.id); setCenterNewTaskTitle(""); }}
                              style={{ background: "none", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", letterSpacing: "0.05em", padding: "0.25rem 0 0.25rem 2.6rem", textAlign: "left", transition: "color 0.15s", width: "100%" }}
                              onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-brass)"; }}
                              onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-ink-mute)"; }}
                            >+ Add</button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {addingTodoToProject ? (
                  <div style={{ borderBottom: "var(--fm-border)", padding: "0.5rem 1.5rem 0.5rem 2.25rem" }}>
                    <input
                      autoFocus value={newTodoTitle} onChange={e => setNewTodoTitle(e.target.value)}
                      placeholder="To Do title..."
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddTodoToProject(); } if (e.key === "Escape") { setAddingTodoToProject(false); setNewTodoTitle(""); } }}
                      onBlur={handleAddTodoToProject}
                      style={{ ...fieldInput, fontSize: "0.82rem" }}
                    />
                  </div>
                ) : (
                  <div style={{ padding: "0.5rem 1.5rem" }}>
                    <button
                      onClick={() => setAddingTodoToProject(true)}
                      style={{ background: "none", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", letterSpacing: "0.05em", padding: "0.2rem 0", transition: "color 0.15s" }}
                      onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-brass)"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-ink-mute)"; }}
                    >+ Add To Do</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        {/* Right panel */}
        <aside style={{ borderLeft: "var(--fm-border)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden", width: 300 }}>
          {rightPanelType === "project" && rightProjectForm ? (
            <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem 1rem 2rem" }}>
              <div style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.15em", marginBottom: "0.75rem", textTransform: "uppercase" }}>Project Details</div>

              <input
                value={rightProjectForm.name || ""}
                onChange={e => setProjectField("name", e.target.value)}
                onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
                onBlur={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; handleProjectBlur("name"); }}
                style={{ ...fieldInput, fontFamily: "var(--fm-serif)", fontSize: "1rem", marginBottom: "1.1rem", padding: "0.4rem 0.5rem" }}
              />

              <div style={{ display: "flex", gap: "0.6rem", marginBottom: "0.75rem" }}>
                <div style={{ flex: 1 }}>
                  <label style={fieldLabel}>Status</label>
                  <select value={rightProjectForm.status || "not-started"} onChange={e => handleProjectSelectChange("status", e.target.value)} style={fieldSelect}>
                    <option value="not-started">Not Started</option>
                    <option value="in-progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={fieldLabel}>Priority</label>
                  <select value={rightProjectForm.priority || "medium"} onChange={e => handleProjectSelectChange("priority", e.target.value)} style={fieldSelect}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: "0.75rem" }}>
                <label style={fieldLabel}>Due Date</label>
                <DatePicker
                  selected={rightProjectForm.dueDate ? new Date(rightProjectForm.dueDate) : null}
                  onChange={date => { const val = date ? date.toISOString() : null; setProjectField("dueDate", val); saveProjectField("dueDate", val); }}
                  dateFormat="MMM d, yyyy"
                  customInput={<DueDateBtn value={rightProjectForm.dueDate ? new Date(rightProjectForm.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null} />}
                  popperPlacement="bottom-start" isClearable
                />
              </div>

              <div style={{ display: "flex", gap: "0.6rem", marginBottom: "0.75rem" }}>
                <div style={{ flex: 1 }}>
                  <label style={fieldLabel}>Assignee</label>
                  <input value={rightProjectForm.assignee || ""} onChange={e => setProjectField("assignee", e.target.value)} onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"} onBlur={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; handleProjectBlur("assignee"); }} placeholder="—" style={fieldInput} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={fieldLabel}>Est. Cost ($)</label>
                  <input type="number" min="0" value={rightProjectForm.estimatedCostText || ""} onChange={e => setProjectField("estimatedCostText", e.target.value)} onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"} onBlur={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; handleProjectBlur("estimatedCost"); }} placeholder="—" style={fieldInput} />
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.6rem", marginBottom: "0.75rem" }}>
                <div style={{ flex: 1 }}>
                  <label style={fieldLabel}>Category</label>
                  <select value={rightProjectForm.linkedCategory || ""} onChange={e => { handleProjectSelectChange("linkedCategory", e.target.value || null); if (!e.target.value) handleProjectSelectChange("linkedItem", null); }} style={fieldSelect}>
                    <option value="">None</option>
                    {allCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={fieldLabel}>Item</label>
                  <select value={rightProjectForm.linkedItem || ""} onChange={e => handleProjectSelectChange("linkedItem", e.target.value || null)} style={{ ...fieldSelect, opacity: !rightProjectForm.linkedCategory ? 0.4 : 1 }} disabled={!rightProjectForm.linkedCategory}>
                    <option value="">Category-level</option>
                    {projectLinkedItems.map(item => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: "0.75rem" }}>
                <label style={fieldLabel}>Labels</label>
                <input value={rightProjectForm.labelsText || ""} onChange={e => setProjectField("labelsText", e.target.value)} onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"} onBlur={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; handleProjectBlur("labels"); }} placeholder="Renovation, Seasonal..." style={fieldInput} />
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={fieldLabel}>Description</label>
                <textarea value={rightProjectForm.description || ""} onChange={e => setProjectField("description", e.target.value)} onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"} onBlur={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; handleProjectBlur("description"); }} placeholder="Notes..." rows={3} style={{ ...fieldInput, resize: "vertical" }} />
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <ImageAttachments imageIds={rightProjectForm.images || []} onChange={ids => { setProjectField("images", ids); saveProjectField("images", ids); }} />
              </div>

              {/* Checklist */}
              <div style={{ borderTop: "var(--fm-border)", paddingTop: "0.85rem" }}>
                <label style={{ ...fieldLabel, marginBottom: "0.5rem" }}>Checklist</label>
                {(rightProjectForm.tasks || []).map(task => (
                  <div key={task.id} style={{ alignItems: "center", display: "flex", gap: "0.5rem", marginBottom: "0.3rem" }}>
                    <TaskCheckbox completed={task.completed} onToggle={() => handleToggleProjectTask(task.id)} />
                    <span style={{ color: "var(--fm-ink-dim)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.75rem", textDecoration: task.completed ? "line-through" : "none" }}>{task.title}</span>
                    <button onClick={() => handleDeleteProjectTask(task.id)} style={{ background: "none", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.7rem", padding: "0 0.1rem", transition: "color 0.15s" }} onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-red)"; }} onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-ink-mute)"; }}>×</button>
                  </div>
                ))}
                {rightProjectAddingTask ? (
                  <div style={{ alignItems: "center", display: "flex", gap: "0.5rem", marginTop: "0.3rem" }}>
                    <div style={{ border: "var(--fm-border-2)", borderRadius: "var(--fm-radius)", flexShrink: 0, height: 16, width: 16 }} />
                    <input autoFocus value={rightProjectNewTaskTitle} onChange={e => setRightProjectNewTaskTitle(e.target.value)} placeholder="Title" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleRightProjectAddTask(); } if (e.key === "Escape") { setRightProjectAddingTask(false); setRightProjectNewTaskTitle(""); } }} onBlur={handleRightProjectAddTask} style={{ ...fieldInput, flex: 1, fontSize: "0.72rem", padding: "0.2rem 0.4rem" }} />
                  </div>
                ) : (
                  <button onClick={() => setRightProjectAddingTask(true)} style={{ background: "none", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", letterSpacing: "0.05em", marginTop: "0.25rem", padding: "0.2rem 0", transition: "color 0.15s" }} onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-brass)"; }} onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-ink-mute)"; }}>+ Add</button>
                )}
              </div>

              {/* Linked inventory */}
              {projectLinkedInventory.length > 0 && (
                <div style={{ borderTop: "var(--fm-border)", marginTop: "0.85rem", paddingTop: "0.85rem" }}>
                  <label style={{ ...fieldLabel, marginBottom: "0.5rem" }}>Linked Inventory</label>
                  {projectLinkedInventory.map(({ category, item }) => (
                    <div key={`${category}|${item}`} style={{ alignItems: "center", display: "flex", gap: "0.5rem", marginBottom: "0.3rem" }}>
                      <span style={{ background: "var(--fm-bg-sunk)", border: "var(--fm-border)", borderRadius: "var(--fm-radius)", color: "var(--fm-brass-dim)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.52rem", letterSpacing: "0.06em", padding: "0.1rem 0.3rem", textTransform: "uppercase" }}>
                        {category.slice(0, 4).toUpperCase()}
                      </span>
                      <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-sans)", fontSize: "0.75rem" }}>{item}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : rightPanelType === "todo" && rightPanelForm ? (
            <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem 1rem 2rem" }}>
              <div style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.15em", marginBottom: "0.75rem", textTransform: "uppercase" }}>To Do Details</div>

              <input
                value={rightPanelForm.title || ""}
                onChange={e => setRightField("title", e.target.value)}
                onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
                onBlur={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; handleRightBlur("title"); }}
                style={{ ...fieldInput, fontFamily: "var(--fm-serif)", fontSize: "1rem", marginBottom: "1.1rem", padding: "0.4rem 0.5rem" }}
              />

              <div style={{ display: "flex", gap: "0.6rem", marginBottom: "0.75rem" }}>
                <div style={{ flex: 1 }}>
                  <label style={fieldLabel}>Status</label>
                  <select value={rightPanelForm.status || "not-started"} onChange={e => handleRightSelectChange("status", e.target.value)} style={fieldSelect}>
                    <option value="not-started">Not Started</option>
                    <option value="in-progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={fieldLabel}>Priority</label>
                  <select value={rightPanelForm.priority || "medium"} onChange={e => handleRightSelectChange("priority", e.target.value)} style={fieldSelect}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: "0.75rem" }}>
                <label style={fieldLabel}>Due Date</label>
                <DatePicker
                  selected={rightPanelForm.dueDate ? new Date(rightPanelForm.dueDate) : null}
                  onChange={date => { const val = date ? date.toISOString() : null; setRightField("dueDate", val); saveRightField("dueDate", val); }}
                  dateFormat="MMM d, yyyy"
                  customInput={<DueDateBtn value={rightPanelForm.dueDate ? new Date(rightPanelForm.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null} />}
                  popperPlacement="bottom-start" isClearable
                />
              </div>

              <div style={{ display: "flex", gap: "0.6rem", marginBottom: "0.75rem" }}>
                <div style={{ flex: 1 }}>
                  <label style={fieldLabel}>Assignee</label>
                  <input value={rightPanelForm.assignee || ""} onChange={e => setRightField("assignee", e.target.value)} onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"} onBlur={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; handleRightBlur("assignee"); }} placeholder="—" style={fieldInput} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={fieldLabel}>Est. Cost ($)</label>
                  <input type="number" min="0" value={rightPanelForm.estimatedCostText || ""} onChange={e => setRightField("estimatedCostText", e.target.value)} onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"} onBlur={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; handleRightBlur("estimatedCost"); }} placeholder="—" style={fieldInput} />
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.6rem", marginBottom: "0.75rem" }}>
                <div style={{ flex: 1 }}>
                  <label style={fieldLabel}>Category</label>
                  <select value={rightPanelForm.linkedCategory || ""} onChange={e => { handleRightSelectChange("linkedCategory", e.target.value || null); if (!e.target.value) handleRightSelectChange("linkedItem", null); }} style={fieldSelect}>
                    <option value="">None</option>
                    {allCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={fieldLabel}>Item</label>
                  <select value={rightPanelForm.linkedItem || ""} onChange={e => handleRightSelectChange("linkedItem", e.target.value || null)} style={{ ...fieldSelect, opacity: !rightPanelForm.linkedCategory ? 0.4 : 1 }} disabled={!rightPanelForm.linkedCategory}>
                    <option value="">Category-level</option>
                    {linkedItems.map(item => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: "0.75rem" }}>
                <label style={fieldLabel}>Project</label>
                <select value={rightPanelForm.projectId || ""} onChange={e => handleRightSelectChange("projectId", e.target.value || null)} style={fieldSelect}>
                  <option value="">No project</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: "0.75rem" }}>
                <label style={fieldLabel}>Labels</label>
                <input value={rightPanelForm.labelsText || ""} onChange={e => setRightField("labelsText", e.target.value)} onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"} onBlur={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; handleRightBlur("labels"); }} placeholder="Plumbing, Seasonal..." style={fieldInput} />
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={fieldLabel}>Description</label>
                <textarea value={rightPanelForm.description || ""} onChange={e => setRightField("description", e.target.value)} onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"} onBlur={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; handleRightBlur("description"); }} placeholder="Notes..." rows={3} style={{ ...fieldInput, resize: "vertical" }} />
              </div>

              {/* Checklist */}
              <div style={{ borderTop: "var(--fm-border)", paddingTop: "0.85rem" }}>
                <label style={{ ...fieldLabel, marginBottom: "0.5rem" }}>Checklist</label>
                {(selectedTodo?.tasks || []).map(task => (
                  <div key={task.id} style={{ alignItems: "center", display: "flex", gap: "0.5rem", marginBottom: "0.3rem" }}>
                    <TaskCheckbox completed={task.completed} onToggle={() => selectedTodo && handleToggleTask(selectedTodo.id, task.id)} />
                    <span style={{ color: "var(--fm-ink-dim)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.75rem", textDecoration: task.completed ? "line-through" : "none" }}>{task.title}</span>
                    <button onClick={() => selectedTodo && handleDeleteTask(selectedTodo.id, task.id)} style={{ background: "none", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.7rem", padding: "0 0.1rem", transition: "color 0.15s" }} onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-red)"; }} onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-ink-mute)"; }}>×</button>
                  </div>
                ))}
                {rightAddingTask ? (
                  <div style={{ alignItems: "center", display: "flex", gap: "0.5rem", marginTop: "0.3rem" }}>
                    <div style={{ border: "var(--fm-border-2)", borderRadius: "var(--fm-radius)", flexShrink: 0, height: 16, width: 16 }} />
                    <input autoFocus value={rightNewTaskTitle} onChange={e => setRightNewTaskTitle(e.target.value)} placeholder="Title" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleRightAddTask(); } if (e.key === "Escape") { setRightAddingTask(false); setRightNewTaskTitle(""); } }} onBlur={handleRightAddTask} style={{ ...fieldInput, flex: 1, fontSize: "0.72rem", padding: "0.2rem 0.4rem" }} />
                  </div>
                ) : (
                  <button onClick={() => setRightAddingTask(true)} style={{ background: "none", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", letterSpacing: "0.05em", marginTop: "0.25rem", padding: "0.2rem 0", transition: "color 0.15s" }} onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-brass)"; }} onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-ink-mute)"; }}>+ Add</button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ alignItems: "center", display: "flex", flex: 1, flexDirection: "column", justifyContent: "center" }}>
              <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.72rem", padding: "1rem", textAlign: "center" }}>
                Select a project or to do to view details
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
