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

// ── Storage IPC ───────────────────────────────────────────────────────────────
ipcMain.on("storage:readAll", (event) => {
  event.returnValue = readAllSync();
  try { createBackup(); } catch {}
});

let _flushTimer = null;
let _pendingSnapshot = null;
let _lastBackupTime = 0;
const BACKUP_INTERVAL = 3_600_000; // 1 h
ipcMain.on("storage:flush", (_event, snapshot) => {
  _pendingSnapshot = snapshot;
  clearTimeout(_flushTimer);
  _flushTimer = setTimeout(() => {
    flush(_pendingSnapshot);
    const now = Date.now();
    if (now - _lastBackupTime >= BACKUP_INTERVAL) {
      try { createBackup(); _lastBackupTime = now; } catch {}
    }
    _pendingSnapshot = null;
  }, 500);
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
  clearTimeout(_flushTimer);
  if (_pendingSnapshot) {
    flush(_pendingSnapshot);
    _pendingSnapshot = null;
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
