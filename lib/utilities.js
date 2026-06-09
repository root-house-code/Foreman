import { storageGet, storageSet } from "./storage.js";

const KEY = "foreman-utilities";

// Utility types — fixed list with an "Other" escape hatch (mirrors FIXED_SERVICE_CATEGORIES).
export const FIXED_UTILITY_TYPES = [
  "Electricity", "Natural Gas", "Water", "Sewer", "Garbage / Trash",
  "Internet", "Cable / TV", "Phone / Mobile", "Heating Oil", "Propane", "Solar", "HOA", "Other",
];

// Default usage unit per metered type; types not listed are flat (no usage).
export const DEFAULT_UNIT = {
  "Electricity": "kWh",
  "Natural Gas": "therms",
  "Water": "gallons",
  "Heating Oil": "gallons",
  "Propane": "gallons",
};

function load() {
  try { return storageGet(KEY) ?? { utilities: {}, bills: {} }; }
  catch { return { utilities: {}, bills: {} }; }
}

export function loadUtilities() {
  const d = load();
  return { utilities: d.utilities ?? {}, bills: d.bills ?? {} };
}
export function saveUtilities(data) { storageSet(KEY, data); }

export function addUtility(util) {
  const data = load();
  data.utilities[util.id] = util;
  saveUtilities(data);
  return data;
}

export function updateUtility(id, updates) {
  const data = load();
  if (!data.utilities[id]) return data;
  data.utilities[id] = { ...data.utilities[id], ...updates, id };
  saveUtilities(data);
  return data;
}

export function deleteUtility(id) {
  const data = load();
  delete data.utilities[id];
  // Prune this utility's bills, like deleteService prunes its visits.
  Object.keys(data.bills).forEach(bid => {
    if (data.bills[bid].utilityId === id) delete data.bills[bid];
  });
  saveUtilities(data);
  return data;
}

export function addBill(bill) {
  const data = load();
  data.bills[bill.id] = bill;
  saveUtilities(data);
  return data;
}

export function updateBill(id, updates) {
  const data = load();
  if (!data.bills[id]) return data;
  data.bills[id] = { ...data.bills[id], ...updates, id };
  saveUtilities(data);
  return data;
}

export function deleteBill(id) {
  const data = load();
  delete data.bills[id];
  saveUtilities(data);
  return data;
}

// Estimated monthly cost for one utility: average of bills within the trailing
// 12 months, falling back to its typicalAmount, then 0.
export function estimatedMonthly(utility, billsForUtility) {
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const cutoffMonth = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}`;
  const recent = (billsForUtility || []).filter(b => b.periodMonth && b.periodMonth >= cutoffMonth && b.amount != null);
  if (recent.length > 0) {
    return recent.reduce((s, b) => s + (Number(b.amount) || 0), 0) / recent.length;
  }
  return Number(utility?.typicalAmount) || 0;
}

// Sum of estimatedMonthly across active utilities. Shared by Dashboard + Lifecycle.
export function monthlyUtilitiesTotal(utilData) {
  const utilities = Object.values(utilData?.utilities ?? {}).filter(u => u.active);
  const bills = Object.values(utilData?.bills ?? {});
  return utilities.reduce((sum, u) => {
    const forU = bills.filter(b => b.utilityId === u.id);
    return sum + estimatedMonthly(u, forU);
  }, 0);
}
