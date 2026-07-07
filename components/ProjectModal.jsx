import { useState } from "react";
import { createPortal } from "react-dom";
import useIsMobile from "../src/hooks/useIsMobile.js";
import { sheetOverlay, sheetPanel } from "./ModalShared.jsx";
import DatePicker from "react-datepicker";
import AssigneeInput from "./AssigneeInput.jsx";
import ImageAttachments from "./ImageAttachments.jsx";
import { fieldLabel, fieldInput, fieldSelect, DueDateBtn } from "./ModalShared.jsx";

export default function ProjectModal({ project, categories, categoryItems, onSave, onClose }) {
  const isMobile = useIsMobile();
  const [form, setForm] = useState(project ? {
    ...project,
    estimatedCostText: project.estimatedCost != null ? String(project.estimatedCost) : "",
    labelsText: (project.labels || []).join(", "),
    images: project.images || [],
  } : {
    name: "", description: "", status: "not-started", priority: "medium",
    dueDate: null, assignee: "", estimatedCostText: "",
    linkedCategory: null, linkedItem: null, labelsText: "", tasks: [], images: [],
  });

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }));
  const linkedItems = form.linkedCategory ? (categoryItems[form.linkedCategory] || []) : [];

  function handleSave() {
    if (!form.name.trim()) return;
    const estimatedCost = form.estimatedCostText !== "" ? parseFloat(form.estimatedCostText) : null;
    const labels = form.labelsText.split(",").map(l => l.trim()).filter(Boolean);
    onSave({ ...form, estimatedCost: isNaN(estimatedCost) ? null : estimatedCost, labels });
  }

  return createPortal(
    <div
      onClick={onClose}
      style={{
        alignItems: "center", background: "rgba(0,0,0,0.7)", bottom: 0,
        display: "flex", justifyContent: "center", left: 0,
        position: "fixed", right: 0, top: 0, zIndex: 1100,
        ...(isMobile ? sheetOverlay : null),
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={isMobile ? "fm-sheet-panel" : undefined}
        style={{
          background: "#1a1f2e", border: "1px solid #a8a29c", borderRadius: "8px",
          maxHeight: "90vh", maxWidth: 540, overflowY: "auto", padding: "2rem", width: "90%",
          ...(isMobile ? sheetPanel : null),
        }}
      >
        <div style={{ color: "#f0e6d3", fontFamily: "monospace", fontSize: "0.72rem", letterSpacing: "0.15em", marginBottom: "1.5rem", textTransform: "uppercase" }}>
          {project ? "Edit Project" : "New Project"}
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={fieldLabel}>Name</label>
          <input autoFocus value={form.name} onChange={e => set("name", e.target.value)}
            placeholder="Project name" style={fieldInput}
            onFocus={e => { e.currentTarget.style.borderColor = "#c9a96e"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "#a8a29c"; }} />
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={fieldLabel}>Description</label>
          <textarea value={form.description} onChange={e => set("description", e.target.value)}
            placeholder="Scope, notes, context..." rows={3}
            style={{ ...fieldInput, resize: "vertical" }}
            onFocus={e => { e.currentTarget.style.borderColor = "#c9a96e"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "#a8a29c"; }} />
        </div>

        <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Status</label>
            <select value={form.status} onChange={e => set("status", e.target.value)} style={fieldSelect}>
              <option value="not-started">Not Started</option>
              <option value="in-progress">In Progress</option>
              <option value="done">Done</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Priority</label>
            <select value={form.priority} onChange={e => set("priority", e.target.value)} style={fieldSelect}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
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
            <input type="number" min="0" step="0.01" value={form.estimatedCostText}
              onChange={e => set("estimatedCostText", e.target.value)} placeholder="0.00" style={fieldInput}
              onFocus={e => { e.currentTarget.style.borderColor = "#c9a96e"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "#a8a29c"; }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Category</label>
            <select value={form.linkedCategory || ""} style={fieldSelect}
              onChange={e => { set("linkedCategory", e.target.value || null); set("linkedItem", null); }}>
              <option value="">None</option>
              {(categories || []).map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>Item</label>
            <select value={form.linkedItem || ""} onChange={e => set("linkedItem", e.target.value || null)}
              style={{ ...fieldSelect, opacity: !form.linkedCategory ? 0.4 : 1 }} disabled={!form.linkedCategory}>
              <option value="">Category-level</option>
              {linkedItems.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={fieldLabel}>Labels</label>
          <input
            value={form.labelsText}
            onChange={e => set("labelsText", e.target.value)}
            placeholder="Renovation, Seasonal..." style={fieldInput}
            onFocus={e => { e.currentTarget.style.borderColor = "#c9a96e"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "#a8a29c"; }} />
          <span style={{ color: "#a8a29c", fontFamily: "monospace", fontSize: "0.6rem", marginTop: "0.25rem", display: "block" }}>
            Comma-separated
          </span>
        </div>

        <div style={{ borderTop: "1px solid #1e2330", marginBottom: "1.75rem", paddingTop: "1rem" }}>
          <ImageAttachments
            imageIds={form.images}
            onChange={ids => set("images", ids)}
          />
        </div>

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            background: "transparent", border: "1px solid #a8a29c", borderRadius: "3px",
            color: "#8b7d6b", cursor: "pointer", fontFamily: "monospace", fontSize: "0.72rem",
            letterSpacing: "0.08em", padding: "0.4rem 0.9rem", transition: "all 0.15s",
          }}
            onMouseEnter={e => { e.currentTarget.style.color = "#e8e4dd"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#8b7d6b"; }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!form.name.trim()}
            style={{
              background: form.name.trim() ? "#c9a96e18" : "transparent",
              border: `1px solid ${form.name.trim() ? "#c9a96e40" : "#a8a29c"}`,
              borderRadius: "3px", color: form.name.trim() ? "#c9a96e" : "#a8a29c",
              cursor: form.name.trim() ? "pointer" : "default", fontFamily: "monospace",
              fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 0.9rem", transition: "all 0.15s",
            }}
            onMouseEnter={e => { if (form.name.trim()) { e.currentTarget.style.background = "#c9a96e30"; e.currentTarget.style.borderColor = "#c9a96e"; }}}
            onMouseLeave={e => { if (form.name.trim()) { e.currentTarget.style.background = "#c9a96e18"; e.currentTarget.style.borderColor = "#c9a96e40"; }}}>
            {project ? "Save Changes" : "Create Project"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
