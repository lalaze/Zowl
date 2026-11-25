package com.zowl.mobile.capture

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.Process
import androidx.annotation.RequiresApi
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.Executors
import java.util.zip.GZIPOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * The capture trace kept permanently on the device, so a payment that was not captured can be
 * traced back afterwards (ADR-0013). It holds the same content-free messages as [CaptureTrace]
 * (window class names, counts, outcomes, reason codes) plus the time of each; never page text,
 * amounts, merchants or anything read from a screen.
 *
 * Daily files in the app's external files directory, which adb can read:
 * `/sdcard/Android/data/com.zowl.mobile/files/capture-log/`. Finished files are gzipped in place;
 * files are never deleted by the app. If free space drops below 500 MiB, logging pauses with a
 * single notice line and resumes once space recovers. Nothing is uploaded; the user can export
 * all kept files as one zip through the share sheet.
 */
object CaptureLog {
    private const val DIR = "capture-log"
    private const val EXPORT_DIR = "capture-log-export"
    private const val STATE = "zowl_capture_log"
    private const val LAST_EXIT_REPORTED = "last_exit_reported_at"

    private val executor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "zowl-capture-log").apply { isDaemon = true }
    }
    @Volatile private var context: Context? = null
    // Executor thread only.
    private var files: CaptureLogFiles? = null

    fun init(context: Context) {
        if (this.context == null) this.context = context.applicationContext
    }

    fun write(message: String) {
        val app = context ?: return
        val now = System.currentTimeMillis()
        executor.execute { runCatching { files(app).append(now, message) } }
    }

    /**
     * The process just started: say so, and how the previous one ended as far as the system
     * recorded it (swiped away, frozen, out of memory, crashed...).
     */
    fun onProcessStart() {
        val app = context ?: return
        executor.execute {
            runCatching {
                val info = app.packageManager.getPackageInfo(app.packageName, 0)
                @Suppress("DEPRECATION")
                val versionCode = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
                files(app).append(System.currentTimeMillis(),
                    "process start pid=${Process.myPid()} version=${info.versionName} ($versionCode) " +
                        "android=${Build.VERSION.SDK_INT} device=${Build.MODEL} zone=${TimeZone.getDefault().id}")
                if (Build.VERSION.SDK_INT >= 30) reportExits(app)
            }
        }
    }

    /** A zip of every kept file, oldest first, for the share sheet; null when there is none. */
    fun export(done: (File?) -> Unit) {
        val app = context ?: return done(null)
        executor.execute {
            val file = runCatching {
                files(app).exportTo(File(app.cacheDir, EXPORT_DIR), System.currentTimeMillis())
            }.getOrNull()
            Handler(Looper.getMainLooper()).post { done(file) }
        }
    }

    private fun files(app: Context): CaptureLogFiles = files ?: CaptureLogFiles(
        app.getExternalFilesDir(DIR) ?: File(app.filesDir, DIR),
    ).also { files = it }

    @RequiresApi(30)
    private fun reportExits(app: Context) {
        val state = app.getSharedPreferences(STATE, Context.MODE_PRIVATE)
        val reported = state.getLong(LAST_EXIT_REPORTED, 0L)
        val exits = app.getSystemService(ActivityManager::class.java)
            .getHistoricalProcessExitReasons(null, 0, 16)
            .filter { it.timestamp > reported }
            .sortedBy { it.timestamp }
        if (exits.isEmpty()) return
        val format = SimpleDateFormat("MM-dd HH:mm:ss.SSS", Locale.US)
        exits.forEach { exit ->
            val description = exit.description?.replace(Regex("\\s+"), " ")?.take(120)
            files(app).append(System.currentTimeMillis(),
                "previous process pid=${exit.pid} ended ${format.format(Date(exit.timestamp))} " +
                    "reason=${exitReason(exit.reason)} status=${exit.status} importance=${exit.importance}" +
                    (description?.let { " description=$it" } ?: ""))
        }
        state.edit().putLong(LAST_EXIT_REPORTED, exits.last().timestamp).apply()
    }

    private fun exitReason(reason: Int): String = when (reason) {
        ApplicationExitInfo.REASON_EXIT_SELF -> "exit_self"
        ApplicationExitInfo.REASON_SIGNALED -> "signaled"
        ApplicationExitInfo.REASON_LOW_MEMORY -> "low_memory"
        ApplicationExitInfo.REASON_CRASH -> "crash"
        ApplicationExitInfo.REASON_CRASH_NATIVE -> "crash_native"
        ApplicationExitInfo.REASON_ANR -> "anr"
        ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> "initialization_failure"
        ApplicationExitInfo.REASON_PERMISSION_CHANGE -> "permission_change"
        ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "excessive_resource_usage"
        ApplicationExitInfo.REASON_USER_REQUESTED -> "user_requested"
        ApplicationExitInfo.REASON_USER_STOPPED -> "user_stopped"
        ApplicationExitInfo.REASON_DEPENDENCY_DIED -> "dependency_died"
        ApplicationExitInfo.REASON_OTHER -> "other"
        ApplicationExitInfo.REASON_FREEZER -> "freezer"
        ApplicationExitInfo.REASON_PACKAGE_STATE_CHANGE -> "package_state_change"
        ApplicationExitInfo.REASON_PACKAGE_UPDATED -> "package_updated"
        else -> "unknown($reason)"
    }
}

