import { storageGet } from "./storage.js";
import { loadUtilities } from "./utilities.js";
import { loadGroqApiKey } from "./groqConfig.js";
import { loadGmailImportSettings, saveGmailImportSettings, isProcessed, markProcessed } from "./gmailImport.js";
import { extractBillFromEmail } from "./billsGroq.js";
import { extractBillFromEmailLocal } from "./billsHeuristics.js";
import {
  listLabels, searchLabelMessages, getMessage,
  getHeader, extractBodyText, findPdfAttachmentParts, extractAttachmentPdfText,
} from "./gmailApi.js";

export class ReauthRequiredError extends Error {
  constructor() { super("Gmail connection expired"); this.name = "ReauthRequiredError"; }
}
export class LabelNotFoundError extends Error {
  constructor(label) { super(`Label not found: ${label}`); this.name = "LabelNotFoundError"; this.label = label; }
}
export class OnlineModeError extends Error {
  constructor() { super("Online mode is required"); this.name = "OnlineModeError"; }
}
export class NotConnectedError extends Error {
  constructor() { super("Gmail is not connected"); this.name = "NotConnectedError"; }
}

function displayUtilityType(u) {
  return u.type === "Other" ? (u.customType || "Other") : (u.type || "Unknown");
}

function sameBill(a, b) {
  return a.periodMonth === b.periodMonth &&
    a.amount != null && b.amount != null &&
    Math.abs(Number(a.amount) - Number(b.amount)) < 0.01 &&
    String(a.utilityType || "").toLowerCase() === String(b.utilityType || "").toLowerCase();
}

// Flag a candidate as a likely duplicate of either (a) an already-recorded bill in
// Foreman, or (b) another candidate already surfaced earlier in this same sync
// batch — e.g. a "bill is ready" email and a separate reminder for the same
// period/amount are different Gmail messages, so neither is in `bills` yet, and
// without this second check both would sail through unflagged. Never drops a
// match — the UI dims and pre-deselects duplicates but keeps them visible (tenet 9).
function isLikelyDuplicate(candidate, utilData, priorCandidates) {
  if (!candidate.periodMonth || candidate.amount == null) return false;

  const utilities = Object.values(utilData.utilities || {});
  const bills = Object.values(utilData.bills || {});
  const typeMatch = new Set(
    utilities
      .filter(u => displayUtilityType(u).toLowerCase() === String(candidate.utilityType || "").toLowerCase())
      .map(u => u.id)
  );
  const dupOfSavedBill = bills.some(b =>
    typeMatch.has(b.utilityId) &&
    b.periodMonth === candidate.periodMonth &&
    b.amount != null &&
    Math.abs(Number(b.amount) - Number(candidate.amount)) < 0.01
  );
  if (dupOfSavedBill) return true;

  return (priorCandidates || []).some(c => sameBill(c, candidate));
}

// Orchestrates one "Sync Now": token → label check → search → per-message extract
// (local regex or Groq, per the user's chosen parseMode) → dedupe flag. Returns
// { candidates, scannedCount, skippedNonBill, parseMode }. All scanned message IDs
// are marked processed before returning, so a re-run never re-fetches or
// re-classifies the same message even if the user rejects everything in review.
//
// Fetching from Gmail's API is itself a network call regardless of parse mode, so
// Online Mode (Foreman's blanket "may talk to the internet" switch) stays a hard
// requirement either way — "local" only means email content never additionally
// goes to a third party (Groq) for parsing, not that the sync is offline-capable.
export async function runGmailSync({ onProgress } = {}) {
  if (storageGet("foreman-online-mode") !== true) throw new OnlineModeError();

  const { label, parseMode } = loadGmailImportSettings();
  const useAi = parseMode === "ai";

  const apiKey = useAi ? loadGroqApiKey() : null;
  if (useAi && !apiKey) throw new Error("Groq API key not configured. Add one in Preferences → Integrations.");

  const tok = await window.foreman.gmailGetAccessToken();
  if (tok?.error === "reauth_required") throw new ReauthRequiredError();
  if (tok?.error === "not_connected" || tok?.error === "not_configured") throw new NotConnectedError();
  if (!tok?.accessToken) throw new Error("Could not obtain a Gmail access token. Try again shortly.");
  const accessToken = tok.accessToken;

  const labels = await listLabels(accessToken);
  if (!labels.some(l => l.name === label)) throw new LabelNotFoundError(label);

  const stubs = await searchLabelMessages(accessToken, label);
  const toScan = stubs.filter(s => !isProcessed(s.id));

  const utilData = loadUtilities();
  const candidates = [];
  const scannedIds = [];
  let skippedNonBill = 0;

  for (let i = 0; i < toScan.length; i++) {
    const stub = toScan[i];
    onProgress?.({ done: i, total: toScan.length });
    try {
      const msg = await getMessage(accessToken, stub.id);
      const payload = msg.payload;
      const meta = {
        subject: getHeader(payload, "Subject"),
        from: getHeader(payload, "From"),
        date: getHeader(payload, "Date"),
      };

      let text = extractBodyText(payload);
      for (const pdf of findPdfAttachmentParts(payload)) {
        try { text += "\n\n" + await extractAttachmentPdfText(accessToken, stub.id, pdf); }
        catch { /* unreadable attachment — body text alone still parses */ }
      }

      const result = useAi
        ? await extractBillFromEmail(text, meta, apiKey)
        : extractBillFromEmailLocal(text, meta);
      scannedIds.push(stub.id);

      if (result?.isBill) {
        candidates.push({
          messageId: stub.id,
          subject: meta.subject,
          from: meta.from,
          date: meta.date,
          confidence: result.confidence || "medium",
          utilityType: result.utilityType || "Other",
          vendorName: result.vendorName || null,
          accountNumber: result.accountNumber || null,
          amount: result.amount != null ? Number(result.amount) : null,
          periodMonth: result.periodMonth || null,
          dueDate: result.dueDate || null,
          billingCycle: result.billingCycle || null,
          usage: result.usage != null ? Number(result.usage) : null,
          likelyDuplicate: isLikelyDuplicate(result, utilData, candidates),
        });
      } else {
        skippedNonBill++;
      }
    } catch (err) {
      const msg = err?.message || String(err);
      const status = err?.status || (msg.match(/\b(429|401|403)\b/) || [])[0];
      // Rate limit / auth error — extractBillFromEmail already retries a 429 a
      // couple of times internally; if it still failed, the budget is genuinely
      // exhausted for now, so stop the whole run rather than burning through more
      // of it. The failed message (and everything after it) stays unprocessed,
      // so the next Sync Now click picks up right where this one stopped.
      if (String(status) === "429" || String(status) === "401" || String(status) === "403") {
        markProcessed(scannedIds);
        throw err;
      }
      // Other per-message errors: mark processed anyway so we don't retry forever.
      scannedIds.push(stub.id);
    }

    // Small pacing gap between messages so a large batch doesn't burst Groq's
    // per-minute token budget even when each individual request is small. Local
    // parsing has no rate limit to worry about, so skip the wasted wall-clock time.
    if (useAi && i < toScan.length - 1) await new Promise(r => setTimeout(r, 300));
  }

  onProgress?.({ done: toScan.length, total: toScan.length });
  markProcessed(scannedIds);
  saveGmailImportSettings({ lastSyncedAt: new Date().toISOString() });

  return { candidates, scannedCount: toScan.length, skippedNonBill, labelName: label, parseMode };
}
