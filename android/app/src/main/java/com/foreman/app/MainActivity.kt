package com.foreman.app

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.HapticFeedbackConstants
import android.view.View
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView
import androidx.activity.addCallback
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File

/**
 * The Foreman Android shell — the phone's equivalent of electron/main.cjs.
 *
 * One WebView runs the same renderer bundle as the desktop app, in one of two
 * modes (SharedPreferences "mode"):
 *
 *  - standalone: the SPA is served from APK assets via WebViewAssetLoader and
 *    persists through StorageStore — full Foreman with on-device files,
 *    atomic writes, and rolling backups, no other device required.
 *  - connected: the WebView loads the desktop host's LAN URL (paired by
 *    scanning the QR from Preferences → Multi-Device Sharing). The SPA's own
 *    remote mode takes over — the phone is a live window into the desktop's
 *    data, exactly like a phone browser, plus native chrome.
 */
class MainActivity : AppCompatActivity() {

    companion object {
        private const val PREFS = "foreman"
        private const val KEY_MODE = "mode"           // "standalone" | "connected"
        private const val KEY_HOST_URL = "hostUrl"    // full pairing URL incl. #pair=token
        private const val ASSET_HOST = "appassets.androidplatform.net"
        private const val START_URL = "https://$ASSET_HOST/assets/www/index.html"
        private const val CHANNEL_ID = "foreman"
    }

    private lateinit var prefs: SharedPreferences
    private lateinit var web: WebView
    private lateinit var chooserView: View
    private lateinit var errorView: View
    private lateinit var assetLoader: WebViewAssetLoader

    var storage: StorageStore? = null
        private set

    private var notifId = 1
    private val pendingNotifications = ArrayList<Pair<String, String>>()
    private var pendingDeepLink: String? = null

    fun currentMode(): String? = prefs.getString(KEY_MODE, null)
    fun hostUrl(): String? = prefs.getString(KEY_HOST_URL, null)

    // ── Activity results ──────────────────────────────────────────────────────

