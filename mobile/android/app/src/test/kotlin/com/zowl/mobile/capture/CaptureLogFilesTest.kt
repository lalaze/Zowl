package com.zowl.mobile.capture

import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.nio.file.Files
import java.util.TimeZone
import java.util.zip.GZIPInputStream
import java.util.zip.ZipInputStream

class CaptureLogFilesTest {
    private val dir = Files.createTempDirectory("capture-log").toFile()
    private val shanghai = TimeZone.getTimeZone("Asia/Shanghai")
    // 2026-11-17 09:46:13.123 in Shanghai.
    private val morning = 1_794_879_973_123L
    private val day = CaptureLogFiles.DAY_MILLIS

    @After fun cleanUp() {
        dir.deleteRecursively()
    }

    private fun files(
        maxFileBytes: Long = 1_000_000,
        minFreeBytes: Long = CaptureLogFiles.MIN_FREE_BYTES,
        freeBytes: () -> Long = { CaptureLogFiles.MIN_FREE_BYTES * 2 },
        compress: (File, File) -> Unit = { source, dest ->
            FileInputStream(source).use { input ->
                java.util.zip.GZIPOutputStream(java.io.FileOutputStream(dest)).use { output ->
                    input.copyTo(output)
                }
            }
        },
    ) = CaptureLogFiles(dir, shanghai, maxFileBytes, minFreeBytes, freeBytes, compress)

    private fun text(name: String) = File(dir, name).readText()

    private fun gunzipText(name: String): String =
        GZIPInputStream(FileInputStream(File(dir, name))).bufferedReader().use { it.readText() }

    @Test fun linesGoToTheLocalDaysFileWithTheirTime() {
        val log = files()
        log.append(morning, "service connected")
        log.append(morning + 1_000, "window-state wechat window=12 class=LauncherUI")
        assertEquals(
            "11-17 09:46:13.123 service connected\n" +
                "11-17 09:46:14.123 window-state wechat window=12 class=LauncherUI\n",
            text("2026-11-17.log"),
        )
    }

    @Test fun aMessageRepeatedBackToBackIsWrittenOnceWithItsCount() {
        val log = files()
        log.append(morning, "look wechat window=12 class=LauncherUI texts=0 partial=false")
        log.append(morning + 500, "look wechat window=12 class=LauncherUI texts=0 partial=false")
        log.append(morning + 1_000, "look wechat window=12 class=LauncherUI texts=0 partial=false")
        log.append(morning + 2_000, "service unbound")
        assertEquals(
            "11-17 09:46:13.123 look wechat window=12 class=LauncherUI texts=0 partial=false\n" +
                "11-17 09:46:14.123 (previous line repeated 2 more times)\n" +
                "11-17 09:46:15.123 service unbound\n",
            text("2026-11-17.log"),
        )
    }

    @Test fun lineBreaksCannotForgeExtraLines() {
        val log = files()
        log.append(morning, "previous process description=a\nb\rc")
        assertEquals("11-17 09:46:13.123 previous process description=a b c\n", text("2026-11-17.log"))
    }

    @Test fun aNewDayStartsANewFileAndCompressesTheFinishedDay() {
        val log = files()
        log.append(morning, "one")
        val original = text("2026-11-17.log")
        log.append(morning + day, "two")
        assertFalse(File(dir, "2026-11-17.log").exists())
        assertTrue(File(dir, "2026-11-17.log.gz").exists())
        assertEquals(original, gunzipText("2026-11-17.log.gz"))
        assertTrue(text("2026-11-18.log").endsWith(" two\n"))
    }

    @Test fun aFullFileContinuesInTheNextPartAndCompressesTheFullPart() {
        val log = files(maxFileBytes = 40)
        log.append(morning, "first line of the day, long enough")
        val firstPart = text("2026-11-17.log")
        log.append(morning + 1, "second")
        assertFalse(File(dir, "2026-11-17.log").exists())
        assertTrue(File(dir, "2026-11-17.log.gz").exists())
        assertEquals(firstPart, gunzipText("2026-11-17.log.gz"))
        assertTrue(text("2026-11-17.2.log").endsWith(" second\n"))
        // A restarted process appends to the part that still has room and never recreates part 1.
        files(maxFileBytes = 40).append(morning + 2, "third")
        assertFalse(File(dir, "2026-11-17.log").exists())
        assertTrue(text("2026-11-17.2.log").endsWith(" third\n"))
    }

