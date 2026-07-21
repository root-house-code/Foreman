import { storageGet, storageSet } from "./storage.js";

const KEY = "foreman-gmail-import";
export const DEFAULT_LABEL = "Foreman/Bills";

// Cap on retained processed IDs. Gmail message IDs are permanent and the label's
// message set only grows forward, so once scanned an old ID never needs re-checking.
const MAX_PROCESSED = 2000;

function load() {
  const d = storageGet(KEY) ?? {};
  return {
    label: d.label || DEFAULT_LABEL,
    processedMessageIds: Array.isArray(d.processedMessageIds) ? d.processedMessageIds : [],
    lastSyncedAt: d.lastSyncedAt || null,
    // "local" (regex/heuristics, nothing leaves the device) or "ai" (Groq).
    // Defaults to "local" — the more private option — not to whichever the user
    // configured last, so a fresh install never sends bill content off-device
    // without an explicit opt-in.
    parseMode: d.parseMode === "ai" ? "ai" : "local",
  };
}

export function loadGmailImportSettings() { return load(); }

export function saveGmailImportSettings(patch) {
  const next = { ...load(), ...patch };
  storageSet(KEY, next);
  return next;
}

export function isProcessed(messageId) {
  return load().processedMessageIds.includes(messageId);
}

export function markProcessed(messageIds) {
  const d = load();
  const set = new Set(d.processedMessageIds);
  for (const id of messageIds) set.add(id);
  // Keep the most recent MAX_PROCESSED (newly-added ids are appended last).
  const merged = [...set].slice(-MAX_PROCESSED);
  storageSet(KEY, { ...d, processedMessageIds: merged });
  return merged;
}
