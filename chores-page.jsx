import { useState, useMemo, useEffect } from "react";
import FmHeader from "./src/components/FmHeader.jsx";
import FmSubnav from "./src/components/FmSubnav.jsx";
import AssigneeInput from "./components/AssigneeInput.jsx";
import SelectCell from "./components/SelectCell.jsx";
import SchedulePicker from "./components/SchedulePicker.jsx";
import ReminderButton from "./components/ReminderButton.jsx";
import ReminderSettings from "./components/ReminderSettings.jsx";
import { getScheduleColor } from "./lib/scheduleColor.js";
import { parseMonths } from "./lib/scheduleInterval.js";
import {
  loadChores, saveChores, createChore,
  loadChoreNextDates, saveChoreNextDates,
  loadChoreCompletedDates, saveChoreCompletedDates,
  loadChoreNotes, saveChoreNotes,
  computeChoreNextDate, computeNextOccurrenceFromStart,
} from "./lib/chores.js";
import { loadData, loadCustomData, saveCustomData } from "./lib/data.js";
import { loadDeletedCategories } from "./lib/deletedCategories.js";
import { loadDeletedItems } from "./lib/deletedItems.js";
import { loadRoomCategories, loadRoomSubtypes, formatRoomLabel } from "./lib/categoryTypes.js";
import { loadRooms } from "./lib/rooms.js";
import {
  loadChoreCompletions, saveChoreCompletions, isChoreCompleted, toggleChoreCompletion,
  saveChoreCompletionRecord,
} from "./lib/choreCompletions.js";
import ChoreDetailModal from "./components/ChoreDetailModal.jsx";
import {
  loadChoreReminderModes, saveChoreReminderModes,
  loadReminderModes, REMINDER_MODES, syncReminders,
} from "./lib/reminders.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const ROOM_ORDER = [
  "Whole House", "Kitchen", "Bathrooms", "Bedroom", "Living Room",
  "Dining Room", "Office", "Laundry", "Garage", "Basement",
];

function buildRoomOptions() {
  const fromInventory = loadRoomCategories();
  const subtypes = loadRoomSubtypes();
  const all = ["Whole House", ...fromInventory.filter(r => r !== "Whole House")];
  return all
    .sort((a, b) => {
      if (a === "Whole House") return -1;
      if (b === "Whole House") return 1;
      const aRank = ROOM_ORDER.indexOf(a);
      const bRank = ROOM_ORDER.indexOf(b);
      if (aRank !== -1 && bRank !== -1) return aRank - bRank;
      if (aRank !== -1) return -1;
      if (bRank !== -1) return 1;
      return a.localeCompare(b);
    })
    .map(r => ({ value: r, label: formatRoomLabel(r, subtypes).replace(/\s*\[.*?\]$/, "") }));
}

function buildRoomItemsMap() {
  const rows = loadData();
  const deleted = loadDeletedCategories();
  const deletedItems = loadDeletedItems();
  const map = {};
  rows.forEach(row => {
    if (!row.category || !row.item || row._isBlankCategory) return;
    if (!row._isCustom && deleted.has(row.category)) return;
    if (deletedItems.has(`${row.category}|${row.item}`)) return;
    if (!map[row.category]) map[row.category] = [];
    if (!map[row.category].includes(row.item)) map[row.category].push(row.item);
  });
  return map;
}

