package com.foreman.app

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * Standalone-mode storage backend — the Android port of the desktop pair
 * electron/main.cjs (authoritative in-memory store, per-key delta merges,
 * debounced flush) + electron/storageFile.cjs (data.json / images.json
 * partition, atomic temp+rename writes, tiered backups).
 *
 * The renderer sends the same { updates, deletes } deltas it sends over
 * Electron IPC; memory is authoritative after first load, so a WebView reload
 * can never resurrect stale disk state past an un-flushed delta.
 *
 * Files live under Android/data/com.foreman.app/files/Foreman/ (app-specific
 * external storage: user-visible in a file manager and over USB, no runtime
 * storage permission needed — the closest Android analog to Documents\Foreman).
 */
class StorageStore(private val dir: File) {

    private val dataFile = File(dir, "data.json")
    private val imagesFile = File(dir, "images.json")
    private val backupsDir = File(dir, "backups")

    private val io = Executors.newSingleThreadScheduledExecutor { r ->
        Thread(r, "foreman-storage").apply { isDaemon = false }
    }
    private var flushTask: ScheduledFuture<*>? = null
    private var flushPending = false
    private var lastBackupTime = 0L

    private val lock = Any()
    private var store: JSONObject? = null

    val dataDirPath: String get() = dir.absolutePath

    companion object {
        private const val IMAGES_KEY = "foreman-images"
        private const val FLUSH_DEBOUNCE_MS = 500L
        private const val BACKUP_INTERVAL_MS = 3_600_000L // 1 h, matches main.cjs
    }

    // ── Load ──────────────────────────────────────────────────────────────────

    private fun safeRead(file: File): JSONObject =
        try { JSONObject(file.readText()) } catch (_: Exception) { JSONObject() }

    private fun ensureStore(): JSONObject {
        synchronized(lock) {
            store?.let { return it }
            dir.mkdirs()
            val merged = safeRead(dataFile)
            val images = safeRead(imagesFile)
            for (k in images.keys()) merged.put(k, images.get(k))
            store = merged
            return merged
        }
    }

    /** Full-store read for renderer boot. Takes a backup like desktop's storage:readAll. */
    fun readAllJson(): String {
        val json = synchronized(lock) { ensureStore().toString() }
        io.execute { runCatching { createBackup() } }
        return json
    }

    // ── Delta merge + debounced flush ─────────────────────────────────────────

    /** Merge a { updates, deletes } delta from the renderer into the store. */
    fun applyDelta(deltaJson: String) {
        val delta = try { JSONObject(deltaJson) } catch (_: Exception) { return }
        synchronized(lock) {
            val s = ensureStore()
            delta.optJSONObject("updates")?.let { updates ->
                for (k in updates.keys()) s.put(k, updates.get(k))
            }
            (delta.opt("deletes") as? JSONArray)?.let { deletes ->
                for (i in 0 until deletes.length()) s.remove(deletes.optString(i))
            }
        }
    }

    fun scheduleFlush() {
        synchronized(lock) {
            flushPending = true
            flushTask?.cancel(false)
            flushTask = io.schedule({
                flushNow()
                val now = System.currentTimeMillis()
                if (now - lastBackupTime >= BACKUP_INTERVAL_MS) {
                    runCatching { createBackup() }
                    lastBackupTime = now
                }
            }, FLUSH_DEBOUNCE_MS, TimeUnit.MILLISECONDS)
        }
    }

    /** Immediate write — setKeysNow (before a renderer reload) and Activity onStop. */
    fun flushNow() {
        val snapshot: JSONObject
        synchronized(lock) {
            flushTask?.cancel(false)
            flushTask = null
            if (!flushPending || store == null) return
            flushPending = false
            snapshot = store!!
            // Partition + serialize inside the lock so a concurrent applyDelta
            // can't mutate the JSONObject mid-write.
            val data = JSONObject()
            val images = JSONObject()
            for (k in snapshot.keys()) {
                if (k == IMAGES_KEY) images.put(k, snapshot.get(k)) else data.put(k, snapshot.get(k))
            }
            dir.mkdirs()
            atomicWrite(dataFile, data.toString())
            atomicWrite(imagesFile, images.toString())
        }
    }

    /** Async immediate flush for lifecycle events where blocking would ANR. */
    fun flushSoon() {
        synchronized(lock) { if (!flushPending) return }
        io.execute { flushNow() }
    }

    private fun atomicWrite(file: File, content: String) {
        val tmp = File(file.parentFile, file.name + ".tmp")
        tmp.writeText(content)
        if (!tmp.renameTo(file)) {
            // renameTo can fail across some Android filesystems; fall back to
            // delete-then-rename, which still never leaves a half-written file.
            file.delete()
            tmp.renameTo(file)
        }
    }

    // ── Backups (port of storageFile.cjs) ─────────────────────────────────────

    private val stampFmt = SimpleDateFormat("yyyy-MM-dd'T'HH-mm-ss", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    fun createBackup() {
        if (!dataFile.exists()) return
        backupsDir.mkdirs()
        dataFile.copyTo(File(backupsDir, "backup-${stampFmt.format(Date())}.json"), overwrite = true)
        pruneBackups()
    }

    private fun parseStamp(name: String): Long? {
        // "backup-2026-06-21T11-04-56.json" — same stamp format as the desktop app.
        if (name.length < 26) return null
        return try { stampFmt.parse(name.substring(7, 26))?.time } catch (_: Exception) { null }
    }

    /** Tiered retention: all hourlies for 24 h, 1/day for 7 days, 1/week for 4 weeks. */
    private fun pruneBackups() {
        val files = (backupsDir.listFiles() ?: return)
            .filter { it.name.startsWith("backup-") && it.name.endsWith(".json") }
            .mapNotNull { f -> parseStamp(f.name)?.let { Pair(f, it) } }
            .sortedByDescending { it.second } // newest first

        val now = System.currentTimeMillis()
        val keep = HashSet<String>()
        val dailySeen = HashSet<Long>()
        val weeklySeen = HashSet<Long>()
        val day = 24 * 3_600_000L

        for ((f, time) in files) {
            val age = now - time
            when {
                age < day -> if (keep.size < 24) keep.add(f.name)
                age < 7 * day -> if (dailySeen.add(time / day)) keep.add(f.name)
                age < 28 * day -> if (weeklySeen.add(time / (7 * day))) keep.add(f.name)
            }
        }
        for ((f, _) in files) if (f.name !in keep) runCatching { f.delete() }
    }
}
