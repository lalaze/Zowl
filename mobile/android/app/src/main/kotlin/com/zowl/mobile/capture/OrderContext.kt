package com.zowl.mobile.capture

/** One screen of a shopping app, as the text lines on it. [source] is "node" or "ocr". */
data class OrderContextPage(val source: String, val lines: List<String>)

/**
 * The screens a shopping app showed around a payment, uploaded with its candidate so the server
 * can work out what was bought (ADR-0014). Sent only while the user has item recognition on.
 */
data class OrderContext(val pages: List<OrderContextPage>)

/**
 * Removes what identifies the buyer from a screen's lines before any of it is kept: lines with a
 * phone number and their neighbours (the name and address beside it), lines that read as a
 * postal address or a recipient label, and long digit runs such as order numbers. A heuristic:
 * it cannot recognise every address, and a product line that looks like one is lost.
 */
object OrderContextScrubber {
    const val MAX_LINE_LENGTH = 120

    private val phone = Regex("""(?<!\d)1[3-9]\d(?:\d{8}|\s*\*{2,}\s*\d{2,4})(?!\d)""")
    private val recipient = Regex("""^(收货人|收件人|联系人|联系电话|收货地址|配送地址|配送至|送至|寄送至)""")
    private val region = Regex("""省|市|区|县|镇|乡|街道""")
    private val door = Regex("""\d+\s*(号|栋|幢|座|单元|室|楼|弄|巷|组)""")
    private val longDigits = Regex("""\d{7,}""")
    private val blank = Regex("""\s+""")

    data class Scrubbed(val lines: List<String>, val dropped: Int)

    fun scrub(lines: List<String>): Scrubbed {
        val tidy = lines.map { it.replace(blank, " ").trim() }.filter(String::isNotEmpty)
        val drop = BooleanArray(tidy.size)
        tidy.forEachIndexed { index, line ->
            when {
                phone.containsMatchIn(line) -> {
                    drop[index] = true
                    if (index > 0) drop[index - 1] = true
                    if (index + 1 < tidy.size) drop[index + 1] = true
                }
                recipient.containsMatchIn(line) || isAddress(line) -> drop[index] = true
            }
        }
        val kept = tidy.filterIndexed { index, _ -> !drop[index] }
            .map { it.replace(longDigits, "#").take(MAX_LINE_LENGTH) }
        return Scrubbed(kept, tidy.size - kept.size)
    }

    private fun isAddress(line: String): Boolean {
        val regions = region.findAll(line).count()
        val doors = door.findAll(line).count()
        return regions >= 3 || (regions >= 2 && doors >= 1) || (regions >= 1 && doors >= 2)
    }
}

/**
 * The last few screens of each shopping app, in memory only, until a payment claims them or
 * they go stale. Lines are scrubbed as they arrive, so nothing the scrubber removes is ever held.
 *
 * A payment takes only the screens around its checkout page (the page it was opened from, the
 * page itself, whatever was seen since), not everything the user looked at: a chat or an
 * unrelated product seen earlier stays on the phone.
 */
class OrderContextBuffer(private val now: () -> Long) {
    private class Page(
        val windowId: Int,
        val source: String,
        /** The screen in front when this one first appeared, as [key]; null for the first screen. */
        val opener: String?,
        val firstSeen: Long,
    ) {
        val key get() = "$windowId/$source"
        var lastSeen = firstSeen

        // The top of a page (its title) and its latest lines both matter; the middle of a long
        // scroll does not.
        val head = LinkedHashSet<String>()
        val tail = LinkedHashSet<String>()
        var checkout = false
        var seenAt = 0L
        var dropped = 0

        fun add(line: String) {
            if (line in head) return
            if (head.size < HEAD_LINES) {
                head.add(line)
                return
            }
            // Re-adding moves a line to the end, so the tail holds the most recently seen lines.
            tail.remove(line)
            tail.add(line)
            while (tail.size > TAIL_LINES) tail.remove(tail.first())
        }

        fun lines(): List<String> {
            val all = ArrayList<String>(head.size + tail.size)
            var budget = PAGE_CHARACTERS
            for (line in head + tail) {
                if (line.length > budget) break
                all.add(line)
                budget -= line.length
            }
            return all
        }
    }

