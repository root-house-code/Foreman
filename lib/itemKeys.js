/**
 * Returns a stable key for an item row that does not change when the item is renamed.
 * Custom items use their _id; default items use a "default:" prefix + the immutable
 * category+item name from maintenance.json (which is guaranteed unique within a category).
 */
export function getItemStableKey(row) {
  return row._isCustom ? row._id : `default:${row.category}|${row.item}`;
}
