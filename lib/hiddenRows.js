import { storageGet, storageSet } from "./storage.js";

const HIDDEN_KEY = "foreman-hidden-rows";

export function loadHiddenRows() {
  try { return new Set(storageGet(HIDDEN_KEY) || []); }
  catch { return new Set(); }
}

export function saveHiddenRows(hidden) {
  storageSet(HIDDEN_KEY, [...hidden]);
}
