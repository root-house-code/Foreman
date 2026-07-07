import { useState, useMemo } from "react";
import FollowButton from "./FollowButton.jsx";
import { SEASON_OPTIONS } from "../lib/scheduleOptions.js";
import useIsMobile from "../src/hooks/useIsMobile.js";
import { sheetOverlay, sheetPanel } from "./ModalShared.jsx";

const MAINTENANCE_SCHEDULE_OPTIONS = [
  "Monthly", "Every 3 months", "Every 6 months", "Twice a year", "Annually",
  "Every 2–3 years", "Every 3–5 years", "Every 5–7 years", "Every 5–10 years", "Every 10 years",
  "As needed",
];

const inputStyle = {
  background: "#1a1f2e", border: "1px solid #a8a29c", borderRadius: "2px",
  boxSizing: "border-box", color: "#e8e4dd", fontFamily: "monospace",
  fontSize: "0.8rem", outline: "none", padding: "0.35rem 0.5rem", width: "100%",
};
const labelStyle = {
  color: "#a8a29c", display: "block", fontFamily: "monospace", fontSize: "0.62rem",
  letterSpacing: "0.1em", marginBottom: "0.25rem", textTransform: "uppercase",
};
const selectStyle = {
  ...inputStyle, appearance: "none", cursor: "pointer",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235a5460'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat", backgroundPosition: "right 0.5rem center", paddingRight: "1.5rem",
};

