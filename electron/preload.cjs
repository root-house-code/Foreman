const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("foreman", {
  isElectron: true,

  // ── Storage ─────────────────────────────────────────────────────────────
  readAllSync: () => ipcRenderer.sendSync("storage:readAll"),
  flush: (snapshot) => ipcRenderer.send("storage:flush", snapshot),

  // ── Notifications ────────────────────────────────────────────────────────
  notify: (title, body) => ipcRenderer.send("notify", title, body),

  // ── Native file dialogs ──────────────────────────────────────────────────
  showSaveDialog: (opts) => ipcRenderer.invoke("dialog:save", opts),
  showOpenDialog: (opts) => ipcRenderer.invoke("dialog:open", opts),
  writeFile: (filePath, content) => ipcRenderer.invoke("file:write", filePath, content),
  readFile: (filePath) => ipcRenderer.invoke("file:read", filePath),

  // ── Deep links ───────────────────────────────────────────────────────────
  onDeepLink: (cb) => {
    ipcRenderer.on("deep-link", (_event, url) => cb(url));
  },
});
