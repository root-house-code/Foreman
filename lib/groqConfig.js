import { storageGet, storageSet, storageDel } from "./storage.js";

// The Groq API key is entered per-install via Preferences, not baked in at build
// time — Foreman is a public repo, and a VITE_-prefixed build-time env var gets
// inlined verbatim into the shipped JS bundle, which would leak the key to anyone
// who opens devtools on a distributed build. Stored through the normal storage
// layer (same as everything else) so it works identically across Electron, LAN
// clients, and the browser build.
const KEY = "foreman-groq-api-key";

export function loadGroqApiKey() {
  return storageGet(KEY) || "";
}

export function saveGroqApiKey(key) {
  const trimmed = (key || "").trim();
  if (trimmed) storageSet(KEY, trimmed);
  else storageDel(KEY);
}
