import { storageGet, storageSet, storageDel, storageGetAll, storageSetMany, storageDelMany, storageFlushNow } from "./storage.js";
import { SPATIAL_FIELD_NAMES } from "./customFields.js";

// All storage keys included in a profile snapshot.
// Excluded: foreman-household-id and foreman-sync-secret — device identity keys
// used to authenticate with the reminder Worker; must not vary per profile.
export const PROFILE_DATA_KEYS = [
  // Inventory & maintenance
  "foreman-chores",
  "chore-next-dates",
  "chore-completed-dates",
  "chore-notes",
  "foreman-todos",
  "foreman-projects",
  "foreman-custom-data",
  "foreman-overrides",
  "foreman-deleted-categories",
  "foreman-deleted-items",
  "foreman-deleted-rows",
  "foreman-hidden-rows",
  "maintenance-dates",
  "maintenance-next-dates",
  "maintenance-start-dates",
  "maintenance-notes",
  "maintenance-follow",
  "foreman-item-details",
  "foreman-category-field-schemas",
  "foreman-item-field-schemas",
  "foreman-custom-field-values",    // legacy — kept so old export files round-trip correctly
  "foreman-spatial-assignments",
  "foreman-item-field-values",
  "foreman-category-types",
  "foreman-room-subtypes",
  "foreman-inventory",
  "foreman-guide-notes",
  "foreman-use-default-data",
  // Per-task reminder settings
  "foreman-reminder-modes",
  "foreman-chore-reminder-modes",
  // Chore per-occurrence completions
  "foreman-chore-done-dates",
  "foreman-chore-completion-records",
  // Maintenance completion records
  "foreman-maintenance-completion-records",
  // Services, utilities, supplies, expenses, work sessions, budget
  "foreman-services",
  "foreman-utilities",
  "foreman-supplies",
  "foreman-expenses",
  "foreman-sessions",
  "foreman-budget",
  // Preferences / household settings
  "foreman-household-address",
  "foreman-household-members",
  "foreman-discord-webhook",
  "foreman-send-hour-local",
  "foreman-lead-days",
  "foreman-timezone",
  "foreman-inspection-meta",
  // Floor plan
  "foreman-rooms",
  "foreman-floors",
  "inventory-floor-plan-v2",
];

// Built-in profiles — always present, cannot be renamed or deleted.
export const PROFILES = [
  {
    key: "foreman",
    label: "Foreman",
    description: "Your personal profile. All changes you've made — chores, maintenance tracking, to dos, projects, and inventory — are saved here in this browser.",
  },
  {
    key: "default",
    label: "Default Profile",
    description: "The out-of-the-box Foreman experience. All pre-built maintenance tasks and default chores are included, with no personal changes applied.",
  },
  {
    key: "new",
    label: "New Profile",
    description: "A completely blank slate. No pre-built tasks or chores. Start fresh and build your own setup from scratch.",
  },
];

// ─── User-created profiles ────────────────────────────────────────────────────

const USER_PROFILES_KEY = "foreman-user-profiles";

export function loadUserProfiles() {
  try { return storageGet(USER_PROFILES_KEY) ?? []; }
  catch { return []; }
}

function saveUserProfiles(profiles) {
  storageSet(USER_PROFILES_KEY, profiles);
}

export function getAllProfiles() {
  return [...PROFILES, ...loadUserProfiles()];
}

export function createProfile(name, snap) {
  const key  = `user-${Date.now()}`;
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const userProfiles = loadUserProfiles();
  userProfiles.push({ key, label: name, description: `Custom profile created ${date}.`, isUser: true });
  saveUserProfiles(userProfiles);
  storageSet(`foreman-snapshot-${key}`, snap);
  switchProfile(key);
}

export function deleteUserProfile(key) {
  const activeKey = loadActiveProfile();
  saveUserProfiles(loadUserProfiles().filter(p => p.key !== key));
  storageDel(`foreman-snapshot-${key}`);
  if (activeKey === key) switchProfile("foreman");
}

export function renameUserProfile(key, newName) {
  const trimmed = newName.trim();
  if (!trimmed) return;
  const userProfiles = loadUserProfiles();
  const p = userProfiles.find(p => p.key === key);
  if (p) p.label = trimmed;
  saveUserProfiles(userProfiles);
}

// ─── Core profile operations ──────────────────────────────────────────────────

export function loadActiveProfile() {
  return storageGet("foreman-active-profile") || "foreman";
}

function snapshotToStorage(profileKey) {
  const snap = {};
  for (const k of PROFILE_DATA_KEYS) {
    snap[k] = storageGet(k); // null if not set
  }
  storageSet(`foreman-snapshot-${profileKey}`, snap);
}

