// Forward, time-phased operating-cost projection for the Lifecycle → Budget tab.
// Pure functions over store slices (no React, no storage) so the Budget tab and
// the Dashboard run-cost stat compute identically.
//
// The model: for an N-month horizon starting this month, each month's expected
// outflow is the sum of recurring lines —
//   • Services   — projected from each active service's billing cycle + renewal date
//   • Utilities  — a seasonal per-calendar-month average of logged bills
//   • Reserve    — the replacement set-aside (annual / 12), toggleable
//   • Repairs    — a trailing-12-month repairs baseline (total / 12), toggleable
//   • Planned    — user-entered one-off line items pinned to a month
// Warranty expiries land as non-dollar markers (risk flags), not added to totals.

import { estimatedMonthly, utilityMonthsPerCycle } from "./utilities.js";

// "YYYY-MM" key for a Date.
export function ymKeyOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// Absolute month index (year*12 + month) for modular cadence math.
function monthIndex(date) {
  return date.getFullYear() * 12 + date.getMonth();
}

// Seasonal monthly utility estimate for a given calendar month (0–11): mean of
// that utility's bills whose period falls in the same calendar month across all
// history; falls back to the trailing-12 average (estimatedMonthly), then 0.
// Summed across active utilities.
export function seasonalUtilityMonthly(utilData, calMonth) {
  const utilities = Object.values(utilData?.utilities ?? {}).filter(u => u.active);
  const allBills = Object.values(utilData?.bills ?? {});
  const mm = String(calMonth + 1).padStart(2, "0");
  return utilities.reduce((sum, u) => {
    const forU = allBills.filter(b => b.utilityId === u.id && b.amount != null);
    // Non-monthly utilities split each bill evenly across its cycle into a steady
    // monthly expense (a $200 every-2-months bill reads as $100/mo).
    if (utilityMonthsPerCycle(u.billingCycle) !== 1) {
      return sum + estimatedMonthly(u, forU);
    }
    // Monthly utilities use this calendar month's seasonal average (preserving the
    // seasonal swing), falling back to the monthly estimate for unlogged months.
    const seasonal = forU.filter(b => b.periodMonth && b.periodMonth.slice(5, 7) === mm);
    const seasonalAvg = seasonal.length > 0
      ? seasonal.reduce((s, b) => s + (Number(b.amount) || 0), 0) / seasonal.length
      : null;
    return sum + (seasonalAvg != null ? seasonalAvg : estimatedMonthly(u, forU));
  }, 0);
}

// Project one service's charges across the horizon's month-anchor Dates.
// Returns an array aligned to monthDates. Dated cadences (annual/quarterly/one-
// time) land in the renewal month; without a renewal date they smear evenly so
// the annual total stays honest (one-time with no date can't be placed → 0).
export function projectServiceCharges(service, monthDates) {
  const cost = Number(service.cost) || 0;
  const n = monthDates.length;
  const out = new Array(n).fill(0);
  if (cost <= 0) return out;

  const cycle = service.billingCycle;
  if (cycle === "monthly") {
    return out.fill(cost);
  }

  const anchor = service.renewalDate ? new Date(service.renewalDate + "T00:00:00") : null;
  const haveAnchor = anchor && !isNaN(anchor);

  if (cycle === "quarterly") {
    if (haveAnchor) {
      const aIdx = monthIndex(anchor);
      monthDates.forEach((d, i) => {
        if ((((monthIndex(d) - aIdx) % 3) + 3) % 3 === 0) out[i] = cost;
      });
    } else {
      out.fill(cost / 3);
    }
    return out;
  }

  if (cycle === "annual") {
    if (haveAnchor) {
      monthDates.forEach((d, i) => { if (d.getMonth() === anchor.getMonth()) out[i] = cost; });
    } else {
      out.fill(cost / 12);
    }
    return out;
  }

  // one-time — a single charge in its month if it lands in the horizon
  if (haveAnchor) {
    const aIdx = monthIndex(anchor);
    monthDates.forEach((d, i) => { if (monthIndex(d) === aIdx) out[i] = cost; });
  }
  return out;
}

// Mortgage is modelled like a recurring bill: a default monthly payment that any
// month can override. The escrow sub-field splits the payment into financing
// (principal & interest) and operating cost (taxes + insurance).
export function mortgageForMonth(mortgage, ym) {
  if (!mortgage) return { total: 0, pi: 0, escrow: 0, overridden: false };
  const overridden = Object.prototype.hasOwnProperty.call(mortgage.overrides || {}, ym);
  const total = (Number(overridden ? mortgage.overrides[ym] : mortgage.defaultMonthly) || 0);
  const escrow = Math.min(Number(mortgage.escrowMonthly) || 0, total);
  return { total, pi: total - escrow, escrow, overridden };
}

// A month ledger spanning `back` past months through `forward` future months,
// each carrying its effective payment (override ?? default) and P&I/escrow split.
// This is where past-month corrections are made; the forecast chart stays forward.
export function mortgageLedger(mortgage, { now = new Date(), back = 6, forward = 12 } = {}) {
  const nowYm = ymKeyOf(now);
  const out = [];
  for (let i = -back; i < forward; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const ym = ymKeyOf(d);
    out.push({
      ym,
      date: d,
      label: d.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      isCurrent: ym === nowYm,
      isPast: i < 0,
      ...mortgageForMonth(mortgage, ym),
    });
  }
  return out;
}

