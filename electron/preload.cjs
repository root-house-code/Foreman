const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("foreman", {
  isElectron: true,

  // ── Storage ─────────────────────────────────────────────────────────────
  // Per-key delta protocol: the renderer sends only changed/deleted keys and
  // main merges them into its authoritative store, so concurrent writers
  // (LAN clients on other devices) are never clobbered by a stale snapshot.
  readAllSync: () => ipcRenderer.sendSync("storage:readAll"),
  setKeys: (updates, deletes) => ipcRenderer.send("storage:setKeys", { updates, deletes }),
  setKeysNow: (updates, deletes) => ipcRenderer.sendSync("storage:setKeysNow", { updates, deletes }),

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

  // ── LAN sharing (multi-device) ────────────────────────────────────────────
  lanStart: () => ipcRenderer.invoke("lan:start"),
  lanStop: () => ipcRenderer.invoke("lan:stop"),
  lanStatus: () => ipcRenderer.invoke("lan:status"),
  lanRegenerate: () => ipcRenderer.invoke("lan:regenerate"),
  // Fired when a LAN client writes — delta = { updates, deletes }
  onRemoteChange: (cb) => {
    ipcRenderer.on("remote-storage-change", (_event, delta) => cb(delta));
  },

  // ── Gmail Bill Import ──────────────────────────────────────────────────────
  gmailConnect: () => ipcRenderer.invoke("gmail:connect"),
  gmailDisconnect: () => ipcRenderer.invoke("gmail:disconnect"),
  gmailStatus: () => ipcRenderer.invoke("gmail:status"),
  gmailGetAccessToken: () => ipcRenderer.invoke("gmail:getAccessToken"),
  gmailSetClientConfig: (config) => ipcRenderer.invoke("gmail:setClientConfig", config),
  gmailGetClientConfigStatus: () => ipcRenderer.invoke("gmail:getClientConfigStatus"),
  gmailClearClientConfig: () => ipcRenderer.invoke("gmail:clearClientConfig"),
});
