import { storageGet, storageSet, storageDel } from "./storage.js";
import defaultData from "../data/maintenance.json";

const CUSTOM_KEY = "foreman-custom-data";
const OVERRIDES_KEY = "foreman-overrides";

export { defaultData };

export function loadOverrides() {
  try { return storageGet(OVERRIDES_KEY) ?? {}; }
  catch { return {}; }
}
export function saveOverrides(overrides) {
  storageSet(OVERRIDES_KEY, overrides);
}
export function loadCustomData() {
  try { return storageGet(CUSTOM_KEY) ?? []; }
  catch { return []; }
}
export function saveCustomData(rows) {
  storageSet(CUSTOM_KEY, rows);
}

const USE_DEFAULT_KEY = "foreman-use-default-data";
export function loadUseDefaultData() {
  const val = storageGet(USE_DEFAULT_KEY);
  return val === null ? true : val;
}
export function saveUseDefaultData(val) {
  storageSet(USE_DEFAULT_KEY, val);
}

export function loadData() {
  const customs = loadCustomData();
  if (!loadUseDefaultData()) return customs;

  const overrides = loadOverrides();
  const processed = defaultData.map((row, idx) => {
    const defaultKey = `${row.category}|${row.item}|${row.task}`;
    const override = overrides[defaultKey];
    return {
      ...(override ? { ...row, ...override } : row),
      _id: `default-${idx}`,
      _defaultKey: defaultKey,
      _isCustom: false,
    };
  });
  return [...processed, ...customs];
}

export function resetToDefault() {
  storageDel(CUSTOM_KEY);
  storageDel(OVERRIDES_KEY);
  storageDel("foreman-deleted-categories");
  storageDel("foreman-deleted-items");
}
