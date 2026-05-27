import { storageGet, storageSet } from "./storage.js";

const KEY = "foreman-deleted-categories";

export function loadDeletedCategories() {
  try { return new Set(storageGet(KEY) || []); }
  catch { return new Set(); }
}

export function saveDeletedCategories(cats) {
  storageSet(KEY, [...cats]);
}
