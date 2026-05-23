import { useState, useMemo, useEffect, useRef, Fragment, forwardRef } from "react";
import { createPortal } from "react-dom";
import DatePicker from "react-datepicker";
import FmHeader from "./src/components/FmHeader.jsx";
import FmSubnav from "./src/components/FmSubnav.jsx";
import Tooltip from "./components/Tooltip.jsx";
import { FilterPill, FilterRow } from "./components/FilterPill.jsx";
import { loadTodos, saveTodos, createTodo } from "./lib/todos.js";
import { loadProjects, saveProjects, createProject } from "./lib/projects.js";
import { CATEGORY_TIPS, ITEM_TIPS } from "./lib/tooltips.js";
import {
  loadData, defaultData,
  loadCustomData, saveCustomData,
  loadOverrides, saveOverrides,
} from "./lib/data.js";
import { getCategoriesForGroup, getAllDefaultItems } from "./lib/categoryData.js";
import { loadDeletedCategories, saveDeletedCategories } from "./lib/deletedCategories.js";
import { loadDeletedItems, saveDeletedItems } from "./lib/deletedItems.js";
import { loadDeletedRows, saveDeletedRows } from "./lib/deletedRows.js";
import { loadItemDetails, saveItemDetails } from "./lib/itemDetails.js";
import { loadItemFieldSchemas, saveItemFieldSchemas, loadCustomFieldValues, saveCustomFieldValues } from "./lib/customFields.js";
import { UNIVERSAL_FIELDS, ITEM_FIELDS } from "./lib/fieldLibrary.js";
import {
  loadCategoryTypeOverrides,
  saveCategoryTypeOverrides,
  loadRoomSubtypes,
  saveRoomSubtypes,
  ROOM_SUBTYPES,
  GROUP_ORDER,
  GROUP_LABELS,
  loadCustomGroupTypes,
  saveCustomGroupTypes,
  loadGroupLabelOverrides,
  saveGroupLabelOverrides,
} from "./lib/categoryTypes.js";
import {
  loadEntityTypes,
  getBehaviorClass,
  isSpatial,
  isFunctional,
  isExteriorType as isExteriorTypeUtil,
  isStructureType as isStructureTypeUtil,
  getTypesForClass,
  resolveTypeId,
  getLabelForType,
  getRootTypesForClass,
  getSubtypes,
  createSubtype,
  renameType,
  deleteType,
} from "./lib/entityTypes.js";
import { loadChores, saveChores } from "./lib/chores.js";
import { getFloorsInOrder, loadFloors, saveFloors } from "./lib/floors.js";
import { loadRooms, saveRooms, createRoom, updateRoom } from "./lib/rooms.js";
import { getManufacturers } from "./lib/manufacturers.js";
import { getModels } from "./lib/models.js";
import { polygonCentroid } from "./lib/geometry.js";
import { SEASON_OPTIONS } from "./lib/scheduleOptions.js";
import FollowButton from "./components/FollowButton.jsx";
import SchedulePicker from "./components/SchedulePicker.jsx";
import AddTaskModal from "./components/AddTaskModal.jsx";
import ComboInput from "./components/ComboInput.jsx";
import TodoModal from "./components/TodoModal.jsx";

const PRIORITY_COLORS = {
  low:    "var(--fm-green)",
  medium: "var(--fm-brass)",
  high:   "var(--fm-amber)",
  urgent: "var(--fm-red)",
};

function navBtnStyle(hovered) {
  return {
    background: "transparent",
    border: `1px solid ${hovered ? "var(--fm-brass)" : "var(--fm-ink-dim)"}`,
    borderRadius: "3px",
    color: hovered ? "var(--fm-brass)" : "var(--fm-brass-dim)",
    cursor: "pointer",
    fontFamily: "var(--fm-mono)",
    fontSize: "0.72rem",
    letterSpacing: "0.08em",
    padding: "0.4rem 0.9rem",
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  };
}

function addBtnStyle(hovered) {
  return {
    background: "transparent",
    border: "none",
    color: hovered ? "var(--fm-brass)" : "var(--fm-brass-dim)",
    cursor: "pointer",
    fontFamily: "var(--fm-mono)",
    fontSize: "0.72rem",
    letterSpacing: "0.08em",
    padding: "0.4rem 0",
    transition: "color 0.15s",
    whiteSpace: "nowrap",
  };
}

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

const PurchaseDateTrigger = forwardRef(({ value, onClick }, ref) => (
  <button
    ref={ref}
    onClick={onClick}
    style={{
      background: "var(--fm-bg-raised)",
      border: "1px solid var(--fm-hairline2)",
      borderRadius: "3px",
      boxSizing: "border-box",
      color: value ? "var(--fm-ink)" : "var(--fm-ink-dim)",
      cursor: "pointer",
      fontFamily: "var(--fm-mono)",
      fontSize: "0.75rem",
      padding: "0.3rem 0.5rem",
      textAlign: "left",
      width: "100%",
    }}
  >
    {value || "—"}
  </button>
));

function InlineInput({ initialValue = "", placeholder = "", onCommit, onCancel }) {
  const [value, setValue] = useState(initialValue);
  function commit() { onCommit(value); }
  return (
    <input
      autoFocus
      value={value}
      placeholder={placeholder}
      onChange={e => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      }}
      style={{
        background: "var(--fm-bg-panel)",
        border: "1px solid var(--fm-hairline2)",
        borderRadius: "2px",
        boxSizing: "border-box",
        color: "var(--fm-ink)",
        flex: 1,
        fontFamily: "inherit",
        fontSize: "0.95rem",
        outline: "none",
        padding: "0.1rem 0.4rem",
      }}
    />
  );
}

