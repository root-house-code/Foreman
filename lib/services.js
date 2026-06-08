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
  if (!data.services[id]) return data;
  data.services[id] = { ...data.services[id], ...updates, id };
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