    private var pendingSaveId: String? = null
    private val createDoc: ActivityResultLauncher<String> = registerForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")
    ) { uri ->
        pendingSaveId?.let { id ->
            pendingSaveId = null
            resolveJs(id, JSONObject().apply {
                put("canceled", uri == null)
                put("filePath", uri?.toString() ?: JSONObject.NULL)
            }.toString())
        }
    }

    private var pendingOpenId: String? = null
    private val openDoc: ActivityResultLauncher<Array<String>> = registerForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri ->
        pendingOpenId?.let { id ->
            pendingOpenId = null
            resolveJs(id, JSONObject().apply {
                put("canceled", uri == null)
                put("filePaths", org.json.JSONArray().apply { uri?.let { put(it.toString()) } })
            }.toString())
        }
    }

    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val fileChooser: ActivityResultLauncher<Intent> = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        fileCallback?.onReceiveValue(
            WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
        )
        fileCallback = null
    }

    private val qrScan: ActivityResultLauncher<ScanOptions> = registerForActivityResult(ScanContract()) { result ->
        val text = result.contents?.trim()
        if (text != null && (text.startsWith("http://") || text.startsWith("https://"))) {
            prefs.edit().putString(KEY_MODE, "connected").putString(KEY_HOST_URL, text).apply()
            web.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
            startConnected()
        }
    }

    private val notifPermission: ActivityResultLauncher<String> = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            val queued = ArrayList(pendingNotifications)
            pendingNotifications.clear()
            for ((t, b) in queued) postNotification(t, b)
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        setContentView(R.layout.activity_main)

        web = findViewById(R.id.webview)
        chooserView = findViewById(R.id.chooser)
        errorView = findViewById(R.id.error_view)

        createNotificationChannel()
        setupWebView()
        wireChooser()
        wireErrorView()

        onBackPressedDispatcher.addCallback(this) {
            // Single-URL SPA: nothing to pop in standalone; in connected mode the
            // host may have real history. Otherwise behave like Home — calm, no exit.
            if (web.canGoBack()) web.goBack() else moveTaskToBack(true)
        }

        intent?.dataString?.let { if (it.startsWith("foreman://")) pendingDeepLink = it }

        when (currentMode()) {
            "standalone" -> startStandalone()
            "connected" -> startConnected()
            else -> showModeChooser(cancelable = false)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent.dataString?.let { url ->
            if (url.startsWith("foreman://")) dispatchDeepLink(url)
        }
    }

    override fun onStop() {
        super.onStop()
        // Mobile processes die without warning — never leave the 500 ms debounce
        // window open in the background. Runs on the storage thread (no ANR).
        storage?.flushSoon()
    }

    // ── WebView ───────────────────────────────────────────────────────────────

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            // The app controls its own type scale (Preferences → density); don't
            // let the system font scale double-apply on top of it.
            textZoom = 100
        }
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)

        web.addJavascriptInterface(ForemanBridge(this), "AndroidForeman")

        // Best-effort early injection for connected mode (host-served pages we
        // can't rewrite). Standalone gets a deterministic <script> splice below.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            runCatching {
                WebViewCompat.addDocumentStartJavaScript(web, bridgeJs(), setOf("*"))
            }
        }

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView, request: WebResourceRequest,
            ): WebResourceResponse? {
                val url = request.url
                if (url.host != ASSET_HOST) return null
                // Splice the bridge <script> into the bundled index.html so the
                // shim always runs before the app bundle in standalone mode.
                if (url.path == "/assets/www/index.html" || url.path == "/assets/www/") {
                    return runCatching {
                        val html = assets.open("www/index.html").bufferedReader().readText()
                        val injected = html.replaceFirst(
                            "<head>",
                            "<head><script src=\"/assets/foreman-bridge.js\"></script>"
                        )
                        WebResourceResponse(
                            "text/html", "utf-8", ByteArrayInputStream(injected.toByteArray())
                        )
                    }.getOrNull() ?: assetLoader.shouldInterceptRequest(url)
                }
                return assetLoader.shouldInterceptRequest(url)
            }

            override fun onReceivedError(
                view: WebView, request: WebResourceRequest, error: WebResourceError,
            ) {
                // Only a failed main-frame load in connected mode means "can't
                // reach the desktop" — subresource failures are not fatal.
                if (request.isForMainFrame && currentMode() == "connected") {
                    runOnUiThread { showError() }
                }
            }

            override fun onPageFinished(view: WebView, url: String) {
                pendingDeepLink?.let { dl -> pendingDeepLink = null; dispatchDeepLink(dl) }
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams,
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return runCatching { fileChooser.launch(params.createIntent()); true }
                    .getOrElse { fileCallback = null; false }
            }
        }
    }

    private fun bridgeJs(): String =
        assets.open("foreman-bridge.js").bufferedReader().readText()

    // ── Modes ─────────────────────────────────────────────────────────────────

    private fun startStandalone() {
        if (storage == null) {
            storage = StorageStore(File(getExternalFilesDir(null) ?: filesDir, "Foreman"))
        }
        chooserView.visibility = View.GONE
        errorView.visibility = View.GONE
        web.visibility = View.VISIBLE
        web.loadUrl(START_URL)
    }

    private fun startConnected() {
        val url = hostUrl() ?: return showModeChooser(cancelable = false)
        chooserView.visibility = View.GONE
        errorView.visibility = View.GONE
        web.visibility = View.VISIBLE
        web.loadUrl(url)
    }

    fun showModeChooser(cancelable: Boolean) {
        findViewById<View>(R.id.chooser_cancel).visibility =
            if (cancelable) View.VISIBLE else View.GONE
        errorView.visibility = View.GONE
        chooserView.visibility = View.VISIBLE
    }

    private fun wireChooser() {
        findViewById<View>(R.id.choose_standalone).setOnClickListener {
            prefs.edit().putString(KEY_MODE, "standalone").apply()
            startStandalone()
        }
        findViewById<View>(R.id.choose_connected).setOnClickListener {
            qrScan.launch(
                ScanOptions()
                    .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                    .setPrompt(getString(R.string.scan_prompt))
                    .setBeepEnabled(false)
                    .setOrientationLocked(true)
            )
        }
        findViewById<View>(R.id.chooser_cancel).setOnClickListener {
            chooserView.visibility = View.GONE
            if (currentMode() != null) web.visibility = View.VISIBLE
        }
    }

    private fun wireErrorView() {
        findViewById<View>(R.id.error_retry).setOnClickListener { startConnected() }
        findViewById<View>(R.id.error_rescan).setOnClickListener {
            findViewById<View>(R.id.choose_connected).performClick()
        }
        findViewById<View>(R.id.error_standalone).setOnClickListener {
            prefs.edit().putString(KEY_MODE, "standalone").apply()
            startStandalone()
        }
    }

    private fun showError() {
        val host = hostUrl()?.replace(Regex("/#.*$"), "") ?: ""
        findViewById<TextView>(R.id.error_body).text = getString(R.string.error_body, host)
        web.visibility = View.GONE
        chooserView.visibility = View.GONE
        errorView.visibility = View.VISIBLE
    }

    // ── Deep links (foreman://) ───────────────────────────────────────────────

    private fun dispatchDeepLink(url: String) {
        web.evaluateJavascript(
            "window.__foremanDeepLink && window.__foremanDeepLink(${JSONObject.quote(url)})", null
        )
    }

    // ── Notifications ─────────────────────────────────────────────────────────

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID, getString(R.string.notif_channel), NotificationManager.IMPORTANCE_DEFAULT
        )
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    fun postNotification(title: String, body: String) = runOnUiThread {
        if (Build.VERSION.SDK_INT >= 33 &&
            ActivityCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            pendingNotifications.add(title to body)
            notifPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
            return@runOnUiThread
        }
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        NotificationManagerCompat.from(this).notify(
            notifId++,
            NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_foreman)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setContentIntent(open)
                .build()
        )
    }

    // ── Async bridge calls (SAF dialogs + file IO) ────────────────────────────

    fun handleBridgeCall(method: String, id: String, argsJson: String) {
        val args = runCatching { JSONObject(argsJson) }.getOrElse { JSONObject() }
        when (method) {
            "showSaveDialog" -> runOnUiThread {
                pendingSaveId = id
                val name = args.optString("defaultPath", "foreman-export.json")
                    .substringAfterLast('/').substringAfterLast('\\')
                createDoc.launch(name)
            }
            "showOpenDialog" -> runOnUiThread {
                pendingOpenId = id
                openDoc.launch(arrayOf("application/json", "text/plain", "application/octet-stream"))
            }
            "writeFile" -> Thread {
                val ok = runCatching {
                    contentResolver.openOutputStream(Uri.parse(args.getString("path")), "wt")!!
                        .use { it.write(args.getString("content").toByteArray()) }
                }.isSuccess
                resolveJs(id, if (ok) "true" else "false")
            }.start()
            "readFile" -> Thread {
                val text = runCatching {
                    contentResolver.openInputStream(Uri.parse(args.getString("path")))!!
                        .bufferedReader().use { it.readText() }
                }.getOrNull()
                resolveJs(id, if (text != null) JSONObject.quote(text) else "null")
            }.start()
            else -> resolveJs(id, "null")
        }
    }

    /** Resolve a JS-side promise: valueJson is a raw JS/JSON expression. */
    private fun resolveJs(id: String, valueJson: String) = runOnUiThread {
        web.evaluateJavascript(
            "window.__foremanResolve(${JSONObject.quote(id)}, $valueJson)", null
        )
    }
}