    private var owner: String? = null
    private val pages = HashMap<String, ArrayList<Page>>()
    // Orders reads without relying on the clock's resolution.
    private var reads = 0L

    /** One read of a screen, by node text or OCR. [checkout] marks the page a payment starts from. */
    fun onPage(
        owner: String,
        platform: String,
        windowId: Int,
        source: String,
        lines: List<String>,
        checkout: Boolean = false,
        /** A fresh picture of the whole screen: what was kept of this window before is replaced. */
        replace: Boolean = false,
    ) {
        if (this.owner != owner) {
            pages.clear()
            this.owner = owner
        }
        val scrubbed = OrderContextScrubber.scrub(lines)
        val recent = pages.getOrPut(platform) { ArrayList() }
        val time = now()
        recent.removeAll { time - it.seenAt > STALE_AFTER }
        if (scrubbed.lines.isEmpty() && !checkout) return
        val read = ++reads
        val page = recent.firstOrNull { it.windowId == windowId && it.source == source }
            ?: Page(windowId, source, recent.lastOrNull()?.key, read).also(recent::add)
        if (replace) {
            page.head.clear()
            page.tail.clear()
            page.dropped = 0
        }
        scrubbed.lines.forEach(page::add)
        // A screen is read many times over; the same removed lines are not counted again.
        page.dropped = maxOf(page.dropped, scrubbed.dropped)
        page.seenAt = time
        page.lastSeen = read
        if (checkout || scrubbed.lines.any(::isCheckoutLine)) page.checkout = true
        // Most recently seen last.
        recent.remove(page)
        recent.add(page)
        // The checkout page and the screen it was opened from outlive the screens that follow:
        // they are the ones that name the order.
        while (recent.size > KEPT_PAGES) {
            val openers = recent.filter { it.checkout }.mapNotNull { it.opener }
            recent.removeAt(recent.indexOfFirst { !it.checkout && it.key !in openers }.coerceAtLeast(0))
        }
    }

    /** The screens around the payment just confirmed on [platform], oldest first; they are then forgotten. */
    fun take(owner: String, platform: String): Taken? {
        val recent = pages.remove(platform) ?: return null
        if (this.owner != owner) return null
        val time = now()
        val fresh = recent.filter { time - it.seenAt <= STALE_AFTER }
        if (fresh.isEmpty()) return null
        val checkout = fresh.lastOrNull { it.checkout }
        val chosen = if (checkout != null) {
            // A popup over the checkout page is seen later than the goods page it was opened from,
            // so "the page before" is the opener, not whatever was read last.
            val lead = listOfNotNull(fresh.firstOrNull { it.key == checkout.opener && it !== checkout }, checkout)
            val since = fresh.filter { it !in lead && it.lastSeen > checkout.firstSeen }
            lead + since.takeLast(MAX_PAGES - lead.size)
        } else {
            fresh.takeLast(UNMARKED_PAGES)
        }
        val result = chosen.mapNotNull { page ->
            page.lines().takeIf { it.isNotEmpty() }?.let { OrderContextPage(page.source, it) }
        }
        if (result.isEmpty()) return null
        return Taken(OrderContext(result), chosen.sumOf { it.dropped }, checkout != null)
    }

    fun clear() {
        pages.clear()
        owner = null
    }

    /** [dropped] and [checkout] are counts and a flag for the capture log; no text. */
    data class Taken(val context: OrderContext, val dropped: Int, val checkout: Boolean) {
        val lines: Int get() = context.pages.sumOf { it.lines.size }
    }

    companion object {
        const val MAX_PAGES = 4
        private const val KEPT_PAGES = 6
        private const val UNMARKED_PAGES = 2
        private const val HEAD_LINES = 40
        private const val TAIL_LINES = 40
        private const val PAGE_CHARACTERS = 1_800
        const val STALE_AFTER = 5 * 60 * 1000L

        private val platforms = setOf("taobao", "pinduoduo")
        private val checkoutWords = listOf(
            "提交订单", "确认订单", "立即支付", "去支付", "确认支付", "立即下单", "确认下单", "去结算", "更换支付方式",
        )

        /** Only the shopping apps whose candidates never carry goods of their own. */
        fun collects(platform: String): Boolean = platform in platforms

        private fun isCheckoutLine(line: String): Boolean = checkoutWords.any(line::contains)
    }
}
