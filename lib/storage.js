import { get, set, del, entries, setMany } from "idb-keyval";

// In-memory cache populated once at startup. All load*/save* functions read/write
// this cache synchronously; IndexedDB writes happen asynchronously in the background.
let _cache = {};

export function storageGet(key) {
  return Object.prototype.hasOwnProperty.call(_cache, key) ? _cache[key] : null;
}

export function storageSet(key, value) {
  _cache[key] = value;
  set(key, value); // fire-and-forget
}

export function storageDel(key) {
  delete _cache[key];
  del(key); // fire-and-forget
}

export function storageHas(key) {
  return Object.prototype.hasOwnProperty.call(_cache, key);
}

// Returns a snapshot of all keys currently in the cache (for profiles/export).
export function storageGetAll() {
  return { ..._cache };
}

// Bulk-set multiple key/value pairs — used by profile switching.
export function storageSetMany(pairs) {
  pairs.forEach(([k, v]) => { _cache[k] = v; });
  setMany(pairs); // fire-and-forget
}

// Bulk-delete multiple keys — used by profile switching.
export function storageDelMany(keys) {
  keys.forEach(k => delete _cache[k]);
  keys.forEach(k => del(k)); // fire-and-forget
}

/**
 * Must be called once before React renders.
 * 1. Loads all IndexedDB entries into the in-memory cache.
 * 2. On first run, migrates existing localStorage data into IndexedDB and clears it.
 */
export async function storageInit() {
  // Load everything already in IndexedDB into the cache.
  const existing = await entries();
  existing.forEach(([k, v]) => { _cache[k] = v; });

  // One-time migration from localStorage → IndexedDB.
  if (!_cache["foreman-idb-migrated"]) {
    const toMigrate = [["foreman-idb-migrated", true]];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const raw = localStorage.getItem(k);
      if (raw === null) continue;
      let parsed;
      try { parsed = JSON.parse(raw); } catch { parsed = raw; }
      _cache[k] = parsed;
      toMigrate.push([k, parsed]);
    }
    await setMany(toMigrate);
    // Clear localStorage after successful migration to free space.
    localStorage.clear();
  }
}
