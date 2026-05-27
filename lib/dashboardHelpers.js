import { storageGet } from "./storage.js";
import { loadData } from './data.js';
import { loadDeletedCategories } from './deletedCategories.js';
import { loadDeletedItems } from './deletedItems.js';

export function fmtDate(d) {
  if (!d) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const date = d instanceof Date ? d : new Date(d);
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

export function daysBetween(d1, d2) {
  const date1 = d1 instanceof Date ? d1 : new Date(d1);
  const date2 = d2 instanceof Date ? d2 : new Date(d2);
  date1.setHours(0, 0, 0, 0);
  date2.setHours(0, 0, 0, 0);
  return Math.round((date2 - date1) / (1000 * 60 * 60 * 24));
}

export function status(nextDue, today = new Date()) {
  if (!nextDue) return 'unknown';
  const days = daysBetween(nextDue, today);
  if (days < 0) return 'overdue';
  if (days <= 7) return 'soon';
  return 'scheduled';
}

export function systemHealth(systemId, today = new Date()) {
  const rows = loadData();
  const deletedCategories = loadDeletedCategories();
  const deletedItems = loadDeletedItems();

  const tasks = rows.filter(
    (r) =>
      r.system === systemId &&
      !r._isBlankCategory &&
      r.category &&
      r.item &&
      r.task &&
      !deletedCategories.has(r.category) &&
      !deletedItems.has(`${r.category}|${r.item}`)
  );

  if (tasks.length === 0) return 100;

  const nextDatesMap = storageGet('maintenance-next-dates') ?? {};

  const onTime = tasks.filter((t) => {
    const key = `${t.category}|${t.item}|${t.task}`;
    const d = nextDatesMap[key];
    if (!d) return true;
    return new Date(d) >= today;
  }).length;

  return Math.min(100, Math.max(0, Math.round((onTime / tasks.length) * 100)));
}

export function systemsByHealth(today = new Date()) {
  const rows = loadData();
  const systems = [];
  const seen = new Set();

  rows.forEach((r) => {
    if (r.system && !seen.has(r.system)) {
      seen.add(r.system);
      systems.push({ id: r.system });
    }
  });

  return systems.sort((a, b) => systemHealth(a.id, today) - systemHealth(b.id, today));
}

export function systemStats(today = new Date()) {
  const rows = loadData();
  const deletedCategories = loadDeletedCategories();
  const deletedItems = loadDeletedItems();
  const stats = {};
  const nextDatesMap = storageGet('maintenance-next-dates') ?? {};

  const systems = new Set();
  rows.forEach((r) => {
    if (r.system && !systems.has(r.system)) {
      systems.add(r.system);
      stats[r.system] = { overdue: 0, soon: 0, tasks: 0, nextDue: null };
    }
  });

  rows.forEach((r) => {
    if (
      !r.system ||
      !stats[r.system] ||
      r._isBlankCategory ||
      !r.category ||
      !r.item ||
      !r.task ||
      deletedCategories.has(r.category) ||
      deletedItems.has(`${r.category}|${r.item}`)
    ) return;

    const key = `${r.category}|${r.item}|${r.task}`;
    const d = nextDatesMap[key];
    if (!d) return;

    const nextDueDate = new Date(d);
    stats[r.system].tasks += 1;

    if (nextDueDate < today) {
      stats[r.system].overdue += 1;
    } else if (daysBetween(nextDueDate, today) <= 7) {
      stats[r.system].soon += 1;
    }

    if (!stats[r.system].nextDue || nextDueDate < new Date(stats[r.system].nextDue)) {
      stats[r.system].nextDue = d;
    }
  });

  return stats;
}

export function overdueTasks(today = new Date()) {
  const rows = loadData();
  const deletedCategories = loadDeletedCategories();
  const deletedItems = loadDeletedItems();
  const nextDatesMap = storageGet('maintenance-next-dates') ?? {};

  return rows
    .filter(
      (r) =>
        !r._isBlankCategory &&
        r.category &&
        r.item &&
        r.task &&
        r.system &&
        !deletedCategories.has(r.category) &&
        !deletedItems.has(`${r.category}|${r.item}`)
    )
    .map((r) => ({
      ...r,
      id: `${r.category}|${r.item}|${r.task}`,
      nextDue: nextDatesMap[`${r.category}|${r.item}|${r.task}`],
    }))
    .filter((t) => t.nextDue && new Date(t.nextDue) < today)
    .sort((a, b) => new Date(a.nextDue) - new Date(b.nextDue));
}

export function upcomingTasks(days = 30, today = new Date()) {
  const rows = loadData();
  const deletedCategories = loadDeletedCategories();
  const deletedItems = loadDeletedItems();
  const nextDatesMap = storageGet('maintenance-next-dates') ?? {};

  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + days);

  return rows
    .filter(
      (r) =>
        !r._isBlankCategory &&
        r.category &&
        r.item &&
        r.task &&
        r.system &&
        !deletedCategories.has(r.category) &&
        !deletedItems.has(`${r.category}|${r.item}`)
    )
    .map((r) => ({
      ...r,
      id: `${r.category}|${r.item}|${r.task}`,
      nextDue: nextDatesMap[`${r.category}|${r.item}|${r.task}`],
    }))
    .filter((t) => t.nextDue && new Date(t.nextDue) >= today && new Date(t.nextDue) <= cutoff)
    .sort((a, b) => new Date(a.nextDue) - new Date(b.nextDue));
}

export const FmH = {
  fmtDate,
  daysBetween,
  status,
  systemHealth,
  systemsByHealth,
  systemStats,
  overdueTasks,
  upcomingTasks,
};

export default FmH;
