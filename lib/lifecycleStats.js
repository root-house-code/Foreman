// Shared derived calculations for the Lifecycle page and any cross-page surfacing
// (Dashboard cost stat, Calendar warranty chips). Pure functions over store slices
// so both consumers compute identically — no React, no storage writes.

import { loadData } from "./data.js";
import { getItemStableKey } from "./itemKeys.js";
import { getEffectiveRowState } from "./inventory.js";
import { expectedYears } from "./lifespans.js";

const MS_PER_YEAR = 365.25 * 86400000;

/**
 * Builds the roster of included inventory items, joined to their price and dates.
 * Each entry: { stableKey, category, item, categoryType, price, installIso, installSource, warrantyIso }.
 */
export function buildRoster(itemFieldValues, inventory) {
  const rows = loadData();
  const seen = new Set();
  const items = [];
  rows.forEach(row => {
    if (!row.category || !row.item) return;
    if (getEffectiveRowState(inventory, row) !== "included") return;
    const stableKey = getItemStableKey(row);
    if (seen.has(stableKey)) return;
    seen.add(stableKey);

    const vals = (itemFieldValues || {})[stableKey] || {};
    const price = parseFloat(vals.purchase_price);
    const installSource = vals.install_date ? "install"
      : vals.purchase_date ? "purchase"
      : vals.manufactured_date ? "manufactured" : null;
    items.push({
      stableKey,
      category: row.category,
      item: row.item,
      categoryType: row.categoryType,
      price: isNaN(price) ? null : price,
      installIso: vals.install_date || vals.purchase_date || vals.manufactured_date || null,
      installSource,
      warrantyIso: vals.warranty_expiry || null,
    });
  });
  return items;
}

/** Items with a curated lifespan and a usable date, aged and sorted soonest-first. */
export function computeForecast(roster, now = new Date()) {
  const out = [];
  roster.forEach(it => {
    const exp = expectedYears(it.item);
    if (exp == null || !it.installIso) return;
    const installed = new Date(it.installIso + "T00:00:00");
    if (isNaN(installed)) return;
    const age = (now - installed) / MS_PER_YEAR;
    if (age < 0) return; // future date
    const remaining = exp - age;
    const pct = Math.max(0, Math.min(100, (remaining / exp) * 100));
    out.push({ ...it, exp, installed, age, remaining, pct, estCost: it.price });
  });
  return out.sort((a, b) => a.remaining - b.remaining);
}

/** Suggested annual reserve: each near-term replacement spread across its runway. */
export function computeReserve(forecast) {
  let annual = 0, count = 0, priced = 0;
  forecast.forEach(f => {
    if (f.remaining > 5) return; // only items within ~5 years of end-of-life (or overdue)
    count += 1;
    if (f.estCost != null) { annual += f.estCost / Math.max(f.remaining, 1); priced += 1; }
  });
  return { annual, count, priced };
}

/** Warranties expiring within the window (default: lapsed ≤30d ago through 90d out). */
export function computeWarranties(roster, now = new Date(), lowerDays = -30, upperDays = 90) {
  const out = [];
  roster.forEach(it => {
    if (!it.warrantyIso) return;
    const exp = new Date(it.warrantyIso + "T00:00:00");
    if (isNaN(exp)) return;
    const days = Math.round((exp - now) / 86400000);
    if (days < lowerDays || days > upperDays) return;
    out.push({ ...it, warrantyDate: exp, days });
  });
  return out.sort((a, b) => a.days - b.days);
}

/** Sum of recorded purchase prices across the roster. */
export function computeInvested(roster) {
  let total = 0, priced = 0;
  roster.forEach(it => { if (it.price != null) { total += it.price; priced += 1; } });
  return { total, priced, count: roster.length };
}

/** Trailing-12-month logged repair/part spend. */
export function computeRepairs12mo(expensesMap, now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  let total = 0;
  Object.values(expensesMap || {}).forEach(e => {
    if (e.date && e.date >= cutoffIso) total += (e.amount || 0);
  });
  return total;
}
