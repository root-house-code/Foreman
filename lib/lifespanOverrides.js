// User overrides for expected service life, keyed by exact item name (the same
// names used in lib/lifespans.js EXPECTED_LIFESPAN and the model-coverage table).
// An override replaces the curated typical lifespan everywhere it's consumed —
// the Replacement Forecast "Life" field and the Preferences → Default Values table
// both read and write through here, so editing in one place updates the other.

import { storageGet, storageSet } from "./storage.js";

const KEY = "foreman-lifespan-overrides";

export function loadLifespanOverrides() {
  try { return storageGet(KEY) ?? {}; } catch { return {}; }
}

export function saveLifespanOverrides(map) {
  storageSet(KEY, map);
}
