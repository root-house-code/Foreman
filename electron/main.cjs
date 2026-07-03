const { app, BrowserWindow, Menu, ipcMain, Tray, Notification, dialog, nativeImage } = require("electron");
const path = require("path");
const { readAllSync, flush, createBackup } = require("./storageFile.cjs");

const isDev = !app.isPackaged;
let mainWindow = null;
let tray = null;
let _quitting = false;

// ── Deep links ────────────────────────────────────────────────────────────────
// Register foreman:// as a custom protocol. On Windows, the URL arrives via
// second-instance argv when the app is already running.
app.setAsDefaultProtocolClient("foreman");

function handleDeepLink(url) {
  if (!url || !url.startsWith("foreman://")) return;
  if (mainWindow) {
    mainWindow.show();
    mainWindow.webContents.send("deep-link", url);
  }
}

// Single-instance: forward deep-link URL to existing window
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const url = argv.find(a => a.startsWith("foreman://"));
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
    if (url) handleDeepLink(url);
  });
}

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: "Foreman",
    backgroundColor: "#0f1117",
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Hide to tray instead of quitting when the window is closed
  mainWindow.on("close", (event) => {
    if (!_quitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// ── System tray ───────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, "../assets/tray-icon.png");
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("Foreman");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open Foreman", click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: "separator" },
    { label: "Quit", click: () => { _quitting = true; app.quit(); } },
  ]));
  tray.on("click", () => { mainWindow?.show(); mainWindow?.focus(); });
}

// ── Storage: authoritative store ──────────────────────────────────────────────
// Main owns the single in-memory store. The renderer (and, when LAN sharing is
// on, remote clients) send per-key deltas that merge here; main persists the
// whole store to disk on a debounce. Memory is authoritative after first load —
// a renderer reload must not re-read a stale disk state past un-flushed deltas.
let _store = null;
let _flushTimer = null;
let _flushPending = false;
let _lastBackupTime = 0;
const BACKUP_INTERVAL = 3_600_000; // 1 h

function ensureStore() {
  if (_store === null) _store = readAllSync();
  return _store;
}

function applyDelta({ updates, deletes }) {
  const store = ensureStore();
  if (updates) for (const [k, v] of Object.entries(updates)) store[k] = v;
  if (deletes) for (const k of deletes) delete store[k];
}

function scheduleFlush() {
  _flushPending = true;
  clearTimeout(_flushTimer);
  _flushTimer = setTimeout(() => {
    flushNow();
    const now = Date.now();
    if (now - _lastBackupTime >= BACKUP_INTERVAL) {
      try { createBackup(); _lastBackupTime = now; } catch {}
    }
  }, 500);
}

function flushNow() {
  clearTimeout(_flushTimer);
  _flushTimer = null;
  if (!_flushPending || _store === null) return;
  _flushPending = false;
  try { flush(_store); } catch {}
}

ipcMain.on("storage:readAll", (event) => {
  event.returnValue = ensureStore();
  try { createBackup(); } catch {}
});

ipcMain.on("storage:setKeys", (_event, delta) => {
  applyDelta(delta);
  scheduleFlush();
});

// Synchronous merge + immediate write — used before window.location.reload()
// so the debounce timer doesn't race with the next storage read.
ipcMain.on("storage:setKeysNow", (event, delta) => {
  applyDelta(delta);
  _flushPending = true;
  flushNow();
  event.returnValue = true;
});

// ── Notifications IPC ─────────────────────────────────────────────────────────
ipcMain.on("notify", (_event, title, body) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
});

// ── Native file dialogs ───────────────────────────────────────────────────────
ipcMain.handle("dialog:save", async (_event, opts) =>
  dialog.showSaveDialog(mainWindow, opts)
);
ipcMain.handle("dialog:open", async (_event, opts) =>
  dialog.showOpenDialog(mainWindow, opts)
);
// Write file (for export after user picks save path)
ipcMain.handle("file:write", async (_event, filePath, content) => {
  const fs = require("fs");
  fs.writeFileSync(filePath, content, "utf8");
  return true;
});
// Read file (for import after user picks open path)
ipcMain.handle("file:read", async (_event, filePath) => {
  const fs = require("fs");
  return fs.readFileSync(filePath, "utf8");
});

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Handle foreman:// launched from protocol when app was not running
  const startUrl = process.argv.find(a => a.startsWith("foreman://"));
  if (startUrl) handleDeepLink(startUrl);
});

app.on("before-quit", () => {
  _quitting = true;
  flushNow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
