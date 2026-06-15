import { storageGet, storageSet } from "./storage.js";

// Notebook article organization: how the left-hand article list is grouped and,
// in Custom mode, the user's own drag-ordered arrangement. Pure helpers + thin
// persistence so guide-page.jsx stays lean.

const GROUPING_KEY = "foreman-notebook-grouping";
const ORDER_KEY    = "foreman-notebook-order";

export const NOTEBOOK_GROUPINGS = [
  { value: "system", label: "By System" },
  { value: "room",   label: "By Location" },
  { value: "recent", label: "Recent" },
  { value: "custom", label: "Custom Sort" },
];

export function loadNotebookGrouping() {
  const v = storageGet(GROUPING_KEY);
  return NOTEBOOK_GROUPINGS.some(g => g.value === v) ? v : "system";
}
export function saveNotebookGrouping(mode) { storageSet(GROUPING_KEY, mode); }

export function loadNotebookOrder() {
  try { return storageGet(ORDER_KEY) ?? []; } catch { return []; }
}
export function saveNotebookOrder(order) { storageSet(ORDER_KEY, order); }

// Canonical per-article key used for notes lookup and the custom-order array.
export function articleRefKey(category, item) { return `${category}|${item}`; }

/**
 * Normalizes `grouped` ([{ category, items: [{ item, tasks }] }]) into display
 * sections [{ label, items: [{ category, item, tasks }] }] for the given mode.
 *
 * opts:
 *   notes              guide-notes map keyed `${category}|${item}`
 *   spatialAssignments store slice keyed by stableKey (for Room mode)
 *   customOrder        array of refKeys (for Custom mode)
 *   stableKeyFor       (category, item, tasks) => stableKey
 *   systemFor          (entry) => the item's system label (for System mode); "" = Unassigned
 *   standalone         pre-shaped item-less article entries (carry refKey/articleId)
 */
export function buildSections(mode, grouped, opts = {}) {
  const { notes = {}, spatialAssignments = {}, customOrder = [], stableKeyFor, systemFor, standalone = [] } = opts;
  const keyFor = stableKeyFor || ((c, i) => `default:${c}|${i}`);

  // Item articles, each tagged with its canonical ref key (category|item).
  const itemEntries = [];
  grouped.forEach(g => g.items.forEach(it => itemEntries.push({
    category: g.category, item: it.item, tasks: it.tasks,
    stableKey: it.stableKey, refKey: articleRefKey(g.category, it.item),
  })));

  // Standalone (item-less) articles arrive pre-shaped with refKey/articleId.
  const all = [...itemEntries, ...standalone];

  if (mode === "room") {
    const buckets = {};
    itemEntries.forEach(entry => {
      const sp = spatialAssignments[entry.stableKey || keyFor(entry.category, entry.item, entry.tasks)] || {};
      const label = sp.roomLabel || sp.exteriorLabel || "Unassigned";
      (buckets[label] ??= []).push(entry);
    });
    const sections = Object.keys(buckets)
      .sort((a, b) => (a === "Unassigned") - (b === "Unassigned") || a.localeCompare(b))
      .map(label => ({ label, items: buckets[label].sort((a, b) => a.item.localeCompare(b.item)) }));
    return withStandaloneSection(sections, standalone);
  }

  if (mode === "recent") {
    const ts = e => {
      const t = notes[e.refKey]?.updatedAt || e.updatedAt;
      return t ? new Date(t).getTime() : 0;
    };
    const sorted = [...all].sort((a, b) => ts(b) - ts(a) || a.item.localeCompare(b.item));
    return [{ label: "Recently edited", items: sorted }];
  }

  if (mode === "custom") {
    const rank = e => {
      const i = customOrder.indexOf(e.refKey);
      return i === -1 ? Infinity : i;
    };
    const sorted = [...all].sort((a, b) => rank(a) - rank(b) || a.item.localeCompare(b.item));
    return [{ label: "Custom order", items: sorted }];
  }

  // system (default): group by each item's inventory system (its functional
  // category — HVAC, Plumbing, Electrical, Safety, …), NOT its location. Items
  // with no related system collect under "Unassigned" at the bottom; item-less
  // Articles are pinned on top. `systemFor(entry)` resolves the effective system
  // (explicit systemCategory/system value, else the item's own functional category).
  const buckets = {};
  itemEntries.forEach(entry => {
    const label = (systemFor ? systemFor(entry) : "") || "Unassigned";
    (buckets[label] ??= []).push(entry);
  });
  const sections = Object.keys(buckets)
    .sort((a, b) => (a === "Unassigned") - (b === "Unassigned") || a.localeCompare(b))
    .map(label => ({ label, items: buckets[label].sort((a, b) => a.item.localeCompare(b.item)) }));
  return withStandaloneSection(sections, standalone);
}

// Item-less articles get their own "Articles" section pinned to the top in the
// category-style modes (system / room). Recent / Custom mix them in by order.
function withStandaloneSection(sections, standalone) {
  if (!standalone.length) return sections;
  const items = [...standalone].sort((a, b) => a.item.localeCompare(b.item));
  return [{ label: "Articles", items }, ...sections];
}
