import { get, set, del, entries, setMany } from "idb-keyval";

// Detect Electron file backend (injected by electron/preload.cjs via contextBridge).
// In a plain browser build window.foreman is undefined, so the idb path is used.
const _file = typeof window !== "undefined" && window.foreman?.isElectron ? window.foreman : null;

// In-memory cache populated once at startup. All load*/save* functions read/write
// this cache synchronously; persistence (IndexedDB or file) happens in the background.
let _cache = {};

export function storageGet(key) {
  return Object.prototype.hasOwnProperty.call(_cache, key) ? _cache[key] : null;
}

export function storageSet(key, value) {
  _cache[key] = value;
  if (_file) _file.flush(storageGetAll());
  else set(key, value); // fire-and-forget
}

export function storageDel(key) {
  delete _cache[key];
  if (_file) _file.flush(storageGetAll());
  else del(key); // fire-and-forget
}

export function storageHas(key) {
  return Object.prototype.hasOwnProperty.call(_cache, key);
}

// Returns a snapshot of all keys currently in the cache (for profiles/export).
export function storageGetAll() {
  return { ..._cache };
}

// Synchronous immediate flush to disk — call before window.location.reload()
// so the debounce timer doesn't race with the next storageInit read.
export function storageFlushNow() {
  if (_file?.flushNow) _file.flushNow(storageGetAll());
}

// Bulk-set multiple key/value pairs — used by profile switching.
export function storageSetMany(pairs) {
  pairs.forEach(([k, v]) => { _cache[k] = v; });
  if (_file) _file.flush(storageGetAll());
  else setMany(pairs); // fire-and-forget
}

// Bulk-delete multiple keys — used by profile switching.
export function storageDelMany(keys) {
  keys.forEach(k => delete _cache[k]);
  if (_file) _file.flush(storageGetAll());
  else keys.forEach(k => del(k)); // fire-and-forget
}

/**
 * Must be called once before React renders.
 * Electron: hydrates _cache synchronously from data.json + images.json.
 * Browser: loads all IndexedDB entries, then migrates localStorage on first run.
 */
export async function storageInit() {
  if (_file) {
    // Electron path: synchronous read from disk, no migration needed.
    const all = _file.readAllSync();
    Object.assign(_cache, all);
    return;
  }

  // Browser path: load from IndexedDB.
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
    localStorage.clear();
  }
}
