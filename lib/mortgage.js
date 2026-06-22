// Pure mortgage amortization helpers — turn a loan's terms (principal, rate, term,
// start) into the numbers a homeowner actually wants: current balance, payoff date,
// interest paid/remaining, the full amortization schedule, and equity vs the home's
// value. No React, no storage. Complements the cash-flow model in budgetForecast.js:
// those drive the budget from a flat monthly payment; these derive the real loan.

// Standard amortized monthly principal & interest for a fully-amortizing loan.
export function monthlyPI(principal, annualRatePct, termMonths) {
  const P = Number(principal) || 0;
  const n = Number(termMonths) || 0;
  if (P <= 0 || n <= 0) return 0;
  const r = (Number(annualRatePct) || 0) / 100 / 12;
  if (r === 0) return P / n;
  return (P * r) / (1 - Math.pow(1 + r, -n));
}

// True once enough loan terms are entered to amortize.
export function hasLoanTerms(m) {
  return !!m && (Number(m.principal) || 0) > 0 && (Number(m.termYears) || 0) > 0 && !!m.startMonth;
}

// Full amortization: a summary plus the month-by-month schedule. Returns
// { hasLoan: false } until the terms are present.
export function amortization(m, now = new Date()) {
  if (!hasLoanTerms(m)) return { hasLoan: false };
  const P = Number(m.principal);
  const termMonths = Math.round(Number(m.termYears) * 12);
  const r = (Number(m.rate) || 0) / 100 / 12;
  const pi = monthlyPI(P, m.rate, termMonths);
  const [sy, sm] = m.startMonth.split("-").map(Number);
  const nowYear = now.getFullYear();
  // Payments completed so far (clamped to the loan's life).
  const elapsed = Math.max(0, Math.min((now.getFullYear() - sy) * 12 + (now.getMonth() + 1 - sm), termMonths));

  const schedule = [];
  let bal = P;
  let currentBalance = P;
  let principalPaid = 0, interestPaid = 0, interestRemaining = 0, interestThisYear = 0, totalInterest = 0;
  for (let i = 0; i < termMonths && bal > 0.005; i++) {
    const interest = bal * r;
    let principal = pi - interest;
    if (principal > bal) principal = bal; // final payment trims to the balance
    const d = new Date(sy, (sm - 1) + i, 1);
    const year = d.getFullYear();
    bal = Math.max(0, bal - principal);
    schedule.push({ ym: `${year}-${String(d.getMonth() + 1).padStart(2, "0")}`, year, interest, principal, balance: bal });
    totalInterest += interest;
    if (year === nowYear) interestThisYear += interest;
    if (i < elapsed) { interestPaid += interest; principalPaid += principal; currentBalance = bal; }
    else interestRemaining += interest;
  }
  if (elapsed === 0) currentBalance = P;

  return {
    hasLoan: true,
    pi,
    termMonths,
    elapsed,
    monthsRemaining: Math.max(0, termMonths - elapsed),
    originalPrincipal: P,
    currentBalance,
    principalPaid,
    interestPaid,
    interestRemaining,
    interestThisYear,
    totalInterest,
    payoffDate: new Date(sy, (sm - 1) + termMonths, 1),
    schedule,
  };
}

// Equity position against the home's value. PMI is generally cancellable on request
// at 80% loan-to-value (auto-terminates at 78%). Returns null without a home value.
export function equityStats(currentBalance, homeValue) {
  const hv = Number(homeValue) || 0;
  if (hv <= 0) return null;
  const bal = Number(currentBalance) || 0;
  const ltv = bal / hv;
  return {
    homeValue: hv,
    equity: hv - bal,
    ltv,
    pmiRemovable: ltv <= 0.8,
    pmiTargetBalance: 0.8 * hv, // balance you must reach to drop PMI
  };
}
