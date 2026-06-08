import { storageGet, storageSet } from "./storage.js";

// Ad-hoc home expenses — repairs, parts, one-off costs — that don't live in
// Services or Inventory. Stored as a flat map keyed by id.
//
// Expense: {
//   id: "exp-{timestamp}",
//   date: "YYYY-MM-DD",
//   amount: number,
//   label: string,              // "Replaced AC capacitor"
//   linkedItem: stableKey|null, // optional link to an inventory item (drives category rollup)
// }

const KEY = "foreman-expenses";

function load() {
  try { return storageGet(KEY) ?? {}; }
  catch { return {}; }
}

export function loadExpenses() { return load(); }
export function saveExpenses(data) { storageSet(KEY, data); }

export function addExpense(exp) {
  const data = load();
  data[exp.id] = exp;
  saveExpenses(data);
  return data;
}

export function updateExpense(id, updates) {
  const data = load();
  if (!data[id]) return data;
  data[id] = { ...data[id], ...updates, id };
  saveExpenses(data);
  return data;
}

export function deleteExpense(id) {
  const data = load();
  delete data[id];
  saveExpenses(data);
  return data;
}
