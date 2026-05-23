import { useState, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { getFloorsInOrder } from "../lib/floors.js";
import { loadRooms } from "../lib/rooms.js";
import { polygonCentroid, pointInPolygon } from "../lib/geometry.js";

const FP_W = 2000;
const FP_H = 1360;
const FP_GRID = 20;

const FP_FILL = {
  room:      "rgba(122,181,217,0.15)",
  outdoor:   "rgba(150,190,130,0.15)",
  utility:   "rgba(197,164,102,0.15)",
};
const FP_STROKE = {
  room:      "rgba(122,181,217,0.7)",
  outdoor:   "rgba(150,190,130,0.7)",
  utility:   "rgba(197,164,102,0.7)",
};

function fpSnap(v) { return Math.round(v / FP_GRID) * FP_GRID; }

function detectZone(x, y, placements, levelId) {
  const lvlPlacements = placements?.[levelId] || {};
  for (const [roomId, zonePoly] of Object.entries(lvlPlacements)) {
    if (zonePoly.points?.length >= 3 && pointInPolygon({ x, y }, zonePoly.points)) return roomId;
  }
  return null;
}

export default function LocationPickerModal({ initialLocation, onConfirm, onCancel }) {
  const floors = useMemo(() => getFloorsInOrder(), []);
  const allRooms = useMemo(() => loadRooms(), []);
  const fpData = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("inventory-floor-plan-v2") || "{}"); }
    catch { return {}; }
  }, []);

  const floorsWithZones = useMemo(
    () => floors.filter(f => Object.keys(fpData.placements?.[f.id] || {}).length > 0),
    [floors, fpData]
  );

  const initialFloor = initialLocation?.levelId
    ? (floorsWithZones.find(f => f.id === initialLocation.levelId) || floorsWithZones[0] || floors[0])
    : (floorsWithZones[0] || floors[0]);

  const [activeLevel, setActiveLevel] = useState(initialFloor?.id || null);
  const [markerPos, setMarkerPos] = useState(
    initialLocation?.x != null ? { x: initialLocation.x, y: initialLocation.y } : null
  );
  const [detectedZone, setDetectedZone] = useState(initialLocation?.zone || null);
  const svgRef = useRef(null);

  const currentPlacements = fpData.placements?.[activeLevel] || {};
  const hasZones = Object.keys(currentPlacements).length > 0;

  function handleSvgClick(e) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const rawX = (e.clientX - rect.left) / rect.width * FP_W;
    const rawY = (e.clientY - rect.top) / rect.height * FP_H;
    const x = fpSnap(Math.max(0, Math.min(FP_W, rawX)));
    const y = fpSnap(Math.max(0, Math.min(FP_H, rawY)));
    const zone = detectZone(x, y, fpData.placements, activeLevel);
    setMarkerPos({ x, y });
    setDetectedZone(zone);
  }

  function handleLevelChange(levelId) {
    setActiveLevel(levelId);
    setMarkerPos(null);
    setDetectedZone(null);
  }

  const activeFloor = floors.find(f => f.id === activeLevel);
  const detectedRoom = detectedZone ? allRooms[detectedZone] : null;

  const zoneLabel = detectedRoom
    ? `${detectedRoom.label} · ${activeFloor?.label || ""}`
    : markerPos
      ? `Outside any zone · ${activeFloor?.label || ""}`
      : null;

  const noZonesMsg = floorsWithZones.length === 0
    ? "No floor plan zones drawn yet. Draw zones on the Floor Plan tab first."
    : !hasZones
      ? "No zones on this floor. Select another floor or draw zones on the Floor Plan tab."
      : null;

  return createPortal(
    <div
      onClick={onCancel}
      style={{
        alignItems: "center", background: "rgba(0,0,0,0.75)", bottom: 0,
        display: "flex", justifyContent: "center", left: 0,
        position: "fixed", right: 0, top: 0, zIndex: 1200,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--fm-bg-panel)", border: "1px solid var(--fm-hairline2)",
          borderRadius: "var(--fm-radius-lg)", boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          display: "flex", flexDirection: "column", maxHeight: "88vh",
          padding: "1.25rem", width: "min(680px, 94vw)",
        }}
      >
        {/* Header */}
        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: "0.85rem" }}>
          <span style={{ color: "var(--fm-ink-dim)", fontFamily: "var(--fm-mono)", fontSize: "0.62rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>
            Set Floor Plan Location
          </span>
          <button
            onClick={onCancel}
            style={{ background: "none", border: "none", color: "var(--fm-ink-mute)", cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "1rem", lineHeight: 1, padding: "0 0.2rem" }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--fm-ink)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--fm-ink-mute)"}
          >×</button>
        </div>

        {/* Level selector */}
        {floors.length > 1 && (
          <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
            {floors.map(f => (
              <button
                key={f.id}
                onClick={() => handleLevelChange(f.id)}
                style={{
                  background: activeLevel === f.id ? "var(--fm-brass-bg)" : "transparent",
                  border: activeLevel === f.id ? "1px solid rgba(201,169,110,0.4)" : "1px solid var(--fm-hairline)",
                  borderRadius: "var(--fm-radius)",
                  color: activeLevel === f.id ? "var(--fm-brass)" : "var(--fm-ink-dim)",
                  cursor: "pointer", fontFamily: "var(--fm-mono)", fontSize: "0.65rem",
                  letterSpacing: "0.06em", padding: "0.2rem 0.6rem", transition: "all 0.12s",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* SVG picker */}
        <div style={{ background: "var(--fm-bg-sunk)", borderRadius: "var(--fm-radius)", flex: 1, minHeight: 0, overflow: "hidden", position: "relative" }}>
          {noZonesMsg ? (
            <div style={{ alignItems: "center", color: "var(--fm-ink-mute)", display: "flex", fontFamily: "var(--fm-sans)", fontSize: "0.75rem", fontStyle: "italic", height: "100%", justifyContent: "center", minHeight: 200, padding: "1rem", textAlign: "center" }}>
              {noZonesMsg}
            </div>
          ) : (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${FP_W} ${FP_H}`}
              style={{ cursor: "crosshair", display: "block", height: "auto", maxHeight: "55vh", width: "100%" }}
              onClick={handleSvgClick}
            >
              <rect width={FP_W} height={FP_H} fill="var(--fm-bg-sunk)" />

              {Object.entries(currentPlacements).map(([roomId, zonePoly]) => {
                const room = allRooms[roomId];
                if (!zonePoly.points?.length) return null;
                const type = room?.type || "room";
                const fill = FP_FILL[type] || FP_FILL.room;
                const stroke = FP_STROKE[type] || FP_STROKE.room;
                const pts = zonePoly.points;
                const ptStr = pts.map(p => `${p.x},${p.y}`).join(" ");
                const { cx, cy } = polygonCentroid(pts);
                const isDetected = detectedZone === roomId;
                return (
                  <g key={roomId}>
                    <polygon
                      points={ptStr}
                      fill={fill}
                      stroke={isDetected ? "var(--fm-brass)" : stroke}
                      strokeWidth={isDetected ? 2 : 1}
                    />
                    <text x={cx} y={cy + 4} textAnchor="middle"
                      fill={isDetected ? "var(--fm-brass)" : "var(--fm-ink-dim)"}
                      fontSize={14} fontFamily="var(--fm-mono)"
                      style={{ pointerEvents: "none", userSelect: "none" }}>
                      {room?.label || roomId}
                    </text>
                  </g>
                );
              })}

              {markerPos && (
                <g style={{ pointerEvents: "none" }}>
                  <circle cx={markerPos.x} cy={markerPos.y} r={9}
                    fill="var(--fm-brass)" stroke="var(--fm-bg)" strokeWidth={2} />
                  <line x1={markerPos.x - 18} y1={markerPos.y} x2={markerPos.x + 18} y2={markerPos.y}
                    stroke="var(--fm-brass)" strokeWidth={1} opacity={0.5} />
                  <line x1={markerPos.x} y1={markerPos.y - 18} x2={markerPos.x} y2={markerPos.y + 18}
                    stroke="var(--fm-brass)" strokeWidth={1} opacity={0.5} />
                </g>
              )}
            </svg>
          )}
        </div>

        {/* Zone status */}
        <div style={{ color: zoneLabel ? "var(--fm-ink-dim)" : "var(--fm-ink-mute)", fontFamily: "var(--fm-sans)", fontSize: "0.72rem", fontStyle: zoneLabel ? "normal" : "italic", marginTop: "0.5rem", minHeight: "1.2em", textAlign: "center" }}>
          {zoneLabel || (noZonesMsg ? "" : "Click anywhere on the map to place a marker")}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: "0.6rem", justifyContent: "flex-end", marginTop: "0.85rem" }}>
          <button
            onClick={onCancel}
            style={{
              background: "transparent", border: "1px solid var(--fm-hairline2)", borderRadius: "var(--fm-radius)",
              color: "var(--fm-ink-dim)", cursor: "pointer", fontFamily: "var(--fm-mono)",
              fontSize: "0.7rem", letterSpacing: "0.06em", padding: "0.35rem 0.85rem", transition: "all 0.12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--fm-brass)"; e.currentTarget.style.color = "var(--fm-brass)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--fm-hairline2)"; e.currentTarget.style.color = "var(--fm-ink-dim)"; }}
          >
            Cancel
          </button>
          <button
            onClick={() => markerPos && onConfirm({ levelId: activeLevel, zone: detectedZone, x: markerPos.x, y: markerPos.y })}
            disabled={!markerPos}
            style={{
              background: markerPos ? "var(--fm-brass-bg)" : "transparent",
              border: `1px solid ${markerPos ? "rgba(201,169,110,0.4)" : "var(--fm-hairline)"}`,
              borderRadius: "var(--fm-radius)",
              color: markerPos ? "var(--fm-brass)" : "var(--fm-ink-mute)",
              cursor: markerPos ? "pointer" : "default",
              fontFamily: "var(--fm-mono)", fontSize: "0.7rem",
              letterSpacing: "0.06em", padding: "0.35rem 0.85rem", transition: "all 0.12s",
            }}
            onMouseEnter={e => { if (markerPos) { e.currentTarget.style.background = "rgba(201,169,110,0.2)"; e.currentTarget.style.borderColor = "var(--fm-brass)"; }}}
            onMouseLeave={e => { if (markerPos) { e.currentTarget.style.background = "var(--fm-brass-bg)"; e.currentTarget.style.borderColor = "rgba(201,169,110,0.4)"; }}}
          >
            Confirm Location
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
