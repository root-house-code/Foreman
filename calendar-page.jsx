import { useState, useMemo } from "react";
import { useForemanStore } from "./lib/store.js";
import { storageGet, storageSet } from "./lib/storage.js";
import FmHeader from "./src/components/FmHeader.jsx";
import FmSubnav from "./src/components/FmSubnav.jsx";
import CategoryTabs from "./components/CategoryTabs.jsx";
import ChoreDetailModal from "./components/ChoreDetailModal.jsx";
import MaintenanceCompleteModal from "./components/MaintenanceCompleteModal.jsx";
import {
  createChore,
  loadChoreNextDates, saveChoreNextDates,
  computeNextOccurrenceFromStart, computeChoreNextDate,
} from "./lib/chores.js";
import { loadData, loadCustomData, saveCustomData, loadOverrides, saveOverrides } from "./lib/data.js";
import { loadDeletedCategories } from "./lib/deletedCategories.js";
import { loadDeletedItems } from "./lib/deletedItems.js";
import { getScheduleColor } from "./lib/scheduleColor.js";
import { loadRoomCategories } from "./lib/categoryTypes.js";
import { parseMonths, isComputable } from "./lib/scheduleInterval.js";
import {
  loadMaintenanceStartDates, saveMaintenanceStartDates, maintenanceKey,
  saveMaintenanceCompletionRecord,
} from "./lib/maintenance.js";
import {
  loadChoreCompletions, saveChoreCompletions, isChoreCompleted, toggleChoreCompletion,
  saveChoreCompletionRecord,
} from "./lib/choreCompletions.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();
const MAX_CHIPS    = 4;

const SEASON_MONTHS = {
  spring: [2, 3, 4],
  summer: [5, 6, 7],
  fall:   [8, 9, 10],
  winter: [11, 0, 1],
};

const CAL_MONTHS       = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const CAL_MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const CAL_DOWS         = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const CAL_DOWS_LONG    = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

const ROOM_ORDER = [
  "Whole House","Kitchen","Bathrooms","Bedroom","Living Room",
  "Dining Room","Office","Laundry","Garage","Basement",
];