    @Test fun restartedProcessNeverRecreatesOrOverwritesAnExistingCompressedPart() {
        val gz = File(dir, "2026-11-17.log.gz").apply { writeBytes(byteArrayOf(1, 2, 3, 4)) }
        files().append(morning, "after restart")
        assertFalse(File(dir, "2026-11-17.log").exists())
        assertArrayEquals(byteArrayOf(1, 2, 3, 4), gz.readBytes())
        assertEquals("11-17 09:46:13.123 after restart\n", text("2026-11-17.2.log"))
    }

    @Test fun filesOlderThanAWeekAndBeyondSixteenMiBSurvive() {
        val old = File(dir, "2026-10-01.log").apply {
            writeText("10-01 08:00:00.000 very old\n")
            setLastModified(morning - 47 * day)
        }
        val chunk = ByteArray(9 * 1024 * 1024) { 0x41 }
        val big1 = File(dir, "2026-11-15.log.gz").apply { writeBytes(chunk) }
        val big2 = File(dir, "2026-11-16.log.gz").apply { writeBytes(chunk) }

        files().append(morning, "today")

        assertFalse(old.exists())
        assertTrue(File(dir, "2026-10-01.log.gz").exists())
        assertEquals("10-01 08:00:00.000 very old\n", gunzipText("2026-10-01.log.gz"))
        assertTrue(big1.exists())
        assertTrue(big2.exists())
        assertEquals(chunk.size.toLong(), big1.length())
        assertEquals(chunk.size.toLong(), big2.length())
        assertTrue(File(dir, "2026-11-17.log").exists())
    }

    @Test fun leftoverTmpIsCleanedAndSourceIsRecompressed() {
        val source = File(dir, "2026-11-16.log").apply { writeText("11-16 12:00:00.000 yesterday\n") }
        val tmp = File(dir, "2026-11-16.log.gz.tmp").apply { writeText("partial-garbage") }

        files().append(morning, "today")

        assertFalse(tmp.exists())
        assertFalse(source.exists())
        assertTrue(File(dir, "2026-11-16.log.gz").exists())
        assertEquals("11-16 12:00:00.000 yesterday\n", gunzipText("2026-11-16.log.gz"))
    }

    @Test fun existingGzIsPreservedWhenDuplicateLogExists() {
        val existingGzBytes = byteArrayOf(0x1f, 0x8b.toByte(), 0x08, 0x00, 0x01, 0x02)
        val gz = File(dir, "2026-11-16.log.gz").apply { writeBytes(existingGzBytes) }
        val dupLog = File(dir, "2026-11-16.log").apply { writeText("11-16 12:00:00.000 stale\n") }

        files().append(morning, "today")

        assertFalse(dupLog.exists())
        assertTrue(gz.exists())
        assertArrayEquals(existingGzBytes, gz.readBytes())
    }

    @Test fun compressionFailureLeavesOriginalLogIntact() {
        val original = File(dir, "2026-11-16.log").apply { writeText("11-16 12:00:00.000 keep me\n") }
        val log = files(compress = { _, dest ->
            dest.writeText("partial")
            throw IOException("simulated disk failure")
        })

        log.append(morning, "today")

        assertTrue(original.exists())
        assertEquals("11-16 12:00:00.000 keep me\n", original.readText())
        assertFalse(File(dir, "2026-11-16.log.gz").exists())
        assertFalse(File(dir, "2026-11-16.log.gz.tmp").exists())
    }

