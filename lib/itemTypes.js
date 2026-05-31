import { storageGet, storageSet } from "./storage.js";

const KEY = "foreman-item-types";

export const BUILT_IN_ITEM_TYPES = ["Appliance", "Device", "Fixture", "Material"];

export function loadItemTypes() {
  try {
    const stored = storageGet(KEY);
    if (Array.isArray(stored)) {
      const existing = new Set(stored.map(t => t.toLowerCase()));
      const result = [...stored];
      BUILT_IN_ITEM_TYPES.forEach(t => {
        if (!existing.has(t.toLowerCase())) result.push(t);
      });
      return result;
    }
  } catch {}
  return [...BUILT_IN_ITEM_TYPES];
}

export function saveItemTypes(types) {
  storageSet(KEY, types);
}