/**
 * The log files themselves. One file per local day (`2026-11-17.log`, then `2026-11-17.2.log`
 * once a file reaches [maxFileBytes]). Kept files are never deleted by the app: finished `.log`
 * files (from earlier local days or full parts) are gzipped to `<name>.log.gz` when a new file
 * is opened. When usable space on the log volume drops below [minFreeBytes] (checked at most
 * once per 60 s), logging pauses after writing one notice line and resumes once space recovers.
 * A message repeated back to back is written once, followed by how many times it repeated.
 * Not thread-safe: [CaptureLog] calls it from one thread.
 */
internal class CaptureLogFiles(
    private val dir: File,
    zone: TimeZone = TimeZone.getDefault(),
    private val maxFileBytes: Long = MAX_FILE_BYTES,
    private val minFreeBytes: Long = MIN_FREE_BYTES,
    private val freeBytes: () -> Long = { usableSpace(dir) },
    private val compress: (File, File) -> Unit = ::gzip,
) {
    private data class LogKey(val day: String, val part: Int, val compressed: Boolean)

    private val dayFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = zone }
    private val stampFormat = SimpleDateFormat("MM-dd HH:mm:ss.SSS", Locale.US).apply { timeZone = zone }
    private var current: File? = null
    private var currentDay: String? = null
    private var lastMessage: String? = null
    private var lastAt = 0L
    private var repeats = 0
    private var storagePaused = false
    private var spaceChecked = false
    private var lastSpaceCheckAt = 0L

    fun append(now: Long, message: String) {
        if (!ensureStorage(now)) return
        val line = message.replace('\n', ' ').replace('\r', ' ').take(MAX_LINE_CHARS)
        if (line == lastMessage) {
            repeats++
            lastAt = now
            return
        }
        val text = repeatSummary() + "${stampFormat.format(Date(now))} $line\n"
        lastMessage = line
        lastAt = now
        write(now, text)
    }

    /** Packs every kept file as-is, in day/part order, into a fresh zip in [outDir]. */
    fun exportTo(outDir: File, now: Long): File? {
        repeatSummary().takeIf(String::isNotEmpty)?.let {
            lastMessage = null
            write(now, it, allowCompress = !storagePaused)
        }
        val logs = logs()
        if (logs.isEmpty()) return null
        outDir.mkdirs()
        outDir.listFiles()?.forEach { it.delete() }
        val out = File(outDir, "zowl-capture-log-${dayFormat.format(Date(now))}.zip")
        ZipOutputStream(FileOutputStream(out)).use { zip ->
            logs.forEach { file ->
                zip.putNextEntry(ZipEntry(file.name))
                file.inputStream().use { it.copyTo(zip) }
                zip.closeEntry()
            }
        }
        return out
    }

    /** Kept log files (`.log` and `.log.gz`), ordered by day and part parsed from their names. */
    fun logs(): List<File> =
        dir.listFiles().orEmpty()
            .mapNotNull { file ->
                if (!file.isFile) return@mapNotNull null
                parseFileName(file.name)?.let { file to it }
            }
            .sortedWith(
                compareBy<Pair<File, LogKey>> { it.second.day }
                    .thenBy { it.second.part }
                    .thenBy { it.second.compressed },
            )
            .map { it.first }

    private fun ensureStorage(now: Long): Boolean {
        val due = !spaceChecked || now - lastSpaceCheckAt >= SPACE_CHECK_INTERVAL_MILLIS
        if (!due) return !storagePaused
        spaceChecked = true
        lastSpaceCheckAt = now
        if (freeBytes() < minFreeBytes) {
            if (!storagePaused) {
                storagePaused = true
                val text = repeatSummary() + "${stampFormat.format(Date(now))} $LOG_PAUSED_MESSAGE\n"
                lastMessage = null
                lastAt = now
                write(now, text, allowCompress = false)
            }
            return false
        }
        if (storagePaused) {
            storagePaused = false
            lastMessage = null
            lastAt = now
            write(now, "${stampFormat.format(Date(now))} $LOG_RESUMED_MESSAGE\n")
        }
        return true
    }

    private fun repeatSummary(): String {
        if (repeats == 0) return ""
        val text = "${stampFormat.format(Date(lastAt))} (previous line repeated $repeats more times)\n"
        repeats = 0
        return text
    }

    private fun write(now: Long, text: String, allowCompress: Boolean = true) {
        val day = dayFormat.format(Date(now))
        var file = current
        if (file == null || day != currentDay || file.length() >= maxFileBytes) {
            dir.mkdirs()
            file = openFile(day)
            current = file
            currentDay = day
            FileOutputStream(file, true).use { it.write(text.toByteArray()) }
            if (allowCompress) compressFinished(day, file)
            return
        }
        FileOutputStream(file, true).use { it.write(text.toByteArray()) }
    }

    private fun openFile(day: String): File {
        var part = 1
        while (true) {
            val name = if (part == 1) "$day.log" else "$day.$part.log"
            val file = File(dir, name)
            val gz = File(dir, "$name$GZ_SUFFIX")
            if (!gz.exists() && (!file.exists() || file.length() < maxFileBytes)) return file
            part++
        }
    }

    private fun compressFinished(activeDay: String, activeFile: File) {
        val entries = dir.listFiles().orEmpty()
        entries.filter { it.isFile && it.name.endsWith(TMP_SUFFIX) }.forEach { it.delete() }
        for (file in entries) {
            if (!file.isFile || file == activeFile) continue
            val key = parseFileName(file.name) ?: continue
            if (key.compressed) continue
            val gz = File(dir, "${file.name}$GZ_SUFFIX")
            if (gz.exists()) {
                file.delete()
                continue
            }
            if (key.day >= activeDay && file.length() < maxFileBytes) continue
            val tmp = File(dir, "${file.name}$TMP_SUFFIX")
            val ok = runCatching {
                compress(file, tmp)
                if (gz.exists() || !tmp.renameTo(gz)) throw IOException("Could not finalize ${gz.name}")
                true
            }.getOrElse {
                tmp.delete()
                false
            }
            if (ok) file.delete()
        }
    }

    private fun parseFileName(name: String): LogKey? {
        val match = LOG_NAME.matchEntire(name) ?: return null
        val day = match.groupValues[1]
        val partText = match.groupValues[2]
        val part = if (partText.isEmpty()) 1 else partText.toIntOrNull() ?: return null
        val compressed = match.groupValues[3].isNotEmpty()
        return LogKey(day, part, compressed)
    }

    companion object {
        const val MAX_FILE_BYTES = 2L * 1024 * 1024
        const val MIN_FREE_BYTES = 500L * 1024 * 1024
        const val SPACE_CHECK_INTERVAL_MILLIS = 60L * 1000
        const val DAY_MILLIS = 24L * 60 * 60 * 1000
        const val MAX_LINE_CHARS = 400
        const val LOG_PAUSED_MESSAGE = "log paused: low storage"
        const val LOG_RESUMED_MESSAGE = "log resumed"
        private const val GZ_SUFFIX = ".gz"
        private const val TMP_SUFFIX = ".gz.tmp"
        private val LOG_NAME = Regex("""^(\d{4}-\d{2}-\d{2})(?:\.([2-9]\d*|1\d+))?\.log(\.gz)?$""")

        private fun usableSpace(dir: File): Long {
            var current: File? = dir
            while (current != null && !current.exists()) current = current.parentFile
            return current?.usableSpace ?: 0L
        }

        private fun gzip(source: File, dest: File) {
            FileInputStream(source).use { input ->
                GZIPOutputStream(FileOutputStream(dest)).use { output ->
                    input.copyTo(output)
                }
            }
        }
    }
}
