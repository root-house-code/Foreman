package com.foreman.app

import android.webkit.JavascriptInterface
import org.json.JSONObject

/**
 * The renderer↔native API surface — Android's equivalent of electron/preload.cjs.
 *
 * Exposed to the page as `window.AndroidForeman` via addJavascriptInterface;
 * assets/foreman-bridge.js wraps it into the same `window.foreman` object the
 * Electron preload exposes, so lib/storage.js, lib/profiles.js, and
 * preferences-page.jsx run unchanged.
 *
 * @JavascriptInterface methods run on the WebView's JavaBridge thread and are
 * synchronous from the page's perspective — the same contract as Electron's
 * ipcRenderer.sendSync. Anything that needs an Activity result (SAF dialogs)
 * goes through invokeAsync + the JS-side promise registry instead.
 */
class ForemanBridge(private val activity: MainActivity) {

    /** "standalone" | "connected" — the JS shim only exposes storage functions in standalone. */
    @JavascriptInterface
    fun getMode(): String = activity.currentMode() ?: "standalone"

    @JavascriptInterface
    fun getAppInfoJson(): String = JSONObject().apply {
        put("mode", activity.currentMode() ?: "standalone")
        put("hostUrl", activity.hostUrl() ?: JSONObject.NULL)
        put("dataDir", activity.storage?.dataDirPath ?: JSONObject.NULL)
        put("version", BuildConfig.VERSION_NAME)
    }.toString()

    // ── Storage (standalone mode only) ────────────────────────────────────────
    // Per-key delta protocol, identical to the Electron IPC channels: the
    // renderer sends only changed/deleted keys and native merges them into the
    // authoritative store, so nothing can be clobbered by a stale snapshot.

    @JavascriptInterface
    fun readAllSync(): String = activity.storage?.readAllJson() ?: "{}"

    @JavascriptInterface
    fun setKeys(deltaJson: String) {
        activity.storage?.let { it.applyDelta(deltaJson); it.scheduleFlush() }
    }

    @JavascriptInterface
    fun setKeysNow(deltaJson: String): Boolean {
        activity.storage?.let { it.applyDelta(deltaJson); it.scheduleFlush(); it.flushNow() }
        return true
    }

    // ── Notifications ─────────────────────────────────────────────────────────

    @JavascriptInterface
    fun notify(title: String, body: String) = activity.postNotification(title, body)

    // ── Async calls resolved via window.__foremanResolve(id, value) ───────────
    // methods: showSaveDialog, showOpenDialog, writeFile, readFile

    @JavascriptInterface
    fun invokeAsync(method: String, id: String, argsJson: String) =
        activity.handleBridgeCall(method, id, argsJson)

    // ── Mode settings (native chooser overlay) ────────────────────────────────

    @JavascriptInterface
    fun openModeSettings() = activity.runOnUiThread { activity.showModeChooser(cancelable = true) }
}
