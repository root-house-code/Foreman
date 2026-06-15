import { storageGet, storageSet } from "./storage.js";

const KEY = "foreman-services";

export const FIXED_SERVICE_CATEGORIES = [
  "HVAC Maintenance",
  "Pest Control",
  "Lawn Care",
  "Pool / Spa",
  "Security Monitoring",
  "Home Warranty",
  "Cleaning Service",
  "Gutter Cleaning",
  "Window Washing",
  "Chimney Sweep",
  "Appliance Service Plan",
  "Landscaping",
  "Snow Removal",
  "Irrigation / Sprinklers",
  "Other",
];

export function toMonthly(cost, billingCycle) {
  const c = cost ?? 0;
  if (billingCycle === "monthly")   return c;
  if (billingCycle === "quarterly") return c / 3;
  if (billingCycle === "annual")    return c / 12;
  return 0; // one-time excluded
}

function load() {
  try { return storageGet(KEY) ?? { services: {}, visits: {} }; }
  catch { return { services: {}, visits: {} }; }
}

export function loadServices() { return load(); }
export function saveServices(data) { storageSet(KEY, data); }

export function addService(svc) {
  const data = load();
  data.services[svc.id] = svc;
  saveServices(data);
  return data;
}

export function updateService(id, updates) {
  const data = load();
  const cur = data.services[id];
  if (!cur) return data;
  const next = { ...cur, ...updates, id };
  // Forward-only cost: when the cost changes, append a cost segment effective today
  // so past ledger months keep the cost they had. Seed a prior segment (covering all
  // history) with the old cost the first time a service's cost is edited.
  if (updates.cost !== undefined && Number(updates.cost) !== Number(cur.cost)) {
    const today = new Date().toISOString().slice(0, 10);
    const hist = (cur.costHistory && cur.costHistory.length)
      ? cur.costHistory.map(s => ({ ...s }))
      : [{ from: cur.startDate || "1900-01-01", cost: Number(cur.cost) || 0 }];
    const last = hist[hist.length - 1];
    if (last && last.from === today) last.cost = Number(updates.cost) || 0;
    else hist.push({ from: today, cost: Number(updates.cost) || 0 });
    next.costHistory = hist;
  }
  data.services[id] = next;
  saveServices(data);
  return data;
}

export function deleteService(id) {
  const data = load();
  delete data.services[id];
  // Delete all visits for this service
  Object.keys(data.visits).forEach(vid => {
    if (data.visits[vid].serviceId === id) delete data.visits[vid];
  });
  saveServices(data);
  return data;
}

export function addVisit(visit) {
  const data = load();
  data.visits[visit.id] = visit;
  saveServices(data);
  return data;
}

export function updateVisit(id, updates) {
  const data = load();
  if (!data.visits[id]) return data;
  data.visits[id] = { ...data.visits[id], ...updates, id };
  saveServices(data);
  return data;
}

export function deleteVisit(id) {
  const data = load();
  delete data.visits[id];
  saveServices(data);
  return data;
}