export function switchProfile(targetKey) {
  const currentKey = loadActiveProfile();
  snapshotToStorage(currentKey);

  const snap = storageGet(`foreman-snapshot-${targetKey}`);
  if (snap) {
    // Restore target profile — delete missing keys, set present ones
    const toSet = [["foreman-active-profile", targetKey]];
    const toDel = [];
    for (const k of PROFILE_DATA_KEYS) {
      if (snap[k] == null) toDel.push(k);
      else toSet.push([k, snap[k]]);
    }
    storageSetMany(toSet);
    storageDelMany(toDel);
  } else {
    // No snapshot — clear all profile keys and set defaults
    storageDelMany(PROFILE_DATA_KEYS);
    storageSet("foreman-active-profile", targetKey);

    if (targetKey === "new") {
      storageSet("foreman-chores", []);
      storageSet("foreman-use-default-data", false);
    }
  }

  window.location.reload();
}

// Returns the data object for a profile (values are parsed, not JSON strings).
// Active profile → reads live storage. Non-active → reads stored snapshot.
// Returns null if the profile has no snapshot and is not active.
export function getProfileData(profileKey) {
  const activeKey = loadActiveProfile();
  if (profileKey === activeKey) {
    const data = {};
    for (const k of PROFILE_DATA_KEYS) data[k] = storageGet(k);
    return data;
  }
  return storageGet(`foreman-snapshot-${profileKey}`) ?? null;
}

export function hasProfileSnapshot(profileKey) {
  return getProfileData(profileKey) !== null;
}

// Export: serialize values to JSON strings for the export file (maintains v1 format).
export function exportProfile(profileKey) {
  const data = getProfileData(profileKey);
  if (!data) return false;

  // Serialize parsed values back to JSON strings for the export file
  const serialized = {};
  for (const k of PROFILE_DATA_KEYS) {
    serialized[k] = data[k] != null ? JSON.stringify(data[k]) : null;
  }

  const meta    = getAllProfiles().find(p => p.key === profileKey);
  const payload = {
    _foreman:   true,
    version:    1,
    profile:    profileKey,
    label:      meta?.label ?? profileKey,
    exportedAt: new Date().toISOString(),
    data:       serialized,
  };

  const content = JSON.stringify(payload, null, 2);
  const defaultName = `foreman-${profileKey}-${new Date().toISOString().slice(0, 10)}.json`;

  if (window.foreman?.showSaveDialog) {
    // Electron: native save dialog, then write via main process
    window.foreman.showSaveDialog({
      defaultPath: defaultName,
      filters: [{ name: "Foreman Backup", extensions: ["json"] }],
    }).then(({ canceled, filePath }) => {
      if (!canceled && filePath) window.foreman.writeFile(filePath, content);
    });
    return true;
  }

  // Browser: download via anchor
  const blob = new Blob([content], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = defaultName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

// Import: parse JSON string values from the file back to objects before storing.
export function importProfileData(parsedJson, targetProfileKey) {
  if (!parsedJson?._foreman || parsedJson.version !== 1 || typeof parsedJson.data !== "object") {
    return "Invalid file — make sure you're importing a Foreman backup.";
  }

  const snap = {};
  for (const k of PROFILE_DATA_KEYS) {
    const raw = parsedJson.data[k];
    if (raw == null) {
      snap[k] = null;
    } else {
      try { snap[k] = JSON.parse(raw); } catch { snap[k] = raw; }
    }
  }

  // Backwards compat: if an old export has the legacy combined key but not the split keys,
  // auto-split it so migrateCfvSplit() doesn't need to run again on first load.
  if (snap["foreman-spatial-assignments"] == null && snap["foreman-custom-field-values"] != null) {
    const old = snap["foreman-custom-field-values"];
    const spatial = {}, itemVals = {};
    Object.entries(old || {}).forEach(([key, vals]) => {
      if (!vals) return;
      const sp = {}, det = {};
      Object.entries(vals).forEach(([f, v]) => {
        if (SPATIAL_FIELD_NAMES.has(f)) sp[f] = v; else det[f] = v;
      });
      if (Object.keys(sp).length)  spatial[key]  = sp;
      if (Object.keys(det).length) itemVals[key] = det;
    });
    snap["foreman-spatial-assignments"] = spatial;
    snap["foreman-item-field-values"]   = itemVals;
    snap["foreman-custom-field-values"] = null;
  }

  storageSet(`foreman-snapshot-${targetProfileKey}`, snap);

  if (targetProfileKey === loadActiveProfile()) {
    const toSet = [["foreman-active-profile", targetProfileKey]];
    const toDel = [];
    for (const k of PROFILE_DATA_KEYS) {
      if (snap[k] == null) toDel.push(k);
      else toSet.push([k, snap[k]]);
    }
    storageSetMany(toSet);
    storageDelMany(toDel);
    storageFlushNow(); // write to disk before reload so readAllSync sees the new data
    window.location.reload();
  }

  return null;
}
