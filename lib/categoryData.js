// Single source of truth for the category/item/task tree derived from maintenance.json.
//
// Edit data/maintenance.json to add or change categories, items, and tasks.
// Edit lib/categoryTypes.js to add or rename group types (GROUP_ORDER / GROUP_LABELS).
//
// All consumers — inventory suggestions, maintenance page tabs, guide — import from
// here so the derivation logic lives in one place and automatically reflects any
// change to the underlying data file.

import { defaultData } from "./data.js";
import { GROUP_ORDER } from "./categoryTypes.js";

// Module-level cache — built once on first call, then reused.
// Safe because defaultData is a static JSON import that never changes at runtime.
let _built = false;
const _categoriesForGroup = {};
const _itemsForCategory   = {};
let   _allDefaultItems    = null;
let   _categoryTree       = null;

function _build() {
  if (_built) return;
  _built = true;

  const catOrder    = [];
  const catTypeMap  = {};
  const catItems    = {}; // category → item[]  (insertion order)
  const taskMap     = {}; // "cat||item" → row[]

  defaultData.forEach(row => {
    if (!row.category) return;

    if (!catOrder.includes(row.category)) {
      catOrder.push(row.category);
      catTypeMap[row.category] = row.categoryType ?? "system";
      catItems[row.category]   = [];
    }

    if (row.item && !catItems[row.category].includes(row.item)) {
      catItems[row.category].push(row.item);
      taskMap[`${row.category}||${row.item}`] = [];
    }

    if (row.item && row.task) {
      taskMap[`${row.category}||${row.item}`].push(row);
    }
  });

  // Per-group category lists, preserving JSON insertion order within each group.
  GROUP_ORDER.forEach(type => {
    _categoriesForGroup[type] = catOrder.filter(cat => catTypeMap[cat] === type);
  });

  // Per-category item lists (insertion order from JSON).
  catOrder.forEach(cat => { _itemsForCategory[cat] = catItems[cat]; });

  // Flat deduplicated item vocabulary across all categories, sorted.
  _allDefaultItems = [...new Set(catOrder.flatMap(cat => catItems[cat]))].sort();

  // Full tree used by the guide and any future consumer that needs tasks too.
  _categoryTree = catOrder.map(cat => ({
    category:     cat,
    categoryType: catTypeMap[cat],
    items: catItems[cat].map(item => ({
      item,
      tasks: taskMap[`${cat}||${item}`],
    })),
  }));
}

// Returns suggested category names for a group type, in JSON insertion order.
// Used by the inventory "add category" dropdown and any future picker.
export function getCategoriesForGroup(groupType) {
  _build();
  return _categoriesForGroup[groupType] ?? [];
}

// Returns default item names for a specific category, in JSON insertion order.
export function getItemsForCategory(category) {
  _build();
  return _itemsForCategory[category] ?? [];
}

// Returns every unique item name across all categories, sorted alphabetically.
// Used for cross-category item suggestions (e.g. the inventory "add item" dropdown).
export function getAllDefaultItems() {
  _build();
  return _allDefaultItems ?? [];
}

// Returns the full category → item → task tree.
// Shape: [{ category, categoryType, items: [{ item, tasks: [row, ...] }] }]
// Used by the guide page and any future read-only reference view.
export function getCategoryTree() {
  _build();
  return _categoryTree ?? [];
}
