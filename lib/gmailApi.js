import { extractPdfText } from "./pdfExtract.js";

// Renderer-side Gmail REST calls. Tokens are minted in the Electron main process
// (window.foreman.gmailGetAccessToken); the actual API requests run here because
// gmail.googleapis.com allows cross-origin fetch with a bearer token. Pure API +
// text extraction, no LLM and no orchestration (see lib/gmailSync.js for that).

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

async function gmailGet(accessToken, pathAndQuery) {
  const res = await fetch(`${BASE}${pathAndQuery}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`Gmail ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function listLabels(accessToken) {
  const data = await gmailGet(accessToken, "/labels");
  return (data.labels || []).map(l => ({ id: l.id, name: l.name }));
}

// Search messages under a label. Gmail's `q` uses the label's display name with
// spaces replaced by hyphens for nested labels; quoting handles names with spaces.
export async function searchLabelMessages(accessToken, labelName, { maxResults = 200 } = {}) {
  const q = encodeURIComponent(`label:"${labelName}"`);
  const out = [];
  let pageToken = "";
  while (out.length < maxResults) {
    const pageParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
    const data = await gmailGet(accessToken, `/messages?q=${q}&maxResults=100${pageParam}`);
    for (const m of data.messages || []) out.push({ id: m.id, threadId: m.threadId });
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return out.slice(0, maxResults);
}

export async function getMessage(accessToken, id) {
  return gmailGet(accessToken, `/messages/${id}?format=full`);
}

export async function getAttachment(accessToken, messageId, attachmentId) {
  const data = await gmailGet(accessToken, `/messages/${messageId}/attachments/${attachmentId}`);
  return data.data; // base64url
}

function decodeBase64Url(data) {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function getHeader(payload, name) {
  const h = (payload?.headers || []).find(x => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : null;
}

// Walk the MIME tree, preferring text/plain; fall back to stripping text/html
// via the DOM (renderer has a full document, so no dependency needed).
export function extractBodyText(payload) {
  const plain = [];
  const html = [];

  function walk(part) {
    if (!part) return;
    const mime = part.mimeType || "";
    const data = part.body?.data;
    if (data && mime === "text/plain") {
      plain.push(new TextDecoder().decode(decodeBase64Url(data)));
    } else if (data && mime === "text/html") {
      html.push(new TextDecoder().decode(decodeBase64Url(data)));
    }
    for (const child of part.parts || []) walk(child);
  }
  walk(payload);

  if (plain.length) return plain.join("\n").trim();
  if (html.length) {
    const doc = new DOMParser().parseFromString(html.join("\n"), "text/html");
    return (doc.body?.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
  }
  return "";
}

export function findPdfAttachmentParts(payload) {
  const found = [];
  function walk(part) {
    if (!part) return;
    if ((part.mimeType || "") === "application/pdf" && part.body?.attachmentId) {
      found.push({ filename: part.filename || "attachment.pdf", attachmentId: part.body.attachmentId });
    }
    for (const child of part.parts || []) walk(child);
  }
  walk(payload);
  return found;
}

export async function extractAttachmentPdfText(accessToken, messageId, attachmentPart) {
  const data = await getAttachment(accessToken, messageId, attachmentPart.attachmentId);
  const bytes = decodeBase64Url(data);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const pages = await extractPdfText(blob);
  return pages.join("\n");
}
