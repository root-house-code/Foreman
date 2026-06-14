// Property-level rollups for the floor plan: real-estate room-use classification
// and the bed/bath counts derived from it. Pure helpers (no React, no storage) so
// they can be reused anywhere a property summary is shown.

// Controlled room-use taxonomy. `kind` drives counting; entries without a `kind`
// are descriptive labels only (room exists, but doesn't add to beds/baths).
// Bathrooms follow the granular real-estate convention: Full / Three-Quarter / Half.
export const ROOM_USES = [
  { id: "bedroom",            label: "Bedroom",      kind: "bed" },
  { id: "full_bath",          label: "Full Bath",    kind: "bath", weight: 1,    desc: "Full bath: sink, toilet, and a bathtub with a shower (or a separate tub and shower) — all four fixtures. Counts as 1 bath." },
  { id: "three_quarter_bath", label: "¾ Bath",       kind: "bath", weight: 0.75, desc: "Three-quarter bath: sink, toilet, and a shower but no bathtub. Counts as 0.75 bath." },
  { id: "half_bath",          label: "Half Bath",    kind: "bath", weight: 0.5,  desc: "Half bath (powder room): sink and toilet only — no shower or tub. Counts as 0.5 bath." },
  { id: "kitchen",            label: "Kitchen" },
  { id: "living",             label: "Living Room" },
  { id: "dining",             label: "Dining Room" },
  { id: "office",             label: "Office / Den" },
  { id: "laundry",            label: "Laundry" },
  { id: "other",              label: "Other" },
];

const USE_BY_ID = Object.fromEntries(ROOM_USES.map(u => [u.id, u]));

// Legacy fallback: older data tagged rooms via the per-category `roomSubtypes`
// map ("Bedroom"/"Bathroom"). Honor those for counting until a room gets an
// explicit `use`, so no prior tagging is silently dropped.
const LEGACY_SUBTYPE_TO_USE = { Bedroom: "bedroom", Bathroom: "full_bath" };

export function getRoomUse(useId) {
  return USE_BY_ID[useId] || null;
}

// Resolve a room's effective use id: explicit `use` wins, else infer from the
// legacy per-category roomSubtypes map keyed by the room's label.
export function resolveRoomUse(room, legacySubtypes) {
  if (room?.use) return room.use;
  const sub = legacySubtypes?.[room?.label];
  return LEGACY_SUBTYPE_TO_USE[sub] || null;
}

// Beds = count of bed-kind rooms. Baths = Σ of bath-kind weights.
// `rooms` is the room-entity map ({ [id]: room }); `legacySubtypes` is optional.
export function computeBedBath(rooms, legacySubtypes) {
  let beds = 0;
  let baths = 0;
  Object.values(rooms || {}).forEach(room => {
    const use = getRoomUse(resolveRoomUse(room, legacySubtypes));
    if (!use) return;
    if (use.kind === "bed") beds += 1;
    else if (use.kind === "bath") baths += use.weight;
  });
  return { beds, baths };
}

// Format a bath total the way listings do: trim trailing zeros — "4", "3.5", "2.75".
export function formatBaths(n) {
  if (!n) return "0";
  return parseFloat(n.toFixed(2)).toString();
}
