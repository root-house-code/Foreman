import { loadData } from "./data.js";

// Pages the palette can jump to (key → label). Kept independent of App.jsx's
// PAGE_KEYS to avoid a component→lib import cycle; navigate() accepts the key.
const PAGES = [
  ["dashboard", "Dashboard"], ["calendar", "Calendar"], ["floorplan", "Floor Plan"],
  ["inventory", "Inventory"], ["maintenance", "Maintenance"], ["services", "Services"],
  ["utilities", "Utilities"], ["supplies", "Supplies"], ["chores", "Chores"],
  ["board", "To Dos"], ["projects", "Projects"], ["lifecycle", "Lifecycle"],
  ["guide", "Notebook"], ["preferences", "Preferences"], ["readme", "Read Me"],
];

// Static write-action shortcuts. v1 navigates to the page; Phase 2 can deep-link
// straight into the relevant Add modal via navState.
export const COMMAND_ACTIONS = [
  { id: "act-todo",    type: "action", label: "New to-do",          sublabel: "To Dos",     target: "board",     navState: { openAdd: true } },
  { id: "act-chore",   type: "action", label: "Add a chore",        sublabel: "Chores",     target: "chores",    navState: { openAdd: true } },
  { id: "act-bill",    type: "action", label: "Log a utility bill", sublabel: "Utilities",  target: "utilities", navState: { openAdd: true } },
  { id: "act-expense", type: "action", label: "Log an expense",     sublabel: "Lifecycle",  target: "lifecycle", navState: { openAdd: true } },
  { id: "act-service", type: "action", label: "Add a service",      sublabel: "Services",   target: "services",  navState: { openAdd: true } },
  { id: "act-project", type: "action", label: "New project",        sublabel: "Projects",   target: "projects",  navState: { openAdd: true } },
];

/**
 * Builds the searchable index from store slices + the maintenance/inventory data.
 * Returns a flat CommandItem[]: { id, type, label, sublabel, keywords, target }.
 */
export function buildCommandIndex({ chores = [], services = { services: {} }, utilities = { utilities: {} }, projects = [] } = {}) {
  const items = [];

  // Pages
  PAGES.forEach(([key, label]) => {
    items.push({ id: "page:" + key, type: "page", label, sublabel: "Page", keywords: "", target: key });
  });

  // Inventory items + maintenance tasks (from the merged data rows)
  const rows = loadData();
  const seenItem = new Set();
  rows.forEach(row => {
    if (!row.category || !row.item) return;
    const itemKey = row.category + "|" + row.item;
    if (!seenItem.has(itemKey)) {
      seenItem.add(itemKey);
      items.push({ id: "inv:" + itemKey, type: "inventory", label: row.item, sublabel: row.category, keywords: "", target: "inventory", searchTerm: row.item });
    }
    if (row.task) {
      items.push({ id: "task:" + itemKey + "|" + row.task, type: "maintenance", label: `${row.item} · ${row.task}`, sublabel: row.category, keywords: row.task, target: "maintenance", searchTerm: row.item });
    }
  });

  // Chores
  chores.forEach(c => {
    if (!c?.title) return;
    items.push({ id: "chore:" + c.id, type: "chore", label: c.title, sublabel: c.room || "Chore", keywords: "", target: "chores", searchTerm: c.title });
  });

  // Services
  Object.values(services?.services || {}).forEach(s => {
    if (!s?.name) return;
    items.push({ id: "svc:" + s.id, type: "service", label: s.name, sublabel: s.providerName || "Service", keywords: s.category || "", target: "services", searchTerm: s.name });
  });

  // Utilities
  Object.values(utilities?.utilities || {}).forEach(u => {
    if (!u?.name) return;
    const typeLabel = u.type === "Other" ? (u.customType || "Utility") : (u.type || "Utility");
    items.push({ id: "util:" + u.id, type: "utility", label: u.name, sublabel: typeLabel, keywords: u.providerName || "", target: "utilities", searchTerm: u.name });
  });

  // Projects
  projects.forEach(p => {
    if (!p?.name) return;
    items.push({ id: "proj:" + p.id, type: "project", label: p.name, sublabel: p.status ? p.status.replace("-", " ") : "Project", keywords: "", target: "projects", searchTerm: p.name });
  });

  return items;
}

function isSubsequence(q, text) {
  let i = 0;
  for (let j = 0; j < text.length && i < q.length; j++) {
    if (text[j] === q[i]) i++;
  }
  return i === q.length;
}

// Case-insensitive ranking: label prefix > word-start > substring > meta > fuzzy.
function scoreItem(item, q) {
  const label = (item.label || "").toLowerCase();
  if (label.startsWith(q)) return 0;
  if (label.split(/[\s·/|-]+/).some(w => w.startsWith(q))) return 1;
  if (label.includes(q)) return 2;
  if ((item.sublabel || "").toLowerCase().includes(q) || (item.keywords || "").toLowerCase().includes(q)) return 3;
  if (q.length >= 2 && isSubsequence(q, label)) return 4; // fuzzy: "wh" → "Water Heater"
  return -1; // no match
}

export function rankCommands(items, query, limit = 40) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return items.slice(0, limit);
  const scored = [];
  items.forEach(it => {
    const s = scoreItem(it, q);
    if (s >= 0) scored.push({ it, s });
  });
  scored.sort((a, b) => a.s - b.s || a.it.label.localeCompare(b.it.label));
  return scored.slice(0, limit).map(x => x.it);
}
