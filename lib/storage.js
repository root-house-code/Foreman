import { get, set, del, entries, setMany } from "idb-keyval";

// Detect Electron file backend (injected by electron/preload.cjs via contextBridge).
// In a plain browser build window.foreman is undefined, so the idb path is used —
// unless the page was served by a Foreman LAN host, detected in storageInit(),
// in which case reads/writes go to the host over HTTP (remote mode).
const _file = typeof window !== "undefined" && window.foreman?.isElectron ? window.foreman : null;

// In-memory cache populated once at startup. All load*/save* functions read/write
// this cache synchronously; persistence (file, remote host, or IndexedDB) happens
// in the background.
let _cache = {};

// Remote mode (LAN client): set by storageInit() when served from a Foreman host.
// { token, clientId } — writes POST per-key deltas to the host; an SSE stream
// applies other devices' changes into _cache.
let _remote = null;

// Called after a delta from another writer (LAN client on the host, or the host /
// another client when in remote mode) has been applied to _cache. The app wires
// this to the store's reloadAll() so every page reflects the change.
let _remoteChangeCb = null;
export function onStorageRemoteChange(cb) { _remoteChangeCb = cb; }

function _applyIncomingDelta(delta) {
  if (delta?.updates) for (const [k, v] of Object.entries(delta.updates)) _cache[k] = v;
  if (delta?.deletes) for (const k of delta.deletes) delete _cache[k];
  _remoteChangeCb?.(delta);
}

// ── Delta transport (file + remote modes) ─────────────────────────────────────
// Writes are sent as per-key deltas, not full snapshots, so a concurrent writer
// on another device is never clobbered by a stale whole-store flush.
const _dirty = new Set();
const _deleted = new Set();
let _sendTimer = null;

function _collectDelta() {
  const updates = {};
  _dirty.forEach(k => {
    if (Object.prototype.hasOwnProperty.call(_cache, k)) updates[k] = _cache[k];
  });
  const deletes = [..._deleted];
  _dirty.clear();
  _deleted.clear();
  return { updates, deletes };
}

function _sendDelta({ updates, deletes }, { sync = false } = {}) {
  if (!Object.keys(updates).length && !deletes.length) return;
  if (_file) {
    if (sync) _file.setKeysNow(updates, deletes);
    else _file.setKeys(updates, deletes);
  } else if (_remote) {
    // keepalive lets an in-flight write survive a page reload/navigation
    fetch(`/api/set?token=${encodeURIComponent(_remote.token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates, deletes, client: _remote.clientId }),
      keepalive: sync,
    }).catch(() => {});
  }
}

function _scheduleSend() {
  clearTimeout(_sendTimer);
  _sendTimer = setTimeout(() => {
    _sendTimer = null;
    _sendDelta(_collectDelta());
  }, 100);
}

function _markSet(key) {
  _dirty.add(key);
  _deleted.delete(key);
  _scheduleSend();
}

function _markDel(key) {
  _deleted.add(key);
  _dirty.delete(key);
  _scheduleSend();
}

const _useDelta = () => _file || _remote;

export function storageGet(key) {
  return Object.prototype.hasOwnProperty.call(_cache, key) ? _cache[key] : null;
}

export function storageSet(key, value) {
  _cache[key] = value;
  if (_useDelta()) _markSet(key);
  else set(key, value); // fire-and-forget
}

export function storageDel(key) {
  delete _cache[key];
  if (_useDelta()) _markDel(key);
  else del(key); // fire-and-forget
}

export function storageHas(key) {
  return Object.prototype.hasOwnProperty.call(_cache, key);
}

// Returns a snapshot of all keys currently in the cache (for profiles/export).
export function storageGetAll() {
  return { ..._cache };
}

// Immediate flush — call before window.location.reload() so the debounce timer
// doesn't race with the next storageInit read.
export function storageFlushNow() {
  if (!_useDelta()) return;
  clearTimeout(_sendTimer);
  _sendTimer = null;
  _sendDelta(_collectDelta(), { sync: true });
}

// Bulk-set multiple key/value pairs — used by profile switching.
export function storageSetMany(pairs) {
  pairs.forEach(([k, v]) => { _cache[k] = v; });
  if (_useDelta()) pairs.forEach(([k]) => _markSet(k));
  else setMany(pairs); // fire-and-forget
}

// Bulk-delete multiple keys — used by profile switching.
export function storageDelMany(keys) {
  keys.forEach(k => delete _cache[k]);
  if (_useDelta()) keys.forEach(k => _markDel(k));
  else keys.forEach(k => del(k)); // fire-and-forget
}

// ── Remote (LAN client) init ──────────────────────────────────────────────────

const LAN_TOKEN_KEY = "foreman-lan-token";

function _pairingToken() {
  // A fresh pairing arrives in the URL hash (#pair=TOKEN) from the QR code on
  // the host's Preferences page; persist it and strip the hash.
  const m = window.location.hash.match(/[#&]pair=([^&]+)/);
  if (m) {
    localStorage.setItem(LAN_TOKEN_KEY, decodeURIComponent(m[1]));
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  return localStorage.getItem(LAN_TOKEN_KEY) || "";
}

function _pairingRequired() {
  document.body.innerHTML = `
    <div style="align-items:center;background:#0f1117;color:#e8e5e0;display:flex;flex-direction:column;font-family:system-ui,sans-serif;gap:0.6rem;height:100vh;justify-content:center;text-align:center;padding:2rem">
      <div style="font-size:1.1rem">Pairing required</div>
      <div style="color:#8a8694;font-size:0.85rem;max-width:420px;line-height:1.6">
        This device isn't paired with the Foreman host. Open Preferences &rarr; Multi-Device Sharing
        on the host computer and scan the QR code (or reopen the full link) to pair.
      </div>
    </div>`;
  throw new Error("foreman: pairing token missing or rejected");
}

async function _initRemote() {
  const token = _pairingToken();
  if (!token) _pairingRequired();

  const res = await fetch(`/api/all?token=${encodeURIComponent(token)}`, { cache: "no-store" });
  if (res.status === 401) { localStorage.removeItem(LAN_TOKEN_KEY); _pairingRequired(); }
  if (!res.ok) throw new Error(`foreman host error ${res.status}`);
  Object.assign(_cache, await res.json());

  _remote = { token, clientId: `client-${Math.random().toString(36).slice(2, 10)}` };

  // Live updates from the host / other devices
  const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}&client=${_remote.clientId}`);
  es.onmessage = (e) => {
    try { _applyIncomingDelta(JSON.parse(e.data)); } catch {}
  };
}

/**
 * Must be called once before React renders.
 * Electron: hydrates _cache synchronously from the main process's store.
 * LAN client: hydrates from the host over HTTP and subscribes to live updates.
 * Browser: loads all IndexedDB entries, then migrates localStorage on first run.
 */
export async function storageInit() {
  if (_file) {
    // Electron path: synchronous read from main's authoritative store.
    const all = _file.readAllSync();
    Object.assign(_cache, all);
    // Live updates from LAN clients writing through the host
    _file.onRemoteChange?.((delta) => _applyIncomingDelta(delta));
    return;
  }

  // LAN-client detection: only a Foreman host answers /api/ping with the marker.
  // On the Vite dev server or any static host this 404s (or returns non-JSON)
  // and we fall through to the IndexedDB path unchanged.
  try {
    const ping = await fetch("/api/ping", { cache: "no-store" });
    if (ping.ok && (await ping.json())?.foreman === true) {
      await _initRemote();
      return;
    }
  } catch { /* not a Foreman host — fall through */ }

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
