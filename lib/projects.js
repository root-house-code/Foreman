import { storageGet, storageSet } from "./storage.js";

const KEY = "foreman-projects";

export function loadProjects() {
  try { return storageGet(KEY) ?? []; }
  catch { return []; }
}

export function saveProjects(projects) {
  storageSet(KEY, projects);
}

export function createProject({ name, linkedCategory = null, linkedItem = null, linkedRoom = null, linkedRoomId = null, linkedSystem = null, linkedSystemId = null }) {
  return {
    id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    status: "not-started",
    priority: "medium",
    dueDate: null,
    assignee: "",
    estimatedCost: null,
    linkedCategory,
    linkedItem,
    linkedRoom,
    linkedRoomId,
    linkedSystem,
    linkedSystemId,
    labels: [],
    description: "",
    tasks: [],
    images: [],
    createdAt: new Date().toISOString(),
  };
}
