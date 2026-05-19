const KEY = "foreman-projects";

export function loadProjects() {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
  catch { return []; }
}

export function saveProjects(projects) {
  localStorage.setItem(KEY, JSON.stringify(projects));
}

export function createProject({ name, linkedCategory = null, linkedItem = null, linkedRoom = null, linkedSystem = null }) {
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
    linkedSystem,
    labels: [],
    description: "",
    tasks: [],
    images: [],
    createdAt: new Date().toISOString(),
  };
}
