import { useState, useMemo, useEffect, useRef, Fragment, forwardRef } from "react";
import { storageGet, storageSet } from "./lib/storage.js";
import { createPortal } from "react-dom";
import DatePicker from "react-datepicker";
import FmHeader from "./src/components/FmHeader.jsx";
import FmSubnav from "./src/components/FmSubnav.jsx";
import Tooltip from "./components/Tooltip.jsx";
import ConfirmDialog from "./components/ConfirmDialog.jsx";
import PropertyDetailsPanel from "./components/PropertyDetailsPanel.jsx";
import { ROOM_USES, computeBedBath, formatBaths } from "./lib/propertyDetails.js";
import { FilterDropdown, FilterRow } from "./components/FilterPill.jsx";
import { loadTodos, saveTodos, createTodo } from "./lib/todos.js";
import { createProject } from "./lib/projects.js";
import { CATEGORY_TIPS, ITEM_TIPS } from "./lib/tooltips.js";
import {
  loadData, defaultData,
  loadCustomData, saveCustomData,
  loadOverrides, saveOverrides,
} from "./lib/data.js";
import { getCategoriesForGroup, getAllDefaultItems } from "./lib/categoryData.js";
import { loadDeletedCategories, saveDeletedCategories } from "./lib/deletedCategories.js";
import { loadDeletedItems, saveDeletedItems } from "./lib/deletedItems.js";
import { getItemStableKey } from "./lib/itemKeys.js";
import { findCategoryStableKey } from "./lib/categoryKeys.js";
import { loadDeletedRows, saveDeletedRows } from "./lib/deletedRows.js";
import { loadItemDetails, saveItemDetails } from "./lib/itemDetails.js";
import {
  loadItemFieldSchemas, saveItemFieldSchemas,
  loadSpatialAssignments, saveSpatialAssignments,
  loadItemFieldValues, saveItemFieldValues,
} from "./lib/customFields.js";
import { UNIVERSAL_FIELDS, ITEM_FIELDS, TYPE_FIELDS } from "./lib/fieldLibrary.js";
import { expectedYears } from "./lib/lifespans.js";
import { BUILT_IN_ITEM_TYPES } from "./lib/itemTypes.js";
import { ITEM_SUBTYPES } from "./lib/itemSubtypes.js";
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
  getTypesForClass,
  resolveTypeId,
  getLabelForType,
  getRootTypesForClass,
  getSubtypes,
  createSubtype,
  renameType,
  deleteType,
} from "./lib/entityTypes.js";
import { getFloorsInOrder, loadFloors, saveFloors } from "./lib/floors.js";
import { loadRooms, saveRooms, createRoom, updateRoom } from "./lib/rooms.js";
import { getManufacturers } from "./lib/manufacturers.js";
import { getModels } from "./lib/models.js";
import { polygonCentroid } from "./lib/geometry.js";
import { loadFpData, saveFpData, shapeToPolygon } from "./lib/fpData.js";
import { fetchBuildingFootprint, addressToQuery } from "./lib/buildingFootprint.js";
import { useForemanStore, selectZoneItems, usePageUIState } from "./lib/store.js";
import { SEASON_OPTIONS } from "./lib/scheduleOptions.js";
import FollowButton from "./components/FollowButton.jsx";
import SchedulePicker from "./components/SchedulePicker.jsx";
import AddTaskModal from "./components/AddTaskModal.jsx";
import ComboInput from "./components/ComboInput.jsx";
import ModelComboField from "./components/ModelComboField.jsx";
import TodoModal from "./components/TodoModal.jsx";
import ItemDetailPanel from "./components/ItemDetailPanel.jsx";
import useIsMobile, { MOBILE_SHELL_HEIGHT } from "./src/hooks/useIsMobile.js";

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

// ── Floor Plan ────────────────────────────────────────────────────────────────

const FP_GRID = 20; // canvas units per foot
const FP_W = 3200;
const FP_H = 2400;

// Parametric room primitives. Dimensions are in feet; converted to canvas units
// (×FP_GRID) at placement time. Notch/gap describe the cut-out for L and U shapes.
const ROOM_SHAPE_DEFAULTS = {
  rect: { w: 12, h: 10 },
  L:    { w: 16, h: 12, notchW: 8, notchH: 6 },
  U:    { w: 16, h: 12, gapW: 6, gapDepth: 7 },
};
const ROOM_SHAPES = [
  { key: "rect", label: "Rect", title: "Rectangle" },
  { key: "L",    label: "L",    title: "L-shape" },
  { key: "U",    label: "U",    title: "U-shape" },
];

// Clamp a shape's notch/gap so it can never meet or exceed the bounding box (which
// would produce a self-touching or inverted polygon), then convert feet → units.
function roomDimsToUnits(shape, dims) {
  const d = { ...dims };
  if (shape === "L") { d.notchW = Math.min(d.notchW, d.w - 1); d.notchH = Math.min(d.notchH, d.h - 1); }
  if (shape === "U") { d.gapW = Math.min(d.gapW, d.w - 2); d.gapDepth = Math.min(d.gapDepth, d.h - 1); }
  const out = {};
  for (const k of Object.keys(d)) out[k] = Math.max(0, d[k]) * FP_GRID;
  return out;
}

const FP_FILL = {
  room:      "rgba(122,181,217,0.12)",
  system:    "rgba(197,164,102,0.12)",
  exterior:  "rgba(150,190,130,0.12)",
  safety:    "rgba(224,115,106,0.12)",
};
const FP_STROKE = {
  room:      "rgba(122,181,217,0.7)",
  system:    "rgba(197,164,102,0.7)",
  exterior:  "rgba(150,190,130,0.7)",
  safety:    "rgba(224,115,106,0.7)",
};

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

// ── Wall snapping ───────────────────────────────────────────────────────────
// Edges within this distance (canvas units, ~0.8 ft) magnetically snap together,
// so dragging a room next to another makes them share a wall / align cleanly.
const WALL_SNAP_DIST = 16;

function bboxEdges(points) {
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  return { l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) };
}

// Vertical (xs) and horizontal (ys) edge lines from a set of zone polygons —
// the candidate lines a moving edge or vertex can snap onto.
function zoneSnapLines(polys) {
  const xs = [], ys = [];
  for (const poly of polys) {
    if (!poly?.points) continue;
    const e = bboxEdges(poly.points);
    xs.push(e.l, e.r); ys.push(e.t, e.b);
  }
  return { xs, ys };
}

// Snap lines from the building outline scaffold: every vertex contributes its x and
// y, so a room edge can snap onto any of the outline's real walls, not just its bbox.
function outlineSnapLines(outline) {
  const xs = [], ys = [];
  for (const p of outline?.points || []) { xs.push(p.x); ys.push(p.y); }
  return { xs, ys };
}

// Nearest snap line to value v within WALL_SNAP_DIST, or null.
function nearestSnapLine(v, lines) {
  let best = null, bd = WALL_SNAP_DIST;
  for (const ln of lines) { const d = Math.abs(ln - v); if (d < bd) { bd = d; best = ln; } }
  return best;
}

// First top-left position (grid-aligned) where a w×h box fits without overlapping
// any existing bbox, scanning left-to-right then top-to-bottom. Used by dimension
// entry to auto-arrange typed rooms. Falls back to the origin if the canvas is full.
function findFreeSpot(w, h, bboxes, gap = FP_GRID) {
  const step = FP_GRID * 2;
  for (let y = gap; y + h <= FP_H; y += step) {
    for (let x = gap; x + w <= FP_W; x += step) {
      const hit = bboxes.some(b => !(x + w + gap <= b.l || x >= b.r + gap || y + h + gap <= b.t || y >= b.b + gap));
      if (!hit) return { x: fpSnap(x), y: fpSnap(y) };
    }
  }
  return { x: gap, y: gap };
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

const DRAW_COLORS = ["#c9a96e", "#7ab5d9", "#7fb087", "#e07b6a", "#9b8ec4", "#a8a29c"];

function ColorPickerDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);
  return (
    <div ref={ref} style={{ flexShrink: 0, position: "relative" }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ background: value, border: `2px solid ${value}`, borderRadius: "50%", cursor: "pointer", height: 14, outline: `1px solid ${value}`, outlineOffset: 1, width: 14 }} />
      {open && (
        <div style={{ background: "var(--fm-bg-panel)", border: "1px solid var(--fm-hairline2)", borderRadius: 4, bottom: "calc(100% + 4px)", display: "flex", gap: 5, left: 0, padding: "5px 6px", position: "absolute", zIndex: 200 }}>
          {DRAW_COLORS.map(c => (
            <div key={c} onClick={() => { onChange(c); setOpen(false); }}
              style={{ background: c, border: value === c ? `2px solid ${c}` : "2px solid transparent", borderRadius: "50%", cursor: "pointer", height: 14, outline: `1px solid ${c}`, outlineOffset: 1, width: 14 }} />
          ))}
        </div>
      )}
    </div>
  );
}

function XButton({ x, y, onDelete, onHoverEnter, onHoverLeave }) {
  return (
    <g
      transform={`translate(${x},${y})`}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      onClick={e => { e.stopPropagation(); onDelete(); }}
      style={{ cursor: "pointer" }}
    >
      <circle r={9} fill="var(--fm-red)" opacity={0.85} />
      <text textAnchor="middle" dominantBaseline="central" fill="white" fontSize={13} fontWeight="bold"
        style={{ pointerEvents: "none", userSelect: "none" }}>×</text>
    </g>
  );
}

function LockButton({ x, y, locked, onToggle }) {
  return (
    <g
      transform={`translate(${x},${y})`}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); onToggle(); }}
      style={{ cursor: "pointer" }}
    >
      <circle r={9} fill={locked ? "var(--fm-brass)" : "#374151"} opacity={0.85} />
      {/* Shackle: closed when locked, open (swung up-right) when unlocked */}
      <path
        d={locked
          ? "M -2.8,-0.5 L -2.8,-3.5 A2.8,2.8 0 0 1 2.8,-3.5 L 2.8,-0.5"
          : "M -2.8,-0.5 L -2.8,-3.5 A2.8,2.8 0 0 1 2.8,-3.5 L 2.8,-6"}
        stroke="white" strokeWidth={1.5} fill="none" strokeLinecap="round"
        style={{ pointerEvents: "none" }}
      />
      {/* Lock body */}
      <rect x={-4} y={-0.5} width={8} height={6} rx={1} fill="white"
        style={{ pointerEvents: "none" }} />
    </g>
  );
}

const FP_LAYER_KEY = "foreman-fp-layers";
// `outline` toggles the plan-wide building outline scaffold; default visible.
const DEFAULT_LAYERS = { zones: true, pins: true, drawings: true, todos: true, outline: true };
const LAYER_PRESETS = {
  all:         { zones: true,  pins: true,  drawings: true,  todos: true,  outline: true },
  rooms:       { zones: true,  pins: false, drawings: false, todos: false, outline: true },
  inventory:   { zones: true,  pins: true,  drawings: false, todos: false, outline: true },
  maintenance: { zones: true,  pins: false, drawings: false, todos: true,  outline: true },
};
const PRESET_LABELS  = { all: "All", rooms: "Rooms", inventory: "Inventory", maintenance: "Maintenance" };
const LAYER_TOGGLES  = [
  { key: "zones",    label: "Zones"    },
  { key: "pins",     label: "Pins"     },
  { key: "drawings", label: "Drawings" },
  { key: "todos",    label: "To-dos"   },
];
// Building outline scaffold styling — neutral white border, no fill.
const FP_OUTLINE_STROKE = "rgba(255,255,255,0.8)";

