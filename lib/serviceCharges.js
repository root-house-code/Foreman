// Generates the historical service charges for the Finances → Ledger.
//
// A recurring service is assumed paid on its billing cycle (the user doesn't log
// each payment). Charges are generated from the service's "paying since" start
// date (or the trailing 12 months when blank) through now, priced by the service's
// cost-history segments (so a later cost change doesn't restate past months). A
// logged visit corrects the charge for the period it falls in — its overrideCost
// (or the service cost) replaces the generated amount; off-cycle visits become
// their own rows. Pure functions over store slices — no React, no storage.

function ym(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthIndex(d) { return d.getFullYear() * 12 + d.getMonth(); }
function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function parseDate(iso) {
  if (!iso) return null;
  const d = new Date((iso.length === 7 ? iso + "-01" : iso) + "T00:00:00");
  return isNaN(d) ? null : d;
}

// Cost effective for a given month "YYYY-MM": the latest cost segment whose `from`
// is on or before that month; months before the first segment use the first.
export function effectiveCostAt(service, ymKey) {
  const hist = service.costHistory;
  if (!hist || !hist.length) return Number(service.cost) || 0;
  const sorted = [...hist].sort((a, b) => a.from.localeCompare(b.from));
  let cost = sorted[0].cost;
  for (const seg of sorted) {
    if (seg.from.slice(0, 7) <= ymKey) cost = seg.cost; else break;
  }
  return Number(cost) || 0;
}

// First-of-month Dates in [start, now] that incur a charge for this billing cycle,
// anchored on the renewal date (falling back to the start month).
function chargeMonths(service, start, now) {
  const cycle = service.billingCycle;
  const anchor = parseDate(service.renewalDate) || start;
  const anchorIdx = monthIndex(anchor);
  const startIdx = monthIndex(start);
  const nowIdx = monthIndex(now);
  const out = [];
  for (let idx = startIdx; idx <= nowIdx; idx++) {
    const d = new Date(Math.floor(idx / 12), ((idx % 12) + 12) % 12, 1);
    let charge = false;
    if (cycle === "monthly") charge = true;
    else if (cycle === "quarterly") charge = ((((idx - anchorIdx) % 3) + 3) % 3) === 0;
    else if (cycle === "annual") charge = d.getMonth() === anchor.getMonth();
    else if (cycle === "one-time") charge = idx === anchorIdx;
    if (charge) out.push(d);
  }
  return out;
}

/**
 * Returns generated charge rows for one service:
 *   { ym, date: "YYYY-MM-DD", amount, corrected, offCycle?, visitId? }
 * `visits` are this service's visits. Inactive services produce no history.
 */
export function generateServiceCharges(service, visits = [], now = new Date()) {
  if (!service || !service.active) return [];
  let start = parseDate(service.startDate);
  if (!start) start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  start = firstOfMonth(start);
  if (start > now) start = firstOfMonth(now);

  // Visits summed by month (a visit's cost = its overrideCost, else the service cost).
  const vByYm = {};
  visits.forEach(v => {
    if (!v.date) return;
    const k = v.date.slice(0, 7);
    const c = v.overrideCost != null && v.overrideCost !== ""
      ? Number(v.overrideCost) : (Number(service.cost) || 0);
    if (!vByYm[k]) vByYm[k] = { amount: 0, visitId: v.id, date: v.date };
    vByYm[k].amount += Number(c) || 0;
  });

  const rows = [];
  const seen = new Set();
  chargeMonths(service, start, now).forEach(d => {
    const k = ym(d);
    seen.add(k);
    if (vByYm[k]) {
      rows.push({ ym: k, date: vByYm[k].date, amount: vByYm[k].amount, corrected: true, visitId: vByYm[k].visitId });
    } else {
      rows.push({ ym: k, date: `${k}-01`, amount: effectiveCostAt(service, k), corrected: false });
    }
  });
  // Visits in months with no generated charge (off-cycle) still count as spend.
  Object.entries(vByYm).forEach(([k, v]) => {
    if (!seen.has(k)) rows.push({ ym: k, date: v.date, amount: v.amount, corrected: true, offCycle: true, visitId: v.visitId });
  });
  return rows;
}
