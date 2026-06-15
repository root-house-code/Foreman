import { storageGet, storageSet } from "./storage.js";

// Standalone Notebook articles — user-authored entries NOT tied to any inventory
// item. Each record holds only identity + title + timestamps; the article body
// reuses the shared guide-notes store under the key `standalone:<id>`, so the
// existing recency / documented / content-search machinery works unchanged.

const KEY = "foreman-standalone-articles";

export function loadStandaloneArticles() {
  try { const v = storageGet(KEY); return Array.isArray(v) ? v : []; }
  catch { return []; }
}

export function saveStandaloneArticles(articles) {
  storageSet(KEY, articles);
}

export function standaloneNoteKey(id) {
  return `standalone:${id}`;
}
