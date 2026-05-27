import { storageGet, storageSet } from "./storage.js";

export function loadInventory() {
  try { return storageGet("foreman-inventory") ?? {}; }
  catch { return {}; }
}

export function saveInventory(inv) {
  storageSet("foreman-inventory", inv);
}

export function getCategoryState(inv, category) {
  return inv[`cat:${category}`] ?? "included";
}

export function getOwnItemState(inv, category, item) {
  return inv[`item:${category}|${item}`] ?? "included";
}

// Parent always wins: if category is non-included, that state applies to all items beneath it.
export function getEffectiveRowState(inv, row) {
  const catState = getCategoryState(inv, row.category);
  if (catState !== "included") return catState;
  return getOwnItemState(inv, row.category, row.item);
}

export function setCategoryState(inv, category, state) {
  const key = `cat:${category}`;
  const next = { ...inv };
  state === "included" ? delete next[key] : (next[key] = state);
  return next;
}

export function setItemState(inv, category, item, state) {
  const key = `item:${category}|${item}`;
  const next = { ...inv };
  state === "included" ? delete next[key] : (next[key] = state);
  return next;
}
