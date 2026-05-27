import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import DatePicker from "react-datepicker";
import AssigneeInput from "./AssigneeInput.jsx";
import ImageAttachments from "./ImageAttachments.jsx";
import LocationPickerModal from "./LocationPickerModal.jsx";
import { fieldLabel, fieldInput, fieldSelect, DueDateBtn, STATUS_COLUMNS, PRIORITY_LABELS } from "./ModalShared.jsx";
import { getFloorsInOrder } from "../lib/floors.js";
import { loadRooms } from "../lib/rooms.js";

function TaskCheckbox({ completed, onToggle }) {
  return (
    <button
      onClick={onToggle}
      style={{ alignItems: "center", background: completed ? "var(--fm-brass-bg)" : "transparent", border: completed ? "1px solid rgba(201,169,110,0.4)" : "1px solid #2b3140", borderRadius: "3px", cursor: "pointer", display: "flex", flexShrink: 0, height: 16, justifyContent: "center", padding: 0, width: 16 }}
    >
      {completed && <span style={{ color: "var(--fm-brass)", fontSize: "0.55rem", lineHeight: 1 }}>✓</span>}
    </button>
  );
}

export default function TodoModal({ todo, initialOverrides, categories, categoryItems, spatialCategories, functionalCategories, exteriorCategories, structureCategories, projects, onSave, onClose, onDelete }) {
  const [form, setForm] = useState(todo ? {
    ...todo,
    labels: todo.labels || [],
    estimatedCost: todo.estimatedCost ?? "",
    images: todo.images || [],
    tasks: todo.tasks || [],
    linkedRoom: todo.linkedRoom || null,
    linkedSystem: todo.linkedSystem || null,
    linkedExterior: todo.linkedExterior || null,
    linkedStructure: todo.linkedStructure || null,
    floorPlanLocation: todo.floorPlanLocation || null,
  } : {
    title: "", description: "", status: "not-started", priority: "medium",
    dueDate: null, assignee: "", labels: [], estimatedCost: "",
    linkedCategory: null, linkedItem: null,
    linkedRoom: initialOverrides?.linkedRoom ?? null,
    linkedSystem: null,
    linkedExterior: initialOverrides?.linkedExterior ?? null,
    linkedStructure: null,
    floorPlanLocation: initialOverrides?.floorPlanLocation ?? null,
    projectId: null, images: [], tasks: [],
  });

  // Derive spatial/functional lists from props or fall back to full categories list
  const roomOptions = spatialCategories || categories || [];
  const systemOptions = functionalCategories || [];
  const exteriorOptions = exteriorCategories || [];
  const structureOptions = structureCategories || [];

  const [addingTask, setAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  // For resolving the floor plan location label
  const floors = useMemo(() => getFloorsInOrder(), []);
  const allRooms = useMemo(() => loadRooms(), []);

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }));
  const linkedItems = form.linkedSystem
    ? (categoryItems[form.linkedSystem] || [])
    : form.linkedRoom
      ? (categoryItems[form.linkedRoom] || [])
      : [];
  const hasItemContext = !!(form.linkedSystem || form.linkedRoom);

  function handleLocationConfirm({ levelId, zone, x, y }) {
    setShowPicker(false);
    const roomRecord = zone ? allRooms[zone] : null;
    const isExt = exteriorOptions.includes(roomRecord?.categoryName);
    setForm(f => ({
      ...f,
      floorPlanLocation: { levelId, zone, x, y },
      ...(zone && !isExt && roomRecord?.categoryName ? { linkedRoom: roomRecord.categoryName } : {}),
      ...(zone && isExt && roomRecord?.categoryName ? { linkedExterior: roomRecord.categoryName } : {}),
    }));
  }

  const fpLevelLabel = form.floorPlanLocation
    ? floors.find(f => f.id === form.floorPlanLocation.levelId)?.label || form.floorPlanLocation.levelId
    : null;
  const fpZoneLabel = form.floorPlanLocation?.zone
    ? allRooms[form.floorPlanLocation.zone]?.label || null
    : null;
  const fpLocationLabel = fpLevelLabel
    ? [fpLevelLabel, fpZoneLabel].filter(Boolean).join(" — ")
    : null;

  function handleToggleTask(taskId) {
    set("tasks", form.tasks.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t));
  }

  function handleDeleteTask(taskId) {
    set("tasks", form.tasks.filter(t => t.id !== taskId));
  }

  function handleAddTask() {
    const title = newTaskTitle.trim();
    if (title) {
      const task = { id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, title, completed: false };
      set("tasks", [...form.tasks, task]);
    }
    setAddingTask(false);
    setNewTaskTitle("");
  }

  const modal = createPortal(
    <div
      onClick={onClose}
      style={{
        alignItems: "center", background: "rgba(0,0,0,0.7)", bottom: 0,
        display: "flex", justifyContent: "center", left: 0,
        position: "fixed", right: 0, top: 0, zIndex: 1100,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#1a1f2e", border: "1px solid #a8a29c", borderRadius: "8px",
          maxHeight: "90vh", maxWidth: 540, overflowY: "auto", padding: "2rem", width: "90%",
        }}
      >
        <div style={{ color: "#f0e6d3", fontFamily: "monospace", fontSize: "0.72rem", letterSpacing: "0.15em", marginBottom: "1.5rem", textTransform: "uppercase" }}>
          {todo ? "Edit To Do" : "New To Do"}
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={fieldLabel}>Title</label>
          <input autoFocus value={form.title} onChange={e => set("title", e.target.value)}
            placeholder="What needs to be done?" style={fieldInput}
            onFocus={e => { e.currentTarget.style.borderColor = "#c9a96e"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "#a8a29c"; }} />
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={fieldLabel}>Description</label>
          <textarea value={form.description} onChange={e => set("description", e.target.value)}
            placeholder="Additional notes or context..." rows={2}
            style={{ ...fieldInput, resize: "vertical" }}
            onFocus={e => { e.currentTarget.style.borderColor = "#c9a96e"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "#a8a29c"; }} />
        </div>

        <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Status</label>
            <select value={form.status} onChange={e => set("status", e.target.value)} style={fieldSelect}>
              {STATUS_COLUMNS.map(col => <option key={col.key} value={col.key}>{col.label}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Priority</label>
            <select value={form.priority} onChange={e => set("priority", e.target.value)} style={fieldSelect}>
              {["low", "medium", "high", "urgent"].map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Due Date</label>
            <DatePicker
              selected={form.dueDate ? new Date(form.dueDate) : null}
              onChange={date => set("dueDate", date ? date.toISOString() : null)}
              dateFormat="MMM d, yyyy"
              customInput={<DueDateBtn value={form.dueDate ? new Date(form.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null} />}
              popperPlacement="bottom-start"
              isClearable
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Assignee</label>
            <AssigneeInput
              value={form.assignee}
              onChange={v => set("assignee", v)}
              placeholder="Homeowner, contractor..."
              style={fieldInput}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Est. Cost ($)</label>
            <input type="number" min="0" step="0.01" value={form.estimatedCost}
              onChange={e => set("estimatedCost", e.target.value)} placeholder="0.00" style={fieldInput}
              onFocus={e => { e.currentTarget.style.borderColor = "#c9a96e"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "#a8a29c"; }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Room</label>
            <select
              value={form.linkedRoom || ""}
              style={fieldSelect}
              onChange={e => {
                const val = e.target.value || null;
                set("linkedRoom", val);
                // system takes priority for linkedCategory; only fall back to room when no system
                if (!form.linkedSystem) set("linkedCategory", val);
                set("linkedItem", null);
              }}>
              <option value="">None</option>
              {roomOptions.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>System</label>
            <select
              value={form.linkedSystem || ""}
              style={fieldSelect}
              onChange={e => {
                const val = e.target.value || null;
                set("linkedSystem", val);
                // system always wins for linkedCategory (determines item dropdown source)
                set("linkedCategory", val || form.linkedRoom || null);
              }}>
              <option value="">None</option>
              {systemOptions.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Item</label>
            <select value={form.linkedItem || ""} onChange={e => set("linkedItem", e.target.value || null)}
              style={{ ...fieldSelect, opacity: !hasItemContext ? 0.4 : 1 }} disabled={!hasItemContext}>
              <option value="">—</option>
              {linkedItems.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
        </div>

        {(exteriorOptions.length > 0 || structureOptions.length > 0) && (
          <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
            {exteriorOptions.length > 0 && (
              <div style={{ flex: 1 }}>
                <label style={fieldLabel}>Exterior</label>
                <select
                  value={form.linkedExterior || ""}
                  style={fieldSelect}
                  onChange={e => set("linkedExterior", e.target.value || null)}>
                  <option value="">None</option>
                  {exteriorOptions.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
            )}
            {structureOptions.length > 0 && (
              <div style={{ flex: 1 }}>
                <label style={fieldLabel}>Structure</label>
                <select
                  value={form.linkedStructure || ""}
                  style={fieldSelect}
                  onChange={e => set("linkedStructure", e.target.value || null)}>
                  <option value="">None</option>
                  {structureOptions.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
            )}
            <div style={{ flex: 1 }} />
          </div>
        )}

        <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Project</label>
            <select value={form.projectId || ""} onChange={e => set("projectId", e.target.value || null)} style={fieldSelect}>
              <option value="">None</option>
              {(projects || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        {/* Floor Plan Location */}
        <div style={{ marginBottom: "1rem" }}>
          <label style={fieldLabel}>Floor Plan</label>
          <div style={{ alignItems: "center", display: "flex", gap: "0.5rem" }}>
            {fpLocationLabel ? (
              <>
                <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-sans)", fontSize: "0.75rem" }}>
                  {fpLocationLabel}
                </span>
                <button
                  onClick={() => setShowPicker(true)}
                  style={{ background: "none", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", padding: "0.1rem 0.3rem", transition: "color 0.12s" }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-mute)"}
                >Move</button>
                <button
                  onClick={() => set("floorPlanLocation", null)}
                  style={{ background: "none", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", padding: "0.1rem 0.2rem", transition: "color 0.12s" }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-mute)"}
                >×</button>
              </>
            ) : (
              <>
                <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.75rem", fontStyle: "italic" }}>
                  Not placed
                </span>
                <button
                  onClick={() => setShowPicker(true)}
                  style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.04em", padding: "0.2rem 0.5rem", transition: "all 0.12s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
                >Set Location</button>
              </>
            )}
          </div>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={fieldLabel}>Labels</label>
          <input
            value={form.labels.join(", ")}
            onChange={e => set("labels", e.target.value.split(",").map(l => l.trim()).filter(Boolean))}
            placeholder="Plumbing, Seasonal, Cosmetic..." style={fieldInput}
            onFocus={e => { e.currentTarget.style.borderColor = "#c9a96e"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "#a8a29c"; }} />
          <span style={{ color: "#a8a29c", fontFamily: "monospace", fontSize: "0.6rem", marginTop: "0.25rem", display: "block" }}>
            Comma-separated
          </span>
        </div>

        {/* Checklist */}
        <div style={{ borderTop: "1px solid #1e2330", marginBottom: "1rem", paddingTop: "0.85rem" }}>
          <label style={{ ...fieldLabel, marginBottom: "0.5rem" }}>Checklist</label>
          {form.tasks.map(task => (
            <div key={task.id} style={{ alignItems: "center", display: "flex", gap: "0.5rem", marginBottom: "0.3rem" }}>
              <TaskCheckbox completed={task.completed} onToggle={() => handleToggleTask(task.id)} />
              <span style={{ color: task.completed ? "#6b7280" : "#d1cfc9", flex: 1, fontFamily: "var(--fm-sans, system-ui, sans-serif)", fontSize: "0.75rem", textDecoration: task.completed ? "line-through" : "none" }}>{task.title}</span>
              <button onClick={() => handleDeleteTask(task.id)} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontFamily: "monospace", fontSize: "0.7rem", padding: "0 0.1rem", transition: "color 0.15s" }} onMouseEnter={e => { e.currentTarget.style.color = "#f87171"; }} onMouseLeave={e => { e.currentTarget.style.color = "#6b7280"; }}>×</button>
            </div>
          ))}
          {addingTask ? (
            <div style={{ alignItems: "center", display: "flex", gap: "0.5rem", marginTop: "0.3rem" }}>
              <div style={{ border: "1px solid #2b3140", borderRadius: "3px", flexShrink: 0, height: 16, width: 16 }} />
              <input
                autoFocus
                value={newTaskTitle}
                onChange={e => setNewTaskTitle(e.target.value)}
                placeholder="Title"
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddTask(); } if (e.key === "Escape") { setAddingTask(false); setNewTaskTitle(""); } }}
                onBlur={handleAddTask}
                style={{ ...fieldInput, flex: 1, fontSize: "0.72rem", padding: "0.2rem 0.4rem" }}
              />
            </div>
          ) : (
            <button
              onClick={() => setAddingTask(true)}
              style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontFamily: "monospace", fontSize: "0.65rem", letterSpacing: "0.05em", marginTop: "0.25rem", padding: "0.2rem 0", transition: "color 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.color = "#c9a96e"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "#6b7280"; }}
            >+ Add</button>
          )}
        </div>

        <div style={{ borderTop: "1px solid #1e2330", marginBottom: "1.75rem", paddingTop: "1rem" }}>
          <ImageAttachments
            imageIds={form.images}
            onChange={ids => set("images", ids)}
          />
        </div>

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "space-between" }}>
          <div>
            {todo && onDelete && (
              <button onClick={() => { onDelete(); onClose(); }} style={{
                background: "transparent", border: "1px solid #f8717140", borderRadius: "3px",
                color: "#f87171", cursor: "pointer", fontFamily: "monospace", fontSize: "0.72rem",
                letterSpacing: "0.08em", padding: "0.4rem 0.9rem", transition: "all 0.15s",
              }}
                onMouseEnter={e => { e.currentTarget.style.background = "#f8717118"; e.currentTarget.style.borderColor = "#f87171"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "#f8717140"; }}>
                Delete
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button onClick={onClose} style={{
              background: "transparent", border: "1px solid #a8a29c", borderRadius: "3px",
              color: "#8b7d6b", cursor: "pointer", fontFamily: "monospace", fontSize: "0.72rem",
              letterSpacing: "0.08em", padding: "0.4rem 0.9rem", transition: "all 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#a8a29c"; e.currentTarget.style.color = "#e8e4dd"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#a8a29c"; e.currentTarget.style.color = "#8b7d6b"; }}>
              Cancel
            </button>
            <button
              onClick={() => { if (form.title.trim()) onSave({ ...form, estimatedCost: form.estimatedCost !== "" ? parseFloat(form.estimatedCost) : null }); }}
              disabled={!form.title.trim()}
              style={{
                background: form.title.trim() ? "#c9a96e18" : "transparent",
                border: `1px solid ${form.title.trim() ? "#c9a96e40" : "#a8a29c"}`,
                borderRadius: "3px", color: form.title.trim() ? "#c9a96e" : "#a8a29c",
                cursor: form.title.trim() ? "pointer" : "default", fontFamily: "monospace",
                fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 0.9rem", transition: "all 0.15s",
              }}
              onMouseEnter={e => { if (form.title.trim()) { e.currentTarget.style.background = "#c9a96e30"; e.currentTarget.style.borderColor = "#c9a96e"; }}}
              onMouseLeave={e => { if (form.title.trim()) { e.currentTarget.style.background = "#c9a96e18"; e.currentTarget.style.borderColor = "#c9a96e40"; }}}>
              {todo ? "Save Changes" : "Create To Do"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <>
      {modal}
      {showPicker && (
        <LocationPickerModal
          initialLocation={form.floorPlanLocation}
          onConfirm={handleLocationConfirm}
          onCancel={() => setShowPicker(false)}
        />
      )}
    </>
  );
}
