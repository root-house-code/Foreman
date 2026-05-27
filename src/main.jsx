import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "react-datepicker/dist/react-datepicker.css";
import "./datepicker-theme.css";
import "./reminders-a11y.css";
import App from "./App.jsx";
import { storageInit } from "../lib/storage.js";
import { loadFpData } from "../lib/fpData.js";
import { loadRooms } from "../lib/rooms.js";
import { loadFloors, saveFloors, sortFloors, getDefaultFloors } from "../lib/floors.js";
import { useForemanStore } from "../lib/store.js";
import { migrateCfvSplit } from "../lib/customFields.js";

storageInit().then(() => {
  // Run fpData first so migrateToV3 (if needed) writes fresh room IDs to storage
  // before we read rooms. Same order required as in store.reloadAll().
  const fpData = loadFpData();
  const rooms  = loadRooms();

  // Floor recovery: if fpData or rooms reference level IDs not in the floors list,
  // rebuild floors from the available data. This repairs corruption from old builds
  // that called saveFloors() before storageInit populated the cache.
  const currentFloors = loadFloors();
  const knownFloorIds = new Set(currentFloors.map(f => f.id));

  const usedLevelIds = new Set([
    ...Object.keys(fpData.placements),
    ...Object.values(rooms).map(r => r.floorId).filter(Boolean),
  ]);

  const orphaned = [...usedLevelIds].filter(id => !knownFloorIds.has(id));
  if (orphaned.length > 0) {
    const rebuilt = [...currentFloors];
    // Sort orphaned so levels with more zone placements get higher numbers
    // (higher number → more negative sortKey → appears first in floor list).
    const sorted = [...orphaned].sort(
      (a, b) => Object.keys(fpData.placements[a] || {}).length
              - Object.keys(fpData.placements[b] || {}).length
    );
    for (const levelId of sorted) {
      const roomLabels = Object.values(rooms)
        .filter(r => r.floorId === levelId)
        .map(r => (r.label || "").toLowerCase());
      let kind = "floor";
      if (roomLabels.some(l => l.includes("attic"))) kind = "attic";
      else if (roomLabels.some(l => l.includes("basement"))) kind = "basement";
      else if (roomLabels.some(l => l.includes("deck") || l.includes("driveway") || l.includes("garage"))) kind = "yard";
      const floorNum = rebuilt.filter(f => f.kind === "floor").length + 1;
      rebuilt.push({
        id: levelId, kind,
        number: kind === "floor" ? floorNum : null,
        label: kind === "floor" ? `Floor ${floorNum}` : kind.charAt(0).toUpperCase() + kind.slice(1),
        glyph: kind === "floor" ? String(floorNum) : kind.charAt(0).toUpperCase(),
      });
    }
    saveFloors(sortFloors(rebuilt));
  }

  // Ensure at least one floor exists for brand-new users.
  if (loadFloors().length === 0) saveFloors(getDefaultFloors());

  // One-time split of customFieldValues into spatialAssignments + itemFieldValues.
  // Must run after storageInit so the cache has the real data, and before reloadAll.
  migrateCfvSplit();

  // Populate the store from the now-correct cache.
  useForemanStore.getState().reloadAll();

  createRoot(document.getElementById("root")).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
