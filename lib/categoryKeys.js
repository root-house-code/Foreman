/**
 * Returns a stable key for a category that does not change when the category is renamed.
 *
 * Custom categories: the blank-category row's _id (e.g., "custom-1234567890").
 * Default categories: "default-cat:<originalName>" where originalName is the name
 *   from maintenance.json (never changes, even if the user has renamed the category).
 *
 * @param {string} categoryName  - Current display name (used only as fallback)
 * @param {string|null} customId - The _id field of the blank-category custom row, or null
 * @param {string|null} origName - The original maintenance.json name (for default categories)
 */
export function getCategoryStableKey(categoryName, customId, origName = null) {
  if (customId) return customId;
  return `default-cat:${origName ?? categoryName}`;
}

/**
 * Scan rows to find the stable key for the given category display name.
 * Returns null if the category is not found.
 */
export function findCategoryStableKey(categoryName, rows) {
  // Custom category: look for blank-category row
  const blankRow = rows.find(
    r => r._isCustom && r._isBlankCategory && r.category === categoryName
  );
  if (blankRow) return blankRow._id;

  // Default category: derive from original name via _defaultKey
  const defaultRow = rows.find(r => !r._isCustom && r.category === categoryName);
  if (defaultRow && defaultRow._defaultKey) {
    const origName = defaultRow._defaultKey.split("|")[0];
    return `default-cat:${origName}`;
  }

  return null;
}

/**
 * Resolve a stable category key back to the current display name.
 * Returns null if the key can't be resolved.
 */
export function resolveCategoryName(stableKey, rows) {
  if (!stableKey) return null;

  if (stableKey.startsWith("default-cat:")) {
    const origName = stableKey.slice(12);
    // Find a default row whose _defaultKey starts with origName
    const row = rows.find(
      r => !r._isCustom && r._defaultKey?.startsWith(`${origName}|`)
    );
    return row?.category ?? origName; // fall back to original name
  }

  // Custom category: find by _id
  const row = rows.find(r => r._isCustom && r._id === stableKey);
  return row?.category ?? null;
}