function ComboField({ label, value, suggestions, open, onInputChange, onFocus, onBlur, onSelect, placeholder, autoFocus, disabled }) {
  return (
    <div style={{ position: "relative" }}>
      <label style={labelStyle}>{label}</label>
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={e => !disabled && onInputChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        style={{ ...inputStyle, color: disabled ? "#5a5460" : "#e8e4dd", cursor: disabled ? "default" : "text" }}
      />
      {open && !disabled && suggestions.length > 0 && (
        <div style={{ background: "#13161f", border: "1px solid #a8a29c", borderRadius: "2px", left: 0, maxHeight: "140px", overflowY: "auto", position: "absolute", right: 0, top: "calc(100% + 2px)", zIndex: 20 }}>
          {suggestions.map(s => (
            <div
              key={s}
              onMouseDown={e => { e.preventDefault(); onSelect(s); }}
              style={{ color: "#e8e4dd", cursor: "pointer", fontFamily: "monospace", fontSize: "0.78rem", padding: "0.35rem 0.5rem" }}
              onMouseEnter={e => e.currentTarget.style.background = "#1a1f2e"}
              onMouseLeave={e => e.currentTarget.style.background = ""}
            >{s}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AddTaskModal({ categories = [], rows = [], onSave, onClose, initialCategory = "", initialItem = "", lockCategoryItem = false }) {
  const isMobile = useIsMobile();
  const [form, setForm] = useState({
    category:      initialCategory || (categories[0] ?? ""),
    item:          initialItem || "",
    task:          "",
    schedule:      "Annually",
    season:        null,
    lastCompleted: "",
    nextDate:      "",
    followSchedule: false,
    notes:         "",
  });
  const [customSchedule, setCustomSchedule]       = useState("");
  const [useCustomSchedule, setUseCustomSchedule] = useState(false);
  const [catInput, setCatInput]                   = useState(initialCategory || (categories[0] ?? ""));
  const [catOpen, setCatOpen]                     = useState(false);
  const [itemInput, setItemInput]                 = useState(initialItem || "");
  const [itemOpen, setItemOpen]                   = useState(false);
  const [taskInput, setTaskInput]                 = useState("");
  const [taskOpen, setTaskOpen]                   = useState(false);

  function set(field, val) { setForm(prev => ({ ...prev, [field]: val })); }

  const itemsForCategory = useMemo(() => {
    const seen = new Set();
    rows.forEach(row => {
      if (row.category === form.category && row.item && !row._isBlankCategory) seen.add(row.item);
    });
    return [...seen].sort();
  }, [rows, form.category]);

  const taskSuggestions = useMemo(() => {
    if (!form.item) return [];
    const seen = new Set();
    rows.forEach(row => {
      if (row.category === form.category && row.item === form.item && row.task) seen.add(row.task);
    });
    return [...seen].sort();
  }, [rows, form.category, form.item]);

  const catSuggestions = categories.filter(c =>
    c.toLowerCase().includes(catInput.toLowerCase()) && c !== form.category
  );
  const itemSuggestions = itemsForCategory.filter(i =>
    i.toLowerCase().includes(itemInput.toLowerCase()) && i !== form.item
  );
  const filteredTaskSugs = taskSuggestions.filter(t =>
    t.toLowerCase().includes(taskInput.toLowerCase()) && t !== form.task
  );

  function commitCategory(val) {
    if (lockCategoryItem) return;
    const v = val.trim();
    setCatInput(v); set("category", v); setCatOpen(false);
    setItemInput(""); set("item", ""); setTaskInput(""); set("task", "");
  }
  function commitItem(val) {
    if (lockCategoryItem) return;
    const v = val.trim();
    setItemInput(v); set("item", v); setItemOpen(false);
    setTaskInput(""); set("task", "");
  }
  function commitTask(val) {
    const v = val.trim();
    setTaskInput(v); set("task", v); setTaskOpen(false);
  }

  const effectiveSchedule = useCustomSchedule ? customSchedule.trim() : form.schedule;
  const canSave = form.category.trim() && form.item.trim() && form.task.trim() && effectiveSchedule;

  return (
    <div
      style={{ alignItems: "center", background: "rgba(0,0,0,0.7)", bottom: 0, display: "flex", justifyContent: "center", left: 0, position: "fixed", right: 0, top: 0, zIndex: 200, ...(isMobile ? sheetOverlay : null) }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={isMobile ? "fm-sheet-panel" : undefined} style={{ background: "#0f1117", border: "1px solid #a8a29c", borderRadius: "6px", maxWidth: 560, padding: "1.75rem 2rem", width: "90%", ...(isMobile ? sheetPanel : null) }}>
        <div style={{ color: "#8b7d6b", fontFamily: "monospace", fontSize: "0.6rem", letterSpacing: "0.15em", marginBottom: "1.5rem", textTransform: "uppercase" }}>
          New Maintenance Task
          {lockCategoryItem && (
            <span style={{ color: "#5a5460", marginLeft: "0.75rem", textTransform: "none", letterSpacing: "normal", fontSize: "0.65rem" }}>
              {initialItem} — {initialCategory}
            </span>
          )}
        </div>

        {/* Category + Item */}
        {!lockCategoryItem && (
          <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "1fr 1fr", marginBottom: "1rem" }}>
            <ComboField
              label="Category"
              value={catInput}
              suggestions={catSuggestions}
              open={catOpen}
              autoFocus
              placeholder="e.g. Kitchen"
              onInputChange={v => { setCatInput(v); set("category", v); setCatOpen(true); }}
              onFocus={() => setCatOpen(true)}
              onBlur={() => setTimeout(() => { commitCategory(catInput); setCatOpen(false); }, 120)}
              onSelect={commitCategory}
            />
            <ComboField
              label="Item"
              value={itemInput}
              suggestions={itemSuggestions}
              open={itemOpen}
              placeholder={form.category ? "e.g. Dishwasher" : "Select category first"}
              onInputChange={v => { setItemInput(v); set("item", v); setItemOpen(true); }}
              onFocus={() => setItemOpen(true)}
              onBlur={() => setTimeout(() => { commitItem(itemInput); setItemOpen(false); }, 120)}
              onSelect={commitItem}
            />
          </div>
        )}

        {/* Task name */}
        <div style={{ marginBottom: "1rem" }}>
          <ComboField
            label="Type of Maintenance"
            value={taskInput}
            suggestions={filteredTaskSugs}
            open={taskOpen}
            autoFocus={lockCategoryItem}
            placeholder="e.g. Clean filter and spray arms"
            onInputChange={v => { setTaskInput(v); set("task", v); setTaskOpen(true); }}
            onFocus={() => setTaskOpen(true)}
            onBlur={() => setTimeout(() => { commitTask(taskInput); setTaskOpen(false); }, 120)}
            onSelect={commitTask}
          />
        </div>

        {/* Schedule + Season */}
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "1fr 1fr", marginBottom: "1rem" }}>
          <div>
            <label style={labelStyle}>Schedule</label>
            <select
              value={useCustomSchedule ? "__custom__" : form.schedule}
              onChange={e => {
                if (e.target.value === "__custom__") { setUseCustomSchedule(true); }
                else { setUseCustomSchedule(false); set("schedule", e.target.value); }
              }}
              style={selectStyle}
            >
              {MAINTENANCE_SCHEDULE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              <option value="__custom__">Custom…</option>
            </select>
            {useCustomSchedule && (
              <input
                autoFocus
                value={customSchedule}
                onChange={e => setCustomSchedule(e.target.value)}
                placeholder="e.g. Every 3–5 years"
                style={{ ...inputStyle, marginTop: "0.4rem" }}
              />
            )}
          </div>
          <div>
            <label style={labelStyle}>Season</label>
            <select value={form.season ?? ""} onChange={e => set("season", e.target.value || null)} style={selectStyle}>
              {SEASON_OPTIONS.map(({ value, label }) => (
                <option key={label} value={value ?? ""}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Last Completed + Next Date */}
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "1fr 1fr", marginBottom: "1rem" }}>
          <div>
            <label style={labelStyle}>Last Completed</label>
            <input
              type="date"
              value={form.lastCompleted || ""}
              onChange={e => set("lastCompleted", e.target.value || "")}
              style={{ ...inputStyle, colorScheme: "dark", color: form.lastCompleted ? "#e8e4dd" : "#5a5460" }}
              onFocus={e => e.currentTarget.style.borderColor = "#c9a96e"}
              onBlur={e => e.currentTarget.style.borderColor = "#a8a29c"}
            />
          </div>
          <div>
            <label style={labelStyle}>Next Date</label>
            <div style={{ alignItems: "center", display: "flex", gap: "0.4rem" }}>
              <input
                type="date"
                value={form.nextDate || ""}
                onChange={e => set("nextDate", e.target.value || "")}
                style={{ ...inputStyle, colorScheme: "dark", color: form.nextDate ? "#e8e4dd" : "#5a5460", flex: 1 }}
                onFocus={e => e.currentTarget.style.borderColor = "#c9a96e"}
                onBlur={e => e.currentTarget.style.borderColor = "#a8a29c"}
              />
              <FollowButton
                schedule={effectiveSchedule}
                checked={form.followSchedule}
                onToggle={() => set("followSchedule", !form.followSchedule)}
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={labelStyle}>Notes</label>
          <input
            value={form.notes || ""}
            onChange={e => set("notes", e.target.value)}
            placeholder="Optional notes…"
            style={inputStyle}
            onFocus={e => e.currentTarget.style.borderColor = "#c9a96e"}
            onBlur={e => e.currentTarget.style.borderColor = "#a8a29c"}
          />
        </div>

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "1px solid #a8a29c", borderRadius: "3px", color: "#a8a29c", cursor: "pointer", fontFamily: "monospace", fontSize: "0.78rem", padding: "0.45rem 1rem", transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.color = "#8b7d6b"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#a8a29c"; }}
          >Cancel</button>
          <button
            onClick={() => canSave && onSave({ ...form, schedule: effectiveSchedule })}
            disabled={!canSave}
            style={{ background: canSave ? "#c9a96e22" : "transparent", border: `1px solid ${canSave ? "#c9a96e" : "#a8a29c"}`, borderRadius: "3px", color: canSave ? "#c9a96e" : "#a8a29c", cursor: canSave ? "pointer" : "default", fontFamily: "monospace", fontSize: "0.78rem", padding: "0.45rem 1rem", transition: "all 0.15s" }}
          >Add Task</button>
        </div>
      </div>
    </div>
  );
}
