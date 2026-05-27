import { storageGet, storageSet } from "./storage.js";

const KEY = "foreman-guide-notes";

export function loadGuideNotes() {
  try { return storageGet(KEY) ?? {}; }
  catch { return {}; }
}

export function saveGuideNotes(notes) {
  storageSet(KEY, notes);
}