export function FloorPlan({ categories, categoryTypes, categoryItems, entityTypeData, onCreateCategory, onRenameCategory, onDeleteCategory, onChangeCategoryType, onAddItem, onCreateLinkedItem, onDeleteLinkedItem, onRenameLinkedItem, reverseItemKeyMap, onSelectItem }) {
  const [fpData, setFpData] = useState(() => loadFpData());
  const [floors, setFloors] = useState(() => getFloorsInOrder());
  const rooms = useForemanStore(s => s.rooms);
  const customFieldValues = useForemanStore(s => s.spatialAssignments);
  const storeProjects = useForemanStore(s => s.projects);
  const [activeLevel, setActiveLevel] = useState(() => getFloorsInOrder()[0]?.id || "lvl-1");
  const [selected, setSelected] = useState(null);
  const [confirmRoomId, setConfirmRoomId] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [editingLevelId, setEditingLevelId] = useState(null);
  const [kindMenuLevelId, setKindMenuLevelId] = useState(null);
  const [editingPanelName, setEditingPanelName] = useState(false);
  const [editingPanelType, setEditingPanelType] = useState(false);
  const [selectedPin, setSelectedPin] = useState(null);
  const [ghostPin, setGhostPin] = useState(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: FP_W, h: FP_H });
  const [isPanning, setIsPanning] = useState(false);
  const [svgPxW, setSvgPxW] = useState(0); // rendered SVG width in px, for zoom-invariant label sizing
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
  const [drawMode, setDrawMode] = useState("move");
  const [inProgress, setInProgress] = useState(null);
  const [cursorPt, setCursorPt] = useState(null);
  const [pendingMarker, setPendingMarker] = useState(null);
  const [markerLabel, setMarkerLabel] = useState("");
  const [drawColor, setDrawColor] = useState("#c9a96e");
  const [drawName, setDrawName] = useState("");
  const drawModeRef = useRef("move");
  const [selectedZones, setSelectedZones] = useState(() => new Set());
  const [selectBox, setSelectBox] = useState(null);
  const selectBoxRef = useRef(null);
  const inProgressRef = useRef(null);
  const drawColorRef = useRef("#c9a96e");
  const drawNameRef = useRef("");
  const [selectedTodoMarkerId, setSelectedTodoMarkerId] = useState(null);
  const todoMarkerDragRef = useRef(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState(null);
  const drawingDragRef = useRef(null);
  const drawingVertexDragRef = useRef(null);
  const [showTodoCreate, setShowTodoCreate] = useState(false);
  const [pendingTodoLocation, setPendingTodoLocation] = useState(null);
  const [drawCategory, setDrawCategory] = useState(null);
  const [markerIsTodo, setMarkerIsTodo] = useState(false);
  const [editingDrawingNameId, setEditingDrawingNameId] = useState(null);
  const drawCategoryRef = useRef(null);
  const markerIsTodoRef = useRef(false);
  const [hoveredEntity, setHoveredEntity] = useState(null);
  const hoverLeaveTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(hoverLeaveTimerRef.current), []);
  const [ghostZone, setGhostZone] = useState(null);
  const ghostZoneRef = useRef(null);
  const [snapGuides, setSnapGuides] = useState(null); // { x, y } edge lines shown while snapping
  // Dimension-entry ("no-draw") mode: type a name + size and the room is auto-placed.
  const [dimEntryOpen, setDimEntryOpen] = useState(false);
  const [dimName, setDimName] = useState("");
  const [dimShape, setDimShape] = useState("rect");
  const [dimDims, setDimDims] = useState({ ...ROOM_SHAPE_DEFAULTS.rect });
  // Address → building footprint (opt-in online import).
  const [addrModalOpen, setAddrModalOpen] = useState(false);
  const [addrInput, setAddrInput] = useState("");
  const [addrBusy, setAddrBusy] = useState(false);
  const [addrError, setAddrError] = useState(null);
  const outlineDragRef = useRef(null);
  const outlineVertexDragRef = useRef(null);
  const [outlineMenuOpen, setOutlineMenuOpen] = useState(false);
  const [selectedOutline, setSelectedOutline] = useState(false);
  const [layers, setLayers] = useState(() => {
    try { return { ...DEFAULT_LAYERS, ...(storageGet(FP_LAYER_KEY) || {}) }; }
    catch { return DEFAULT_LAYERS; }
  });
  const layersRef = useRef(layers); // fresh layer visibility for the []-deps drag handlers

  useEffect(() => { layersRef.current = layers; }, [layers]);
  // Selecting any other entity deselects the building outline (mutual exclusivity).
  useEffect(() => {
    if (selected || selectedPin || selectedDrawingId || selectedTodoMarkerId) setSelectedOutline(false);
  }, [selected, selectedPin, selectedDrawingId, selectedTodoMarkerId]);
  useEffect(() => { fpDataRef.current = fpData; }, [fpData]);
  useEffect(() => { activeLevelRef.current = activeLevel; }, [activeLevel]);
  useEffect(() => { viewBoxRef.current = viewBox; }, [viewBox]);
  useEffect(() => { drawModeRef.current = drawMode; }, [drawMode]);
  useEffect(() => { inProgressRef.current = inProgress; }, [inProgress]);
  useEffect(() => { drawColorRef.current = drawColor; }, [drawColor]);
  useEffect(() => { drawNameRef.current = drawName; }, [drawName]);
  useEffect(() => { drawCategoryRef.current = drawCategory; }, [drawCategory]);
  useEffect(() => { markerIsTodoRef.current = markerIsTodo; }, [markerIsTodo]);
  useEffect(() => { ghostZoneRef.current = ghostZone; }, [ghostZone]);

  // Address import is the only network-dependent floor-plan feature; hide it
  // entirely unless Online Mode is on (re-read on mount, which is when the page
  // is entered after toggling the setting in Preferences).
  const onlineMode = storageGet("foreman-online-mode") === true;

  // Canvas units per on-screen pixel at the current zoom. Sizing label fonts in these
  // units keeps their on-screen size constant (and readable) at any zoom depth.
  const fpUnitsPerPx = svgPxW > 0 ? viewBox.w / svgPxW : viewBox.w / 1000;
  const fpFont = px => Math.round(px * fpUnitsPerPx * 10) / 10;

  const currentPlaced = fpData.placements[activeLevel] || {};
  // Build roomId ↔ label maps for the active floor
  const activeFloorRooms = useMemo(() => Object.values(rooms).filter(r => r.floorId === activeLevel), [rooms, activeLevel]);
  const catToRoomId = useMemo(() => Object.fromEntries(activeFloorRooms.map(r => [r.label, r.id])), [activeFloorRooms]);

  function save(newData) {
    fpDataRef.current = newData;
    setFpData(newData);
    saveFpData(newData);
  }

  function onEntityHoverEnter(type, id) {
    if (drawModeRef.current !== "move") return;
    clearTimeout(hoverLeaveTimerRef.current);
    setHoveredEntity({ type, id });
  }
  function onEntityHoverLeave() {
    hoverLeaveTimerRef.current = setTimeout(() => setHoveredEntity(null), 80);
  }
  function drawingXAnchor(drw) {
    if (drw.type === "marker") return { x: drw.x + 16, y: drw.y - 10 };
    if (!drw.points?.length) return { x: 0, y: 0 };
    const mid = drw.points[Math.floor(drw.points.length / 2)];
    return { x: mid.x, y: mid.y - 14 };
  }

  function commitDrawing(drawing) {
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    const id = `drw-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const typeLabel = drawing.type === "marker" ? "Marker" : drawing.type === "line" ? "Line" : "Path";
    const existing = (d.drawings?.[lvl] || []).filter(dr => dr.type === drawing.type);
    const markerLabel = drawing.type === "marker" && drawing.label && drawing.label !== "PT" ? drawing.label : null;
    const name = drawNameRef.current.trim() || markerLabel || `${typeLabel} ${existing.length + 1}`;
    const newDrawing = { id, name, color: drawColorRef.current, visible: true, ...drawing };
    if (drawCategoryRef.current && drawing.type !== "marker") {
      newDrawing.category = drawCategoryRef.current;
      newDrawing.inventoryItemKey = `${drawCategoryRef.current}|${name}`;
      onCreateLinkedItem?.(drawCategoryRef.current, name);
    }
    save({ ...d, drawings: { ...(d.drawings || {}), [lvl]: [...(d.drawings?.[lvl] || []), newDrawing] } });
    setDrawName("");
    setDrawCategory(null);
    drawCategoryRef.current = null;
  }

  function renameDrawing(drawId, newName) {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    const drawing = (d.drawings?.[lvl] || []).find(dr => dr.id === drawId);
    const oldKey = drawing?.inventoryItemKey;
    let inventoryItemKey = oldKey;
    if (oldKey) {
      const sep = oldKey.indexOf("|");
      const cat = oldKey.slice(0, sep);
      const oldItem = oldKey.slice(sep + 1);
      inventoryItemKey = `${cat}|${trimmed}`;
      onRenameLinkedItem?.(cat, oldItem, trimmed);
    }
    save({ ...d, drawings: { ...(d.drawings || {}), [lvl]: (d.drawings?.[lvl] || []).map(dr =>
      dr.id === drawId ? { ...dr, name: trimmed, ...(oldKey ? { inventoryItemKey } : {}) } : dr
    ) } });
  }

  function updateDrawingColor(drawId, color) {
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    save({ ...d, drawings: { ...(d.drawings || {}), [lvl]: (d.drawings?.[lvl] || []).map(dr => dr.id === drawId ? { ...dr, color } : dr) } });
  }

  function updateDrawingCategory(drawId, category) {
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    const drawing = (d.drawings?.[lvl] || []).find(dr => dr.id === drawId);
    const oldKey = drawing?.inventoryItemKey;
    const itemName = drawing?.name;
    let newKey = undefined;

    if (oldKey) {
      const sep = oldKey.indexOf("|");
      const oldCat = oldKey.slice(0, sep);
      const oldItem = oldKey.slice(sep + 1);
      if (!category) {
        onDeleteLinkedItem?.(oldCat, oldItem);
      } else if (oldCat !== category) {
        onDeleteLinkedItem?.(oldCat, oldItem);
        onCreateLinkedItem?.(category, itemName);
        newKey = `${category}|${itemName}`;
      } else {
        newKey = oldKey;
      }
    } else if (category && itemName) {
      onCreateLinkedItem?.(category, itemName);
      newKey = `${category}|${itemName}`;
    }

    save({ ...d, drawings: { ...(d.drawings || {}), [lvl]: (d.drawings?.[lvl] || []).map(dr =>
      dr.id === drawId ? { ...dr, category: category || undefined, inventoryItemKey: newKey } : dr
    ) } });
  }

  function deleteDrawing(drawId) {
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    const drawing = (d.drawings?.[lvl] || []).find(dr => dr.id === drawId);
    if (drawing?.inventoryItemKey) {
      const sep = drawing.inventoryItemKey.indexOf("|");
      onDeleteLinkedItem?.(drawing.inventoryItemKey.slice(0, sep), drawing.inventoryItemKey.slice(sep + 1));
    }
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
    if (mode === "marker") {
      if (markerIsTodoRef.current) {
        const zoneId = detectZoneAtPoint(x, y);
        const zoneRoom = zoneId ? rooms[zoneId] : null;
        const catName = zoneRoom?.categoryName || zoneRoom?.label || null;
        const catTypeId = catName ? resolveTypeId(catName, categoryTypes[catName] || "system") : null;
        const isExt = catTypeId ? isExteriorTypeUtil(catTypeId, entityTypeData) : false;
        setPendingTodoLocation({ levelId: activeLevel, zone: zoneId || null, x, y, preLinkedRoom: catName && !isExt ? catName : null, preLinkedExterior: catName && isExt ? catName : null });
        setShowTodoCreate(true);
        setDrawMode("move");
        setMarkerIsTodo(false);
        markerIsTodoRef.current = false;
      } else {
        setPendingMarker({ x, y });
        setMarkerLabel("");
      }
      return;
    }
    if (mode === "path") { setInProgress(p => p ? { ...p, points: [...p.points, { x, y }] } : { type: "path", points: [{ x, y }] }); return; }
    if (mode === "line") {
      const ip = inProgressRef.current;
      if (!ip) { setInProgress({ type: "line", points: [{ x, y }] }); }
      else { commitDrawing({ ...ip, points: [...ip.points, { x, y }] }); setInProgress(null); setDrawMode("move"); }
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
    setDrawMode("move");
    setDrawName("");
  }

  function commitMarkerLabel() {
    if (!pendingMarker) return;
    commitDrawing({ type: "marker", x: pendingMarker.x, y: pendingMarker.y, label: markerLabel.trim() || "PT" });
    setPendingMarker(null);
    setMarkerLabel("");
    setDrawMode("move");
  }

  function detectZoneAtPoint(x, y) {
    const placements = fpDataRef.current.placements?.[activeLevelRef.current] || {};
    for (const [roomId, zone] of Object.entries(placements)) {
      if (zone.points && pointInPolygon({ x, y }, zone.points)) return roomId;
    }
    return null;
  }

  function ptSegDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function cancelDraw() {
    setDrawMode("move");
    setInProgress(null);
    setCursorPt(null);
    setPendingMarker(null);
    setMarkerLabel("");
    setDrawCategory(null);
    setMarkerIsTodo(false);
    drawCategoryRef.current = null;
    markerIsTodoRef.current = false;
    setSelectedDrawingId(null);
  }

  function setLayer(key, val) {
    setLayers(prev => {
      const next = { ...prev, [key]: val };
      storageSet(FP_LAYER_KEY, next);
      return next;
    });
    if (key === "drawings" && !val) cancelDraw();
  }

  function applyPreset(presetKey) {
    const next = { ...LAYER_PRESETS[presetKey] };
    setLayers(next);
    storageSet(FP_LAYER_KEY, next);
    if (!next.drawings) cancelDraw();
  }

  function addPin(cat, item, zone, x, y) {
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    const id = `pin-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const levelPins = [...(d.pins?.[lvl] || []), { id, zone, cat, item, x, y }];
    save({ ...d, pins: { ...(d.pins || {}), [lvl]: levelPins } });
    const zoneRoom = rooms[zone];
    if (zoneRoom?.label) {
      const catName = zoneRoom.categoryName || zoneRoom.label;
      const isExt = isExteriorTypeUtil(resolveTypeId(catName, categoryTypes?.[catName] || "system"), entityTypeData);
      const stableKey = itemToKeyMap[`${cat}|${item}`] || `${cat}|${item}`;
      useForemanStore.getState().assignItemToZone(stableKey, zoneRoom.label, isExt);
    }
  }

  function deletePin(pinId) {
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    const pin = (d.pins?.[lvl] || []).find(p => p.id === pinId);
    if (pin) {
      const zoneRoom = rooms[pin.zone];
      if (zoneRoom?.label) {
        const catName = zoneRoom.categoryName || zoneRoom.label;
        const isExt = isExteriorTypeUtil(resolveTypeId(catName, categoryTypes?.[catName] || "system"), entityTypeData);
        const stableKey = itemToKeyMap[`${pin.cat}|${pin.item}`] || `${pin.cat}|${pin.item}`;
        useForemanStore.getState().removeItemFromZone(stableKey, isExt);
      }
    }
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
    const todos = storageGet("foreman-todos") ?? [];
    const updated = todos.map(t => t.id === dr.todoId
      ? { ...t, floorPlanLocation: { ...t.floorPlanLocation, x, y, ...(newZone ? { zone: newZone } : {}) } }
      : t
    );
    storageSet("foreman-todos", updated);
  }

  function removeTodoMarker(drawId) {
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    const marker = (d.drawings?.[lvl] || []).find(drw => drw.id === drawId);
    if (!marker?.todoId) return;
    save({ ...d, drawings: { ...(d.drawings || {}), [lvl]: (d.drawings?.[lvl] || []).filter(drw => drw.id !== drawId) } });
    const todos = storageGet("foreman-todos") ?? [];
    storageSet("foreman-todos", todos.map(t => t.id === marker.todoId ? { ...t, floorPlanLocation: null } : t));
    setSelectedTodoMarkerId(null);
  }

  function renameRoom(roomId, newLabel) {
    useForemanStore.getState().renameRoom(roomId, newLabel);
    setEditingPanelName(false);
  }

  function handleDeleteRoom(roomId) {
    setConfirmRoomId(roomId);
  }

  function performDeleteRoom() {
    const roomId = confirmRoomId;
    if (!roomId) return;
    useForemanStore.getState().deleteRoom(roomId);
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    const { [roomId]: _, ...restPlacements } = d.placements[lvl] || {};
    const nextPins = {};
    for (const lid of Object.keys(d.pins || {})) {
      nextPins[lid] = (d.pins[lid] || []).filter(p => p.zone !== roomId);
    }
    save({ ...d, placements: { ...d.placements, [lvl]: restPlacements }, pins: nextPins });
    setSelected(null);
    setConfirmRoomId(null);
  }

  function addToCanvas(cat) {
    const gz = { cat, shape: "rect", dims: { ...ROOM_SHAPE_DEFAULTS.rect } };
    setGhostZone(gz);
    ghostZoneRef.current = gz;
  }

  // Update the in-flight ghost zone, keeping state and ref in sync.
  function updateGhost(patch) {
    setGhostZone(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      ghostZoneRef.current = next;
      return next;
    });
  }
  function setGhostShape(shape) { updateGhost({ shape, dims: { ...ROOM_SHAPE_DEFAULTS[shape] } }); }
  function setGhostDim(key, raw) {
    const n = Math.max(1, Math.min(200, Math.round(Number(raw) || 0)));
    const gz = ghostZoneRef.current;
    if (gz) updateGhost({ dims: { ...gz.dims, [key]: n } });
  }
  // Bounding size (units) of a ghost zone, used to center it under the cursor.
  function ghostBoundsUnits(gz) {
    const u = roomDimsToUnits(gz.shape, gz.dims);
    return { w: u.w, h: u.h, units: u };
  }

  function placeZoneOnCanvas(cat, polygon, shape = "rect") {
    const floorId = activeLevelRef.current;
    const existing = fpDataRef.current.placements[floorId] || {};
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
    const d = fpDataRef.current;
    save({
      ...d,
      placements: { ...d.placements, [floorId]: { ...existing, [roomId]: { ...polygon, shape } } },
    });
    useForemanStore.getState().reloadAll();
    setSelected(roomId); setEditingPanelName(false);
  }

  function removeFromCanvas(roomId) {
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    const { [roomId]: _, ...rest } = d.placements[lvl] || {};
    save({ ...d, placements: { ...d.placements, [lvl]: rest } });
    if (selected === roomId) setSelected(null);
  }

  function setDimEntryShape(shape) { setDimShape(shape); setDimDims({ ...ROOM_SHAPE_DEFAULTS[shape] }); }
  function setDimEntryDim(key, raw) {
    const n = Math.max(1, Math.min(200, Math.round(Number(raw) || 0)));
    setDimDims(prev => ({ ...prev, [key]: n }));
  }

  // No-draw placement: register the typed name as a spatial category (if new) and
  // drop its room into the first free spot on the floor — no click-to-place needed.
  function addRoomByDimensions() {
    const name = dimName.trim();
    if (!name) return;
    const floorId = activeLevelRef.current;
    const units = roomDimsToUnits(dimShape, dimDims);
    const others = Object.values(fpDataRef.current.placements[floorId] || {}).map(p => bboxEdges(p.points));
    const spot = findFreeSpot(units.w, units.h, others);
    const polygon = shapeToPolygon(dimShape, spot, units);
    const allRooms = loadRooms();
    const known = categories.includes(name) || Object.values(allRooms).some(r => r.label === name || r.categoryName === name);
    if (!known) onCreateCategory?.(name, "room");
    placeZoneOnCanvas(name, polygon, dimShape);
    setDimName("");
  }

  function openAddressImport() {
    let prefill = "";
    try { prefill = addressToQuery(storageGet("foreman-household-address")); } catch {}
    setAddrInput(prefill);
    setAddrError(null);
    setAddrModalOpen(true);
  }

  // Store the imported building outline as the plan-wide scaffold (a singleton, not
  // a room or category). It renders on every floor as a neutral white border and is
  // never counted toward inventory or finished area. Re-importing replaces it.
  function placeBuildingFootprint(points) {
    const d = fpDataRef.current;
    save({ ...d, outline: { points, hiddenFloors: [] } });
    setLayers(prev => {
      if (prev.outline) return prev;
      const next = { ...prev, outline: true };
      storageSet(FP_LAYER_KEY, next);
      return next;
    });
  }

  // Begin dragging the whole outline (move mode only) — also selects it, so a plain
  // click selects and a drag moves. Translation is grid-snapped in the shared
  // mousemove handler; a click that doesn't move just leaves it selected.
  function startOutlineDrag(e) {
    if (drawModeRef.current !== "move") return;
    e.stopPropagation();
    setSelected(null);
    setSelectedPin(null);
    setSelectedDrawingId(null);
    setSelectedTodoMarkerId(null);
    setSelectedOutline(true);
    const r = svgRef.current.getBoundingClientRect();
    const vb = viewBoxRef.current;
    outlineDragRef.current = {
      startSVGX: vb.x + (e.clientX - r.left) / r.width * vb.w,
      startSVGY: vb.y + (e.clientY - r.top) / r.height * vb.h,
      startPoints: fpDataRef.current.outline.points,
      wasSelected: selectedOutline, // prior selection — a click on an already-selected border inserts a vertex
    };
  }

  // Outline vertex editing — exactly like room/exterior zones: drag a corner to move
  // it, click a corner to remove it (when more than 3 remain), click an edge to insert.
  function handleOutlineVertexMouseDown(e, vi) {
    e.preventDefault();
    e.stopPropagation();
    setSelectedOutline(true);
    outlineVertexDragRef.current = { vi, startX: e.clientX, startY: e.clientY };
  }

  function handleOutlineEdgeClick(e, edgeStartIdx) {
    e.preventDefault();
    e.stopPropagation();
    const d = fpDataRef.current;
    if (!d.outline?.points) return;
    const svgRect = svgRef.current.getBoundingClientRect();
    const vb = viewBoxRef.current;
    const newPt = {
      x: fpSnap(Math.max(0, Math.min(FP_W, vb.x + (e.clientX - svgRect.left) / svgRect.width * vb.w))),
      y: fpSnap(Math.max(0, Math.min(FP_H, vb.y + (e.clientY - svgRect.top) / svgRect.height * vb.h))),
    };
    const newPoints = [...d.outline.points];
    newPoints.splice(edgeStartIdx + 1, 0, newPt);
    save({ ...d, outline: { ...d.outline, points: newPoints } });
  }

  function toggleOutlineFloor(floorId) {
    const d = fpDataRef.current;
    if (!d.outline) return;
    const hidden = new Set(d.outline.hiddenFloors || []);
    hidden.has(floorId) ? hidden.delete(floorId) : hidden.add(floorId);
    save({ ...d, outline: { ...d.outline, hiddenFloors: [...hidden] } });
  }

  function deleteOutline() {
    save({ ...fpDataRef.current, outline: null });
    setOutlineMenuOpen(false);
    setSelectedOutline(false);
  }

  // Scale the whole outline proportionally from its top-left to a target width or
  // height (feet) — calibration for when the imported footprint's scale is slightly
  // off. Grid-snapped and clamped to the canvas; shape and position anchor preserved.
  // Zones scaffolded onto the outline (centroid inside its footprint, any floor) and
  // their item pins reflow by the same transform so they stay aligned to the walls;
  // locked zones and anything outside the footprint are left untouched.
  function resizeOutline(dim, raw) {
    const d = fpDataRef.current;
    if (!d.outline?.points) return;
    const n = Math.max(1, Math.min(500, Math.round(Number(raw) || 0)));
    const pts = d.outline.points;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const oldW = maxX - minX, oldH = maxY - minY;
    const newW = dim === "w" ? Math.min(n * FP_GRID, FP_W - minX) : oldW;
    const newH = dim === "h" ? Math.min(n * FP_GRID, FP_H - minY) : oldH;
    const sx = oldW > 0 ? newW / oldW : 1, sy = oldH > 0 ? newH / oldH : 1;
    if (sx === 1 && sy === 1) return;
    const scalePt = p => ({ x: fpSnap(minX + (p.x - minX) * sx), y: fpSnap(minY + (p.y - minY) * sy) });
    const within = (cx, cy) => cx >= minX && cx <= maxX && cy >= minY && cy <= maxY;

    const newPlacements = {};
    for (const [floorId, zones] of Object.entries(d.placements || {})) {
      newPlacements[floorId] = {};
      for (const [rid, zone] of Object.entries(zones)) {
        const c = zone?.points ? polygonCentroid(zone.points) : null;
        newPlacements[floorId][rid] = (c && !zone.locked && within(c.cx, c.cy))
          ? { ...zone, points: zone.points.map(scalePt) }
          : zone;
      }
    }
    const newPins = {};
    for (const [floorId, arr] of Object.entries(d.pins || {})) {
      newPins[floorId] = (arr || []).map(pin =>
        within(pin.x, pin.y) ? { ...pin, x: Math.round(minX + (pin.x - minX) * sx), y: Math.round(minY + (pin.y - minY) * sy) } : pin
      );
    }
    save({ ...d, outline: { ...d.outline, points: pts.map(scalePt) }, placements: newPlacements, pins: newPins });
  }

  async function runAddressImport() {
    if (addrBusy) return;
    setAddrBusy(true);
    setAddrError(null);
    try {
      const vb = viewBoxRef.current;
      const { points } = await fetchBuildingFootprint(addrInput, {
        unitsPerFoot: FP_GRID,
        centerX: vb.x + vb.w / 2,
        centerY: vb.y + vb.h / 2,
      });
      placeBuildingFootprint(points);
      setAddrModalOpen(false);
    } catch (e) {
      setAddrError(e?.message || "Something went wrong.");
    } finally {
      setAddrBusy(false);
    }
  }

  function toggleZoneLock(roomId) {
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    const zone = (d.placements[lvl] || {})[roomId];
    if (!zone) return;
    save({ ...d, placements: { ...d.placements, [lvl]: { ...(d.placements[lvl] || {}), [roomId]: { ...zone, locked: !zone.locked } } } });
  }

  // Resize a placed zone by editing its bounding box (feet). Scales the polygon from
  // its top-left corner so the shape is preserved; complex shapes (L/U/footprint)
  // scale proportionally. Grid-snapped and clamped to the canvas.
  function resizeSelectedZone(dim, raw) {
    if (!selected) return;
    const n = Math.max(1, Math.min(500, Math.round(Number(raw) || 0)));
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    const zone = (d.placements[lvl] || {})[selected];
    if (!zone?.points || zone.locked) return;
    const xs = zone.points.map(p => p.x), ys = zone.points.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const oldW = maxX - minX, oldH = maxY - minY;
    const newW = dim === "w" ? Math.min(n * FP_GRID, FP_W - minX) : oldW;
    const newH = dim === "h" ? Math.min(n * FP_GRID, FP_H - minY) : oldH;
    const sx = oldW > 0 ? newW / oldW : 1, sy = oldH > 0 ? newH / oldH : 1;
    const newPoints = zone.points.map(p => ({ x: fpSnap(minX + (p.x - minX) * sx), y: fpSnap(minY + (p.y - minY) * sy) }));
    save({ ...d, placements: { ...d.placements, [lvl]: { ...(d.placements[lvl] || {}), [selected]: { ...zone, points: newPoints } } } });
  }

  // Change a placed zone's shape (rect/L/U) in place, keeping its bounding box so
  // position and overall size are preserved. Notch/gap for L and U are sized as a
  // proportion of the box. The chosen shape is stored so the selector reflects it.
  function reshapeSelectedZone(shape) {
    if (!selected) return;
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    const zone = (d.placements[lvl] || {})[selected];
    if (!zone?.points || zone.locked) return;
    const xs = zone.points.map(p => p.x), ys = zone.points.map(p => p.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const w = Math.max(...xs) - minX, h = Math.max(...ys) - minY;
    let dims;
    if (shape === "L") dims = { w, h, notchW: Math.min(fpSnap(w * 0.45), w - FP_GRID), notchH: Math.min(fpSnap(h * 0.45), h - FP_GRID) };
    else if (shape === "U") dims = { w, h, gapW: Math.min(fpSnap(w * 0.4), w - 2 * FP_GRID), gapDepth: Math.min(fpSnap(h * 0.55), h - FP_GRID) };
    else dims = { w, h };
    const poly = shapeToPolygon(shape, { x: minX, y: minY }, dims);
    save({ ...d, placements: { ...d.placements, [lvl]: { ...(d.placements[lvl] || {}), [selected]: { ...zone, points: poly.points, shape } } } });
  }

  // Reassign the selected zone to a different floor, keeping its exact geometry. The
  // placement moves between floor buckets, the room entity's floorId updates, and any
  // item pins inside the zone travel with it. The view follows to the new floor.
  function moveZoneToFloor(newFloorId) {
    if (!selected) return;
    const d = fpDataRef.current;
    const oldFloor = activeLevelRef.current;
    if (!newFloorId || newFloorId === oldFloor) return;
    const zone = (d.placements[oldFloor] || {})[selected];
    if (!zone) return;
    const { [selected]: _moved, ...oldRest } = d.placements[oldFloor] || {};
    const movingPins = (d.pins?.[oldFloor] || []).filter(p => p.zone === selected);
    const keptPins = (d.pins?.[oldFloor] || []).filter(p => p.zone !== selected);
    const next = {
      ...d,
      placements: {
        ...d.placements,
        [oldFloor]: oldRest,
        [newFloorId]: { ...(d.placements[newFloorId] || {}), [selected]: zone },
      },
      pins: {
        ...(d.pins || {}),
        [oldFloor]: keptPins,
        ...(movingPins.length ? { [newFloorId]: [...(d.pins?.[newFloorId] || []), ...movingPins] } : {}),
      },
    };
    save(next);
    updateRoom(selected, { floorId: newFloorId });
    useForemanStore.getState().reloadAll();
    setActiveLevel(newFloorId); // follow the zone to its new floor (stays selected)
  }

  function lockSelectedZones(lock) {
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    const lvlPlacements = { ...(d.placements[lvl] || {}) };
    for (const rid of selectedZones) {
      if (lvlPlacements[rid]) lvlPlacements[rid] = { ...lvlPlacements[rid], locked: lock };
    }
    save({ ...d, placements: { ...d.placements, [lvl]: lvlPlacements } });
  }

  function removeSelectedFromCanvas() {
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    const lvlPlacements = Object.fromEntries(
      Object.entries(d.placements[lvl] || {}).filter(([rid]) => !selectedZones.has(rid))
    );
    save({ ...d, placements: { ...d.placements, [lvl]: lvlPlacements } });
    if (selected && selectedZones.has(selected)) setSelected(null);
    setSelectedZones(new Set());
  }

  // All zone ids sharing a zone's group on a floor (just the zone itself if ungrouped).
  function groupMemberIds(lvlPlacements, roomId) {
    const gid = lvlPlacements[roomId]?.groupId;
    if (!gid) return [roomId];
    return Object.keys(lvlPlacements).filter(rid => lvlPlacements[rid]?.groupId === gid);
  }

  // Link the selected zones into one group (shared groupId) so they move and resize
  // together. Whether any are already grouped, a single new id unifies them.
  function groupSelectedZones() {
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    const gid = `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const lvlP = { ...(d.placements[lvl] || {}) };
    for (const rid of selectedZones) if (lvlP[rid]) lvlP[rid] = { ...lvlP[rid], groupId: gid };
    save({ ...d, placements: { ...d.placements, [lvl]: lvlP } });
  }

  function ungroupSelectedZones() {
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    const lvlP = { ...(d.placements[lvl] || {}) };
    for (const rid of selectedZones) {
      if (lvlP[rid]?.groupId) { const { groupId, ...rest } = lvlP[rid]; lvlP[rid] = rest; }
    }
    save({ ...d, placements: { ...d.placements, [lvl]: lvlP } });
  }

  // Scale every selected zone proportionally from the selection's combined top-left,
  // so a group's relative layout is preserved. Grid-snapped; skips locked zones.
  function resizeSelectedZones(dim, raw) {
    const ids = [...selectedZones];
    if (!ids.length) return;
    const n = Math.max(1, Math.min(500, Math.round(Number(raw) || 0)));
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    const lvlP = d.placements[lvl] || {};
    const allPts = ids.flatMap(rid => lvlP[rid]?.points || []);
    if (!allPts.length) return;
    const xs = allPts.map(p => p.x), ys = allPts.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const oldW = maxX - minX, oldH = maxY - minY;
    const newW = dim === "w" ? Math.min(n * FP_GRID, FP_W - minX) : oldW;
    const newH = dim === "h" ? Math.min(n * FP_GRID, FP_H - minY) : oldH;
    const sx = oldW > 0 ? newW / oldW : 1, sy = oldH > 0 ? newH / oldH : 1;
    const newLvl = { ...lvlP };
    for (const rid of ids) {
      const z = lvlP[rid];
      if (z?.points && !z.locked) newLvl[rid] = { ...z, points: z.points.map(p => ({ x: fpSnap(minX + (p.x - minX) * sx), y: fpSnap(minY + (p.y - minY) * sy) })) };
    }
    save({ ...d, placements: { ...d.placements, [lvl]: newLvl } });
  }

  function handleRoomMouseDown(e, roomId) {
    e.preventDefault();
    e.stopPropagation();
    const lvlPlacements = fpDataRef.current.placements[activeLevelRef.current] || {};
    const memberIds = groupMemberIds(lvlPlacements, roomId);
    if (drawModeRef.current === "select") {
      // Toggle the whole group together when the clicked zone is grouped.
      setSelectedZones(prev => {
        const next = new Set(prev);
        const has = next.has(roomId);
        for (const rid of memberIds) { if (has) next.delete(rid); else next.add(rid); }
        return next;
      });
      return;
    }
    setSelected(roomId); setSelectedOutline(false); setEditingPanelName(false);
    const zonePoly = lvlPlacements[roomId];
    if (zonePoly?.locked) return;
    const svgRect = svgRef.current.getBoundingClientRect();
    const vb = viewBoxRef.current;
    // Drag moves all group members together (just this zone when ungrouped).
    const members = memberIds
      .filter(rid => lvlPlacements[rid]?.points)
      .map(rid => ({ rid, startPoints: lvlPlacements[rid].points.map(p => ({ ...p })) }));
    draggingRef.current = {
      roomId,
      startSVGX: vb.x + (e.clientX - svgRect.left) / svgRect.width * vb.w,
      startSVGY: vb.y + (e.clientY - svgRect.top) / svgRect.height * vb.h,
      members,
    };
    setDragging(roomId);
  }

  function handleVertexMouseDown(e, roomId, vi) {
    e.preventDefault();
    e.stopPropagation();
    const zonePoly = (fpDataRef.current.placements[activeLevelRef.current] || {})[roomId];
    if (zonePoly?.locked) return;
    vertexDragRef.current = { roomId, vi, startX: e.clientX, startY: e.clientY };
  }

  function handleEdgeClick(e, roomId, edgeStartIdx) {
    e.preventDefault();
    e.stopPropagation();
    const d = fpDataRef.current;
    const lvl = activeLevelRef.current;
    const zonePoly = (d.placements[lvl] || {})[roomId];
    if (zonePoly?.locked) return;
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

      // Update draw cursor ghost (also used for ghost zone placement)
      if ((drawModeRef.current !== "move" && drawModeRef.current !== "select") || ghostZoneRef.current) {
        const rawX = vb.x + (e.clientX - svgRect.left) * scaleX;
        const rawY = vb.y + (e.clientY - svgRect.top) * scaleY;
        setCursorPt({ x: fpSnap(Math.max(0, Math.min(FP_W, rawX))), y: fpSnap(Math.max(0, Math.min(FP_H, rawY))) });
      }

      if (vertexDragRef.current) {
        const { roomId, vi } = vertexDragRef.current;
        const d = fpDataRef.current;
        const lvl = activeLevelRef.current;
        const zonePoly = (d.placements[lvl] || {})[roomId];
        const rawX = Math.max(0, Math.min(FP_W, vb.x + (e.clientX - svgRect.left) * scaleX));
        const rawY = Math.max(0, Math.min(FP_H, vb.y + (e.clientY - svgRect.top) * scaleY));
        // Snap the vertex onto a neighboring room's edge — or the building outline's
        // walls when it's shown — if one is near, else to grid.
        const others = Object.entries(d.placements[lvl] || {}).filter(([rid]) => rid !== roomId).map(([, p]) => p);
        const zl = zoneSnapLines(others);
        const ol = layersRef.current.outline ? outlineSnapLines(d.outline) : { xs: [], ys: [] };
        const xs = [...zl.xs, ...ol.xs], ys = [...zl.ys, ...ol.ys];
        const snapX = nearestSnapLine(rawX, xs), snapY = nearestSnapLine(rawY, ys);
        const nx = snapX !== null ? snapX : fpSnap(rawX);
        const ny = snapY !== null ? snapY : fpSnap(rawY);
        setSnapGuides(snapX !== null || snapY !== null ? { x: snapX, y: snapY } : null);
        const newPoints = zonePoly.points.map((p, i) => i === vi ? { x: nx, y: ny } : p);
        const next = { ...d, placements: { ...d.placements, [lvl]: { ...(d.placements[lvl] || {}), [roomId]: { points: newPoints } } } };
        fpDataRef.current = next;
        setFpData({ ...next });
        return;
      }

      // Outline vertex drag (grid-snapped).
      if (outlineVertexDragRef.current) {
        const { vi } = outlineVertexDragRef.current;
        const d = fpDataRef.current;
        if (!d.outline?.points) return;
        const nx = fpSnap(Math.max(0, Math.min(FP_W, vb.x + (e.clientX - svgRect.left) * scaleX)));
        const ny = fpSnap(Math.max(0, Math.min(FP_H, vb.y + (e.clientY - svgRect.top) * scaleY)));
        const newPoints = d.outline.points.map((p, i) => i === vi ? { x: nx, y: ny } : p);
        const next = { ...d, outline: { ...d.outline, points: newPoints } };
        fpDataRef.current = next;
        setFpData({ ...next });
        return;
      }

      // Outline whole-body drag (grid-snapped translation, clamped to canvas).
      if (outlineDragRef.current) {
        const { startSVGX, startSVGY, startPoints } = outlineDragRef.current;
        const dx = fpSnap((vb.x + (e.clientX - svgRect.left) * scaleX) - startSVGX);
        const dy = fpSnap((vb.y + (e.clientY - svgRect.top) * scaleY) - startSVGY);
        if (dx !== 0 || dy !== 0) outlineDragRef.current.moved = true;
        const minX = Math.min(...startPoints.map(p => p.x)), maxX = Math.max(...startPoints.map(p => p.x));
        const minY = Math.min(...startPoints.map(p => p.y)), maxY = Math.max(...startPoints.map(p => p.y));
        const cdx = Math.max(-minX, Math.min(FP_W - maxX, dx));
        const cdy = Math.max(-minY, Math.min(FP_H - maxY, dy));
        const d = fpDataRef.current;
        const next = { ...d, outline: { ...d.outline, points: startPoints.map(p => ({ x: p.x + cdx, y: p.y + cdy })) } };
        fpDataRef.current = next;
        setFpData(next);
        return;
      }

      if (draggingRef.current) {
        const { startSVGX, startSVGY, members } = draggingRef.current;
        const d = fpDataRef.current;
        const lvl = activeLevelRef.current;
        const svgX = vb.x + (e.clientX - svgRect.left) * scaleX;
        const svgY = vb.y + (e.clientY - svgRect.top) * scaleY;
        const rawDx = svgX - startSVGX;
        const rawDy = svgY - startSVGY;
        // Combined bounding box of all moving members (one zone, or a whole group).
        const allStart = members.flatMap(m => m.startPoints);
        const me = bboxEdges(allStart);
        const memberSet = new Set(members.map(m => m.rid));
        // Snap the group's outer edges onto neighboring rooms' edge lines — and the
        // building outline's walls when shown — for shared walls / alignment.
        const others = Object.entries(d.placements[lvl] || {}).filter(([rid]) => !memberSet.has(rid)).map(([, p]) => p);
        const zl = zoneSnapLines(others);
        const ol = layersRef.current.outline ? outlineSnapLines(d.outline) : { xs: [], ys: [] };
        const xs = [...zl.xs, ...ol.xs], ys = [...zl.ys, ...ol.ys];
        let corrX = null, bestX = WALL_SNAP_DIST, gX = null;
        for (const edge of [me.l + rawDx, me.r + rawDx]) {
          for (const ln of xs) { const c = ln - edge; if (Math.abs(c) < bestX) { bestX = Math.abs(c); corrX = c; gX = ln; } }
        }
        let corrY = null, bestY = WALL_SNAP_DIST, gY = null;
        for (const edge of [me.t + rawDy, me.b + rawDy]) {
          for (const ln of ys) { const c = ln - edge; if (Math.abs(c) < bestY) { bestY = Math.abs(c); corrY = c; gY = ln; } }
        }
        const dx = corrX !== null ? rawDx + corrX : fpSnap(rawDx);
        const dy = corrY !== null ? rawDy + corrY : fpSnap(rawDy);
        setSnapGuides(corrX !== null || corrY !== null ? { x: corrX !== null ? gX : null, y: corrY !== null ? gY : null } : null);
        const cdx = Math.max(-me.l, Math.min(FP_W - me.r, dx));
        const cdy = Math.max(-me.t, Math.min(FP_H - me.b, dy));
        const newLvl = { ...(d.placements[lvl] || {}) };
        for (const m of members) {
          newLvl[m.rid] = { ...newLvl[m.rid], points: m.startPoints.map(p => ({ x: p.x + cdx, y: p.y + cdy })) };
        }
        const next = { ...d, placements: { ...d.placements, [lvl]: newLvl } };
        fpDataRef.current = next;
        setFpData({ ...next });
        return;
      }

      // Rubber-band select box
      if (selectBoxRef.current) {
        const sx = vb.x + (e.clientX - svgRect.left) * scaleX;
        const sy = vb.y + (e.clientY - svgRect.top) * scaleY;
        selectBoxRef.current = { ...selectBoxRef.current, x1: sx, y1: sy };
        setSelectBox({ ...selectBoxRef.current });
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

      // Drawing vertex drag
      if (drawingVertexDragRef.current) {
        const { id, vi } = drawingVertexDragRef.current;
        const nx = fpSnap(Math.max(0, Math.min(FP_W, vb.x + (e.clientX - svgRect.left) * scaleX)));
        const ny = fpSnap(Math.max(0, Math.min(FP_H, vb.y + (e.clientY - svgRect.top) * scaleY)));
        const d = fpDataRef.current;
        const lvl = activeLevelRef.current;
        const newDrawings = (d.drawings?.[lvl] || []).map(drw => drw.id === id ? { ...drw, points: drw.points.map((p, i) => i === vi ? { x: nx, y: ny } : p) } : drw);
        const next = { ...d, drawings: { ...(d.drawings || {}), [lvl]: newDrawings } };
        fpDataRef.current = next;
        setFpData({ ...next });
        return;
      }

      // Drawing whole-body drag
      if (drawingDragRef.current) {
        const { id, type, origPoints, origX, origY, startClientX, startClientY } = drawingDragRef.current;
        const dx = (e.clientX - startClientX) * scaleX;
        const dy = (e.clientY - startClientY) * scaleY;
        if (!drawingDragRef.current.hasDragged && Math.abs(dx) <= 4 && Math.abs(dy) <= 4) return;
        drawingDragRef.current.hasDragged = true;
        const d = fpDataRef.current;
        const lvl = activeLevelRef.current;
        let newDrawings;
        if (type === "marker") {
          const nx = fpSnap(Math.max(0, Math.min(FP_W, origX + dx)));
          const ny = fpSnap(Math.max(0, Math.min(FP_H, origY + dy)));
          newDrawings = (d.drawings?.[lvl] || []).map(drw => drw.id === id ? { ...drw, x: nx, y: ny } : drw);
        } else {
          const newPoints = origPoints.map(p => ({
            x: fpSnap(Math.max(0, Math.min(FP_W, p.x + dx))),
            y: fpSnap(Math.max(0, Math.min(FP_H, p.y + dy))),
          }));
          newDrawings = (d.drawings?.[lvl] || []).map(drw => drw.id === id ? { ...drw, points: newPoints } : drw);
        }
        const next = { ...d, drawings: { ...(d.drawings || {}), [lvl]: newDrawings } };
        fpDataRef.current = next;
        setFpData({ ...next });
      }
    }

    function onUp(e) {
      setSnapGuides(null); // any drag is ending — clear snap guide lines
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

      // Drawing vertex drag end
      if (drawingVertexDragRef.current) {
        const { id, vi, startX, startY } = drawingVertexDragRef.current;
        drawingVertexDragRef.current = null;
        const moved = Math.abs(e.clientX - startX) > 4 || Math.abs(e.clientY - startY) > 4;
        if (moved) {
          saveFpData(fpDataRef.current);
        } else {
          const d = fpDataRef.current;
          const lvl = activeLevelRef.current;
          const dr = (d.drawings?.[lvl] || []).find(drw => drw.id === id);
          if (dr && dr.points.length > 2) {
            const newPoints = dr.points.filter((_, i) => i !== vi);
            save({ ...d, drawings: { ...(d.drawings || {}), [lvl]: (d.drawings?.[lvl] || []).map(drw => drw.id === id ? { ...drw, points: newPoints } : drw) } });
          } else {
            saveFpData(d);
          }
        }
        return;
      }

      // Drawing whole-body drag end (or click-to-insert-vertex for paths)
      if (drawingDragRef.current) {
        const { id, type, hasDragged, startClientX, startClientY } = drawingDragRef.current;
        drawingDragRef.current = null;
        if (!hasDragged && type === "path" && svgRef.current) {
          const svgRect = svgRef.current.getBoundingClientRect();
          const vb = viewBoxRef.current;
          const clickX = fpSnap(Math.max(0, Math.min(FP_W, vb.x + (startClientX - svgRect.left) / svgRect.width * vb.w)));
          const clickY = fpSnap(Math.max(0, Math.min(FP_H, vb.y + (startClientY - svgRect.top) / svgRect.height * vb.h)));
          const d = fpDataRef.current;
          const lvl = activeLevelRef.current;
          const dr = (d.drawings?.[lvl] || []).find(drw => drw.id === id);
          if (dr) {
            let bestEdge = 0, bestDist = Infinity;
            for (let i = 0; i < dr.points.length - 1; i++) {
              const dist = ptSegDist(clickX, clickY, dr.points[i].x, dr.points[i].y, dr.points[i + 1].x, dr.points[i + 1].y);
              if (dist < bestDist) { bestDist = dist; bestEdge = i; }
            }
            const newPoints = [...dr.points];
            newPoints.splice(bestEdge + 1, 0, { x: clickX, y: clickY });
            save({ ...d, drawings: { ...(d.drawings || {}), [lvl]: (d.drawings?.[lvl] || []).map(drw => drw.id === id ? { ...drw, points: newPoints } : drw) } });
          }
        } else if (hasDragged) {
          saveFpData(fpDataRef.current);
        }
        return;
      }

      if (outlineVertexDragRef.current) {
        const { vi, startX, startY } = outlineVertexDragRef.current;
        outlineVertexDragRef.current = null;
        const moved = Math.abs(e.clientX - startX) > 4 || Math.abs(e.clientY - startY) > 4;
        const d = fpDataRef.current;
        if (moved) { saveFpData(d); }
        else if (d.outline?.points && d.outline.points.length > 3) {
          save({ ...d, outline: { ...d.outline, points: d.outline.points.filter((_, i) => i !== vi) } });
        }
        return;
      }

      if (outlineDragRef.current) {
        const { moved, wasSelected, startSVGX, startSVGY } = outlineDragRef.current;
        outlineDragRef.current = null;
        if (moved) { saveFpData(fpDataRef.current); return; }
        // Click on an already-selected border inserts a vertex on the nearest edge.
        const d = fpDataRef.current;
        if (wasSelected && d.outline?.points?.length >= 2) {
          const pts = d.outline.points;
          let best = 0, bestDist = Infinity;
          for (let i = 0; i < pts.length; i++) {
            const j = (i + 1) % pts.length;
            const dist = ptSegDist(startSVGX, startSVGY, pts[i].x, pts[i].y, pts[j].x, pts[j].y);
            if (dist < bestDist) { bestDist = dist; best = i; }
          }
          if (bestDist < 20) {
            const np = [...pts];
            np.splice(best + 1, 0, { x: fpSnap(startSVGX), y: fpSnap(startSVGY) });
            save({ ...d, outline: { ...d.outline, points: np } });
          }
        }
        return;
      }

      if (draggingRef.current) { saveFpData(fpDataRef.current); draggingRef.current = null; setDragging(null); return; }

      // End rubber-band select
      if (selectBoxRef.current) {
        const box = selectBoxRef.current;
        selectBoxRef.current = null;
        setSelectBox(null);
        const minX = Math.min(box.x0, box.x1), maxX = Math.max(box.x0, box.x1);
        const minY = Math.min(box.y0, box.y1), maxY = Math.max(box.y0, box.y1);
        const isDrag = Math.abs(box.x1 - box.x0) > 4 || Math.abs(box.y1 - box.y0) > 4;
        if (isDrag) {
          const lvl = activeLevelRef.current;
          const placed = fpDataRef.current.placements[lvl] || {};
          const hit = new Set();
          for (const [rid, zone] of Object.entries(placed)) {
            const { cx, cy } = polygonCentroid(zone.points);
            if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) hit.add(rid);
          }
          setSelectedZones(hit);
        } else {
          // Click without drag — clear selection
          setSelectedZones(new Set());
        }
        return;
      }

      // End pan drag
      if (panDragRef.current) {
        const { startX, startY } = panDragRef.current;
        panDragRef.current = null;
        setIsPanning(false);
        if (Math.abs(e.clientX - startX) <= 4 && Math.abs(e.clientY - startY) <= 4) {
          setSelected(null); setSelectedPin(null); setSelectedTodoMarkerId(null); setSelectedDrawingId(null); setSelectedOutline(false);
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
              const newData = { ...d, pins: { ...(d.pins || {}), [lvl]: levelPins } };
              fpDataRef.current = newData;
              setFpData(newData);
              saveFpData(newData);
              const zoneRoom = rooms[zoneRoomId];
              if (zoneRoom?.label) {
                const catName = zoneRoom.categoryName || zoneRoom.label;
                const isExt = isExteriorTypeUtil(resolveTypeId(catName, categoryTypes?.[catName] || "system"), entityTypeData);
                const stableKey = itemToKeyMap[`${cat}|${item}`] || `${cat}|${item}`;
                useForemanStore.getState().assignItemToZone(stableKey, zoneRoom.label, isExt);
              }
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

  // Track the SVG's rendered width so labels can be sized in screen pixels
  // (constant on-screen size regardless of zoom).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const measure = () => { const w = el.getBoundingClientRect().width; if (w) setSvgPxW(w); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
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

  // Escape cancels ghost zone placement
  useEffect(() => {
    if (!ghostZone) return;
    function onKeyDown(e) {
      if (e.key === "Escape") { setGhostZone(null); ghostZoneRef.current = null; setCursorPt(null); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ghostZone]);

  // Keydown: Escape cancels draw, Enter commits path
  useEffect(() => {
    if (drawMode === "move" || drawMode === "select") return;
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
        setDrawMode("move");
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
    // Remove rooms referencing this level so the floor-recovery code in main.jsx
    // doesn't recreate it on the next app start.
    const allRooms = loadRooms();
    const cleaned = Object.fromEntries(Object.entries(allRooms).filter(([, r]) => r.floorId !== id));
    saveRooms(cleaned);
    useForemanStore.getState().reloadAll();
    const remaining = getFloorsInOrder();
    setFloors(remaining);
    if (activeLevel === id) { setActiveLevel(remaining[0]?.id || ""); setSelected(null); }
  }

  function addLevelOfType(type) {
    setShowLevelPicker(false);
    const kindMap = { "Floor": "floor", "Basement": "basement", "Attic": "attic", "Roof": "roof", "Yard / Exterior": "yard" };
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

  // The level kinds a user can assign to an existing level — the same set offered
  // when adding one. `unique` kinds (everything but floor) may exist only once.
  const LEVEL_KIND_OPTIONS = [
    { kind: "floor",    label: "Floor",    unique: false },
    { kind: "basement", label: "Basement", unique: true },
    { kind: "attic",    label: "Attic",    unique: true },
    { kind: "roof",     label: "Roof",     unique: true },
  ];
  const kindLabel = (kind) => ({ floor: "Floor", basement: "Basement", attic: "Attic", roof: "Roof", yard: "Yard" }[kind] || kind);
  const defaultLevelLabel = (kind, number) => kind === "floor" ? `Floor ${number}` : kindLabel(kind);

  function changeLevelKind(id, newKind) {
    setKindMenuLevelId(null);
    const allFloors = loadFloors();
    const target = allFloors.find(f => f.id === id);
    if (!target || target.kind === newKind) return;
    // A unique kind can't be assigned if another level already holds it.
    if (newKind !== "floor" && allFloors.some(f => f.kind === newKind && f.id !== id)) return;
    // Preserve a user-customized label; regenerate only auto-default labels.
    const wasDefaultLabel = target.label === defaultLevelLabel(target.kind, target.number);
    const updated = allFloors.map(f => {
      if (f.id !== id) return f;
      const next = { ...f, kind: newKind };
      if (newKind === "floor") {
        const maxNum = Math.max(0, ...allFloors.filter(x => x.kind === "floor" && x.id !== id).map(x => x.number || 0));
        next.number = maxNum + 1;
        next.glyph = String(next.number);
      } else {
        next.number = null;
        next.glyph = newKind.charAt(0).toUpperCase();
      }
      if (wasDefaultLabel) next.label = defaultLevelLabel(newKind, next.number);
      return next;
    });
    saveFloors(updated);
    setFloors(getFloorsInOrder());
  }

  const [zoneSearch, setZoneSearch] = useState("");

  const allInventoryItems = useMemo(() =>
    Object.entries(categoryItems).flatMap(([cat, items]) => items.map(item => ({ cat, item }))),
    [categoryItems]
  );

  const systemCats = useMemo(() =>
    categories.filter(c => isFunctional(resolveTypeId(c, categoryTypes[c] || "system"), entityTypeData)),
    [categories, categoryTypes, entityTypeData]
  );

  const selectedDrawing = useMemo(() => {
    if (!selectedDrawingId) return null;
    return (fpData.drawings?.[activeLevel] || []).find(d => d.id === selectedDrawingId) || null;
  }, [fpData, activeLevel, selectedDrawingId]);

  // Forward map: "cat|item" → stableKey. Used when calling store assignment actions.
  const itemToKeyMap = useMemo(() => {
    const map = {};
    Object.entries(reverseItemKeyMap || {}).forEach(([stableKey, { category, item }]) => {
      map[`${category}|${item}`] = stableKey;
    });
    return map;
  }, [reverseItemKeyMap]);

  const spatialCrossRefItems = useMemo(() => {
    const map = {};
    const seen = {}; // room → Set of "cat|item"; an item maps to one display entity
    // Dedupe by category+name: distinct stable keys (a default row and a custom
    // row, or two custom rows) can resolve to the same {cat, item}, which would
    // otherwise list/count the item more than once for the same zone. Inventory
    // keys off the canonical (category, name), so the floor plan must too.
    const add = (room, cat, item) => {
      const k = `${cat}|${item}`;
      if (!seen[room]) seen[room] = new Set();
      if (seen[room].has(k)) return;
      seen[room].add(k);
      if (!map[room]) map[room] = [];
      map[room].push({ cat, item });
    };
    Object.entries(customFieldValues || {}).forEach(([key, vals]) => {
      const ref = reverseItemKeyMap?.[key];
      if (!ref) return;
      const { category: cat, item } = ref;
      const typeId = resolveTypeId(cat, categoryTypes[cat] || "system");
      if (isSpatial(typeId, entityTypeData)) return;
      if (vals?.roomLabel) add(vals.roomLabel, cat, item);
      if (vals?.exteriorLabel) add(vals.exteriorLabel, cat, item);
    });
    return map;
  }, [customFieldValues, categoryTypes, entityTypeData, reverseItemKeyMap]);

  const searchResults = useMemo(() => {
    const q = zoneSearch.trim().toLowerCase();
    // Only items with NO location yet can be added to a zone. An item is already
    // located if it carries an explicit room/exterior assignment, or its own
    // category is spatial (the category itself is the location) — mirrors the
    // inventory table's resolvedLocation. Located items are managed from their
    // current zone (the zone item list above), not re-added here, so once an item
    // is assigned it drops off this list automatically.
    const unlocated = allInventoryItems.filter(({ cat, item }) => {
      const key = itemToKeyMap[`${cat}|${item}`] || `${cat}|${item}`;
      const vals = customFieldValues?.[key] || {};
      if (vals.roomLabel || vals.exteriorLabel || vals.room) return false;
      return !isSpatial(resolveTypeId(cat, categoryTypes[cat] || "system"), entityTypeData);
    });
    const pool = q
      ? unlocated.filter(({ cat, item }) =>
          item.toLowerCase().includes(q) || cat.toLowerCase().includes(q))
      : unlocated.slice(0, 60);
    return pool;
  }, [allInventoryItems, zoneSearch, itemToKeyMap, customFieldValues, categoryTypes, entityTypeData]);

  const selZoneItems = useMemo(() => {
    if (!selected) return [];
    const zoneRoom = rooms[selected];
    if (!zoneRoom?.label) return [];
    const storeKeys = (selectZoneItems({ spatialAssignments: customFieldValues }) || {})[zoneRoom.label] || [];
    // Dedupe by category+name (see spatialCrossRefItems): two stable keys can
    // point at the same display item, which must not list twice in a zone.
    const seen = new Set();
    const out = [];
    storeKeys.map(k => reverseItemKeyMap?.[k]).filter(Boolean).forEach(r => {
      const key = `${r.category}|${r.item}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ cat: r.category, item: r.item });
    });
    return out;
  }, [customFieldValues, selected, rooms, reverseItemKeyMap]);

  function toggleZoneItem(cat, item) {
    const sel = selected;
    if (!sel) return;
    const zoneRoom = rooms[sel];
    if (!zoneRoom?.label) return;
    const catName = zoneRoom.categoryName || zoneRoom.label;
    const isExt = isExteriorTypeUtil(resolveTypeId(catName, categoryTypes?.[catName] || "system"), entityTypeData);
    const stableKey = itemToKeyMap[`${cat}|${item}`] || `${cat}|${item}`;
    const sa = useForemanStore.getState().spatialAssignments;
    const field = isExt ? "exteriorLabel" : "roomLabel";
    const exists = sa[stableKey]?.[field] === zoneRoom.label;
    if (exists) {
      useForemanStore.getState().removeItemFromZone(stableKey, isExt);
    } else {
      useForemanStore.getState().assignItemToZone(stableKey, zoneRoom.label, isExt);
    }
  }

  // Create a brand-new item that belongs to the selected zone: native to the
  // zone's own category, with its location field (roomLabel / exteriorLabel)
  // stamped to the zone so the item's Location reads it without hand-entry.
  // Mirrors toggleZoneItem's room-vs-exterior routing.
  function createZoneItem(name) {
    const trimmed = (name || "").trim();
    const zoneRoom = rooms[selected];
    if (!trimmed || !zoneRoom?.label || !onAddItem) return;
    const catName = zoneRoom.categoryName || zoneRoom.label;
    const isExt = isExteriorTypeUtil(resolveTypeId(catName, categoryTypes?.[catName] || "system"), entityTypeData);
    const stableKey = onAddItem(zoneRoom.label, trimmed); // handleAddItemNamed → new custom item's stable key
    if (stableKey) useForemanStore.getState().assignItemToZone(stableKey, zoneRoom.label, isExt);
    setZoneSearch("");
    setAddedItemsExpanded(true);
  }

  const activeLevelName = floors.find(f => f.id === activeLevel)?.label || "";
  const selectedRoom = selected ? rooms[selected] : null;
  const selType = selectedRoom ? (categoryTypes[selectedRoom.label] || "system") : null;
  const selRoom = selected ? currentPlaced[selected] : null;
  // Room-use (bedroom/bath) tagging applies only to interior room zones, not exteriors.
  const selUseEligible = selectedRoom
    ? (() => {
        const tid = resolveTypeId(selectedRoom.label, categoryTypes[selectedRoom.label] || "system");
        return isSpatial(tid, entityTypeData) && !isExteriorTypeUtil(tid, entityTypeData);
      })()
    : false;

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
        const typeId = resolveTypeId(cat, categoryTypes[cat] || "system");
        return isSpatial(typeId, entityTypeData);
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

          {/* Start-from-scratch shortcuts — always visible, no zone needed first */}
          <div style={{ display: "flex", flexDirection: "column", flexShrink: 0, gap: "0.3rem", padding: "0 0.75rem 0.6rem" }}>
            {[
              onlineMode && { label: "⌖ Import from address", title: "Import your building outline from your address (online)", onClick: openAddressImport },
              { label: "⊞ Add by dimensions",  title: "Add a room by typing its name and size — no drawing",     onClick: () => setDimEntryOpen(true) },
            ].filter(Boolean).map(b => (
              <button key={b.label} onClick={b.onClick} title={b.title}
                style={{ alignItems: "center", background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: 3, color: "var(--fm-ink-dim)", cursor: "pointer", display: "flex", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", gap: "0.4rem", justifyContent: "center", letterSpacing: "0.03em", padding: "0.35rem 0.5rem", transition: "all 0.12s", width: "100%" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}>
                {b.label}
              </button>
            ))}
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
              <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", padding: "0.3rem 1rem" }}>All zones assigned</div>
            ) : (() => {
              const renderCatRow = cat => {
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
              };
              const roomCats = sortedCategories.filter(cat => { const tid = resolveTypeId(cat, categoryTypes[cat] || "system"); return !isExteriorTypeUtil(tid, entityTypeData); });
              const exteriorCats = sortedCategories.filter(cat => isExteriorTypeUtil(resolveTypeId(cat, categoryTypes[cat] || "system"), entityTypeData));
              const groups = [
                { label: "Rooms", cats: roomCats, color: FP_STROKE.room },
                { label: "Exteriors", cats: exteriorCats, color: FP_STROKE.exterior },
              ].filter(g => g.cats.length > 0);
              return (
                <>
                  {groups.map((g, i) => (
                    <Fragment key={g.label}>
                      <div style={{ borderTop: i > 0 ? "1px solid var(--fm-hairline)" : "none", color: g.color, fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.12em", padding: "0.6rem 1rem 0.2rem", textTransform: "uppercase" }}>{g.label}</div>
                      {g.cats.map(renderCatRow)}
                    </Fragment>
                  ))}
                </>
              );
            })()}
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
                  onClick={() => { setActiveLevel(level.id); setSelected(null); setKindMenuLevelId(null); }}
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
                  <div style={{ alignItems: "center", display: "flex", gap: "0.4rem", marginLeft: "1rem", marginTop: "0.15rem" }}>
                    <button
                      onClick={e => { e.stopPropagation(); setKindMenuLevelId(prev => prev === level.id ? null : level.id); }}
                      title="Change level type"
                      style={{ background: kindMenuLevelId === level.id ? "var(--fm-brass-bg)" : "transparent", border: `1px solid ${kindMenuLevelId === level.id ? "var(--fm-brass)" : "var(--fm-hairline2)"}`, borderRadius: 2, color: kindMenuLevelId === level.id ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: "pointer", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.5rem", letterSpacing: "0.08em", lineHeight: 1, padding: "0.12rem 0.3rem", textTransform: "uppercase" }}
                    >{kindLabel(level.kind)} ▾</button>
                    <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.57rem", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                      {zoneCount} zone · {itemCount} items
                    </span>
                  </div>
                  {kindMenuLevelId === level.id && (
                    <div onClick={e => e.stopPropagation()} style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem", marginLeft: "1rem", marginTop: "0.3rem" }}>
                      {LEVEL_KIND_OPTIONS.map(opt => {
                        const isCurrent = level.kind === opt.kind;
                        const taken = opt.unique && floors.some(f => f.kind === opt.kind && f.id !== level.id);
                        return (
                          <button
                            key={opt.kind}
                            disabled={taken && !isCurrent}
                            onClick={e => { e.stopPropagation(); isCurrent ? setKindMenuLevelId(null) : changeLevelKind(level.id, opt.kind); }}
                            title={taken && !isCurrent ? `A ${opt.label.toLowerCase()} level already exists` : undefined}
                            style={{ background: isCurrent ? "var(--fm-brass-bg)" : "var(--fm-bg-sunk)", border: `1px solid ${isCurrent ? "var(--fm-brass)" : "var(--fm-hairline2)"}`, borderRadius: 3, color: (taken && !isCurrent) ? "var(--fm-ink-mute)" : isCurrent ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: (taken && !isCurrent) ? "not-allowed" : "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.06em", opacity: (taken && !isCurrent) ? 0.45 : 1, padding: "0.14rem 0.4rem", textTransform: "uppercase" }}
                          >{opt.label}</button>
                        );
                      })}
                    </div>
                  )}
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
          <select
            value={drawMode}
            onChange={e => {
              const mode = e.target.value;
              setDrawMode(mode);
              setInProgress(null);
              setCursorPt(null);
              setPendingMarker(null);
              setDrawCategory(null);
              setMarkerIsTodo(false);
              drawCategoryRef.current = null;
              markerIsTodoRef.current = false;
              setSelectedDrawingId(null);
              if (mode !== "select") { setSelectedZones(new Set()); setSelectBox(null); selectBoxRef.current = null; }
            }}
            style={{ background: "var(--fm-bg-panel)", border: "1px solid var(--fm-brass)", borderRadius: 3, color: "var(--fm-brass)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.05em", outline: "none", padding: "0.18rem 0.5rem" }}>
            <option value="select">⬚ Select</option>
            <option value="move">✛ Move</option>
            <option value="path">✏ Path</option>
            <option value="line">╱ Line</option>
            <option value="marker">● Marker</option>
          </select>

          {/* Parametric room placement: shape + dimensions while a ghost zone is active */}
          {ghostZone && (() => {
            const dimInput = { background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: 3, color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", outline: "none", padding: "0.15rem 0.2rem", textAlign: "center", width: 34 };
            const dimLabel = { color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem" };
            const numCell = (key) => (
              <input type="number" min={1} max={200} value={ghostZone.dims[key] ?? ""}
                onChange={e => setGhostDim(key, e.target.value)} style={dimInput} />
            );
            return (
              <>
                <div style={{ background: "var(--fm-hairline2)", flexShrink: 0, height: 14, width: 1 }} />
                <span style={{ color: "var(--fm-brass)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.05em" }}>Room</span>
                {ROOM_SHAPES.map(s => {
                  const active = ghostZone.shape === s.key;
                  return (
                    <button key={s.key} title={s.title} onClick={() => setGhostShape(s.key)}
                      style={{ background: active ? "rgba(201,169,110,0.15)" : "transparent", border: `1px solid ${active ? "var(--fm-brass)" : "var(--fm-hairline2)"}`, borderRadius: 3, color: active ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.03em", padding: "0.14rem 0.4rem", transition: "all 0.1s" }}>
                      {s.label}
                    </button>
                  );
                })}
                <div style={{ background: "var(--fm-hairline2)", flexShrink: 0, height: 14, width: 1 }} />
                {numCell("w")}<span style={dimLabel}>×</span>{numCell("h")}
                {ghostZone.shape === "L" && (<><span style={dimLabel}>notch</span>{numCell("notchW")}<span style={dimLabel}>×</span>{numCell("notchH")}</>)}
                {ghostZone.shape === "U" && (<><span style={dimLabel}>gap</span>{numCell("gapW")}<span style={dimLabel}>×</span>{numCell("gapDepth")}</>)}
                <span style={dimLabel}>ft · click to place</span>
                <button onClick={() => { setGhostZone(null); ghostZoneRef.current = null; setCursorPt(null); }}
                  style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", marginLeft: "auto", padding: "0.1rem 0.3rem" }}>esc ×</button>
              </>
            );
          })()}

          {/* Dimension-entry trigger */}
          {!ghostZone && !dimEntryOpen && (drawMode === "move" || drawMode === "select") && !selectedDrawing && (
            <>
              <div style={{ background: "var(--fm-hairline2)", flexShrink: 0, height: 14, width: 1 }} />
              <button onClick={() => setDimEntryOpen(true)} title="Add a room by typing its name and size — no drawing"
                style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: 3, color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.03em", padding: "0.14rem 0.5rem" }}>
                ⊞ Dimensions
              </button>
              {onlineMode && (
                <button onClick={openAddressImport} title="Import your building outline from your address (online)"
                  style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: 3, color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.03em", padding: "0.14rem 0.5rem" }}>
                  ⌖ Address
                </button>
              )}
            </>
          )}

          {/* Dimension-entry ("no-draw") inline block */}
          {dimEntryOpen && !ghostZone && (() => {
            const dimInput = { background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: 3, color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", outline: "none", padding: "0.15rem 0.2rem", textAlign: "center", width: 34 };
            const dimLabel = { color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem" };
            const numCell = (key) => (
              <input type="number" min={1} max={200} value={dimDims[key] ?? ""}
                onChange={e => setDimEntryDim(key, e.target.value)} style={dimInput} />
            );
            const canAdd = !!dimName.trim();
            return (
              <>
                <div style={{ background: "var(--fm-hairline2)", flexShrink: 0, height: 14, width: 1 }} />
                <span style={{ color: "var(--fm-brass)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.05em" }}>New room</span>
                <input autoFocus value={dimName} onChange={e => setDimName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addRoomByDimensions(); if (e.key === "Escape") setDimEntryOpen(false); }}
                  placeholder="Room name…"
                  style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: 3, color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.68rem", outline: "none", padding: "0.15rem 0.45rem", width: 130 }} />
                {ROOM_SHAPES.map(s => {
                  const active = dimShape === s.key;
                  return (
                    <button key={s.key} title={s.title} onClick={() => setDimEntryShape(s.key)}
                      style={{ background: active ? "rgba(201,169,110,0.15)" : "transparent", border: `1px solid ${active ? "var(--fm-brass)" : "var(--fm-hairline2)"}`, borderRadius: 3, color: active ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.03em", padding: "0.14rem 0.4rem", transition: "all 0.1s" }}>
                      {s.label}
                    </button>
                  );
                })}
                <div style={{ background: "var(--fm-hairline2)", flexShrink: 0, height: 14, width: 1 }} />
                {numCell("w")}<span style={dimLabel}>×</span>{numCell("h")}
                {dimShape === "L" && (<><span style={dimLabel}>notch</span>{numCell("notchW")}<span style={dimLabel}>×</span>{numCell("notchH")}</>)}
                {dimShape === "U" && (<><span style={dimLabel}>gap</span>{numCell("gapW")}<span style={dimLabel}>×</span>{numCell("gapDepth")}</>)}
                <span style={dimLabel}>ft</span>
                <button onClick={addRoomByDimensions} disabled={!canAdd}
                  style={{ background: canAdd ? "var(--fm-brass)" : "var(--fm-hairline2)", border: "none", borderRadius: 3, color: canAdd ? "var(--fm-bg)" : "var(--fm-ink-mute)", cursor: canAdd ? "pointer" : "default", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.05em", padding: "0.18rem 0.6rem" }}>Add</button>
                <button onClick={() => setDimEntryOpen(false)}
                  style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", marginLeft: "auto", padding: "0.1rem 0.3rem" }}>esc ×</button>
              </>
            );
          })()}

          {/* Edit mode: drawing selected from right panel */}
          {drawMode === "move" && selectedDrawing && (() => {
            const isPathOrLine = selectedDrawing.type === "path" || selectedDrawing.type === "line";
            return (
              <>
                <div style={{ background: "var(--fm-hairline2)", flexShrink: 0, height: 14, width: 1 }} />
                {isPathOrLine && systemCats.length > 0 && (
                  <>
                    <select
                      value={selectedDrawing.category || ""}
                      onChange={e => updateDrawingCategory(selectedDrawing.id, e.target.value || null)}
                      style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: 3, color: selectedDrawing.category ? "var(--fm-ink)" : "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", outline: "none", padding: "0.15rem 0.35rem" }}>
                      <option value="">Category…</option>
                      {systemCats.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <div style={{ background: "var(--fm-hairline2)", flexShrink: 0, height: 14, width: 1 }} />
                  </>
                )}
                <input
                  value={selectedDrawing.name}
                  onChange={e => renameDrawing(selectedDrawing.id, e.target.value)}
                  style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: 3, color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.68rem", outline: "none", padding: "0.15rem 0.45rem", width: 130 }} />
                <ColorPickerDropdown value={selectedDrawing.color || "#c9a96e"} onChange={c => updateDrawingColor(selectedDrawing.id, c)} />
                <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.57rem" }}>editing {selectedDrawing.type}</span>
                <button onClick={() => setSelectedDrawingId(null)} style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", marginLeft: "auto", padding: "0.1rem 0.3rem" }}>esc ×</button>
              </>
            );
          })()}

          {/* Draw mode controls */}
          {drawMode !== "move" && drawMode !== "select" && (
            <>
              <div style={{ background: "var(--fm-hairline2)", flexShrink: 0, height: 14, width: 1 }} />
              {(drawMode === "path" || drawMode === "line") && systemCats.length > 0 && (
                <>
                  <select
                    value={drawCategory || ""}
                    onChange={e => {
                      const val = e.target.value || null;
                      setDrawCategory(val);
                      drawCategoryRef.current = val;
                      if (val) setDrawColor("#c9a96e");
                    }}
                    style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: 3, color: drawCategory ? "var(--fm-ink)" : "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", outline: "none", padding: "0.15rem 0.35rem" }}>
                    <option value="">Category…</option>
                    {systemCats.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <div style={{ background: "var(--fm-hairline2)", flexShrink: 0, height: 14, width: 1 }} />
                </>
              )}
              {drawMode === "marker" && (
                <>
                  <button
                    onClick={() => { const next = !markerIsTodo; setMarkerIsTodo(next); markerIsTodoRef.current = next; }}
                    style={{ background: markerIsTodo ? "rgba(201,169,110,0.15)" : "transparent", border: `1px solid ${markerIsTodo ? "var(--fm-brass)" : "var(--fm-hairline2)"}`, borderRadius: 3, color: markerIsTodo ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.05em", padding: "0.18rem 0.5rem", transition: "all 0.1s" }}>
                    ✓ To Do
                  </button>
                  <div style={{ background: "var(--fm-hairline2)", flexShrink: 0, height: 14, width: 1 }} />
                </>
              )}
              {!markerIsTodo && (
                <>
                  <input value={drawName} onChange={e => setDrawName(e.target.value)}
                    placeholder={drawMode === "path" ? "Path name…" : drawMode === "line" ? "Line name…" : "Marker name…"}
                    style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: 3, color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.68rem", outline: "none", padding: "0.15rem 0.45rem", width: 130 }} />
                  <ColorPickerDropdown value={drawColor} onChange={setDrawColor} />
                </>
              )}
              <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.57rem" }}>
                {drawMode === "path" ? "click · dblclick or ↵ to finish" : drawMode === "line" ? "click start · click end" : markerIsTodo ? "click to place · to do modal opens" : "click to place"}
              </span>
              <button onClick={cancelDraw} style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", marginLeft: "auto", padding: "0.1rem 0.3rem" }}>esc ×</button>
            </>
          )}
          {/* Layers control */}
          {(drawMode === "move" || drawMode === "select") && !selectedDrawingId && !ghostZone && !dimEntryOpen && (
            <>
              <div style={{ background: "var(--fm-hairline2)", flexShrink: 0, height: 14, width: 1 }} />
              <div style={{ alignItems: "center", display: "flex", flexShrink: 0, gap: "0.2rem" }}>
                <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.1em", marginRight: "0.15rem", textTransform: "uppercase" }}>Layers</span>
                {Object.entries(LAYER_PRESETS).map(([key, preset]) => {
                  const isActive = Object.keys(preset).every(k => layers[k] === preset[k]);
                  return (
                    <button key={key} onClick={() => applyPreset(key)} style={{ background: isActive ? "rgba(201,169,110,0.15)" : "transparent", border: `1px solid ${isActive ? "var(--fm-brass)" : "var(--fm-hairline2)"}`, borderRadius: 3, color: isActive ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.57rem", letterSpacing: "0.03em", padding: "0.14rem 0.38rem", transition: "all 0.1s" }}>
                      {PRESET_LABELS[key]}
                    </button>
                  );
                })}
                <div style={{ background: "var(--fm-hairline2)", flexShrink: 0, height: 12, margin: "0 0.1rem", width: 1 }} />
                {LAYER_TOGGLES.map(({ key, label }) => (
                  <button key={key} onClick={() => setLayer(key, !layers[key])} style={{ background: layers[key] ? "transparent" : "transparent", border: `1px solid ${layers[key] ? "var(--fm-hairline2)" : "var(--fm-hairline)"}`, borderRadius: 3, color: layers[key] ? "var(--fm-ink-dim)" : "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.57rem", opacity: layers[key] ? 1 : 0.5, padding: "0.14rem 0.38rem", textDecoration: layers[key] ? "none" : "line-through", transition: "all 0.1s" }}>
                    {label}
                  </button>
                ))}
                {fpData.outline?.points?.length > 0 && (
                  <div style={{ alignItems: "center", display: "flex", gap: "0.15rem", position: "relative" }}>
                    <button onClick={() => setLayer("outline", !layers.outline)} title="Show/hide building outline everywhere" style={{ background: "transparent", border: `1px solid ${layers.outline ? "var(--fm-hairline2)" : "var(--fm-hairline)"}`, borderRadius: 3, color: layers.outline ? "var(--fm-ink-dim)" : "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.57rem", opacity: layers.outline ? 1 : 0.5, padding: "0.14rem 0.38rem", textDecoration: layers.outline ? "none" : "line-through", transition: "all 0.1s" }}>
                      Outline
                    </button>
                    <button onClick={() => setOutlineMenuOpen(o => !o)} title="Outline options" style={{ background: outlineMenuOpen ? "rgba(201,169,110,0.15)" : "transparent", border: `1px solid ${outlineMenuOpen ? "var(--fm-brass)" : "var(--fm-hairline2)"}`, borderRadius: 3, color: outlineMenuOpen ? "var(--fm-brass)" : "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.57rem", lineHeight: 1, padding: "0.14rem 0.3rem", transition: "all 0.1s" }}>⋯</button>
                    {outlineMenuOpen && (
                      <>
                        <div onClick={() => setOutlineMenuOpen(false)} style={{ bottom: 0, left: 0, position: "fixed", right: 0, top: 0, zIndex: 50 }} />
                        <div style={{ background: "var(--fm-bg-panel)", border: "1px solid var(--fm-hairline2)", borderRadius: 4, boxShadow: "0 6px 20px rgba(0,0,0,0.4)", minWidth: 150, padding: "0.4rem 0", position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 51 }}>
                          {(() => {
                            const pts = fpData.outline.points;
                            const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
                            const curW = Math.round((Math.max(...xs) - Math.min(...xs)) / FP_GRID);
                            const curH = Math.round((Math.max(...ys) - Math.min(...ys)) / FP_GRID);
                            const inp = { background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: 3, color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", outline: "none", padding: "0.15rem 0.2rem", textAlign: "center", width: 40 };
                            const apply = dim => e => { const v = e.target.value; if (v !== "") resizeOutline(dim, v); };
                            return (
                              <>
                                <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.5rem", letterSpacing: "0.12em", padding: "0.1rem 0.7rem 0.3rem", textTransform: "uppercase" }}>Size (ft)</div>
                                <div style={{ alignItems: "center", display: "flex", gap: "0.3rem", padding: "0 0.7rem 0.35rem" }}>
                                  <input key={`ow-${curW}`} type="number" min={1} max={500} defaultValue={curW} onBlur={apply("w")} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} style={inp} />
                                  <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem" }}>×</span>
                                  <input key={`oh-${curH}`} type="number" min={1} max={500} defaultValue={curH} onBlur={apply("h")} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} style={inp} />
                                </div>
                                <div style={{ background: "var(--fm-hairline)", height: 1, margin: "0.15rem 0 0.35rem" }} />
                              </>
                            );
                          })()}
                          <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.5rem", letterSpacing: "0.12em", padding: "0.1rem 0.7rem 0.35rem", textTransform: "uppercase" }}>Show outline on</div>
                          {floors.map(f => {
                            const visible = !(fpData.outline.hiddenFloors || []).includes(f.id);
                            return (
                              <div key={f.id} onClick={() => toggleOutlineFloor(f.id)} style={{ alignItems: "center", color: visible ? "var(--fm-ink)" : "var(--fm-ink-mute)", cursor: "pointer", display: "flex", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", gap: "0.45rem", padding: "0.22rem 0.7rem" }}
                                onMouseEnter={e => e.currentTarget.style.background = "var(--fm-bg-raised)"}
                                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                                <span style={{ color: visible ? "var(--fm-brass)" : "transparent", width: 9 }}>✓</span>
                                {f.label}
                              </div>
                            );
                          })}
                          <div style={{ background: "var(--fm-hairline)", height: 1, margin: "0.35rem 0" }} />
                          <div onClick={deleteOutline} style={{ color: "var(--fm-red)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", padding: "0.22rem 0.7rem" }}
                            onMouseEnter={e => e.currentTarget.style.background = "var(--fm-bg-raised)"}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                            Delete outline
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
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
            if (totalSqFt === 0) return null;
            const floorName = floors.find(f => f.id === activeLevel)?.label ?? "floor";
            const floorLabel = `${floorName}${floorName.endsWith("s") ? "'" : "'s"} room sq ft:`;
            return (
              <div style={{ alignItems: "center", display: "flex", gap: "1.25rem", marginLeft: "auto" }}>
                <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem" }}>
                  {floorLabel} {Math.round(totalSqFt).toLocaleString()}
                </span>
              </div>
            );
          })()}
        </div>

        <svg
          ref={svgRef}
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          style={{ cursor: dragging ? "grabbing" : isPanning ? "grabbing" : selectBox ? "crosshair" : ghostZone ? "crosshair" : drawMode === "move" ? "grab" : drawMode === "select" ? "crosshair" : "crosshair", display: "block", flex: 1, userSelect: "none", width: "100%", touchAction: "none" }}
          onMouseDown={e => {
            if (e.button !== 0) return;
            if (drawMode !== "move" && drawMode !== "select") return; // draw clicks handled via onClick
            if (ghostZoneRef.current) return; // ghost zone placement handled in onClick
            if (drawMode === "select") {
              const r = svgRef.current.getBoundingClientRect();
              const vb0 = viewBoxRef.current;
              const sx = vb0.x + (e.clientX - r.left) / r.width * vb0.w;
              const sy = vb0.y + (e.clientY - r.top) / r.height * vb0.h;
              selectBoxRef.current = { x0: sx, y0: sy, x1: sx, y1: sy };
              setSelectBox({ x0: sx, y0: sy, x1: sx, y1: sy });
              return;
            }
            panDragRef.current = { startX: e.clientX, startY: e.clientY, startVbX: viewBoxRef.current.x, startVbY: viewBoxRef.current.y };
            setIsPanning(true);
          }}
          onMouseLeave={() => { if (ghostZoneRef.current) setCursorPt(null); }}
          onClick={e => {
            if (ghostZoneRef.current) {
              const gz = ghostZoneRef.current;
              ghostZoneRef.current = null;
              setGhostZone(null);
              setCursorPt(null);
              const r = svgRef.current.getBoundingClientRect();
              const vb = viewBoxRef.current;
              const rawX = vb.x + (e.clientX - r.left) / r.width * vb.w;
              const rawY = vb.y + (e.clientY - r.top) / r.height * vb.h;
              const { w: W, h: H, units } = ghostBoundsUnits(gz);
              const x = fpSnap(Math.max(0, Math.min(FP_W - W, rawX - W / 2)));
              const y = fpSnap(Math.max(0, Math.min(FP_H - H, rawY - H / 2)));
              placeZoneOnCanvas(gz.cat, shapeToPolygon(gz.shape, { x, y }, units), gz.shape);
              return;
            }
            if (drawMode !== "move" && drawMode !== "select") handleDrawClick(e);
          }}
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

          {/* Building outline scaffold — plan-wide singleton, behind zones, a neutral
              white border with no fill. Shown per-floor (hidden floors opt out); in
              move mode the border is grabbable to reposition the whole outline. */}
          {layers.outline && fpData.outline?.points?.length > 0 && !fpData.outline.hiddenFloors?.includes(activeLevel) && (() => {
            const opts = fpData.outline.points;
            const ptStr = opts.map(p => `${p.x},${p.y}`).join(" ");
            const { cx, cy } = polygonCentroid(opts);
            return (
              <g>
                <polygon points={ptStr} fill="none" stroke={selectedOutline ? "var(--fm-brass)" : FP_OUTLINE_STROKE} strokeWidth={selectedOutline ? 3 : 2} strokeLinejoin="round" style={{ pointerEvents: "none" }} />
                {drawMode === "move" && !ghostZone && (
                  <polygon points={ptStr} fill="none" stroke="transparent" strokeWidth={14} strokeLinejoin="round" style={{ cursor: "move", pointerEvents: "stroke" }} onMouseDown={startOutlineDrag} />
                )}
                {/* Edge length labels — identical treatment to room/exterior zones */}
                {selectedOutline && opts.map((p0, vi) => {
                  const p1 = opts[(vi + 1) % opts.length];
                  const dx = p1.x - p0.x, dy = p1.y - p0.y;
                  const edgeLen = Math.hypot(dx, dy);
                  const feet = edgeLen / FP_GRID;
                  if (feet < 1) return null;
                  const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;
                  const n1x = -dy / edgeLen, n1y = dx / edgeLen;
                  const dot = (cx - mx) * n1x + (cy - my) * n1y;
                  const outNx = dot > 0 ? -n1x : n1x, outNy = dot > 0 ? -n1y : n1y;
                  const lx = mx + outNx * 14, ly = my + outNy * 14;
                  const rawAngle = Math.atan2(dy, dx) * 180 / Math.PI;
                  const textAngle = (rawAngle > 90 || rawAngle < -90) ? rawAngle + 180 : rawAngle;
                  const label = Number.isInteger(feet) ? `${feet} ft` : `${feet.toFixed(1)} ft`;
                  return (
                    <text key={`odim-${vi}`} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
                      fill="var(--fm-brass)" fontSize={fpFont(11)} fontFamily="var(--fm-mono)"
                      transform={`rotate(${textAngle}, ${lx}, ${ly})`} style={{ pointerEvents: "none" }}>
                      {label}
                    </text>
                  );
                })}
                {/* Vertex handles — drag to adjust, click to remove (when >3 remain) */}
                {selectedOutline && opts.map((p, vi) => (
                  <circle key={`ovh-${vi}`} cx={p.x} cy={p.y} r={5} fill="var(--fm-bg)" stroke="var(--fm-brass)" strokeWidth={1.5}
                    style={{ cursor: opts.length > 3 ? "crosshair" : "grab", pointerEvents: "auto" }}
                    onMouseDown={e => handleOutlineVertexMouseDown(e, vi)}
                    title={opts.length > 3 ? "Drag to move · Click to remove" : "Drag to move"} />
                ))}
              </g>
            );
          })()}

          {Object.entries(currentPlaced).map(([roomId, zonePoly]) => {
            if (!layers.zones) return null;
            const zoneRoom = rooms[roomId];
            if (!zoneRoom) return null;
            const type = categoryTypes[zoneRoom.label] || "system";
            const isSel = selected === roomId;
            const isMultiSel = selectedZones.has(roomId);
            const isDrag = dragging === roomId;
            const itemCount = (categoryItems[zoneRoom.label]?.length || 0) + (spatialCrossRefItems[zoneRoom.label]?.length || 0);
            const pts = zonePoly.points;
            const ptStr = pts.map(p => `${p.x},${p.y}`).join(" ");
            const { cx, cy } = polygonCentroid(pts);
            const isLocked = !!zonePoly.locked;
            const btnX = Math.max(...pts.map(p => p.x)) + 12;
            const btnY = Math.min(...pts.map(p => p.y)) - 12;
            return (
              <Fragment key={roomId}>
              <g>
                <polygon
                  points={ptStr}
                  fill={FP_FILL[type]}
                  stroke={isMultiSel ? "var(--fm-brass)" : isSel ? "var(--fm-brass)" : FP_STROKE[type]}
                  strokeWidth={isMultiSel ? 2 : isSel ? 1.5 : 1}
                  strokeDasharray={isMultiSel && !isSel ? "6 3" : undefined}
                  opacity={isDrag ? 0.7 : 1}
                  style={{ cursor: drawMode === "select" ? "pointer" : isLocked ? "default" : "grab" }}
                  onMouseDown={e => handleRoomMouseDown(e, roomId)}
                />
                <text x={cx} y={cy + fpFont(5)} textAnchor="middle" fill={isSel ? "var(--fm-brass)" : "var(--fm-ink)"} fontSize={fpFont(15)} fontFamily="var(--fm-mono)" style={{ pointerEvents: "none" }}>
                  {zoneRoom.label}
                </text>
                <text x={cx} y={cy + fpFont(21)} textAnchor="middle" fill="var(--fm-ink-dim)" fontSize={fpFont(11)} fontFamily="var(--fm-mono)" style={{ pointerEvents: "none" }}>
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </text>
                {/* Lock badge — visible whenever the zone is locked, selected or not */}
                {isLocked && (
                  <g style={{ pointerEvents: "none" }}>
                    <circle cx={Math.min(...pts.map(p => p.x)) + 10} cy={Math.min(...pts.map(p => p.y)) + 10} r={7} fill="var(--fm-brass)" opacity={0.75} />
                    <path
                      d={`M ${Math.min(...pts.map(p => p.x)) + 7.2},${Math.min(...pts.map(p => p.y)) + 10.5} L ${Math.min(...pts.map(p => p.x)) + 7.2},${Math.min(...pts.map(p => p.y)) + 7.5} A2.8,2.8 0 0 1 ${Math.min(...pts.map(p => p.x)) + 12.8},${Math.min(...pts.map(p => p.y)) + 7.5} L ${Math.min(...pts.map(p => p.x)) + 12.8},${Math.min(...pts.map(p => p.y)) + 10.5}`}
                      stroke="white" strokeWidth={1.5} fill="none" strokeLinecap="round"
                    />
                    <rect x={Math.min(...pts.map(p => p.x)) + 6} y={Math.min(...pts.map(p => p.y)) + 10.5} width={8} height={5.5} rx={1} fill="white" />
                  </g>
                )}
              </g>
              </Fragment>
            );
          })}

          {/* Selected-zone overlay — rendered after all zone polygons so interactive
              elements (LockButton, XButton, vertex handles) are never occluded by
              a neighbouring zone's polygon. */}
          {(() => {
            if (!selected || !layers.zones) return null;
            const zonePoly = currentPlaced[selected];
            if (!zonePoly) return null;
            const zoneRoom = rooms[selected];
            if (!zoneRoom) return null;
            const pts = zonePoly.points;
            const { cx, cy } = polygonCentroid(pts);
            const isLocked = !!zonePoly.locked;
            const btnX = Math.max(...pts.map(p => p.x)) + 12;
            const btnY = Math.min(...pts.map(p => p.y)) - 12;
            return (
              <g key="sel-overlay">
                {/* Edge hit strips */}
                {!isLocked && pts.map((p0, vi) => {
                  const p1 = pts[(vi + 1) % pts.length];
                  return (
                    <line
                      key={`eh-${vi}`}
                      x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y}
                      stroke="transparent"
                      strokeWidth={12}
                      style={{ cursor: "cell" }}
                      onMouseDown={e => { e.stopPropagation(); handleEdgeClick(e, selected, vi); }}
                    />
                  );
                })}
                {/* Vertex handles */}
                {!isLocked && pts.map((p0, vi) => (
                  <circle
                    key={`vh-${vi}`}
                    cx={p0.x} cy={p0.y} r={5}
                    fill="var(--fm-bg)"
                    stroke="var(--fm-brass)"
                    strokeWidth={1.5}
                    style={{ cursor: pts.length > 3 ? "crosshair" : "grab" }}
                    onMouseDown={e => handleVertexMouseDown(e, selected, vi)}
                    title={pts.length > 3 ? "Drag to move · Click to remove" : "Drag to move"}
                  />
                ))}
                {/* Edge dimension labels */}
                {pts.map((p0, vi) => {
                  const p1 = pts[(vi + 1) % pts.length];
                  const dx = p1.x - p0.x, dy = p1.y - p0.y;
                  const edgeLen = Math.hypot(dx, dy);
                  const feet = edgeLen / FP_GRID;
                  if (feet < 1) return null;
                  const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;
                  const n1x = -dy / edgeLen, n1y = dx / edgeLen;
                  const dot = (cx - mx) * n1x + (cy - my) * n1y;
                  const outNx = dot > 0 ? -n1x : n1x, outNy = dot > 0 ? -n1y : n1y;
                  const lx = mx + outNx * 14, ly = my + outNy * 14;
                  const rawAngle = Math.atan2(dy, dx) * 180 / Math.PI;
                  const textAngle = (rawAngle > 90 || rawAngle < -90) ? rawAngle + 180 : rawAngle;
                  const label = Number.isInteger(feet) ? `${feet} ft` : `${feet.toFixed(1)} ft`;
                  return (
                    <text key={`dim-${vi}`} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
                      fill="var(--fm-brass)" fontSize={fpFont(11)} fontFamily="var(--fm-mono)"
                      transform={`rotate(${textAngle}, ${lx}, ${ly})`} style={{ pointerEvents: "none" }}>
                      {label}
                    </text>
                  );
                })}
                {/* Lock + delete buttons — always on top of all zone polygons */}
                <LockButton
                  x={btnX - 24} y={btnY}
                  locked={isLocked}
                  onToggle={() => toggleZoneLock(selected)}
                />
                <XButton
                  x={btnX} y={btnY}
                  onDelete={() => removeFromCanvas(selected)}
                  onHoverEnter={null}
                  onHoverLeave={null}
                />
              </g>
            );
          })()}

          {/* Item pins */}
          {layers.pins && (fpData.pins?.[activeLevel] || []).map(pin => {
            const isSelected = selectedPin === pin.id;
            const stroke = FP_STROKE[categoryTypes[pin.cat] || "system"];
            return (
              <Fragment key={pin.id}>
              <g
                transform={`translate(${pin.x},${pin.y})`}
                style={{ cursor: isSelected ? "grab" : "pointer" }}
                onMouseDown={e => handlePinMouseDown(e, pin.id)}
                onClick={e => { e.stopPropagation(); setSelectedPin(isSelected ? null : pin.id); }}
                onMouseEnter={() => onEntityHoverEnter("pin", pin.id)}
                onMouseLeave={onEntityHoverLeave}
              >
                <rect x={-18} y={-9} width={36} height={18} rx={3}
                  fill="var(--fm-bg-panel)" stroke={isSelected ? "var(--fm-brass)" : stroke} strokeWidth={1.5} />
                <text textAnchor="middle" dominantBaseline="central"
                  style={{ fill: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "7px", letterSpacing: "0.06em", pointerEvents: "none" }}>
                  {pinAbbr(pin.item)}
                </text>
              </g>
              {hoveredEntity?.id === pin.id && (
                <XButton
                  x={pin.x + 22} y={pin.y - 12}
                  onDelete={() => deletePin(pin.id)}
                  onHoverEnter={() => onEntityHoverEnter("pin", pin.id)}
                  onHoverLeave={onEntityHoverLeave}
                />
              )}
              </Fragment>
            );
          })}

          {/* Snap guide lines while dragging a room/vertex near a neighbor's wall */}
          {snapGuides && (
            <g style={{ pointerEvents: "none" }}>
              {snapGuides.x != null && (
                <line x1={snapGuides.x} y1={0} x2={snapGuides.x} y2={FP_H} stroke="var(--fm-brass)" strokeWidth={1} strokeDasharray="4 4" opacity={0.7} />
              )}
              {snapGuides.y != null && (
                <line x1={0} y1={snapGuides.y} x2={FP_W} y2={snapGuides.y} stroke="var(--fm-brass)" strokeWidth={1} strokeDasharray="4 4" opacity={0.7} />
              )}
            </g>
          )}

          {/* Ghost zone during click-to-place */}
          {ghostZone && cursorPt && (() => {
            const { w: W, h: H, units } = ghostBoundsUnits(ghostZone);
            const x = fpSnap(Math.max(0, Math.min(FP_W - W, cursorPt.x - W / 2)));
            const y = fpSnap(Math.max(0, Math.min(FP_H - H, cursorPt.y - H / 2)));
            const type = categoryTypes[ghostZone.cat] || "system";
            const poly = shapeToPolygon(ghostZone.shape, { x, y }, units);
            const ptStr = poly.points.map(p => `${p.x},${p.y}`).join(" ");
            return (
              <g style={{ pointerEvents: "none" }} opacity={0.65}>
                <polygon points={ptStr} fill={FP_FILL[type]} stroke={FP_STROKE[type]} strokeWidth={1.5} strokeDasharray="6 3" />
                <text x={x + W / 2} y={y + H / 2 + 5} textAnchor="middle" fill="var(--fm-ink)" fontSize={11} fontFamily="var(--fm-mono)">{ghostZone.cat}</text>
              </g>
            );
          })()}

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
            if (dr.todoId && !layers.todos) return null;
            if (!dr.todoId && !layers.drawings) return null;
            const isSel = selectedDrawingId === dr.id;

            if (dr.type === "path" && dr.points?.length >= 2) {
              const ptStr = dr.points.map(p => `${p.x},${p.y}`).join(" ");
              const anchor = drawingXAnchor(dr);
              return (
                <Fragment key={dr.id}>
                <g>
                  {isSel && <polyline points={ptStr} stroke={dr.color} strokeWidth={7} fill="none" opacity={0.18} strokeLinecap="round" style={{ pointerEvents: "none" }} />}
                  <polyline points={ptStr} stroke={dr.color} strokeWidth={isSel ? 3 : 2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: "none" }} />
                  {/* Hit area — drag moves whole path, click inserts vertex */}
                  <polyline points={ptStr} stroke="transparent" strokeWidth={14} fill="none"
                    style={{ cursor: isSel ? "crosshair" : "pointer", pointerEvents: "auto" }}
                    onMouseEnter={() => onEntityHoverEnter("drawing", dr.id)}
                    onMouseLeave={onEntityHoverLeave}
                    onMouseDown={e => {
                      e.preventDefault(); e.stopPropagation();
                      if (!isSel) { setSelectedDrawingId(dr.id); return; }
                      drawingDragRef.current = { id: dr.id, type: "path", origPoints: dr.points.map(p => ({ ...p })), startClientX: e.clientX, startClientY: e.clientY, hasDragged: false };
                    }}
                  />
                  {/* Vertex handles */}
                  {isSel && dr.points.map((p, vi) => (
                    <circle key={`vh-${vi}`} cx={p.x} cy={p.y} r={5}
                      fill="var(--fm-bg)" stroke={dr.color} strokeWidth={1.5}
                      style={{ cursor: dr.points.length > 2 ? "crosshair" : "grab", pointerEvents: "auto" }}
                      onMouseDown={e => { e.preventDefault(); e.stopPropagation(); drawingVertexDragRef.current = { id: dr.id, vi, startX: e.clientX, startY: e.clientY }; }}
                      title={dr.points.length > 2 ? "Drag to move · Click to remove" : "Drag to move"}
                    />
                  ))}
                </g>
                {hoveredEntity?.id === dr.id && (
                  <XButton
                    x={anchor.x} y={anchor.y}
                    onDelete={() => deleteDrawing(dr.id)}
                    onHoverEnter={() => onEntityHoverEnter("drawing", dr.id)}
                    onHoverLeave={onEntityHoverLeave}
                  />
                )}
                </Fragment>
              );
            }

            if (dr.type === "line" && dr.points?.length >= 2) {
              const [p0, p1] = dr.points;
              const anchor = drawingXAnchor(dr);
              return (
                <Fragment key={dr.id}>
                <g>
                  {isSel && <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={dr.color} strokeWidth={7} opacity={0.18} strokeLinecap="round" style={{ pointerEvents: "none" }} />}
                  <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={dr.color} strokeWidth={isSel ? 3 : 2.5} strokeLinecap="round" style={{ pointerEvents: "none" }} />
                  {/* Hit area — drag moves whole line */}
                  <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="transparent" strokeWidth={14}
                    style={{ cursor: isSel ? "grab" : "pointer", pointerEvents: "auto" }}
                    onMouseEnter={() => onEntityHoverEnter("drawing", dr.id)}
                    onMouseLeave={onEntityHoverLeave}
                    onMouseDown={e => {
                      e.preventDefault(); e.stopPropagation();
                      if (!isSel) { setSelectedDrawingId(dr.id); return; }
                      drawingDragRef.current = { id: dr.id, type: "line", origPoints: dr.points.map(p => ({ ...p })), startClientX: e.clientX, startClientY: e.clientY, hasDragged: false };
                    }}
                  />
                  {/* Endpoint handles */}
                  {isSel && dr.points.map((p, vi) => (
                    <circle key={`vh-${vi}`} cx={p.x} cy={p.y} r={5}
                      fill="var(--fm-bg)" stroke={dr.color} strokeWidth={1.5}
                      style={{ cursor: "grab", pointerEvents: "auto" }}
                      onMouseDown={e => { e.preventDefault(); e.stopPropagation(); drawingVertexDragRef.current = { id: dr.id, vi, startX: e.clientX, startY: e.clientY }; }}
                      title="Drag to move endpoint"
                    />
                  ))}
                </g>
                {hoveredEntity?.id === dr.id && (
                  <XButton
                    x={anchor.x} y={anchor.y}
                    onDelete={() => deleteDrawing(dr.id)}
                    onHoverEnter={() => onEntityHoverEnter("drawing", dr.id)}
                    onHoverLeave={onEntityHoverLeave}
                  />
                )}
                </Fragment>
              );
            }

            if (dr.type === "marker") {
              const anchor = drawingXAnchor(dr);
              if (dr.todoId) {
                const isTodoSel = selectedTodoMarkerId === dr.id;
                return (
                  <Fragment key={dr.id}>
                  <g style={{ cursor: "grab", pointerEvents: "auto" }}
                    onMouseDown={e => handleTodoMarkerMouseDown(e, dr)}
                    onMouseEnter={() => onEntityHoverEnter("drawing", dr.id)}
                    onMouseLeave={onEntityHoverLeave}>
                    <circle cx={dr.x} cy={dr.y} r={8}
                      fill={dr.color} stroke={isTodoSel ? "var(--fm-ink)" : "var(--fm-bg)"} strokeWidth={isTodoSel ? 2 : 1.5} />
                    <text x={dr.x} y={dr.y - fpFont(13)} textAnchor="middle" fontSize={fpFont(12)}
                      style={{ fill: dr.color, fontFamily: "var(--fm-mono)", pointerEvents: "none", userSelect: "none" }}>
                      {(dr.label || "").slice(0, 12)}
                    </text>
                  </g>
                  {hoveredEntity?.id === dr.id && (
                    <XButton
                      x={anchor.x} y={anchor.y}
                      onDelete={() => deleteDrawing(dr.id)}
                      onHoverEnter={() => onEntityHoverEnter("drawing", dr.id)}
                      onHoverLeave={onEntityHoverLeave}
                    />
                  )}
                  </Fragment>
                );
              }
              return (
                <Fragment key={dr.id}>
                <g style={{ cursor: isSel ? "grab" : "pointer", pointerEvents: "auto" }}
                  onMouseDown={e => {
                    e.preventDefault(); e.stopPropagation();
                    if (!isSel) { setSelectedDrawingId(dr.id); return; }
                    drawingDragRef.current = { id: dr.id, type: "marker", origX: dr.x, origY: dr.y, startClientX: e.clientX, startClientY: e.clientY, hasDragged: false };
                  }}
                  onMouseEnter={() => onEntityHoverEnter("drawing", dr.id)}
                  onMouseLeave={onEntityHoverLeave}>
                  <circle cx={dr.x} cy={dr.y} r={isSel ? 7 : 5} fill={dr.color}
                    stroke={isSel ? "var(--fm-bg)" : "none"} strokeWidth={1.5} />
                  <text x={dr.x} y={dr.y - fpFont(11)} textAnchor="middle" fontSize={fpFont(12)}
                    style={{ fill: dr.color, fontFamily: "var(--fm-mono)", letterSpacing: "0.04em", pointerEvents: "none" }}>
                    {dr.label || dr.name}
                  </text>
                </g>
                {hoveredEntity?.id === dr.id && (
                  <XButton
                    x={anchor.x} y={anchor.y}
                    onDelete={() => deleteDrawing(dr.id)}
                    onHoverEnter={() => onEntityHoverEnter("drawing", dr.id)}
                    onHoverLeave={onEntityHoverLeave}
                  />
                )}
                </Fragment>
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
          {cursorPt && drawMode !== "move" && drawMode !== "select" && !pendingMarker && (
            <g style={{ pointerEvents: "none" }}>
              <circle cx={cursorPt.x} cy={cursorPt.y} r={4} fill="none" stroke={drawColor} strokeWidth={1.5} opacity={0.8} />
              <line x1={cursorPt.x - 10} y1={cursorPt.y} x2={cursorPt.x + 10} y2={cursorPt.y} stroke={drawColor} strokeWidth={1} opacity={0.5} />
              <line x1={cursorPt.x} y1={cursorPt.y - 10} x2={cursorPt.x} y2={cursorPt.y + 10} stroke={drawColor} strokeWidth={1} opacity={0.5} />
            </g>
          )}

          {/* Rubber-band select box */}
          {selectBox && (() => {
            const x = Math.min(selectBox.x0, selectBox.x1);
            const y = Math.min(selectBox.y0, selectBox.y1);
            const w = Math.abs(selectBox.x1 - selectBox.x0);
            const h = Math.abs(selectBox.y1 - selectBox.y0);
            return (
              <g style={{ pointerEvents: "none" }}>
                <rect x={x} y={y} width={w} height={h} fill="rgba(201,169,110,0.08)" stroke="var(--fm-brass)" strokeWidth={1} strokeDasharray="6 3" />
              </g>
            );
          })()}

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

        {/* Multi-zone action float */}
        {drawMode === "select" && selectedZones.size > 0 && (() => {
          const selIds = [...selectedZones];
          const lvlP = fpData.placements[activeLevel] || {};
          const anyGrouped = selIds.some(rid => lvlP[rid]?.groupId);
          const allPts = selIds.flatMap(rid => lvlP[rid]?.points || []);
          const gxs = allPts.map(p => p.x), gys = allPts.map(p => p.y);
          const curW = allPts.length ? Math.round((Math.max(...gxs) - Math.min(...gxs)) / FP_GRID) : 0;
          const curH = allPts.length ? Math.round((Math.max(...gys) - Math.min(...gys)) / FP_GRID) : 0;
          const inp = { background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: 3, color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", outline: "none", padding: "0.15rem 0.2rem", textAlign: "center", width: 38 };
          const applySize = dim => e => { const v = e.target.value; if (v !== "") resizeSelectedZones(dim, v); };
          const buttons = [
            ...(selIds.length >= 2 ? [{ label: "Group", action: groupSelectedZones }] : []),
            ...(anyGrouped ? [{ label: "Ungroup", action: ungroupSelectedZones }] : []),
            { label: "Lock", action: () => lockSelectedZones(true) },
            { label: "Unlock", action: () => lockSelectedZones(false) },
            { label: "Remove", action: removeSelectedFromCanvas, danger: true },
          ];
          return (
          <div
            onMouseDown={e => e.stopPropagation()}
            style={{
              alignItems: "center",
              background: "var(--fm-bg-panel)",
              border: "1px solid var(--fm-brass)",
              borderRadius: 6,
              bottom: 20,
              boxShadow: "0 4px 20px rgba(0,0,0,0.55)",
              display: "flex",
              flexDirection: "column",
              gap: "0.55rem",
              left: "50%",
              padding: "0.65rem 0.9rem",
              position: "absolute",
              transform: "translateX(-50%)",
              zIndex: 30,
            }}
          >
            <span style={{ color: "var(--fm-brass)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.06em", textAlign: "center" }}>
              {selectedZones.size} zone{selectedZones.size !== 1 ? "s" : ""} selected{anyGrouped ? " · grouped" : ""}
            </span>
            <div style={{ alignItems: "center", display: "flex", gap: "0.4rem" }}>
              <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>Size</span>
              <input key={`gw-${curW}`} type="number" min={1} max={500} defaultValue={curW} onBlur={applySize("w")} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} style={inp} />
              <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem" }}>×</span>
              <input key={`gh-${curH}`} type="number" min={1} max={500} defaultValue={curH} onBlur={applySize("h")} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} style={inp} />
              <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem" }}>ft</span>
            </div>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              {buttons.map(({ label, action, danger }) => (
                <button
                  key={label}
                  onClick={action}
                  style={{ background: "none", border: `1px solid var(--fm-hairline2)`, borderRadius: 3, color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", padding: "0.22rem 0.6rem", transition: "border-color 0.1s, color 0.1s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = danger ? "#ef4444" : "var(--fm-brass)"; e.currentTarget.style.color = danger ? "#ef4444" : "var(--fm-brass)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setSelectedZones(new Set())}
              style={{ background: "none", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", padding: 0 }}
            >
              Clear selection
            </button>
          </div>
          );
        })()}

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
            projects={storeProjects}
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
        {selectedOutline && fpData.outline?.points?.length > 0 ? (() => {
          const opts = fpData.outline.points;
          const xs = opts.map(p => p.x), ys = opts.map(p => p.y);
          const curW = Math.round((Math.max(...xs) - Math.min(...xs)) / FP_GRID);
          const curH = Math.round((Math.max(...ys) - Math.min(...ys)) / FP_GRID);
          const area = Math.round(polygonArea(opts) / (FP_GRID * FP_GRID));
          const inp = { background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: 3, color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.7rem", outline: "none", padding: "0.2rem 0.25rem", textAlign: "center", width: 42 };
          const apply = dim => e => { const v = e.target.value; if (v !== "") resizeOutline(dim, v); };
          const rowLabel = { color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase" };
          return (
            <>
              {/* Header */}
              <div style={{ padding: "0.85rem 1rem 0.7rem" }}>
                <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.57rem", letterSpacing: "0.12em", marginBottom: "0.35rem", textTransform: "uppercase" }}>Scaffold</div>
                <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "1.15rem" }}>Building Outline</div>
              </div>
              <div style={{ borderBottom: "1px solid var(--fm-hairline)" }} />
              {/* Stats */}
              <div style={{ display: "flex" }}>
                {[{ label: "Area", value: `${area.toLocaleString()} sq ft` }, { label: "Sides", value: opts.length }].map(({ label, value }, i) => (
                  <div key={label} style={{ borderRight: i < 1 ? "1px solid var(--fm-hairline)" : "none", flex: 1, padding: "0.6rem 0.75rem" }}>
                    <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.54rem", letterSpacing: "0.1em", marginBottom: "0.2rem", textTransform: "uppercase" }}>{label}</div>
                    <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "1.3rem", fontWeight: 400 }}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ borderBottom: "1px solid var(--fm-hairline)" }} />
              {/* Size editor */}
              <div style={{ alignItems: "center", display: "flex", gap: "0.5rem", justifyContent: "space-between", padding: "0.55rem 1rem" }}>
                <span style={rowLabel}>Size (ft)</span>
                <div style={{ alignItems: "center", display: "flex", gap: "0.3rem" }}>
                  <input key={`ow-${curW}`} type="number" min={1} max={500} defaultValue={curW} onBlur={apply("w")} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} style={inp} />
                  <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem" }}>×</span>
                  <input key={`oh-${curH}`} type="number" min={1} max={500} defaultValue={curH} onBlur={apply("h")} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} style={inp} />
                </div>
              </div>
              <div style={{ borderBottom: "1px solid var(--fm-hairline)" }} />
              {/* Per-floor visibility */}
              {floors.length > 1 && (
                <>
                  <div style={{ padding: "0.6rem 1rem 0.3rem" }}><span style={rowLabel}>Show on floors</span></div>
                  <div style={{ padding: "0 1rem 0.55rem" }}>
                    {floors.map(f => {
                      const visible = !(fpData.outline.hiddenFloors || []).includes(f.id);
                      return (
                        <div key={f.id} onClick={() => toggleOutlineFloor(f.id)} style={{ alignItems: "center", color: visible ? "var(--fm-ink)" : "var(--fm-ink-mute)", cursor: "pointer", display: "flex", fontFamily: "var(--fm-mono)", fontSize: "0.68rem", gap: "0.5rem", padding: "0.25rem 0" }}>
                          <span style={{ color: visible ? "var(--fm-brass)" : "transparent", width: 10 }}>✓</span>
                          {f.label}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ borderBottom: "1px solid var(--fm-hairline)" }} />
                </>
              )}
              {/* Delete (footer) */}
              <div style={{ flex: 1 }} />
              <div style={{ borderTop: "1px solid var(--fm-hairline)", padding: "0.7rem 1rem" }}>
                <button onClick={deleteOutline} style={{ background: "transparent", border: "1px solid var(--fm-red)", borderRadius: 3, color: "var(--fm-red)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", letterSpacing: "0.05em", padding: "0.4rem 0.8rem", width: "100%" }}>
                  Delete outline
                </button>
              </div>
            </>
          );
        })() : selected && selRoom ? (
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
                { label: "Items", value: (categoryItems[selectedRoom?.label]?.length || 0) + (spatialCrossRefItems[selectedRoom?.label]?.length || 0) },
              ].map(({ label, value }, i) => (
                <div key={label} style={{ borderRight: i < 1 ? "1px solid var(--fm-hairline)" : "none", flex: 1, padding: "0.6rem 0.75rem" }}>
                  <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.54rem", letterSpacing: "0.1em", marginBottom: "0.2rem", textTransform: "uppercase" }}>{label}</div>
                  <div style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "1.3rem", fontWeight: 400 }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{ borderBottom: "1px solid var(--fm-hairline)" }} />

            {/* Shape selector — reshape the zone in place (keeps its bounding box) */}
            {selRoom?.points && !selRoom.locked && (
              <>
                <div style={{ alignItems: "center", display: "flex", gap: "0.5rem", justifyContent: "space-between", padding: "0.55rem 1rem" }}>
                  <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>Shape</span>
                  <div style={{ display: "flex", gap: "0.25rem" }}>
                    {ROOM_SHAPES.map(s => {
                      const active = (selRoom.shape || "rect") === s.key;
                      return (
                        <button key={s.key} title={s.title} onClick={() => reshapeSelectedZone(s.key)}
                          style={{ background: active ? "rgba(201,169,110,0.15)" : "transparent", border: `1px solid ${active ? "var(--fm-brass)" : "var(--fm-hairline2)"}`, borderRadius: 3, color: active ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.03em", padding: "0.14rem 0.45rem", transition: "all 0.1s" }}>
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div style={{ borderBottom: "1px solid var(--fm-hairline)" }} />
              </>
            )}

            {/* Editable dimensions (bounding box, feet) */}
            {selRoom?.points && (() => {
              const xs = selRoom.points.map(p => p.x), ys = selRoom.points.map(p => p.y);
              const curW = Math.round((Math.max(...xs) - Math.min(...xs)) / FP_GRID);
              const curH = Math.round((Math.max(...ys) - Math.min(...ys)) / FP_GRID);
              const inp = { background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: 3, color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.7rem", outline: "none", padding: "0.2rem 0.25rem", textAlign: "center", width: 42 };
              const apply = (dim) => (e) => { const v = e.target.value; if (v !== "") resizeSelectedZone(dim, v); };
              return (
                <>
                  <div style={{ alignItems: "center", display: "flex", gap: "0.5rem", justifyContent: "space-between", padding: "0.55rem 1rem" }}>
                    <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>Size (ft)</span>
                    {selRoom.locked ? (
                      <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem" }}>{curW} × {curH} · locked</span>
                    ) : (
                      <div style={{ alignItems: "center", display: "flex", gap: "0.3rem" }}>
                        <input key={`${selected}-w-${curW}`} type="number" min={1} max={500} defaultValue={curW}
                          onBlur={apply("w")} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} style={inp} />
                        <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem" }}>×</span>
                        <input key={`${selected}-h-${curH}`} type="number" min={1} max={500} defaultValue={curH}
                          onBlur={apply("h")} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} style={inp} />
                      </div>
                    )}
                  </div>
                  <div style={{ borderBottom: "1px solid var(--fm-hairline)" }} />
                </>
              );
            })()}

            {/* Floor assignment — moves the zone (and its pins) to another floor */}
            {floors.length > 1 && (
              <>
                <div style={{ alignItems: "center", display: "flex", gap: "0.5rem", justifyContent: "space-between", padding: "0.55rem 1rem" }}>
                  <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>Floor</span>
                  <select
                    value={activeLevel}
                    onChange={e => moveZoneToFloor(e.target.value)}
                    style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: 3, color: "var(--fm-ink)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", letterSpacing: "0.04em", outline: "none", padding: "0.15rem 0.3rem" }}
                  >
                    {floors.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </div>
                <div style={{ borderBottom: "1px solid var(--fm-hairline)" }} />
              </>
            )}

            {/* Room use (real-estate classification) — interior rooms only */}
            {selUseEligible && (
              <>
                <div style={{ alignItems: "center", display: "flex", gap: "0.5rem", justifyContent: "space-between", padding: "0.55rem 1rem" }}>
                  <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>Room Type</span>
                  <select
                    value={selectedRoom?.use ?? ""}
                    onChange={e => useForemanStore.getState().setRoomUse(selected, e.target.value || null)}
                    style={{ background: "var(--fm-bg-sunk)", border: `1px solid ${selectedRoom?.use ? "var(--fm-brass)" : "var(--fm-hairline2)"}`, borderRadius: 3, color: selectedRoom?.use ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", letterSpacing: "0.04em", outline: "none", padding: "0.15rem 0.3rem" }}
                  >
                    <option value="">— type —</option>
                    {ROOM_USES.map(u => <option key={u.id} value={u.id} title={u.desc}>{u.label}</option>)}
                  </select>
                </div>
                <div style={{ borderBottom: "1px solid var(--fm-hairline)" }} />
              </>
            )}

            {/* Items section — scrollable */}
            <div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0, overflowY: "auto" }}>
              {/* Section header */}
              <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", padding: "0.45rem 0.75rem 0.4rem" }}>
                <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Items · {(categoryItems[selectedRoom?.label]?.length || 0) + (spatialCrossRefItems[selectedRoom?.label]?.length || 0)}
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
                const cfCrossRefs = spatialCrossRefItems[selectedRoom?.label] || [];
                const cfKeys = new Set(cfCrossRefs.map(z => `${z.cat}|${z.item}`));
                const zoneOnlyCrossRefs = selZoneItems.filter(z =>
                  z.cat !== selectedRoom?.label && !cfKeys.has(`${z.cat}|${z.item}`)
                );
                const crossItems = [...cfCrossRefs, ...zoneOnlyCrossRefs];
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
                              <div key={`native|${item}`} style={{ alignItems: "center", cursor: onSelectItem ? "pointer" : "default", display: "flex", gap: "0.4rem", padding: "0.28rem 0.75rem" }}
                                onMouseEnter={e => e.currentTarget.style.background = "var(--fm-bg-panel)"}
                                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                                onClick={() => onSelectItem?.({ cat: selectedRoom?.label, item })}
                              >
                                <span
                                  title="Drag to place pin on floor plan"
                                  style={{ color: "var(--fm-ink-dim)", cursor: "grab", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.7rem", lineHeight: 1, paddingRight: "0.1rem", userSelect: "none" }}
                                  onMouseDown={e => { e.preventDefault(); e.stopPropagation(); sidebarDragRef.current = { cat: selectedRoom?.label, item }; }}
                                >⠿</span>
                                <span style={{ color: "var(--fm-ink)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item}</span>
                              </div>
                            ))}
                            {crossItems.map(({ cat, item }) => (
                              <div key={`cross|${cat}|${item}`} style={{ alignItems: "center", cursor: onSelectItem ? "pointer" : "default", display: "flex", gap: "0.4rem", padding: "0.28rem 0.75rem" }}
                                onMouseEnter={e => e.currentTarget.style.background = "var(--fm-bg-panel)"}
                                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                                onClick={() => onSelectItem?.({ cat, item })}
                              >
                                <span
                                  title="Drag to place pin on floor plan"
                                  style={{ color: "var(--fm-ink-dim)", cursor: "grab", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.7rem", lineHeight: 1, paddingRight: "0.1rem", userSelect: "none" }}
                                  onMouseDown={e => { e.preventDefault(); e.stopPropagation(); sidebarDragRef.current = { cat, item }; }}
                                >⠿</span>
                                <span style={{ color: "var(--fm-ink)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item}</span>
                                <span style={{ color: "var(--fm-ink-mute)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.05em" }}>{cat.slice(0, 3).toUpperCase()}</span>
                                <button
                                  onClick={e => { e.stopPropagation(); toggleZoneItem(cat, item); }}
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
                  placeholder="Search or add a new item…"
                  style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: 3, boxSizing: "border-box", color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.75rem", outline: "none", padding: "0.35rem 0.6rem", width: "100%" }}
                  onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
                  onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"}
                />
              </div>

              {/* Search results */}
              <div style={{ flex: 1, overflowY: "auto" }}>
                {searchResults.length === 0 && !zoneSearch.trim() ? (
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
                {zoneSearch.trim() && (() => {
                  const q = zoneSearch.trim();
                  const cat = selectedRoom?.label;
                  const alreadyExists = (categoryItems[cat] || []).some(i => i.toLowerCase() === q.toLowerCase());
                  if (alreadyExists || !cat || !onAddItem) return null;
                  return (
                    <div
                      onClick={() => createZoneItem(q)}
                      style={{ alignItems: "center", borderTop: searchResults.length > 0 ? "1px solid var(--fm-hairline)" : "none", cursor: "pointer", display: "flex", gap: "0.4rem", padding: "0.35rem 0.75rem", transition: "background 0.1s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--fm-bg-panel)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <span style={{ color: "var(--fm-brass)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        Create "{q}"
                      </span>
                      <span style={{ color: "var(--fm-ink-mute)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.05em" }}>{cat.slice(0, 3).toUpperCase()}</span>
                      <span style={{ color: "var(--fm-brass)", flexShrink: 0, fontFamily: "var(--fm-mono)", fontSize: "0.72rem", width: "0.8rem" }}>+</span>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Footer */}
            <div style={{ borderTop: "1px solid var(--fm-hairline)", display: "flex", gap: "0.5rem", padding: "0.7rem 1rem" }}>
              <button
                onClick={() => removeFromCanvas(selected)}
                title="Remove zone polygon from canvas (keeps room entity and assignments)"
                style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: 3, color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.1em", padding: "0.45rem 0.85rem", textTransform: "uppercase", transition: "all 0.1s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-red)"; e.currentTarget.style.color = "var(--fm-red)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
              >Remove Zone</button>
              <button
                onClick={() => handleDeleteRoom(selected)}
                title="Permanently delete room and clear all item assignments"
                style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: 3, color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", letterSpacing: "0.1em", padding: "0.45rem 0.85rem", textTransform: "uppercase", transition: "all 0.1s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-red)"; e.currentTarget.style.color = "var(--fm-red)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
              >Delete Room</button>
            </div>
            <ConfirmDialog
              open={!!confirmRoomId}
              title="Delete room"
              message={`Delete "${rooms[confirmRoomId]?.label || "this room"}"? All item assignments will be cleared.`}
              onConfirm={performDeleteRoom}
              onCancel={() => setConfirmRoomId(null)}
            />
          </>
        ) : (
          <div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}>
            {(() => {
              const legacySubtypes = loadRoomSubtypes();
              const { beds, baths } = computeBedBath(rooms, legacySubtypes);
              // Interior room zone = spatial type that isn't an exterior (matches the sq-ft rollup).
              const isRoomClass = (lbl) => {
                const tid = resolveTypeId(lbl || "", categoryTypes[lbl] || "system");
                return isSpatial(tid, entityTypeData) && !isExteriorTypeUtil(tid, entityTypeData);
              };
              const houseSqFt = Object.values(fpData.placements).reduce((sum, lvl) =>
                sum + Object.entries(lvl).reduce((s, [rid, zone]) =>
                  isRoomClass(rooms[rid]?.label) ? s + polygonArea(zone.points) / (FP_GRID * FP_GRID) : s, 0), 0);
              const floorCount = floors.filter(f => f.kind === "floor").length;
              const basementCount = floors.filter(f => f.kind === "basement").length;
              const atticCount = floors.filter(f => f.kind === "attic").length;
              const attributes = [
                { label: "Finished area", value: `${Math.round(houseSqFt).toLocaleString()} sq ft`, tip: "The summed floor area of every space tagged as a Room, across all levels. Exteriors — garages, basements, attics, and outdoor areas — are excluded, so this approximates the home's finished living space. It's an estimate, not an appraisal-grade GLA measurement." },
                { label: "Floors", value: floorCount },
                ...(basementCount > 0 ? [{ label: "Basement", value: basementCount }] : []),
                ...(atticCount > 0 ? [{ label: "Attic", value: atticCount }] : []),
              ];
              return <PropertyDetailsPanel beds={beds} baths={formatBaths(baths)} attributes={attributes} />;
            })()}
            <div style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", fontStyle: "italic", padding: "0.85rem 1rem 0.6rem", textAlign: "center" }}>
              Click a zone to view details
            </div>
            <div style={{ borderTop: "1px solid var(--fm-hairline)", flex: 1, overflowY: "auto" }}>
              {(() => {
                const allDrawings = fpData.drawings?.[activeLevel] || [];
                const todoMarkers = allDrawings.filter(dr => dr.todoId);
                const regular = allDrawings.filter(dr => !dr.todoId);

                const systemDrawings = regular.filter(dr => dr.category && isFunctional(resolveTypeId(dr.category, categoryTypes[dr.category] || "system"), entityTypeData));
                const uncategorized = regular.filter(dr => !dr.category);

                const sectionLabel = { color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.12em", textTransform: "uppercase" };
                const sectionHeader = (label, count, first = false) => (
                  <div style={{ alignItems: "center", borderTop: first ? "none" : "1px solid var(--fm-hairline)", display: "flex", justifyContent: "space-between", padding: "0.5rem 0.75rem 0.35rem" }}>
                    <span style={sectionLabel}>{label} · {count}</span>
                  </div>
                );

                const drawingRow = (dr) => {
                  const rowSel = selectedDrawingId === dr.id;
                  return (
                    <div key={dr.id}
                      onClick={() => setSelectedDrawingId(rowSel ? null : dr.id)}
                      style={{ alignItems: "center", background: rowSel ? "rgba(201,169,110,0.08)" : "transparent", borderBottom: "1px solid var(--fm-hairline)", cursor: "pointer", display: "flex", gap: "0.5rem", padding: "0.35rem 0.75rem", transition: "background 0.1s" }}>
                      <div style={{ background: dr.color, borderRadius: "50%", flexShrink: 0, height: 10, outline: rowSel ? `2px solid ${dr.color}` : "none", outlineOffset: 2, width: 10 }} />
                      {editingDrawingNameId === dr.id ? (
                        <input
                          autoFocus
                          defaultValue={dr.name}
                          onClick={e => e.stopPropagation()}
                          onBlur={e => { renameDrawing(dr.id, e.target.value); setEditingDrawingNameId(null); }}
                          onKeyDown={e => { if (e.key === "Enter") { renameDrawing(dr.id, e.target.value); setEditingDrawingNameId(null); } if (e.key === "Escape") setEditingDrawingNameId(null); }}
                          style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-brass)", borderRadius: 2, color: "var(--fm-ink)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.72rem", outline: "none", padding: "0.05rem 0.3rem" }} />
                      ) : (
                        <span
                          onDoubleClick={e => { e.stopPropagation(); setEditingDrawingNameId(dr.id); }}
                          style={{ color: "var(--fm-ink)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.72rem", fontWeight: rowSel ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dr.name}</span>
                      )}
                      <span style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem" }}>{dr.type}</span>
                      <button onClick={e => { e.stopPropagation(); toggleDrawingVisibility(dr.id); }}
                        title={dr.visible !== false ? "Hide" : "Show"}
                        style={{ background: "none", border: "none", color: dr.visible !== false ? "var(--fm-ink-dim)" : "var(--fm-ink-mute)", cursor: "pointer", fontSize: "0.75rem", padding: "0 0.1rem" }}>
                        {dr.visible !== false ? "👁" : "○"}
                      </button>
                      <button onClick={e => { e.stopPropagation(); deleteDrawing(dr.id); }}
                        style={{ background: "none", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", padding: "0 0.1rem", transition: "color 0.1s" }}
                        onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                        onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-mute)"}>×</button>
                    </div>
                  );
                };

                const hasAny = regular.length > 0 || todoMarkers.length > 0;
                return (
                  <>
                    {!hasAny && (
                      <>
                        {sectionHeader("Drawings", 0, true)}
                        <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.7rem", fontStyle: "italic", padding: "0.25rem 0.75rem 0.5rem" }}>
                          Use the toolbar to draw paths, lines, and markers.
                        </div>
                      </>
                    )}
                    {systemDrawings.length > 0 && (
                      <>{sectionHeader("Systems", systemDrawings.length, true)}{systemDrawings.map(drawingRow)}</>
                    )}
                    {uncategorized.length > 0 && (
                      <>{sectionHeader("Drawings", uncategorized.length, systemDrawings.length === 0)}{uncategorized.map(drawingRow)}</>
                    )}
                    {todoMarkers.length > 0 && (
                      <>
                        {sectionHeader("To Do Pins", todoMarkers.length, regular.length === 0)}
                        {todoMarkers.map(dr => {
                          const rowSel = selectedDrawingId === dr.id;
                          return (
                            <div key={dr.id}
                              onClick={() => setSelectedDrawingId(rowSel ? null : dr.id)}
                              style={{ alignItems: "center", background: rowSel ? "rgba(201,169,110,0.08)" : "transparent", borderBottom: "1px solid var(--fm-hairline)", cursor: "pointer", display: "flex", gap: "0.5rem", padding: "0.35rem 0.75rem", transition: "background 0.1s" }}>
                              <div style={{ background: dr.color, borderRadius: "50%", flexShrink: 0, height: 10, outline: rowSel ? `2px solid ${dr.color}` : "none", outlineOffset: 2, width: 10 }} />
                              {editingDrawingNameId === dr.id ? (
                                <input
                                  autoFocus
                                  defaultValue={dr.name}
                                  onClick={e => e.stopPropagation()}
                                  onBlur={e => { renameDrawing(dr.id, e.target.value); setEditingDrawingNameId(null); }}
                                  onKeyDown={e => { if (e.key === "Enter") { renameDrawing(dr.id, e.target.value); setEditingDrawingNameId(null); } if (e.key === "Escape") setEditingDrawingNameId(null); }}
                                  style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-brass)", borderRadius: 2, color: "var(--fm-ink)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.72rem", outline: "none", padding: "0.05rem 0.3rem" }} />
                              ) : (
                                <span
                                  onDoubleClick={e => { e.stopPropagation(); setEditingDrawingNameId(dr.id); }}
                                  style={{ color: "var(--fm-ink)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.72rem", fontWeight: rowSel ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dr.name}</span>
                              )}
                              <button onClick={e => { e.stopPropagation(); removeTodoMarker(dr.id); }}
                                title="Remove from map"
                                style={{ background: "none", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", padding: "0 0.1rem", transition: "color 0.1s" }}
                                onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                                onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-mute)"}>×</button>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Address → building footprint import modal (only reachable in Online Mode) */}
      {addrModalOpen && (() => {
        const close = () => { if (!addrBusy) setAddrModalOpen(false); };
        const label = { color: "var(--fm-ink-dim)", display: "block", fontFamily: "var(--fm-mono)", fontSize: "0.55rem", letterSpacing: "0.12em", marginBottom: "0.3rem", textTransform: "uppercase" };
        return (
          <div onMouseDown={close} style={{ alignItems: "center", background: "rgba(0,0,0,0.5)", display: "flex", inset: 0, justifyContent: "center", position: "fixed", zIndex: 1000 }}>
            <div onMouseDown={e => e.stopPropagation()} style={{ background: "var(--fm-bg-panel)", border: "1px solid var(--fm-hairline2)", borderRadius: 6, boxShadow: "0 12px 40px rgba(0,0,0,0.5)", boxSizing: "border-box", maxWidth: "92vw", padding: "1.25rem 1.4rem", width: 440 }}>
              <div style={{ alignItems: "baseline", display: "flex", justifyContent: "space-between", marginBottom: "0.85rem" }}>
                <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-serif)", fontSize: "1.05rem" }}>Import building outline</span>
                <button onClick={close} style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.8rem", padding: 0 }}>✕</button>
              </div>

              <>
                  <label style={label}>Address</label>
                  <input
                    autoFocus value={addrInput} onChange={e => setAddrInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") runAddressImport(); if (e.key === "Escape") close(); }}
                    placeholder="123 Main St, Springfield, IL 62704"
                    style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: 3, boxSizing: "border-box", color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.8rem", outline: "none", padding: "0.45rem 0.55rem", width: "100%" }} />
                  <p style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.6rem", lineHeight: 1.5, margin: "0.6rem 0 0" }}>
                    Looks up the published building outline (OpenStreetMap) and adds it as a scaffold — a neutral border shown on every floor, pre-scaled to feet, that you drop rooms onto. It's the envelope, not the interior: interior walls aren't included, and a roofline runs slightly larger than the foundation. Toggle it with the Outline filter; importing again replaces it.
                  </p>
                  {addrError && (
                    <div style={{ background: "rgba(224,123,106,0.1)", border: "1px solid var(--fm-red)", borderRadius: 3, color: "var(--fm-red)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", lineHeight: 1.45, margin: "0.7rem 0 0", padding: "0.45rem 0.55rem" }}>
                      {addrError}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
                    <button onClick={close} disabled={addrBusy} style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: 3, color: "var(--fm-ink-dim)", cursor: addrBusy ? "default" : "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", letterSpacing: "0.06em", padding: "0.4rem 0.9rem" }}>Cancel</button>
                    <button onClick={runAddressImport} disabled={addrBusy || !addrInput.trim()} style={{ background: addrBusy || !addrInput.trim() ? "var(--fm-hairline2)" : "var(--fm-brass)", border: "none", borderRadius: 3, color: addrBusy || !addrInput.trim() ? "var(--fm-ink-mute)" : "var(--fm-bg)", cursor: addrBusy || !addrInput.trim() ? "default" : "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", letterSpacing: "0.06em", padding: "0.4rem 1rem" }}>
                      {addrBusy ? "Fetching…" : "Fetch outline"}
                    </button>
                  </div>
              </>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Item Inventory View ────────────────────────────────────────────────────────


const INV_STATUS_META = {
  active:  { color: "var(--fm-green)",   label: "Active"  },
  partial: { color: "var(--fm-amber)",   label: "Partial" },
  empty:   { color: "var(--fm-ink-dim)", label: "Empty"   },
};

function getInvItemStatus(itemDetails, cat, item, stableKey = null) {
  const detail = itemDetails?.[stableKey] ?? itemDetails?.[`${cat}|${item}`];
  if (!detail) return "empty";
  if (detail.mfr || detail.model || detail.manufacturer) return "active";
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

function OutlineTab({ categories, categoryTypes, categoryItems, entityTypeData, onRefreshEntityTypes, onCreateCategory, onAddItem, customFieldValues, reverseItemKeyMap, onSelectItem, onDeleteCategory, onRenameCategory }) {
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
  const categoryCommittedRef = useRef(false);
  const itemCommittedRef     = useRef(false);

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
    const seen = {};
    Object.entries(customFieldValues || {}).forEach(([key, vals]) => {
      const room = vals?.roomLabel || vals?.room;
      if (!room) return;
      const lookup = reverseItemKeyMap?.[key];
      if (!lookup) return;
      const { category: cat, item } = lookup;
      const catTypeId = resolveTypeId(cat, categoryTypes?.[cat] || "system");
      if (isSpatial(catTypeId, entityTypeData)) return;
      const dedupeKey = `${room}\x00${cat}\x00${item}`;
      if (seen[dedupeKey]) return;
      seen[dedupeKey] = true;
      if (!map[room]) map[room] = [];
      map[room].push({ category: cat, item });
    });
    return map;
  }, [customFieldValues, categoryTypes, entityTypeData, reverseItemKeyMap]);

  // Items from spatial categories that declare a system association → appear under that functional system
  const crossRefBySystem = useMemo(() => {
    const map = {};
    const seen = {};
    Object.entries(customFieldValues || {}).forEach(([key, vals]) => {
      const system = vals?.systemCategory || vals?.system;
      if (!system) return;
      const lookup = reverseItemKeyMap?.[key];
      if (!lookup) return;
      const { category: cat, item } = lookup;
      const catTypeId = resolveTypeId(cat, categoryTypes?.[cat] || "system");
      if (isFunctional(catTypeId, entityTypeData)) return;
      const dedupeKey = `${system}\x00${cat}\x00${item}`;
      if (seen[dedupeKey]) return;
      seen[dedupeKey] = true;
      if (!map[system]) map[system] = [];
      map[system].push({ category: cat, item });
    });
    return map;
  }, [customFieldValues, categoryTypes, entityTypeData, reverseItemKeyMap]);

  // Items from non-exterior categories that declare an exterior association → appear under that exterior
  const crossRefByExterior = useMemo(() => {
    const map = {};
    const seen = {};
    Object.entries(customFieldValues || {}).forEach(([key, vals]) => {
      const ext = ('exteriorLabel' in (vals || {})) ? vals.exteriorLabel : null;
      if (!ext) return;
      const lookup = reverseItemKeyMap?.[key];
      if (!lookup) return;
      const { category: cat, item } = lookup;
      const catTypeId = resolveTypeId(cat, categoryTypes?.[cat] || "system");
      if (isExteriorTypeUtil(catTypeId, entityTypeData)) return;
      const dedupeKey = `${ext}\x00${cat}\x00${item}`;
      if (seen[dedupeKey]) return;
      seen[dedupeKey] = true;
      if (!map[ext]) map[ext] = [];
      map[ext].push({ category: cat, item });
    });
    return map;
  }, [customFieldValues, categoryTypes, entityTypeData, reverseItemKeyMap]);

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
    setAddingCategoryToType(null);
    setNewCategoryName("");
    if (name) onCreateCategory?.(name, typeId);
    categoryCommittedRef.current = false;
  }

  function commitAddItem(cat) {
    const name = newItemName.trim();
    setAddingItemToCategory(null);
    setNewItemName("");
    if (name) onAddItem?.(cat, name);
    itemCommittedRef.current = false;
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
    const mergedCatTypeId = mergedCat ? resolveTypeId(mergedCat, categoryTypes?.[mergedCat] || "system") : null;
    const mergedCrossRefs = mergedCat && isSpatial(mergedCatTypeId, entityTypeData) && !isExteriorTypeUtil(mergedCatTypeId, entityTypeData)
      ? (crossRefByRoom[mergedCat] || []) : [];
    const mergedSystemCrossRefs = mergedCat && isFunctional(mergedCatTypeId, entityTypeData)
      ? (crossRefBySystem[mergedCat] || []) : [];
    const mergedExteriorCrossRefs = mergedCat && isExteriorTypeUtil(mergedCatTypeId, entityTypeData)
      ? (crossRefByExterior[mergedCat] || []) : [];
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
            ? (mergedCatItems.length + mergedCrossRefs.length + mergedSystemCrossRefs.length + mergedExteriorCrossRefs.length) > 0 && <span style={{ color: "var(--fm-brass-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem" }}>{mergedCatItems.length + mergedCrossRefs.length + mergedSystemCrossRefs.length + mergedExteriorCrossRefs.length}</span>
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
              onBlur={() => { if (!categoryCommittedRef.current) commitAddCategory(type.id); }}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); categoryCommittedRef.current = true; commitAddCategory(type.id); }
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
          const crossRefs = (isSpatial(catTypeId, entityTypeData) && !isExteriorTypeUtil(catTypeId, entityTypeData)) ? (crossRefByRoom[cat] || []) : [];
          const systemCrossRefs = isFunctional(catTypeId, entityTypeData) ? (crossRefBySystem[cat] || []) : [];
          const exteriorCrossRefs = isExteriorTypeUtil(catTypeId, entityTypeData) ? (crossRefByExterior[cat] || []) : [];
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
              ...exteriorCrossRefs.map(({ category: xCat, item: xItem }) => (
                <div key={`xref-ext-${xCat}|${xItem}`} onClick={() => onSelectItem?.({ category: xCat, item: xItem })}
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
                    onBlur={() => { if (!itemCommittedRef.current) commitAddItem(cat); }}
                    onKeyDown={e => {
                      if (e.key === "Enter") { e.preventDefault(); itemCommittedRef.current = true; commitAddItem(cat); }
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
                {editingCatName !== cat && (items.length + crossRefs.length + systemCrossRefs.length + exteriorCrossRefs.length) > 0 && <span style={{ color: "var(--fm-ink-mute)" }}>{items.length + crossRefs.length + systemCrossRefs.length + exteriorCrossRefs.length}</span>}
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
                    onBlur={() => { if (!itemCommittedRef.current) commitAddItem(cat); }}
                    onKeyDown={e => {
                      if (e.key === "Enter") { e.preventDefault(); itemCommittedRef.current = true; commitAddItem(cat); }
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
              {exteriorCrossRefs.map(({ category: xCat, item: xItem }) => (
                <div key={`xref-ext-${xCat}|${xItem}`} onClick={() => onSelectItem?.({ category: xCat, item: xItem })}
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

// ─── Overview Tab ────────────────────────────────────────────────────────────

const OVERVIEW_GRID_KEY = "foreman-overview-grid";

function loadOverviewOrder() {
  try {
    const s = storageGet(OVERVIEW_GRID_KEY);
    return {
      item:      Array.isArray(s?.itemColumnOrder)    ? s.itemColumnOrder    : [],
      collapsed: Array.isArray(s?.collapsedItemTypes) ? s.collapsedItemTypes : [],
    };
  } catch { return { item: [], collapsed: [] }; }
}

function saveOverviewOrder(order) {
  storageSet(OVERVIEW_GRID_KEY, { itemColumnOrder: order.item, collapsedItemTypes: order.collapsed });
}

function columnTypeBinding(label) {
  const singular = label.toLowerCase().replace(/s$/, "");
  return BUILT_IN_ITEM_TYPES.find(t => t.toLowerCase() === singular) || null;
}

function OverviewTab({ rooms, exteriors, categories, customFieldValues, reverseItemKeyMap, effectiveCategoryTypes, entityTypeData, onAddItem, onFieldChange, onCreated, onSelectItem }) {
  const [order, setOrder] = useState(() => loadOverviewOrder());
  const [dragCol, setDragCol] = useState(null);     // { id: string } — parent item type only
  const [dragOverCol, setDragOverCol] = useState(null);
  const [cellDraft, setCellDraft] = useState(null); // { row, isRoom, col }
  const [draftCat,  setDraftCat]  = useState("");
  const [draftName, setDraftName] = useState("");
  const draftNameRef = useRef(null);

  // ── Derive parent item type columns ───────────────────────────────────────

  const itemCols = useMemo(() => {
    const normalizeType = t => BUILT_IN_ITEM_TYPES.find(b => b.toLowerCase() === t.toLowerCase()) ?? t;
    const userTypes = Object.values(customFieldValues || {})
      .map(v => v?.item_type).filter(Boolean).map(normalizeType);
    const all = [...new Set([...BUILT_IN_ITEM_TYPES, ...userTypes])].sort();
    const saved = order.item || [];
    const saved_ = saved.filter(id => all.includes(id));
    const rest   = all.filter(id => !saved_.includes(id));
    return [...saved_, ...rest].map(label => ({ id: label, label }));
  }, [customFieldValues, order.item]);

  // ── Collapsed set ─────────────────────────────────────────────────────────

  const collapsedSet = useMemo(() => new Set(order.collapsed || []), [order.collapsed]);

  function toggleCollapsed(typeId) {
    const next = new Set(collapsedSet);
    if (next.has(typeId)) next.delete(typeId);
    else next.add(typeId);
    const newOrder = { ...order, collapsed: [...next] };
    setOrder(newOrder);
    saveOverviewOrder(newOrder);
  }

  // ── Flat column list (parent + subtype sub-cols) ──────────────────────────

  const allCols = useMemo(() => {
    const cols = [];
    for (const parent of itemCols) {
      const collapsed = collapsedSet.has(parent.id);
      cols.push({ ...parent, group: "item", isParent: true, isCollapsed: collapsed });
      if (!collapsed) {
        const subtypes = ITEM_SUBTYPES[parent.id] ?? [];
        for (const sub of subtypes) {
          cols.push({ id: `${parent.id}::${sub}`, label: sub, group: "item", parentId: parent.id, isSubtype: true, isUntyped: false });
        }
        cols.push({ id: `${parent.id}::—`, label: "—", group: "item", parentId: parent.id, isSubtype: true, isUntyped: true });
      }
    }
    return cols;
  }, [itemCols, collapsedSet]);

  // ── Cell creation ─────────────────────────────────────────────────────────

  const availableCats = useMemo(() => {
    if (!cellDraft || !categories) return [];
    return categories.filter(c => {
      const tid = resolveTypeId(c, effectiveCategoryTypes[c] || "system");
      return !isSpatial(tid, entityTypeData);
    });
  }, [cellDraft, categories, effectiveCategoryTypes, entityTypeData]);

  useEffect(() => {
    if (!cellDraft) return;
    setDraftCat(prev => availableCats.includes(prev) ? prev : (availableCats[0] || ""));
    setDraftName("");
    setTimeout(() => draftNameRef.current?.focus(), 0);
  }, [cellDraft]); // eslint-disable-line react-hooks/exhaustive-deps

  const roomSet = useMemo(() => new Set(rooms), [rooms]);

  function commitCreate() {
    if (!draftName.trim()) return;
    const name = draftName.trim();
    const cat = draftCat || availableCats[0];
    if (!cat) return;
    const col = cellDraft.col;
    const itemType = col.isSubtype ? col.parentId : col.id;
    const stableKey = onAddItem?.(cat, name);
    if (stableKey && onFieldChange) {
      onFieldChange(cat, name, "item_type", itemType, stableKey);
      if (col.isSubtype && !col.isUntyped) {
        onFieldChange(cat, name, "item_subtype", col.label, stableKey);
      }
      if (cellDraft.isRoom) {
        onFieldChange(cat, name, "roomLabel", cellDraft.row, stableKey);
      } else {
        onFieldChange(cat, name, "exteriorLabel", cellDraft.row, stableKey);
      }
    }
    setCellDraft(null);
    onCreated?.(cat, name);
  }

  // ── Derived cells ─────────────────────────────────────────────────────────

  const derivedCells = useMemo(() => {
    const result = {};
    if (!customFieldValues || !reverseItemKeyMap) return result;

    const lc = s => (s || "").toLowerCase();

    // Build per-item-entry list once to avoid O(n²) inner loops.
    // Each entry: { key, ref, vals, itemTypeLc, itemSubtype }
    const entries = Object.entries(reverseItemKeyMap).map(([key, ref]) => {
      const vals = customFieldValues[key] || {};
      return { key, ref, vals, itemTypeLc: lc(vals.item_type), itemSubtype: vals.item_subtype || "" };
    });

    // For each row × column combination, collect matching item names.
    // Parent (collapsed) cols: match item_type only.
    // Subtype cols: match item_type AND item_subtype (or lack thereof for "—").
    itemCols.forEach(parent => {
      const parentLc = parent.id.toLowerCase();
      const subtypes = ITEM_SUBTYPES[parent.id] ?? [];
      const collapsed = collapsedSet.has(parent.id);

      [...rooms, ...exteriors].forEach(row => {
        const isRoom = roomSet.has(row);
        const rowL   = lc(row);

        const matching = entries.filter(({ ref, vals }) => {
          const spatial = isRoom ? vals.roomLabel : vals.exteriorLabel;
          const explicitMatch = !!spatial && lc(spatial) === rowL;
          const implicitMatch = !spatial && lc(ref.category) === rowL;
          return explicitMatch || implicitMatch;
        });

        const typeMatches = matching.filter(e => e.itemTypeLc === parentLc);

        // Always compute parent key (used when collapsed, and for toggle consistency)
        result[`item\x00${row}\x00${parent.id}`] = typeMatches.map(e => ({ item: e.ref.item, category: e.ref.category }));

        if (!collapsed) {
          // Subtype sub-columns
          subtypes.forEach(sub => {
            const subLc = sub.toLowerCase();
            result[`item\x00${row}\x00${parent.id}::${sub}`] =
              typeMatches.filter(e => lc(e.itemSubtype) === subLc).map(e => ({ item: e.ref.item, category: e.ref.category }));
          });
          // Untyped "—" col: items with this type but no subtype set
          const knownSubtypesLc = new Set(subtypes.map(s => s.toLowerCase()));
          result[`item\x00${row}\x00${parent.id}::—`] =
            typeMatches.filter(e => !e.itemSubtype || !knownSubtypesLc.has(lc(e.itemSubtype))).map(e => ({ item: e.ref.item, category: e.ref.category }));
        }
      });
    });

    return result;
  }, [customFieldValues, reverseItemKeyMap, itemCols, collapsedSet, rooms, exteriors, roomSet]);

  // ── Drag reorder (within-group only) ────────────────────────────────────

  function handleDrop(toId) {
    if (!dragCol || dragCol.id === toId) return;
    const fromId = dragCol.id;
    const currentIds = itemCols.map(c => c.id);
    const fromIdx = currentIds.indexOf(fromId);
    const toIdx   = currentIds.indexOf(toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const reordered = [...currentIds];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const newOrder = { ...order, item: reordered };
    setOrder(newOrder);
    saveOverviewOrder(newOrder);
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const COL_W = 160;

  const thBase = {
    background: "var(--fm-bg-panel)",
    borderBottom: "2px solid var(--fm-hairline2)",
    borderRight: "1px solid var(--fm-hairline)",
    color: "var(--fm-brass-dim)",
    cursor: "grab",
    fontFamily: "var(--fm-mono)",
    fontSize: "0.6rem",
    letterSpacing: "0.08em",
    padding: "0.4rem 0.6rem 0.35rem",
    position: "sticky",
    textAlign: "left",
    textTransform: "uppercase",
    top: 0,
    transition: "opacity 0.1s",
    whiteSpace: "nowrap",
    width: COL_W,
    minWidth: COL_W,
    zIndex: 2,
  };

  const tdLabel = {
    background: "var(--fm-bg-panel)",
    borderBottom: "1px solid var(--fm-hairline)",
    borderRight: "2px solid var(--fm-hairline2)",
    color: "var(--fm-ink)",
    fontFamily: "var(--fm-mono)",
    fontSize: "0.7rem",
    fontWeight: 500,
    left: 0,
    minWidth: COL_W,
    padding: "0.5rem 0.75rem",
    position: "sticky",
    userSelect: "none",
    verticalAlign: "middle",
    zIndex: 1,
  };

  const tdCell = {
    borderBottom: "1px solid var(--fm-hairline)",
    borderRight: "1px solid var(--fm-hairline)",
    minWidth: COL_W,
    padding: "0.45rem 0.6rem",
    verticalAlign: "top",
    width: COL_W,
  };

  const sectionHeaderTd = {
    background: "var(--fm-bg-sunk)",
    borderBottom: "1px solid var(--fm-hairline2)",
    borderTop: "1px solid var(--fm-hairline2)",
    color: "var(--fm-brass)",
    fontFamily: "var(--fm-mono)",
    fontSize: "0.54rem",
    letterSpacing: "0.15em",
    padding: "0.3rem 0.75rem",
    textTransform: "uppercase",
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  // Build two header rows from allCols:
  // Row 1: parent item type <th> with colspan + expand/collapse toggle
  // Row 2: subtype label <th>s (empty for collapsed parents via rowSpan on row-1)
  function renderHeaderRows() {
    const row1 = [];
    const row2 = [];

    for (const parent of itemCols) {
      const collapsed = collapsedSet.has(parent.id);
      const subtypes  = collapsed ? [] : (ITEM_SUBTYPES[parent.id] ?? []);
      const span      = collapsed ? 1 : subtypes.length + 2; // subtypes + untyped "—" + parent header col
      const isDragging = dragCol?.id === parent.id;
      const isDragOver = dragOverCol?.id === parent.id && dragCol?.id !== parent.id;

      row1.push(
        <th
          key={parent.id}
          colSpan={span}
          rowSpan={collapsed ? 2 : 1}
          draggable
          onDragStart={e => { setDragCol({ id: parent.id }); e.dataTransfer.effectAllowed = "move"; }}
          onDragOver={e => { e.preventDefault(); setDragOverCol({ id: parent.id }); }}
          onDrop={e => { e.preventDefault(); handleDrop(parent.id); setDragCol(null); setDragOverCol(null); }}
          onDragEnd={() => { setDragCol(null); setDragOverCol(null); }}
          style={{
            ...thBase,
            borderLeft: isDragOver ? "2px solid var(--fm-brass)" : "2px solid var(--fm-hairline2)",
            cursor: "grab",
            opacity: isDragging ? 0.3 : 1,
            textAlign: "center",
            width: collapsed ? COL_W : span * COL_W,
            minWidth: collapsed ? COL_W : undefined,
          }}
        >
          <div style={{ alignItems: "center", display: "flex", gap: "0.35rem", justifyContent: "center" }}>
            <button
              onClick={e => { e.stopPropagation(); toggleCollapsed(parent.id); }}
              style={{ background: "none", border: "none", color: "var(--fm-cyan)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem", lineHeight: 1, padding: "0 0.15rem" }}
              title={collapsed ? "Expand subtypes" : "Collapse subtypes"}
            >{collapsed ? "▶" : "▼"}</button>
            <span style={{ color: "var(--fm-cyan)", fontSize: "0.62rem", letterSpacing: "0.06em" }}>{parent.label}</span>
          </div>
        </th>
      );

      if (!collapsed) {
        // Row 2: subtype sub-column headers
        for (const sub of subtypes) {
          row2.push(
            <th key={`${parent.id}::${sub}`} style={{ ...thBase, borderLeft: "1px solid var(--fm-hairline)", color: "var(--fm-cyan)", fontSize: "0.55rem", opacity: 0.8, top: thBase.top }}>
              {sub}
            </th>
          );
        }
        row2.push(
          <th key={`${parent.id}::—`} style={{ ...thBase, borderLeft: "1px solid var(--fm-hairline)", color: "var(--fm-ink-dim)", fontSize: "0.55rem", opacity: 0.6 }}>
            —
          </th>
        );
      }
    }

    return { row1, row2 };
  }

  const hasExpanded = itemCols.some(p => !collapsedSet.has(p.id));
  const { row1, row2 } = renderHeaderRows();

  function renderItems(items) {
    if (!items?.length) return null;
    return (
      <ul style={{ listStyle: "disc", margin: 0, padding: "0 0 0 1.1rem" }}>
        {items.map(({ item, category }, i) => (
          <li
            key={i}
            onClick={onSelectItem ? e => { e.stopPropagation(); onSelectItem({ category, item }); } : undefined}
            style={{ color: "var(--fm-ink-dim)", cursor: onSelectItem ? "pointer" : undefined, fontFamily: "var(--fm-mono)", fontSize: "0.65rem", lineHeight: 1.6 }}
            onMouseEnter={onSelectItem ? e => { e.currentTarget.style.color = "var(--fm-ink)"; } : undefined}
            onMouseLeave={onSelectItem ? e => { e.currentTarget.style.color = "var(--fm-ink-dim)"; } : undefined}
          >{item}</li>
        ))}
      </ul>
    );
  }

  function renderSection(label, rows) {
    if (rows.length === 0) return null;
    return (
      <>
        <tr>
          <td style={{ ...sectionHeaderTd, left: 0, position: "sticky", zIndex: 1 }}>{label}</td>
          {allCols.filter(c => !c.isParent || c.isCollapsed).map(col => (
            <td key={col.id} style={{ ...sectionHeaderTd, borderLeft: col.isParent ? "2px solid var(--fm-hairline2)" : "none" }} />
          ))}
        </tr>
        {rows.map(row => (
          <tr key={row}>
            <td style={tdLabel}>{row}</td>
            {allCols.filter(c => !c.isParent || c.isCollapsed).map(col => {
              const ck = `item\x00${row}\x00${col.id}`;
              const items = derivedCells[ck] || [];
              const isParentCol = col.isParent && col.isCollapsed;
              return (
                <td
                  key={col.id}
                  style={{ ...tdCell, borderLeft: isParentCol ? "2px solid var(--fm-hairline2)" : undefined, cursor: onAddItem ? "default" : undefined }}
                  onDoubleClick={onAddItem ? () => setCellDraft({ row, isRoom: roomSet.has(row), col }) : undefined}
                  title={onAddItem ? "Double-click to add an item" : undefined}
                >
                  <div style={{ minHeight: 20 }}>{renderItems(items)}</div>
                </td>
              );
            })}
          </tr>
        ))}
      </>
    );
  }

  return (
    <div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
      <div style={{ color: "var(--fm-ink-mute)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.06em", marginBottom: "0.4rem", paddingLeft: "0.1rem" }}>
        Drag item type headers to reorder · Click ▶/▼ to expand or collapse subtypes · Double-click a cell to add an item
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: "max-content" }}>
          <thead>
            <tr>
              <th rowSpan={hasExpanded ? 2 : 1} style={{ ...thBase, cursor: "default", left: 0, minWidth: COL_W, verticalAlign: "middle", zIndex: 3 }}>
                Spatial Location
              </th>
              {row1}
            </tr>
            {hasExpanded && <tr>{row2}</tr>}
          </thead>
          <tbody>
            {renderSection("Rooms", rooms)}
            {renderSection("Exteriors", exteriors)}
          </tbody>
        </table>
      </div>

      {cellDraft && createPortal(
        <div
          onClick={e => { if (e.target === e.currentTarget) setCellDraft(null); }}
          style={{ alignItems: "center", background: "rgba(0,0,0,0.65)", bottom: 0, display: "flex", justifyContent: "center", left: 0, position: "fixed", right: 0, top: 0, zIndex: 1000 }}
        >
          <div
            style={{ background: "var(--fm-bg)", border: "1px solid var(--fm-hairline2)", borderRadius: "8px", maxWidth: "480px", padding: "1.75rem", width: "90vw" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ alignItems: "baseline", display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
              <span style={{ color: "var(--fm-brass)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.15em", textTransform: "uppercase" }}>
                Add Item
              </span>
              <button
                onClick={() => setCellDraft(null)}
                style={{ background: "none", border: "none", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "1rem", lineHeight: 1, padding: "0.1rem 0.3rem", transition: "color 0.12s" }}
                onMouseEnter={e => e.currentTarget.style.color = "var(--fm-red)"}
                onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-dim)"}
              >×</button>
            </div>
            <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", lineHeight: 1.55, margin: "0 0 1.5rem" }}>
              Adding to <strong style={{ color: "var(--fm-ink)" }}>{cellDraft.row}</strong>.
              Item type{cellDraft.col.isSubtype && !cellDraft.col.isUntyped ? " and subtype" : ""} will be set automatically.
            </p>

            {/* Category */}
            <div style={{ marginBottom: "1.1rem" }}>
              <label style={{ color: "var(--fm-ink-dim)", display: "block", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.1em", marginBottom: "0.4rem", textTransform: "uppercase" }}>
                System / Category
              </label>
              {availableCats.length === 0 ? (
                <p style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", margin: 0 }}>
                  No categories exist yet.
                </p>
              ) : (
                <select
                  value={draftCat}
                  onChange={e => setDraftCat(e.target.value)}
                  style={{ appearance: "none", background: "var(--fm-bg-panel)", border: "1px solid var(--fm-hairline2)", borderRadius: "4px", boxSizing: "border-box", color: "var(--fm-ink)", fontFamily: "var(--fm-mono)", fontSize: "0.82rem", outline: "none", padding: "0.5rem 0.75rem", width: "100%" }}
                >
                  {availableCats.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </div>

            {/* Item name */}
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ color: "var(--fm-ink-dim)", display: "block", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.1em", marginBottom: "0.4rem", textTransform: "uppercase" }}>
                Item Name
              </label>
              <input
                ref={draftNameRef}
                value={draftName}
                onChange={e => setDraftName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") commitCreate();
                  if (e.key === "Escape") setCellDraft(null);
                }}
                placeholder="e.g. Dishwasher, North Window…"
                style={{ background: "var(--fm-bg-panel)", border: "1px solid var(--fm-hairline2)", borderRadius: "4px", boxSizing: "border-box", color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.82rem", outline: "none", padding: "0.5rem 0.75rem", transition: "border-color 0.12s", width: "100%" }}
                onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
                onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"}
              />
            </div>

            {/* Pre-filled context chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "1.5rem" }}>
              {(() => {
                const col = cellDraft.col;
                const itemType = col.isSubtype ? col.parentId : col.id;
                const chips = [
                  { label: "Location", value: cellDraft.row, color: "var(--fm-cyan)" },
                  { label: "Item Type", value: itemType, color: "var(--fm-cyan)" },
                ];
                if (col.isSubtype && !col.isUntyped) {
                  chips.push({ label: "Subtype", value: col.label, color: "var(--fm-cyan)" });
                }
                return chips.map(({ label, value, color }) => (
                  <div key={label} style={{ alignItems: "center", background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline)", borderRadius: "3px", display: "flex", gap: "0.35rem", padding: "0.2rem 0.55rem" }}>
                    <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</span>
                    <span style={{ color, fontFamily: "var(--fm-mono)", fontSize: "0.68rem" }}>{value}</span>
                  </div>
                ));
              })()}
            </div>

            {/* Buttons */}
            <div style={{ display: "flex", gap: "0.6rem", justifyContent: "flex-end" }}>
              <button
                onClick={() => setCellDraft(null)}
                style={{ background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", padding: "0.45rem 1rem", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-brass-dim)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
              >Cancel</button>
              <button
                onClick={commitCreate}
                disabled={!draftName.trim()}
                style={{ background: draftName.trim() ? "#c9a96e22" : "transparent", border: `1px solid ${draftName.trim() ? "var(--fm-brass)" : "var(--fm-ink-dim)"}`, borderRadius: "3px", color: draftName.trim() ? "var(--fm-brass)" : "var(--fm-ink-dim)", cursor: draftName.trim() ? "pointer" : "default", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", letterSpacing: "0.05em", padding: "0.45rem 1.1rem", transition: "all 0.15s" }}
                onMouseEnter={e => { if (draftName.trim()) e.currentTarget.style.background = "#c9a96e35"; }}
                onMouseLeave={e => { if (draftName.trim()) e.currentTarget.style.background = "#c9a96e22"; }}
              >Add Item</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function ItemInventoryView({ categories, categoryItems, categoryTypes, entityTypeData, itemDetails, customFieldValues, onSelectItem, onAddItem, onDeleteItem, onRenameItem, onFieldChange, itemStableKeyMap }) {
  const [listUiState, setListUIState] = usePageUIState("inventory-list");
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItemCat, setNewItemCat] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [hoveredRow, setHoveredRow] = useState(null);
  const [editingRow, setEditingRow] = useState(null);
  const [editingTypeRow, setEditingTypeRow] = useState(null);
  const [editingTypeDraft, setEditingTypeDraft] = useState("");
  const [editingLocationRow, setEditingLocationRow] = useState(null);
  const [editingLocationDraft, setEditingLocationDraft] = useState("");
  const [pendingLocation, setPendingLocation] = useState(null);
  const [editingSubtypeRow, setEditingSubtypeRow] = useState(null);
  const [editingSubtypeDraft, setEditingSubtypeDraft] = useState(""); // { key, cat, item, value }
  const [editingSystemRow, setEditingSystemRow] = useState(null);
  const [editingSystemDraft, setEditingSystemDraft] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [systemFilter, _setSystemFilter] = useState(() => listUiState.systemFilter ?? "ALL");
  function setSystemFilter(v) { _setSystemFilter(v); setListUIState({ systemFilter: v }); }

  const [locationFilter, _setLocationFilter] = useState(() => listUiState.locationFilter ?? "ALL");
  function setLocationFilter(v) { _setLocationFilter(v); setListUIState({ locationFilter: v }); }

  const [levelFilter, _setLevelFilter] = useState(() => listUiState.levelFilter ?? "ALL");
  function setLevelFilter(v) { _setLevelFilter(v); setListUIState({ levelFilter: v }); }

  const [typeFilter, _setTypeFilter] = useState(() => listUiState.typeFilter ?? "ALL");
  function setTypeFilter(v) { _setTypeFilter(v); setListUIState({ typeFilter: v }); }

  const [fpData] = useState(() => loadFpData());
  const [invFloors] = useState(() => getFloorsInOrder());
  const [invRooms] = useState(() => loadRooms());

  const [sortCol, _setSortCol] = useState(() => listUiState.sortCol ?? { col: "location", dir: 1 });
  function setSortCol(v) { _setSortCol(v); setListUIState({ sortCol: v }); }

  const allRows = useMemo(() =>
    categories.flatMap(cat =>
      (categoryItems[cat] || []).map(item => ({ cat, item, key: itemStableKeyMap?.[`${cat}|${item}`] ?? `${cat}|${item}` }))
    ), [categories, categoryItems, itemStableKeyMap]);

  // Walk up parent chain to check if a typeId is rooted at "structure"
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

  const systemCats = useMemo(() => {
    return categories.filter(c => {
      const oldType = categoryTypes?.[c] || "system";
      return isFunctional(resolveTypeId(c, oldType), entityTypeData);
    }).sort();
  }, [categories, categoryTypes, entityTypeData]);

  const locationCats = useMemo(() => {
    const fromCats = categories.filter(c => isSpatial(resolveTypeId(c, categoryTypes?.[c] || "system"), entityTypeData));
    const fromLabels = Object.values(customFieldValues || {})
      .flatMap(v => [v?.roomLabel, v?.exteriorLabel]).filter(Boolean);
    return [...new Set([...fromCats, ...fromLabels])].sort();
  }, [categories, categoryTypes, entityTypeData, customFieldValues]);

  // Set of values known to be exterior — used to auto-classify location commits
  const exteriorLabelSet = useMemo(() => {
    const fromCats = categories.filter(c => isExteriorType(resolveTypeId(c, categoryTypes?.[c] || "system")));
    const fromLabels = Object.values(customFieldValues || {}).map(v => v?.exteriorLabel).filter(Boolean);
    return new Set([...fromCats, ...fromLabels]);
  }, [categories, categoryTypes, customFieldValues, isExteriorType]);

  const filtered = useMemo(() => {
    let rows = allRows;
    if (statusFilter !== "ALL") rows = rows.filter(r => getInvItemStatus(itemDetails, r.cat, r.item, r.key) === statusFilter.toLowerCase());
    if (systemFilter !== "ALL") rows = rows.filter(r => {
      if (r.cat === systemFilter) return true;
      const cf = customFieldValues?.[r.key];
      return (cf?.systemCategory || cf?.system || "") === systemFilter;
    });
    if (locationFilter !== "ALL") rows = rows.filter(r => {
      if (r.cat === locationFilter) return true;
      const cf = customFieldValues?.[r.key] || {};
      const loc = cf.roomLabel || cf.exteriorLabel || cf.room || "";
      return loc === locationFilter;
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
        cmp = (order[getInvItemStatus(itemDetails, a.cat, a.item, a.key)] ?? 3) - (order[getInvItemStatus(itemDetails, b.cat, b.item, b.key)] ?? 3);
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
      } else if (sortCol.col === "subtype") {
        cmp = (customFieldValues?.[a.key]?.item_subtype || "").localeCompare(customFieldValues?.[b.key]?.item_subtype || "") || a.item.localeCompare(b.item);
      } else if (sortCol.col === "location") {
        const cfA = customFieldValues?.[a.key] || {}, cfB = customFieldValues?.[b.key] || {};
        const la = cfA.roomLabel || cfA.exteriorLabel || cfA.room
          || (isSpatial(resolveTypeId(a.cat, categoryTypes?.[a.cat] || "system"), entityTypeData) ? a.cat : "");
        const lb = cfB.roomLabel || cfB.exteriorLabel || cfB.room
          || (isSpatial(resolveTypeId(b.cat, categoryTypes?.[b.cat] || "system"), entityTypeData) ? b.cat : "");
        cmp = la.localeCompare(lb) || a.item.localeCompare(b.item);
      } else if (sortCol.col === "system") {
        const sa = customFieldValues?.[a.key]?.system || a.cat;
        const sb = customFieldValues?.[b.key]?.system || b.cat;
        cmp = sa.localeCompare(sb) || a.item.localeCompare(b.item);
      }
      return cmp * sortCol.dir;
    });
  }, [allRows, statusFilter, systemFilter, locationFilter, levelFilter, typeFilter, fpData, invRooms, search, sortCol, itemDetails, customFieldValues]);

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
          onClick={() => {
            // Pre-select category matching the active filter, in priority order
            const defaultCat =
              (systemFilter   !== "ALL" && categories.includes(systemFilter))   ? systemFilter   :
              (locationFilter !== "ALL" && categories.includes(locationFilter)) ? locationFilter :
              categories[0] || "";
            setShowAddForm(true);
            setNewItemCat(defaultCat);
            setNewItemName("");
          }}
          style={{ background: "transparent", border: "1px solid var(--fm-ink-dim)", borderRadius: "3px", color: "var(--fm-brass-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.72rem", letterSpacing: "0.08em", padding: "0.4rem 0.9rem", transition: "all 0.15s", whiteSpace: "nowrap" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-ink-dim)"; e.currentTarget.style.color = "var(--fm-brass-dim)"; }}
        >+ ADD ITEM</button>
      </div>

      {/* Inline add form */}
      {showAddForm && (() => {
        function commitAdd() {
          if (!newItemName.trim()) return;
          const stableKey = onAddItem?.(newItemCat, newItemName);
          if (stableKey && onFieldChange) {
            const catTypeId = resolveTypeId(newItemCat, categoryTypes?.[newItemCat] || "system");
            if (typeFilter !== "ALL")
              onFieldChange(newItemCat, newItemName, "item_type", typeFilter, stableKey);
            if (locationFilter !== "ALL" && !isSpatial(catTypeId, entityTypeData)) {
              const field = isExteriorType(resolveTypeId(locationFilter, "system")) ? "exteriorLabel" : "roomLabel";
              onFieldChange(newItemCat, newItemName, field, locationFilter, stableKey);
            }
          }
          setShowAddForm(false);
        }
        return (
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
              if (e.key === "Enter") commitAdd();
              if (e.key === "Escape") setShowAddForm(false);
            }}
            placeholder="Item name…"
            style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: "3px", color: "var(--fm-ink)", flex: 1, fontFamily: "var(--fm-sans)", fontSize: "0.78rem", outline: "none", padding: "0.35rem 0.6rem" }}
            onFocus={e => e.currentTarget.style.borderColor = "var(--fm-brass)"}
            onBlur={e => e.currentTarget.style.borderColor = "var(--fm-hairline2)"}
          />
          <button
            onClick={commitAdd}
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
        );
      })()}

      {/* Filter pills */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginBottom: "0.6rem" }}>
        <FilterRow label="Status">
          <FilterDropdown
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "ALL",     label: "All" },
              { value: "ACTIVE",  label: "Active",  color: "var(--fm-green)" },
              { value: "PARTIAL", label: "Partial", color: "var(--fm-amber)" },
              { value: "EMPTY",   label: "Empty" },
            ]}
          />
        </FilterRow>
        <FilterRow label="Systems">
          <FilterDropdown
            value={systemFilter}
            onChange={setSystemFilter}
            options={[{ value: "ALL", label: "All" }, ...systemCats.map(cat => ({ value: cat, label: cat }))]}
          />
        </FilterRow>
        <FilterRow label="Location" hidden={locationCats.length === 0}>
          <FilterDropdown
            value={locationFilter}
            onChange={setLocationFilter}
            options={[{ value: "ALL", label: "All" }, ...locationCats.map(cat => ({ value: cat, label: cat }))]}
          />
        </FilterRow>
        <FilterRow label="Level">
          <FilterDropdown
            value={levelFilter}
            onChange={setLevelFilter}
            options={[{ value: "ALL", label: "All" }, ...invFloors.map(lvl => ({ value: lvl.id, label: lvl.label }))]}
          />
        </FilterRow>
        <FilterRow label="Type">
          <FilterDropdown
            value={typeFilter}
            onChange={setTypeFilter}
            options={[{ value: "ALL", label: "All" }, ...[...new Set(allRows.map(r => customFieldValues?.[r.key]?.item_type).filter(Boolean))].sort().map(t => ({ value: t, label: t }))]}
          />
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
              { label: "Subtype",      col: "subtype",      width: "120px" },
              { label: "Location",     col: "location",     width: "160px" },
              { label: "Item",         col: "item",         width: "200px" },
              { label: "Manufacturer", col: "manufacturer", width: "160px" },
              { label: "Model",        col: "model",        width: "160px" },
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
            const status = getInvItemStatus(itemDetails, cat, item, key);
            const { color, label } = INV_STATUS_META[status];
            const existingTypes = [...new Set(Object.values(customFieldValues || {}).map(v => v?.item_type).filter(Boolean))].sort();
            const typeListId = `itypes-${key}`;
            // Determine behavioral class for this item's own category
            const catOldType = categoryTypes?.[cat] || "system";
            const catTypeId = resolveTypeId(cat, catOldType);
            const catIsSpatial = isSpatial(catTypeId, entityTypeData);
            const catIsFunctional = isFunctional(catTypeId, entityTypeData);

            const cfVals = customFieldValues?.[key] || {};
            const resolvedLocation = cfVals.roomLabel || cfVals.exteriorLabel || cfVals.room
              || (catIsSpatial ? cat : "");

            // System: if item's category is already Functional, the category IS the system (read-only)
            // Otherwise, user picks which Functional category this item belongs to
            const resolvedSystem = catIsFunctional
              ? cat
              : (customFieldValues?.[key]?.systemCategory || customFieldValues?.[key]?.system || "");
            const systemOptions = systemCats; // Functional categories
            const systemListId = `isys-${key}`;
            const isHov = hoveredRow === key;
            // Single-click the row opens the item detail panel; inline-editor
            // cells and the action buttons stopPropagation so they keep working.
            return (
              <tr key={key} style={{ borderBottom: "1px solid var(--fm-hairline)", cursor: "pointer" }}
                onClick={() => onSelectItem?.({ category: cat, item })}
                title="Click to view item details"
                onMouseEnter={() => setHoveredRow(key)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                <td style={{ padding: "0.45rem 0.5rem", verticalAlign: "middle" }}>
                  <div style={{ alignItems: "center", display: "flex", gap: "0.4rem" }}>
                    <span style={{ background: color, borderRadius: "50%", display: "inline-block", flexShrink: 0, height: 7, width: 7 }} />
                    <span style={{ color, fontFamily: "var(--fm-mono)", fontSize: "0.67rem", letterSpacing: "0.06em" }}>{label}</span>
                  </div>
                </td>
                <td style={{ padding: "0.45rem 0.5rem", verticalAlign: "middle" }} onClick={e => e.stopPropagation()}>
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
                <td style={{ padding: "0.45rem 0.5rem", verticalAlign: "middle" }} onClick={e => e.stopPropagation()}>
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
                <td style={{ padding: "0.45rem 0.5rem", verticalAlign: "middle" }} onClick={e => e.stopPropagation()}>
                  {editingSubtypeRow === key ? (
                    <ComboInput
                      autoFocus
                      value={editingSubtypeDraft}
                      onChange={v => setEditingSubtypeDraft(v)}
                      onBlur={() => { onFieldChange?.(cat, item, "item_subtype", editingSubtypeDraft.trim() || null); setEditingSubtypeRow(null); }}
                      onKeyDown={e => {
                        if (e.key === "Enter") { onFieldChange?.(cat, item, "item_subtype", editingSubtypeDraft.trim() || null); setEditingSubtypeRow(null); }
                        if (e.key === "Escape") setEditingSubtypeRow(null);
                      }}
                      options={ITEM_SUBTYPES[customFieldValues?.[key]?.item_type] ?? []}
                      style={{ border: "1px solid var(--fm-brass)", fontSize: "0.67rem", padding: "0.15rem 0.3rem" }}
                    />
                  ) : (
                    <span
                      style={{ color: customFieldValues?.[key]?.item_subtype ? "var(--fm-ink-dim)" : "var(--fm-hairline2)", cursor: "text", display: "block", fontFamily: "var(--fm-mono)", fontSize: "0.67rem", letterSpacing: "0.06em", minHeight: "1.2em", minWidth: "2rem", textTransform: "uppercase" }}
                      onDoubleClick={() => { setEditingSubtypeDraft(customFieldValues?.[key]?.item_subtype || ""); setEditingSubtypeRow(key); }}
                      title="Double-click to set subtype"
                    >
                      {customFieldValues?.[key]?.item_subtype || "—"}
                    </span>
                  )}
                </td>
                <td style={{ padding: "0.45rem 0.5rem", verticalAlign: "middle" }} onClick={e => e.stopPropagation()}>
                  {editingLocationRow === key ? (
                    <ComboInput
                      autoFocus
                      value={editingLocationDraft}
                      onChange={v => setEditingLocationDraft(v)}
                      onBlur={() => {
                        const v = editingLocationDraft.trim() || null;
                        if (!v) { onFieldChange?.(cat, item, "roomLabel", null); onFieldChange?.(cat, item, "exteriorLabel", null); setEditingLocationRow(null); return; }
                        if (exteriorLabelSet.has(v)) { onFieldChange?.(cat, item, "exteriorLabel", v); setEditingLocationRow(null); }
                        else if (locationCats.includes(v)) { onFieldChange?.(cat, item, "roomLabel", v); setEditingLocationRow(null); }
                        else { setPendingLocation({ key, cat, item, value: v }); setEditingLocationRow(null); }
                      }}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          const v = editingLocationDraft.trim() || null;
                          if (!v) { onFieldChange?.(cat, item, "roomLabel", null); onFieldChange?.(cat, item, "exteriorLabel", null); setEditingLocationRow(null); return; }
                          if (exteriorLabelSet.has(v)) { onFieldChange?.(cat, item, "exteriorLabel", v); setEditingLocationRow(null); }
                          else if (locationCats.includes(v)) { onFieldChange?.(cat, item, "roomLabel", v); setEditingLocationRow(null); }
                          else { setPendingLocation({ key, cat, item, value: v }); setEditingLocationRow(null); }
                        }
                        if (e.key === "Escape") setEditingLocationRow(null);
                      }}
                      options={locationCats}
                      style={{ border: "1px solid var(--fm-brass)", fontSize: "0.78rem", padding: "0.15rem 0.4rem" }}
                    />
                  ) : pendingLocation?.key === key ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                      <span style={{ color: "var(--fm-ink)", fontFamily: "var(--fm-sans)", fontSize: "0.78rem" }}>{pendingLocation.value}</span>
                      <div style={{ display: "flex", gap: "0.35rem" }}>
                        <button
                          onClick={() => { onFieldChange?.(cat, item, "roomLabel", pendingLocation.value); setPendingLocation(null); }}
                          style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: 3, color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.08em", padding: "0.15rem 0.45rem", textTransform: "uppercase" }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
                        >Rooms</button>
                        <button
                          onClick={() => { onFieldChange?.(cat, item, "exteriorLabel", pendingLocation.value); setPendingLocation(null); }}
                          style={{ background: "var(--fm-bg-sunk)", border: "1px solid var(--fm-hairline2)", borderRadius: 3, color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.58rem", letterSpacing: "0.08em", padding: "0.15rem 0.45rem", textTransform: "uppercase" }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
                        >Exteriors</button>
                        <button
                          onClick={() => setPendingLocation(null)}
                          style={{ background: "none", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", padding: "0 0.1rem" }}
                        >×</button>
                      </div>
                    </div>
                  ) : (
                    <span
                      style={{ color: resolvedLocation ? "var(--fm-ink-dim)" : "var(--fm-hairline2)", cursor: "text", display: "block", fontFamily: "var(--fm-sans)", fontSize: "0.78rem", minHeight: "1.2em", minWidth: "2rem" }}
                      onDoubleClick={() => { setEditingLocationDraft(resolvedLocation || ""); setEditingLocationRow(key); }}
                      title="Double-click to set location"
                    >
                      {resolvedLocation || "—"}
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
                <td style={{ padding: "0.45rem 0.25rem", textAlign: "center", verticalAlign: "middle" }} onClick={e => e.stopPropagation()}>
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
              <td colSpan={9} style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.75rem", padding: "2rem 0.5rem", textAlign: "center" }}>
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
  const isMobile = useIsMobile();
  const [rows, setRows] = useState(() => loadData());
  const [deletedCategories, setDeletedCategories] = useState(() => loadDeletedCategories());
  const [deletedItems, setDeletedItems] = useState(() => loadDeletedItems());
  const [deletePrompt, setDeletePrompt] = useState(null); // { category, itemCount, taskCount, isDefault } | { category, item, taskCount, isDefault }
  const [newItemIds, setNewItemIds] = useState(() => new Set());
  const [editingCategoryName, setEditingCategoryName] = useState(null);
  const [editingItemName, setEditingItemName] = useState(null); // { category, item }
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
      if (deletedItems.has(getItemStableKey(row))) return;
      if (!map[row.category]) map[row.category] = [];
      if (!map[row.category].includes(row.item)) map[row.category].push(row.item);
    });
    return map;
  }, [rows, deletedCategories, deletedItems]);

  const CATEGORIES = Object.keys(CATEGORY_ITEMS);

  const itemStableKeyMap = useMemo(() => {
    const map = {};
    rows.forEach(r => {
      if (r.category && r.item) {
        const nameKey = `${r.category}|${r.item}`;
        if (!(nameKey in map)) map[nameKey] = getItemStableKey(r);
      }
    });
    return map;
  }, [rows]);

  // Reverse of itemStableKeyMap: stableKey → { category, item }
  const reverseItemKeyMap = useMemo(() => {
    const map = {};
    rows.forEach(r => {
      if (r.category && r.item) {
        const stableKey = getItemStableKey(r);
        if (!(stableKey in map)) map[stableKey] = { category: r.category, item: r.item };
      }
    });
    return map;
  }, [rows]);

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
  const [uiState, setUIState] = usePageUIState("inventory");
  const [activeTab, _setActiveTab] = useState(() => uiState.activeTab ?? "Item List");
  function setActiveTab(v) { _setActiveTab(v); setUIState({ activeTab: v }); }
  // Internal tab keys (kept stable for the logic below) mapped to display labels.
  const INV_TAB_KEYS = ["Item List", "Overview", "Outline"];
  const INV_TAB_LABEL = { "Item List": "List View", "Overview": "Table View", "Outline": "Outline View" };
  const [customGroupTypes, setCustomGroupTypes] = useState(() => loadCustomGroupTypes());
  const [groupLabelOverrides, setGroupLabelOverrides] = useState(() => loadGroupLabelOverrides());
  const [groupFilter, _setGroupFilter] = useState(() => uiState.groupFilter ?? "all");
  function setGroupFilter(v) { _setGroupFilter(v); setUIState({ groupFilter: v }); }
  const [deleteGroupPrompt, setDeleteGroupPrompt] = useState(null);


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
  const headerRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [todos, setTodos] = useState(() => loadTodos());
  const projects = useForemanStore(s => s.projects);
  const [deletedRows, setDeletedRows] = useState(() => loadDeletedRows());
  const [nextDatesMap, setNextDatesMapInv] = useState(() => storageGet("maintenance-next-dates") ?? {});
  const [itemFieldSchemas, setItemFieldSchemas] = useState(() => loadItemFieldSchemas());
  const _spatialAssignments = useForemanStore(s => s.spatialAssignments);
  const _itemFieldValues    = useForemanStore(s => s.itemFieldValues);
  const customFieldValues   = useMemo(() => {
    const out = {};
    const keys = new Set([...Object.keys(_spatialAssignments), ...Object.keys(_itemFieldValues)]);
    keys.forEach(k => {
      out[k] = { ...(_spatialAssignments[k] || {}), ...(_itemFieldValues[k] || {}) };
    });
    return out;
  }, [_spatialAssignments, _itemFieldValues]);
  const selectedItemKey   = useForemanStore(s => s.selectedItemKey);
  const [roomSubtypes, setRoomSubtypes] = useState(() => loadRoomSubtypes());
  const entityTypeData = useForemanStore(s => s.entityTypes);
  const lifespanOverrides = useForemanStore(s => s.lifespanOverrides); // type-level default lifespans
  function refreshEntityTypes() { useForemanStore.getState().setEntityTypes(loadEntityTypes()); }

  // Wrapper around setSelectedItem that enriches the selection with a stable key
  // so the detail panel can look up customFieldValues / itemDetails by ID, not name.
  function handleSelectItem(spec) {
    const r = rows.find(rr => rr._isCustom && rr.category === spec.category && rr.item === spec.item)
           ?? rows.find(rr => rr.category === spec.category && rr.item === spec.item);
    setSelectedItem({ ...spec, stableKey: r ? getItemStableKey(r) : `${spec.category}|${spec.item}` });
  }

  // When another page calls openItemDetail(stableKey) and navigates here, auto-open the panel.
  useEffect(() => {
    if (!selectedItemKey) return;
    const ref = reverseItemKeyMap[selectedItemKey];
    if (ref) {
      handleSelectItem({ category: ref.category, item: ref.item });
    } else {
      const [cat, ...parts] = selectedItemKey.split("|");
      if (cat && parts.length) handleSelectItem({ category: cat, item: parts.join("|") });
    }
    useForemanStore.getState().closeItemDetail();
  }, [selectedItemKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const itemCoverageMap = useMemo(() => {
    const map = {};
    rows.forEach(row => {
      if (row._isBlankCategory || !row.category || !row.item || !row.task) return;
      if (!row._isCustom && deletedCategories.has(row.category)) return;
      if (deletedItems.has(getItemStableKey(row))) return;
      const drKey = `${row.category}|${row.item}|${row.task}`;
      if (deletedRows.has(drKey)) return;
      const itemKey = `${row.category}|${row.item}`;
      if (!map[itemKey]) map[itemKey] = { total: 0, unscheduled: 0 };
      map[itemKey].total++;
      if (!row.schedule && !nextDatesMap[drKey]) map[itemKey].unscheduled++;
    });
    return map;
  }, [rows, deletedCategories, deletedItems, deletedRows, nextDatesMap]);

  function handleCustomFieldValueChange(category, item, fieldId, value, stableKey = null) {
    let key = stableKey;
    if (!key) {
      const row = rows.find(r => r._isCustom && r.category === category && r.item === item)
               ?? rows.find(r => r.category === category && r.item === item);
      key = row ? getItemStableKey(row) : `${category}|${item}`;
    }
    useForemanStore.getState().setCustomField(key, fieldId, value);
  }


  function reload() {
    setRows(loadData());
  }

  // Migrate legacy itemDetails entries to customFieldValues + itemFieldSchemas
  useEffect(() => {
    const legacyDetails = loadItemDetails();
    if (!legacyDetails || Object.keys(legacyDetails).length === 0) return;
    const existingValues = loadItemFieldValues();
    const existingSchemas = loadItemFieldSchemas();
    let valuesChanged = false;
    let schemasChanged = false;
    Object.entries(legacyDetails).forEach(([rawKey, details]) => {
      if (!details || typeof details !== "object") return;
      // Normalize "HVAC::Furnace" → "default:HVAC|Furnace" so lookup keys agree
      const dIdx = rawKey.indexOf("::");
      const cfKey = dIdx >= 0 ? `default:${rawKey.slice(0, dIdx)}|${rawKey.slice(dIdx + 2)}` : rawKey;
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
    if (valuesChanged) { saveItemFieldValues(existingValues); useForemanStore.getState().reloadAll(); }
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
    const row = rows.find(r => r._isCustom && r.category === category && r.item === item)
             ?? rows.find(r => r.category === category && r.item === item);
    const key = row ? getItemStableKey(row) : `${category}|${item}`;
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
      // Resolve the stable key for this item
      const targetRow = rows.find(r => r._isCustom && r.category === category && r.item === item)
                     ?? rows.find(r => r.category === category && r.item === item);
      const stableKey = targetRow ? getItemStableKey(targetRow) : `${category}|${item}`;

      if (isDefault) {
        const next = new Set([...deletedItems, stableKey]);
        saveDeletedItems(next);
        setDeletedItems(next);
      }
      const customs = loadCustomData();
      // For custom items: filter by _id to avoid hitting a same-named custom item
      if (targetRow?._isCustom && targetRow?._id) {
        saveCustomData(customs.filter(r => r._id !== targetRow._id));
      } else {
        saveCustomData(customs.filter(r => !(r.category === category && r.item === item)));
      }

      // Clear from lookup stores by stable key
      const sp = loadSpatialAssignments();
      const spHad = stableKey in sp;
      if (spHad) { delete sp[stableKey]; saveSpatialAssignments(sp); }
      const ifv = loadItemFieldValues();
      const ifvHad = stableKey in ifv;
      if (ifvHad) { delete ifv[stableKey]; saveItemFieldValues(ifv); }
      if (spHad || ifvHad) useForemanStore.getState().reloadAll();
      const detailsMap = loadItemDetails();
      if (detailsMap[stableKey] !== undefined) { delete detailsMap[stableKey]; saveItemDetails(detailsMap); setItemDetails(detailsMap); }

      const fpD = loadFpData();
      const targetKey = `${category}|${item}`;
      let fpChanged = false;
      const updatedFpDrawings = Object.fromEntries(
        Object.entries(fpD.drawings || {}).map(([lvlId, drawings]) => [
          lvlId,
          drawings.map(dr => {
            if (dr.inventoryItemKey === targetKey) { fpChanged = true; const { inventoryItemKey, ...rest } = dr; return rest; }
            return dr;
          })
        ])
      );
      if (fpChanged) saveFpData({ ...fpD, drawings: updatedFpDrawings });

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
      const chores = useForemanStore.getState().chores;
      const updatedChores = chores.map(c => c.room === category ? { ...c, room: null, roomId: null } : c);
      if (updatedChores.some((c, i) => c !== chores[i])) useForemanStore.getState().setChores(updatedChores);

      const todos = loadTodos();
      const updatedTodos = todos.map(t => {
        const updates = {};
        if (t.linkedRoom === category) updates.linkedRoom = null;
        if (t.linkedSystem === category) updates.linkedSystem = null;
        if (t.linkedCategory === category) updates.linkedCategory = null;
        return Object.keys(updates).length ? { ...t, ...updates } : t;
      });
      if (updatedTodos.some((t, i) => t !== todos[i])) saveTodos(updatedTodos);

      const currentProjects = useForemanStore.getState().projects;
      const updatedProjects = currentProjects.map(p => {
        const updates = {};
        if (p.linkedRoom === category) updates.linkedRoom = null;
        if (p.linkedSystem === category) updates.linkedSystem = null;
        return Object.keys(updates).length ? { ...p, ...updates } : p;
      });
      if (updatedProjects.some((p, i) => p !== currentProjects[i])) useForemanStore.getState().setProjects(updatedProjects);

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
    const etData = useForemanStore.getState().entityTypes;
    const typeId = resolveTypeId(oldName, effectiveCategoryTypes[oldName] || "system");
    const isRoomRename = isSpatial(typeId, etData);

    const storeChores = useForemanStore.getState().chores;
    const updatedChores = storeChores.map(c => c.room === oldName ? { ...c, room: trimmed } : c);
    if (updatedChores.some((c, i) => c.room !== storeChores[i].room)) useForemanStore.getState().setChores(updatedChores);

    const todos = loadTodos();
    const updatedTodos = todos.map(t => {
      if (isRoomRename && t.linkedRoom === oldName) return { ...t, linkedRoom: trimmed };
      if (!isRoomRename && t.linkedSystem === oldName) return { ...t, linkedSystem: trimmed };
      if (t.linkedCategory === oldName) return { ...t, linkedCategory: trimmed };
      return t;
    });
    if (updatedTodos.some((t, i) => t !== todos[i])) saveTodos(updatedTodos);

    const storeProjects = useForemanStore.getState().projects;
    const updatedProjects = storeProjects.map(p => {
      if (isRoomRename && p.linkedRoom === oldName) return { ...p, linkedRoom: trimmed };
      if (!isRoomRename && p.linkedSystem === oldName) return { ...p, linkedSystem: trimmed };
      return p;
    });
    if (updatedProjects.some((p, i) => p !== storeProjects[i])) useForemanStore.getState().setProjects(updatedProjects);

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

    // For custom items the stable key is _id — unchanged by rename, no re-keying needed.
    // For default items the stable key encodes the name, so we must re-key.
    const renamedRow = rows.find(r => r._isCustom && r.category === category && r.item === oldName)
                    ?? rows.find(r => r.category === category && r.item === oldName);
    const isCustomItem = renamedRow?._isCustom;

    if (!isCustomItem) {
      const oldKey = `default:${category}|${oldName}`;
      const newKey = `default:${category}|${trimmed}`;

      const details = loadItemDetails();
      if (details[oldKey] !== undefined) { details[newKey] = details[oldKey]; delete details[oldKey]; saveItemDetails(details); setItemDetails(details); }

      const sp = loadSpatialAssignments();
      const ifv = loadItemFieldValues();
      let rekey = false;
      if (oldKey in sp)  { sp[newKey]  = sp[oldKey];  delete sp[oldKey];  saveSpatialAssignments(sp);  rekey = true; }
      if (oldKey in ifv) { ifv[newKey] = ifv[oldKey]; delete ifv[oldKey]; saveItemFieldValues(ifv);    rekey = true; }
      if (rekey) useForemanStore.getState().reloadAll();

      const cfSchemas = loadItemFieldSchemas();
      if (cfSchemas[oldKey] !== undefined) { cfSchemas[newKey] = cfSchemas[oldKey]; delete cfSchemas[oldKey]; saveItemFieldSchemas(cfSchemas); setItemFieldSchemas(cfSchemas); }
    }

    const oldPrefix = `${category}|${oldName}|`;
    const newDels = new Set([...deletedRows].map(k => k.startsWith(oldPrefix) ? `${category}|${trimmed}|${k.slice(oldPrefix.length)}` : k));
    saveDeletedRows(newDels);
    setDeletedRows(newDels);

    const nextTodos = todos.map(t => t.linkedCategory === category && t.linkedItem === oldName ? { ...t, linkedItem: trimmed } : t);
    setTodos(nextTodos);
    saveTodos(nextTodos);

    if (selectedItem?.category === category && selectedItem?.item === oldName) handleSelectItem({ category, item: trimmed });

    const fpD = loadFpData();
    const oldFpKey = `${category}|${oldName}`;
    const newFpKey = `${category}|${trimmed}`;
    let fpChanged = false;
    const updatedFpDrawings = Object.fromEntries(
      Object.entries(fpD.drawings || {}).map(([lvlId, drawings]) => [
        lvlId,
        drawings.map(dr => {
          if (dr.inventoryItemKey === oldFpKey) { fpChanged = true; return { ...dr, name: trimmed, inventoryItemKey: newFpKey }; }
          return dr;
        })
      ])
    );
    if (fpChanged) saveFpData({ ...fpD, drawings: updatedFpDrawings });

    reload();
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
    const allChores = useForemanStore.getState().chores;
    const choreCount = allChores.filter(c => cats.includes(c.room)).length;
    const allTodos = loadTodos();
    const todoCount = allTodos.filter(t => cats.includes(t.linkedCategory)).length;
    const allProjects = useForemanStore.getState().projects;
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
    if (!trimmed || !category) return null;
    const newId = `custom-${Date.now()}`;
    const customs = loadCustomData();
    saveCustomData([...customs, {
      _id: newId, _isCustom: true, _defaultKey: null,
      category, item: trimmed, task: "", schedule: "", season: null,
    }]);
    reload();
    // Snapshot the item type's current default lifespan onto the new item, so later
    // changes to the default don't retroactively alter this item. Editing the item's
    // lifespan (details or forecast) overrides this snapshot; clearing it falls back
    // to the type default again.
    const def = expectedYears(trimmed, useForemanStore.getState().lifespanOverrides);
    if (def != null) useForemanStore.getState().setCustomField(newId, "estimated_lifespan", String(def));
    return newId; // stable key for custom items is their _id
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
              const itemRow = rows.find(r => r._isCustom && r.category === category && r.item === item)
                           ?? rows.find(r => r.category === category && r.item === item);
              const itemStableKey = itemRow ? getItemStableKey(itemRow) : `${category}|${item}`;
              const isSelected = selectedItem?.category === category && selectedItem?.item === item;
              const details = itemDetails[itemStableKey] || itemDetails[`${category}|${item}`] || {};
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
                          onClick={e => { e.stopPropagation(); handleSelectItem({ category, item }); }}
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
      height: isMobile ? MOBILE_SHELL_HEIGHT : "100vh",
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


      <FmHeader active="Inventory" tagline="Inventory" />
      <FmSubnav
        tabs={INV_TAB_KEYS.map(k => INV_TAB_LABEL[k])}
        active={INV_TAB_LABEL[activeTab]}
        onTabChange={label => { const key = INV_TAB_KEYS.find(k => INV_TAB_LABEL[k] === label); if (key) { setActiveTab(key); setGroupFilter("all"); } }}
        stats={[
          { value: totalItems, label: "items" },
          { value: systemCatCount, label: "systems" },
          { value: roomCatCount, color: "var(--fm-cyan)", label: "rooms" },
        ]}
      />

      <div style={{ display: "flex", flex: 1, flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", flex: 1, gap: "2rem", overflow: "hidden", padding: "0.75rem 2rem 0" }}>
        <div style={(activeTab === "Overview" && !selectedItem) ? { display: "flex", flex: 1, flexDirection: "column", minWidth: 0, overflow: "hidden" } : (activeTab === "Overview" || activeTab === "Outline") ? { display: "flex", flex: "0 0 75%", flexDirection: "column", minWidth: 0, overflow: "hidden" } : { flex: "0 0 75%", minWidth: 0, overflowY: "auto", paddingBottom: "4rem", scrollbarGutter: "stable" }}>

        {activeTab === "Item List" ? (
          <ItemInventoryView
            categories={CATEGORIES}
            categoryItems={CATEGORY_ITEMS}
            categoryTypes={effectiveCategoryTypes}
            entityTypeData={entityTypeData}
            itemDetails={itemDetails}
            onSelectItem={handleSelectItem}
            customFieldValues={customFieldValues}
            onAddItem={handleAddItemNamed}
            onDeleteItem={handleItemDeleteClick}
            onRenameItem={handleItemRename}
            onFieldChange={handleCustomFieldValueChange}
            itemStableKeyMap={itemStableKeyMap}
          />
        ) : null}


        {activeTab === "Outline" && (
          <OutlineTab categories={CATEGORIES} categoryTypes={effectiveCategoryTypes} categoryItems={CATEGORY_ITEMS} entityTypeData={entityTypeData} onRefreshEntityTypes={refreshEntityTypes} onCreateCategory={handleAddCategoryDirect} onAddItem={handleAddItemNamed} onSelectItem={handleSelectItem} customFieldValues={customFieldValues} reverseItemKeyMap={reverseItemKeyMap} onDeleteCategory={handleDeleteClick} onRenameCategory={handleCategoryRename} />
        )}

        {activeTab === "Overview" && (
          <OverviewTab
            rooms={CATEGORIES.filter(c => {
              const tid = resolveTypeId(c, effectiveCategoryTypes[c] || "system");
              return isSpatial(tid, entityTypeData) && !isExteriorTypeUtil(tid, entityTypeData);
            }).sort()}
            exteriors={CATEGORIES.filter(c => {
              const tid = resolveTypeId(c, effectiveCategoryTypes[c] || "system");
              return isExteriorTypeUtil(tid, entityTypeData);
            }).sort()}
            categories={CATEGORIES}
            customFieldValues={customFieldValues}
            reverseItemKeyMap={reverseItemKeyMap}
            effectiveCategoryTypes={effectiveCategoryTypes}
            entityTypeData={entityTypeData}
            onAddItem={handleAddItemNamed}
            onFieldChange={handleCustomFieldValueChange}
            onSelectItem={handleSelectItem}
            onCreated={(cat, name) => {
              handleSelectItem({ category: cat, item: name });
            }}
          />
        )}

        </div>

        {(activeTab !== "Overview" || selectedItem) && (
          <ItemDetailPanel
            selectedItem={selectedItem}
            onClose={() => setSelectedItem(null)}
            navigate={navigate}
            showClose={activeTab === "Overview"}
            onMaintenanceChanged={reload}
          />
        )}
        </div>{/* end content row */}
      </div>
    </div>
  );
}
