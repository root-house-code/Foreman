import { storageGet, storageSet } from "./storage.js";
import {
  loadCustomFieldValues, saveCustomFieldValues,
  loadItemFieldSchemas, saveItemFieldSchemas,
} from "./customFields.js";
import { loadItemDetails, saveItemDetails } from "./itemDetails.js";
import { loadDeletedItems, saveDeletedItems } from "./deletedItems.js";
import { getItemStableKey } from "./itemKeys.js";
import { loadData } from "./data.js";

const ITEM_MIGRATION_FLAG = "foreman-id-migration-v1";

export function runMigrations() {
  if (storageGet(ITEM_MIGRATION_FLAG) !== true) {
    _migrateItemIdentity();
    storageSet(ITEM_MIGRATION_FLAG, true);
  }
}

function _migrateItemIdentity() {
  const rows = loadData();

  const nameToKey = {};
  rows.forEach(row => {
    if (!row.category || !row.item) return;
    const nameKey = `${row.category}|${row.item}`;
    if (!(nameKey in nameToKey)) {
      nameToKey[nameKey] = getItemStableKey(row);
    }
  });

  function resolve(k) {
    if (k.startsWith("custom-") || k.startsWith("default:")) return k;
    return nameToKey[k] ?? k;
  }

  function reKeyObject(obj) {
    const out = {};
    Object.entries(obj).forEach(([k, v]) => {
      const sk = resolve(k);
      out[sk] ??= v;
    });
    return out;
  }

  try { saveCustomFieldValues(reKeyObject(loadCustomFieldValues())); } catch { /* storage full — skip */ }
  try { saveItemFieldSchemas(reKeyObject(loadItemFieldSchemas())); } catch { /* storage full — skip */ }

  const details = loadItemDetails();
  const newDetails = {};
  Object.entries(details).forEach(([k, v]) => {
    let key = k;
    if (!k.startsWith("custom-") && !k.startsWith("default:") && k.includes("::")) {
      key = k.replace("::", "|");
    }
    const sk = resolve(key);
    newDetails[sk] ??= v;
  });
  try { saveItemDetails(newDetails); } catch { /* storage full — skip */ }

  const deleted = loadDeletedItems();
  const newDeleted = new Set([...deleted].map(k => resolve(k)));
  saveDeletedItems(newDeleted);
}
