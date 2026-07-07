// Foreman Android bridge shim — builds the same `window.foreman` surface that
// electron/preload.cjs exposes, backed by the native ForemanBridge.kt object
// (injected as window.AndroidForeman via addJavascriptInterface).
//
// Injected two ways, so it must be idempotent:
//  - standalone mode: a <script> tag spliced into the bundled index.html by
//    MainActivity's asset interceptor (deterministic, runs before the bundle)
//  - both modes: WebViewCompat.addDocumentStartJavaScript where supported
//
// In standalone mode the shim exposes the file-storage functions and sets
// hasNativeStorage, which lib/storage.js uses to select the file backend.
// In connected mode storage is deliberately absent — the page is served by the
// desktop host and lib/storage.js proceeds to remote mode like any LAN client —
// but notifications, deep links, and native save/open dialogs still work.
(function () {
  "use strict";
  if (window.foreman) return;
  var B = window.AndroidForeman;
  if (!B) return;

  var mode = "standalone";
  try { mode = B.getMode() || "standalone"; } catch (e) {}

  // Promise registry for calls that need an Activity result (SAF dialogs, file IO).
  var pending = {};
  var seq = 0;
  window.__foremanResolve = function (id, value) {
    var resolve = pending[id];
    if (!resolve) return;
    delete pending[id];
    resolve(value);
  };
  function invoke(method, args) {
    return new Promise(function (resolve) {
      var id = String(++seq);
      pending[id] = resolve;
      B.invokeAsync(method, id, JSON.stringify(args === undefined ? null : args));
    });
  }

  // Deep links can arrive before App.jsx registers its handler — queue the last one.
  var deepLinkHandler = null;
  var queuedDeepLink = null;
  window.__foremanDeepLink = function (url) {
    if (deepLinkHandler) deepLinkHandler(url);
    else queuedDeepLink = url;
  };

  var foreman = {
    isAndroid: true,

    // ── Notifications ──────────────────────────────────────────────────────
    notify: function (title, body) {
      try { B.notify(String(title == null ? "" : title), String(body == null ? "" : body)); } catch (e) {}
    },

    // ── Native file dialogs (Storage Access Framework) ─────────────────────
    // Same shapes as Electron: showSaveDialog → { canceled, filePath },
    // showOpenDialog → { canceled, filePaths }. "filePath" is a content:// URI
    // string that writeFile/readFile accept.
    showSaveDialog: function (opts) { return invoke("showSaveDialog", opts || {}); },
    showOpenDialog: function (opts) { return invoke("showOpenDialog", opts || {}); },
    writeFile: function (path, content) { return invoke("writeFile", { path: path, content: content }); },
    readFile: function (path) { return invoke("readFile", { path: path }); },

    // ── Deep links (foreman://) ─────────────────────────────────────────────
    onDeepLink: function (cb) {
      deepLinkHandler = cb;
      if (queuedDeepLink) { var u = queuedDeepLink; queuedDeepLink = null; cb(u); }
    },

    // ── App mode (Preferences → Integrations → This Phone card) ────────────
    getAppInfo: function () {
      try { return JSON.parse(B.getAppInfoJson()); } catch (e) { return {}; }
    },
    openModeSettings: function () { try { B.openModeSettings(); } catch (e) {} },
  };

  if (mode === "standalone") {
    // File storage — same per-key delta protocol as the Electron IPC bridge.
    foreman.hasNativeStorage = true;
    foreman.readAllSync = function () { return JSON.parse(B.readAllSync()); };
    foreman.setKeys = function (updates, deletes) {
      B.setKeys(JSON.stringify({ updates: updates || {}, deletes: deletes || [] }));
    };
    foreman.setKeysNow = function (updates, deletes) {
      return B.setKeysNow(JSON.stringify({ updates: updates || {}, deletes: deletes || [] }));
    };
    // Hosting is desktop-only (hub-and-spoke: the phone is never the hub), so
    // no remote writers exist in standalone mode — but lib/storage.js probes
    // for this optionally, so provide the no-op.
    foreman.onRemoteChange = function () {};
  }

  window.foreman = foreman;
})();