const DAY_OPTIONS = [
  { value: null, label: "Any" },
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const TIME_OPTIONS = [
  { value: null,    label: "Any time" },
  { value: "06:00", label: "6:00 AM"  },
  { value: "07:00", label: "7:00 AM"  },
  { value: "08:00", label: "8:00 AM"  },
  { value: "09:00", label: "9:00 AM"  },
  { value: "10:00", label: "10:00 AM" },
  { value: "11:00", label: "11:00 AM" },
  { value: "12:00", label: "12:00 PM" },
  { value: "13:00", label: "1:00 PM"  },
  { value: "14:00", label: "2:00 PM"  },
  { value: "15:00", label: "3:00 PM"  },
  { value: "16:00", label: "4:00 PM"  },
  { value: "17:00", label: "5:00 PM"  },
  { value: "18:00", label: "6:00 PM"  },
  { value: "19:00", label: "7:00 PM"  },
  { value: "20:00", label: "8:00 PM"  },
  { value: "21:00", label: "9:00 PM"  },
];

const FREQ_ITEMS = [
  { label: "Weekly / Monthly",  color: "#4ade80" },
  { label: "Every 3–6 months",  color: "#4ade80" },
  { label: "Twice a year",      color: "#60a5fa" },
  { label: "Annually",          color: "#f59e0b" },
  { label: "Every 2–10 years",  color: "#c084fc" },
  { label: "As needed",         color: "#a8a29c" },
];

const MODAL_SCHEDULE_OPTIONS = [
  { value: "every 1 days",    label: "Daily"           },
  { value: "every 1 weeks",   label: "Every week"      },
  { value: "every 2 weeks",   label: "Every 2 weeks"   },
  { value: "every 3 weeks",   label: "Every 3 weeks"   },
  { value: "every 1 months",  label: "Every month"     },
  { value: "every 2 months",  label: "Every 2 months"  },
  { value: "every 3 months",  label: "Every 3 months"  },
  { value: "every 6 months",  label: "Every 6 months"  },
  { value: "every 1 years",   label: "Every year"      },
];

const STRIP_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeOfDay(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function getMonthOccurrences(startDate, schedule, dayOfWeek, viewYear, viewMonth) {
  if (!startDate || !schedule) return new Set();

  let anchor = new Date(startDate);
  anchor.setHours(0, 0, 0, 0);
  if (dayOfWeek !== null && dayOfWeek !== undefined) {
    const snap = (dayOfWeek - anchor.getDay() + 7) % 7;
    if (snap > 0) anchor.setDate(anchor.getDate() + snap);
  }

  const monthStart = new Date(viewYear, viewMonth, 1);
  const monthEnd   = new Date(viewYear, viewMonth + 1, 0);
  if (anchor > monthEnd) return new Set();

  const s = schedule.toLowerCase();
  const dm = s.match(/every\s+(\d+)\s*days?/);
  const wm = s.match(/every\s+(\d+)\s*weeks?/);
  const mm = s.match(/every\s+(\d+)\s*months?/);
  const ym = s.match(/every\s+(\d+)\s*years?/);

  function step(d) {
    const n = new Date(d);
    if      (dm) n.setDate(n.getDate() + parseInt(dm[1]));
    else if (wm) n.setDate(n.getDate() + parseInt(wm[1]) * 7);
    else if (mm) n.setMonth(n.getMonth() + parseInt(mm[1]));
    else if (ym) n.setFullYear(n.getFullYear() + parseInt(ym[1]));
    else         n.setDate(n.getDate() + 7);
    return n;
  }

  let cur = new Date(anchor);
  let safety = 0;
  while (cur < monthStart && safety++ < 2000) cur = step(cur);

  const result = new Set();
  safety = 0;
  while (cur <= monthEnd && safety++ < 60) {
    result.add(cur.getDate());
    cur = step(cur);
  }
  return result;
}

function isChoreOnDate(chore, date) {
  if (!chore.startDate || !chore.schedule) return false;
  return getMonthOccurrences(
    chore.startDate, chore.schedule, chore.dayOfWeek,
    date.getFullYear(), date.getMonth()
  ).has(date.getDate());
}

function choreStatus(nextDateStr) {
  if (!nextDateStr) return { dot: "var(--fm-ink-mute)", text: "—" };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const nd = new Date(nextDateStr); nd.setHours(0, 0, 0, 0);
  const diff = Math.round((nd - today) / 86400000);
  if (diff < 0)  return { dot: "var(--fm-red)",   text: `${Math.abs(diff)}d late` };
  if (diff === 0) return { dot: "var(--fm-amber)", text: "today" };
  if (diff <= 7)  return { dot: "var(--fm-amber)", text: `in ${diff}d` };
  return { dot: "var(--fm-green)", text: `in ${diff}d` };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TitleCell({ value, onChange, placeholder = "Chore name", suggestions = [] }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  function startEdit() { setDraft(value || ""); setEditing(true); setShowSuggestions(true); }
  function commit() { setEditing(false); setShowSuggestions(false); if (draft !== value) onChange(draft); }

  const filtered = suggestions.filter(s => s.toLowerCase().includes(draft.toLowerCase()) && s !== draft);

  if (!editing) {
    return (
      <span
        onClick={startEdit}
        style={{ color: "var(--fm-ink-dim)", cursor: "text", display: "block", fontFamily: "var(--fm-sans)", fontSize: "0.82rem", minHeight: "1.2em" }}
      >
        {value || <span style={{ color: "var(--fm-ink-mute)" }}>{placeholder}</span>}
      </span>
    );
  }
  return (
    <div style={{ position: "relative" }}>
      <input
        autoFocus
        value={draft}
        onChange={e => { setDraft(e.target.value); setShowSuggestions(true); }}
        onBlur={() => setTimeout(commit, 120)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") { setEditing(false); setShowSuggestions(false); } }}
        style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-brass)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.82rem", outline: "none", padding: "0.1rem 0.3rem", width: "100%" }}
      />
      {showSuggestions && filtered.length > 0 && (
        <div style={{ background: "var(--fm-bg-panel)", border: "var(--fm-border)", borderRadius: "var(--fm-radius)", left: 0, maxHeight: "120px", overflowY: "auto", position: "absolute", right: 0, top: "calc(100% + 2px)", zIndex: 50 }}>
          {filtered.map(s => (
            <div
              key={s}
              onMouseDown={e => { e.preventDefault(); setDraft(s); onChange(s); setEditing(false); setShowSuggestions(false); }}
              style={{ color: "var(--fm-ink)", cursor: "pointer", fontFamily: "var(--fm-sans)", fontSize: "0.78rem", padding: "0.25rem 0.4rem" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--fm-bg-raised)"}
              onMouseLeave={e => e.currentTarget.style.background = ""}
            >{s}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function DeleteConfirmModal({ chore, onConfirm, onClose }) {
  return (
    <div
      style={{ alignItems: "center", background: "rgba(0,0,0,0.65)", bottom: 0, display: "flex", justifyContent: "center", left: 0, position: "fixed", right: 0, top: 0, zIndex: 1000 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "var(--fm-bg-panel)", border: "var(--fm-border)", borderRadius: "var(--fm-radius-lg)", maxWidth: 420, padding: "1.75rem 2rem", width: "90%" }}>
        <div style={{ color: "var(--fm-red)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.15em", marginBottom: "1rem", textTransform: "uppercase" }}>
          Permanently Delete Chore
        </div>
        <p style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.82rem", margin: "0 0 0.5rem" }}>
          <strong>{chore.title || "Unnamed chore"}</strong>
        </p>
        <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-sans)", fontSize: "0.78rem", margin: "0 0 1.5rem" }}>
          This will permanently delete this chore and its history. This cannot be undone.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "var(--fm-border-2)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 1rem", transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-ink)"; e.currentTarget.style.borderColor = "var(--fm-brass)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-ink-dim)"; e.currentTarget.style.borderColor = "var(--fm-hairline2)"; }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{ background: "rgba(224,123,106,0.1)", border: "1px solid var(--fm-red)", borderRadius: "var(--fm-radius)", color: "var(--fm-red)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 1rem", transition: "background 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(224,123,106,0.2)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(224,123,106,0.1)"}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateChoreModal({ date, roomOptions, roomItemsMap = {}, onAddItemToInventory, onSave, onClose }) {
  const [form, setForm] = useState({
    title:     "",
    room:      roomOptions[0]?.value ?? "Whole House",
    item:      "",
    schedule:  "every 1 weeks",
    dayOfWeek: date ? date.getDay() : null,
    timeOfDay: null,
    assignee:  "",
    notes:     "",
  });
  const [itemInput, setItemInput]               = useState("");
  const [itemDropdownOpen, setItemDropdownOpen] = useState(false);
  const [addToInventoryPrompt, setAddToInventoryPrompt] = useState(null);

  function set(field, val) { setForm(prev => ({ ...prev, [field]: val })); }

  function handleRoomChange(room) {
    set("room", room);
    set("item", "");
    setItemInput("");
    setAddToInventoryPrompt(null);
  }

  function commitItem(val) {
    const trimmed = val.trim();
    set("item", trimmed);
    setItemInput(trimmed);
    setItemDropdownOpen(false);
    if (!trimmed || form.room === "Whole House") return;
    const roomItems = roomItemsMap[form.room] ?? [];
    if (trimmed && !roomItems.some(i => i.toLowerCase() === trimmed.toLowerCase())) {
      setAddToInventoryPrompt({ room: form.room, item: trimmed });
    } else {
      setAddToInventoryPrompt(null);
    }
  }

  const itemSuggestions = (form.room !== "Whole House" ? (roomItemsMap[form.room] ?? []) : [])
    .filter(i => i.toLowerCase().includes(itemInput.toLowerCase()));

  const dateLabel = date
    ? date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : "";
  const canSave = form.title.trim().length > 0;

  const inputStyle = {
    background: "var(--fm-bg-sunk)", border: "var(--fm-border-2)", borderRadius: "var(--fm-radius)",
    boxSizing: "border-box", color: "var(--fm-ink)", fontFamily: "var(--fm-sans)",
    fontSize: "0.82rem", outline: "none", padding: "0.35rem 0.5rem", width: "100%",
  };
  const labelStyle = {
    color: "var(--fm-brass-dim)", display: "block", fontFamily: "var(--fm-mono)", fontSize: "0.6rem",
    letterSpacing: "0.12em", marginBottom: "0.25rem", textTransform: "uppercase",
  };
  const selectStyle = {
    ...inputStyle, appearance: "none", cursor: "pointer",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235e6068'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat", backgroundPosition: "right 0.5rem center", paddingRight: "1.5rem",
  };

  return (
    <div
      style={{ alignItems: "center", background: "rgba(0,0,0,0.7)", bottom: 0, display: "flex", justifyContent: "center", left: 0, position: "fixed", right: 0, top: 0, zIndex: 200 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "var(--fm-bg-panel)", border: "var(--fm-border)", borderRadius: "var(--fm-radius-lg)", maxWidth: 480, padding: "1.75rem 2rem", width: "90%" }}>
        <div style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.15em", marginBottom: dateLabel ? "0.2rem" : "1.5rem", textTransform: "uppercase" }}>
          New Chore
        </div>
        {dateLabel && (
          <div style={{ color: "var(--fm-brass)", fontFamily: "var(--fm-serif)", fontSize: "1.05rem", marginBottom: "1.5rem" }}>
            {dateLabel}
          </div>
        )}

        <div style={{ marginBottom: "1rem" }}>
          <label style={labelStyle}>Chore Name</label>
          <input
            autoFocus
            value={form.title}
            onChange={e => set("title", e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && canSave) onSave(form, date); if (e.key === "Escape") onClose(); }}
            placeholder="e.g. Clean the toilet"
            style={inputStyle}
            onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
            onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"}
          />
        </div>

        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "1fr 1fr", marginBottom: "1rem" }}>
          <div>
            <label style={labelStyle}>Room</label>
            <select value={form.room} onChange={e => handleRoomChange(e.target.value)} style={selectStyle}>
              {roomOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div style={{ position: "relative" }}>
            <label style={labelStyle}>Item <span style={{ color: "var(--fm-ink-mute)", textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
            <input
              value={itemInput}
              onChange={e => { setItemInput(e.target.value); set("item", e.target.value.trim()); setItemDropdownOpen(true); setAddToInventoryPrompt(null); }}
              onFocus={() => setItemDropdownOpen(true)}
              onBlur={() => { setTimeout(() => { commitItem(itemInput); setItemDropdownOpen(false); }, 120); }}
              placeholder={form.room !== "Whole House" ? "e.g. Toilet" : "Select a room first"}
              disabled={form.room === "Whole House"}
              style={{ ...inputStyle, color: form.room === "Whole House" ? "var(--fm-ink-mute)" : "var(--fm-ink)" }}
            />
            {itemDropdownOpen && itemSuggestions.length > 0 && (
              <div style={{ background: "var(--fm-bg-panel)", border: "var(--fm-border)", borderRadius: "var(--fm-radius)", left: 0, maxHeight: "140px", overflowY: "auto", position: "absolute", right: 0, top: "calc(100% + 2px)", zIndex: 10 }}>
                {itemSuggestions.map(s => (
                  <div
                    key={s}
                    onMouseDown={e => { e.preventDefault(); commitItem(s); }}
                    style={{ color: "var(--fm-ink)", cursor: "pointer", fontFamily: "var(--fm-sans)", fontSize: "0.78rem", padding: "0.35rem 0.5rem" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--fm-bg-raised)"}
                    onMouseLeave={e => e.currentTarget.style.background = ""}
                  >{s}</div>
                ))}
              </div>
            )}
          </div>
        </div>

        {addToInventoryPrompt && (
          <div style={{ alignItems: "flex-start", background: "var(--fm-bg-sunk)", border: "1px solid rgba(201,169,110,0.25)", borderRadius: "var(--fm-radius)", display: "flex", gap: "0.75rem", justifyContent: "space-between", marginBottom: "1rem", padding: "0.6rem 0.75rem" }}>
            <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-sans)", fontSize: "0.72rem", lineHeight: 1.4 }}>
              <span style={{ color: "var(--fm-brass)" }}>{addToInventoryPrompt.item}</span> isn&apos;t in your {addToInventoryPrompt.room} inventory. Add it?
            </span>
            <div style={{ display: "flex", flexShrink: 0, gap: "0.4rem" }}>
              <button
                onMouseDown={e => { e.preventDefault(); onAddItemToInventory?.(addToInventoryPrompt.room, addToInventoryPrompt.item); setAddToInventoryPrompt(null); }}
                style={{ background: "var(--fm-brass-bg)", border: "1px solid var(--fm-brass)", borderRadius: "var(--fm-radius)", color: "var(--fm-brass)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.06em", padding: "0.2rem 0.5rem" }}
              >Add</button>
              <button
                onMouseDown={e => { e.preventDefault(); setAddToInventoryPrompt(null); }}
                style={{ background: "transparent", border: "var(--fm-border)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.06em", padding: "0.2rem 0.5rem" }}
              >Skip</button>
            </div>
          </div>
        )}

        <div style={{ marginBottom: "1rem" }}>
          <label style={labelStyle}>Schedule</label>
          <select value={form.schedule} onChange={e => set("schedule", e.target.value)} style={selectStyle}>
            {MODAL_SCHEDULE_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>

        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "1fr 1fr", marginBottom: "1rem" }}>
          <div>
            <label style={labelStyle}>Day</label>
            <select value={form.dayOfWeek ?? ""} onChange={e => set("dayOfWeek", e.target.value === "" ? null : parseInt(e.target.value))} style={selectStyle}>
              <option value="">Any</option>
              {DAY_OPTIONS.filter(d => d.value !== null).map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Time</label>
            <select value={form.timeOfDay ?? ""} onChange={e => set("timeOfDay", e.target.value || null)} style={selectStyle}>
              <option value="">Any time</option>
              {TIME_OPTIONS.filter(t => t.value !== null).map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={labelStyle}>Assignee</label>
          <AssigneeInput value={form.assignee} onChange={v => set("assignee", v)} placeholder="Who does this chore?" />
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <label style={labelStyle}>Notes</label>
          <textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Any notes…" rows={2}
            style={{ ...inputStyle, resize: "vertical" }}
            onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
            onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"}
          />
        </div>

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "var(--fm-border-2)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 1rem", transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
          >Cancel</button>
          <button
            onClick={() => canSave && onSave(form, date)}
            disabled={!canSave}
            style={{ background: canSave ? "var(--fm-brass-bg)" : "transparent", border: `1px solid ${canSave ? "var(--fm-brass)" : "var(--fm-hairline2)"}`, borderRadius: "var(--fm-radius)", color: canSave ? "var(--fm-brass)" : "var(--fm-ink-mute)", cursor: canSave ? "pointer" : "default", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 1rem", transition: "all 0.15s" }}
          >Add Chore</button>
        </div>
      </div>
    </div>
  );
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW_LABELS  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function MonthCalendar({ chores, choreCompletions, onChoreClick, onDayClick }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  const firstDay   = new Date(viewYear, viewMonth, 1);
  const lastDay    = new Date(viewYear, viewMonth + 1, 0);
  const leadCells  = firstDay.getDay();
  const totalCells = Math.ceil((leadCells + lastDay.getDate()) / 7) * 7;

  const cells = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - leadCells + 1;
    const date   = new Date(viewYear, viewMonth, dayNum);
    date.setHours(0, 0, 0, 0);
    return { date, dayNum, inMonth: dayNum >= 1 && dayNum <= lastDay.getDate(), isToday: date.getTime() === today.getTime() };
  });

  return (
    <div>
      {/* Month nav */}
      <div style={{ alignItems: "center", display: "flex", gap: "1rem", marginBottom: "1rem" }}>
        <button
          onClick={prevMonth}
          style={{ background: "transparent", border: "var(--fm-border-2)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", padding: "0.25rem 0.65rem", transition: "color 0.12s" }}
          onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink)"}
          onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-mute)"}
        >‹</button>
        <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "1rem", minWidth: "140px", textAlign: "center" }}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          onClick={nextMonth}
          style={{ background: "transparent", border: "var(--fm-border-2)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", padding: "0.25rem 0.65rem", transition: "color 0.12s" }}
          onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink)"}
          onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-mute)"}
        >›</button>
      </div>

      {/* DOW headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: "4px" }}>
        {DOW_LABELS.map(d => (
          <div key={d} style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.52rem", letterSpacing: "0.1em", padding: "0 0.4rem 0.3rem", textAlign: "center", textTransform: "uppercase" }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: "grid", gap: "4px", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {cells.map(({ date, dayNum, inMonth, isToday }, i) => {
          const dayChores = inMonth ? chores.filter(c => isChoreOnDate(c, date)) : [];
          return (
            <div
              key={i}
              onClick={() => inMonth && onDayClick && onDayClick(date)}
              style={{
                background: isToday ? "var(--fm-brass-bg)" : "var(--fm-bg-raised)",
                border: isToday ? "1px solid rgba(201,169,110,0.3)" : "var(--fm-border)",
                borderRadius: "var(--fm-radius)",
                cursor: inMonth && onDayClick ? "pointer" : "default",
                minHeight: "72px",
                opacity: inMonth ? 1 : 0.3,
                padding: "0.35rem 0.4rem",
              }}
            >
              <div style={{ color: isToday ? "var(--fm-brass)" : "var(--fm-ink-dim)", fontFamily: "var(--fm-serif)", fontSize: "0.82rem", lineHeight: 1, marginBottom: "0.25rem" }}>
                {inMonth ? dayNum : date.getDate()}
              </div>
              {dayChores.map(chore => {
                const done = isChoreCompleted(choreCompletions, chore.id, date);
                return (
                  <div
                    key={chore.id}
                    onClick={e => { e.stopPropagation(); onChoreClick(chore, date); }}
                    title={chore.title}
                    style={{
                      background: "var(--fm-bg-sunk)",
                      borderLeft: `3px solid ${done ? "var(--fm-ink-mute)" : "var(--fm-cyan)"}`,
                      borderRadius: "var(--fm-radius)",
                      cursor: "pointer",
                      marginBottom: "2px",
                      opacity: done ? 0.5 : 1,
                      padding: "0.1rem 0.25rem",
                      transition: "opacity 0.12s",
                    }}
                  >
                    <span style={{ color: done ? "var(--fm-ink-mute)" : "var(--fm-ink-dim)", display: "block", fontFamily: "var(--fm-sans)", fontSize: "0.58rem", overflow: "hidden", textDecoration: done ? "line-through" : "none", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {chore.title}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekStrip({ chores, choreCompletions, onChoreClick, startDate }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startDate || today);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div style={{ display: "grid", gap: "6px", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: "1.25rem" }}>
      {days.map((date, i) => {
        const isToday = date.toDateString() === today.toDateString();
        const dayChores = chores.filter(c => isChoreOnDate(c, date));
        return (
          <div
            key={i}
            style={{
              background: isToday ? "var(--fm-brass-bg)" : "var(--fm-bg-raised)",
              border: isToday ? "1px solid rgba(201,169,110,0.3)" : "var(--fm-border)",
              borderRadius: "var(--fm-radius)",
              minHeight: "80px",
              padding: "0.5rem 0.45rem",
            }}
          >
            <div style={{ color: isToday ? "var(--fm-brass)" : "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.52rem", letterSpacing: "0.1em", marginBottom: "2px", textTransform: "uppercase" }}>
              {STRIP_DAYS[date.getDay()]}
            </div>
            <div style={{ color: isToday ? "var(--fm-brass)" : "var(--fm-ink-dim)", fontFamily: "var(--fm-serif)", fontSize: "1rem", lineHeight: 1, marginBottom: "0.35rem" }}>
              {date.getDate()}
            </div>
            {dayChores.map(chore => {
              const done = isChoreCompleted(choreCompletions, chore.id, date);
              return (
                <div
                  key={chore.id}
                  onClick={() => onChoreClick(chore, date)}
                  title={chore.title}
                  style={{
                    background: "var(--fm-bg-sunk)",
                    borderLeft: `3px solid ${done ? "var(--fm-ink-mute)" : "var(--fm-cyan)"}`,
                    borderRadius: "var(--fm-radius)",
                    cursor: "pointer",
                    marginBottom: "3px",
                    opacity: done ? 0.5 : 1,
                    padding: "0.15rem 0.3rem",
                    transition: "opacity 0.12s",
                  }}
                >
                  <span style={{ color: done ? "var(--fm-ink-mute)" : "var(--fm-ink-dim)", display: "block", fontFamily: "var(--fm-sans)", fontSize: "0.6rem", overflow: "hidden", textDecoration: done ? "line-through" : "none", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {chore.title}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const TH = { color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", fontWeight: "normal", letterSpacing: "0.12em", padding: "0.65rem 0.6rem", position: "sticky", textAlign: "left", textTransform: "uppercase", top: 0, userSelect: "none", whiteSpace: "nowrap" };
const TD = { padding: "0.45rem 0.6rem", verticalAlign: "middle" };

export default function ChoresPage({ navigate, navState }) {
  const [chores, setChores]               = useState(() => loadChores());
  const [notes, setNotes]                 = useState(() => loadChoreNotes());
  const [reminderModes, setReminderModes] = useState(() => loadChoreReminderModes());
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [roomOptions]                     = useState(() => buildRoomOptions());
  const [roomItemsMap, setRoomItemsMap]   = useState(() => buildRoomItemsMap());
  const [activeTab, setActiveTab]         = useState("This week");
  const [activeRoom, setActiveRoom]       = useState("All");
  const [activeFrequencies, setActiveFrequencies] = useState(new Set());
  const [search, setSearch]               = useState("");
  const [sortCols, setSortCols]           = useState([]);
  const [confirmChore, setConfirmChore]   = useState(null);
  const [addChoreModalOpen, setAddChoreModalOpen] = useState(false);
  const [createChoreDate, setCreateChoreDate]     = useState(null);
  const [choreCompletions, setChoreCompletions] = useState(() => loadChoreCompletions());
  const [choreNextDates, setChoreNextDates] = useState(() => loadChoreNextDates());
  const [detailEvent, setDetailEvent]     = useState(null); // { chore, date }

  useEffect(() => {
    if (!navState) return;
    if (navState.search != null) setSearch(navState.search);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rooms = useMemo(() => {
    const fromInventory = new Set(roomOptions.map(o => o.value));
    fromInventory.delete("Whole House");
    chores.forEach(c => { if (c.room && c.room !== "Whole House") fromInventory.add(c.room); });
    return [...fromInventory].sort((a, b) => a.localeCompare(b));
  }, [chores, roomOptions]);

  const roomLabels = useMemo(() =>
    Object.fromEntries(roomOptions.filter(o => o.label !== o.value).map(o => [o.value, o.label])),
    [roomOptions]
  );

  // ── Sort helpers ────────────────────────────────────────────────────────────
  function handleHeaderClick(col, shiftKey) {
    setSortCols(prev => {
      if (!shiftKey || prev.length === 0) {
        const isPrimary = prev[0]?.col === col;
        return [{ col, dir: isPrimary && prev[0].dir === "asc" ? "desc" : "asc" }];
      }
      const existing = prev.find(s => s.col === col);
      const primary = prev[0];
      return [primary, { col, dir: existing ? (existing.dir === "asc" ? "desc" : "asc") : "asc" }];
    });
  }

  function getSortValue(chore, col) {
    switch (col) {
      case "room":     return (chore.room  || "").toLowerCase();
      case "title":    return (chore.title || "").toLowerCase();
      case "schedule": return parseMonths(chore.schedule) ?? 999;
      case "next":     return choreNextDates[chore.id] || "9999-99-99";
      default:         return "";
    }
  }

  function compareSortValues(av, bv, col, dir) {
    const aEmpty = av === null || av === undefined || av === "" || av === "9999-99-99";
    const bEmpty = bv === null || bv === undefined || bv === "" || bv === "9999-99-99";
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    let raw;
    if (col === "schedule") raw = av - bv;
    else raw = String(av).localeCompare(String(bv));
    return dir === "asc" ? raw : -raw;
  }

  // ── Filtered + sorted list ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const base = chores.filter(chore => {
      if (activeRoom !== "All" && chore.room !== activeRoom) return false;
      if (activeFrequencies.size > 0 && !activeFrequencies.has(getScheduleColor(chore.schedule))) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !(chore.room     || "").toLowerCase().includes(q) &&
          !(chore.title    || "").toLowerCase().includes(q) &&
          !(chore.schedule || "").toLowerCase().includes(q)
        ) return false;
      }
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
      const aRank = ROOM_ORDER.indexOf(a.room);
      const bRank = ROOM_ORDER.indexOf(b.room);
      if (aRank !== bRank) return (aRank === -1 ? 999 : aRank) - (bRank === -1 ? 999 : bRank);
      return (a.title || "").localeCompare(b.title || "");
    });
  }, [chores, activeRoom, activeFrequencies, search, sortCols, choreNextDates]); // eslint-disable-line react-hooks/exhaustive-deps

  const choreStats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const in7Days = new Date(today); in7Days.setDate(in7Days.getDate() + 7);
    let overdue = 0, thisWeek = 0;
    chores.forEach(c => {
      const nd = choreNextDates[c.id] ? new Date(choreNextDates[c.id]) : null;
      if (!nd) return;
      nd.setHours(0, 0, 0, 0);
      if (nd < today) overdue++;
      else if (nd <= in7Days) thisWeek++;
    });
    return { overdue, thisWeek };
  }, [chores, choreNextDates]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  function handleChoreEdit(id, field, value) {
    const updated = chores.map(c => c.id === id ? { ...c, [field]: value } : c);
    setChores(updated);
    saveChores(updated);
  }

  function handleAddChoreModalSave(form, date) {
    const startDate = date ? date.toISOString() : new Date().toISOString();
    const newChore = createChore({ ...form, startDate });
    const updated = [newChore, ...chores];
    setChores(updated);
    saveChores(updated);
    if (form.dayOfWeek != null && newChore.schedule) {
      const start = date ?? new Date(); start.setHours(0,0,0,0);
      const next = computeNextOccurrenceFromStart(start, newChore.schedule, newChore.dayOfWeek, newChore.timeOfDay);
      const updatedNext = { ...choreNextDates, [newChore.id]: next.toISOString() };
      saveChoreNextDates(updatedNext);
      setChoreNextDates(updatedNext);
    }
    setAddChoreModalOpen(false);
  }

  function handleAddItemToInventory(room, item) {
    const customs = loadCustomData();
    const newRow = { category: room, categoryType: "room", item, _isCustom: true };
    saveCustomData([...customs, newRow]);
    setRoomItemsMap(buildRoomItemsMap());
  }

  function handleDeleteChore(chore) {
    const updated = chores.filter(c => c.id !== chore.id);
    setChores(updated);
    saveChores(updated);
    const completed = loadChoreCompletedDates(); delete completed[chore.id]; saveChoreCompletedDates(completed);
    const next = { ...choreNextDates };           delete next[chore.id];     saveChoreNextDates(next); setChoreNextDates(next);
    const n = { ...notes };                       delete n[chore.id];        saveChoreNotes(n); setNotes(n);
    setConfirmChore(null);
  }

  function handleToggleFrequency(color) {
    setActiveFrequencies(prev => {
      const next = new Set(prev);
      next.has(color) ? next.delete(color) : next.add(color);
      return next;
    });
  }

  function handleCycleReminderMode(choreId) {
    setReminderModes(prev => {
      const cur = REMINDER_MODES.includes(prev[choreId]) ? prev[choreId] : "off";
      const nextIdx = (REMINDER_MODES.indexOf(cur) + 1) % REMINDER_MODES.length;
      const next = { ...prev, [choreId]: REMINDER_MODES[nextIdx] };
      saveChoreReminderModes(next);
      return next;
    });
  }

  function handleLogChore(choreId, date = new Date()) {
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    const wasDone = isChoreCompleted(choreCompletions, choreId, d);
    const updatedCompletions = toggleChoreCompletion(choreCompletions, choreId, d);
    saveChoreCompletions(updatedCompletions);
    setChoreCompletions(updatedCompletions);

    if (!wasDone) {
      const chore = chores.find(c => c.id === choreId);
      if (chore) {
        const nextOcc = computeChoreNextDate(d, chore.schedule, chore.dayOfWeek, chore.timeOfDay);
        const updated = { ...choreNextDates, [choreId]: nextOcc.toISOString() };
        saveChoreNextDates(updated);
        setChoreNextDates(updated);
      }
    }
  }

  function handleMarkDoneWithDetails(choreId, date, details) {
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    const updatedCompletions = toggleChoreCompletion(choreCompletions, choreId, d);
    saveChoreCompletions(updatedCompletions);
    setChoreCompletions(updatedCompletions);
    const roomLabel = details.room;
    const rooms = loadRooms();
    const matchedRoom = roomLabel ? Object.values(rooms).find(r => r.label === roomLabel) : null;
    saveChoreCompletionRecord(choreId, d, { ...details, roomId: matchedRoom?.id || null });
    const chore = chores.find(c => c.id === choreId);
    if (chore) {
      const nextOcc = computeChoreNextDate(d, chore.schedule, chore.dayOfWeek, chore.timeOfDay);
      const updated = { ...choreNextDates, [choreId]: nextOcc.toISOString() };
      saveChoreNextDates(updated);
      setChoreNextDates(updated);
    }
  }

  async function handleSyncReminders() {
    const maintenanceRows = loadData();
    let maintenanceNextDates = {};
    try { maintenanceNextDates = JSON.parse(localStorage.getItem("maintenance-next-dates") || "{}"); } catch {}
    return syncReminders({ rows: maintenanceRows, nextDates: maintenanceNextDates, modes: loadReminderModes() });
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const pillBase = {
    borderRadius: "var(--fm-radius)",
    cursor: "pointer",
    fontFamily: "var(--fm-mono)",
    fontSize: "0.6rem",
    letterSpacing: "0.08em",
    padding: "0.22rem 0.6rem",
    textTransform: "uppercase",
    transition: "all 0.12s",
  };

  const SORT_COLS = [
    { key: "title",    label: "Chore"   },
    { key: "room",     label: "Room"    },
    { key: "schedule", label: "Cadence" },
    { key: "next",     label: "Next"    },
  ];

  return (
    <div style={{ background: "var(--fm-bg)", color: "var(--fm-ink)", display: "flex", flexDirection: "column", fontFamily: "var(--fm-sans)", height: "100vh", overflow: "hidden" }}>

      {confirmChore && (
        <DeleteConfirmModal
          chore={confirmChore}
          onConfirm={() => handleDeleteChore(confirmChore)}
          onClose={() => setConfirmChore(null)}
        />
      )}

      {addChoreModalOpen && (
        <CreateChoreModal
          date={createChoreDate}
          roomOptions={roomOptions}
          roomItemsMap={roomItemsMap}
          onAddItemToInventory={handleAddItemToInventory}
          onSave={handleAddChoreModalSave}
          onClose={() => { setAddChoreModalOpen(false); setCreateChoreDate(null); }}
        />
      )}

      {detailEvent && (
        <ChoreDetailModal
          chore={detailEvent.chore}
          date={detailEvent.date}
          isDone={isChoreCompleted(choreCompletions, detailEvent.chore.id, detailEvent.date)}
          onToggleDone={() => handleLogChore(detailEvent.chore.id, detailEvent.date)}
          onMarkDone={details => handleMarkDoneWithDetails(detailEvent.chore.id, detailEvent.date, details)}
          roomItemsMap={roomItemsMap}
          onClose={() => setDetailEvent(null)}
        />
      )}

      <FmHeader active="Chores" tagline="Chores" />
      <FmSubnav
        tabs={["This week", "Next 7 days", "This month"]}
        active={activeTab}
        onTabChange={setActiveTab}
        stats={[
          { value: chores.length, label: "total" },
          { value: choreStats.overdue, color: "var(--fm-red)", label: "overdue" },
          { value: choreStats.thisWeek, color: "var(--fm-amber)", label: "this week" },
        ]}
      />

      <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem 2rem 4rem" }}>

        {activeTab === "This week" && (() => {
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const sunday = new Date(today); sunday.setDate(today.getDate() - today.getDay());
          return (
            <WeekStrip
              chores={chores}
              choreCompletions={choreCompletions}
              onChoreClick={(chore, date) => setDetailEvent({ chore, date })}
              startDate={sunday}
            />
          );
        })()}

        {activeTab === "Next 7 days" && (
          <WeekStrip
            chores={chores}
            choreCompletions={choreCompletions}
            onChoreClick={(chore, date) => setDetailEvent({ chore, date })}
          />
        )}

        {activeTab === "This month" && (
          <MonthCalendar
            chores={chores}
            choreCompletions={choreCompletions}
            onChoreClick={(chore, date) => setDetailEvent({ chore, date })}
            onDayClick={date => { setCreateChoreDate(date); setAddChoreModalOpen(true); }}
          />
        )}

        {/* Filter bar */}
        <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.85rem" }}>

          {/* Room pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
            {["All", ...rooms].map(room => {
              const isActive = activeRoom === room;
              const rawLabel = room === "All" ? "ALL" : (roomLabels[room] || room);
              const label = rawLabel.replace(/\s*\[.*?\]$/, "");
              return (
                <button
                  key={room}
                  onClick={() => setActiveRoom(room)}
                  style={{
                    ...pillBase,
                    background: isActive ? "var(--fm-brass-bg)" : "transparent",
                    border: isActive ? "1px solid rgba(201,169,110,0.5)" : "var(--fm-border-2)",
                    color: isActive ? "var(--fm-brass)" : "var(--fm-ink-mute)",
                  }}
                  onMouseEnter={e => { if (!isActive) { e.currentTarget.style.color = "var(--fm-ink-dim)"; e.currentTarget.style.borderColor = "var(--fm-ink-mute)"; } }}
                  onMouseLeave={e => { if (!isActive) { e.currentTarget.style.color = "var(--fm-ink-mute)"; e.currentTarget.style.borderColor = "var(--fm-hairline2)"; } }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div style={{ flex: 1 }} />

          {/* Search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            style={{ background: "var(--fm-bg-sunk)", border: "var(--fm-border-2)", borderRadius: "var(--fm-radius)", color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.8rem", outline: "none", padding: "0.35rem 0.7rem", transition: "border-color 0.12s", width: "200px" }}
            onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
            onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"}
          />

          <button
            onClick={() => setAddChoreModalOpen(true)}
            style={{ ...pillBase, background: "var(--fm-brass-bg)", border: "1px solid rgba(201,169,110,0.4)", color: "var(--fm-brass)" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(201,169,110,0.4)"}
          >
            + Add Chore
          </button>

          <button
            onClick={() => setRemindersOpen(true)}
            style={{ ...pillBase, background: "transparent", border: "var(--fm-border-2)", color: "var(--fm-ink-mute)" }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-ink-dim)"; e.currentTarget.style.borderColor = "var(--fm-ink-mute)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-ink-mute)"; e.currentTarget.style.borderColor = "var(--fm-hairline2)"; }}
          >
            Reminders
          </button>
        </div>

        {/* Frequency filter */}
        <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "1rem" }}>
          <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.1em", marginRight: "0.15rem", textTransform: "uppercase" }}>Freq:</span>
          {FREQ_ITEMS.map(({ label, color }) => {
            const active = activeFrequencies.has(color);
            return (
              <div
                key={label}
                onClick={() => handleToggleFrequency(color)}
                style={{ alignItems: "center", background: active ? `${color}18` : "transparent", border: `1px solid ${active ? `${color}40` : "transparent"}`, borderRadius: "var(--fm-radius)", cursor: "pointer", display: "flex", gap: "0.3rem", padding: "0.15rem 0.45rem", transition: "all 0.12s" }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--fm-bg-raised)"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ background: color, borderRadius: "50%", flexShrink: 0, height: 7, width: 7 }} />
                <span style={{ color: active ? color : "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", transition: "color 0.12s" }}>{label}</span>
              </div>
            );
          })}
          {search.trim() && (
            <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", marginLeft: "0.5rem" }}>{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
          )}
        </div>

        {/* All chores table */}
        <div style={{ background: "var(--fm-bg-panel)", border: "var(--fm-border)", borderRadius: "var(--fm-radius)", overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: "0.82rem", width: "100%" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--fm-hairline2)" }}>
                <th style={{ ...TH, width: "20px" }} />
                {SORT_COLS.map(({ key, label }) => {
                  const sort = sortCols.find(s => s.col === key);
                  const isPrimary = sort && sortCols[0]?.col === key;
                  return (
                    <th
                      key={key}
                      onClick={e => handleHeaderClick(key, e.shiftKey)}
                      style={{ ...TH, color: sort ? (isPrimary ? "var(--fm-brass)" : "var(--fm-ink-dim)") : "var(--fm-brass-dim)", cursor: "pointer" }}
                    >
                      {label}{sort ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
                    </th>
                  );
                })}
                <th style={{ ...TH, width: "80px" }}>Status</th>
                <th style={{ ...TH, width: "120px" }} />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.82rem", padding: "3rem", textAlign: "center" }}>
                    No chores found.
                  </td>
                </tr>
              )}
              {filtered.map((chore, i) => {
                const status = choreStatus(choreNextDates[chore.id]);
                const nd = choreNextDates[chore.id];
                const ndStr = nd
                  ? new Date(nd).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : "—";
                const rowBg = i % 2 === 0 ? "var(--fm-bg-panel)" : "var(--fm-bg-raised)";

                return (
                  <tr
                    key={chore.id}
                    style={{ background: rowBg, borderBottom: "1px solid var(--fm-hairline)", transition: "background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--fm-bg-sunk)"}
                    onMouseLeave={e => e.currentTarget.style.background = rowBg}
                  >
                    {/* Status dot */}
                    <td style={{ ...TD, textAlign: "center", width: "20px" }}>
                      <div style={{ background: status.dot, borderRadius: "50%", display: "inline-block", height: "7px", width: "7px" }} />
                    </td>

                    {/* Chore name */}
                    <td style={TD}>
                      <TitleCell value={chore.title} onChange={v => handleChoreEdit(chore.id, "title", v)} />
                    </td>

                    {/* Room */}
                    <td style={{ ...TD, width: "120px" }}>
                      <SelectCell
                        value={chore.room}
                        options={roomOptions}
                        placeholder="Room"
                        onChange={v => handleChoreEdit(chore.id, "room", v)}
                      />
                    </td>

                    {/* Cadence */}
                    <td style={{ ...TD, width: "140px" }}>
                      <SchedulePicker
                        value={chore.schedule || null}
                        onChange={v => handleChoreEdit(chore.id, "schedule", v || "")}
                      />
                    </td>

                    {/* Next date */}
                    <td style={{ ...TD, width: "80px" }}>
                      <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem" }}>{ndStr}</span>
                    </td>

                    {/* Status text */}
                    <td style={{ ...TD, width: "80px" }}>
                      <span style={{ color: status.dot, fontFamily: "var(--fm-mono)", fontSize: "0.68rem" }}>{status.text}</span>
                    </td>

                    {/* Actions */}
                    <td style={{ ...TD, width: "120px" }}>
                      <div style={{ alignItems: "center", display: "flex", gap: "0.35rem" }}>
                        <ReminderButton
                          schedule={chore.schedule}
                          mode={reminderModes?.[chore.id] ?? "off"}
                          onCycle={() => handleCycleReminderMode(chore.id)}
                        />
                        <button
                          onClick={() => setDetailEvent({ chore, date: nd ? new Date(nd) : new Date() })}
                          style={{ background: "var(--fm-brass-bg)", border: "1px solid rgba(201,169,110,0.3)", borderRadius: "var(--fm-radius)", color: "var(--fm-brass)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.06em", padding: "0.2rem 0.5rem", transition: "all 0.12s" }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
                          onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(201,169,110,0.3)"}
                        >
                          Log it
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setDetailEvent({ chore, date: new Date() }); }}
                          style={{ background: "transparent", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.7rem", lineHeight: 1, padding: "0.1rem 0.2rem", transition: "color 0.12s" }}
                          onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                          onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-mute)"}
                          title="View details"
                        >
                          ···
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setConfirmChore(chore); }}
                          style={{ background: "transparent", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.9rem", lineHeight: 1, padding: "0.1rem 0.2rem", transition: "color 0.12s" }}
                          onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                          onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-mute)"}
                        >
                          ×
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ReminderSettings
        open={remindersOpen}
        onClose={() => setRemindersOpen(false)}
        onSync={handleSyncReminders}
        enabledCount={Object.values(reminderModes).filter(m => m && m !== "off").length}
      />
    </div>
  );
}
