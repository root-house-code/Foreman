// Local, zero-network bill extraction — the alternative to lib/billsGroq.js for
// users who don't want email content sent to a third-party LLM. Same output shape
// as billsGroq's extractBillFromEmail so lib/gmailSync.js can swap between them
// without changing anything downstream (dedupe, review queue, import).
//
// Classification is nearly free here: Foreman only ever scans messages the user
// has already routed into their chosen Gmail label via their own filter, so unlike
// the AI path we don't re-derive "is this a bill" from content — we assume yes,
// and fall back to isBill:false only if extraction found nothing at all (no
// amount, no date), which usually means the format wasn't recognized.
//
// This trades recall for privacy: bills that bury the total in a table with no
// adjacent label, or use phrasing outside the lists below, will come through with
// low/no confidence and need manual entry — there is no LLM here to infer intent
// from context.

import { FIXED_UTILITY_TYPES, DEFAULT_UNIT } from "./utilities.js";

// Small built-in lookup for common providers — a fallback (derive vendor name
// from the sender's domain, type "Other") covers everyone not in this list, so
// this table is an accuracy boost, not a requirement.
const VENDOR_DOMAINS = [
  ["pge.com", "PG&E", "Electricity"],
  ["coned.com", "Con Edison", "Electricity"],
  ["duke-energy.com", "Duke Energy", "Electricity"],
  ["xcelenergy.com", "Xcel Energy", "Electricity"],
  ["sce.com", "Southern California Edison", "Electricity"],
  ["nationalgrid.com", "National Grid", "Natural Gas"],
  ["socalgas.com", "SoCalGas", "Natural Gas"],
  ["americanwater.com", "American Water", "Water"],
  ["wm.com", "Waste Management", "Garbage / Trash"],
  ["republicservices.com", "Republic Services", "Garbage / Trash"],
  ["comcast.net", "Comcast/Xfinity", "Internet"],
  ["xfinity.com", "Xfinity", "Internet"],
  ["spectrum.com", "Spectrum", "Cable / TV"],
  ["cox.com", "Cox Communications", "Internet"],
  ["att.com", "AT&T", "Phone / Mobile"],
  ["verizon.com", "Verizon", "Phone / Mobile"],
  ["t-mobile.com", "T-Mobile", "Phone / Mobile"],
];

const AMOUNT_KEYWORDS = /total\s+(?:amount\s+)?due|amount\s+due|balance\s+due|current\s+charges|total\s+amount|amount\s+payable|new\s+charges|please\s+pay/i;
const DUE_DATE_KEYWORDS = /due\s+date|payment\s+due|due\s+by|pay\s+by/i;
const PERIOD_KEYWORDS = /service\s+period|billing\s+period|for\s+the\s+period|billing\s+cycle|statement\s+period/i;
const ACCOUNT_KEYWORDS = /account\s*(?:number|no\.?|#)|acct\.?\s*(?:no\.?|#)?/i;

const MONEY_RE = /\$?\s?(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})/;
const SEARCH_WINDOW = 120;

function windowAfter(text, index, len = SEARCH_WINDOW) {
  return text.slice(index, index + len);
}

function extractAmount(text) {
  const kw = text.match(AMOUNT_KEYWORDS);
  if (kw) {
    const m = windowAfter(text, kw.index).match(MONEY_RE);
    if (m) return parseFloat(m[1].replace(/,/g, ""));
  }
  // No labeled total found — fall back to the largest dollar figure anywhere in
  // the email, which is usually (not always) the bill total rather than a
  // line-item charge.
  const all = [...text.matchAll(new RegExp(MONEY_RE, "g"))].map(m => parseFloat(m[1].replace(/,/g, "")));
  return all.length ? Math.max(...all) : null;
}

function isoDate(y, m, d) {
  const yy = y.length === 2 ? `20${y}` : y;
  const date = new Date(Number(yy), Number(m) - 1, Number(d));
  if (isNaN(date)) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDateFragment(fragment) {
  let m = fragment.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) return isoDate(m[3], m[1], m[2]);

  m = fragment.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return isoDate(m[1], m[2], m[3]);

  m = fragment.match(/([A-Z][a-z]{2,8})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const d = new Date(`${m[1]} ${m[2]}, ${m[3]}`);
    if (!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return null;
}

function extractDate(text, keywordRe) {
  const kw = text.match(keywordRe);
  const fragment = kw ? windowAfter(text, kw.index) : text.slice(0, 400);
  return parseDateFragment(fragment);
}

function extractAccountNumber(text) {
  const kw = text.match(ACCOUNT_KEYWORDS);
  if (!kw) return null;
  const m = windowAfter(text, kw.index, 40).match(/[\d][\d\s-]{4,18}\d/);
  return m ? m[0].trim() : null;
}

// Metered consumption (e.g. "1,234 kWh", "56 therms", "3,200 gallons") — only
// meaningful for utility types DEFAULT_UNIT knows about; flat-rate services
// (internet, cable, trash, HOA, ...) have no usage figure to find.
function unitPattern(unit) {
  if (unit === "kWh") return "k\\s?wh";
  if (unit === "therms") return "therms?";
  if (unit === "gallons") return "gal(?:lons?)?\\.?";
  return null;
}

function extractUsage(text, utilityType) {
  const unit = DEFAULT_UNIT[utilityType];
  const pattern = unit && unitPattern(unit);
  if (!pattern) return null;
  const m = text.match(new RegExp(`(\\d[\\d,]*(?:\\.\\d+)?)\\s*${pattern}`, "i"));
  return m ? parseFloat(m[1].replace(/,/g, "")) : null;
}

function extractVendor(meta) {
  const from = (meta.from || "").toLowerCase();
  const domainMatch = from.match(/@([\w.-]+)/);
  const domain = domainMatch ? domainMatch[1] : null;
  if (domain) {
    const known = VENDOR_DOMAINS.find(([d]) => domain.includes(d));
    if (known) return { vendorName: known[1], utilityType: known[2] };

    const parts = domain.split(".");
    const base = parts.length >= 2 ? parts[parts.length - 2] : domain;
    const name = base.charAt(0).toUpperCase() + base.slice(1);
    return { vendorName: name, utilityType: "Other" };
  }
  return { vendorName: null, utilityType: "Other" };
}

// Same signature shape as billsGroq's extractBillFromEmail, minus the apiKey
// param — purely synchronous and local, no network involved at all.
export function extractBillFromEmailLocal(emailText, meta) {
  const amount = extractAmount(emailText);
  const dueDate = extractDate(emailText, DUE_DATE_KEYWORDS);
  const periodStart = extractDate(emailText, PERIOD_KEYWORDS);
  const periodMonth = (periodStart || dueDate || "").slice(0, 7) || null;

  if (amount == null && !dueDate && !periodMonth) {
    return {
      isBill: false, confidence: "low", utilityType: "Other", vendorName: null,
      accountNumber: null, amount: null, periodMonth: null, dueDate: null, billingCycle: null, usage: null,
    };
  }

  const { vendorName, utilityType: rawType } = extractVendor(meta);
  const utilityType = FIXED_UTILITY_TYPES.includes(rawType) ? rawType : "Other";
  const confidence = (amount != null && (dueDate || periodMonth)) ? "high" : "medium";

  return {
    isBill: true,
    confidence,
    utilityType,
    vendorName,
    accountNumber: extractAccountNumber(emailText),
    amount,
    periodMonth,
    dueDate,
    billingCycle: null,
    usage: extractUsage(emailText, utilityType),
  };
}
