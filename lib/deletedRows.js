import { storageGet, storageSet } from "./storage.js";

const KEY = "foreman-deleted-rows";

export function loadDeletedRows() {
  try { return new Set(storageGet(KEY) || []); }
  catch { return new Set(); }
}

export function saveDeletedRows(rows) {
  storageSet(KEY, [...rows]);
}
