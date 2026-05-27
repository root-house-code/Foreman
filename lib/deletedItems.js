import { storageGet, storageSet } from "./storage.js";

const KEY = "foreman-deleted-items";

export function loadDeletedItems() {
  try { return new Set(storageGet(KEY) || []); }
  catch { return new Set(); }
}

export function saveDeletedItems(items) {
  storageSet(KEY, [...items]);
}
