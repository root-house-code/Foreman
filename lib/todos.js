import { storageGet, storageSet } from "./storage.js";

const KEY = "foreman-todos";

export function loadTodos() {
  try { return storageGet(KEY) ?? []; }
  catch { return []; }
}

export function saveTodos(todos) {
  storageSet(KEY, todos);
}

export function createTodo({ title, linkedCategory = null, linkedItem = null, linkedRoom = null, linkedRoomId = null, linkedSystem = null, linkedSystemId = null, linkedExterior = null, linkedStructure = null, status = "not-started", priority = "medium", projectId = null, floorPlanLocation = null, ...rest }) {
  const now = new Date().toISOString();
  return {
    id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    description: "",
    status,
    priority,
    dueDate: null,
    completedDate: null,
    assignee: "",
    labels: [],
    estimatedCost: null,
    linkedCategory,
    linkedItem,
    linkedRoom,
    linkedRoomId,
    linkedSystem,
    linkedSystemId,
    linkedExterior,
    linkedStructure,
    projectId,
    floorPlanLocation,
    tasks: [],
    images: [],
    createdAt: now,
    ...rest,
  };
}
