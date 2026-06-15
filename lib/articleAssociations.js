import { storageGet, storageSet } from "./storage.js";

// Article associations (the classification layer) keyed by an article's refKey.
// Shape: { [refKey]: { item?, location?, system?, project?, task? } }
//
// Only NON-derived associations live here: project + task for every article,
// plus item/location/system for standalone (item-less) articles. Item articles
// read item/location/system live from the underlying inventory item, so those
// are never persisted — see guide-page.jsx.
//
// Value encodings: item = `${category}|${item}`, task = `${category}|${item}|${task}`,
// project = project id, location = room/exterior label, system = functional category.

const KEY = "foreman-article-associations";

export function loadArticleAssociations() {
  try { const v = storageGet(KEY); return v && typeof v === "object" ? v : {}; }
  catch { return {}; }
}

export function saveArticleAssociations(map) { storageSet(KEY, map); }

// Pure: returns the next map with one association field set (or removed when the
// value is empty). Prunes empty article entries so the store stays tidy.
export function setAssociationIn(map, refKey, key, value) {
  const cur = { ...(map[refKey] || {}) };
  if (value == null || value === "") delete cur[key];
  else cur[key] = value;
  const next = { ...map };
  if (Object.keys(cur).length) next[refKey] = cur;
  else delete next[refKey];
  return next;
}
