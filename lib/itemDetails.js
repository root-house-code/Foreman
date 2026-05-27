import { storageGet, storageSet } from "./storage.js";

const KEY = "foreman-item-details";

export function loadItemDetails() {
  try { return storageGet(KEY) ?? {}; }
  catch { return {}; }
}

export function saveItemDetails(details) {
  storageSet(KEY, details);
}

export function getOrCreateItemDetail(systemId, itemName) {
  const details = loadItemDetails();
  const id = `${systemId}::${itemName}`;

  if (!details[id]) {
    details[id] = {
      id,
      name: itemName,
      systemId,
      manufacturer: "",
      model: "",
      serial: "",
      installedDate: null,
      warrantyExpires: null,
      photoUrl: null,
      notes: "",
      customFields: {},
    };
  }

  return details[id];
}

export function updateItemDetail(systemId, itemName, updates) {
  const details = loadItemDetails();
  const id = `${systemId}::${itemName}`;

  if (!details[id]) {
    details[id] = getOrCreateItemDetail(systemId, itemName);
  }

  details[id] = {
    ...details[id],
    ...updates,
    id,
  };

  saveItemDetails(details);
  return details[id];
}

export function deleteItemDetail(systemId, itemName) {
  const details = loadItemDetails();
  const id = `${systemId}::${itemName}`;
  delete details[id];
  saveItemDetails(details);
}

export function migrateItemDetails() {
  const details = loadItemDetails();
  let hasMigrated = false;

  Object.entries(details).forEach(([key, detail]) => {
    if (!detail.manufacturer && !detail.model && !detail.serial) {
      details[key] = {
        ...detail,
        manufacturer: detail.manufacturer || "",
        model: detail.model || "",
        serial: detail.serial || "",
        installedDate: detail.installedDate || null,
        warrantyExpires: detail.warrantyExpires || null,
        photoUrl: detail.photoUrl || null,
        notes: detail.notes || "",
        customFields: detail.customFields || {},
      };
      hasMigrated = true;
    }
  });

  if (hasMigrated) {
    saveItemDetails(details);
  }

  return details;
}