    @Test fun logsAreOrderedByNameDerivedDayAndPartEvenWhenMtimesDisagree() {
        val f1 = File(dir, "2026-11-15.log.gz").apply { writeText("a"); setLastModified(morning + 50_000) }
        val f2 = File(dir, "2026-11-16.log.gz").apply { writeText("b"); setLastModified(morning + 40_000) }
        val f3 = File(dir, "2026-11-16.2.log.gz").apply { writeText("c"); setLastModified(morning + 30_000) }
        val f4 = File(dir, "2026-11-16.10.log.gz").apply { writeText("d"); setLastModified(morning + 20_000) }
        val f5 = File(dir, "2026-11-17.log").apply { writeText("e"); setLastModified(morning + 10_000) }
        File(dir, "2026-11-16.log.gz.tmp").writeText("tmp")
        File(dir, "notes.txt").writeText("ignored")
        File(dir, "2026-11-16.1.log").writeText("ignored")

        assertEquals(
            listOf(f1.name, f2.name, f3.name, f4.name, f5.name),
            files().logs().map(File::getName),
        )
    }

    @Test fun lowStoragePausesOnceDropsLinesAndResumesWhenSpaceRecovers() {
        val existing = File(dir, "2026-11-16.log.gz").apply { writeText("existing") }
        var available = 600L * 1024 * 1024
        var checks = 0
        val log = files(
            minFreeBytes = 500L * 1024 * 1024,
            freeBytes = {
                checks++
                available
            },
        )

        log.append(morning, "before")
        assertEquals(1, checks)

        // Within 60 s: does not re-check space yet.
        available = 100L * 1024 * 1024
        log.append(morning + 30_000, "still-writing")
        assertEquals(1, checks)

        // At 60 s: detects low space, writes one pause line, drops the message.
        log.append(morning + 60_000, "dropped-on-pause")
        assertEquals(2, checks)

        // Within 60 s of pausing: stays paused without checking again.
        available = 600L * 1024 * 1024
        log.append(morning + 90_000, "dropped-during-interval")
        assertEquals(2, checks)

        // At 120 s: still low space -> no duplicate pause line.
        available = 200L * 1024 * 1024
        log.append(morning + 120_000, "dropped-still-low")
        assertEquals(3, checks)

        // At 180 s: back at threshold -> writes resumed and continues.
        available = 500L * 1024 * 1024
        log.append(morning + 180_000, "after-resume")
        assertEquals(4, checks)

        assertTrue(existing.exists())
        assertEquals(
            "11-17 09:46:13.123 before\n" +
                "11-17 09:46:43.123 still-writing\n" +
                "11-17 09:47:13.123 log paused: low storage\n" +
                "11-17 09:49:13.123 log resumed\n" +
                "11-17 09:49:13.123 after-resume\n",
            text("2026-11-17.log"),
        )
    }

    @Test fun exportZipsEveryKeptFileInOrderWithIdenticalBytesAndFlushesRepeat() {
        File(dir, "2026-11-16.log").apply {
            writeText("11-16 23:58:00.000 yesterday-1\n")
            setLastModified(morning + 10_000)
        }
        File(dir, "2026-11-16.2.log").apply {
            writeText("11-16 23:59:00.000 yesterday-2\n")
            setLastModified(morning - day)
        }
        val log = files()
        log.append(morning, "same")
        log.append(morning + 1_000, "same")
        val out = File(dir.parentFile, "${dir.name}-export")
        try {
            val exported = log.exportTo(out, morning + 2_000)!!
            assertEquals("zowl-capture-log-2026-11-17.zip", exported.name)

            val entries = linkedMapOf<String, ByteArray>()
            ZipInputStream(FileInputStream(exported)).use { zip ->
                while (true) {
                    val entry = zip.nextEntry ?: break
                    entries[entry.name] = zip.readBytes()
                    zip.closeEntry()
                }
            }
            assertEquals(
                listOf("2026-11-16.log.gz", "2026-11-16.2.log.gz", "2026-11-17.log"),
                entries.keys.toList(),
            )
            for ((name, bytes) in entries) {
                assertArrayEquals("Mismatch for $name", File(dir, name).readBytes(), bytes)
            }
            assertEquals(
                "11-17 09:46:13.123 same\n" +
                    "11-17 09:46:14.123 (previous line repeated 1 more times)\n",
                String(entries.getValue("2026-11-17.log")),
            )
        } finally {
            out.deleteRecursively()
        }
    }

    @Test fun nothingToExportBeforeTheFirstLine() {
        val out = File(dir.parentFile, "${dir.name}-export")
        try {
            assertNull(files().exportTo(out, morning))
        } finally {
            out.deleteRecursively()
        }
    }
}