function InlineComboInput({ placeholder = "", onCommit, onCancel, options = [] }) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(true);
  const [pos, setPos] = useState(null);
  const inputRef = useRef(null);

  const filtered = value === ""
    ? options
    : options.filter(o => o.toLowerCase().includes(value.toLowerCase()));

  useEffect(() => {
    if (focused && filtered.length > 0 && inputRef.current) {
      const r = inputRef.current.getBoundingClientRect();
      setPos({ left: r.left, top: r.bottom, width: r.width });
    } else {
      setPos(null);
    }
  }, [focused, value]);

  function commit(val) { onCommit(val !== undefined ? val : value); }

  return (
    <div style={{ flex: 1 }}>
      <input
        ref={inputRef}
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={e => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); commit(value); }}
        onKeyDown={e => {
          if (e.key === "Enter") { e.preventDefault(); commit(value); }
          if (e.key === "Escape") { e.preventDefault(); onCancel(); }
        }}
        style={{
          background: "var(--fm-bg-panel)",
          border: "1px solid var(--fm-hairline2)",
          borderRadius: "2px",
          boxSizing: "border-box",
          color: "var(--fm-ink)",
          fontFamily: "inherit",
          fontSize: "0.95rem",
          outline: "none",
          padding: "0.1rem 0.4rem",
          width: "100%",
        }}
      />
      {pos && createPortal(
        <div
          onMouseDown={e => e.preventDefault()}
          style={{
            background: "var(--fm-bg-panel)",
            border: "1px solid var(--fm-hairline2)",
            borderRadius: "0 0 2px 2px",
            left: pos.left,
            maxHeight: 200,
            overflowY: "auto",
            position: "fixed",
            top: pos.top,
            width: pos.width,
            zIndex: 9998,
          }}
        >
          {filtered.map(opt => (
            <div
              key={opt}
              onMouseDown={() => commit(opt)}
              style={{
                color: "var(--fm-brass)",
                cursor: "pointer",
                fontFamily: "var(--fm-mono)",
                fontSize: "0.78rem",
                padding: "0.3rem 0.4rem",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--fm-ink-dim)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >
              {opt}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

function ModelComboField({ value = "", models = [], fieldStyle, onChange }) {
  return (
    <ComboInput
      value={value}
      onChange={onChange}
      options={models}
      placeholder="—"
      style={fieldStyle}
    />
  );
}

// ── Floor Plan ────────────────────────────────────────────────────────────────

const FP_GRID = 20;
const FP_W = 2000;
const FP_H = 1360;

const FP_FILL = {
  room:      "rgba(122,181,217,0.12)",
  system:    "rgba(197,164,102,0.12)",
  structure: "rgba(127,176,135,0.12)",
  exterior:  "rgba(150,190,130,0.12)",
  safety:    "rgba(224,115,106,0.12)",
};
const FP_STROKE = {
  room:      "rgba(122,181,217,0.7)",
  system:    "rgba(197,164,102,0.7)",
  structure: "rgba(127,176,135,0.7)",
  exterior:  "rgba(150,190,130,0.7)",
  safety:    "rgba(224,115,106,0.7)",
};

function rectToPolygon({ x, y, w, h }) {
  return { points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] };
}

function polygonArea(points) {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return Math.abs(area / 2);
}

function pointInPolygon(pt, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, yi = points[i].y, xj = points[j].x, yj = points[j].y;
    if ((yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function migratePlacements(placements) {
  const result = {};
  for (const lvl of Object.keys(placements)) {
    result[lvl] = {};
    for (const cat of Object.keys(placements[lvl])) {
      const r = placements[lvl][cat];
      result[lvl][cat] = r.points ? r : rectToPolygon(r);
    }
  }
  return result;
}

function migrateToV3(data) {
  // 1. Migrate fpData.levels → lib/floors.js (only if floors store is empty)
  const existingFloors = loadFloors();
  if (existingFloors.length === 0 && Array.isArray(data.levels)) {
    const migratedFloors = data.levels.map(level => {
      const name = level.name || "Floor 1";
      let kind = "floor", number = 1, glyph = "1";
      if (name === "Basement") { kind = "basement"; glyph = "B"; number = null; }
      else if (name === "Attic") { kind = "attic"; glyph = "A"; number = null; }
      else if (name.toLowerCase().includes("yard") || name.toLowerCase().includes("exterior")) { kind = "yard"; glyph = "G"; number = null; }
      else {
        const m = name.match(/^Floor\s+(\d+)$/i);
        number = m ? parseInt(m[1]) : 1;
        glyph = String(number);
      }
      return { id: level.id, kind, number, label: name, glyph };
    });
    saveFloors(migratedFloors);
  }

  // 2. Rekey placements, zoneItems: catName → roomId using lib/rooms.js entities
  let allRooms = loadRooms();
  const newPlacements = {};
  const newZoneItems = {};
  const catToRoomMap = {};

  for (const levelId of Object.keys(data.placements)) {
    newPlacements[levelId] = {};
    newZoneItems[levelId] = {};
    catToRoomMap[levelId] = {};
    for (const catName of Object.keys(data.placements[levelId])) {
      // Find room matching this category on this floor (may have been seeded with floorId="lvl-1")
      let room = Object.values(allRooms).find(r => r.floorId === levelId && (r.label === catName || r.categoryName === catName));
      if (!room) room = Object.values(allRooms).find(r => r.label === catName || r.categoryName === catName);
      if (!room) {
        const id = `room-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        room = { id, floorId: levelId, label: catName, type: "room", points: [], items: [], categoryName: catName };
        allRooms[id] = room;
      } else if (room.floorId !== levelId) {
        allRooms[room.id] = { ...room, floorId: levelId };
        room = allRooms[room.id];
      }
      catToRoomMap[levelId][catName] = room.id;
      newPlacements[levelId][room.id] = data.placements[levelId][catName];
      const zi = data.zoneItems?.[levelId]?.[catName];
      if (zi) newZoneItems[levelId][room.id] = zi;
    }
  }
  saveRooms(allRooms);

  // 3. Migrate pin zone refs: catName → roomId
  const newPins = {};
  for (const levelId of Object.keys(data.pins || {})) {
    newPins[levelId] = (data.pins[levelId] || []).map(pin => ({
      ...pin,
      zone: catToRoomMap[levelId]?.[pin.zone] || pin.zone,
    }));
  }

  const newData = { ...data, placements: newPlacements, zoneItems: newZoneItems, pins: newPins, version: 3 };
  delete newData.levels;
  saveFpData(newData);
  return newData;
}

function loadFpData() {
  try {
    const raw = JSON.parse(localStorage.getItem("inventory-floor-plan-v2") || "null");
    const hasLevels = raw && Array.isArray(raw.levels) && raw.levels.length > 0;
    const isV3 = raw && raw.version >= 3 && raw.placements;
    if (hasLevels || isV3) {
      let data = { zoneItems: {}, pins: {}, drawings: {}, ...raw, placements: migratePlacements(raw.placements || {}) };
      // v1 → v2: Re-center legacy 1000×680 content into new 2000×1360 canvas
      if (!raw.version || raw.version < 2) {
        const DX = 500, DY = 340;
        const newPlacements = {};
        for (const lvl of Object.keys(data.placements)) {
          newPlacements[lvl] = {};
          for (const cat of Object.keys(data.placements[lvl])) {
            newPlacements[lvl][cat] = { points: data.placements[lvl][cat].points.map(p => ({ x: p.x + DX, y: p.y + DY })) };
          }
        }
        const newPins = {};
        for (const lvl of Object.keys(data.pins || {})) {
          newPins[lvl] = (data.pins[lvl] || []).map(p => ({ ...p, x: p.x + DX, y: p.y + DY }));
        }
        data = { ...data, placements: newPlacements, pins: newPins, version: 2 };
        saveFpData(data);
      }
      // v2 → v3: Rekey from catName to roomId, migrate levels to lib/floors.js
      if (data.version < 3) {
        data = migrateToV3(data);
      }
      return data;
    }
  } catch {}
  // Default: ensure lib/floors.js has at least one floor
  if (loadFloors().length === 0) saveFloors([{ id: "lvl-1", kind: "floor", number: 1, label: "Floor 1", glyph: "1" }]);
  return { placements: {}, zoneItems: {}, pins: {}, drawings: {}, version: 3 };
}
function saveFpData(data) {
  localStorage.setItem("inventory-floor-plan-v2", JSON.stringify(data));
}
function fpSnap(v) { return Math.round(v / FP_GRID) * FP_GRID; }
// For pins: snap whichever of (center, leading edge, trailing edge) lands closest to the raw value.
// This lets the pin edge sit flush with a zone border rather than center-snapping past it.
function fpSnapPin(center, halfSize) {
  const candidates = [
    fpSnap(center),
    fpSnap(center - halfSize) + halfSize,
    fpSnap(center + halfSize) - halfSize,
  ];
  return candidates.reduce((best, v) => Math.abs(v - center) < Math.abs(best - center) ? v : best);
}

function pinAbbr(item) {
  return item.replace(/\(.*?\)/g, "").trim().slice(0, 4).toUpperCase();
}

function FloorPlan({ categories, categoryTypes, categoryItems, entityTypeData, onCreateCategory, onRenameCategory, onDeleteCategory, onFieldChange, onChangeCategoryType }) {
  const [fpData, setFpData] = useState(() => loadFpData());
  const [floors, setFloors] = useState(() => getFloorsInOrder());
  const [rooms, setRooms] = useState(() => loadRooms());
  const [activeLevel, setActiveLevel] = useState(() => getFloorsInOrder()[0]?.id || "lvl-1");
  const [selected, setSelected] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [editingLevelId, setEditingLevelId] = useState(null);
  const [editingPanelName, setEditingPanelName] = useState(false);
  const [editingPanelType, setEditingPanelType] = useState(false);
  const [selectedPin, setSelectedPin] = useState(null);
  const [ghostPin, setGhostPin] = useState(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: FP_W, h: FP_H });
  const [isPanning, setIsPanning] = useState(false);
  const svgRef = useRef(null);
  const draggingRef = useRef(null);
  const vertexDragRef = useRef(null);
  const fpDataRef = useRef(fpData);
  const activeLevelRef = useRef(activeLevel);
  const sidebarDragRef = useRef(null);
  const pinDragRef = useRef(null);
  const viewBoxRef = useRef({ x: 0, y: 0, w: FP_W, h: FP_H });
  const panDragRef = useRef(null);
  const touchRef = useRef(null);
  const [drawMode, setDrawMode] = useState("select");
  const [inProgress, setInProgress] = useState(null);
  const [cursorPt, setCursorPt] = useState(null);
  const [pendingMarker, setPendingMarker] = useState(null);
  const [markerLabel, setMarkerLabel] = useState("");
  const [drawColor, setDrawColor] = useState("#c9a96e");
  const [drawName, setDrawName] = useState("");
  const drawModeRef = useRef("select");
  const inProgressRef = useRef(null);
  const drawColorRef = useRef("#c9a96e");
  const drawNameRef = useRef("");
  const [selectedTodoMarkerId, setSelectedTodoMarkerId] = useState(null);
  const todoMarkerDragRef = useRef(null);
  const [showTodoCreate, setShowTodoCreate] = useState(false);
  const [pendingTodoLocation, setPendingTodoLocation] = useState(null);

  useEffect(() => { fpDataRef.current = fpData; }, [fpData]);
  useEffect(() => { activeLevelRef.current = activeLevel; }, [activeLevel]);
  useEffect(() => { viewBoxRef.current = viewBox; }, [viewBox]);
  useEffect(() => { drawModeRef.current = drawMode; }, [drawMode]);
  useEffect(() => { inProgressRef.current = inProgress; }, [inProgress]);
  useEffect(() => { drawColorRef.current = drawColor; }, [drawColor]);
  useEffect(() => { drawNameRef.current = drawName; }, [drawName]);

  const currentPlaced = fpData.placements[activeLevel] || {};
  // Build roomId ↔ label maps for the active floor
  const activeFloorRooms = useMemo(() => Object.values(rooms).filter(r => r.floorId === activeLevel), [rooms, activeLevel]);
  const catToRoomId = useMemo(() => Object.fromEntries(activeFloorRooms.map(r => [r.label, r.id])), [activeFloorRooms]);

  function save(newData) {
    fpDataRef.current = newData;
    setFpData(newData);
    saveFpData(newData);
  }

  function commitDrawing(drawing) {
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    const id = `drw-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const typeLabel = drawing.type === "marker" ? "Marker" : drawing.type === "line" ? "Line" : "Path";
    const existing = (d.drawings?.[lvl] || []).filter(dr => dr.type === drawing.type);
    const name = drawNameRef.current.trim() || `${typeLabel} ${existing.length + 1}`;
    const newDrawing = { id, name, color: drawColorRef.current, visible: true, ...drawing };
    save({ ...d, drawings: { ...(d.drawings || {}), [lvl]: [...(d.drawings?.[lvl] || []), newDrawing] } });
    setDrawName("");
  }

  function deleteDrawing(drawId) {
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    save({ ...d, drawings: { ...(d.drawings || {}), [lvl]: (d.drawings?.[lvl] || []).filter(dr => dr.id !== drawId) } });
  }

  function toggleDrawingVisibility(drawId) {
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    save({ ...d, drawings: { ...(d.drawings || {}), [lvl]: (d.drawings?.[lvl] || []).map(dr => dr.id === drawId ? { ...dr, visible: !dr.visible } : dr) } });
  }

  function handleDrawClick(e) {
    e.stopPropagation();
    const rect = svgRef.current.getBoundingClientRect();
    const vb = viewBoxRef.current;
    const x = fpSnap(Math.max(0, Math.min(FP_W, vb.x + (e.clientX - rect.left) / rect.width * vb.w)));
    const y = fpSnap(Math.max(0, Math.min(FP_H, vb.y + (e.clientY - rect.top) / rect.height * vb.h)));
    const mode = drawModeRef.current;
    if (mode === "marker") { setPendingMarker({ x, y }); setMarkerLabel(""); return; }
    if (mode === "path") { setInProgress(p => p ? { ...p, points: [...p.points, { x, y }] } : { type: "path", points: [{ x, y }] }); return; }
    if (mode === "line") {
      const ip = inProgressRef.current;
      if (!ip) { setInProgress({ type: "line", points: [{ x, y }] }); }
      else { commitDrawing({ ...ip, points: [...ip.points, { x, y }] }); setInProgress(null); setDrawMode("select"); }
    }
  }

  function handleDrawDoubleClick(e) {
    if (drawModeRef.current !== "path") return;
    e.stopPropagation();
    const ip = inProgressRef.current;
    if (!ip) return;
    const pts = ip.points.slice(0, -1);
    if (pts.length >= 2) commitDrawing({ ...ip, points: pts });
    setInProgress(null);
    setDrawMode("select");
    setDrawName("");
  }

  function commitMarkerLabel() {
    if (!pendingMarker) return;
    commitDrawing({ type: "marker", x: pendingMarker.x, y: pendingMarker.y, label: markerLabel.trim() || "PT" });
    setPendingMarker(null);
    setMarkerLabel("");
    setDrawMode("select");
  }

  function detectZoneAtPoint(x, y) {
    const placements = fpDataRef.current.placements?.[activeLevelRef.current] || {};
    for (const [roomId, zone] of Object.entries(placements)) {
      if (zone.points && pointInPolygon({ x, y }, zone.points)) return roomId;
    }
    return null;
  }

  function cancelDraw() {
    setDrawMode("select");
    setInProgress(null);
    setCursorPt(null);
    setPendingMarker(null);
    setMarkerLabel("");
  }

  function addPin(cat, item, zone, x, y) {
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    const id = `pin-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const levelPins = [...(d.pins?.[lvl] || []), { id, zone, cat, item, x, y }];
    const currentZoneItems = d.zoneItems?.[lvl]?.[zone] || [];
    const inZone = currentZoneItems.some(z => z.cat === cat && z.item === item);
    const newZoneItems = inZone ? currentZoneItems : [...currentZoneItems, { cat, item }];
    save({
      ...d,
      pins: { ...(d.pins || {}), [lvl]: levelPins },
      zoneItems: { ...(d.zoneItems || {}), [lvl]: { ...(d.zoneItems?.[lvl] || {}), [zone]: newZoneItems } },
    });
    const roomLabel = rooms[zone]?.label;
    if (roomLabel) onFieldChange?.(cat, item, "roomLabel", roomLabel);
  }

  function deletePin(pinId) {
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    save({ ...d, pins: { ...(d.pins || {}), [lvl]: (d.pins?.[lvl] || []).filter(p => p.id !== pinId) } });
    setSelectedPin(null);
  }

  function handlePinMouseDown(e, pinId) {
    e.preventDefault();
    e.stopPropagation();
    setSelectedPin(pinId);
    const pin = (fpDataRef.current.pins?.[activeLevelRef.current] || []).find(p => p.id === pinId);
    if (!pin) return;
    pinDragRef.current = { id: pinId, origX: pin.x, origY: pin.y, startClientX: e.clientX, startClientY: e.clientY };
  }

  function handleTodoMarkerMouseDown(e, dr) {
    e.preventDefault();
    e.stopPropagation();
    setSelectedTodoMarkerId(dr.id);
    todoMarkerDragRef.current = { id: dr.id, todoId: dr.todoId, origX: dr.x, origY: dr.y, startClientX: e.clientX, startClientY: e.clientY, hasDragged: false };
  }

  function updateTodoMarkerPosition(dr, x, y) {
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    // Detect new zone
    const placements = d.placements?.[lvl] || {};
    let newZone = null;
    for (const [rId, zData] of Object.entries(placements)) {
      if (pointInPolygon({ x, y }, zData.points || [])) { newZone = rId; break; }
    }
    // Update drawing marker
    const newDrawings = (d.drawings?.[lvl] || []).map(drw => drw.id === dr.id ? { ...drw, x, y } : drw);
    const next = { ...d, drawings: { ...(d.drawings || {}), [lvl]: newDrawings } };
    save(next);
    // Update todo in localStorage
    const todos = JSON.parse(localStorage.getItem("foreman-todos") || "[]");
    const updated = todos.map(t => t.id === dr.todoId
      ? { ...t, floorPlanLocation: { ...t.floorPlanLocation, x, y, ...(newZone ? { zone: newZone } : {}) } }
      : t
    );
    localStorage.setItem("foreman-todos", JSON.stringify(updated));
  }

  function removeTodoMarker(drawId) {
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    const marker = (d.drawings?.[lvl] || []).find(drw => drw.id === drawId);
    if (!marker?.todoId) return;
    save({ ...d, drawings: { ...(d.drawings || {}), [lvl]: (d.drawings?.[lvl] || []).filter(drw => drw.id !== drawId) } });
    const todos = JSON.parse(localStorage.getItem("foreman-todos") || "[]");
    localStorage.setItem("foreman-todos", JSON.stringify(todos.map(t => t.id === marker.todoId ? { ...t, floorPlanLocation: null } : t)));
    setSelectedTodoMarkerId(null);
  }

  function renameRoom(roomId, newLabel) {
    updateRoom(roomId, { label: newLabel });
    setRooms(loadRooms());
    setEditingPanelName(false);
  }

  function addToCanvas(cat) {
    const floorId = activeLevelRef.current;
    const existing = fpDataRef.current.placements[floorId] || {};
    const taken = Object.values(existing);
    let x = FP_GRID * 4, y = FP_GRID * 4;
    const W = 200, H = 120;
    outer: for (let row = 0; row < 20; row++) {
      for (let col = 0; col < 20; col++) {
        const tx = FP_GRID * 4 + col * (W + FP_GRID);
        const ty = FP_GRID * 4 + row * (H + FP_GRID);
        if (tx + W > FP_W || ty + H > FP_H) continue;
        const overlaps = taken.some(r => {
          const bx = Math.min(...r.points.map(p => p.x)), bx2 = Math.max(...r.points.map(p => p.x));
          const by = Math.min(...r.points.map(p => p.y)), by2 = Math.max(...r.points.map(p => p.y));
          return tx < bx2 && tx + W > bx && ty < by2 && ty + H > by;
        });
        if (!overlaps) { x = tx; y = ty; break outer; }
      }
    }
    // Find or create Room entity for this category on this floor
    const allRooms = loadRooms();
    let room = Object.values(allRooms).find(r => r.floorId === floorId && (r.label === cat || r.categoryName === cat));
    if (!room) room = Object.values(allRooms).find(r => r.label === cat || r.categoryName === cat);
    let roomId;
    if (room) {
      if (room.floorId !== floorId) { updateRoom(room.id, { floorId }); }
      roomId = room.id;
    } else {
      const newRoom = createRoom(floorId, cat);
      roomId = newRoom.id;
    }
    setRooms(loadRooms());
    const d = fpDataRef.current;
    save({
      ...d,
      placements: { ...d.placements, [floorId]: { ...existing, [roomId]: rectToPolygon({ x, y, w: W, h: H }) } },
    });
    setSelected(roomId); setEditingPanelName(false);
  }

  function removeFromCanvas(roomId) {
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    const { [roomId]: _, ...rest } = d.placements[lvl] || {};
    save({ ...d, placements: { ...d.placements, [lvl]: rest } });
    if (selected === roomId) setSelected(null);
  }

  function handleRoomMouseDown(e, roomId) {
    e.preventDefault();
    e.stopPropagation();
    setSelected(roomId); setEditingPanelName(false);
    const svgRect = svgRef.current.getBoundingClientRect();
    const vb = viewBoxRef.current;
    const zonePoly = (fpDataRef.current.placements[activeLevelRef.current] || {})[roomId];
    draggingRef.current = {
      roomId,
      startSVGX: vb.x + (e.clientX - svgRect.left) / svgRect.width * vb.w,
      startSVGY: vb.y + (e.clientY - svgRect.top) / svgRect.height * vb.h,
      startPoints: zonePoly.points.map(p => ({ ...p })),
    };
    setDragging(roomId);
  }

  function handleVertexMouseDown(e, roomId, vi) {
    e.preventDefault();
    e.stopPropagation();
    vertexDragRef.current = { roomId, vi, startX: e.clientX, startY: e.clientY };
  }

  function handleEdgeClick(e, roomId, edgeStartIdx) {
    e.preventDefault();
    e.stopPropagation();
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    const zonePoly = (d.placements[lvl] || {})[roomId];
    const svgRect = svgRef.current.getBoundingClientRect();
    const vb = viewBoxRef.current;
    const newPt = {
      x: fpSnap(Math.max(0, Math.min(FP_W, vb.x + (e.clientX - svgRect.left) / svgRect.width * vb.w))),
      y: fpSnap(Math.max(0, Math.min(FP_H, vb.y + (e.clientY - svgRect.top) / svgRect.height * vb.h))),
    };
    const newPoints = [...zonePoly.points];
    newPoints.splice(edgeStartIdx + 1, 0, newPt);
    save({ ...d, placements: { ...d.placements, [lvl]: { ...(d.placements[lvl] || {}), [roomId]: { points: newPoints } } } });
  }

  useEffect(() => {
    function onMove(e) {
      if (!svgRef.current) return;
      const svgRect = svgRef.current.getBoundingClientRect();
      const vb = viewBoxRef.current;
      const scaleX = vb.w / svgRect.width;
      const scaleY = vb.h / svgRect.height;

      // Update draw cursor ghost
      if (drawModeRef.current !== "select") {
        const rawX = vb.x + (e.clientX - svgRect.left) * scaleX;
        const rawY = vb.y + (e.clientY - svgRect.top) * scaleY;
        setCursorPt({ x: fpSnap(Math.max(0, Math.min(FP_W, rawX))), y: fpSnap(Math.max(0, Math.min(FP_H, rawY))) });
      }

      if (vertexDragRef.current) {
        const { roomId, vi } = vertexDragRef.current;
        const d = fpDataRef.current;
        const lvl = activeLevelRef.current;
        const zonePoly = (d.placements[lvl] || {})[roomId];
        const nx = fpSnap(Math.max(0, Math.min(FP_W, vb.x + (e.clientX - svgRect.left) * scaleX)));
        const ny = fpSnap(Math.max(0, Math.min(FP_H, vb.y + (e.clientY - svgRect.top) * scaleY)));
        const newPoints = zonePoly.points.map((p, i) => i === vi ? { x: nx, y: ny } : p);
        const next = { ...d, placements: { ...d.placements, [lvl]: { ...(d.placements[lvl] || {}), [roomId]: { points: newPoints } } } };
        fpDataRef.current = next;
        setFpData({ ...next });
        return;
      }

      if (draggingRef.current) {
        const { roomId, startSVGX, startSVGY, startPoints } = draggingRef.current;
        const d = fpDataRef.current;
        const lvl = activeLevelRef.current;
        const svgX = vb.x + (e.clientX - svgRect.left) * scaleX;
        const svgY = vb.y + (e.clientY - svgRect.top) * scaleY;
        const dx = fpSnap(svgX - startSVGX);
        const dy = fpSnap(svgY - startSVGY);
        const minX = Math.min(...startPoints.map(p => p.x));
        const maxX = Math.max(...startPoints.map(p => p.x));
        const minY = Math.min(...startPoints.map(p => p.y));
        const maxY = Math.max(...startPoints.map(p => p.y));
        const cdx = Math.max(-minX, Math.min(FP_W - maxX, dx));
        const cdy = Math.max(-minY, Math.min(FP_H - maxY, dy));
        const newPoints = startPoints.map(p => ({ x: p.x + cdx, y: p.y + cdy }));
        const next = { ...d, placements: { ...d.placements, [lvl]: { ...(d.placements[lvl] || {}), [roomId]: { points: newPoints } } } };
        fpDataRef.current = next;
        setFpData({ ...next });
        return;
      }

      // Pan drag
      if (panDragRef.current) {
        const { startX, startY, startVbX, startVbY } = panDragRef.current;
        const dx = (startX - e.clientX) * scaleX;
        const dy = (startY - e.clientY) * scaleY;
        const nx = Math.max(0, Math.min(FP_W - vb.w, startVbX + dx));
        const ny = Math.max(0, Math.min(FP_H - vb.h, startVbY + dy));
        const newVb = { ...vb, x: nx, y: ny };
        viewBoxRef.current = newVb;
        setViewBox(newVb);
        return;
      }

      // Ghost pin during sidebar drag
      if (sidebarDragRef.current) {
        const rawX = vb.x + (e.clientX - svgRect.left) * scaleX;
        const rawY = vb.y + (e.clientY - svgRect.top) * scaleY;
        const svgX = fpSnapPin(Math.max(18, Math.min(FP_W - 18, rawX)), 18);
        const svgY = fpSnapPin(Math.max(9, Math.min(FP_H - 9, rawY)), 9);
        setGhostPin({ ...sidebarDragRef.current, x: svgX, y: svgY });
        return;
      }

      // Pin reposition drag
      if (pinDragRef.current) {
        const { id, origX, origY, startClientX, startClientY } = pinDragRef.current;
        const dx = (e.clientX - startClientX) * scaleX;
        const dy = (e.clientY - startClientY) * scaleY;
        const nx = fpSnapPin(Math.max(18, Math.min(FP_W - 18, origX + dx)), 18);
        const ny = fpSnapPin(Math.max(9, Math.min(FP_H - 9, origY + dy)), 9);
        const d = fpDataRef.current;
        const lvl = activeLevelRef.current;
        const newPins = (d.pins?.[lvl] || []).map(p => p.id === id ? { ...p, x: nx, y: ny } : p);
        const next = { ...d, pins: { ...(d.pins || {}), [lvl]: newPins } };
        fpDataRef.current = next;
        setFpData({ ...next });
      }

      // Todo marker drag
      if (todoMarkerDragRef.current) {
        const { id, origX, origY, startClientX, startClientY } = todoMarkerDragRef.current;
        const dx = (e.clientX - startClientX) * scaleX;
        const dy = (e.clientY - startClientY) * scaleY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) todoMarkerDragRef.current.hasDragged = true;
        const nx = fpSnap(Math.max(0, Math.min(FP_W, origX + dx)));
        const ny = fpSnap(Math.max(0, Math.min(FP_H, origY + dy)));
        const d = fpDataRef.current;
        const lvl = activeLevelRef.current;
        const newDrawings = (d.drawings?.[lvl] || []).map(drw => drw.id === id ? { ...drw, x: nx, y: ny } : drw);
        const next = { ...d, drawings: { ...(d.drawings || {}), [lvl]: newDrawings } };
        fpDataRef.current = next;
        setFpData({ ...next });
      }
    }

    function onUp(e) {
      if (vertexDragRef.current) {
        const { roomId, vi, startX, startY } = vertexDragRef.current;
        vertexDragRef.current = null;
        const moved = Math.abs(e.clientX - startX) > 4 || Math.abs(e.clientY - startY) > 4;
        if (moved) {
          saveFpData(fpDataRef.current);
        } else {
          const d = fpDataRef.current;
          const lvl = activeLevelRef.current;
          const zonePoly = (d.placements[lvl] || {})[roomId];
          if (zonePoly && zonePoly.points.length > 3) {
            const newPoints = zonePoly.points.filter((_, i) => i !== vi);
            save({ ...d, placements: { ...d.placements, [lvl]: { ...(d.placements[lvl] || {}), [roomId]: { points: newPoints } } } });
          } else {
            saveFpData(d);
          }
        }
        return;
      }
      if (draggingRef.current) { saveFpData(fpDataRef.current); draggingRef.current = null; setDragging(null); return; }

      // End pan drag
      if (panDragRef.current) {
        const { startX, startY } = panDragRef.current;
        panDragRef.current = null;
        setIsPanning(false);
        if (Math.abs(e.clientX - startX) <= 4 && Math.abs(e.clientY - startY) <= 4) {
          setSelected(null); setSelectedPin(null); setSelectedTodoMarkerId(null);
        }
        return;
      }

      // Drop pin from sidebar onto canvas
      if (sidebarDragRef.current) {
        const { cat, item } = sidebarDragRef.current;
        sidebarDragRef.current = null;
        setGhostPin(null);
        if (svgRef.current) {
          const r = svgRef.current.getBoundingClientRect();
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            const vb2 = viewBoxRef.current;
            const rawPx = vb2.x + (e.clientX - r.left) / r.width * vb2.w;
            const rawPy = vb2.y + (e.clientY - r.top) / r.height * vb2.h;
            const px = fpSnapPin(Math.max(18, Math.min(FP_W - 18, rawPx)), 18);
            const py = fpSnapPin(Math.max(9, Math.min(FP_H - 9, rawPy)), 9);
            const d = fpDataRef.current;
            const lvl = activeLevelRef.current;
            const placements = d.placements[lvl] || {};
            let zoneRoomId = null;
            for (const [rId, zData] of Object.entries(placements)) {
              if (pointInPolygon({ x: px, y: py }, zData.points)) { zoneRoomId = rId; break; }
            }
            if (zoneRoomId) {
              const id = `pin-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
              const levelPins = [...(d.pins?.[lvl] || []), { id, zone: zoneRoomId, cat, item, x: px, y: py }];
              const curZI = d.zoneItems?.[lvl]?.[zoneRoomId] || [];
              const inZone = curZI.some(z => z.cat === cat && z.item === item);
              const newZI = inZone ? curZI : [...curZI, { cat, item }];
              const newData = {
                ...d,
                pins: { ...(d.pins || {}), [lvl]: levelPins },
                zoneItems: { ...(d.zoneItems || {}), [lvl]: { ...(d.zoneItems?.[lvl] || {}), [zoneRoomId]: newZI } },
              };
              fpDataRef.current = newData;
              setFpData(newData);
              saveFpData(newData);
            }
          }
        }
        return;
      }

      // Persist pin reposition
      if (pinDragRef.current) { saveFpData(fpDataRef.current); pinDragRef.current = null; }

      // Persist todo marker drag
      if (todoMarkerDragRef.current) {
        const { id, hasDragged } = todoMarkerDragRef.current;
        todoMarkerDragRef.current = null;
        if (hasDragged) {
          const d = fpDataRef.current;
          const lvl = activeLevelRef.current;
          const marker = (d.drawings?.[lvl] || []).find(drw => drw.id === id);
          if (marker) updateTodoMarkerPosition(marker, marker.x, marker.y);
        }
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // Wheel zoom — must be non-passive to call preventDefault()
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    function onWheel(e) {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const vb = viewBoxRef.current;
      const factor = e.deltaY > 0 ? 1.12 : (1 / 1.12);
      const cx = vb.x + (e.clientX - rect.left) / rect.width * vb.w;
      const cy = vb.y + (e.clientY - rect.top) / rect.height * vb.h;
      const nw = Math.max(200, Math.min(FP_W, vb.w * factor));
      const nh = nw * (FP_H / FP_W);
      const nx = Math.max(0, Math.min(FP_W - nw, cx - (cx - vb.x) / vb.w * nw));
      const ny = Math.max(0, Math.min(FP_H - nh, cy - (cy - vb.y) / vb.h * nh));
      const newVb = { x: nx, y: ny, w: nw, h: nh };
      viewBoxRef.current = newVb;
      setViewBox(newVb);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Keydown: Escape cancels draw, Enter commits path
  useEffect(() => {
    if (drawMode === "select") return;
    function onKeyDown(e) {
      if (e.key === "Escape") { cancelDraw(); return; }
      if (e.key === "Enter" && drawMode === "path" && inProgress && inProgress.points.length >= 2) {
        const d = fpDataRef.current;
        const lvl = activeLevelRef.current;
        const id = `drw-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
        const name = drawNameRef.current.trim() || `Path ${(d.drawings?.[lvl] || []).filter(dr => dr.type === "path").length + 1}`;
        save({ ...d, drawings: { ...(d.drawings || {}), [lvl]: [...(d.drawings?.[lvl] || []), { id, name, type: "path", color: drawColorRef.current, visible: true, points: inProgress.points }] } });
        setDrawName("");
        setInProgress(null);
        setDrawMode("select");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawMode, inProgress]);

  const [showLevelPicker, setShowLevelPicker] = useState(false);
  const [addedItemsExpanded, setAddedItemsExpanded] = useState(true);
  const [hoveredLevelId, setHoveredLevelId] = useState(null);
  const [hoveredCatId, setHoveredCatId] = useState(null);
  const [editingCatId, setEditingCatId] = useState(null);
  const [showCatTypePicker, setShowCatTypePicker] = useState(false);
  const [newCatType, setNewCatType] = useState(null);
  const [newCatName, setNewCatName] = useState("");
  const [levelDragIdx, setLevelDragIdx] = useState(null);
  const [levelDragOverIdx, setLevelDragOverIdx] = useState(null);

  function handleLevelReorder(fromIdx, toIdx) {
    if (fromIdx === toIdx || fromIdx == null) return;
    // Assign custom sort orders so manual order is preserved
    const ordered = [...floors];
    const [moved] = ordered.splice(fromIdx, 1);
    ordered.splice(toIdx, 0, moved);
    const updatedFloors = loadFloors().map(f => {
      const idx = ordered.findIndex(o => o.id === f.id);
      return { ...f, customOrder: idx >= 0 ? idx : 999 };
    });
    saveFloors(updatedFloors);
    setFloors(getFloorsInOrder());
  }

  function deleteLevel(id) {
    const allFloors = loadFloors();
    if (allFloors.length <= 1) return;
    const d = fpDataRef.current;
    const next = { ...d, placements: { ...d.placements }, zoneItems: { ...(d.zoneItems || {}) } };
    delete next.placements[id];
    delete next.zoneItems[id];
    saveFloors(allFloors.filter(f => f.id !== id));
    save(next);
    const remaining = getFloorsInOrder();
    setFloors(remaining);
    if (activeLevel === id) { setActiveLevel(remaining[0]?.id || ""); setSelected(null); }
  }

  function addLevelOfType(type) {
    setShowLevelPicker(false);
    const kindMap = { "Floor": "floor", "Basement": "basement", "Attic": "attic", "Yard / Exterior": "yard" };
    const kind = kindMap[type] || "floor";
    let newFloorId;
    try {
      const allFloors = loadFloors();
      const existsUnique = (kind !== "floor") && allFloors.some(f => f.kind === kind);
      if (existsUnique) return; // unique floor already exists
      const id = `lvl-${Date.now()}`;
      let label = type;
      let number = null;
      let glyph = type[0].toUpperCase();
      if (kind === "floor") {
        number = allFloors.filter(f => f.kind === "floor").length + 1;
        label = `Floor ${number}`;
        glyph = String(number);
      }
      const newFloor = { id, kind, number, label, glyph };
      saveFloors([...allFloors, newFloor]);
      newFloorId = id;
    } catch { return; }
    const newFloors = getFloorsInOrder();
    setFloors(newFloors);
    setActiveLevel(newFloorId);
    setSelected(null);
    setEditingLevelId(newFloorId);
  }

  function renameLevel(id, name) {
    const trimmed = name.trim();
    setEditingLevelId(null);
    if (!trimmed) return;
    const allFloors = loadFloors();
    saveFloors(allFloors.map(f => f.id === id ? { ...f, label: trimmed } : f));
    setFloors(getFloorsInOrder());
  }

  const [zoneSearch, setZoneSearch] = useState("");

  const allInventoryItems = useMemo(() =>
    Object.entries(categoryItems).flatMap(([cat, items]) => items.map(item => ({ cat, item }))),
    [categoryItems]
  );

  const searchResults = useMemo(() => {
    const q = zoneSearch.trim().toLowerCase();
    const pool = q
      ? allInventoryItems.filter(({ cat, item }) =>
          item.toLowerCase().includes(q) || cat.toLowerCase().includes(q))
      : allInventoryItems.slice(0, 60);
    return pool;
  }, [allInventoryItems, zoneSearch]);

  const selZoneItems = useMemo(() => {
    if (!selected) return [];
    return (fpData.zoneItems?.[activeLevel]?.[selected]) || [];
  }, [fpData, activeLevel, selected]);

  function toggleZoneItem(cat, item) {
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    const sel = selected; // roomId
    if (!sel) return;
    const current = d.zoneItems?.[lvl]?.[sel] || [];
    const exists = current.some(z => z.cat === cat && z.item === item);
    const next = exists
      ? current.filter(z => !(z.cat === cat && z.item === item))
      : [...current, { cat, item }];
    save({
      ...d,
      zoneItems: { ...(d.zoneItems || {}), [lvl]: { ...(d.zoneItems?.[lvl] || {}), [sel]: next } },
    });
  }

  const activeLevelName = floors.find(f => f.id === activeLevel)?.label || "";
  const selectedRoom = selected ? rooms[selected] : null;
  const selType = selectedRoom ? (categoryTypes[selectedRoom.label] || "system") : null;
  const selRoom = selected ? currentPlaced[selected] : null;

  const placedOnAnyLevel = useMemo(() => {
    const set = new Set();
    Object.values(rooms).forEach(room => {
      if (fpData.placements[room.floorId]?.[room.id]) set.add(room.label);
    });
    return set;
  }, [fpData, rooms]);

  const sortedCategories = useMemo(() => {
    return [...categories]
      .filter(cat => {
        if (placedOnAnyLevel.has(cat)) return false;
        // Only Spatial categories can be drawn as floor plan zones
        return isSpatial(resolveTypeId(cat, categoryTypes[cat] || "system"), entityTypeData);
      })
      .sort((a, b) => {
        const ga = GROUP_ORDER.indexOf(categoryTypes[a] || "system");
        const gb = GROUP_ORDER.indexOf(categoryTypes[b] || "system");
        if (ga !== gb) return ga - gb;
        return a.localeCompare(b);
      });
  }, [categories, categoryTypes, placedOnAnyLevel, entityTypeData]);

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

      {/* Left sidebar */}
      <div style={{ borderRight: "1px solid var(--fm-hairline)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden", width: 200 }}>

        {/* Add to canvas */}
        <div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}>
          <div style={{ color: "var(--fm-brass)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", flexShrink: 0, letterSpacing: "0.14em", padding: "1rem 1rem 0.4rem", textTransform: "uppercase" }}>
            Add to Floor Plan
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {/* Pending new category input row */}
            {newCatType && (
              <div style={{ alignItems: "center", display: "flex", gap: "0.45rem", padding: "0.25rem 1rem" }}>
                <div style={{ background: "transparent", border: `1px solid ${FP_STROKE[newCatType] || FP_STROKE.general}`, borderRadius: 2, flexShrink: 0, height: 10, width: 10 }} />
                <input
                  autoFocus
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") { const n = newCatName.trim(); setNewCatType(null); setNewCatName(""); if (n) onCreateCategory(n, newCatType); }
                    if (e.key === "Escape") { setNewCatType(null); setNewCatName(""); }
                  }}
                  onBlur={() => { const n = newCatName.trim(); setNewCatType(null); setNewCatName(""); if (n) onCreateCategory(n, newCatType); }}
                  placeholder="Name…"
                  style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-brass)", borderRadius: 2, color: "var(--fm-ink)", flex: 1, fontFamily: "var(--fm-mono)", fontSize: "0.7rem", minWidth: 0, outline: "none", padding: "0.15rem 0.3rem" }}
                />
              </div>
            )}

            {sortedCategories.length === 0 && !newCatType ? (
              <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", padding: "0.3rem 1rem" }}>All rooms assigned</div>
            ) : sortedCategories.map(cat => {
              const type = categoryTypes[cat] || "system";
              const isHov = hoveredCatId === cat;
              const isEditing = editingCatId === cat;
              return (
                <div
                  key={cat}
                  onMouseEnter={() => setHoveredCatId(cat)}
                  onMouseLeave={() => setHoveredCatId(null)}
                  style={{ alignItems: "center", background: isHov ? "var(--fm-bg-raised)" : "transparent", display: "flex", gap: "0.4rem", padding: "0.3rem 1rem", transition: "background 0.1s" }}
                >
                  <div style={{ background: "transparent", border: `1px solid ${FP_STROKE[type]}`, borderRadius: 2, flexShrink: 0, height: 10, width: 10 }} />
                  {isEditing ? (
                    <input
                      autoFocus
                      defaultValue={cat}
                      onBlur={e => { const v = e.target.value.trim(); if (v && v !== cat) { onRenameCategory(cat, v); const rid = catToRoomId[cat]; if (rid) renameRoom(rid, v); } setEditingCatId(null); }}
                      onKeyDown={e => {
                        if (e.key === "Enter") { const v = e.target.value.trim(); if (v && v !== cat) { onRenameCategory(cat, v); const rid = catToRoomId[cat]; if (rid) renameRoom(rid, v); } setEditingCatId(null); }
                        if (e.key === "Escape") { setEditingCatId(null); }
                      }}
                      onClick={e => e.stopPropagation()}
                      style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-brass)", borderRadius: 2, color: "var(--fm-ink)", flex: 1, fontFamily: "var(--fm-mono)", fontSize: "0.7rem", minWidth: 0, outline: "none", padding: "0.15rem 0.3rem" }}
                    />
                  ) : (
                    <span
                      style={{ color: "var(--fm-ink-dim)", flex: 1, fontFamily: "var(--fm-mono)", fontSize: "0.7rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      onDoubleClick={() => setEditingCatId(cat)}
                    >{cat}</span>
                  )}
                  {isHov && !isEditing && (
                    <>
                      <button
                        onClick={e => { e.stopPropagation(); setEditingCatId(cat); }}
                        style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", flexShrink: 0, fontSize: "0.7rem", lineHeight: 1, padding: "0", transition: "color 0.1s" }}
                        onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink)"}
                        onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                        title="Rename"
                      >✎</button>
                      <button
                        onClick={e => { e.stopPropagation(); onDeleteCategory(cat); }}
                        style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", flexShrink: 0, fontSize: "0.78rem", lineHeight: 1, padding: "0", transition: "color 0.1s" }}
                        onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                        onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                        title="Delete"
                      >×</button>
                    </>
                  )}
                  <span
                    onClick={() => addToCanvas(cat)}
                    style={{ color: "var(--fm-brass)", cursor: "pointer", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.75rem", lineHeight: 1 }}
                    title="Add to canvas"
                  >+</span>
                </div>
              );
            })}
          </div>

          {/* Add category button */}
          <div style={{ borderTop: "1px solid var(--fm-hairline)", flexShrink: 0, position: "relative" }}>
            {showCatTypePicker && (
              <>
                <div onClick={() => setShowCatTypePicker(false)} style={{ bottom: 0, left: 0, position: "fixed", right: 0, top: 0, zIndex: 10 }} />
                <div style={{ background: "var(--fm-bg-panel)", border: "1px solid var(--fm-hairline2)", borderRadius: 4, bottom: "100%", boxShadow: "0 -4px 16px rgba(0,0,0,0.4)", left: 0, position: "absolute", right: 0, zIndex: 11 }}>
                  {[
                    ...getRootTypesForClass("spatial", entityTypeData),
                    ...getRootTypesForClass("functional", entityTypeData),
                  ].map(t => (
                    <div
                      key={t.id}
                      onClick={() => { setShowCatTypePicker(false); setNewCatType(t.id); setNewCatName(""); }}
                      style={{ color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", letterSpacing: "0.08em", padding: "0.5rem 1rem", transition: "background 0.1s, color 0.1s" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "var(--fm-bg-raised)"; e.currentTarget.style.color = "var(--fm-brass)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
                    >
                      {t.label}
                    </div>
                  ))}
                </div>
              </>
            )}
            <button
              onClick={() => setShowCatTypePicker(p => !p)}
              style={{ background: "transparent", border: "none", color: showCatTypePicker ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.1em", padding: "0.6rem 1rem", textAlign: "left", textTransform: "uppercase", transition: "color 0.1s", width: "100%" }}
              onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"}
              onMouseLeave={e => { if (!showCatTypePicker) e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
            >+ Add Category</button>
          </div>
        </div>

        {/* Levels */}
        <div style={{ borderTop: "1px solid var(--fm-hairline)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", padding: "0.55rem 1rem 0.35rem" }}>
            <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>Levels</span>
            <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem" }}>{floors.length}</span>
          </div>

          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {floors.map((level, idx) => {
              const isActive = level.id === activeLevel;
              const lvlPlaced = fpData.placements[level.id] || {};
              const zoneCount = Object.keys(lvlPlaced).length;
              const itemCount = Object.keys(lvlPlaced).reduce((n, rid) => n + (categoryItems[rooms[rid]?.label]?.length || 0), 0);
              const isEditing = editingLevelId === level.id;
              const isHovered = hoveredLevelId === level.id;
              const isDragOver = levelDragOverIdx === idx;
              return (
                <div
                  key={level.id}
                  draggable={!isEditing}
                  onDragStart={e => { e.dataTransfer.effectAllowed = "move"; setLevelDragIdx(idx); }}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setLevelDragOverIdx(idx); }}
                  onDragLeave={() => setLevelDragOverIdx(null)}
                  onDrop={e => { e.preventDefault(); handleLevelReorder(levelDragIdx, idx); setLevelDragIdx(null); setLevelDragOverIdx(null); }}
                  onDragEnd={() => { setLevelDragIdx(null); setLevelDragOverIdx(null); }}
                  onClick={() => { setActiveLevel(level.id); setSelected(null); }}
                  onMouseEnter={() => setHoveredLevelId(level.id)}
                  onMouseLeave={() => setHoveredLevelId(null)}
                  style={{ background: isActive ? "var(--fm-bg-panel)" : "transparent", borderLeft: isActive ? "2px solid var(--fm-brass)" : "2px solid transparent", borderTop: isDragOver ? "2px solid var(--fm-brass)" : "2px solid transparent", cursor: "pointer", padding: "0.4rem 0.5rem 0.35rem 0.65rem", transition: "background 0.1s" }}
                >
                  <div style={{ alignItems: "center", display: "flex", gap: "0.3rem" }}>
                    <span
                      style={{ color: isHovered ? "var(--fm-ink-dim)" : "transparent", cursor: "grab", flexShrink: 0, fontSize: "0.75rem", lineHeight: 1, transition: "color 0.1s", userSelect: "none" }}
                      onMouseDown={e => e.stopPropagation()}
                    >⠿</span>
                    {isEditing ? (
                      <input
                        autoFocus
                        defaultValue={level.label}
                        onBlur={e => renameLevel(level.id, e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") { e.preventDefault(); renameLevel(level.id, e.target.value); }
                          if (e.key === "Escape") { e.preventDefault(); setEditingLevelId(null); }
                        }}
                        onClick={e => e.stopPropagation()}
                        style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-brass)", borderRadius: 2, color: "var(--fm-ink)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.75rem", minWidth: 0, outline: "none", padding: "0.1rem 0.3rem" }}
                      />
                    ) : (
                      <span
                        style={{ color: isActive ? "var(--fm-ink)" : "var(--fm-ink-dim)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.75rem", fontWeight: isActive ? 500 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {level.label}
                      </span>
                    )}
                    {isHovered && !isEditing && (
                      <>
                        <button
                          onClick={e => { e.stopPropagation(); setEditingLevelId(level.id); }}
                          style={{ background: "transparent", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", flexShrink: 0, fontSize: "0.7rem", lineHeight: 1, padding: "0 0.1rem" }}
                          title="Rename"
                        >✎</button>
                        {floors.length > 1 && (
                          <button
                            onClick={e => { e.stopPropagation(); deleteLevel(level.id); }}
                            style={{ background: "transparent", border: "none", color: "var(--fm-red)", cursor: "pointer", flexShrink: 0, fontSize: "0.75rem", lineHeight: 1, padding: "0 0.1rem" }}
                            title="Delete level"
                          >×</button>
                        )}
                      </>
                    )}
                  </div>
                  <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.57rem", letterSpacing: "0.05em", marginLeft: "1rem", marginTop: "0.1rem", textTransform: "uppercase" }}>
                    {zoneCount} zone · {itemCount} items
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ borderTop: "1px solid var(--fm-hairline)", position: "relative" }}>
            {showLevelPicker && (
              <>
                <div onClick={() => setShowLevelPicker(false)} style={{ bottom: 0, left: 0, position: "fixed", right: 0, top: 0, zIndex: 10 }} />
                <div style={{ background: "var(--fm-bg-panel)", border: "1px solid var(--fm-hairline2)", borderRadius: 4, bottom: "100%", boxShadow: "0 -4px 16px rgba(0,0,0,0.4)", left: 0, position: "absolute", right: 0, zIndex: 11 }}>
                  {["Floor", "Basement", "Attic", "Roof"].map(type => (
                    <div
                      key={type}
                      onClick={() => addLevelOfType(type)}
                      style={{ color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", letterSpacing: "0.08em", padding: "0.5rem 1rem", transition: "background 0.1s, color 0.1s" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "var(--fm-bg-raised)"; e.currentTarget.style.color = "var(--fm-brass)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
                    >
                      {type}
                    </div>
                  ))}
                </div>
              </>
            )}
            <button
              onClick={() => setShowLevelPicker(p => !p)}
              style={{ background: "transparent", border: "none", color: showLevelPicker ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.1em", padding: "0.6rem 1rem", textAlign: "left", textTransform: "uppercase", transition: "color 0.1s", width: "100%" }}
              onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"}
              onMouseLeave={e => { if (!showLevelPicker) e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
            >+ Add Level</button>
          </div>
        </div>
      </div>

      {/* SVG canvas */}
      <div style={{ display: "flex", flex: 1, flexDirection: "column", overflow: "hidden", position: "relative" }}>
        {/* Draw toolbar */}
        <div style={{ alignItems: "center", background: "var(--fm-bg)", borderBottom: "1px solid var(--fm-hairline)", display: "flex", flexShrink: 0, gap: "0.4rem", padding: "0.35rem 0.75rem", flexWrap: "wrap" }}>
          {[
            ["select", "↖ Select", null],
            ["path", "✏ Path", "Trace multi-point routes across the plan — e.g. HVAC duct runs, supply/return lines, electrical conduit, or irrigation pipe paths between zones"],
            ["line", "╱ Line", "Mark a single straight segment — e.g. a gas shutoff run, a fence boundary, a wall opening, or the span of a beam between two points"],
            ["marker", "● Marker", "Drop a labeled point — e.g. main water shutoff, circuit breaker location, cleanout access, camera coverage, or any single-location fixture"],
          ].map(([mode, label, tip]) => (
            <button key={mode} onClick={() => { setDrawMode(mode); setInProgress(null); setCursorPt(null); setPendingMarker(null); }}
              title={tip || undefined}
              style={{ background: drawMode === mode ? "var(--fm-bg-panel)" : "transparent", border: `1px solid ${drawMode === mode ? "var(--fm-brass)" : "var(--fm-hairline2)"}`, borderRadius: 3, color: drawMode === mode ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.05em", padding: "0.18rem 0.5rem", transition: "all 0.1s" }}>
              {label}
            </button>
          ))}
          {drawMode !== "select" && (
            <>
              <div style={{ background: "var(--fm-hairline2)", flexShrink: 0, height: 14, width: 1 }} />
              <input value={drawName} onChange={e => setDrawName(e.target.value)}
                placeholder={drawMode === "path" ? "Path name…" : drawMode === "line" ? "Line name…" : "Marker name…"}
                style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: 3, color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.68rem", outline: "none", padding: "0.15rem 0.45rem", width: 130 }} />
              {["#c9a96e", "#7ab5d9", "#7fb087", "#e07b6a", "#9b8ec4", "#a8a29c"].map(c => (
                <div key={c} onClick={() => setDrawColor(c)}
                  style={{ border: drawColor === c ? `2px solid ${c}` : "2px solid transparent", borderRadius: "50%", cursor: "pointer", flexShrink: 0, height: 14, outline: `1px solid ${c}`, outlineOffset: 1, width: 14, background: c }} />
              ))}
              <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.57rem" }}>
                {drawMode === "path" ? "click · dblclick or ↵ to finish" : drawMode === "line" ? "click start · click end" : "click to place"}
              </span>
              <button onClick={cancelDraw} style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", marginLeft: "auto", padding: "0.1rem 0.3rem" }}>esc ×</button>
            </>
          )}
          {(() => {
            const isRoomZone = (roomId) => {
              const lbl = rooms[roomId]?.label;
              const typeId = resolveTypeId(lbl, categoryTypes[lbl] || "system");
              let id = typeId;
              const visited = new Set();
              while (id) {
                if (visited.has(id)) break;
                visited.add(id);
                if (id === "room") return true;
                const t = entityTypeData.types.find(t => t.id === id);
                if (!t) break;
                id = t.parentId;
              }
              return false;
            };
            const totalSqFt = Object.entries(currentPlaced).reduce((sum, [rid, zone]) => isRoomZone(rid) ? sum + polygonArea(zone.points) / (FP_GRID * FP_GRID) : sum, 0);
            const houseSqFt = Object.values(fpData.placements).reduce((sum, lvl) => sum + Object.entries(lvl).reduce((s, [rid, zone]) => isRoomZone(rid) ? s + polygonArea(zone.points) / (FP_GRID * FP_GRID) : s, 0), 0);
            if (houseSqFt === 0) return null;
            const floorName = floors.find(f => f.id === activeLevel)?.label ?? "floor";
            const floorLabel = `${floorName}${floorName.endsWith("s") ? "'" : "'s"} room sq ft:`;
            return (
              <div style={{ alignItems: "center", display: "flex", gap: "1.25rem", marginLeft: "auto" }}>
                <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem" }}>
                  {"House's room sq ft:"} {Math.round(houseSqFt).toLocaleString()}
                </span>
                {totalSqFt > 0 && (
                  <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem" }}>
                    {floorLabel} {Math.round(totalSqFt).toLocaleString()}
                  </span>
                )}
              </div>
            );
          })()}
        </div>

        <svg
          ref={svgRef}
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          style={{ cursor: dragging ? "grabbing" : isPanning ? "grabbing" : drawMode !== "select" ? "crosshair" : "grab", display: "block", flex: 1, userSelect: "none", width: "100%", touchAction: "none" }}
          onMouseDown={e => {
            if (e.button !== 0) return;
            if (drawMode !== "select") return; // draw clicks handled via onClick
            panDragRef.current = { startX: e.clientX, startY: e.clientY, startVbX: viewBoxRef.current.x, startVbY: viewBoxRef.current.y };
            setIsPanning(true);
          }}
          onClick={e => { if (drawMode !== "select") handleDrawClick(e); }}
          onDoubleClick={e => { if (drawMode === "path") handleDrawDoubleClick(e); }}
          onTouchStart={e => {
            if (e.touches.length !== 2) return;
            e.preventDefault();
            touchRef.current = {
              dist: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY),
              midX: (e.touches[0].clientX + e.touches[1].clientX) / 2,
              midY: (e.touches[0].clientY + e.touches[1].clientY) / 2,
              startVb: { ...viewBoxRef.current },
            };
          }}
          onTouchMove={e => {
            if (!touchRef.current || e.touches.length !== 2) return;
            e.preventDefault();
            const rect = svgRef.current.getBoundingClientRect();
            const newDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            const scale = touchRef.current.dist / newDist;
            const { startVb, midX, midY } = touchRef.current;
            const cx = startVb.x + (midX - rect.left) / rect.width * startVb.w;
            const cy = startVb.y + (midY - rect.top) / rect.height * startVb.h;
            const nw = Math.max(200, Math.min(FP_W, startVb.w * scale));
            const nh = nw * (FP_H / FP_W);
            const nx = Math.max(0, Math.min(FP_W - nw, cx - (cx - startVb.x) / startVb.w * nw));
            const ny = Math.max(0, Math.min(FP_H - nh, cy - (cy - startVb.y) / startVb.h * nh));
            const newVb = { x: nx, y: ny, w: nw, h: nh };
            viewBoxRef.current = newVb;
            setViewBox(newVb);
          }}
          onTouchEnd={() => { touchRef.current = null; }}
        >
          <defs>
            <pattern id="fp-sm" width={FP_GRID} height={FP_GRID} patternUnits="userSpaceOnUse">
              <path d={`M ${FP_GRID} 0 L 0 0 0 ${FP_GRID}`} fill="none" stroke="var(--fm-hairline)" strokeWidth="0.5" opacity="0.6" />
            </pattern>
            <pattern id="fp-lg" width={FP_GRID * 5} height={FP_GRID * 5} patternUnits="userSpaceOnUse">
              <rect width={FP_GRID * 5} height={FP_GRID * 5} fill="url(#fp-sm)" />
              <path d={`M ${FP_GRID * 5} 0 L 0 0 0 ${FP_GRID * 5}`} fill="none" stroke="var(--fm-hairline2)" strokeWidth="0.8" opacity="0.7" />
            </pattern>
          </defs>
          <rect width={FP_W} height={FP_H} fill="var(--fm-bg-sunk)" />
          <rect width={FP_W} height={FP_H} fill="url(#fp-lg)" />

          {Object.entries(currentPlaced).map(([roomId, zonePoly]) => {
            const zoneRoom = rooms[roomId];
            if (!zoneRoom) return null;
            const type = categoryTypes[zoneRoom.label] || "system";
            const isSel = selected === roomId;
            const isDrag = dragging === roomId;
            const itemCount = categoryItems[zoneRoom.label]?.length || 0;
            const pts = zonePoly.points;
            const ptStr = pts.map(p => `${p.x},${p.y}`).join(" ");
            const { cx, cy } = polygonCentroid(pts);
            return (
              <g key={roomId}>
                <polygon
                  points={ptStr}
                  fill={FP_FILL[type]}
                  stroke={isSel ? "var(--fm-brass)" : FP_STROKE[type]}
                  strokeWidth={isSel ? 1.5 : 1}
                  opacity={isDrag ? 0.7 : 1}
                  style={{ cursor: "grab" }}
                  onMouseDown={e => handleRoomMouseDown(e, roomId)}
                />
                <text x={cx} y={cy + 5} textAnchor="middle" fill={isSel ? "var(--fm-brass)" : "var(--fm-ink)"} fontSize={11} fontFamily="var(--fm-mono)" style={{ pointerEvents: "none" }}>
                  {zoneRoom.label}
                </text>
                <text x={cx} y={cy + 18} textAnchor="middle" fill="var(--fm-ink-dim)" fontSize={9} fontFamily="var(--fm-mono)" style={{ pointerEvents: "none" }}>
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </text>
                {isSel && (
                  <>
                    {/* Edge hit strips — click anywhere on an edge to insert a vertex */}
                    {pts.map((p0, vi) => {
                      const p1 = pts[(vi + 1) % pts.length];
                      return (
                        <line
                          key={`eh-${vi}`}
                          x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y}
                          stroke="transparent"
                          strokeWidth={12}
                          style={{ cursor: "cell" }}
                          onMouseDown={e => { e.stopPropagation(); handleEdgeClick(e, roomId, vi); }}
                        />
                      );
                    })}
                    {/* Vertex handles — drag to move, click to remove (if 4+ vertices) */}
                    {pts.map((p0, vi) => (
                      <circle
                        key={`vh-${vi}`}
                        cx={p0.x} cy={p0.y} r={5}
                        fill="var(--fm-bg)"
                        stroke="var(--fm-brass)"
                        strokeWidth={1.5}
                        style={{ cursor: pts.length > 3 ? "crosshair" : "grab" }}
                        onMouseDown={e => handleVertexMouseDown(e, roomId, vi)}
                        title={pts.length > 3 ? "Drag to move · Click to remove" : "Drag to move"}
                      />
                    ))}
                    {/* Edge dimension labels */}
                    {pts.map((p0, vi) => {
                      const p1 = pts[(vi + 1) % pts.length];
                      const dx = p1.x - p0.x;
                      const dy = p1.y - p0.y;
                      const edgeLen = Math.hypot(dx, dy);
                      const feet = edgeLen / FP_GRID;
                      if (feet < 1) return null;
                      const mx = (p0.x + p1.x) / 2;
                      const my = (p0.y + p1.y) / 2;
                      const n1x = -dy / edgeLen;
                      const n1y = dx / edgeLen;
                      const dot = (cx - mx) * n1x + (cy - my) * n1y;
                      const outNx = dot > 0 ? -n1x : n1x;
                      const outNy = dot > 0 ? -n1y : n1y;
                      const lx = mx + outNx * 14;
                      const ly = my + outNy * 14;
                      const rawAngle = Math.atan2(dy, dx) * 180 / Math.PI;
                      const textAngle = (rawAngle > 90 || rawAngle < -90) ? rawAngle + 180 : rawAngle;
                      const label = Number.isInteger(feet) ? `${feet} ft` : `${feet.toFixed(1)} ft`;
                      return (
                        <text
                          key={`dim-${vi}`}
                          x={lx} y={ly}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="var(--fm-brass)"
                          fontSize={9}
                          fontFamily="var(--fm-mono)"
                          transform={`rotate(${textAngle}, ${lx}, ${ly})`}
                          style={{ pointerEvents: "none" }}
                        >
                          {label}
                        </text>
                      );
                    })}
                  </>
                )}
              </g>
            );
          })}

          {/* Item pins */}
          {(fpData.pins?.[activeLevel] || []).map(pin => {
            const isSelected = selectedPin === pin.id;
            const stroke = FP_STROKE[categoryTypes[pin.cat] || "system"];
            return (
              <g
                key={pin.id}
                transform={`translate(${pin.x},${pin.y})`}
                style={{ cursor: isSelected ? "grab" : "pointer" }}
                onMouseDown={e => handlePinMouseDown(e, pin.id)}
                onClick={e => { e.stopPropagation(); setSelectedPin(isSelected ? null : pin.id); }}
              >
                <rect x={-18} y={-9} width={36} height={18} rx={3}
                  fill="var(--fm-bg-panel)" stroke={isSelected ? "var(--fm-brass)" : stroke} strokeWidth={1.5} />
                <text textAnchor="middle" dominantBaseline="central"
                  style={{ fill: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "7px", letterSpacing: "0.06em", pointerEvents: "none" }}>
                  {pinAbbr(pin.item)}
                </text>
                {isSelected && (
                  <text x={21} y={-8}
                    style={{ cursor: "pointer", fill: "var(--fm-red)", fontSize: "11px", pointerEvents: "all" }}
                    onMouseDown={e => { e.stopPropagation(); deletePin(pin.id); }}>×</text>
                )}
              </g>
            );
          })}

          {/* Ghost pin during sidebar drag */}
          {ghostPin && (
            <g transform={`translate(${ghostPin.x},${ghostPin.y})`} style={{ pointerEvents: "none" }} opacity={0.5}>
              <rect x={-18} y={-9} width={36} height={18} rx={3}
                fill="var(--fm-bg-panel)" stroke="var(--fm-brass)" strokeWidth={1.5} />
              <text textAnchor="middle" dominantBaseline="central"
                style={{ fill: "var(--fm-brass)", fontFamily: "var(--fm-mono)", fontSize: "7px", letterSpacing: "0.06em" }}>
                {pinAbbr(ghostPin.item)}
              </text>
            </g>
          )}

          {/* Committed drawings */}
          {(fpData.drawings?.[activeLevel] || []).filter(dr => dr.visible !== false).map(dr => {
            if (dr.type === "path" && dr.points?.length >= 2) return (
              <polyline key={dr.id} points={dr.points.map(p => `${p.x},${p.y}`).join(" ")}
                stroke={dr.color} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: "none" }} />
            );
            if (dr.type === "line" && dr.points?.length >= 2) return (
              <line key={dr.id} x1={dr.points[0].x} y1={dr.points[0].y} x2={dr.points[1].x} y2={dr.points[1].y}
                stroke={dr.color} strokeWidth={2.5} strokeLinecap="round" style={{ pointerEvents: "none" }} />
            );
            if (dr.type === "marker") {
              if (dr.todoId) {
                const isSel = selectedTodoMarkerId === dr.id;
                return (
                  <g key={dr.id} style={{ cursor: "grab", pointerEvents: "auto" }}
                    onMouseDown={e => handleTodoMarkerMouseDown(e, dr)}>
                    <circle cx={dr.x} cy={dr.y} r={8}
                      fill={dr.color} stroke={isSel ? "var(--fm-ink)" : "var(--fm-bg)"} strokeWidth={isSel ? 2 : 1.5} />
                    <text x={dr.x} y={dr.y - 13} textAnchor="middle"
                      style={{ fill: dr.color, fontFamily: "var(--fm-mono)", fontSize: "9px", pointerEvents: "none", userSelect: "none" }}>
                      {(dr.label || "").slice(0, 12)}
                    </text>
                  </g>
                );
              }
              return (
                <g key={dr.id} style={{ pointerEvents: "none" }}>
                  <circle cx={dr.x} cy={dr.y} r={5} fill={dr.color} />
                  <text x={dr.x} y={dr.y - 9} textAnchor="middle"
                    style={{ fill: dr.color, fontFamily: "var(--fm-mono)", fontSize: "8px", letterSpacing: "0.04em" }}>
                    {dr.label || dr.name}
                  </text>
                </g>
              );
            }
            return null;
          })}

          {/* In-progress drawing ghost */}
          {inProgress && cursorPt && (
            <g style={{ pointerEvents: "none" }}>
              {inProgress.type === "path" && (
                <polyline
                  points={[...inProgress.points, cursorPt].map(p => `${p.x},${p.y}`).join(" ")}
                  stroke={drawColor} strokeWidth={2.5} fill="none" strokeDasharray="6 3" strokeLinecap="round" opacity={0.7} />
              )}
              {inProgress.type === "line" && inProgress.points.length === 1 && (
                <line x1={inProgress.points[0].x} y1={inProgress.points[0].y} x2={cursorPt.x} y2={cursorPt.y}
                  stroke={drawColor} strokeWidth={2.5} strokeDasharray="6 3" strokeLinecap="round" opacity={0.7} />
              )}
              {(inProgress.points || []).map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={drawColor} />
              ))}
            </g>
          )}

          {/* Crosshair cursor in draw mode */}
          {cursorPt && drawMode !== "select" && !pendingMarker && (
            <g style={{ pointerEvents: "none" }}>
              <circle cx={cursorPt.x} cy={cursorPt.y} r={4} fill="none" stroke={drawColor} strokeWidth={1.5} opacity={0.8} />
              <line x1={cursorPt.x - 10} y1={cursorPt.y} x2={cursorPt.x + 10} y2={cursorPt.y} stroke={drawColor} strokeWidth={1} opacity={0.5} />
              <line x1={cursorPt.x} y1={cursorPt.y - 10} x2={cursorPt.x} y2={cursorPt.y + 10} stroke={drawColor} strokeWidth={1} opacity={0.5} />
            </g>
          )}

          {/* Scale bar */}
          {(() => {
            const NICE = [1, 2, 5, 10, 20, 25, 50, 100, 200];
            const targetFt = viewBox.w * 0.12 / FP_GRID;
            const niceFt = NICE.reduce((best, n) => Math.abs(n - targetFt) < Math.abs(best - targetFt) ? n : best);
            const barW = niceFt * FP_GRID;
            const bx = viewBox.x + 20;
            const by = viewBox.y + viewBox.h - 20;
            const tick = viewBox.h * 0.012;
            const fs = Math.max(7, viewBox.h * 0.014);
            return (
              <g style={{ pointerEvents: "none" }} opacity={0.75}>
                <line x1={bx} y1={by} x2={bx + barW} y2={by} stroke="var(--fm-ink)" strokeWidth={1.5} />
                <line x1={bx} y1={by - tick} x2={bx} y2={by + tick} stroke="var(--fm-ink)" strokeWidth={1.5} />
                <line x1={bx + barW} y1={by - tick} x2={bx + barW} y2={by + tick} stroke="var(--fm-ink)" strokeWidth={1.5} />
                <text x={bx + barW / 2} y={by - tick - 3} textAnchor="middle" dominantBaseline="auto" fill="var(--fm-ink-dim)" fontSize={fs} fontFamily="var(--fm-mono)">
                  {niceFt} ft
                </text>
              </g>
            );
          })()}
        </svg>

        {/* Pending marker label input */}
        {pendingMarker && svgRef.current && (() => {
          const rect = svgRef.current.getBoundingClientRect();
          const vb = viewBoxRef.current;
          const cssX = (pendingMarker.x - vb.x) / vb.w * rect.width;
          const cssY = (pendingMarker.y - vb.y) / vb.h * rect.height;
          return (
            <div style={{ background: "var(--fm-bg-panel)", border: "1px solid var(--fm-brass)", borderRadius: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.4)", left: cssX + 8, padding: "0.35rem 0.5rem", position: "absolute", top: cssY - 30, zIndex: 20 }}>
              <input autoFocus value={markerLabel} onChange={e => setMarkerLabel(e.target.value)}
                placeholder="Label…"
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commitMarkerLabel(); } if (e.key === "Escape") { setPendingMarker(null); setMarkerLabel(""); } }}
                style={{ background: "transparent", border: "none", color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", outline: "none", width: 100 }} />
              <button onClick={commitMarkerLabel} style={{ background: "var(--fm-brass)", border: "none", borderRadius: 2, color: "var(--fm-bg)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", marginLeft: "0.3rem", padding: "0.15rem 0.4rem" }}>OK</button>
              <button
                onClick={() => {
                  if (!pendingMarker) return;
                  const zoneId = detectZoneAtPoint(pendingMarker.x, pendingMarker.y);
                  const zoneRoom = zoneId ? rooms[zoneId] : null;
                  const catName = zoneRoom?.categoryName || zoneRoom?.label || null;
                  const catTypeId = catName ? resolveTypeId(catName, categoryTypes[catName] || "system") : null;
                  const isExt = catTypeId ? isExteriorTypeUtil(catTypeId, entityTypeData) : false;
                  setPendingTodoLocation({
                    levelId: activeLevel,
                    zone: zoneId || null,
                    x: pendingMarker.x,
                    y: pendingMarker.y,
                    preLinkedRoom: catName && !isExt ? catName : null,
                    preLinkedExterior: catName && isExt ? catName : null,
                  });
                  setShowTodoCreate(true);
                  setPendingMarker(null);
                  setMarkerLabel("");
                  setDrawMode("select");
                }}
                style={{ background: "var(--fm-ink-dim)", border: "none", borderRadius: 2, color: "var(--fm-bg)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", marginLeft: "0.3rem", padding: "0.15rem 0.4rem" }}>
                + To Do
              </button>
            </div>
          );
        })()}

        {/* Todo marker info popup */}
        {selectedTodoMarkerId && svgRef.current && (() => {
          const marker = (fpData.drawings?.[activeLevel] || []).find(drw => drw.id === selectedTodoMarkerId);
          if (!marker) return null;
          const rect = svgRef.current.getBoundingClientRect();
          const vb = viewBoxRef.current;
          const cssX = (marker.x - vb.x) / vb.w * rect.width;
          const cssY = (marker.y - vb.y) / vb.h * rect.height;
          return (
            <div style={{ background: "var(--fm-bg-panel)", border: "1px solid var(--fm-hairline2)", borderRadius: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.5)", left: Math.min(cssX + 12, rect.width - 200), maxWidth: 190, padding: "0.5rem 0.6rem", position: "absolute", top: Math.max(4, cssY - 70), zIndex: 20 }}>
              <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.2rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {marker.label}
              </div>
              <div style={{ alignItems: "center", display: "flex", gap: "0.4rem", marginBottom: "0.4rem" }}>
                <div style={{ background: marker.color, borderRadius: "50%", flexShrink: 0, height: 8, width: 8 }} />
                <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.06em" }}>TO DO</span>
              </div>
              <button
                onClick={() => removeTodoMarker(selectedTodoMarkerId)}
                style={{ background: "transparent", border: "1px solid rgba(224,115,106,0.3)", borderRadius: 2, color: "var(--fm-red)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.04em", padding: "0.15rem 0.4rem", transition: "all 0.12s", width: "100%" }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(224,115,106,0.1)"; e.currentTarget.style.borderColor = "var(--fm-red)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "rgba(224,115,106,0.3)"; }}
              >Remove from map</button>
            </div>
          );
        })()}

        {Object.keys(currentPlaced).length === 0 && (
          <div style={{ alignItems: "center", display: "flex", height: "100%", justifyContent: "center", left: 0, pointerEvents: "none", position: "absolute", top: 0, width: "100%" }}>
            <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", letterSpacing: "0.08em" }}>Click items in the sidebar to place them on this level</div>
          </div>
        )}
      </div>

      {/* Create To Do from marker placement */}
      {showTodoCreate && pendingTodoLocation && (() => {
        const loc = pendingTodoLocation;
        const spatialCats = categories.filter(c => isSpatial(resolveTypeId(c, categoryTypes[c] || "system"), entityTypeData));
        const functionalCats = categories.filter(c => isFunctional(resolveTypeId(c, categoryTypes[c] || "system"), entityTypeData));
        const exteriorCats = categories.filter(c => isExteriorTypeUtil(resolveTypeId(c, categoryTypes[c] || "system"), entityTypeData));
        const structureCats = categories.filter(c => isStructureTypeUtil(resolveTypeId(c, categoryTypes[c] || "system"), entityTypeData));
        const PCOLOR = { urgent: "#e07b6a", high: "#e0b266", medium: "#c9a96e", low: "#7fb087" };
        return (
          <TodoModal
            todo={null}
            initialOverrides={{
              floorPlanLocation: { levelId: loc.levelId, zone: loc.zone, x: loc.x, y: loc.y },
              linkedRoom: loc.preLinkedRoom || null,
              linkedExterior: loc.preLinkedExterior || null,
            }}
            categories={categories}
            categoryItems={categoryItems}
            spatialCategories={spatialCats}
            functionalCategories={functionalCats}
            exteriorCategories={exteriorCats}
            structureCategories={structureCats}
            projects={loadProjects()}
            onSave={form => {
              const drawingId = `drw-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
              const newTodo = createTodo({
                ...form,
                floorPlanLocation: { levelId: loc.levelId, zone: loc.zone, x: loc.x, y: loc.y, markerId: drawingId },
              });
              const drawing = {
                id: drawingId,
                type: "marker",
                todoId: newTodo.id,
                label: (newTodo.title || "To Do").slice(0, 14),
                color: PCOLOR[newTodo.priority] || "#c9a96e",
                x: loc.x,
                y: loc.y,
                visible: true,
                name: newTodo.title || "To Do",
              };
              const current = fpDataRef.current;
              const lvlDrawings = current.drawings?.[loc.levelId] || [];
              const newFpData = { ...current, drawings: { ...(current.drawings || {}), [loc.levelId]: [...lvlDrawings, drawing] } };
              save(newFpData);
              saveTodos([...loadTodos(), newTodo]);
              setShowTodoCreate(false);
              setPendingTodoLocation(null);
            }}
            onClose={() => { setShowTodoCreate(false); setPendingTodoLocation(null); }}
          />
        );
      })()}

      {/* Right detail panel */}
      <div style={{ borderLeft: "1px solid var(--fm-hairline)", display: "flex", flexDirection: "column", flexShrink: 0, width: 280 }}>
        {selected && selRoom ? (
          <>
            {/* Header */}
            <div style={{ padding: "0.85rem 1rem 0.7rem" }}>
              <div style={{ alignItems: "center", color: "var(--fm-ink-dim)", display: "flex", fontFamily: "var(--fm-mono)", fontSize: "0.57rem", gap: "0.3rem", letterSpacing: "0.12em", marginBottom: "0.35rem", textTransform: "uppercase" }}>
                {activeLevelName} ·{" "}
                {editingPanelType ? (
                  <select
                    autoFocus
                    value={selType}
                    onChange={e => {
                      onChangeCategoryType?.(selectedRoom.label, e.target.value);
                      setEditingPanelType(false);
                    }}
                    onBlur={() => setEditingPanelType(false)}
                    style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-brass)", borderRadius: 2, color: "var(--fm-brass)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.57rem", letterSpacing: "0.12em", outline: "none", padding: "0.05rem 0.2rem", textTransform: "uppercase" }}
                  >
                    {GROUP_ORDER.map(t => (
                      <option key={t} value={t}>{GROUP_LABELS[t] || t}</option>
                    ))}
                  </select>
                ) : (
                  <span
                    onDoubleClick={() => setEditingPanelType(true)}
                    title="Double-click to change type"
                    style={{ borderBottom: "1px dashed transparent", cursor: "default", transition: "border-color 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.borderBottomColor = "var(--fm-ink-dim)"}
                    onMouseLeave={e => e.currentTarget.style.borderBottomColor = "transparent"}
                  >{GROUP_LABELS[selType] || selType}</span>
                )}
              </div>
              {editingPanelName ? (
                <input
                  autoFocus
                  defaultValue={selectedRoom?.label}
                  onBlur={e => { const v = e.target.value.trim(); const cur = selectedRoom?.label; if (v && v !== cur) { onRenameCategory?.(cur, v); renameRoom(selected, v); } else setEditingPanelName(false); }}
                  onKeyDown={e => {
                    if (e.key === "Enter") { const v = e.target.value.trim(); const cur = selectedRoom?.label; if (v && v !== cur) { onRenameCategory?.(cur, v); renameRoom(selected, v); } else setEditingPanelName(false); }
                    if (e.key === "Escape") setEditingPanelName(false);
                  }}
                  style={{ background: "transparent", border: "none", borderBottom: "1px solid var(--fm-brass)", color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "1.55rem", fontWeight: 400, lineHeight: 1.1, outline: "none", padding: "0 0 2px", width: "100%" }}
                />
              ) : (
                <div
                  style={{ color: "var(--fm-ink)", cursor: "text", fontFamily: "var(--fm-serif)", fontSize: "1.55rem", fontWeight: 400, lineHeight: 1.1 }}
                  onDoubleClick={() => setEditingPanelName(true)}
                  title="Double-click to rename"
                >
                  {selectedRoom?.label}
                </div>
              )}
            </div>
            <div style={{ borderBottom: "1px solid var(--fm-hairline)" }} />


            {/* Stats */}
            <div style={{ display: "flex" }}>
              {[
                { label: "Area", value: `${Math.round(polygonArea(selRoom.points) / (FP_GRID * FP_GRID))} sq ft` },
                { label: "Items", value: categoryItems[selectedRoom?.label]?.length || 0 },
              ].map(({ label, value }, i) => (
                <div key={label} style={{ borderRight: i < 1 ? "1px solid var(--fm-hairline)" : "none", flex: 1, padding: "0.6rem 0.75rem" }}>
                  <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.54rem", letterSpacing: "0.1em", marginBottom: "0.2rem", textTransform: "uppercase" }}>{label}</div>
                  <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "1.3rem", fontWeight: 400 }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{ borderBottom: "1px solid var(--fm-hairline)" }} />

            {/* Items section — scrollable */}
            <div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0, overflowY: "auto" }}>
              {/* Section header */}
              <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", padding: "0.45rem 0.75rem 0.4rem" }}>
                <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Items · {(categoryItems[selectedRoom?.label]?.length || 0) + selZoneItems.filter(z => !(z.cat === selectedRoom?.label)).length}
                </span>
                <button
                  onClick={() => setSelected(null)}
                  style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", padding: "0.1rem 0", transition: "color 0.1s" }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                >— Close</button>
              </div>

              {/* Items in this category */}
              {(() => {
                const nativeItems = categoryItems[selectedRoom?.label] || [];
                const crossItems = selZoneItems.filter(z => z.cat !== selectedRoom?.label);
                const totalAssigned = nativeItems.length + crossItems.length;
                return (
                  <div style={{ borderBottom: "1px solid var(--fm-hairline)", borderTop: "1px solid var(--fm-hairline)" }}>
                    <div
                      onClick={() => setAddedItemsExpanded(p => !p)}
                      style={{ alignItems: "center", cursor: "pointer", display: "flex", justifyContent: "space-between", padding: "0.4rem 0.75rem" }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--fm-bg-panel)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                        Assigned · {totalAssigned}
                      </span>
                      <span style={{ color: "var(--fm-ink-dim)", fontSize: "0.55rem" }}>{addedItemsExpanded ? "▲" : "▼"}</span>
                    </div>
                    {addedItemsExpanded && (
                      <div style={{ paddingBottom: "0.35rem" }}>
                        {totalAssigned === 0 ? (
                          <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-sans)", fontSize: "0.7rem", fontStyle: "italic", padding: "0.25rem 0.75rem 0.5rem" }}>
                            No items assigned. Search below to add.
                          </div>
                        ) : (
                          <>
                            {nativeItems.map(item => (
                              <div key={`native|${item}`} style={{ alignItems: "center", display: "flex", gap: "0.4rem", padding: "0.28rem 0.75rem" }}
                                onMouseEnter={e => e.currentTarget.style.background = "var(--fm-bg-panel)"}
                                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                              >
                                <span
                                  title="Drag to place pin on floor plan"
                                  style={{ color: "var(--fm-ink-dim)", cursor: "grab", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.7rem", lineHeight: 1, paddingRight: "0.1rem", userSelect: "none" }}
                                  onMouseDown={e => { e.preventDefault(); sidebarDragRef.current = { cat: selectedRoom?.label, item }; }}
                                >⠿</span>
                                <span style={{ color: "var(--fm-ink)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item}</span>
                              </div>
                            ))}
                            {crossItems.map(({ cat, item }) => (
                              <div key={`cross|${cat}|${item}`} style={{ alignItems: "center", display: "flex", gap: "0.4rem", padding: "0.28rem 0.75rem" }}
                                onMouseEnter={e => e.currentTarget.style.background = "var(--fm-bg-panel)"}
                                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                              >
                                <span
                                  title="Drag to place pin on floor plan"
                                  style={{ color: "var(--fm-ink-dim)", cursor: "grab", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.7rem", lineHeight: 1, paddingRight: "0.1rem", userSelect: "none" }}
                                  onMouseDown={e => { e.preventDefault(); sidebarDragRef.current = { cat, item }; }}
                                >⠿</span>
                                <span style={{ color: "var(--fm-ink)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item}</span>
                                <span style={{ color: "var(--fm-ink-mute)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.05em" }}>{cat.slice(0, 3).toUpperCase()}</span>
                                <button
                                  onClick={() => toggleZoneItem(cat, item)}
                                  title="Remove from zone"
                                  style={{ background: "none", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.75rem", lineHeight: 1, padding: "0 0.1rem", transition: "color 0.1s" }}
                                  onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                                  onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-mute)"}
                                >×</button>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Search */}
              <div style={{ padding: "0.5rem 0.75rem 0.4rem" }}>
                <input
                  value={zoneSearch}
                  onChange={e => setZoneSearch(e.target.value)}
                  placeholder="Search items to add…"
                  style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: 3, boxSizing: "border-box", color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.75rem", outline: "none", padding: "0.35rem 0.6rem", width: "100%" }}
                  onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
                  onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"}
                />
              </div>

              {/* Search results */}
              <div style={{ flex: 1, overflowY: "auto" }}>
                {searchResults.length === 0 ? (
                  <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", padding: "0.5rem 0.75rem" }}>No matches</div>
                ) : searchResults.map(({ cat, item }) => {
                  const isNative = cat === selectedRoom?.label && (categoryItems[selectedRoom?.label] || []).includes(item);
                  const isAdded = isNative || selZoneItems.some(z => z.cat === cat && z.item === item);
                  return (
                    <div
                      key={`${cat}|${item}`}
                      onClick={() => { if (!isNative) toggleZoneItem(cat, item); }}
                      style={{ alignItems: "center", cursor: isNative ? "default" : "pointer", display: "flex", gap: "0.4rem", padding: "0.3rem 0.75rem", transition: "background 0.1s" }}
                      onMouseEnter={e => { if (!isNative) e.currentTarget.style.background = "var(--fm-bg-panel)"; }}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <span style={{ color: isAdded ? "var(--fm-ink)" : "var(--fm-ink-dim)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item}</span>
                      <span style={{ color: "var(--fm-ink-dim)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.05em" }}>{cat.slice(0, 3).toUpperCase()}</span>
                      <span style={{ color: isNative ? "var(--fm-ink-dim)" : isAdded ? "var(--fm-green)" : "var(--fm-brass)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.72rem", width: "0.8rem" }}>
                        {isAdded ? "✓" : "+"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div style={{ borderTop: "1px solid var(--fm-hairline)", padding: "0.7rem 1rem" }}>
              <button
                onClick={() => removeFromCanvas(selected)}
                style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: 3, color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.1em", padding: "0.45rem 0.85rem", textTransform: "uppercase", transition: "all 0.1s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-red)"; e.currentTarget.style.color = "var(--fm-red)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
              >Remove Zone</button>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}>
            <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", fontStyle: "italic", padding: "0.85rem 1rem 0.6rem", textAlign: "center" }}>
              Click a zone to view details
            </div>
            <div style={{ borderTop: "1px solid var(--fm-hairline)", flex: 1, overflowY: "auto" }}>
              {(() => {
                const allDrawings = fpData.drawings?.[activeLevel] || [];
                const regularDrawings = allDrawings.filter(dr => !dr.todoId);
                const todoMarkers = allDrawings.filter(dr => dr.todoId);
                return (
                  <>
                    <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", padding: "0.5rem 0.75rem 0.35rem" }}>
                      <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                        Drawings · {regularDrawings.length}
                      </span>
                    </div>
                    {regularDrawings.length === 0 ? (
                      <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.7rem", fontStyle: "italic", padding: "0.25rem 0.75rem 0.5rem" }}>
                        Use the toolbar to draw paths, lines, and markers.
                      </div>
                    ) : regularDrawings.map(dr => (
                      <div key={dr.id} style={{ alignItems: "center", borderBottom: "1px solid var(--fm-hairline)", display: "flex", gap: "0.5rem", padding: "0.35rem 0.75rem" }}>
                        <div style={{ background: dr.color, borderRadius: "50%", flexShrink: 0, height: 10, width: 10 }} />
                        <span style={{ color: "var(--fm-ink)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.72rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dr.name}</span>
                        <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem" }}>{dr.type}</span>
                        <button onClick={() => toggleDrawingVisibility(dr.id)}
                          title={dr.visible !== false ? "Hide" : "Show"}
                          style={{ background: "none", border: "none", color: dr.visible !== false ? "var(--fm-ink-dim)" : "var(--fm-ink-mute)", cursor: "pointer", fontSize: "0.75rem", padding: "0 0.1rem" }}>
                          {dr.visible !== false ? "👁" : "○"}
                        </button>
                        <button onClick={() => deleteDrawing(dr.id)}
                          style={{ background: "none", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", padding: "0 0.1rem", transition: "color 0.1s" }}
                          onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                          onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-mute)"}>×</button>
                      </div>
                    ))}
                    {todoMarkers.length > 0 && (
                      <>
                        <div style={{ alignItems: "center", borderTop: "1px solid var(--fm-hairline)", display: "flex", justifyContent: "space-between", padding: "0.5rem 0.75rem 0.35rem" }}>
                          <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                            To Do Pins · {todoMarkers.length}
                          </span>
                        </div>
                        {todoMarkers.map(dr => (
                          <div key={dr.id} style={{ alignItems: "center", borderBottom: "1px solid var(--fm-hairline)", display: "flex", gap: "0.5rem", padding: "0.35rem 0.75rem" }}>
                            <div style={{ background: dr.color, borderRadius: "50%", flexShrink: 0, height: 10, width: 10 }} />
                            <span style={{ color: "var(--fm-ink)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.72rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dr.name}</span>
                            <button onClick={() => removeTodoMarker(dr.id)}
                              title="Remove from map"
                              style={{ background: "none", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", padding: "0 0.1rem", transition: "color 0.1s" }}
                              onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                              onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-mute)"}>×</button>
                          </div>
                        ))}
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Item Inventory View ────────────────────────────────────────────────────────


function InvNoteCell({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); onChange(draft); }}
        onKeyDown={e => {
          if (e.key === "Enter") { e.preventDefault(); setEditing(false); onChange(draft); }
          if (e.key === "Escape") setEditing(false);
        }}
        style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: "var(--fm-radius)", boxSizing: "border-box", color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.78rem", outline: "none", padding: "0.2rem 0.4rem", width: "100%" }}
      />
    );
  }
  return (
    <span
      onClick={() => { setDraft(value || ""); setEditing(true); }}
      style={{ color: value ? "var(--fm-ink-dim)" : "var(--fm-ink-mute)", cursor: "text", display: "block", fontFamily: "var(--fm-sans)", fontSize: "0.78rem", fontStyle: value ? "normal" : "italic", minHeight: "1.2em" }}
    >
      {value || "Add note…"}
    </span>
  );
}

const INV_STATUS_META = {
  active:  { color: "var(--fm-green)",   label: "Active"  },
  partial: { color: "var(--fm-amber)",   label: "Partial" },
  empty:   { color: "var(--fm-ink-dim)", label: "Empty"   },
};

function getInvItemStatus(itemDetails, cat, item) {
  const detail = itemDetails?.[`${cat}|${item}`];
  if (!detail) return "empty";
  if (detail.mfr || detail.model) return "active";
  if (detail.serial || detail.purchaseDate) return "partial";
  return "empty";
}

const INV_SYS_ABBR = {
  "HVAC": "HVAC", "Plumbing": "PLM", "Electrical": "ELEC",
  "Appliances": "APPL", "Exterior": "EXT", "Structure": "STRC",
  "Safety": "SAF", "General": "GEN", "Roofing": "ROOF",
  "Landscaping": "LAND", "Pool": "POOL", "Irrigation": "IRR",
};
function getInvSysTag(cat) {
  return INV_SYS_ABBR[cat] || (cat || "").slice(0, 4).toUpperCase();
}

function OutlineTab({ categories, categoryTypes, categoryItems, entityTypeData, onRefreshEntityTypes, onCreateCategory, onAddItem, customFieldValues, onSelectItem, onDeleteCategory, onRenameCategory }) {
  const [addingChildOf,       setAddingChildOf]       = useState(null);
  const [newChildLabel,       setNewChildLabel]       = useState("");
  const [editingTypeId,       setEditingTypeId]       = useState(null);
  const [editingLabel,        setEditingLabel]        = useState("");
  const [hoveredTypeId,       setHoveredTypeId]       = useState(null);
  const [collapsed,           setCollapsed]           = useState(new Set());
  const [addingCategoryToType, setAddingCategoryToType] = useState(null);
  const [newCategoryName,      setNewCategoryName]      = useState("");
  const [addingItemToCategory, setAddingItemToCategory] = useState(null); // category name | null
  const [newItemName,          setNewItemName]          = useState("");
  const [hoveredCat,           setHoveredCat]           = useState(null);
  const [editingCatName,       setEditingCatName]       = useState(null);
  const [editingCatLabel,      setEditingCatLabel]      = useState("");

  const catsByType = useMemo(() => {
    const map = {};
    (categories || []).forEach(cat => {
      const typeId = resolveTypeId(cat, categoryTypes?.[cat] || "system");
      if (!map[typeId]) map[typeId] = [];
      map[typeId].push(cat);
    });
    return map;
  }, [categories, categoryTypes]);

  const crossRefByRoom = useMemo(() => {
    const map = {};
    Object.entries(customFieldValues || {}).forEach(([key, vals]) => {
      const room = vals?.roomLabel || vals?.room;
      if (!room) return;
      const sepIdx = key.indexOf("|");
      if (sepIdx === -1) return;
      const cat  = key.slice(0, sepIdx);
      const item = key.slice(sepIdx + 1);
      const catTypeId = resolveTypeId(cat, categoryTypes?.[cat] || "system");
      if (isSpatial(catTypeId, entityTypeData)) return;
      if (!map[room]) map[room] = [];
      map[room].push({ category: cat, item });
    });
    return map;
  }, [customFieldValues, categoryTypes, entityTypeData]);

  // Items from spatial categories that declare a system association → appear under that functional system
  const crossRefBySystem = useMemo(() => {
    const map = {};
    Object.entries(customFieldValues || {}).forEach(([key, vals]) => {
      const system = vals?.systemCategory || vals?.system;
      if (!system) return;
      const sepIdx = key.indexOf("|");
      if (sepIdx === -1) return;
      const cat  = key.slice(0, sepIdx);
      const item = key.slice(sepIdx + 1);
      const catTypeId = resolveTypeId(cat, categoryTypes?.[cat] || "system");
      if (isFunctional(catTypeId, entityTypeData)) return;
      if (!map[system]) map[system] = [];
      map[system].push({ category: cat, item });
    });
    return map;
  }, [customFieldValues, categoryTypes, entityTypeData]);

  function commitAdd(parentId) {
    const label = newChildLabel.trim();
    if (label) createSubtype(label, parentId);
    setAddingChildOf(null);
    setNewChildLabel("");
    onRefreshEntityTypes();
  }

  function commitRename(typeId) {
    const label = editingLabel.trim();
    if (label) renameType(typeId, label);
    setEditingTypeId(null);
    setEditingLabel("");
    onRefreshEntityTypes();
  }

  function handleDelete(typeId) {
    deleteType(typeId);
    onRefreshEntityTypes();
  }

  function commitAddCategory(typeId) {
    const name = newCategoryName.trim();
    if (name) onCreateCategory(name, typeId);
    setAddingCategoryToType(null);
    setNewCategoryName("");
  }

  function commitAddItem(cat) {
    const name = newItemName.trim();
    if (name) onAddItem(cat, name);
    setAddingItemToCategory(null);
    setNewItemName("");
  }

  function commitCatRename(oldName) {
    const trimmed = editingCatLabel.trim();
    setEditingCatName(null);
    setEditingCatLabel("");
    if (trimmed && trimmed !== oldName) onRenameCategory?.(oldName, trimmed);
  }

  const ghostBtn = {
    background: "transparent", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer",
    fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.05em", padding: "0.1rem 0.25rem",
    transition: "color 0.1s",
  };

  function renderNode(type, depth) {
    const subtypes = entityTypeData.types.filter(t => t.parentId === type.id);
    const cats = catsByType[type.id] || [];
    const mergedCat = cats.find(c => c.toLowerCase() === type.label.toLowerCase()) || null;
    const mergedCatItems = mergedCat ? (categoryItems?.[mergedCat] || []) : [];
    const mergedCrossRefs = mergedCat && isSpatial(resolveTypeId(mergedCat, categoryTypes?.[mergedCat] || "system"), entityTypeData)
      ? (crossRefByRoom[mergedCat] || []) : [];
    const mergedSystemCrossRefs = mergedCat && isFunctional(resolveTypeId(mergedCat, categoryTypes?.[mergedCat] || "system"), entityTypeData)
      ? (crossRefBySystem[mergedCat] || []) : [];
    const isEditing    = editingTypeId === type.id;
    const isHovered    = hoveredTypeId === type.id;
    const isAddingHere = addingChildOf === type.id;
    const isCollapsed  = collapsed.has(type.id);
    const hasChildren  = subtypes.length > 0 || cats.length > 0;

    function toggleCollapse(e) {
      e.stopPropagation();
      setCollapsed(prev => {
        const next = new Set(prev);
        next.has(type.id) ? next.delete(type.id) : next.add(type.id);
        return next;
      });
    }

    return (
      <div key={type.id}>
        <div
          onMouseEnter={() => setHoveredTypeId(type.id)}
          onMouseLeave={() => setHoveredTypeId(null)}
          onClick={hasChildren ? toggleCollapse : undefined}
          style={{ alignItems: "center", cursor: hasChildren ? "pointer" : "default", display: "flex", gap: "0.45rem", paddingBottom: "0.1rem", paddingLeft: `${depth * 1.4}rem`, paddingTop: "0.22rem" }}
        >
          {depth > 0 && <span style={{ color: "var(--fm-hairline2)", flexShrink: 0, fontSize: "0.55rem" }}>└</span>}
          {hasChildren && (
            <span style={{ color: "var(--fm-ink-mute)", flexShrink: 0, fontSize: "0.52rem", transition: "transform 0.15s", display: "inline-block", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>▾</span>
          )}
          {isEditing ? (
            <input
              autoFocus
              value={editingLabel}
              onChange={e => setEditingLabel(e.target.value)}
              onBlur={() => commitRename(type.id)}
              onKeyDown={e => {
                if (e.key === "Enter") commitRename(type.id);
                if (e.key === "Escape") { setEditingTypeId(null); setEditingLabel(""); }
              }}
              style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-brass)", borderRadius: 2, color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.78rem", outline: "none", padding: "0.1rem 0.3rem", width: 150 }}
            />
          ) : (
            <span
              onDoubleClick={() => { if (!type.builtIn) { setEditingTypeId(type.id); setEditingLabel(type.label); } }}
              style={{ color: type.builtIn ? "var(--fm-ink-dim)" : "var(--fm-ink)", cursor: type.builtIn ? "default" : "text", fontFamily: "var(--fm-serif)", fontSize: depth === 0 ? "1rem" : "0.85rem" }}
            >
              {type.label}
            </span>
          )}
          {mergedCat
            ? (mergedCatItems.length + mergedCrossRefs.length + mergedSystemCrossRefs.length) > 0 && <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem" }}>{mergedCatItems.length + mergedCrossRefs.length + mergedSystemCrossRefs.length}</span>
            : cats.length > 0 && <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem" }}>{cats.length}</span>
          }
          {isHovered && (
            <div style={{ alignItems: "center", display: "flex", gap: "0.1rem", marginLeft: "0.25rem" }}>
              {mergedCat && (
                <>
                  <button
                    onClick={e => { e.stopPropagation(); setAddingItemToCategory(mergedCat); setNewItemName(""); }}
                    style={ghostBtn}
                    onMouseEnter={e => e.currentTarget.style.color = "var(--fm-cyan)"}
                    onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                  >+ Item</button>
                  <button
                    onClick={e => { e.stopPropagation(); onDeleteCategory?.(mergedCat); }}
                    style={{ ...ghostBtn, color: "var(--fm-red)" }}
                  >×</button>
                </>
              )}
              {!mergedCat && (
                <button
                  onClick={e => { e.stopPropagation(); setAddingCategoryToType(type.id); setNewCategoryName(""); }}
                  style={ghostBtn}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--fm-cyan)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                >+ New {type.label}</button>
              )}
              {!type.builtIn && (
                <>
                  <button
                    onClick={e => { e.stopPropagation(); setEditingTypeId(type.id); setEditingLabel(type.label); }}
                    style={ghostBtn}
                    onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink)"}
                    onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                  >✎</button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(type.id); }}
                    style={{ ...ghostBtn, color: "var(--fm-red)" }}
                  >×</button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Inline add-category input */}
        {addingCategoryToType === type.id && (
          <div style={{ paddingLeft: `${(depth + 1) * 1.4 + 0.5}rem`, paddingTop: "0.2rem", paddingBottom: "0.1rem" }}>
            <input
              autoFocus
              placeholder="Category name…"
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              onBlur={() => commitAddCategory(type.id)}
              onKeyDown={e => {
                if (e.key === "Enter") commitAddCategory(type.id);
                if (e.key === "Escape") { setAddingCategoryToType(null); setNewCategoryName(""); }
              }}
              style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-brass)", borderRadius: 2, color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.72rem", outline: "none", padding: "0.15rem 0.4rem", width: 180 }}
            />
          </div>
        )}

        {/* Member categories and their items */}
        {!isCollapsed && cats.map(cat => {
          const items = categoryItems?.[cat] || [];
          const catTypeId = resolveTypeId(cat, categoryTypes?.[cat] || "system");
          const crossRefs = isSpatial(catTypeId, entityTypeData) ? (crossRefByRoom[cat] || []) : [];
          const systemCrossRefs = isFunctional(catTypeId, entityTypeData) ? (crossRefBySystem[cat] || []) : [];
          const crossRefStyle = { alignItems: "center", color: "var(--fm-ink-mute)", cursor: "pointer", display: "flex", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", gap: "0.3rem", paddingBottom: "0.05rem", paddingTop: "0.05rem", transition: "color 0.1s" };

          if (cat.toLowerCase() === type.label.toLowerCase()) {
            return [
              ...items.map(item => (
                <div
                  key={item}
                  onClick={() => onSelectItem?.({ category: cat, item })}
                  style={{ color: "var(--fm-ink-mute)", cursor: onSelectItem ? "pointer" : "default", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", paddingBottom: "0.05rem", paddingLeft: `${(depth + 1) * 1.4 + 0.5}rem`, paddingTop: "0.05rem", transition: "color 0.1s" }}
                  onMouseEnter={e => { if (onSelectItem) e.currentTarget.style.color = "var(--fm-ink)"; }}
                  onMouseLeave={e => { if (onSelectItem) e.currentTarget.style.color = "var(--fm-ink-mute)"; }}
                >
                  {item}
                </div>
              )),
              ...crossRefs.map(({ category: xCat, item: xItem }) => (
                <div key={`xref-room-${xCat}|${xItem}`} onClick={() => onSelectItem?.({ category: xCat, item: xItem })}
                  style={{ ...crossRefStyle, paddingLeft: `${(depth + 1) * 1.4 + 0.5}rem` }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-mute)"}
                >
                  {xItem}<span style={{ color: "var(--fm-ink-mute)", fontSize: "0.52rem", opacity: 0.6 }}>· {xCat}</span>
                </div>
              )),
              ...systemCrossRefs.map(({ category: xCat, item: xItem }) => (
                <div key={`xref-sys-${xCat}|${xItem}`} onClick={() => onSelectItem?.({ category: xCat, item: xItem })}
                  style={{ ...crossRefStyle, paddingLeft: `${(depth + 1) * 1.4 + 0.5}rem` }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-mute)"}
                >
                  {xItem}<span style={{ color: "var(--fm-ink-mute)", fontSize: "0.52rem", opacity: 0.6 }}>· {xCat}</span>
                </div>
              )),
              addingItemToCategory === cat && (
                <div key="__add-item" style={{ paddingLeft: `${(depth + 1) * 1.4 + 0.5}rem`, paddingTop: "0.15rem", paddingBottom: "0.1rem" }}>
                  <input
                    autoFocus
                    placeholder="Item name…"
                    value={newItemName}
                    onChange={e => setNewItemName(e.target.value)}
                    onBlur={() => commitAddItem(cat)}
                    onKeyDown={e => {
                      if (e.key === "Enter") commitAddItem(cat);
                      if (e.key === "Escape") { setAddingItemToCategory(null); setNewItemName(""); }
                    }}
                    style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-brass)", borderRadius: 2, color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.72rem", outline: "none", padding: "0.15rem 0.4rem", width: 180 }}
                  />
                </div>
              ),
            ];
          }
          return (
            <div key={cat}>
              <div
                onMouseEnter={() => setHoveredCat(cat)}
                onMouseLeave={() => setHoveredCat(null)}
                style={{ alignItems: "center", color: "var(--fm-ink-dim)", display: "flex", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", gap: "0.35rem", paddingBottom: "0.08rem", paddingLeft: `${(depth + 1) * 1.4 + 0.5}rem`, paddingTop: "0.08rem" }}
              >
                {editingCatName === cat ? (
                  <input
                    autoFocus
                    value={editingCatLabel}
                    onChange={e => setEditingCatLabel(e.target.value)}
                    onBlur={() => commitCatRename(cat)}
                    onKeyDown={e => {
                      if (e.key === "Enter") commitCatRename(cat);
                      if (e.key === "Escape") { setEditingCatName(null); setEditingCatLabel(""); }
                    }}
                    onClick={e => e.stopPropagation()}
                    style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-brass)", borderRadius: 2, color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", outline: "none", padding: "0.1rem 0.3rem", width: 160 }}
                  />
                ) : (
                  <span
                    onDoubleClick={e => { e.stopPropagation(); setEditingCatName(cat); setEditingCatLabel(cat); }}
                    style={{ cursor: "text" }}
                  >{cat}</span>
                )}
                {editingCatName !== cat && (items.length + crossRefs.length + systemCrossRefs.length) > 0 && <span style={{ color: "var(--fm-ink-mute)" }}>{items.length + crossRefs.length + systemCrossRefs.length}</span>}
                {hoveredCat === cat && (
                  <>
                    <button
                      onClick={e => { e.stopPropagation(); setAddingItemToCategory(cat); setNewItemName(""); }}
                      style={ghostBtn}
                      onMouseEnter={e => e.currentTarget.style.color = "var(--fm-cyan)"}
                      onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                    >+ Item</button>
                    <button
                      onClick={e => { e.stopPropagation(); onDeleteCategory?.(cat); }}
                      style={{ ...ghostBtn, color: "var(--fm-red)" }}
                    >×</button>
                  </>
                )}
              </div>
              {addingItemToCategory === cat && (
                <div style={{ paddingLeft: `${(depth + 2) * 1.4 + 0.5}rem`, paddingTop: "0.15rem", paddingBottom: "0.1rem" }}>
                  <input
                    autoFocus
                    placeholder="Item name…"
                    value={newItemName}
                    onChange={e => setNewItemName(e.target.value)}
                    onBlur={() => commitAddItem(cat)}
                    onKeyDown={e => {
                      if (e.key === "Enter") commitAddItem(cat);
                      if (e.key === "Escape") { setAddingItemToCategory(null); setNewItemName(""); }
                    }}
                    style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-brass)", borderRadius: 2, color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.72rem", outline: "none", padding: "0.15rem 0.4rem", width: 180 }}
                  />
                </div>
              )}
              {items.map(item => (
                <div
                  key={item}
                  onClick={() => onSelectItem?.({ category: cat, item })}
                  style={{ color: "var(--fm-ink-mute)", cursor: onSelectItem ? "pointer" : "default", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", paddingBottom: "0.05rem", paddingLeft: `${(depth + 2) * 1.4 + 0.5}rem`, paddingTop: "0.05rem", transition: "color 0.1s" }}
                  onMouseEnter={e => { if (onSelectItem) e.currentTarget.style.color = "var(--fm-ink)"; }}
                  onMouseLeave={e => { if (onSelectItem) e.currentTarget.style.color = "var(--fm-ink-mute)"; }}
                >
                  {item}
                </div>
              ))}
              {crossRefs.map(({ category: xCat, item: xItem }) => (
                <div key={`xref-room-${xCat}|${xItem}`} onClick={() => onSelectItem?.({ category: xCat, item: xItem })}
                  style={{ ...crossRefStyle, paddingLeft: `${(depth + 2) * 1.4 + 0.5}rem` }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-mute)"}
                >
                  {xItem}<span style={{ color: "var(--fm-ink-mute)", fontSize: "0.52rem", opacity: 0.6 }}>· {xCat}</span>
                </div>
              ))}
              {systemCrossRefs.map(({ category: xCat, item: xItem }) => (
                <div key={`xref-sys-${xCat}|${xItem}`} onClick={() => onSelectItem?.({ category: xCat, item: xItem })}
                  style={{ ...crossRefStyle, paddingLeft: `${(depth + 2) * 1.4 + 0.5}rem` }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-mute)"}
                >
                  {xItem}<span style={{ color: "var(--fm-ink-mute)", fontSize: "0.52rem", opacity: 0.6 }}>· {xCat}</span>
                </div>
              ))}
            </div>
          );
        })}

        {/* Child types */}
        {!isCollapsed && subtypes.map(child => renderNode(child, depth + 1))}

        {/* Inline add input */}
        {!isCollapsed && isAddingHere && (
          <div style={{ paddingLeft: `${(depth + 1) * 1.4 + 0.5}rem`, paddingTop: "0.25rem", paddingBottom: "0.1rem" }}>
            <input
              autoFocus
              value={newChildLabel}
              onChange={e => setNewChildLabel(e.target.value)}
              onBlur={() => commitAdd(type.id)}
              onKeyDown={e => {
                if (e.key === "Enter") commitAdd(type.id);
                if (e.key === "Escape") setAddingChildOf(null);
              }}
              placeholder="New subtype name…"
              style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-brass)", borderRadius: 2, color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.72rem", outline: "none", padding: "0.15rem 0.4rem", width: 170 }}
            />
          </div>
        )}
      </div>
    );
  }

  const CLASS_DESCS = {
    spatial:    "Physical spaces with a location: rooms, yards, and outdoor areas.",
    functional: "Groupings that span spaces: mechanical systems and structural elements.",
  };

  return (
    <div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
      {/* Columns */}
      <div style={{ display: "flex", flex: 1, gap: "0", minHeight: 0, overflow: "hidden" }}>
      {["spatial", "functional"].map((cls, ci) => {
        const rootTypes = getRootTypesForClass(cls, entityTypeData);
        return (
          <div key={cls} style={{ borderRight: ci === 0 ? "1px solid var(--fm-hairline)" : "none", display: "flex", flex: 1, flexDirection: "column", minWidth: 0, overflow: "hidden", paddingRight: ci === 0 ? "2rem" : 0, paddingLeft: ci === 1 ? "2rem" : 0 }}>
            <div style={{ alignItems: "baseline", borderBottom: "1px solid var(--fm-hairline)", display: "flex", gap: "0.65rem", marginBottom: "0.6rem", paddingBottom: "0.35rem" }}>
              <span style={{ color: "var(--fm-brass)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>{cls === "spatial" ? "Spatial" : "Functional"}</span>
              <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.65rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{CLASS_DESCS[cls]}</span>
            </div>
            <div style={{ display: "flex", flex: 1, gap: "1.5rem", minHeight: 0, overflow: "hidden" }}>
              {rootTypes.map(type => (
                <div key={type.id} style={{ display: "flex", flex: 1, flexDirection: "column", minWidth: 0, overflowY: "auto", paddingBottom: "2rem" }}>
                  {renderNode(type, 0)}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}

function ItemInventoryView({ categories, categoryItems, categoryTypes, entityTypeData, itemDetails, customFieldValues, onSelectItem, onAddItem, onDeleteItem, onRenameItem, onFieldChange }) {
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItemCat, setNewItemCat] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [hoveredRow, setHoveredRow] = useState(null);
  const [editingRow, setEditingRow] = useState(null);
  const [editingTypeRow, setEditingTypeRow] = useState(null);
  const [editingTypeDraft, setEditingTypeDraft] = useState("");
  const [editingRoomRow, setEditingRoomRow] = useState(null);
  const [editingRoomDraft, setEditingRoomDraft] = useState("");
  const [editingSystemRow, setEditingSystemRow] = useState(null);
  const [editingSystemDraft, setEditingSystemDraft] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [systemFilter, setSystemFilter] = useState("ALL");
  const [structureFilter, setStructureFilter] = useState("ALL");
  const [exteriorFilter, setExteriorFilter] = useState("ALL");
  const [roomFilter, setRoomFilter] = useState("ALL");
  const [levelFilter, setLevelFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [fpData] = useState(() => loadFpData());
  const [invFloors] = useState(() => getFloorsInOrder());
  const [invRooms] = useState(() => loadRooms());
  const [sortCol, setSortCol] = useState({ col: "system", dir: 1 });

  const allRows = useMemo(() =>
    categories.flatMap(cat =>
      (categoryItems[cat] || []).map(item => ({ cat, item, key: `${cat}|${item}` }))
    ), [categories, categoryItems]);

  // Walk up parent chain to check if a typeId is rooted at "structure"
  const isStructureType = useMemo(() => (typeId) => {
    let id = typeId;
    const visited = new Set();
    while (id) {
      if (visited.has(id)) break;
      visited.add(id);
      if (id === "structure") return true;
      const type = entityTypeData.types.find(t => t.id === id);
      if (!type) break;
      id = type.parentId;
    }
    return false;
  }, [entityTypeData]);

  // Walk up parent chain to check if a typeId is rooted at "exterior"
  const isExteriorType = useMemo(() => (typeId) => {
    let id = typeId;
    const visited = new Set();
    while (id) {
      if (visited.has(id)) break;
      visited.add(id);
      if (id === "exterior") return true;
      const type = entityTypeData.types.find(t => t.id === id);
      if (!type) break;
      id = type.parentId;
    }
    return false;
  }, [entityTypeData]);

  // System categories: functional but NOT structure-rooted
  const systemCats = useMemo(() => {
    return categories.filter(c => {
      const oldType = categoryTypes?.[c] || "system";
      const typeId = resolveTypeId(c, oldType);
      return isFunctional(typeId, entityTypeData) && !isStructureType(typeId);
    }).sort();
  }, [categories, categoryTypes, entityTypeData, isStructureType]);

  // Structure categories: functional AND structure-rooted
  const structureCats = useMemo(() => {
    return categories.filter(c => {
      const oldType = categoryTypes?.[c] || "system";
      return isStructureType(resolveTypeId(c, oldType));
    }).sort();
  }, [categories, categoryTypes, isStructureType]);

  // Exterior categories: spatial AND exterior-rooted
  const exteriorCats = useMemo(() => {
    return [...new Set(allRows.map(r => r.cat))].filter(c => {
      const oldType = categoryTypes?.[c] || "system";
      const typeId = resolveTypeId(c, oldType);
      return isSpatial(typeId, entityTypeData) && isExteriorType(typeId);
    }).sort();
  }, [allRows, categoryTypes, entityTypeData, isExteriorType]);

  // Room categories: spatial but NOT exterior-rooted
  const roomCats = useMemo(() => {
    return [...new Set(allRows.map(r => r.cat))].filter(c => {
      const oldType = categoryTypes?.[c] || "system";
      const typeId = resolveTypeId(c, oldType);
      return isSpatial(typeId, entityTypeData) && !isExteriorType(typeId);
    }).sort();
  }, [allRows, categoryTypes, entityTypeData, isExteriorType]);

  const filtered = useMemo(() => {
    let rows = allRows;
    if (statusFilter !== "ALL") rows = rows.filter(r => getInvItemStatus(itemDetails, r.cat, r.item) === statusFilter.toLowerCase());
    if (systemFilter !== "ALL") rows = rows.filter(r => {
      if (r.cat === systemFilter) return true;
      const cf = customFieldValues?.[r.key];
      return (cf?.systemCategory || cf?.system || "") === systemFilter;
    });
    if (structureFilter !== "ALL") rows = rows.filter(r => r.cat === structureFilter);
    if (exteriorFilter !== "ALL") rows = rows.filter(r => r.cat === exteriorFilter);
    if (roomFilter !== "ALL") rows = rows.filter(r => {
      if (r.cat === roomFilter) return true;
      return (customFieldValues?.[r.key]?.roomLabel || customFieldValues?.[r.key]?.room || "") === roomFilter;
    });
    if (levelFilter !== "ALL") {
      const placedRoomIds = Object.keys(fpData.placements[levelFilter] || {});
      const placedLabels = new Set(placedRoomIds.map(rid => invRooms[rid]?.label).filter(Boolean));
      rows = rows.filter(r => placedLabels.has(r.cat));
    }
    if (typeFilter !== "ALL") rows = rows.filter(r => (customFieldValues?.[r.key]?.item_type || "") === typeFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(r => r.item.toLowerCase().includes(q) || r.cat.toLowerCase().includes(q));
    }
    return [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortCol.col === "status") {
        const order = { active: 0, partial: 1, empty: 2 };
        cmp = (order[getInvItemStatus(itemDetails, a.cat, a.item)] ?? 3) - (order[getInvItemStatus(itemDetails, b.cat, b.item)] ?? 3);
      } else if (sortCol.col === "item") {
        cmp = a.item.localeCompare(b.item) || a.cat.localeCompare(b.cat);
      } else if (sortCol.col === "manufacturer") {
        const ma = customFieldValues?.[a.key]?.manufacturer || "";
        const mb = customFieldValues?.[b.key]?.manufacturer || "";
        cmp = ma.localeCompare(mb) || a.item.localeCompare(b.item);
      } else if (sortCol.col === "model") {
        const ma = customFieldValues?.[a.key]?.model || "";
        const mb = customFieldValues?.[b.key]?.model || "";
        cmp = ma.localeCompare(mb) || a.item.localeCompare(b.item);
      } else if (sortCol.col === "type") {
        cmp = (customFieldValues?.[a.key]?.item_type || "").localeCompare(customFieldValues?.[b.key]?.item_type || "") || a.item.localeCompare(b.item);
      } else if (sortCol.col === "room") {
        const aOldType = categoryTypes?.[a.cat] || "system";
        const bOldType = categoryTypes?.[b.cat] || "system";
        const ra = (customFieldValues?.[a.key]?.roomLabel || customFieldValues?.[a.key]?.room) || (isSpatial(resolveTypeId(a.cat, aOldType), entityTypeData) ? a.cat : "");
        const rb = (customFieldValues?.[b.key]?.roomLabel || customFieldValues?.[b.key]?.room) || (isSpatial(resolveTypeId(b.cat, bOldType), entityTypeData) ? b.cat : "");
        cmp = ra.localeCompare(rb) || a.item.localeCompare(b.item);
      } else if (sortCol.col === "system") {
        const sa = customFieldValues?.[a.key]?.system || a.cat;
        const sb = customFieldValues?.[b.key]?.system || b.cat;
        cmp = sa.localeCompare(sb) || a.item.localeCompare(b.item);
      }
      return cmp * sortCol.dir;
    });
  }, [allRows, statusFilter, systemFilter, structureFilter, exteriorFilter, roomFilter, levelFilter, typeFilter, fpData, invRooms, search, sortCol, itemDetails, customFieldValues]);

  function handleHeaderClick(col) {
    setSortCol(prev => prev.col === col ? { col, dir: prev.dir * -1 } : { col, dir: 1 });
  }

  const thBase = {
    background: "var(--fm-bg-raised)",
    borderBottom: "1px solid var(--fm-hairline2)",
    color: "var(--fm-brass-dim)",
    fontFamily: "var(--fm-mono)",
    fontSize: "0.62rem",
    fontWeight: "normal",
    letterSpacing: "0.12em",
    padding: "0.6rem 0.5rem",
    position: "sticky",
    textAlign: "left",
    textTransform: "uppercase",
    top: 0,
    userSelect: "none",
    whiteSpace: "nowrap",
    zIndex: 10,
  };

  return (
    <div style={{ padding: "0 var(--fm-spacing-5xl)" }}>
      {/* Toolbar */}
      <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1.25rem" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search items, systems…"
          style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-ink-dim)", borderRadius: "4px", color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.82rem", marginLeft: "auto", outline: "none", padding: "0.5rem 0.85rem", width: "260px" }}
        />
        <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.78rem" }}>{filtered.length} results</span>
        <button
          onClick={() => { setShowAddForm(true); setNewItemCat(categories[0] || ""); setNewItemName(""); }}
          style={{ background: "transparent", border: "1px solid var(--fm-ink-dim)", borderRadius: "3px", color: "var(--fm-brass-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 0.9rem", transition: "all 0.15s", whiteSpace: "nowrap" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-brass-dim)"; }}
        >+ ADD ITEM</button>
      </div>

      {/* Inline add form */}
      {showAddForm && (
        <div style={{ alignItems: "center", background: "var(--fm-bg-panel)", border: "1px solid var(--fm-hairline2)", borderRadius: "4px", display: "flex", gap: "0.6rem", marginBottom: "0.75rem", padding: "0.6rem 0.75rem" }}>
          <select
            value={newItemCat}
            onChange={e => setNewItemCat(e.target.value)}
            style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", outline: "none", padding: "0.35rem 0.5rem" }}
          >
            {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          <input
            autoFocus
            value={newItemName}
            onChange={e => setNewItemName(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") { onAddItem?.(newItemCat, newItemName); setShowAddForm(false); }
              if (e.key === "Escape") setShowAddForm(false);
            }}
            placeholder="Item name…"
            style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: "var(--fm-ink)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.78rem", outline: "none", padding: "0.35rem 0.6rem" }}
            onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
            onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"}
          />
          <button
            onClick={() => { onAddItem?.(newItemCat, newItemName); setShowAddForm(false); }}
            disabled={!newItemName.trim()}
            style={{ background: newItemName.trim() ? "var(--fm-brass)18" : "transparent", border: `1px solid ${newItemName.trim() ? "var(--fm-brass)40" : "var(--fm-hairline2)"}`, borderRadius: "3px", color: newItemName.trim() ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: newItemName.trim() ? "pointer" : "default", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", letterSpacing: "0.08em", padding: "0.35rem 0.75rem", transition: "all 0.12s" }}
          >Add</button>
          <button
            onClick={() => setShowAddForm(false)}
            style={{ background: "transparent", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", padding: "0.35rem 0.3rem", transition: "color 0.12s" }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
          >Cancel</button>
        </div>
      )}

      {/* Filter pills */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginBottom: "0.6rem" }}>
        <FilterRow label="Status">
          {[
            { key: "ALL",     label: "All" },
            { key: "ACTIVE",  label: "Active",  color: "var(--fm-green)" },
            { key: "PARTIAL", label: "Partial", color: "var(--fm-amber)" },
            { key: "EMPTY",   label: "Empty" },
          ].map(({ key, label, color }) => (
            <FilterPill key={key} active={statusFilter === key} color={color} onClick={() => setStatusFilter(key)}>{label}</FilterPill>
          ))}
        </FilterRow>
        <FilterRow label="Systems">
          <FilterPill active={systemFilter === "ALL"} onClick={() => setSystemFilter("ALL")}>All</FilterPill>
          {systemCats.map(cat => (
            <FilterPill key={cat} active={systemFilter === cat} onClick={() => setSystemFilter(cat)}>{cat}</FilterPill>
          ))}
        </FilterRow>
        <FilterRow label="Structure" hidden={structureCats.length === 0}>
          <FilterPill active={structureFilter === "ALL"} onClick={() => setStructureFilter("ALL")}>All</FilterPill>
          {structureCats.map(cat => (
            <FilterPill key={cat} active={structureFilter === cat} onClick={() => setStructureFilter(cat)}>{cat}</FilterPill>
          ))}
        </FilterRow>
        <FilterRow label="Exterior" hidden={exteriorCats.length === 0}>
          <FilterPill active={exteriorFilter === "ALL"} onClick={() => setExteriorFilter("ALL")}>All</FilterPill>
          {exteriorCats.map(cat => (
            <FilterPill key={cat} active={exteriorFilter === cat} onClick={() => setExteriorFilter(cat)}>{cat}</FilterPill>
          ))}
        </FilterRow>
        <FilterRow label="Room">
          <FilterPill active={roomFilter === "ALL"} onClick={() => setRoomFilter("ALL")}>All</FilterPill>
          {roomCats.map(cat => (
            <FilterPill key={cat} active={roomFilter === cat} onClick={() => setRoomFilter(cat)}>{cat}</FilterPill>
          ))}
        </FilterRow>
        <FilterRow label="Level">
          <FilterPill active={levelFilter === "ALL"} onClick={() => setLevelFilter("ALL")}>All</FilterPill>
          {invFloors.map(lvl => (
            <FilterPill key={lvl.id} active={levelFilter === lvl.id} onClick={() => setLevelFilter(lvl.id)}>{lvl.label}</FilterPill>
          ))}
        </FilterRow>
        <FilterRow label="Type">
          <FilterPill active={typeFilter === "ALL"} onClick={() => setTypeFilter("ALL")}>All</FilterPill>
          {[...new Set(allRows.map(r => customFieldValues?.[r.key]?.item_type).filter(Boolean))].sort().map(t => (
            <FilterPill key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>{t}</FilterPill>
          ))}
        </FilterRow>
      </div>

      {/* Table */}
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            {[
              { label: "Status",       col: "status",       width: "110px" },
              { label: "System",       col: "system",       width: "65px"  },
              { label: "Type",         col: "type",         width: "100px" },
              { label: "Room",         col: "room",         width: "130px" },
              { label: "Item",         col: "item",         width: "200px" },
              { label: "Manufacturer", col: "manufacturer", width: "160px" },
              { label: "Model",        col: "model",        width: "160px" },
              { label: "Note",         col: null,           width: "48px"  },
              { label: "",             col: null,           width: "30px"  },
            ].map(({ label, col, width }) => (
              <th
                key={label}
                style={{ ...thBase, cursor: col ? "pointer" : "default", width }}
                onClick={() => col && handleHeaderClick(col)}
              >
                {label}
                {col && sortCol.col === col && (
                  <span style={{ marginLeft: "0.3rem", opacity: 0.6 }}>{sortCol.dir === 1 ? "↑" : "↓"}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map(({ cat, item, key }) => {
            const status = getInvItemStatus(itemDetails, cat, item);
            const { color, label } = INV_STATUS_META[status];
            const hasDetail = !!(itemDetails?.[key]);
            const existingTypes = [...new Set(Object.values(customFieldValues || {}).map(v => v?.item_type).filter(Boolean))].sort();
            const typeListId = `itypes-${key}`;
            const roomListId = `irooms-${key}`;
            // Determine behavioral class for this item's own category
            const catOldType = categoryTypes?.[cat] || "system";
            const catTypeId = resolveTypeId(cat, catOldType);
            const catIsSpatial = isSpatial(catTypeId, entityTypeData);
            const catIsFunctional = isFunctional(catTypeId, entityTypeData);

            // Room: if item's category is already Spatial, the category IS the room (read-only)
            // Otherwise, user picks which Spatial category this item lives in
            const resolvedRoom = catIsSpatial
              ? cat
              : (customFieldValues?.[key]?.roomLabel || customFieldValues?.[key]?.room || "");

            // System: if item's category is already Functional, the category IS the system (read-only)
            // Otherwise, user picks which Functional category this item belongs to
            const resolvedSystem = catIsFunctional
              ? cat
              : (customFieldValues?.[key]?.systemCategory || customFieldValues?.[key]?.system || "");

            const roomOptions = roomCats; // Spatial categories
            const systemOptions = systemCats; // Functional categories
            const systemListId = `isys-${key}`;
            const noteColor = hasDetail ? "var(--fm-brass)" : "var(--fm-ink-mute)";
            const isHov = hoveredRow === key;
            return (
              <tr key={key} style={{ borderBottom: "1px solid var(--fm-hairline)" }}
                onMouseEnter={() => setHoveredRow(key)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                <td style={{ padding: "0.45rem 0.5rem", verticalAlign: "middle" }}>
                  <div style={{ alignItems: "center", display: "flex", gap: "0.4rem" }}>
                    <span style={{ background: color, borderRadius: "50%", display: "inline-block", flexShrink: 0, height: 7, width: 7 }} />
                    <span style={{ color, fontFamily: "var(--fm-mono)", fontSize: "0.67rem", letterSpacing: "0.06em" }}>{label}</span>
                  </div>
                </td>
                <td style={{ padding: "0.45rem 0.5rem", verticalAlign: "middle" }}>
                  {catIsFunctional ? (
                    <span style={{
                      background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)",
                      borderRadius: "var(--fm-radius)", color: "var(--fm-ink-dim)", display: "inline-block",
                      fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.08em",
                      padding: "0.1rem 0.35rem", textTransform: "uppercase",
                    }} title="Category is a system — functional type is the category itself">{getInvSysTag(cat)}</span>
                  ) : editingSystemRow === key ? (
                    <ComboInput
                      autoFocus
                      value={editingSystemDraft}
                      onChange={v => setEditingSystemDraft(v)}
                      onBlur={() => { onFieldChange?.(cat, item, "systemCategory", editingSystemDraft.trim()); setEditingSystemRow(null); }}
                      onKeyDown={e => {
                        if (e.key === "Enter") { onFieldChange?.(cat, item, "systemCategory", editingSystemDraft.trim()); setEditingSystemRow(null); }
                        if (e.key === "Escape") setEditingSystemRow(null);
                      }}
                      options={systemOptions}
                      style={{ border: "1px solid var(--fm-brass)", fontSize: "0.67rem", padding: "0.15rem 0.3rem" }}
                    />
                  ) : (
                    <span
                      style={{
                        background: resolvedSystem ? "var(--fm-bg-sunk)" : "transparent",
                        border: `1px solid ${resolvedSystem ? "var(--fm-hairline2)" : "var(--fm-hairline)"}`,
                        borderRadius: "var(--fm-radius)", color: resolvedSystem ? "var(--fm-ink-dim)" : "var(--fm-hairline2)",
                        cursor: "text", display: "inline-block", fontFamily: "var(--fm-mono)", fontSize: "0.58rem",
                        letterSpacing: "0.08em", minWidth: "1.5rem", padding: "0.1rem 0.35rem", textTransform: "uppercase",
                      }}
                      onDoubleClick={() => { setEditingSystemDraft(resolvedSystem || ""); setEditingSystemRow(key); }}
                      title="Double-click to set system"
                    >{resolvedSystem ? getInvSysTag(resolvedSystem) : "—"}</span>
                  )}
                </td>
                <td style={{ padding: "0.45rem 0.5rem", verticalAlign: "middle" }}>
                  {editingTypeRow === key ? (
                    <ComboInput
                      autoFocus
                      value={editingTypeDraft}
                      onChange={v => setEditingTypeDraft(v)}
                      onBlur={() => { onFieldChange?.(cat, item, "item_type", editingTypeDraft.trim()); setEditingTypeRow(null); }}
                      onKeyDown={e => {
                        if (e.key === "Enter") { onFieldChange?.(cat, item, "item_type", editingTypeDraft.trim()); setEditingTypeRow(null); }
                        if (e.key === "Escape") setEditingTypeRow(null);
                      }}
                      options={existingTypes}
                      style={{ border: "1px solid var(--fm-brass)", fontSize: "0.67rem", padding: "0.15rem 0.3rem" }}
                    />
                  ) : (
                    <span
                      style={{ color: customFieldValues?.[key]?.item_type ? "var(--fm-ink-dim)" : "var(--fm-hairline2)", cursor: "text", display: "block", fontFamily: "var(--fm-mono)", fontSize: "0.67rem", letterSpacing: "0.06em", minHeight: "1.2em", minWidth: "2rem", textTransform: "uppercase" }}
                      onDoubleClick={() => { setEditingTypeDraft(customFieldValues?.[key]?.item_type || ""); setEditingTypeRow(key); }}
                      title="Double-click to set type"
                    >
                      {customFieldValues?.[key]?.item_type || "—"}
                    </span>
                  )}
                </td>
                <td style={{ padding: "0.45rem 0.5rem", verticalAlign: "middle" }}>
                  {catIsSpatial ? (
                    <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-sans)", fontSize: "0.78rem" }} title="Category is a room — location is the category itself">{cat}</span>
                  ) : editingRoomRow === key ? (
                    <ComboInput
                      autoFocus
                      value={editingRoomDraft}
                      onChange={v => setEditingRoomDraft(v)}
                      onBlur={() => { onFieldChange?.(cat, item, "roomLabel", editingRoomDraft.trim()); setEditingRoomRow(null); }}
                      onKeyDown={e => {
                        if (e.key === "Enter") { onFieldChange?.(cat, item, "roomLabel", editingRoomDraft.trim()); setEditingRoomRow(null); }
                        if (e.key === "Escape") setEditingRoomRow(null);
                      }}
                      options={roomOptions}
                      style={{ border: "1px solid var(--fm-brass)", fontSize: "0.78rem", padding: "0.15rem 0.4rem" }}
                    />
                  ) : (
                    <span
                      style={{ color: resolvedRoom ? "var(--fm-ink-dim)" : "var(--fm-hairline2)", cursor: "text", display: "block", fontFamily: "var(--fm-sans)", fontSize: "0.78rem", minHeight: "1.2em", minWidth: "2rem" }}
                      onDoubleClick={() => { setEditingRoomDraft(resolvedRoom || ""); setEditingRoomRow(key); }}
                      title="Double-click to set room location"
                    >
                      {resolvedRoom || "—"}
                    </span>
                  )}
                </td>
                <td style={{ padding: "0.45rem 0.5rem", verticalAlign: "middle" }}>
                  {editingRow === key ? (
                    <input
                      autoFocus
                      defaultValue={item}
                      onBlur={e => { onRenameItem?.(cat, item, e.target.value); setEditingRow(null); }}
                      onKeyDown={e => {
                        if (e.key === "Enter") { onRenameItem?.(cat, item, e.target.value); setEditingRow(null); }
                        if (e.key === "Escape") setEditingRow(null);
                      }}
                      style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-brass)", borderRadius: 2, color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.78rem", outline: "none", padding: "0.15rem 0.4rem", width: "100%" }}
                    />
                  ) : (
                    <span
                      style={{ color: "var(--fm-ink)", cursor: "text", fontFamily: "var(--fm-sans)", fontSize: "0.78rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      onDoubleClick={() => setEditingRow(key)}
                      title="Double-click to rename"
                    >{item}</span>
                  )}
                </td>
                <td style={{ padding: "0.45rem 0.5rem", verticalAlign: "middle" }}>
                  <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-sans)", fontSize: "0.78rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {customFieldValues?.[key]?.manufacturer || ""}
                  </span>
                </td>
                <td style={{ padding: "0.45rem 0.5rem", verticalAlign: "middle" }}>
                  <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-sans)", fontSize: "0.78rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {customFieldValues?.[key]?.model || ""}
                  </span>
                </td>
                <td style={{ padding: "0.45rem 0.5rem", textAlign: "center", verticalAlign: "middle" }}>
                  <button
                    onClick={() => onSelectItem?.({ category: cat, item })}
                    title={hasDetail ? "View item details" : "Add item details"}
                    style={{ alignItems: "center", background: "transparent", border: "none", color: noteColor, cursor: "pointer", display: "flex", justifyContent: "center", padding: "0.15rem", transition: "color 0.12s" }}
                    onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"}
                    onMouseLeave={e => e.currentTarget.style.color = noteColor}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="16" y1="13" x2="8" y2="13"/>
                      <line x1="16" y1="17" x2="8" y2="17"/>
                      <polyline points="10 9 9 9 8 9"/>
                    </svg>
                  </button>
                </td>
                <td style={{ padding: "0.45rem 0.25rem", textAlign: "center", verticalAlign: "middle" }}>
                  {isHov && (
                    <button
                      onClick={() => onDeleteItem?.(cat, item)}
                      title="Delete item"
                      style={{ alignItems: "center", background: "transparent", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", display: "flex", fontSize: "1rem", justifyContent: "center", lineHeight: 1, padding: "0.1rem 0.2rem", transition: "color 0.12s" }}
                      onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                      onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                    >×</button>
                  )}
                </td>
              </tr>
            );
          })}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={8} style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", padding: "2rem 0.5rem", textAlign: "center" }}>
                No items match the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function InventoryPage({ navigate, navState }) {
  const [rows, setRows] = useState(() => loadData());
  const [deletedCategories, setDeletedCategories] = useState(() => loadDeletedCategories());
  const [deletedItems, setDeletedItems] = useState(() => loadDeletedItems());
  const [deletePrompt, setDeletePrompt] = useState(null); // { category, itemCount, taskCount, isDefault } | { category, item, taskCount, isDefault }
  const [newItemIds, setNewItemIds] = useState(() => new Set());
  const [editingCategoryName, setEditingCategoryName] = useState(null);
  const [editingItemName, setEditingItemName] = useState(null); // { category, item }
  const [editingTask, setEditingTask] = useState(null); // row being edited, or null
  const [pendingNewCategory, setPendingNewCategory] = useState(null); // { id, groupType }

  const CATEGORY_ITEMS = useMemo(() => {
    const map = {};
    rows.forEach(row => {
      if (!row._isCustom && deletedCategories.has(row.category)) return;
      if (row._isBlankCategory) {
        if (row.category) map[row.category] = map[row.category] || [];
        return;
      }
      if (!row.category || !row.item) return;
      if (deletedItems.has(`${row.category}|${row.item}`)) return;
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
      // Custom rows (user-created) take priority over default rows so that
      // a category added in "Rooms" isn't silently reassigned by a same-named
      // default category that lives in a different group.
      if (!map[row.category] || row._isCustom) {
        map[row.category] = row.categoryType;
      }
    });
    return map;
  }, [rows]);

  const [categoryTypeOverrides, setCategoryTypeOverridesState] = useState(() => loadCategoryTypeOverrides());
  const [activeTab, setActiveTab] = useState("Item List");
  const [customGroupTypes, setCustomGroupTypes] = useState(() => loadCustomGroupTypes());
  const [groupLabelOverrides, setGroupLabelOverrides] = useState(() => loadGroupLabelOverrides());


  const effectiveCategoryTypes = useMemo(() => {
    const result = {};
    CATEGORIES.forEach(cat => {
      result[cat] = categoryTypeOverrides[cat] ?? defaultCategoryTypes[cat] ?? "system";
    });
    return result;
  }, [CATEGORIES, categoryTypeOverrides, defaultCategoryTypes]);

  const groupedCategories = useMemo(() => {
    const fullOrder = [...GROUP_ORDER, ...customGroupTypes.map(t => t.id)];
    const groups = {};
    fullOrder.forEach(type => { groups[type] = []; });
    CATEGORIES.forEach(cat => {
      const type = effectiveCategoryTypes[cat];
      (groups[type] ?? groups["system"]).push(cat);
    });
    return groups;
  }, [CATEGORIES, effectiveCategoryTypes, customGroupTypes]);

  const totalItems = useMemo(() =>
    CATEGORIES.reduce((n, cat) => n + (CATEGORY_ITEMS[cat]?.length || 0), 0),
    [CATEGORIES, CATEGORY_ITEMS]
  );
  const systemCatCount = useMemo(() =>
    CATEGORIES.filter(c => effectiveCategoryTypes[c] !== "room").length,
    [CATEGORIES, effectiveCategoryTypes]
  );
  const roomCatCount = useMemo(() =>
    CATEGORIES.filter(c => effectiveCategoryTypes[c] === "room").length,
    [CATEGORIES, effectiveCategoryTypes]
  );

  const allGroupOrder = useMemo(() =>
    [...GROUP_ORDER, ...customGroupTypes.map(t => t.id)],
    [customGroupTypes]
  );

  const allGroupLabels = useMemo(() => ({
    ...GROUP_LABELS,
    ...Object.fromEntries(customGroupTypes.map(t => [t.id, t.label])),
    ...groupLabelOverrides,
  }), [customGroupTypes, groupLabelOverrides]);

  const filteredGroupOrder = allGroupOrder;
  const visibleGroups = allGroupOrder;

  const newItemRowsByCategory = useMemo(() => {
    const map = {};
    rows.forEach(row => {
      if (newItemIds.has(row._id)) {
        if (!map[row.category]) map[row.category] = [];
        map[row.category].push(row);
      }
    });
    return map;
  }, [rows, newItemIds]);

  const [collapsed, setCollapsed] = useState(() =>
    Object.fromEntries(CATEGORIES.map(cat => [cat, true]))
  );
  const [collapsedGroups, setCollapsedGroups] = useState(() =>
    Object.fromEntries(GROUP_ORDER.map(g => [g, true]))
  ); // custom group types default to undefined (falsy = expanded) — intentional
  const [sortedGroups, setSortedGroups] = useState(() => new Set());
  const [navHovered, setNavHovered] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [dragOverGroup, setDragOverGroup] = useState(null);
  const [draggingItem, setDraggingItem] = useState(null); // { item, fromCategory }
  const [dragOverCategory, setDragOverCategory] = useState(null);
  const [duplicateItemPopup, setDuplicateItemPopup] = useState(null); // { item, fromCategory, x, y }
  const [itemDetails, setItemDetails] = useState(() => loadItemDetails());
  const [selectedItem, setSelectedItem] = useState(null); // { category, item }
  const [detailTab, setDetailTab] = useState("details");
  const headerRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [todos, setTodos] = useState(() => loadTodos());
  const [addingTodo, setAddingTodo] = useState(false);
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [projects, setProjects] = useState(() => loadProjects());
  const [addingProject, setAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [deleteProjectPrompt, setDeleteProjectPrompt] = useState(null);
  const [hoveredProjectId, setHoveredProjectId] = useState(null);
  const [addingTask, setAddingTask] = useState(false);
  const [addTaskModalOpen, setAddTaskModalOpen] = useState(false);
  const [newTask, setNewTask] = useState({ task: "", schedule: "", season: null, lastCompleted: null, nextDate: null, followSchedule: false, notes: "" });
  const [deleteTaskPrompt, setDeleteTaskPrompt] = useState(null);
  const [deleteTodoPrompt, setDeleteTodoPrompt] = useState(null);
  const [hoveredTodoId, setHoveredTodoId] = useState(null);
  const [deletedRows, setDeletedRows] = useState(() => loadDeletedRows());
  const [nextDatesMap, setNextDatesMapInv] = useState(() => {
    try { return JSON.parse(localStorage.getItem("maintenance-next-dates") || "{}"); }
    catch { return {}; }
  });
  const [suggestedTasks, setSuggestedTasks] = useState(null); // null | Array<{task,schedule,season,selected}>
  const [suggestedFor, setSuggestedFor] = useState(null); // { category, item }
  const [fetchingTasks, setFetchingTasks] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [itemFieldSchemas, setItemFieldSchemas] = useState(() => loadItemFieldSchemas());
  const [customFieldValues, setCustomFieldValues] = useState(() => loadCustomFieldValues());
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [newField, setNewField] = useState({ name: "", type: "text", options: "" });
  const [roomSubtypes, setRoomSubtypes] = useState(() => loadRoomSubtypes());
  const [entityTypeData, setEntityTypeData] = useState(() => loadEntityTypes());
  function refreshEntityTypes() { setEntityTypeData(loadEntityTypes()); }

  const itemTasks = useMemo(() => {
    if (!selectedItem) return [];
    return rows.filter(r =>
      r.category === selectedItem.category &&
      r.item === selectedItem.item &&
      !r._isBlankCategory &&
      r.task &&
      !(!r._isCustom && deletedCategories.has(r.category)) &&
      !deletedItems.has(`${r.category}|${r.item}`) &&
      !deletedRows.has(`${r.category}|${r.item}|${r.task}`)
    );
  }, [rows, selectedItem, deletedRows, deletedCategories, deletedItems]);

  const selectedTodos = useMemo(() => {
    if (!selectedItem) return [];
    return todos.filter(t =>
      t.linkedCategory === selectedItem.category &&
      (t.linkedItem === selectedItem.item || t.linkedItem === null)
    );
  }, [todos, selectedItem]);

  const selectedProjects = useMemo(() => {
    if (!selectedItem) return [];
    return projects.filter(p =>
      p.linkedCategory === selectedItem.category &&
      (p.linkedItem === selectedItem.item || p.linkedItem === null)
    );
  }, [projects, selectedItem]);

  const itemCoverageMap = useMemo(() => {
    const map = {};
    rows.forEach(row => {
      if (row._isBlankCategory || !row.category || !row.item || !row.task) return;
      if (!row._isCustom && deletedCategories.has(row.category)) return;
      if (deletedItems.has(`${row.category}|${row.item}`)) return;
      const drKey = `${row.category}|${row.item}|${row.task}`;
      if (deletedRows.has(drKey)) return;
      const itemKey = `${row.category}|${row.item}`;
      if (!map[itemKey]) map[itemKey] = { total: 0, unscheduled: 0 };
      map[itemKey].total++;
      if (!row.schedule && !nextDatesMap[drKey]) map[itemKey].unscheduled++;
    });
    return map;
  }, [rows, deletedCategories, deletedItems, deletedRows, nextDatesMap]);

  function handleAddTask() {
    if (!newTask.task.trim() || !selectedItem) return;
    const taskName = newTask.task.trim();
    const key = `${selectedItem.category}|${selectedItem.item}|${taskName}`;
    const newRow = {
      _id: `custom-${Date.now()}`,
      _isCustom: true,
      _defaultKey: null,
      category: selectedItem.category,
      item: selectedItem.item,
      task: taskName,
      schedule: newTask.schedule || "",
      season: newTask.season || null,
    };
    const customs = loadCustomData();
    saveCustomData([...customs, newRow]);
    if (newTask.lastCompleted) {
      const dates = JSON.parse(localStorage.getItem("maintenance-dates") || "{}");
      dates[key] = new Date(newTask.lastCompleted).toISOString();
      localStorage.setItem("maintenance-dates", JSON.stringify(dates));
    }
    if (newTask.nextDate) {
      const nextDates = JSON.parse(localStorage.getItem("maintenance-next-dates") || "{}");
      nextDates[key] = new Date(newTask.nextDate).toISOString();
      localStorage.setItem("maintenance-next-dates", JSON.stringify(nextDates));
    }
    if (newTask.notes) {
      const notes = JSON.parse(localStorage.getItem("maintenance-notes") || "{}");
      notes[key] = newTask.notes;
      localStorage.setItem("maintenance-notes", JSON.stringify(notes));
    }
    if (newTask.followSchedule) {
      const follow = JSON.parse(localStorage.getItem("maintenance-follow") || "{}");
      follow[key] = true;
      localStorage.setItem("maintenance-follow", JSON.stringify(follow));
    }
    reload();
    setAddingTask(false);
    setNewTask({ task: "", schedule: "", season: null, lastCompleted: null, nextDate: null, followSchedule: false, notes: "" });
  }

  function handleAddTaskFromModal(form) {
    if (!selectedItem) return;
    const taskName = form.task.trim();
    const key = `${selectedItem.category}|${selectedItem.item}|${taskName}`;
    const newRow = {
      _id: `custom-${Date.now()}`,
      _isCustom: true,
      _defaultKey: null,
      category: selectedItem.category,
      item: selectedItem.item,
      task: taskName,
      schedule: form.schedule || "",
      season: form.season || null,
    };
    const customs = loadCustomData();
    saveCustomData([...customs, newRow]);
    if (form.lastCompleted) {
      const dates = JSON.parse(localStorage.getItem("maintenance-dates") || "{}");
      dates[key] = new Date(form.lastCompleted).toISOString();
      localStorage.setItem("maintenance-dates", JSON.stringify(dates));
    }
    if (form.nextDate) {
      const nextDates = JSON.parse(localStorage.getItem("maintenance-next-dates") || "{}");
      nextDates[key] = new Date(form.nextDate).toISOString();
      localStorage.setItem("maintenance-next-dates", JSON.stringify(nextDates));
    }
    if (form.notes) {
      const notes = JSON.parse(localStorage.getItem("maintenance-notes") || "{}");
      notes[key] = form.notes;
      localStorage.setItem("maintenance-notes", JSON.stringify(notes));
    }
    if (form.followSchedule) {
      const follow = JSON.parse(localStorage.getItem("maintenance-follow") || "{}");
      follow[key] = true;
      localStorage.setItem("maintenance-follow", JSON.stringify(follow));
    }
    reload();
    setAddTaskModalOpen(false);
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
        headers: {
          "Authorization": `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          max_tokens: 1024,
        }),
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
    const newRows = toAdd.map((t, i) => ({
      _id: `custom-${Date.now()}-${i}`,
      _isCustom: true,
      _defaultKey: null,
      category: suggestedFor.category,
      item: suggestedFor.item,
      task: t.task,
      schedule: t.schedule || "",
      season: t.season || null,
    }));
    saveCustomData([...customs, ...newRows]);
    reload();
    setSuggestedTasks(null);
    setSuggestedFor(null);
  }

  function handleCustomFieldValueChange(category, item, fieldId, value) {
    const key = `${category}|${item}`;
    const next = { ...customFieldValues, [key]: { ...(customFieldValues[key] || {}), [fieldId]: value } };
    setCustomFieldValues(next);
    saveCustomFieldValues(next);
  }

  function handleAddItemField(category, item, field) {
    const key = `${category}|${item}`;
    const next = { ...itemFieldSchemas, [key]: [...(itemFieldSchemas[key] || []), field] };
    setItemFieldSchemas(next);
    saveItemFieldSchemas(next);
  }

  function handleDeleteItemField(category, item, fieldId) {
    const key = `${category}|${item}`;
    const next = { ...itemFieldSchemas, [key]: (itemFieldSchemas[key] || []).filter(f => f.id !== fieldId) };
    setItemFieldSchemas(next);
    saveItemFieldSchemas(next);
  }


  function handleAddTodo() {
    const title = newTodoTitle.trim();
    if (!title || !selectedItem) return;
    const next = [...todos, createTodo({
      title,
      linkedCategory: selectedItem.category,
      linkedItem: selectedItem.item,
    })];
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
    const next = [...projects, createProject({
      name,
      linkedCategory: selectedItem.category,
      linkedItem: selectedItem.item,
    })];
    setProjects(next);
    saveProjects(next);
    setNewProjectName("");
    setAddingProject(false);
  }

  function handleDeleteProject(project) {
    const next = projects.filter(p => p.id !== project.id);
    setProjects(next);
    saveProjects(next);
    setDeleteProjectPrompt(null);
  }

  function reload() {
    setRows(loadData());
  }

  // Migrate legacy itemDetails entries to customFieldValues + itemFieldSchemas
  useEffect(() => {
    const legacyDetails = loadItemDetails();
    if (!legacyDetails || Object.keys(legacyDetails).length === 0) return;
    const existingValues = loadCustomFieldValues();
    const existingSchemas = loadItemFieldSchemas();
    let valuesChanged = false;
    let schemasChanged = false;
    Object.entries(legacyDetails).forEach(([cfKey, details]) => {
      if (!details || typeof details !== "object") return;
      const migratableFields = [
        { id: "manufacturer", name: "Manufacturer", type: "text" },
        { id: "model",        name: "Model",        type: "text" },
        { id: "serial",       name: "Serial Number",type: "text" },
        { id: "purchase_date",name: "Purchase Date",type: "date" },
      ];
      const legacyMap = { manufacturer: details.manufacturer, model: details.model, serial: details.serial, purchase_date: details.purchaseDate };
      migratableFields.forEach(f => {
        const legacyVal = legacyMap[f.id];
        if (!legacyVal) return;
        if (!existingValues[cfKey]) existingValues[cfKey] = {};
        if (!existingValues[cfKey][f.id]) {
          existingValues[cfKey][f.id] = legacyVal;
          valuesChanged = true;
        }
        if (!existingSchemas[cfKey]) existingSchemas[cfKey] = [];
        if (!existingSchemas[cfKey].some(s => s.id === f.id)) {
          existingSchemas[cfKey].push(f);
          schemasChanged = true;
        }
      });
    });
    if (valuesChanged) { saveCustomFieldValues(existingValues); setCustomFieldValues(existingValues); }
    if (schemasChanged) { saveItemFieldSchemas(existingSchemas); setItemFieldSchemas(existingSchemas); }
  }, []);

  useEffect(() => {
    if (!navState?.expandAll) return;
    setCollapsed(Object.fromEntries(CATEGORIES.map(cat => [cat, false])));
    setCollapsedGroups(Object.fromEntries(allGroupOrder.map(g => [g, false])));
  }, []);

  useEffect(() => {
    if (!headerRef.current) return;
    const obs = new ResizeObserver(([entry]) => setHeaderHeight(entry.contentRect.height));
    obs.observe(headerRef.current);
    return () => obs.disconnect();
  }, []);

  function toggleCollapse(category) {
    setCollapsed(prev => ({ ...prev, [category]: !prev[category] }));
  }

  function toggleGroup(groupType) {
    setCollapsedGroups(prev => ({ ...prev, [groupType]: !prev[groupType] }));
  }

  const allGroupsCollapsed = allGroupOrder.every(g => collapsedGroups[g]);
  const allCatsCollapsed   = CATEGORIES.every(cat => collapsed[cat]);
  // 0 = fully collapsed, 1 = groups open + categories closed, 2 = fully open
  const expandLevel = (allGroupsCollapsed && allCatsCollapsed) ? 0 : allCatsCollapsed ? 1 : 2;

  function cycleExpand() {
    if (expandLevel === 0) {
      setCollapsedGroups(Object.fromEntries(allGroupOrder.map(g => [g, false])));
      setCollapsed(Object.fromEntries(CATEGORIES.map(cat => [cat, true])));
    } else if (expandLevel === 1) {
      setCollapsedGroups(Object.fromEntries(allGroupOrder.map(g => [g, false])));
      setCollapsed(Object.fromEntries(CATEGORIES.map(cat => [cat, false])));
    } else {
      setCollapsedGroups(Object.fromEntries(allGroupOrder.map(g => [g, true])));
      setCollapsed(Object.fromEntries(CATEGORIES.map(cat => [cat, true])));
    }
  }

  function handleItemDrop(toCategory) {
    if (!draggingItem) return;
    const { item, fromCategory } = draggingItem;
    setDraggingItem(null);
    setDragOverCategory(null);
    if (fromCategory === toCategory) return;

    const customs = loadCustomData();
    saveCustomData(customs.map(r =>
      r.category === fromCategory && r.item === item ? { ...r, category: toCategory } : r
    ));

    const overrides = loadOverrides();
    defaultData.forEach(row => {
      if (row.category === fromCategory && row.item === item) {
        const key = `${row.category}|${row.item}|${row.task}`;
        overrides[key] = { ...(overrides[key] || {}), category: toCategory };
      }
    });
    saveOverrides(overrides);

    reload();
  }

  function handleDeleteClick(category) {
    const itemCount = CATEGORY_ITEMS[category]?.length ?? 0;
    const taskCount = rows.filter(r => r.category === category && !r._isBlankCategory).length;
    const isDefault = rows.some(r => r.category === category && !r._isCustom);
    setEditingCategoryName(null);
    setDeletePrompt({ category, itemCount, taskCount, isDefault });
  }

  function handleDuplicateItemToCategory(toCategory) {
    const { item, fromCategory } = duplicateItemPopup;
    setDuplicateItemPopup(null);
    const sourceRows = rows.filter(r => r.category === fromCategory && r.item === item && !r._isBlankCategory);
    const customs = loadCustomData();
    const newRows = sourceRows.length > 0
      ? sourceRows.map((r, i) => ({
          _id: `custom-${Date.now()}-${i}`,
          _isCustom: true, _defaultKey: null,
          category: toCategory, item: r.item, task: r.task,
          schedule: r.schedule, season: r.season ?? null,
        }))
      : [{ _id: `custom-${Date.now()}`, _isCustom: true, _defaultKey: null, category: toCategory, item, task: "", schedule: "", season: null }];
    saveCustomData([...customs, ...newRows]);
    reload();
  }



  function handleItemDetailChange(category, item, field, value) {
    const key = `${category}|${item}`;
    const next = { ...itemDetails, [key]: { ...(itemDetails[key] || {}), [field]: value } };
    setItemDetails(next);
    saveItemDetails(next);
  }

  function handleDuplicateCategory(category) {
    const groupType = effectiveCategoryTypes[category];
    const newName = `Copy of ${category}`;
    const sourceRows = rows.filter(r => r.category === category && !r._isBlankCategory);
    const customs = loadCustomData();

    if (sourceRows.length === 0) {
      saveCustomData([...customs, {
        _id: `custom-${Date.now()}`,
        _isCustom: true, _defaultKey: null, _isBlankCategory: true,
        category: newName, item: "", task: "", schedule: "", season: null,
        categoryType: groupType,
      }]);
    } else {
      const newRows = sourceRows.map((r, i) => ({
        _id: `custom-${Date.now()}-${i}`,
        _isCustom: true, _defaultKey: null,
        category: newName,
        item: r.item, task: r.task,
        schedule: r.schedule, season: r.season ?? null,
        categoryType: groupType,
      }));
      saveCustomData([...customs, ...newRows]);
    }

    reload();
    setEditingCategoryName(newName);
    setCollapsedGroups(prev => ({ ...prev, [groupType]: false }));
  }

  function handleItemDeleteClick(category, item) {
    const taskCount = rows.filter(r => r.category === category && r.item === item && !r._isBlankCategory).length;
    const isDefault = rows.some(r => r.category === category && r.item === item && !r._isCustom);
    setDeletePrompt({ category, item, taskCount, isDefault });
  }

  function confirmDelete() {
    if (!deletePrompt) return;
    const { category, item, isDefault } = deletePrompt;
    setDeletePrompt(null);

    if (item) {
      if (isDefault) {
        const next = new Set([...deletedItems, `${category}|${item}`]);
        saveDeletedItems(next);
        setDeletedItems(next);
      }
      const customs = loadCustomData();
      saveCustomData(customs.filter(r => !(r.category === category && r.item === item)));
      reload();
    } else {
      if (isDefault) {
        const next = new Set([...deletedCategories, category]);
        saveDeletedCategories(next);
        setDeletedCategories(next);
      }
      // Always remove custom rows for this category — covers both the pure-custom
      // case and any user-created rows that co-exist with a same-named default.
      const customs = loadCustomData();
      saveCustomData(customs.filter(r => r.category !== category));

      // Phase 4: null out chore.room / todo.linkedRoom / project.linkedRoom references
      const chores = loadChores();
      const updatedChores = chores.map(c => c.room === category ? { ...c, room: null, roomId: null } : c);
      if (updatedChores.some((c, i) => c !== chores[i])) saveChores(updatedChores);

      const todos = loadTodos();
      const updatedTodos = todos.map(t => {
        const updates = {};
        if (t.linkedRoom === category) updates.linkedRoom = null;
        if (t.linkedSystem === category) updates.linkedSystem = null;
        if (t.linkedCategory === category) updates.linkedCategory = null;
        return Object.keys(updates).length ? { ...t, ...updates } : t;
      });
      if (updatedTodos.some((t, i) => t !== todos[i])) saveTodos(updatedTodos);

      const projects = loadProjects();
      const updatedProjects = projects.map(p => {
        const updates = {};
        if (p.linkedRoom === category) updates.linkedRoom = null;
        if (p.linkedSystem === category) updates.linkedSystem = null;
        return Object.keys(updates).length ? { ...p, ...updates } : p;
      });
      if (updatedProjects.some((p, i) => p !== projects[i])) saveProjects(updatedProjects);

      reload();
    }
  }

  function handleCategoryTypeChange(categoryLabel, newType) {
    if (effectiveCategoryTypes[categoryLabel] === newType) return;
    const next = { ...categoryTypeOverrides };
    if (defaultCategoryTypes[categoryLabel] === newType) {
      delete next[categoryLabel];
    } else {
      next[categoryLabel] = newType;
    }
    saveCategoryTypeOverrides(next);
    setCategoryTypeOverridesState(next);
  }

  function handleDrop(groupType) {
    if (!dragging) return;
    if (effectiveCategoryTypes[dragging] !== groupType) {
      const next = { ...categoryTypeOverrides };
      if (defaultCategoryTypes[dragging] === groupType) {
        delete next[dragging];
      } else {
        next[dragging] = groupType;
      }
      saveCategoryTypeOverrides(next);
      setCategoryTypeOverridesState(next);
    }
    setDragging(null);
    setDragOverGroup(null);
  }

  function handleCategoryRename(oldName, newName) {
    const trimmed = newName.trim();
    setEditingCategoryName(null);
    if (!trimmed || trimmed === oldName) return;

    const customs = loadCustomData();
    saveCustomData(customs.map(r => r.category === oldName ? { ...r, category: trimmed } : r));

    const overrides = loadOverrides();
    defaultData.forEach(row => {
      if (row.category === oldName) {
        const key = `${row.category}|${row.item}|${row.task}`;
        overrides[key] = { ...(overrides[key] || {}), category: trimmed };
      }
    });
    saveOverrides(overrides);

    if (categoryTypeOverrides[oldName] !== undefined) {
      const next = { ...categoryTypeOverrides, [trimmed]: categoryTypeOverrides[oldName] };
      delete next[oldName];
      saveCategoryTypeOverrides(next);
      setCategoryTypeOverridesState(next);
    }

    // Phase 4: cascade rename to chores, todos, projects
    const etData = loadEntityTypes();
    const typeId = resolveTypeId(oldName, effectiveCategoryTypes[oldName] || "system");
    const isRoomRename = isSpatial(typeId, etData);

    const chores = loadChores();
    const updatedChores = chores.map(c => c.room === oldName ? { ...c, room: trimmed } : c);
    if (updatedChores.some((c, i) => c.room !== chores[i].room)) saveChores(updatedChores);

    const todos = loadTodos();
    const updatedTodos = todos.map(t => {
      if (isRoomRename && t.linkedRoom === oldName) return { ...t, linkedRoom: trimmed };
      if (!isRoomRename && t.linkedSystem === oldName) return { ...t, linkedSystem: trimmed };
      if (t.linkedCategory === oldName) return { ...t, linkedCategory: trimmed };
      return t;
    });
    if (updatedTodos.some((t, i) => t !== todos[i])) saveTodos(updatedTodos);

    const projects = loadProjects();
    const updatedProjects = projects.map(p => {
      if (isRoomRename && p.linkedRoom === oldName) return { ...p, linkedRoom: trimmed };
      if (!isRoomRename && p.linkedSystem === oldName) return { ...p, linkedSystem: trimmed };
      return p;
    });
    if (updatedProjects.some((p, i) => p !== projects[i])) saveProjects(updatedProjects);

    reload();
  }

  function handleItemRename(category, oldName, newName) {
    const trimmed = newName.trim();
    setEditingItemName(null);
    if (!trimmed || trimmed === oldName) return;

    const customs = loadCustomData();
    saveCustomData(customs.map(r => r.category === category && r.item === oldName ? { ...r, item: trimmed } : r));

    const overrides = loadOverrides();
    defaultData.forEach(row => {
      if (row.category === category && row.item === oldName) {
        const key = `${row.category}|${row.item}|${row.task}`;
        overrides[key] = { ...(overrides[key] || {}), item: trimmed };
      }
    });
    saveOverrides(overrides);

    const oldKey = `${category}|${oldName}`;
    const newKey = `${category}|${trimmed}`;

    const details = loadItemDetails();
    if (details[oldKey] !== undefined) { details[newKey] = details[oldKey]; delete details[oldKey]; saveItemDetails(details); setItemDetails(details); }

    const cfVals = loadCustomFieldValues();
    if (cfVals[oldKey] !== undefined) { cfVals[newKey] = cfVals[oldKey]; delete cfVals[oldKey]; saveCustomFieldValues(cfVals); setCustomFieldValues(cfVals); }

    const cfSchemas = loadItemFieldSchemas();
    if (cfSchemas[oldKey] !== undefined) { cfSchemas[newKey] = cfSchemas[oldKey]; delete cfSchemas[oldKey]; saveItemFieldSchemas(cfSchemas); setItemFieldSchemas(cfSchemas); }

    const oldPrefix = `${category}|${oldName}|`;
    const newDels = new Set([...deletedRows].map(k => k.startsWith(oldPrefix) ? `${category}|${trimmed}|${k.slice(oldPrefix.length)}` : k));
    saveDeletedRows(newDels);
    setDeletedRows(newDels);

    const nextTodos = todos.map(t => t.linkedCategory === category && t.linkedItem === oldName ? { ...t, linkedItem: trimmed } : t);
    setTodos(nextTodos);
    saveTodos(nextTodos);

    if (selectedItem?.category === category && selectedItem?.item === oldName) setSelectedItem({ category, item: trimmed });

    reload();
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
          const d = JSON.parse(localStorage.getItem(k) || "{}");
          if (d[oldKey] !== undefined) { d[newKey] = d[oldKey]; delete d[oldKey]; localStorage.setItem(k, JSON.stringify(d)); }
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

  function handleAddCategoryDirect(name, groupType) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const customs = loadCustomData();
    saveCustomData([...customs, {
      _id: `custom-${Date.now()}`, _isCustom: true, _defaultKey: null, _isBlankCategory: true,
      category: trimmed, item: "", task: "", schedule: "", season: null, categoryType: groupType,
    }]);
    reload();
    setCollapsedGroups(prev => ({ ...prev, [groupType]: false }));
    setGroupFilter(groupType);
    setShowAddCategoryForm(false);
    setNewCatName("");
  }

  function handleRenameGroupType(groupType, newLabel) {
    const trimmed = newLabel.trim();
    if (!trimmed) { setEditingGroupType(null); return; }
    const isCustom = customGroupTypes.some(t => t.id === groupType);
    if (isCustom) {
      const updated = customGroupTypes.map(t => t.id === groupType ? { ...t, label: trimmed } : t);
      saveCustomGroupTypes(updated);
      setCustomGroupTypes(updated);
    } else {
      const updated = { ...groupLabelOverrides, [groupType]: trimmed };
      saveGroupLabelOverrides(updated);
      setGroupLabelOverrides(updated);
    }
    setEditingGroupType(null);
  }

  function handleDeleteGroupTypeClick(groupType) {
    const cats = groupedCategories[groupType] ?? [];
    const itemCount = cats.reduce((n, cat) => n + (CATEGORY_ITEMS[cat]?.length || 0), 0);
    const taskCount = rows.filter(r => cats.includes(r.category) && r.task && !r._isBlankCategory).length;
    const allChores = loadChores();
    const choreCount = allChores.filter(c => cats.includes(c.room)).length;
    const allTodos = loadTodos();
    const todoCount = allTodos.filter(t => cats.includes(t.linkedCategory)).length;
    const allProjects = loadProjects();
    const projectCount = allProjects.filter(p =>
      allTodos.some(t => t.projectId === p.id && cats.includes(t.linkedCategory))
    ).length;
    setDeleteGroupPrompt({
      groupType,
      label: allGroupLabels[groupType],
      counts: { categories: cats.length, items: itemCount, tasks: taskCount, chores: choreCount, todos: todoCount, projects: projectCount },
    });
  }

  function handleConfirmDeleteGroupType() {
    if (!deleteGroupPrompt) return;
    const { groupType } = deleteGroupPrompt;
    const cats = groupedCategories[groupType] ?? [];
    // Reassign all categories in this type to "system"
    if (cats.length > 0) {
      const updated = { ...loadCategoryTypeOverrides() };
      cats.forEach(cat => { updated[cat] = "system"; });
      saveCategoryTypeOverrides(updated);
      setCategoryTypeOverridesState(updated);
    }
    // Remove from custom types or label overrides
    const isCustom = customGroupTypes.some(t => t.id === groupType);
    if (isCustom) {
      const updated = customGroupTypes.filter(t => t.id !== groupType);
      saveCustomGroupTypes(updated);
      setCustomGroupTypes(updated);
    } else {
      const updated = { ...groupLabelOverrides };
      delete updated[groupType];
      saveGroupLabelOverrides(updated);
      setGroupLabelOverrides(updated);
    }
    if (groupFilter === groupType) setGroupFilter("all");
    setDeleteGroupPrompt(null);
  }

  function handleAddCategory(groupType) {
    const newId = `custom-${Date.now()}`;
    const newRow = {
      _id: newId, _isCustom: true, _defaultKey: null, _isBlankCategory: true,
      category: "", item: "", task: "", schedule: "", season: null,
      categoryType: groupType,
    };
    const customs = loadCustomData();
    saveCustomData([...customs, newRow]);
    reload();
    setPendingNewCategory({ id: newId, groupType });
    setCollapsedGroups(prev => ({ ...prev, [groupType]: false }));
  }

  function handleCreateCategoryFromFloorPlan(name, type) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const customs = loadCustomData();
    saveCustomData([...customs, {
      _id: `custom-${Date.now()}`, _isCustom: true, _defaultKey: null, _isBlankCategory: true,
      category: trimmed, item: "", task: "", schedule: "", season: null, categoryType: type,
    }]);
    reload();
  }

  function handleCommitNewCategory(name, rowId) {
    const trimmed = name.trim();
    setPendingNewCategory(null);
    const customs = loadCustomData();
    if (!trimmed) {
      saveCustomData(customs.filter(r => r._id !== rowId));
    } else {
      saveCustomData(customs.map(r => r._id === rowId ? { ...r, category: trimmed } : r));
    }
    reload();
  }

  function handleCancelNewCategory(rowId) {
    const customs = loadCustomData();
    saveCustomData(customs.filter(r => r._id !== rowId));
    reload();
    setPendingNewCategory(null);
  }

  function handleSetRoomSubtype(category, subtype) {
    const next = { ...roomSubtypes };
    if (subtype) next[category] = subtype;
    else delete next[category];
    saveRoomSubtypes(next);
    setRoomSubtypes(next);
  }

  function handleAddItem(category) {
    const newId = `custom-${Date.now()}`;
    const newRow = {
      _id: newId, _isCustom: true, _defaultKey: null,
      category, item: "", task: "", schedule: "", season: null,
    };
    const customs = loadCustomData();
    saveCustomData([...customs, newRow]);
    reload();
    setNewItemIds(prev => new Set([...prev, newId]));
    setCollapsed(prev => ({ ...prev, [category]: false }));
  }

  function handleAddItemNamed(category, itemName) {
    const trimmed = itemName.trim();
    if (!trimmed || !category) return;
    const customs = loadCustomData();
    saveCustomData([...customs, {
      _id: `custom-${Date.now()}`, _isCustom: true, _defaultKey: null,
      category, item: trimmed, task: "", schedule: "", season: null,
    }]);
    reload();
  }

  function handleCommitItemName(rowId, name) {
    const trimmed = name.trim();
    setNewItemIds(prev => { const next = new Set(prev); next.delete(rowId); return next; });
    const customs = loadCustomData();
    if (!trimmed) {
      saveCustomData(customs.filter(r => r._id !== rowId));
    } else {
      saveCustomData(customs.map(r => r._id === rowId ? { ...r, item: trimmed } : r));
    }
    reload();
  }

  function handleCancelNewItem(rowId) {
    setNewItemIds(prev => { const next = new Set(prev); next.delete(rowId); return next; });
    const customs = loadCustomData();
    saveCustomData(customs.filter(r => r._id !== rowId));
    reload();
  }

  function renderCategory(category) {
    const items = CATEGORY_ITEMS[category];
    const isCollapsed = collapsed[category];
    const isDragging = dragging === category;
    const isEditing = editingCategoryName === category;

    const pendingItems = newItemRowsByCategory[category] || [];
    const hasContent = !isCollapsed || pendingItems.length > 0;
    const isCategoryDefault = rows.some(r => r.category === category && !r._isCustom);
    const existingItemSet = new Set(items);
    const itemSuggestions = [...new Set([
      ...getAllDefaultItems(),
      ...rows.filter(r => r.item && !r._isBlankCategory).map(r => r.item),
    ])].filter(i => !existingItemSet.has(i)).sort();
    const isItemDropTarget = !!draggingItem && dragOverCategory === category && draggingItem.fromCategory !== category;

    return (
      <div
        key={category}
        draggable={!isEditing}
        onDragStart={e => { e.stopPropagation(); setDragging(category); }}
        onDragEnd={() => { setDragging(null); setDragOverGroup(null); }}
        onDragEnter={() => { if (draggingItem && draggingItem.fromCategory !== category) setDragOverCategory(category); }}
        onDragOver={e => { if (draggingItem) e.preventDefault(); }}
        onDrop={e => { e.stopPropagation(); handleItemDrop(category); }}
        style={{
          marginBottom: "0.5rem",
          opacity: isDragging ? 0.4 : 1,
          transition: "opacity 0.15s",
        }}
      >
        <div style={{
          alignItems: "center",
          background: isItemDropTarget ? "#1a2035" : "var(--fm-bg-raised)",
          border: `1px solid ${isItemDropTarget ? "var(--fm-brass)50" : "var(--fm-hairline)"}`,
          borderRadius: isCollapsed ? "6px" : "6px 6px 0 0",
          cursor: isEditing ? "default" : "grab",
          display: "flex",
          gap: "0.75rem",
          padding: "0.8rem 1rem",
          transition: "background 0.15s, border-color 0.15s",
          userSelect: "none",
        }}>
          <span style={{ color: "var(--fm-ink-dim)", flexShrink: 0, fontSize: "0.7rem", lineHeight: 1 }}>⠿</span>
          <button
            onClick={e => { e.stopPropagation(); toggleCollapse(category); }}
            style={{
              background: "none",
              border: "none",
              color: "var(--fm-ink-dim)",
              cursor: "pointer",
              fontFamily: "var(--fm-mono)",
              fontSize: "0.65rem",
              padding: 0,
              width: 14,
            }}
          >
            {isCollapsed ? "▶" : "▼"}
          </button>

          {isEditing ? (
            <InlineInput
              initialValue={category}
              placeholder="Category name..."
              onCommit={name => handleCategoryRename(category, name)}
              onCancel={() => setEditingCategoryName(null)}
            />
          ) : (
            <Tooltip text={isCategoryDefault ? CATEGORY_TIPS[category] : undefined}>
              <span
                onClick={e => { e.stopPropagation(); setEditingCategoryName(category); }}
                title="Click to rename"
                style={{ color: "var(--fm-ink)", cursor: "text", flex: 1, fontSize: "0.95rem" }}
              >
                {category}
              </span>
            </Tooltip>
          )}

          {!isEditing && (
            <>
              {effectiveCategoryTypes[category] === "room" && !isCollapsed && (
                <select
                  value={roomSubtypes[category] ?? ""}
                  onClick={e => e.stopPropagation()}
                  onChange={e => { e.stopPropagation(); handleSetRoomSubtype(category, e.target.value || null); }}
                  style={{
                    background: "var(--fm-bg)",
                    border: `1px solid ${roomSubtypes[category] ? "#3a4055" : "var(--fm-hairline2)"}`,
                    borderRadius: "3px",
                    color: roomSubtypes[category] ? "var(--fm-brass-dim)" : "#4a5060",
                    cursor: "pointer",
                    fontFamily: "var(--fm-mono)",
                    fontSize: "0.6rem",
                    letterSpacing: "0.04em",
                    padding: "0.1rem 0.25rem",
                  }}
                >
                  <option value="">— type —</option>
                  {ROOM_SUBTYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
              <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem" }}>
                {items.length} {items.length === 1 ? "item" : "items"}
              </span>
              <button
                onClick={e => { e.stopPropagation(); handleDuplicateCategory(category); }}
                title="Duplicate category"
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--fm-ink-dim)",
                  cursor: "pointer",
                  fontFamily: "var(--fm-mono)",
                  fontSize: "0.8rem",
                  padding: "0.1rem 0.3rem",
                  transition: "color 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"}
                onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
              >
                ⎘
              </button>
              <button
                onClick={e => { e.stopPropagation(); handleDeleteClick(category); }}
                title="Delete category"
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--fm-ink-dim)",
                  cursor: "pointer",
                  fontFamily: "var(--fm-mono)",
                  fontSize: "0.72rem",
                  padding: "0.1rem 0.3rem",
                  transition: "color 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
              >
                ×
              </button>
            </>
          )}
        </div>

        {!isCollapsed && (
          <div style={{ border: "1px solid var(--fm-hairline)", borderTop: "none", borderRadius: "0 0 6px 6px", overflow: "hidden" }}>
            {items.map((item, idx) => {
              const isLast = idx === items.length - 1 && pendingItems.length === 0;
              const isItemDragging = draggingItem?.item === item && draggingItem?.fromCategory === category;
              const itemKey = `${category}|${item}`;
              const isSelected = selectedItem?.category === category && selectedItem?.item === item;
              const details = itemDetails[itemKey] || {};
              const rowBg = idx % 2 === 0 ? "var(--fm-bg-raised)" : "#161920";
              return (
                <Fragment key={item}>
                  <div
                    draggable
                    onDragStart={e => { e.stopPropagation(); setDraggingItem({ item, fromCategory: category }); }}
                    onDragEnd={e => { e.stopPropagation(); setDraggingItem(null); setDragOverCategory(null); }}
                    style={{
                      alignItems: "center",
                      background: isSelected ? "#1a2035" : rowBg,
                      borderBottom: "1px solid var(--fm-hairline)",
                      borderLeft: isSelected ? "2px solid var(--fm-brass)" : "2px solid transparent",
                      cursor: "grab",
                      display: "flex",
                      gap: "1rem",
                      opacity: isItemDragging ? 0.4 : 1,
                      padding: "0.5rem 1rem 0.5rem 1.75rem",
                      transition: "opacity 0.15s, background 0.1s",
                    }}
                  >
                    {editingItemName?.category === category && editingItemName?.item === item ? (
                      <input
                        autoFocus
                        defaultValue={item}
                        onKeyDown={e => {
                          if (e.key === "Enter") { e.preventDefault(); handleItemRename(category, item, e.currentTarget.value); }
                          if (e.key === "Escape") { e.preventDefault(); setEditingItemName(null); }
                        }}
                        onBlur={e => handleItemRename(category, item, e.target.value)}
                        onClick={e => e.stopPropagation()}
                        style={{ background: "var(--fm-bg-panel)", border: "1px solid var(--fm-brass)", borderRadius: "2px", color: "var(--fm-ink)", flex: 1, fontFamily: "var(--fm-mono)", fontSize: "0.78rem", outline: "none", padding: "0.1rem 0.3rem" }}
                      />
                    ) : (
                      <Tooltip text={ITEM_TIPS[item]}>
                        <span
                          onClick={e => { e.stopPropagation(); setSelectedItem({ category, item }); }}
                          onDoubleClick={e => { e.stopPropagation(); setEditingItemName({ category, item }); }}
                          style={{
                            color: isSelected ? "var(--fm-brass)" : "var(--fm-ink-dim)",
                            cursor: "pointer",
                            flex: 1,
                            fontFamily: "var(--fm-mono)",
                            fontSize: "0.78rem",
                          }}
                        >
                          {item}
                        </span>
                      </Tooltip>
                    )}
                    {(() => {
                      const cov = itemCoverageMap[`${category}|${item}`];
                      if (!cov) return (
                        <span style={{ color: "#3a3548", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.6rem" }}>no tasks</span>
                      );
                      if (cov.unscheduled > 0) return (
                        <span style={{ color: "#5a4a2e", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.6rem" }}>{cov.unscheduled} unscheduled</span>
                      );
                      return null;
                    })()}
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        const r = e.currentTarget.getBoundingClientRect();
                        setDuplicateItemPopup({ item, fromCategory: category, x: r.left, y: r.bottom + 4 });
                      }}
                      title="Copy item to another category"
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--fm-ink-dim)",
                        cursor: "pointer",
                        flexShrink: 0,
                        fontFamily: "var(--fm-mono)",
                        fontSize: "0.8rem",
                        padding: "0.1rem 0.3rem",
                        transition: "color 0.15s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"}
                      onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                    >
                      ⎘
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleItemDeleteClick(category, item); }}
                      title="Delete item"
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--fm-ink-dim)",
                        cursor: "pointer",
                        fontFamily: "var(--fm-mono)",
                        fontSize: "0.72rem",
                        flexShrink: 0,
                        padding: "0.1rem 0.3rem",
                        transition: "color 0.15s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                      onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                    >
                      ×
                    </button>
                  </div>
                </Fragment>
              );
            })}

            {pendingItems.map((row, idx) => {
              const isLast = idx === pendingItems.length - 1;
              return (
                <div
                  key={row._id}
                  style={{
                    alignItems: "center",
                    background: (items.length + idx) % 2 === 0 ? "var(--fm-bg-raised)" : "#161920",
                    borderBottom: isLast ? "none" : "1px solid var(--fm-hairline)",
                    display: "flex",
                    gap: "1rem",
                    padding: "0.4rem 1rem 0.4rem 2.75rem",
                  }}
                >
                  <InlineComboInput
                    placeholder="Item name..."
                    options={itemSuggestions}
                    onCommit={name => handleCommitItemName(row._id, name)}
                    onCancel={() => handleCancelNewItem(row._id)}
                  />
                </div>
              );
            })}

            <div style={{
              borderTop: items.length > 0 || pendingItems.length > 0 ? "1px solid var(--fm-hairline)" : "none",
              padding: "0.4rem 1rem 0.4rem 2.75rem",
            }}>
              <button
                onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-brass)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-brass-dim)"; }}
                onClick={() => handleAddItem(category)}
                style={addBtnStyle(false)}
              >
                + Add Item
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  function buildDeleteMessage({ item, itemCount, taskCount, isDefault }) {
    if (item) {
      const scope = taskCount > 0
        ? `This will permanently remove ${taskCount} task${taskCount !== 1 ? "s" : ""} from your maintenance schedule.`
        : "This item has no tasks.";
      const recovery = isDefault
        ? " Default items can be restored by resetting to default."
        : " This action cannot be undone.";
      return scope + recovery;
    }
    const parts = [];
    if (itemCount > 0) parts.push(`${itemCount} item${itemCount !== 1 ? "s" : ""}`);
    if (taskCount > 0) parts.push(`${taskCount} task${taskCount !== 1 ? "s" : ""}`);
    const scope = parts.length > 0
      ? `This will permanently remove ${parts.join(" and ")} from your maintenance schedule.`
      : "This category has no items or tasks.";
    const recovery = isDefault
      ? " Default categories can be restored by resetting to default."
      : " This action cannot be undone.";
    return scope + recovery;
  }

  return (
    <div style={{
      height: "100vh",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      background: "var(--fm-bg)",
      color: "var(--fm-ink)",
      fontFamily: "var(--fm-sans)",
    }}>

      {duplicateItemPopup && createPortal(
        <>
          <div
            onClick={() => setDuplicateItemPopup(null)}
            style={{ bottom: 0, left: 0, position: "fixed", right: 0, top: 0, zIndex: 9998 }}
          />
          <div style={{
            background: "var(--fm-bg-panel)",
            border: "1px solid var(--fm-hairline2)",
            borderRadius: "4px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
            left: duplicateItemPopup.x,
            maxHeight: 260,
            overflowY: "auto",
            position: "fixed",
            top: duplicateItemPopup.y,
            width: 220,
            zIndex: 9999,
          }}>
            <div style={{
              borderBottom: "1px solid var(--fm-hairline2)",
              color: "var(--fm-ink-dim)",
              fontFamily: "var(--fm-mono)",
              fontSize: "0.62rem",
              letterSpacing: "0.1em",
              padding: "0.45rem 0.65rem",
              textTransform: "uppercase",
            }}>
              Copy to category
            </div>
            {CATEGORIES
              .filter(cat => cat !== duplicateItemPopup.fromCategory && !CATEGORY_ITEMS[cat]?.includes(duplicateItemPopup.item))
              .map(cat => (
                <div
                  key={cat}
                  onClick={() => handleDuplicateItemToCategory(cat)}
                  style={{
                    color: "var(--fm-brass)",
                    cursor: "pointer",
                    fontFamily: "var(--fm-mono)",
                    fontSize: "0.78rem",
                    padding: "0.35rem 0.65rem",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--fm-ink-dim)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  {cat}
                </div>
              ))
            }
            {CATEGORIES.filter(cat => cat !== duplicateItemPopup.fromCategory && !CATEGORY_ITEMS[cat]?.includes(duplicateItemPopup.item)).length === 0 && (
              <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", padding: "0.5rem 0.65rem" }}>
                No other categories
              </div>
            )}
          </div>
        </>,
        document.body
      )}

      {deletePrompt && (
        <div
          onClick={() => setDeletePrompt(null)}
          style={{
            alignItems: "center",
            background: "rgba(0,0,0,0.7)",
            bottom: 0,
            display: "flex",
            justifyContent: "center",
            left: 0,
            position: "fixed",
            right: 0,
            top: 0,
            zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "var(--fm-bg-panel)",
              border: "1px solid var(--fm-hairline2)",
              borderRadius: "8px",
              maxWidth: 440,
              padding: "2rem",
              width: "90%",
            }}
          >
            <div style={{ color: "var(--fm-ink)", fontSize: "1.05rem", marginBottom: "0.75rem" }}>
              {deletePrompt.item
                ? `Delete "${deletePrompt.item}"?`
                : `Delete "${deletePrompt.category}"?`}
            </div>
            <p style={{
              color: "var(--fm-ink-dim)",
              fontFamily: "var(--fm-mono)",
              fontSize: "0.8rem",
              lineHeight: 1.7,
              margin: "0 0 1.75rem",
            }}>
              {buildDeleteMessage(deletePrompt)}
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                onClick={() => setDeletePrompt(null)}
                style={{
                  background: "transparent",
                  border: "1px solid var(--fm-hairline2)",
                  borderRadius: "3px",
                  color: "var(--fm-brass-dim)",
                  cursor: "pointer",
                  fontFamily: "var(--fm-mono)",
                  fontSize: "0.72rem",
                  letterSpacing: "0.08em",
                  padding: "0.4rem 0.9rem",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-ink)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-brass-dim)"; }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  background: "#f8717118",
                  border: "1px solid #f8717140",
                  borderRadius: "3px",
                  color: "var(--fm-red)",
                  cursor: "pointer",
                  fontFamily: "var(--fm-mono)",
                  fontSize: "0.72rem",
                  letterSpacing: "0.08em",
                  padding: "0.4rem 0.9rem",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "#f8717130"; e.currentTarget.style.borderColor = "var(--fm-red)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#f8717118"; e.currentTarget.style.borderColor = "#f8717140"; }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}


      {addingTask && selectedItem && createPortal(
        <div
          onClick={() => { setAddingTask(false); setEditingTask(null); setNewTask({ task: "", schedule: "", season: null, lastCompleted: null, nextDate: null, followSchedule: false, notes: "" }); }}
          style={{ alignItems: "center", background: "rgba(0,0,0,0.75)", bottom: 0, display: "flex", justifyContent: "center", left: 0, position: "fixed", right: 0, top: 0, zIndex: 1000 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "var(--fm-bg)", border: "1px solid var(--fm-hairline2)", borderRadius: "8px", maxWidth: "min(95vw, 1120px)", overflow: "hidden", width: "95vw" }}
          >
            <div style={{ alignItems: "center", borderBottom: "1px solid var(--fm-hairline)", display: "flex", justifyContent: "space-between", padding: "0.85rem 1.25rem" }}>
              <div>
                <span style={{ color: "var(--fm-brass)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.15em", textTransform: "uppercase" }}>{editingTask ? "Edit Maintenance Task" : "Add Maintenance Task"}</span>
                <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", marginLeft: "0.75rem" }}>{selectedItem.item} — {selectedItem.category}</span>
              </div>
              <button
                onClick={() => { setAddingTask(false); setEditingTask(null); setNewTask({ task: "", schedule: "", season: null, lastCompleted: null, nextDate: null, followSchedule: false, notes: "" }); }}
                style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "1rem", padding: "0.1rem 0.3rem", transition: "color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
              >×</button>
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
                      <th key={label} style={{ background: "var(--fm-bg-panel)", borderBottom: "2px solid var(--fm-hairline2)", color: "var(--fm-brass)", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", fontWeight: "normal", letterSpacing: "0.12em", padding: "0.75rem 0.6rem", textAlign: "left", textTransform: "uppercase", whiteSpace: "nowrap", width }}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ background: "var(--fm-bg-raised)" }}>
                    <td style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.5rem 0.6rem", verticalAlign: "middle" }}>{selectedItem.category}</td>
                    <td style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", padding: "0.5rem 0.6rem", verticalAlign: "middle" }}>{selectedItem.item}</td>
                    <td style={{ padding: "0.5rem 0.6rem", verticalAlign: "middle" }}>
                      <input
                        autoFocus
                        value={newTask.task}
                        placeholder="Task name"
                        disabled={editingTask && !editingTask._isCustom}
                        onChange={e => setNewTask(t => ({ ...t, task: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key === "Enter" && newTask.task.trim()) { e.preventDefault(); editingTask ? handleUpdateTask(editingTask) : handleAddTask(); }
                          if (e.key === "Escape") { e.preventDefault(); setAddingTask(false); setEditingTask(null); setNewTask({ task: "", schedule: "", season: null, lastCompleted: null, nextDate: null, followSchedule: false, notes: "" }); }
                        }}
                        style={{ background: "var(--fm-bg-panel)", border: "1px solid var(--fm-hairline2)", borderRadius: "2px", boxSizing: "border-box", color: editingTask && !editingTask._isCustom ? "var(--fm-ink-dim)" : "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.8rem", opacity: editingTask && !editingTask._isCustom ? 0.6 : 1, outline: "none", padding: "0.25rem 0.4rem", width: "100%" }}
                        onFocus={e => { if (!(editingTask && !editingTask._isCustom)) e.currentTarget.style.borderColor = "var(--fm-brass)"; }}
                        onBlur={e => e.currentTarget.style.borderColor = "var(--fm-ink-dim)"}
                      />
                    </td>
                    <td style={{ padding: "0.5rem 0.6rem", verticalAlign: "middle" }}>
                      <SchedulePicker
                        value={newTask.schedule || null}
                        onChange={v => setNewTask(t => ({ ...t, schedule: v || "" }))}
                      />
                    </td>
                    <td style={{ padding: "0.5rem 0.6rem", verticalAlign: "middle" }}>
                      <select
                        value={newTask.season ?? ""}
                        onChange={e => setNewTask(t => ({ ...t, season: e.target.value || null }))}
                        style={{ appearance: "none", background: "var(--fm-bg-panel)", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235a5460'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 0.4rem center", border: "1px solid var(--fm-hairline2)", borderRadius: "2px", boxSizing: "border-box", color: "var(--fm-ink)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", outline: "none", padding: "0.25rem 1.5rem 0.25rem 0.4rem", width: "100%" }}
                        onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
                        onBlur={e => e.currentTarget.style.borderColor = "var(--fm-ink-dim)"}
                      >
                        {SEASON_OPTIONS.map(({ value, label }) => <option key={label} value={value ?? ""}>{label}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "0.5rem 0.6rem", verticalAlign: "middle" }}>
                      <input
                        type="date"
                        value={newTask.lastCompleted || ""}
                        onChange={e => setNewTask(t => ({ ...t, lastCompleted: e.target.value || null }))}
                        style={{ background: "var(--fm-bg-panel)", border: "1px solid var(--fm-hairline2)", borderRadius: "2px", boxSizing: "border-box", color: newTask.lastCompleted ? "var(--fm-ink)" : "var(--fm-ink-dim)", colorScheme: "dark", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", outline: "none", padding: "0.25rem 0.4rem", width: "100%" }}
                        onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
                        onBlur={e => e.currentTarget.style.borderColor = "var(--fm-ink-dim)"}
                      />
                    </td>
                    <td style={{ padding: "0.5rem 0.6rem", verticalAlign: "middle" }}>
                      <div style={{ alignItems: "center", display: "flex", gap: "0.4rem" }}>
                        <input
                          type="date"
                          value={newTask.nextDate || ""}
                          onChange={e => setNewTask(t => ({ ...t, nextDate: e.target.value || null }))}
                          style={{ background: "var(--fm-bg-panel)", border: "1px solid var(--fm-hairline2)", borderRadius: "2px", boxSizing: "border-box", color: newTask.nextDate ? "var(--fm-ink)" : "var(--fm-ink-dim)", colorScheme: "dark", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", outline: "none", padding: "0.25rem 0.4rem", width: "100%" }}
                          onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
                          onBlur={e => e.currentTarget.style.borderColor = "var(--fm-ink-dim)"}
                        />
                        <FollowButton
                          schedule={newTask.schedule}
                          checked={newTask.followSchedule}
                          onToggle={() => setNewTask(t => ({ ...t, followSchedule: !t.followSchedule }))}
                        />
                      </div>
                    </td>
                    <td style={{ padding: "0.5rem 0.6rem", verticalAlign: "middle" }}>
                      <input
                        value={newTask.notes}
                        placeholder="—"
                        onChange={e => setNewTask(t => ({ ...t, notes: e.target.value }))}
                        style={{ background: "var(--fm-bg-panel)", border: "1px solid var(--fm-hairline2)", borderRadius: "2px", boxSizing: "border-box", color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", outline: "none", padding: "0.25rem 0.4rem", width: "100%" }}
                        onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
                        onBlur={e => e.currentTarget.style.borderColor = "var(--fm-ink-dim)"}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ borderTop: "1px solid var(--fm-hairline)", display: "flex", gap: "0.75rem", justifyContent: "flex-end", padding: "1rem 1.25rem" }}>
              <button
                onClick={() => { setAddingTask(false); setEditingTask(null); setNewTask({ task: "", schedule: "", season: null, lastCompleted: null, nextDate: null, followSchedule: false, notes: "" }); }}
                style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: "var(--fm-brass-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 0.9rem", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-ink)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-brass-dim)"; }}
              >Cancel</button>
              <button
                onClick={editingTask ? () => handleUpdateTask(editingTask) : handleAddTask}
                disabled={!newTask.task.trim()}
                style={{ background: newTask.task.trim() ? "var(--fm-brass)18" : "transparent", border: `1px solid ${newTask.task.trim() ? "var(--fm-brass)40" : "var(--fm-ink-dim)"}`, borderRadius: "3px", color: newTask.task.trim() ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: newTask.task.trim() ? "pointer" : "default", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 0.9rem", transition: "all 0.15s" }}
                onMouseEnter={e => { if (newTask.task.trim()) { e.currentTarget.style.background = "var(--fm-brass)30"; e.currentTarget.style.borderColor = "var(--fm-brass)"; } }}
                onMouseLeave={e => { if (newTask.task.trim()) { e.currentTarget.style.background = "var(--fm-brass)18"; e.currentTarget.style.borderColor = "var(--fm-brass)40"; } }}
              >{editingTask ? "Save" : "Add Task"}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {addTaskModalOpen && selectedItem && (
        <AddTaskModal
          categories={[]}
          rows={[]}
          lockCategoryItem
          initialCategory={selectedItem.category}
          initialItem={selectedItem.item}
          onSave={handleAddTaskFromModal}
          onClose={() => setAddTaskModalOpen(false)}
        />
      )}

      {deleteTaskPrompt && createPortal(
        <div
          onClick={() => setDeleteTaskPrompt(null)}
          style={{ alignItems: "center", background: "rgba(0,0,0,0.7)", bottom: 0, display: "flex", justifyContent: "center", left: 0, position: "fixed", right: 0, top: 0, zIndex: 1000 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: "var(--fm-bg-panel)", border: "1px solid var(--fm-hairline2)", borderRadius: "8px", maxWidth: 440, padding: "2rem", width: "90%" }}>
            <div style={{ color: "var(--fm-ink)", fontSize: "1.05rem", marginBottom: "0.75rem" }}>
              Delete "{deleteTaskPrompt.task}"?
            </div>
            <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.8rem", lineHeight: 1.7, margin: "0 0 1.75rem" }}>
              {deleteTaskPrompt?._isCustom
                ? "This will permanently remove this task from the maintenance schedule. This action cannot be undone."
                : "This will remove this task from your maintenance schedule. It can be restored from the Guide page."}
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                onClick={() => setDeleteTaskPrompt(null)}
                style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: "var(--fm-brass-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 0.9rem", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-ink)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-brass-dim)"; }}
              >Cancel</button>
              <button
                onClick={() => { handleDeleteTask(deleteTaskPrompt); setDeleteTaskPrompt(null); }}
                style={{ background: "#f8717118", border: "1px solid #f8717140", borderRadius: "3px", color: "var(--fm-red)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 0.9rem", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#f8717130"; e.currentTarget.style.borderColor = "var(--fm-red)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#f8717118"; e.currentTarget.style.borderColor = "#f8717140"; }}
              >Delete</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {deleteProjectPrompt && createPortal(
        <div
          onClick={() => setDeleteProjectPrompt(null)}
          style={{ alignItems: "center", background: "rgba(0,0,0,0.7)", bottom: 0, display: "flex", justifyContent: "center", left: 0, position: "fixed", right: 0, top: 0, zIndex: 1000 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: "var(--fm-bg-panel)", border: "1px solid var(--fm-hairline2)", borderRadius: "8px", maxWidth: 440, padding: "2rem", width: "90%" }}>
            <div style={{ color: "var(--fm-ink)", fontSize: "1.05rem", marginBottom: "0.75rem" }}>
              Delete "{deleteProjectPrompt.name}"?
            </div>
            <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.8rem", lineHeight: 1.7, margin: "0 0 1.75rem" }}>
              This will permanently delete this project. This action cannot be undone.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                onClick={() => setDeleteProjectPrompt(null)}
                style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: "var(--fm-brass-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 0.9rem", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-ink)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-brass-dim)"; }}
              >Cancel</button>
              <button
                onClick={() => handleDeleteProject(deleteProjectPrompt)}
                style={{ background: "#f8717118", border: "1px solid #f8717140", borderRadius: "3px", color: "var(--fm-red)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 0.9rem", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#f8717130"; e.currentTarget.style.borderColor = "var(--fm-red)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#f8717118"; e.currentTarget.style.borderColor = "#f8717140"; }}
              >Delete</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {deleteTodoPrompt && createPortal(
        <div
          onClick={() => setDeleteTodoPrompt(null)}
          style={{ alignItems: "center", background: "rgba(0,0,0,0.7)", bottom: 0, display: "flex", justifyContent: "center", left: 0, position: "fixed", right: 0, top: 0, zIndex: 1000 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: "var(--fm-bg-panel)", border: "1px solid var(--fm-hairline2)", borderRadius: "8px", maxWidth: 440, padding: "2rem", width: "90%" }}>
            <div style={{ color: "var(--fm-ink)", fontSize: "1.05rem", marginBottom: "0.75rem" }}>
              Delete "{deleteTodoPrompt.title}"?
            </div>
            <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.8rem", lineHeight: 1.7, margin: "0 0 1.75rem" }}>
              This will permanently delete this to do. This action cannot be undone.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                onClick={() => setDeleteTodoPrompt(null)}
                style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: "var(--fm-brass-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 0.9rem", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-ink)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-brass-dim)"; }}
              >Cancel</button>
              <button
                onClick={() => handleDeleteTodo(deleteTodoPrompt)}
                style={{ background: "#f8717118", border: "1px solid #f8717140", borderRadius: "3px", color: "var(--fm-red)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 0.9rem", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#f8717130"; e.currentTarget.style.borderColor = "var(--fm-red)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#f8717118"; e.currentTarget.style.borderColor = "#f8717140"; }}
              >Delete</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <FmHeader active="Inventory" tagline="Inventory" />
      <FmSubnav
        tabs={["Item List", "Floor Plan", "Outline"]}
        active={activeTab}
        onTabChange={tab => { setActiveTab(tab); setGroupFilter("all"); }}
        stats={[
          { value: totalItems, label: "items" },
          { value: systemCatCount, label: "systems" },
          { value: roomCatCount, color: "var(--fm-cyan)", label: "rooms" },
        ]}
      />

      {activeTab === "Floor Plan" ? (
        <FloorPlan
          categories={CATEGORIES}
          categoryTypes={effectiveCategoryTypes}
          categoryItems={CATEGORY_ITEMS}
          entityTypeData={entityTypeData}
          onCreateCategory={handleCreateCategoryFromFloorPlan}
          onRenameCategory={handleCategoryRename}
          onDeleteCategory={handleDeleteClick}
          onFieldChange={handleCustomFieldValueChange}
          onChangeCategoryType={handleCategoryTypeChange}
        />
      ) : (
      <div style={{ display: "flex", flex: 1, flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", flex: 1, gap: "2rem", overflow: "hidden", padding: "0.75rem 2rem 0" }}>
        <div style={activeTab === "Outline" ? { display: "flex", flex: "0 0 75%", flexDirection: "column", minWidth: 0, overflow: "hidden" } : { flex: "0 0 75%", minWidth: 0, overflowY: "auto", paddingBottom: "4rem", scrollbarGutter: "stable" }}>

        {activeTab === "Item List" ? (
          <ItemInventoryView
            categories={CATEGORIES}
            categoryItems={CATEGORY_ITEMS}
            categoryTypes={effectiveCategoryTypes}
            entityTypeData={entityTypeData}
            itemDetails={itemDetails}
            onSelectItem={setSelectedItem}
            customFieldValues={customFieldValues}
            onAddItem={handleAddItemNamed}
            onDeleteItem={handleItemDeleteClick}
            onRenameItem={handleItemRename}
            onFieldChange={handleCustomFieldValueChange}
          />
        ) : null}


        {activeTab === "Outline" && (
          <OutlineTab categories={CATEGORIES} categoryTypes={effectiveCategoryTypes} categoryItems={CATEGORY_ITEMS} entityTypeData={entityTypeData} onRefreshEntityTypes={refreshEntityTypes} onCreateCategory={handleAddCategoryDirect} onAddItem={handleAddItemNamed} onSelectItem={setSelectedItem} customFieldValues={customFieldValues} onDeleteCategory={handleDeleteClick} onRenameCategory={handleCategoryRename} />
        )}

        </div>

        <div style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          minWidth: 0,
          overflow: "hidden",
        }}>
          <div style={{ background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline)", borderRadius: "8px", display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>

          {/* Panel header — item name */}
          <div style={{ borderBottom: "1px solid var(--fm-hairline)", flexShrink: 0, padding: "0.75rem 1rem 0.6rem" }}>
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
                const cfKey = `${selectedItem.category}|${selectedItem.item}`;
                const itmFields = itemFieldSchemas[cfKey] || [];
                const vals = customFieldValues[cfKey] || {};
                const itemTypeField = UNIVERSAL_FIELDS.find(f => f.id === "item_type");
                const addedIds = new Set([...itmFields.map(f => f.id), "item_type", "system", "room"]);
                const svgArrow = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235a5460'/%3E%3C/svg%3E")`;
                const fieldStyle = { background: "var(--fm-bg)", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", boxSizing: "border-box", color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", outline: "none", padding: "0.3rem 0.5rem", width: "100%" };
                const labelStyle = { color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.12em", textTransform: "uppercase" };
                const chipBtn = { background: "var(--fm-bg-raised)", border: "1px solid var(--fm-hairline)", borderRadius: "3px", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", letterSpacing: "0.04em", padding: "0.2rem 0.55rem", transition: "all 0.12s" };

                function renderFieldInput(field) {
                  const val = vals[field.id] ?? "";
                  const onChange = v => handleCustomFieldValueChange(selectedItem.category, selectedItem.item, field.id, v);

                  if (field.id === "item_type") {
                    const existingTypes = [...new Set(Object.values(customFieldValues).map(v => v?.item_type).filter(Boolean))].sort();
                    return <ModelComboField value={val} models={existingTypes} fieldStyle={fieldStyle} onChange={onChange} />;
                  }
                  if (field.id === "system") {
                    const systemVal = vals.systemCategory || vals.system || "";
                    const systemOptions = CATEGORIES.filter(c => isFunctional(resolveTypeId(c, effectiveCategoryTypes[c] || "system"), entityTypeData)).sort();
                    const defaultSystem = isFunctional(resolveTypeId(selectedItem.category, effectiveCategoryTypes[selectedItem.category] || "system"), entityTypeData) ? selectedItem.category : "";
                    return <ModelComboField value={systemVal || defaultSystem} models={systemOptions} fieldStyle={fieldStyle} onChange={v => handleCustomFieldValueChange(selectedItem.category, selectedItem.item, "systemCategory", v)} />;
                  }
                  if (field.id === "room") {
                    const catIsSpatialItem = isSpatial(resolveTypeId(selectedItem.category, effectiveCategoryTypes[selectedItem.category] || "system"), entityTypeData);
                    const roomOpts = CATEGORIES.filter(c => isSpatial(resolveTypeId(c, effectiveCategoryTypes[c] || "system"), entityTypeData)).sort();
                    const roomVal = vals.roomLabel || vals.room || (catIsSpatialItem ? selectedItem.category : "");
                    return <ModelComboField value={roomVal} models={roomOpts} fieldStyle={fieldStyle} onChange={v => handleCustomFieldValueChange(selectedItem.category, selectedItem.item, "roomLabel", v)} />;
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
                        <div style={{ marginBottom: "0.2rem" }}>
                          <span style={labelStyle}>{itemTypeField.name}</span>
                        </div>
                        {renderFieldInput(itemTypeField)}
                      </div>
                    )}
                    <div style={{ marginBottom: "0.45rem" }}>
                      <div style={{ marginBottom: "0.2rem" }}>
                        <span style={labelStyle}>System</span>
                      </div>
                      {renderFieldInput({ id: "system", name: "System", type: "text" })}
                    </div>
                    <div style={{ marginBottom: "0.45rem" }}>
                      <div style={{ marginBottom: "0.2rem" }}>
                        <span style={labelStyle}>Room</span>
                      </div>
                      {renderFieldInput({ id: "room", name: "Room", type: "text" })}
                    </div>
                    {itmFields.map(field => (
                      <div key={field.id} style={{ marginBottom: "0.45rem" }}>
                        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: "0.2rem" }}>
                          <span style={labelStyle}>{field.name}</span>
                          <button onClick={() => handleDeleteItemField(selectedItem.category, selectedItem.item, field.id)} style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.85rem", lineHeight: 1, padding: "0 0.1rem", transition: "color 0.15s" }} onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"} onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}>×</button>
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
                                <button key={f.id} onClick={() => handleAddItemField(selectedItem.category, selectedItem.item, f)} style={chipBtn} onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}>{f.name}</button>
                              ))}
                            </div>
                          </>
                        )}
                        {itemLibAvail.length > 0 && (
                          <>
                            <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.12em", marginBottom: "0.4rem", textTransform: "uppercase" }}>For {selectedItem.item}</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.6rem" }}>
                              {itemLibAvail.map(f => (
                                <button key={f.id} onClick={() => handleAddItemField(selectedItem.category, selectedItem.item, f)} style={chipBtn} onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}>{f.name}</button>
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
                          <button onClick={() => { if (!newField.name.trim()) return; handleAddItemField(selectedItem.category, selectedItem.item, { id: crypto.randomUUID(), name: newField.name.trim(), type: newField.type, options: newField.type === "list" ? newField.options.split(",").map(s => s.trim()).filter(Boolean) : [] }); setNewField({ name: "", type: "text", options: "" }); }} disabled={!newField.name.trim()} style={{ background: newField.name.trim() ? "var(--fm-brass)18" : "transparent", border: `1px solid ${newField.name.trim() ? "var(--fm-brass)40" : "var(--fm-ink-dim)"}`, borderRadius: "3px", color: newField.name.trim() ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: newField.name.trim() ? "pointer" : "default", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", padding: "0.25rem 0.65rem" }}>+ Add custom</button>
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
                <div style={{
                  color: "var(--fm-ink-dim)",
                  fontFamily: "var(--fm-mono)",
                  fontSize: "0.72rem",
                  padding: "2rem 1rem 0.5rem",
                  textAlign: "center",
                }}>
                  No tasks for this item
                </div>
              ) : (
                <div>
                  {itemTasks.map((row, idx) => (
                    <div
                      key={row._id || `${row.task}-${idx}`}
                      style={{
                        alignItems: "flex-start",
                        background: idx % 2 === 0 ? "var(--fm-bg-raised)" : "#161920",
                        borderBottom: idx < itemTasks.length - 1 ? "1px solid var(--fm-hairline)" : "none",
                        display: "flex",
                        gap: "0.5rem",
                        padding: "0.65rem 1rem",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{
                          color: "var(--fm-ink)",
                          fontFamily: "var(--fm-mono)",
                          fontSize: "0.78rem",
                          marginBottom: "0.2rem",
                        }}>
                          {row.task}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
                          {row.schedule && (
                            <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem" }}>
                              {row.schedule}
                            </span>
                          )}
                          {row.season && (
                            <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem" }}>
                              {row.season}
                            </span>
                          )}
                          {!row.schedule && !nextDatesMap[`${row.category}|${row.item}|${row.task}`] && (
                            <span style={{ background: "#16141c", border: "1px solid #2a2535", borderRadius: "3px", color: "#4a4458", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.04em", padding: "0.1rem 0.35rem" }}>
                              no schedule
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                          onClick={() => {
                            const key = `${row.category}|${row.item}|${row.task}`;
                            const dates = JSON.parse(localStorage.getItem("maintenance-dates") || "{}");
                            const nextDates = JSON.parse(localStorage.getItem("maintenance-next-dates") || "{}");
                            const notes = JSON.parse(localStorage.getItem("maintenance-notes") || "{}");
                            const follow = JSON.parse(localStorage.getItem("maintenance-follow") || "{}");
                            const d = dates[key];
                            setNewTask({ task: row.task, schedule: row.schedule || "", season: row.season || null, lastCompleted: d ? new Date(d).toISOString().slice(0, 10) : null, nextDate: nextDates[key] ? new Date(nextDates[key]).toISOString().slice(0, 10) : null, notes: notes[key] || "", followSchedule: !!follow[key] });
                            setEditingTask(row);
                            setAddingTask(true);
                          }}
                          title="Edit task"
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--fm-ink-dim)",
                            cursor: "pointer",
                            flexShrink: 0,
                            fontFamily: "var(--fm-mono)",
                            fontSize: "0.68rem",
                            padding: "0.1rem 0.3rem",
                            transition: "color 0.15s",
                          }}
                          onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"}
                          onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                        >✎</button>
                      <button
                          onClick={() => setDeleteTaskPrompt(row)}
                          title="Delete task"
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--fm-ink-dim)",
                            cursor: "pointer",
                            flexShrink: 0,
                            fontFamily: "var(--fm-mono)",
                            fontSize: "0.72rem",
                            padding: "0.1rem 0.3rem",
                            transition: "color 0.15s",
                          }}
                          onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                          onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                        >×</button>
                    </div>
                  ))}
                </div>
              )}
              {/* Groq suggested tasks */}
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
                    <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                      Suggested by AI
                    </span>
                    <button
                      onClick={() => { setSuggestedTasks(null); setSuggestedFor(null); setFetchError(null); }}
                      style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "0.1rem 0.3rem", transition: "color 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                      onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                    >×</button>
                  </div>
                  {suggestedTasks.map((t, idx) => (
                    <label
                      key={idx}
                      style={{ alignItems: "flex-start", background: idx % 2 === 0 ? "var(--fm-bg-raised)" : "#161920", borderBottom: "1px solid var(--fm-hairline)", cursor: "pointer", display: "flex", gap: "0.6rem", padding: "0.55rem 1rem" }}
                    >
                      <input
                        type="checkbox"
                        checked={t.selected}
                        onChange={() => setSuggestedTasks(prev => prev.map((s, i) => i === idx ? { ...s, selected: !s.selected } : s))}
                        style={{ accentColor: "var(--fm-brass)", cursor: "pointer", flexShrink: 0, marginTop: "0.15rem" }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ color: t.selected ? "var(--fm-ink)" : "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", transition: "color 0.15s" }}>
                          {t.task}
                        </div>
                        {t.schedule && (
                          <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.63rem", marginTop: "0.1rem" }}>
                            {t.schedule}{t.season ? ` · ${t.season}` : ""}
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                  <div style={{ padding: "0.6rem 1rem" }}>
                    <button
                      onClick={handleAddSuggestedTasks}
                      disabled={!suggestedTasks.some(t => t.selected)}
                      style={{
                        background: suggestedTasks.some(t => t.selected) ? "var(--fm-brass)18" : "transparent",
                        border: `1px solid ${suggestedTasks.some(t => t.selected) ? "var(--fm-brass)40" : "var(--fm-ink-dim)"}`,
                        borderRadius: "3px",
                        color: suggestedTasks.some(t => t.selected) ? "var(--fm-brass)" : "var(--fm-ink-dim)",
                        cursor: suggestedTasks.some(t => t.selected) ? "pointer" : "default",
                        fontFamily: "var(--fm-mono)",
                        fontSize: "0.68rem",
                        letterSpacing: "0.06em",
                        padding: "0.35rem 0.75rem",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={e => { if (suggestedTasks.some(t => t.selected)) { e.currentTarget.style.background = "var(--fm-brass)30"; e.currentTarget.style.borderColor = "var(--fm-brass)"; } }}
                      onMouseLeave={e => { if (suggestedTasks.some(t => t.selected)) { e.currentTarget.style.background = "var(--fm-brass)18"; e.currentTarget.style.borderColor = "var(--fm-brass)40"; } }}
                    >
                      Add {suggestedTasks.filter(t => t.selected).length} to Schedule
                    </button>
                  </div>
                </div>
              )}

              <div style={{ alignItems: "center", borderTop: itemTasks.length > 0 || suggestedTasks ? "1px solid var(--fm-hairline)" : "none", display: "flex", padding: "0.5rem 1rem" }}>
                <button
                  onClick={() => setAddTaskModalOpen(true)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--fm-ink-dim)",
                    cursor: "pointer",
                    fontFamily: "var(--fm-mono)",
                    fontSize: "0.7rem",
                    letterSpacing: "0.05em",
                    padding: "0.2rem 0",
                    transition: "color 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                >+ Add Task</button>
                {(() => {
                  const cfKey = `${selectedItem.category}|${selectedItem.item}`;
                  const cfVals = customFieldValues[cfKey] || {};
                  const det = itemDetails[cfKey] || {};
                  const manufacturer = cfVals.manufacturer || det.manufacturer || "";
                  const model = cfVals.model || det.model || "";
                  return manufacturer && manufacturer !== "Other" ? (
                    <button
                      onClick={() => handleFetchTasks(manufacturer, model, selectedItem.item, selectedItem.category)}
                      style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.7rem", letterSpacing: "0.05em", marginLeft: "auto", padding: "0.2rem 0", transition: "color 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.color = "var(--fm-brass)"}
                      onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
                    >
                      {fetchingTasks && suggestedFor?.category === selectedItem?.category && suggestedFor?.item === selectedItem?.item ? "Fetching…" : "Fetch Tasks →"}
                    </button>
                  ) : null;
                })()}
              </div>
            </>
          ))}

          {detailTab === "projects" && (!selectedItem ? (
            <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "2.5rem 1rem", textAlign: "center" }}>
              Select an item to view projects
            </div>
            ) : (
              <>
                {selectedProjects.length === 0 && !addingProject && (
                  <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "1.25rem 1rem 0.5rem", textAlign: "center" }}>
                    No projects
                  </div>
                )}
                {selectedProjects.map((proj, idx) => {
                  const isHovered = hoveredProjectId === proj.id;
                  return (
                    <div
                      key={proj.id}
                      onMouseEnter={() => setHoveredProjectId(proj.id)}
                      onMouseLeave={() => setHoveredProjectId(null)}
                      style={{
                        alignItems: "center",
                        background: idx % 2 === 0 ? "var(--fm-bg-raised)" : "#161920",
                        borderBottom: "1px solid var(--fm-hairline)",
                        display: "flex",
                        gap: "0.5rem",
                        padding: "0.5rem 0.75rem",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          color: proj.status === "done" ? "var(--fm-ink-dim)" : "var(--fm-ink)",
                          fontFamily: "var(--fm-mono)",
                          fontSize: "0.75rem",
                          overflow: "hidden",
                          textDecoration: proj.status === "done" ? "line-through" : "none",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}>
                          {proj.name}
                        </div>
                        {proj.dueDate && (
                          <div style={{ color: proj.status !== "done" && new Date(proj.dueDate) < new Date() ? "var(--fm-red)" : "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem" }}>
                            {new Date(proj.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </div>
                        )}
                      </div>
                      <span style={{
                        background: proj.status === "done" ? "#4ade8018" : proj.status === "in-progress" ? "var(--fm-brass)18" : "var(--fm-ink-dim)",
                        border: `1px solid ${proj.status === "done" ? "#4ade8040" : proj.status === "in-progress" ? "var(--fm-brass)40" : "var(--fm-ink-dim)"}`,
                        borderRadius: "2px",
                        color: proj.status === "done" ? "var(--fm-green)" : proj.status === "in-progress" ? "var(--fm-brass)" : "var(--fm-ink-dim)",
                        flexShrink: 0,
                        fontFamily: "var(--fm-mono)",
                        fontSize: "0.58rem",
                        letterSpacing: "0.06em",
                        padding: "0.1rem 0.35rem",
                        textTransform: "uppercase",
                      }}>
                        {proj.status === "not-started" ? "To Do" : proj.status === "in-progress" ? "In Progress" : "Done"}
                      </span>
                      <button
                        onClick={() => setDeleteProjectPrompt(proj)}
                        style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.85rem", lineHeight: 1, opacity: isHovered ? 1 : 0, padding: "0 0.1rem", transition: "color 0.15s, opacity 0.1s" }}
                        onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-red)"; }}
                        onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
                      >×</button>
                    </div>
                  );
                })}

                {addingProject ? (
                  <div style={{ padding: "0.5rem 0.75rem" }}>
                    <input
                      autoFocus
                      value={newProjectName}
                      onChange={e => setNewProjectName(e.target.value)}
                      placeholder="Project name..."
                      onKeyDown={e => {
                        if (e.key === "Enter") { e.preventDefault(); handleAddProject(); }
                        if (e.key === "Escape") { e.preventDefault(); setAddingProject(false); setNewProjectName(""); }
                      }}
                      onBlur={handleAddProject}
                      style={{
                        background: "var(--fm-bg-raised)",
                        border: "1px solid var(--fm-hairline2)",
                        borderRadius: "3px",
                        boxSizing: "border-box",
                        color: "var(--fm-ink)",
                        fontFamily: "var(--fm-mono)",
                        fontSize: "0.75rem",
                        outline: "none",
                        padding: "0.3rem 0.5rem",
                        width: "100%",
                      }}
                    />
                  </div>
                ) : (
                  <div style={{ padding: "0.5rem 0.75rem" }}>
                    <button
                      onClick={() => setAddingProject(true)}
                      style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.7rem", letterSpacing: "0.05em", padding: "0.2rem 0", transition: "color 0.15s" }}
                      onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-brass)"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
                    >
                      + Add Project
                    </button>
                  </div>
                )}

                <div style={{ borderTop: "1px solid var(--fm-hairline)", padding: "0.4rem 0.75rem", textAlign: "right" }}>
                  <button
                    onClick={() => navigate("projects")}
                    style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.08em", padding: "0.1rem 0", transition: "color 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-brass)"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
                  >
                    View all on Projects →
                  </button>
                </div>
              </>
          ))}

          {detailTab === "todos" && (!selectedItem ? (
            <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "2.5rem 1rem", textAlign: "center" }}>
                Select an item to view to dos
              </div>
            ) : (
              <>
                {selectedTodos.length === 0 && !addingTodo && (
                  <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", padding: "1.25rem 1rem 0.5rem", textAlign: "center" }}>
                    No to dos
                  </div>
                )}
                {selectedTodos.map((todo, idx) => {
                  const isOverdue = todo.dueDate && todo.status !== "done" && new Date(todo.dueDate) < new Date();
                  const isHovered = hoveredTodoId === todo.id;
                  return (
                    <div
                      key={todo.id}
                      onMouseEnter={() => setHoveredTodoId(todo.id)}
                      onMouseLeave={() => setHoveredTodoId(null)}
                      style={{
                        alignItems: "center",
                        background: idx % 2 === 0 ? "var(--fm-bg-raised)" : "#161920",
                        borderBottom: "1px solid var(--fm-hairline)",
                        borderLeft: `3px solid ${PRIORITY_COLORS[todo.priority] || "var(--fm-brass)"}`,
                        display: "flex",
                        gap: "0.5rem",
                        padding: "0.5rem 0.75rem",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          color: todo.status === "done" ? "var(--fm-ink-dim)" : "var(--fm-ink)",
                          fontFamily: "var(--fm-mono)",
                          fontSize: "0.75rem",
                          overflow: "hidden",
                          textDecoration: todo.status === "done" ? "line-through" : "none",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}>
                          {todo.title}
                        </div>
                        {todo.dueDate && (
                          <div style={{ color: isOverdue ? "var(--fm-red)" : "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem" }}>
                            {new Date(todo.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </div>
                        )}
                      </div>
                      <span style={{
                        background: todo.status === "done" ? "#4ade8018" : todo.status === "in-progress" ? "var(--fm-brass)18" : "var(--fm-ink-dim)",
                        border: `1px solid ${todo.status === "done" ? "#4ade8040" : todo.status === "in-progress" ? "var(--fm-brass)40" : "var(--fm-ink-dim)"}`,
                        borderRadius: "2px",
                        color: todo.status === "done" ? "var(--fm-green)" : todo.status === "in-progress" ? "var(--fm-brass)" : "var(--fm-ink-dim)",
                        flexShrink: 0,
                        fontFamily: "var(--fm-mono)",
                        fontSize: "0.58rem",
                        letterSpacing: "0.06em",
                        padding: "0.1rem 0.35rem",
                        textTransform: "uppercase",
                      }}>
                        {todo.status === "not-started" ? "To Do" : todo.status === "in-progress" ? "In Progress" : "Done"}
                      </span>
                      <button
                        onClick={() => setDeleteTodoPrompt(todo)}
                        style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.85rem", lineHeight: 1, opacity: isHovered ? 1 : 0, padding: "0 0.1rem", transition: "color 0.15s, opacity 0.1s" }}
                        onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-red)"; }}
                        onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
                      >×</button>
                    </div>
                  );
                })}

                {addingTodo ? (
                  <div style={{ padding: "0.5rem 0.75rem" }}>
                    <input
                      autoFocus
                      value={newTodoTitle}
                      onChange={e => setNewTodoTitle(e.target.value)}
                      placeholder="To do title..."
                      onKeyDown={e => {
                        if (e.key === "Enter") { e.preventDefault(); handleAddTodo(); }
                        if (e.key === "Escape") { e.preventDefault(); setAddingTodo(false); setNewTodoTitle(""); }
                      }}
                      onBlur={handleAddTodo}
                      style={{
                        background: "var(--fm-bg-raised)",
                        border: "1px solid var(--fm-hairline2)",
                        borderRadius: "3px",
                        boxSizing: "border-box",
                        color: "var(--fm-ink)",
                        fontFamily: "var(--fm-mono)",
                        fontSize: "0.75rem",
                        outline: "none",
                        padding: "0.3rem 0.5rem",
                        width: "100%",
                      }}
                    />
                  </div>
                ) : (
                  <div style={{ padding: "0.5rem 0.75rem" }}>
                    <button
                      onClick={() => setAddingTodo(true)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--fm-ink-dim)",
                        cursor: "pointer",
                        fontFamily: "var(--fm-mono)",
                        fontSize: "0.7rem",
                        letterSpacing: "0.05em",
                        padding: "0.2rem 0",
                        transition: "color 0.15s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-brass)"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
                    >
                      + Add To Do
                    </button>
                  </div>
                )}

                <div style={{ borderTop: "1px solid var(--fm-hairline)", padding: "0.4rem 0.75rem", textAlign: "right" }}>
                  <button
                    onClick={() => navigate("board")}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--fm-ink-dim)",
                      cursor: "pointer",
                      fontFamily: "var(--fm-mono)",
                      fontSize: "0.62rem",
                      letterSpacing: "0.08em",
                      padding: "0.1rem 0",
                      transition: "color 0.15s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = "var(--fm-brass)"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
                  >
                    View all on To Dos →
                  </button>
                </div>
              </>
          ))}

          </div>{/* end tab content */}
          </div>{/* end unified panel card */}
        </div>{/* end right column */}
        </div>{/* end content row */}
      </div>
      )}
    </div>
  );
}
