import { FIXED_UTILITY_TYPES, UTILITY_BILLING_CYCLES, DEFAULT_UNIT } from "./utilities.js";

// LLM extraction for a single utility-bill email, mirroring lib/inspectionGroq.js's
// fetch-to-Groq pattern (same model, same JSON-only prompt, same fence stripping).
// One call per candidate email — a bill email/PDF is short, so no chunking.

// Groq's free/on-demand tier caps at a low tokens-per-minute budget (12000 TPM for
// llama-3.3-70b-versatile at the time of writing). A multi-page PDF attachment can
// easily blow past that in a single request, so the amount/period/due-date fields
// we actually need are virtually always near the top of a bill anyway — cap the
// input rather than risk a 429 on every other email.
const MAX_EMAIL_CHARS = 6000;

function buildPrompt(emailText, meta) {
  const truncated = emailText.length > MAX_EMAIL_CHARS
    ? emailText.slice(0, MAX_EMAIL_CHARS) + "\n[...truncated...]"
    : emailText;
  const cycles = UTILITY_BILLING_CYCLES.map(([v]) => v).join(", ");
  return `You are a utility-bill data extractor. Decide whether the email below is a utility bill or invoice, and if so extract structured data.

Email metadata:
- Subject: ${meta.subject || "(none)"}
- From: ${meta.from || "(none)"}
- Date received: ${meta.date || "(none)"}

Return ONLY a JSON object with these fields:

{
  "isBill": boolean,                     // true only if this is a utility bill/invoice with a charge
  "confidence": "high" | "medium" | "low",
  "utilityType": one of [${FIXED_UTILITY_TYPES.map(t => `"${t}"`).join(", ")}],
  "vendorName": "provider/company name or null",
  "accountNumber": "string or null",
  "amount": number or null,              // total amount due, no currency symbol
  "periodMonth": "YYYY-MM" or null,      // the SERVICE/billing period, not the send date
  "dueDate": "YYYY-MM-DD" or null,
  "billingCycle": one of [${cycles}] or null,
  "usage": number or null                // metered consumption for this period (e.g. kWh, therms, gallons), no unit label — the number only
}

Rules:
- If the email is NOT a utility bill (marketing, payment confirmation with no charge, general notice), set "isBill": false and leave the other fields null.
- Choose the closest "utilityType" from the fixed list. Use "Other" only if none fit.
- "amount" is the amount due for this bill as a number (e.g. 142.53). No currency symbols or commas.
- "periodMonth" is the month the service covers. If only a due date is present, infer the period month conservatively or return null.
- "usage" only applies to metered utilities (${Object.keys(DEFAULT_UNIT).join(", ")}). Leave it null for flat-rate services (internet, cable, phone, trash, HOA, etc.) or if no usage/consumption figure is shown.
- Return ONLY the JSON. No markdown, no explanation.

--- EMAIL CONTENT ---
${truncated}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function callGroq(emailText, meta, apiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  let res;
  try {
    res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      signal: controller.signal,
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: buildPrompt(emailText, meta) }],
        temperature: 0.1,
        max_tokens: 800,
      }),
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`Groq ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    err.retryAfterMs = res.status === 429 ? parseRetryAfter(res) : null;
    throw err;
  }
  const data = await res.json();
  const raw = data.choices[0].message.content.replace(/```json\n?|\n?```/g, "").trim();
  return JSON.parse(raw);
}

function parseRetryAfter(res) {
  const header = res.headers.get("retry-after");
  const seconds = header ? parseFloat(header) : NaN;
  return Number.isFinite(seconds) ? Math.ceil(seconds * 1000) : null;
}

// One 429 (a single burst over the per-minute token budget) shouldn't abort an
// entire multi-email sync — back off and retry a couple of times, honoring
// Groq's Retry-After header when present, before giving up to the caller.
export async function extractBillFromEmail(emailText, meta, apiKey) {
  const maxRetries = 2;
  for (let attempt = 0; ; attempt++) {
    try {
      return await callGroq(emailText, meta, apiKey);
    } catch (err) {
      if (err.status !== 429 || attempt >= maxRetries) throw err;
      await sleep(err.retryAfterMs || 5000 * (attempt + 1));
    }
  }
}