const DAY_OPTIONS = [
  { value: null, label: "Any" },
  { value: 0, label: "Sun" }, { value: 1, label: "Mon" }, { value: 2, label: "Tue" },
  { value: 3, label: "Wed" }, { value: 4, label: "Thu" }, { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const TIME_OPTIONS = [
  { value: null,    label: "Any time" },
  { value: "06:00", label: "6:00 AM"  }, { value: "07:00", label: "7:00 AM"  },
  { value: "08:00", label: "8:00 AM"  }, { value: "09:00", label: "9:00 AM"  },
  { value: "10:00", label: "10:00 AM" }, { value: "11:00", label: "11:00 AM" },
  { value: "12:00", label: "12:00 PM" }, { value: "13:00", label: "1:00 PM"  },
  { value: "14:00", label: "2:00 PM"  }, { value: "15:00", label: "3:00 PM"  },
  { value: "16:00", label: "4:00 PM"  }, { value: "17:00", label: "5:00 PM"  },
  { value: "18:00", label: "6:00 PM"  }, { value: "19:00", label: "7:00 PM"  },
  { value: "20:00", label: "8:00 PM"  }, { value: "21:00", label: "9:00 PM"  },
];

const MODAL_SCHEDULE_OPTIONS = [
  { value: "every 1 days",   label: "Daily"          },
  { value: "every 1 weeks",  label: "Every week"     },
  { value: "every 2 weeks",  label: "Every 2 weeks"  },
  { value: "every 3 weeks",  label: "Every 3 weeks"  },
  { value: "every 1 months", label: "Every month"    },
  { value: "every 2 months", label: "Every 2 months" },
  { value: "every 3 months", label: "Every 3 months" },
  { value: "every 6 months", label: "Every 6 months" },
  { value: "every 1 years",  label: "Every year"     },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SYS_ABBR = {
  "HVAC":"HVAC","Plumbing":"PLM","Electrical":"ELEC","Appliances":"APPL",
  "Exterior":"EXT","Structure":"STRC","Safety":"SAF","General":"GEN",
  "Roofing":"ROOF","Landscaping":"LAND","Pool":"POOL","Irrigation":"IRR",
};
function getSysTag(cat) {
  return SYS_ABBR[cat] || (cat || "").slice(0, 4).toUpperCase();
}

function buildRoomOptions() {
  const fromInventory = loadRoomCategories();
  const all = ["Whole House", ...fromInventory.filter(r => r !== "Whole House")];
  return all
    .sort((a, b) => {
      if (a === "Whole House") return -1; if (b === "Whole House") return 1;
      const aR = ROOM_ORDER.indexOf(a), bR = ROOM_ORDER.indexOf(b);
      if (aR !== -1 && bR !== -1) return aR - bR;
      if (aR !== -1) return -1; if (bR !== -1) return 1;
      return a.localeCompare(b);
    })
    .map(r => ({ value: r, label: r }));
}

function formatTimeOfDay(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// Returns Set of day-of-month numbers where a chore recurs in the viewed month.
function getChoreMonthOccurrences(startDate, schedule, dayOfWeek, viewYear, viewMonth) {
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
  let cur = new Date(anchor), safety = 0;
  while (cur < monthStart && safety++ < 2000) cur = step(cur);
  const result = new Set();
  safety = 0;
  while (cur <= monthEnd && safety++ < 60) { result.add(cur.getDate()); cur = step(cur); }
  return result;
}

// Returns Set of day-of-month numbers where a maintenance task recurs this month.
// Uses parseMonths for broad schedule format support; respects season gate.
function getMaintenanceMonthOccurrences(startDateStr, schedule, season, viewYear, viewMonth) {
  if (!startDateStr || !schedule || !isComputable(schedule)) return new Set();
  if (season && !SEASON_MONTHS[season.toLowerCase()]?.includes(viewMonth)) return new Set();
  const months = parseMonths(schedule);
  if (!months) return new Set();
  const anchor = new Date(startDateStr);
  anchor.setHours(0, 0, 0, 0);
  const monthStart = new Date(viewYear, viewMonth, 1);
  const monthEnd   = new Date(viewYear, viewMonth + 1, 0);
  if (anchor > monthEnd) return new Set();
  function step(d) {
    const n = new Date(d);
    n.setMonth(n.getMonth() + months);
    return n;
  }
  let cur = new Date(anchor), safety = 0;
  while (cur < monthStart && safety++ < 2000) cur = step(cur);
  const result = new Set();
  safety = 0;
  while (cur <= monthEnd && safety++ < 60) { result.add(cur.getDate()); cur = step(cur); }
  return result;
}

// True if the task was completed in the cycle that covers projectedDate.
function checkMaintenanceCompleted(key, projectedDate, schedule, maintenanceDates) {
  const lastStr = maintenanceDates[key];
  if (!lastStr) return false;
  const months = parseMonths(schedule);
  if (!months) return false;
  const last = new Date(lastStr);
  const prevDue = new Date(projectedDate);
  prevDue.setMonth(prevDue.getMonth() - months);
  return last > prevDue && last <= new Date(projectedDate.getTime() + 86400000);
}

function getEventsForDate(date, chores, maintenanceRows, maintenanceStartDates, maintenanceDates, maintenanceNextDates, choreCompletions, activeFilter) {
  const y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
  const events = [];
  for (const chore of chores) {
    if (!chore.startDate || !chore.schedule) continue;
    if (activeFilter !== "All" && chore.room !== activeFilter) continue;
    const days = getChoreMonthOccurrences(chore.startDate, chore.schedule, chore.dayOfWeek, y, m);
    if (days.has(d)) {
      const dt = new Date(y, m, d);
      events.push({ type: "chore", chore, date: dt, isCompleted: isChoreCompleted(choreCompletions, chore.id, dt) });
    }
  }
  for (const row of maintenanceRows) {
    const key = maintenanceKey(row);
    const anchor = maintenanceStartDates[key];
    if (activeFilter !== "All" && row.category !== activeFilter) continue;
    if (anchor) {
      const days = getMaintenanceMonthOccurrences(anchor, row.schedule, row.season, y, m);
      if (days.has(d)) {
        const dt = new Date(y, m, d);
        events.push({ type: "maintenance", row, key, isCompleted: checkMaintenanceCompleted(key, dt, row.schedule, maintenanceDates) });
      }
    } else {
      const nextStr = maintenanceNextDates[key];
      if (nextStr) {
        const nextDate = new Date(nextStr);
        if (nextDate.getFullYear() === y && nextDate.getMonth() === m && nextDate.getDate() === d)
          events.push({ type: "maintenance", row, key, isCompleted: false });
      }
      const lastStr = maintenanceDates[key];
      if (lastStr) {
        const lastDate = new Date(lastStr);
        if (lastDate.getFullYear() === y && lastDate.getMonth() === m && lastDate.getDate() === d)
          events.push({ type: "maintenance", row, key, isCompleted: true });
      }
    }
  }
  return events;
}

// Next n upcoming chore occurrences from today.
function getChoreUpcoming(chore, n = 3) {
  if (!chore.startDate || !chore.schedule) return [];
  const results = [];
  let cur = computeNextOccurrenceFromStart(
    new Date(chore.startDate), chore.schedule, chore.dayOfWeek, chore.timeOfDay
  );
  for (let i = 0; results.length < n && i < n + 100; i++) {
    results.push(new Date(cur));
    const next = new Date(cur);
    const s = chore.schedule.toLowerCase();
    const dm = s.match(/every\s+(\d+)\s*days?/);
    const wm = s.match(/every\s+(\d+)\s*weeks?/);
    const mm = s.match(/every\s+(\d+)\s*months?/);
    const ym = s.match(/every\s+(\d+)\s*years?/);
    if      (dm) next.setDate(next.getDate() + parseInt(dm[1]));
    else if (wm) next.setDate(next.getDate() + parseInt(wm[1]) * 7);
    else if (mm) next.setMonth(next.getMonth() + parseInt(mm[1]));
    else if (ym) next.setFullYear(next.getFullYear() + parseInt(ym[1]));
    else         next.setDate(next.getDate() + 7);
    cur = next;
  }
  return results;
}

// Next n upcoming maintenance occurrences from today.
function getMaintenanceUpcoming(startDateStr, schedule, n = 3) {
  if (!startDateStr || !schedule || !isComputable(schedule)) return [];
  const months = parseMonths(schedule);
  if (!months) return [];
  const now = new Date();
  let cur = new Date(startDateStr);
  cur.setHours(0, 0, 0, 0);
  let safety = 0;
  while (cur < now && safety++ < 500) { cur = new Date(cur); cur.setMonth(cur.getMonth() + months); }
  const results = [];
  for (let i = 0; results.length < n && i < n + 100; i++) {
    results.push(new Date(cur));
    cur = new Date(cur);
    cur.setMonth(cur.getMonth() + months);
  }
  return results;
}


function buildRoomItemsMap() {
  const deletedCats  = loadDeletedCategories();
  const deletedItems = loadDeletedItems();
  const rows = loadData().filter(r =>
    r.category && r.item && !r._isBlankCategory &&
    !deletedCats.has(r.category) &&
    !deletedItems.has(`${r.category}|${r.item}`)
  );
  const map = {};
  for (const r of rows) {
    const room = r.room || r.category || "";
    if (!room) continue;
    if (!map[room]) map[room] = new Set();
    map[room].add(r.item);
  }
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, [...v].sort()]));
}

// ─── CreateChoreModal ─────────────────────────────────────────────────────────

function CreateChoreModal({ date, roomOptions, onSave, onClose }) {
  const [form, setForm] = useState({
    title: "", room: roomOptions[0]?.value ?? "Whole House",
    schedule: "every 1 weeks", dayOfWeek: date ? date.getDay() : null,
    timeOfDay: null, assignee: "", notes: "",
  });
  function set(f, v) { setForm(p => ({ ...p, [f]: v })); }
  const dateLabel = date ? date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "";
  const canSave   = form.title.trim().length > 0;
  const inputStyle  = { background: "#1a1f2e", border: "1px solid #a8a29c", borderRadius: "2px", boxSizing: "border-box", color: "#e8e4dd", fontFamily: "monospace", fontSize: "0.8rem", outline: "none", padding: "0.35rem 0.5rem", width: "100%" };
  const labelStyle  = { color: "#a8a29c", display: "block", fontFamily: "monospace", fontSize: "0.62rem", letterSpacing: "0.1em", marginBottom: "0.25rem", textTransform: "uppercase" };
  const selectStyle = { ...inputStyle, appearance: "none", cursor: "pointer", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235a5460'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 0.5rem center", paddingRight: "1.5rem" };
  return (
    <div style={{ alignItems: "center", background: "rgba(0,0,0,0.7)", bottom: 0, display: "flex", justifyContent: "center", left: 0, position: "fixed", right: 0, top: 0, zIndex: 200 }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#0f1117", border: "1px solid #a8a29c", borderRadius: "6px", maxWidth: 480, padding: "1.75rem 2rem", width: "90%" }}>
        <div style={{ color: "#8b7d6b", fontFamily: "monospace", fontSize: "0.6rem", letterSpacing: "0.15em", marginBottom: "0.2rem", textTransform: "uppercase" }}>New Chore</div>
        <div style={{ color: "#c9a96e", fontFamily: "'Georgia','Times New Roman',serif", fontSize: "1.05rem", marginBottom: "1.5rem" }}>{dateLabel}</div>
        <div style={{ marginBottom: "1rem" }}><label style={labelStyle}>Chore Name</label><input autoFocus value={form.title} onChange={e => set("title", e.target.value)} onKeyDown={e => { if (e.key === "Enter" && canSave) onSave(form, date); if (e.key === "Escape") onClose(); }} placeholder="e.g. Vacuum all floors" style={inputStyle} /></div>
        <div style={{ marginBottom: "1rem" }}><label style={labelStyle}>Room</label><select value={form.room} onChange={e => set("room", e.target.value)} style={selectStyle}>{roomOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div style={{ marginBottom: "1rem" }}><label style={labelStyle}>Schedule</label><select value={form.schedule} onChange={e => set("schedule", e.target.value)} style={selectStyle}>{MODAL_SCHEDULE_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "1fr 1fr", marginBottom: "1rem" }}>
          <div><label style={labelStyle}>Day</label><select value={form.dayOfWeek ?? ""} onChange={e => set("dayOfWeek", e.target.value === "" ? null : parseInt(e.target.value))} style={selectStyle}><option value="">Any</option>{DAY_OPTIONS.filter(d => d.value !== null).map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div><label style={labelStyle}>Time</label><select value={form.timeOfDay ?? ""} onChange={e => set("timeOfDay", e.target.value || null)} style={selectStyle}><option value="">Any time</option>{TIME_OPTIONS.filter(t => t.value !== null).map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></div>
        </div>
        <div style={{ marginBottom: "1rem" }}><label style={labelStyle}>Assignee</label><input value={form.assignee} onChange={e => set("assignee", e.target.value)} placeholder="Who does this chore?" style={inputStyle} /></div>
        <div style={{ marginBottom: "1.5rem" }}><label style={labelStyle}>Notes</label><textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Any notes…" rows={2} style={{ ...inputStyle, resize: "vertical" }} /></div>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "transparent", border: "1px solid #a8a29c", borderRadius: "3px", color: "#a8a29c", cursor: "pointer", fontFamily: "monospace", fontSize: "0.78rem", padding: "0.45rem 1rem" }} onMouseEnter={e => { e.currentTarget.style.borderColor = "#a8a29c"; e.currentTarget.style.color = "#8b7d6b"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "#a8a29c"; e.currentTarget.style.color = "#a8a29c"; }}>Cancel</button>
          <button onClick={() => canSave && onSave(form, date)} disabled={!canSave} style={{ background: canSave ? "#c9a96e22" : "transparent", border: `1px solid ${canSave ? "#c9a96e" : "#a8a29c"}`, borderRadius: "3px", color: canSave ? "#c9a96e" : "#a8a29c", cursor: canSave ? "pointer" : "default", fontFamily: "monospace", fontSize: "0.78rem", padding: "0.45rem 1rem" }}>Add Chore</button>
        </div>
      </div>
    </div>
  );
}

// ─── CalendarPage ─────────────────────────────────────────────────────────────

export default function CalendarPage({ navigate }) {
  const todayRaw   = new Date();
  const todayYear  = todayRaw.getFullYear();
  const todayMonth = todayRaw.getMonth();
  const todayDay   = todayRaw.getDate();

  const chores = useForemanStore(s => s.chores);
  const [maintenanceRows]       = useState(() => {
    const deletedCats   = loadDeletedCategories();
    const deletedItems  = loadDeletedItems();
    return loadData().filter(r =>
      r.category && r.item && r.task && !r._isBlankCategory &&
      !deletedCats.has(r.category) &&
      !deletedItems.has(`${r.category}|${r.item}`)
    );
  });
  const [maintenanceStartDates, setMaintenanceStartDates] = useState(() => loadMaintenanceStartDates());
  const [maintenanceDates, setMaintenanceDates]         = useState(() => storageGet("maintenance-dates") ?? {});
  const [maintenanceNextDates, setMaintenanceNextDates] = useState(() => storageGet("maintenance-next-dates") ?? {});
  const [view, setView]         = useState({ y: todayYear, m: todayMonth });
  const [createDate, setCreateDate]       = useState(null);
  const [selectedTaskKey, setSelectedTaskKey] = useState(null); // maintenance task awaiting start date
  const [sidebarTab, setSidebarTab] = useState("month");
  const [activeFilter, setActiveFilter] = useState("All");
  const [roomOptions]           = useState(() => buildRoomOptions());
  const [choreCompletions, setChoreCompletions] = useState(() => loadChoreCompletions());
  const [detailEvent, setDetailEvent] = useState(null); // { chore, date } | null
  const [completionEvent, setCompletionEvent] = useState(null); // { row, key, date, isCompleted } | null
  const [roomItemsMap] = useState(() => buildRoomItemsMap());
  const [calView, setCalView] = useState("Month");
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0); return d;
  });

  const atYearStart = view.y === CURRENT_YEAR && view.m === 0;
  const atYearEnd   = view.y === CURRENT_YEAR && view.m === 11;

  function prevMonth() {
    if (atYearStart) return;
    setSelectedDay(null);
    setView(v => v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 });
  }
  function nextMonth() {
    if (atYearEnd) return;
    setSelectedDay(null);
    setView(v => v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 });
  }


  // Combined filter set: unique chore rooms + maintenance categories
  const { choreRooms, maintenanceCats } = useMemo(() => {
    const rooms = [...new Set(chores.map(c => c.room))].sort((a, b) => {
      const ai = ROOM_ORDER.indexOf(a), bi = ROOM_ORDER.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1; if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
    const cats = [...new Set(maintenanceRows.map(r => r.category))].sort();
    return { choreRooms: rooms, maintenanceCats: cats };
  }, [chores, maintenanceRows]);

  const daysInMonth   = new Date(view.y, view.m + 1, 0).getDate();
  const prevMonthDays = new Date(view.y, view.m, 0).getDate();
  const firstDow      = new Date(view.y, view.m, 1).getDay();
  const numRows       = Math.ceil((firstDow + daysInMonth) / 7);
  const trailingDays  = numRows * 7 - firstDow - daysInMonth;

  // Build events-by-day map for the viewed month
  const eventsByDay = useMemo(() => {
    const map = {};
    function push(day, event) { if (!map[day]) map[day] = []; map[day].push(event); }

    for (const chore of chores) {
      if (!chore.startDate || !chore.schedule) continue;
      if (activeFilter !== "All" && chore.room !== activeFilter) continue;
      const days = getChoreMonthOccurrences(chore.startDate, chore.schedule, chore.dayOfWeek, view.y, view.m);
      for (const day of days) {
        const date = new Date(view.y, view.m, day);
        push(day, { type: "chore", chore, date, isCompleted: isChoreCompleted(choreCompletions, chore.id, date) });
      }
    }

    for (const row of maintenanceRows) {
      const key    = maintenanceKey(row);
      const anchor = maintenanceStartDates[key];
      if (activeFilter !== "All" && row.category !== activeFilter) continue;
      if (anchor) {
        const days = getMaintenanceMonthOccurrences(anchor, row.schedule, row.season, view.y, view.m);
        for (const day of days) {
          const projectedDate = new Date(view.y, view.m, day);
          push(day, { type: "maintenance", row, key, isCompleted: checkMaintenanceCompleted(key, projectedDate, row.schedule, maintenanceDates) });
        }
      } else {
        // No recurring start date — show next due date if it falls in this month.
        const nextStr = maintenanceNextDates[key];
        if (nextStr) {
          const nextDate = new Date(nextStr);
          if (nextDate.getFullYear() === view.y && nextDate.getMonth() === view.m)
            push(nextDate.getDate(), { type: "maintenance", row, key, isCompleted: false });
        }
        // Also show completed occurrence on the date it was done, if it falls in this month.
        const lastStr = maintenanceDates[key];
        if (lastStr) {
          const lastDate = new Date(lastStr);
          if (lastDate.getFullYear() === view.y && lastDate.getMonth() === view.m)
            push(lastDate.getDate(), { type: "maintenance", row, key, isCompleted: true });
        }
      }
    }
    return map;
  }, [chores, maintenanceRows, maintenanceStartDates, maintenanceDates, maintenanceNextDates, choreCompletions, view, activeFilter]);

  // Maintenance tasks that have no start date yet (need scheduling)
  const unscheduledMaintenance = useMemo(() =>
    maintenanceRows
      .filter(r => isComputable(r.schedule) && !maintenanceStartDates[maintenanceKey(r)])
      .slice(0, 30),
    [maintenanceRows, maintenanceStartDates]
  );

  const selectedTaskRow = selectedTaskKey
    ? maintenanceRows.find(r => maintenanceKey(r) === selectedTaskKey) ?? null
    : null;

  // Week view: events for each of the 7 days starting at weekStart
  const weekEvents = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
      return { date: d, events: getEventsForDate(d, chores, maintenanceRows, maintenanceStartDates, maintenanceDates, maintenanceNextDates, choreCompletions, activeFilter) };
    });
  }, [weekStart, chores, maintenanceRows, maintenanceStartDates, maintenanceDates, maintenanceNextDates, choreCompletions, activeFilter]);

  // Agenda view: next 90 days with events
  const agendaEvents = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const result = [];
    for (let i = 0; i < 90; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      const evts = getEventsForDate(d, chores, maintenanceRows, maintenanceStartDates, maintenanceDates, maintenanceNextDates, choreCompletions, activeFilter);
      if (evts.length > 0) result.push({ date: d, events: evts });
    }
    return result;
  }, [chores, maintenanceRows, maintenanceStartDates, maintenanceDates, maintenanceNextDates, choreCompletions, activeFilter]);

  // Year view: per-month event-day sets for the viewed year
  const yearEventMap = useMemo(() => {
    const map = {};
    for (let m = 0; m < 12; m++) {
      const daysInM = new Date(view.y, m + 1, 0).getDate();
      const days = new Set();
      for (let d = 1; d <= daysInM; d++) {
        const dt = new Date(view.y, m, d);
        const evts = getEventsForDate(dt, chores, maintenanceRows, maintenanceStartDates, maintenanceDates, maintenanceNextDates, choreCompletions, "All");
        if (evts.length > 0) days.add(d);
      }
      map[m] = days;
    }
    return map;
  }, [view.y, chores, maintenanceRows, maintenanceStartDates, maintenanceDates, maintenanceNextDates, choreCompletions]);

  function handleCellClick(day) {
    const date = new Date(view.y, view.m, day);
    if (selectedTaskKey) {
      const updated = { ...maintenanceStartDates, [selectedTaskKey]: date.toISOString() };
      setMaintenanceStartDates(updated);
      saveMaintenanceStartDates(updated);
      setSelectedTaskKey(null);
    } else {
      setCreateDate(date);
    }
  }

  function handleCreateChore(form, date) {
    const newChore = createChore({ ...form, startDate: date?.toISOString() ?? null });
    const updated = [newChore, ...chores];
    useForemanStore.getState().setChores(updated);
    if (date && newChore.schedule) {
      const next      = computeNextOccurrenceFromStart(date, newChore.schedule, newChore.dayOfWeek, newChore.timeOfDay);
      const nextDates = { ...loadChoreNextDates(), [newChore.id]: next.toISOString() };
      saveChoreNextDates(nextDates);
    }
  }

  function handleMarkDoneWithDetails(choreId, date, details) {
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    const updatedCompletions = toggleChoreCompletion(choreCompletions, choreId, d);
    saveChoreCompletions(updatedCompletions);
    setChoreCompletions(updatedCompletions);
    saveChoreCompletionRecord(choreId, d, details);
    const chore = chores.find(c => c.id === choreId);
    if (chore) {
      const nextOcc = computeChoreNextDate(d, chore.schedule, chore.dayOfWeek, chore.timeOfDay);
      const updated = { ...loadChoreNextDates(), [choreId]: nextOcc.toISOString() };
      saveChoreNextDates(updated);
    }
  }

  function handleMaintenanceRowEdit(row, field, value) {
    if (row._isCustom) {
      const customs = loadCustomData();
      saveCustomData(customs.map(r => r._id === row._id ? { ...r, [field]: value } : r));
    } else {
      const overrides = loadOverrides();
      overrides[row._defaultKey] = { ...(overrides[row._defaultKey] || {}), [field]: value };
      saveOverrides(overrides);
    }
  }

  function handleMaintenanceMarkDone(key, row, completedDate, notes, nextDateOverride, assignee) {
    if (!completedDate) {
      const next = { ...maintenanceDates };
      delete next[key];
      storageSet("maintenance-dates", next);
      setMaintenanceDates(next);
      setCompletionEvent(null);
      return;
    }
    saveMaintenanceCompletionRecord(key, { completedAt: completedDate.toISOString(), assignee, notes });
    const updatedDates = { ...maintenanceDates, [key]: completedDate.toISOString() };
    storageSet("maintenance-dates", updatedDates);
    setMaintenanceDates(updatedDates);
    const effectiveNext = nextDateOverride || (() => {
      const months = parseMonths(row.schedule);
      if (!months) return null;
      const d = new Date(completedDate);
      d.setMonth(d.getMonth() + months);
      return d;
    })();
    if (effectiveNext) {
      const updatedNext = { ...maintenanceNextDates, [key]: effectiveNext.toISOString() };
      storageSet("maintenance-next-dates", updatedNext);
      setMaintenanceNextDates(updatedNext);
    }
    setCompletionEvent(null);
  }

  const navBtnStyle = (disabled) => ({
    background: "transparent", border: "none",
    color: disabled ? "var(--fm-ink-mute)" : "var(--fm-brass-dim)",
    cursor: disabled ? "default" : "pointer",
    fontFamily: "var(--fm-serif)", fontSize: "1.4rem", lineHeight: 1,
    padding: "0.1rem 0.5rem", transition: "color 0.15s",
  });


  return (
    <div style={{ background: "var(--fm-bg)", color: "var(--fm-ink)", display: "flex", flexDirection: "column", fontFamily: "var(--fm-serif)", height: "100vh", overflow: "hidden" }}>

      {createDate && (
        <CreateChoreModal
          date={createDate} roomOptions={roomOptions}
          onSave={(form, date) => { handleCreateChore(form, date); setCreateDate(null); }}
          onClose={() => setCreateDate(null)}
        />
      )}

      {detailEvent && (
        <ChoreDetailModal
          chore={detailEvent.chore}
          date={detailEvent.date}
          isDone={isChoreCompleted(choreCompletions, detailEvent.chore.id, detailEvent.date)}
          onToggleDone={() => {
            const next = toggleChoreCompletion(choreCompletions, detailEvent.chore.id, detailEvent.date);
            saveChoreCompletions(next);
            setChoreCompletions(next);
          }}
          onMarkDone={details => handleMarkDoneWithDetails(detailEvent.chore.id, detailEvent.date, details)}
          roomItemsMap={roomItemsMap}
          onClose={() => setDetailEvent(null)}
        />
      )}

      {completionEvent && (
        <MaintenanceCompleteModal
          row={completionEvent.row}
          date={completionEvent.date}
          isCompleted={completionEvent.isCompleted}
          lastDate={maintenanceDates[completionEvent.key] ? new Date(maintenanceDates[completionEvent.key]) : null}
          onMarkDone={(completedDate, notes, nextDateOverride, assignee) =>
            handleMaintenanceMarkDone(completionEvent.key, completionEvent.row, completedDate, notes, nextDateOverride, assignee)
          }
          onRowEdit={(field, value) => handleMaintenanceRowEdit(completionEvent.row, field, value)}
          onClose={() => setCompletionEvent(null)}
        />
      )}

      {/* Header */}
      <FmHeader active="Calendar" tagline="Calendar" />
      <FmSubnav
        tabs={["Month", "Week", "Agenda", "Year"]}
        active={calView}
        onTabChange={setCalView}
        stats={[
          { value: Object.values(eventsByDay).flat().filter(e => e.type === "maintenance").length, label: "tasks" },
          { value: Object.values(eventsByDay).flat().filter(e => e.type === "chore").length, label: "chores" },
          { value: Object.values(eventsByDay).flat().length, label: "total events" },
        ]}
      />

      {/* ── MONTH VIEW ─────────────────────────────────────────────────────── */}
      {calView === "Month" && <>
        <div style={{ flexShrink: 0, padding: "2rem 2rem 0" }}>
          <div style={{ alignItems: "center", display: "flex", marginBottom: "1.25rem", minHeight: "36px" }}>
            <button style={navBtnStyle(atYearStart)} onClick={prevMonth} onMouseEnter={e => { if (!atYearStart) e.currentTarget.style.color = "var(--fm-brass)"; }} onMouseLeave={e => { if (!atYearStart) e.currentTarget.style.color = "var(--fm-brass-dim)"; }}>‹</button>
            <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "1.05rem", letterSpacing: "0.02em", minWidth: "11rem", textAlign: "center" }}>{CAL_MONTHS[view.m]} {view.y}</span>
            <button style={navBtnStyle(atYearEnd)} onClick={nextMonth} onMouseEnter={e => { if (!atYearEnd) e.currentTarget.style.color = "var(--fm-brass)"; }} onMouseLeave={e => { if (!atYearEnd) e.currentTarget.style.color = "var(--fm-brass-dim)"; }}>›</button>
          </div>
          <CategoryTabs special={["All"]} groups={[ ...(choreRooms.length > 0 ? [{ type: "room", label: "Rooms", tabs: choreRooms }] : []), ...(maintenanceCats.length > 0 ? [{ type: "maintenance", label: "Maintenance", tabs: maintenanceCats }] : []) ]} active={activeFilter} onSelect={setActiveFilter} />
        </div>
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <div style={{ display: "flex", flex: 1, flexDirection: "column", overflow: "hidden", padding: "0 1.25rem 0.75rem" }}>
            <div style={{ display: "grid", flexShrink: 0, gap: "2px", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: "2px" }}>
              {CAL_DOWS.map(d => <div key={d} style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", letterSpacing: "0.06em", padding: "0.15rem 0.4rem", textAlign: "center" }}>{d}</div>)}
            </div>
            <div style={{ display: "grid", flex: 1, gap: "2px", gridTemplateColumns: "repeat(7, 1fr)", gridTemplateRows: `repeat(${numRows}, 1fr)`, overflow: "hidden" }}>
              {Array.from({ length: firstDow }, (_, i) => {
                const day = prevMonthDays - firstDow + i + 1;
                return <div key={`prev${i}`} style={{ border: "1px solid var(--fm-hairline)", borderRadius: "3px", opacity: 0.3, padding: "3px 4px 2px" }}><div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-serif)", fontSize: "0.75rem", textAlign: "center" }}>{day}</div></div>;
              })}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const isToday = view.y === todayYear && view.m === todayMonth && day === todayDay;
                const dayEvents = eventsByDay[day] ?? [];
                const visible = dayEvents.slice(0, MAX_CHIPS);
                const overflow = dayEvents.length - visible.length;
                const awaitingDate = !!selectedTaskKey;
                return (
                  <div key={day} onClick={() => handleCellClick(day)} style={{ background: isToday ? "var(--fm-brass-bg)" : "transparent", border: `1px solid ${isToday ? "var(--fm-brass)" : "var(--fm-hairline)"}`, borderRadius: "3px", cursor: "pointer", overflow: "hidden", padding: "3px 4px 2px", transition: "background 0.1s" }} onMouseEnter={e => { if (!isToday) e.currentTarget.style.background = awaitingDate ? "var(--fm-brass-bg)" : "var(--fm-bg-raised)"; }} onMouseLeave={e => { if (!isToday) e.currentTarget.style.background = "transparent"; }}>
                    <div style={{ fontFamily: "var(--fm-serif)", fontSize: "0.75rem", marginBottom: "2px", textAlign: "center" }}>
                      {isToday ? <span style={{ alignItems: "center", background: "var(--fm-brass)", borderRadius: "50%", color: "var(--fm-bg)", display: "inline-flex", height: "18px", justifyContent: "center", width: "18px" }}>{day}</span> : <span style={{ color: "var(--fm-ink-dim)" }}>{day}</span>}
                    </div>
                    {visible.map((evt, idx) => {
                      const isMaint = evt.type === "maintenance";
                      const color = isMaint ? "var(--fm-brass-dim)" : "var(--fm-cyan)";
                      const label = isMaint ? evt.row.item : evt.chore.title;
                      const onClick = isMaint
                        ? e => { e.stopPropagation(); setCompletionEvent({ row: evt.row, key: evt.key, date: new Date(view.y, view.m, day), isCompleted: evt.isCompleted }); }
                        : e => { e.stopPropagation(); setDetailEvent({ chore: evt.chore, date: evt.date }); };
                      return <div key={idx} onClick={onClick} style={{ borderLeft: `3px solid ${color}`, borderRadius: "0 2px 2px 0", cursor: "pointer", marginBottom: "1px", opacity: evt.isCompleted ? 0.4 : 1, overflow: "hidden", padding: "1px 3px" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}><span style={{ color: "var(--fm-ink-dim)", display: "block", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", overflow: "hidden", textDecoration: evt.isCompleted ? "line-through" : "none", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span></div>;
                    })}
                    {overflow > 0 && <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.56rem", padding: "0 3px" }}>+{overflow} more</div>}
                  </div>
                );
              })}
              {Array.from({ length: trailingDays }, (_, i) => <div key={`next${i}`} style={{ border: "1px solid var(--fm-hairline)", borderRadius: "3px", opacity: 0.3, padding: "3px 4px 2px" }}><div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-serif)", fontSize: "0.75rem", textAlign: "center" }}>{i + 1}</div></div>)}
            </div>
          </div>
          {/* Right panel */}
          <div style={{ borderLeft: "1px solid var(--fm-hairline)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden", width: "320px" }}>
            {selectedTaskKey && selectedTaskRow && (
              <div style={{ background: "var(--fm-brass-bg)", border: "1px solid var(--fm-brass)", borderRadius: "var(--fm-radius)", flexShrink: 0, margin: "0.75rem", padding: "0.65rem 0.75rem" }}>
                <div style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.1em", marginBottom: "0.2rem", textTransform: "uppercase" }}>Set Start Date</div>
                <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.78rem", marginBottom: "0.25rem" }}>{selectedTaskRow.item} · {selectedTaskRow.task}</div>
                <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", marginBottom: "0.4rem" }}>Click a date on the calendar.</div>
                <button onClick={() => setSelectedTaskKey(null)} style={{ background: "transparent", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.63rem", padding: 0 }} onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"} onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}>× cancel</button>
              </div>
            )}
            <div style={{ borderBottom: "1px solid var(--fm-hairline)", display: "flex", flexShrink: 0 }}>
              {[{ id: "month", label: `${CAL_MONTHS[view.m]} ${view.y}` }, { id: "schedule", label: `To Schedule${unscheduledMaintenance.length ? ` (${unscheduledMaintenance.length})` : ""}` }].map(tab => (
                <button key={tab.id} onClick={() => setSidebarTab(tab.id)} style={{ background: "transparent", border: "none", borderBottom: sidebarTab === tab.id ? "2px solid var(--fm-brass)" : "2px solid transparent", color: sidebarTab === tab.id ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: "pointer", flex: 1, fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.1em", padding: "0.6rem 0.5rem", textTransform: "uppercase", transition: "color 0.12s" }}>{tab.label}</button>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "0.75rem 1.25rem" }}>
              {sidebarTab === "month" && (
                <>
                  {Object.keys(eventsByDay).length === 0 ? (
                    <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.5rem 0" }}>No events this month</div>
                  ) : (
                    Object.keys(eventsByDay).map(Number).sort((a, b) => a - b).flatMap(day =>
                      eventsByDay[day].map((evt, idx) => {
                        const isMaint = evt.type === "maintenance";
                        const tag = isMaint ? getSysTag(evt.row.category) : "CHORE";
                        const tagColor = isMaint ? "var(--fm-brass-dim)" : "var(--fm-cyan)";
                        const label = isMaint ? `${evt.row.item} · ${evt.row.task}` : evt.chore.title;
                        const sidebarClick = isMaint
                          ? () => setCompletionEvent({ row: evt.row, key: evt.key, date: new Date(view.y, view.m, day), isCompleted: evt.isCompleted })
                          : () => setDetailEvent({ chore: evt.chore, date: new Date(view.y, view.m, day) });
                        return (
                          <div key={`${day}-${idx}`} onClick={sidebarClick} style={{ alignItems: "center", borderBottom: "1px solid var(--fm-hairline)", cursor: "pointer", display: "flex", gap: "0.5rem", padding: "0.32rem 0" }} onMouseEnter={e => e.currentTarget.style.background = "var(--fm-bg-raised)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                            <span style={{ color: "var(--fm-brass)", flexShrink: 0, fontFamily: "var(--fm-serif)", fontSize: "0.88rem", minWidth: "20px", textAlign: "right" }}>{day}</span>
                            <span style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: "var(--fm-radius)", color: tagColor, flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.52rem", letterSpacing: "0.05em", padding: "0.1rem 0.3rem" }}>{tag}</span>
                            <span style={{ color: evt.isCompleted ? "var(--fm-ink-mute)" : "var(--fm-ink-dim)", fontFamily: "var(--fm-sans)", fontSize: "0.73rem", overflow: "hidden", textDecoration: evt.isCompleted ? "line-through" : "none", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                          </div>
                        );
                      })
                    )
                  )}
                </>
              )}
              {sidebarTab === "schedule" && (
                <>
                  <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", marginBottom: "0.75rem" }}>Select a task, then click a date on the calendar.</div>
                  {unscheduledMaintenance.length === 0 ? (
                    <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem" }}>All tasks are scheduled.</div>
                  ) : (
                    unscheduledMaintenance.map(row => {
                      const key = maintenanceKey(row);
                      const isActive = selectedTaskKey === key;
                      return (
                        <div key={key} onClick={() => setSelectedTaskKey(prev => prev === key ? null : key)} style={{ background: isActive ? "var(--fm-brass-bg)" : "transparent", border: `1px solid ${isActive ? "var(--fm-brass)" : "transparent"}`, borderRadius: "var(--fm-radius)", cursor: "pointer", marginBottom: "0.3rem", padding: "0.3rem 0.4rem", transition: "all 0.1s" }} onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--fm-bg-raised)"; }} onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}>
                          <div style={{ color: isActive ? "var(--fm-brass)" : "var(--fm-ink-dim)", fontFamily: "var(--fm-sans)", fontSize: "0.73rem" }}>{row.item} · {row.task}</div>
                          <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem" }}>{row.category} · {row.schedule}</div>
                        </div>
                      );
                    })
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </>}

      {/* ── WEEK VIEW ──────────────────────────────────────────────────────── */}
      {calView === "Week" && <>
        <div style={{ flexShrink: 0, padding: "2rem 2rem 0" }}>
          <div style={{ alignItems: "center", display: "flex", marginBottom: "1.25rem", minHeight: "36px" }}>
            <button style={navBtnStyle(false)} onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(d.getDate() - 7); return n; })} onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"} onMouseLeave={e => e.currentTarget.style.color = "var(--fm-brass-dim)"}>‹</button>
            <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "1.05rem", letterSpacing: "0.02em", minWidth: "16rem", textAlign: "center" }}>
              {CAL_MONTHS_SHORT[weekStart.getMonth()]} {weekStart.getDate()} – {(() => { const e = new Date(weekStart); e.setDate(weekStart.getDate() + 6); return `${CAL_MONTHS_SHORT[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`; })()}
            </span>
            <button style={navBtnStyle(false)} onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(d.getDate() + 7); return n; })} onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"} onMouseLeave={e => e.currentTarget.style.color = "var(--fm-brass-dim)"}>›</button>
          </div>
          <CategoryTabs special={["All"]} groups={[ ...(choreRooms.length > 0 ? [{ type: "room", label: "Rooms", tabs: choreRooms }] : []), ...(maintenanceCats.length > 0 ? [{ type: "maintenance", label: "Maintenance", tabs: maintenanceCats }] : []) ]} active={activeFilter} onSelect={setActiveFilter} />
        </div>
        <div style={{ display: "flex", flex: 1, overflow: "hidden", padding: "0 1.25rem 0.75rem" }}>
          <div style={{ display: "grid", flex: 1, gap: "4px", gridTemplateColumns: "repeat(7, 1fr)", overflow: "hidden" }}>
            {weekEvents.map(({ date, events }) => {
              const isToday = date.getFullYear() === todayYear && date.getMonth() === todayMonth && date.getDate() === todayDay;
              return (
                <div key={date.toISOString()} style={{ border: `1px solid ${isToday ? "var(--fm-brass)" : "var(--fm-hairline)"}`, borderRadius: "4px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  <div style={{ background: isToday ? "var(--fm-brass-bg)" : "var(--fm-bg-raised)", borderBottom: "1px solid var(--fm-hairline)", flexShrink: 0, padding: "0.35rem 0.5rem", textAlign: "center" }}>
                    <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>{CAL_DOWS[date.getDay()]}</div>
                    <div style={{ color: isToday ? "var(--fm-brass)" : "var(--fm-ink-dim)", fontFamily: "var(--fm-serif)", fontSize: "1rem" }}>{date.getDate()}</div>
                  </div>
                  <div style={{ flex: 1, overflowY: "auto", padding: "0.3rem" }}>
                    {events.length === 0 && <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", padding: "0.2rem 0.1rem" }}>—</div>}
                    {events.map((evt, idx) => {
                      const isMaint = evt.type === "maintenance";
                      const color = isMaint ? "var(--fm-brass-dim)" : "var(--fm-cyan)";
                      const label = isMaint ? evt.row.item : evt.chore.title;
                      const weekClick = isMaint
                        ? () => setCompletionEvent({ row: evt.row, key: evt.key, date, isCompleted: evt.isCompleted })
                        : () => setDetailEvent({ chore: evt.chore, date });
                      return (
                        <div key={idx} onClick={weekClick} style={{ borderLeft: `3px solid ${color}`, borderRadius: "0 2px 2px 0", cursor: "pointer", marginBottom: "2px", opacity: evt.isCompleted ? 0.4 : 1, overflow: "hidden", padding: "2px 4px" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          <span style={{ color: "var(--fm-ink-dim)", display: "block", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", overflow: "hidden", textDecoration: evt.isCompleted ? "line-through" : "none", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ borderTop: "1px solid var(--fm-hairline)", flexShrink: 0, padding: "0.25rem" }}>
                    <button onClick={() => setCreateDate(date)} style={{ background: "transparent", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", padding: "0.1rem 0.2rem", width: "100%" }} onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"} onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-mute)"}>+ chore</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </>}

      {/* ── AGENDA VIEW ────────────────────────────────────────────────────── */}
      {calView === "Agenda" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem 2rem" }}>
          <CategoryTabs special={["All"]} groups={[ ...(choreRooms.length > 0 ? [{ type: "room", label: "Rooms", tabs: choreRooms }] : []), ...(maintenanceCats.length > 0 ? [{ type: "maintenance", label: "Maintenance", tabs: maintenanceCats }] : []) ]} active={activeFilter} onSelect={setActiveFilter} />
          <div style={{ marginTop: "1.25rem" }}>
            {agendaEvents.length === 0 ? (
              <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.78rem" }}>No upcoming events in the next 90 days.</div>
            ) : (
              agendaEvents.map(({ date, events }) => {
                const isToday = date.getFullYear() === todayYear && date.getMonth() === todayMonth && date.getDate() === todayDay;
                return (
                  <div key={date.toISOString()} style={{ marginBottom: "1.25rem" }}>
                    <div style={{ alignItems: "baseline", display: "flex", gap: "0.6rem", marginBottom: "0.4rem" }}>
                      <span style={{ color: isToday ? "var(--fm-brass)" : "var(--fm-ink-dim)", fontFamily: "var(--fm-serif)", fontSize: "1.3rem", minWidth: "2rem" }}>{date.getDate()}</span>
                      <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>{CAL_DOWS_LONG[date.getDay()]}, {CAL_MONTHS[date.getMonth()]} {date.getFullYear()}</span>
                      {isToday && <span style={{ background: "var(--fm-brass)", borderRadius: "10px", color: "var(--fm-bg)", fontFamily: "var(--fm-mono)", fontSize: "0.5rem", letterSpacing: "0.08em", padding: "0.1rem 0.45rem", textTransform: "uppercase" }}>Today</span>}
                    </div>
                    {events.map((evt, idx) => {
                      const isMaint = evt.type === "maintenance";
                      const tag = isMaint ? getSysTag(evt.row.category) : "CHORE";
                      const tagColor = isMaint ? "var(--fm-brass-dim)" : "var(--fm-cyan)";
                      const label = isMaint ? `${evt.row.item} · ${evt.row.task}` : evt.chore.title;
                      const sub = isMaint ? evt.row.schedule : evt.chore.schedule;
                      const agendaClick = isMaint
                        ? () => setCompletionEvent({ row: evt.row, key: evt.key, date, isCompleted: evt.isCompleted })
                        : () => setDetailEvent({ chore: evt.chore, date });
                      return (
                        <div key={idx} onClick={agendaClick} style={{ alignItems: "center", borderBottom: "1px solid var(--fm-hairline)", cursor: "pointer", display: "flex", gap: "0.6rem", marginLeft: "2.6rem", opacity: evt.isCompleted ? 0.45 : 1, padding: "0.35rem 0.3rem" }} onMouseEnter={e => e.currentTarget.style.background = "var(--fm-bg-raised)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          <span style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: "var(--fm-radius)", color: tagColor, flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.52rem", letterSpacing: "0.05em", padding: "0.1rem 0.3rem" }}>{tag}</span>
                          <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.8rem", textDecoration: evt.isCompleted ? "line-through" : "none" }}>{label}</span>
                          <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", marginLeft: "auto", whiteSpace: "nowrap" }}>{sub}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── YEAR VIEW ──────────────────────────────────────────────────────── */}
      {calView === "Year" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem 2rem" }}>
          <div style={{ alignItems: "center", display: "flex", marginBottom: "1.5rem" }}>
            <button style={navBtnStyle(view.y <= CURRENT_YEAR)} onClick={() => setView(v => ({ ...v, y: v.y - 1 }))} onMouseEnter={e => { if (view.y > CURRENT_YEAR) e.currentTarget.style.color = "var(--fm-brass)"; }} onMouseLeave={e => e.currentTarget.style.color = "var(--fm-brass-dim)"}>‹</button>
            <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "1.15rem", minWidth: "5rem", textAlign: "center" }}>{view.y}</span>
            <button style={navBtnStyle(false)} onClick={() => setView(v => ({ ...v, y: v.y + 1 }))} onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"} onMouseLeave={e => e.currentTarget.style.color = "var(--fm-brass-dim)"}>›</button>
          </div>
          <div style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "repeat(4, 1fr)" }}>
            {Array.from({ length: 12 }, (_, m) => {
              const dim = new Date(view.y, m + 1, 0).getDate();
              const fdow = new Date(view.y, m, 1).getDay();
              const eventDays = yearEventMap[m] ?? new Set();
              const isCurrentMonth = view.y === todayYear && m === todayMonth;
              return (
                <div key={m} onClick={() => { setView({ y: view.y, m }); setCalView("Month"); }} style={{ background: isCurrentMonth ? "var(--fm-bg-raised)" : "var(--fm-bg-panel)", border: `1px solid ${isCurrentMonth ? "var(--fm-brass)" : "var(--fm-hairline)"}`, borderRadius: "6px", cursor: "pointer", padding: "0.75rem" }} onMouseEnter={e => { if (!isCurrentMonth) e.currentTarget.style.borderColor = "var(--fm-hairline2)"; }} onMouseLeave={e => { if (!isCurrentMonth) e.currentTarget.style.borderColor = "var(--fm-hairline)"; }}>
                  <div style={{ color: isCurrentMonth ? "var(--fm-brass)" : "var(--fm-ink-dim)", fontFamily: "var(--fm-serif)", fontSize: "0.85rem", marginBottom: "0.5rem", textAlign: "center" }}>{CAL_MONTHS[m]}</div>
                  <div style={{ display: "grid", gap: "1px", gridTemplateColumns: "repeat(7, 1fr)" }}>
                    {CAL_DOWS.map(d => <div key={d} style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.42rem", textAlign: "center" }}>{d[0]}</div>)}
                    {Array.from({ length: fdow }, (_, i) => <div key={`p${i}`} />)}
                    {Array.from({ length: dim }, (_, i) => {
                      const day = i + 1;
                      const isToday = isCurrentMonth && day === todayDay;
                      const hasEvt = eventDays.has(day);
                      return (
                        <div key={day} style={{ alignItems: "center", display: "flex", flexDirection: "column", justifyContent: "center", padding: "1px 0" }}>
                          <span style={{ alignItems: "center", background: isToday ? "var(--fm-brass)" : "transparent", borderRadius: "50%", color: isToday ? "var(--fm-bg)" : hasEvt ? "var(--fm-ink)" : "var(--fm-ink-mute)", display: "inline-flex", fontFamily: "var(--fm-mono)", fontSize: "0.48rem", height: "12px", justifyContent: "center", width: "12px" }}>{day}</span>
                          {hasEvt && !isToday && <span style={{ background: "var(--fm-cyan)", borderRadius: "50%", display: "block", height: "3px", marginTop: "1px", width: "3px" }} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