// True once there's a payment to project (a default or any override).
export function hasMortgage(mortgage) {
  return !!mortgage && ((Number(mortgage.defaultMonthly) || 0) > 0 || Object.keys(mortgage.overrides || {}).length > 0);
}

// Build the N-month forecast. Returns one bucket per month with category lines,
// service detail, warranty markers, and the month total. Mortgage rides along as
// its own field — financing, not operating — so it never enters the run-rate `total`.
export function buildForecast({
  svcData, utilData, reserveAnnual = 0, repairs12mo = 0, warranties = [],
  planned = {}, mortgage = null, opts = {}, now = new Date(), horizon = 12,
}) {
  const includeReserve = opts.includeReserve !== false;
  const includeRepairs = opts.includeRepairsBaseline !== false;

  const monthDates = [];
  for (let i = 0; i < horizon; i++) {
    monthDates.push(new Date(now.getFullYear(), now.getMonth() + i, 1));
  }

  const services = Object.values(svcData?.services ?? {}).filter(s => s.active);
  const projections = services.map(s => ({ s, charges: projectServiceCharges(s, monthDates) }));

  const reserveMonthly = includeReserve ? (Number(reserveAnnual) || 0) / 12 : 0;
  const repairsMonthly = includeRepairs ? (Number(repairs12mo) || 0) / 12 : 0;

  const markersByYm = {};
  warranties.forEach(w => {
    if (!w.warrantyDate || isNaN(w.warrantyDate)) return;
    const k = ymKeyOf(w.warrantyDate);
    (markersByYm[k] ??= []).push(w);
  });

  const nowYm = ymKeyOf(now);

  return monthDates.map((d, i) => {
    const ym = ymKeyOf(d);
    const svcLines = [];
    let servicesTotal = 0;
    projections.forEach(({ s, charges }) => {
      if (charges[i] > 0) { svcLines.push({ name: s.name, amount: charges[i] }); servicesTotal += charges[i]; }
    });
    const utilities = seasonalUtilityMonthly(utilData, d.getMonth());
    const plannedItems = planned[ym] || [];
    const plannedTotal = plannedItems.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const total = servicesTotal + utilities + reserveMonthly + repairsMonthly + plannedTotal;
    const mort = mortgageForMonth(mortgage, ym);
    return {
      ym,
      date: d,
      label: d.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      shortLabel: d.toLocaleDateString("en-US", { month: "short" }),
      isCurrent: ym === nowYm,
      services: svcLines.sort((a, b) => b.amount - a.amount),
      servicesTotal,
      utilities,
      reserve: reserveMonthly,
      repairs: repairsMonthly,
      planned: plannedItems,
      plannedTotal,
      markers: markersByYm[ym] || [],
      total,                                  // operating run-rate (mortgage excluded)
      mortgage: mort.total,
      mortgagePI: mort.pi,
      mortgageEscrow: mort.escrow,
      mortgageOverridden: mort.overridden,
      outlay: total + mort.total,             // total cash leaving the account
    };
  });
}

// Headline rollups across the horizon.
export function summarize(forecast) {
  if (!forecast || forecast.length === 0) {
    return { avgMonthly: 0, annualTotal: 0, heaviest: null, lightest: null };
  }
  const annualTotal = forecast.reduce((s, m) => s + m.total, 0);
  let heaviest = forecast[0], lightest = forecast[0];
  forecast.forEach(m => {
    if (m.total > heaviest.total) heaviest = m;
    if (m.total < lightest.total) lightest = m;
  });
  return { avgMonthly: annualTotal / forecast.length, annualTotal, heaviest, lightest };
}

// Concretely logged outflow for a month ("YYYY-MM"): utility bills + expenses +
// service-visit costs. The actuals yardstick for elapsed/current months.
export function actualForMonth(ym, { utilData, expensesMap, svcData }) {
  let total = 0;
  Object.values(utilData?.bills ?? {}).forEach(b => {
    if (b.periodMonth === ym && b.amount != null) total += Number(b.amount) || 0;
  });
  Object.values(expensesMap ?? {}).forEach(e => {
    if (e.date && e.date.slice(0, 7) === ym && e.amount != null) total += Number(e.amount) || 0;
  });
  Object.values(svcData?.visits ?? {}).forEach(v => {
    if (!v.date || v.date.slice(0, 7) !== ym) return;
    const svc = svcData?.services?.[v.serviceId];
    const c = v.overrideCost != null ? v.overrideCost : (svc ? svc.cost : null);
    if (c != null) total += Number(c) || 0;
  });
  return total;
}

// True when there's enough data to make a forecast worth showing.
export function hasBudgetInputs({ svcData, utilData, expensesMap }) {
  const anyService = Object.values(svcData?.services ?? {}).some(s => s.active);
  const anyUtility = Object.values(utilData?.utilities ?? {}).some(u => u.active);
  const anyExpense = Object.keys(expensesMap ?? {}).length > 0;
  return anyService || anyUtility || anyExpense;
}
