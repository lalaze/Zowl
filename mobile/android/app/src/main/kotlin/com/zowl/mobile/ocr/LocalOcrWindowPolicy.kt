package com.zowl.mobile.ocr

import com.zowl.mobile.ocr.LocalOcrDiagnosticsSchema.Reason

/** Window metadata only. No node text or content heuristics. */
object LocalOcrWindowPolicy {
    enum class Kind { APP, SYSTEM, KEYBOARD, OVERLAY, OTHER }
    data class Bounds(val left: Int, val top: Int, val right: Int, val bottom: Int) {
        val width get() = right - left
        val height get() = bottom - top
        fun intersects(other: Bounds) = left < other.right && right > other.left && top < other.bottom && bottom > other.top
        fun overlapArea(other: Bounds): Long {
            val w = minOf(right, other.right) - maxOf(left, other.left)
            val h = minOf(bottom, other.bottom) - maxOf(top, other.top)
            return if (w <= 0 || h <= 0) 0 else w.toLong() * h
        }
    }
    data class Window(val id: Int, val pkg: String?, val kind: Kind, val layer: Int,
        val active: Boolean, val focused: Boolean, val bounds: Bounds, val displayId: Int = 0)
    private val packages = setOf("com.tencent.mm", "com.eg.android.AlipayGphone")

    fun target(windows: List<Window>): Window? = windows.filter { it.kind == Kind.APP }.singleOrNull()
        ?.takeIf { it.pkg in packages && it.displayId == 0 }

    /**
     * READY, or the first fixed reason this window set must not be captured.
     * A null id/pkg means the request is not bound to a window yet: the expanded
     * Quick Settings panel hides the app window from accessibility, so the target
     * can only be resolved after the panel has collapsed.
     */
    fun verdict(windows: List<Window>, id: Int?, pkg: String?, barSize: Int): Reason {
        val apps = windows.filter { it.kind == Kind.APP }
        val target = target(windows) ?: return when {
            apps.isEmpty() -> Reason.NO_APP_WINDOW
            apps.size != 1 -> Reason.MULTIPLE_APP_WINDOWS
            apps.single().pkg.isNullOrBlank() -> Reason.PACKAGE_EMPTY
            apps.single().pkg !in packages -> Reason.PACKAGE_UNSUPPORTED
            else -> Reason.DISPLAY_UNSUPPORTED
        }
        if ((id != null && target.id != id) || (pkg != null && target.pkg != pkg)) return Reason.TARGET_CHANGED
        if (!target.active) return Reason.NOT_ACTIVE
        if (!target.focused) return Reason.NOT_FOCUSED
        if (target.bounds.width <= 0 || target.bounds.height <= 0) return Reason.EMPTY_BOUNDS
        return if (windows.any { it.id != target.id && blocks(it, target, barSize) }) Reason.BLOCKED_WINDOW
        else Reason.READY
    }

    fun safe(windows: List<Window>, id: Int, pkg: String, barSize: Int): Boolean =
        verdict(windows, id, pkg, barSize) == Reason.READY

    // The screenshot is of the target window's own surface, so other windows are never
    // captured. Blocking exists to prove the panel is gone and the user is looking at the
    // payment window: focused/active windows, keyboards and large covers fail closed;
    // system bars and small unfocused overlays (floating buttons, heads-up banners) do not.
    private fun blocks(other: Window, target: Window, barSize: Int): Boolean {
        if (other.kind == Kind.KEYBOARD || other.active || other.focused) return true
        val b = other.bounds
        val t = target.bounds
        if (other.layer <= target.layer || !b.intersects(t)) return false
        val systemBar = other.kind == Kind.SYSTEM && other.pkg in setOf("com.android.systemui", "android") &&
            ((b.width >= t.width && b.height <= barSize && (b.top <= t.top || b.bottom >= t.bottom)) ||
                (b.height >= t.height && b.width <= barSize && (b.left <= t.left || b.right >= t.right)))
        if (systemBar) return false
        return b.overlapArea(t) * 4 > t.width.toLong() * t.height
    }
}
