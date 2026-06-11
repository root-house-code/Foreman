// Tiny module-level emitter so the global Cmd/Ctrl-K listener AND the header
// search button can open the same command palette overlay — no context or
// prop-drilling required.

const listeners = new Set();

export function openCommandPalette() {
  listeners.forEach(fn => fn());
}

export function onOpenCommandPalette(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Recently-run command ids (most-recent-first), for surfacing on an empty query.
const RECENT_KEY = "foreman-command-recent";

export function loadRecentCommands() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); }
  catch { return []; }
}

export function pushRecentCommand(id) {
  try {
    const next = [id, ...loadRecentCommands().filter(x => x !== id)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}
