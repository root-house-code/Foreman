import { storageGet, storageSet } from "./storage.js";

// User-facing budget settings for the Lifecycle → Budget tab. The forecast itself
// is derived at read time (lib/budgetForecast.js) from services/utilities/expenses;
// this key holds only what the user sets:
//
// Budget: {
//   monthlyTarget: number | null,          // target spend per month (the yardstick)
//   includeReserve: bool,                  // fold the replacement set-aside into the run rate
//   includeRepairsBaseline: bool,          // fold trailing-12 repairs / 12 into the run rate
//   planned: { [ym]: [{ id, label, amount }] },  // one-off line items pinned to a month
//   mortgage: {                            // a recurring bill, modelled like Utilities
//     label: string,
//     defaultMonthly: number | null,       // the type-once payment; fills any un-overridden month
//     escrowMonthly: number | null,        // portion of the payment that is escrow (taxes + insurance)
//     overrides: { [ym]: number },         // retroactive corrections + known future changes
//   },
// }

const KEY = "foreman-budget";

export const DEFAULT_MORTGAGE = {
  label: "Mortgage",
  defaultMonthly: null,
  escrowMonthly: null,
  overrides: {},
};

export const DEFAULT_BUDGET = {
  monthlyTarget: null,
  includeReserve: true,
  includeRepairsBaseline: true,
  planned: {},
  mortgage: { ...DEFAULT_MORTGAGE },
};

export function loadBudget() {
  try {
    const raw = storageGet(KEY);
    if (!raw || typeof raw !== "object") return { ...DEFAULT_BUDGET, mortgage: { ...DEFAULT_MORTGAGE } };
    return {
      ...DEFAULT_BUDGET,
      ...raw,
      planned: raw.planned ?? {},
      mortgage: { ...DEFAULT_MORTGAGE, ...(raw.mortgage || {}), overrides: raw.mortgage?.overrides ?? {} },
    };
  } catch {
    return { ...DEFAULT_BUDGET, mortgage: { ...DEFAULT_MORTGAGE } };
  }
}

export function saveBudget(budget) {
  storageSet(KEY, budget);
  return budget;
}

// Shallow-merge top-level settings (monthlyTarget, toggles).
export function setBudgetSettings(updates) {
  const next = { ...loadBudget(), ...updates };
  return saveBudget(next);
}

// Add a planned line item to a month ("YYYY-MM").
export function addPlanned(ym, item) {
  const b = loadBudget();
  const planned = { ...b.planned, [ym]: [...(b.planned[ym] || []), item] };
  return saveBudget({ ...b, planned });
}

// Remove a planned line item from a month by id.
export function removePlanned(ym, id) {
  const b = loadBudget();
  const forMonth = (b.planned[ym] || []).filter(p => p.id !== id);
  const planned = { ...b.planned };
  if (forMonth.length) planned[ym] = forMonth;
  else delete planned[ym];
  return saveBudget({ ...b, planned });
}

// ── Mortgage (recurring bill: a default payment + per-month overrides) ──────────

// Shallow-merge mortgage settings (defaultMonthly, escrowMonthly, label).
export function setMortgage(updates) {
  const b = loadBudget();
  return saveBudget({ ...b, mortgage: { ...b.mortgage, ...updates } });
}

// Pin a specific month ("YYYY-MM") to an actual/known payment amount.
export function setMortgageOverride(ym, amount) {
  const b = loadBudget();
  const overrides = { ...b.mortgage.overrides, [ym]: amount };
  return saveBudget({ ...b, mortgage: { ...b.mortgage, overrides } });
}

// Drop a month's override so it falls back to defaultMonthly again.
export function clearMortgageOverride(ym) {
  const b = loadBudget();
  const overrides = { ...b.mortgage.overrides };
  delete overrides[ym];
  return saveBudget({ ...b, mortgage: { ...b.mortgage, overrides } });
}
