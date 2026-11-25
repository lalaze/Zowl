package com.zowl.mobile.capture

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OrderContextTest {
    private var clock = 0L
    private val buffer = OrderContextBuffer { clock }

    private fun pages(platform: String = "taobao", owner: String = "user-a") =
        buffer.take(owner, platform)?.context?.pages?.map { it.lines }

    @Test
    fun scrubberDropsWhoAndWhereTheOrderGoes() {
        val scrubbed = OrderContextScrubber.scrub(
            listOf(
                "张三",
                "138****1234",
                "浙江省杭州市西湖区文三路 100 号 2 幢 301 室",
                "晨光文具旗舰店",
                "收货人：李四",
                "配送至 某某小区",
                "上海市浦东新区世纪大道88号",
                "  晨光中性笔   0.5mm  ",
                "订单编号 10002000300040005000",
                "",
                "¥18.80",
            ),
        )
        assertEquals(
            listOf("晨光文具旗舰店", "晨光中性笔 0.5mm", "订单编号 #", "¥18.80"),
            scrubbed.lines,
        )
        assertEquals(6, scrubbed.dropped)
    }

    @Test
    fun scrubberRecognisesPlainAndMaskedPhoneNumbers() {
        for (line in listOf("13800001111", "86-13800001111", "张三 138 **** 1234", "电话159******78")) {
            assertEquals(line, emptyList<String>(), OrderContextScrubber.scrub(listOf(line)).lines)
        }
    }

    @Test
    fun scrubberKeepsGoodsThatMerelyMentionPlacesOrNumbers() {
        val goods = listOf(
            "上海市区同城鲜花速递",
            "5号电池 7号电池 20粒装",
            "适用小米14手机壳",
            "24包 便携30x40cm-5L按压+家用装 ¥16.5",
            "已选: 12支装",
            "×2",
        )
        assertEquals(goods, OrderContextScrubber.scrub(goods).lines)
    }

    @Test
    fun scrubberCutsLongLines() {
        val line = OrderContextScrubber.scrub(listOf("笔".repeat(300))).lines.single()
        assertEquals(OrderContextScrubber.MAX_LINE_LENGTH, line.length)
    }

    @Test
    fun paymentTakesThePageBeforeCheckoutAndEverythingAfter() {
        buffer.onPage("user-a", "taobao", 1, "node", listOf("和卖家的聊天"))
        buffer.onPage("user-a", "taobao", 2, "node", listOf("商品详情 晨光中性笔"))
        buffer.onPage("user-a", "taobao", 3, "ocr", listOf("确认订单", "晨光中性笔", "提交订单"))
        buffer.onPage("user-a", "taobao", 4, "ocr", listOf("支付成功", "晨光中性笔"))

        val taken = buffer.take("user-a", "taobao")!!
        assertEquals(
            listOf(
                OrderContextPage("node", listOf("商品详情 晨光中性笔")),
                OrderContextPage("ocr", listOf("确认订单", "晨光中性笔", "提交订单")),
                OrderContextPage("ocr", listOf("支付成功", "晨光中性笔")),
            ),
            taken.context.pages,
        )
        assertTrue(taken.checkout)
        assertEquals(6, taken.lines)
        // Claimed once.
        assertNull(buffer.take("user-a", "taobao"))
    }

    @Test
    fun withoutACheckoutPageOnlyTheLastTwoScreensGo() {
        buffer.onPage("user-a", "taobao", 1, "node", listOf("聊天"))
        buffer.onPage("user-a", "taobao", 2, "node", listOf("商品"))
        buffer.onPage("user-a", "taobao", 3, "node", listOf("小程序点单"))
        val taken = buffer.take("user-a", "taobao")!!
        assertEquals(listOf(listOf("商品"), listOf("小程序点单")), taken.context.pages.map { it.lines })
        assertFalse(taken.checkout)
    }

    @Test
    fun aMarkedOrderPanelIsACheckoutPageWhateverItsWording() {
        buffer.onPage("user-a", "pinduoduo", 1, "node", listOf("逛逛"))
        buffer.onPage("user-a", "pinduoduo", 2, "node", listOf("首页推荐"))
        buffer.onPage("user-a", "pinduoduo", 3, "node", listOf("已选: 24包", "仅 ¥16.5"))
        buffer.onPage("user-a", "pinduoduo", 3, "node", emptyList(), checkout = true)
        assertEquals(
            listOf(listOf("首页推荐"), listOf("已选: 24包", "仅 ¥16.5")),
            pages("pinduoduo"),
        )
    }

    // Window order of a device log: feed, goods page, order panel (its own window), a popup over the
    // panel, then the panel again as it reports the payment.
    @Test
    fun thePageBeforeCheckoutIsTheOneItWasOpenedFromNotTheLastOneRead() {
        buffer.onPage("user-a", "pinduoduo", 15997, "node", listOf("推荐流"))
        buffer.onPage("user-a", "pinduoduo", 16000, "node", listOf("商品详情 洗手液"))
        buffer.onPage("user-a", "pinduoduo", 16001, "node", listOf("已选: 24包", "更换支付方式"))
        buffer.onPage("user-a", "pinduoduo", 16002, "node", listOf("免密支付"))
        buffer.onPage("user-a", "pinduoduo", 16001, "node", listOf("支付成功"))
        assertEquals(
            listOf(
                listOf("商品详情 洗手液"),
                listOf("已选: 24包", "更换支付方式", "支付成功"),
                listOf("免密支付"),
            ),
            pages("pinduoduo"),
        )
    }

    @Test
    fun rereadsOfAWindowMergeAndTheOpenerStaysInFront() {
        buffer.onPage("user-a", "taobao", 1, "node", listOf("商品标题", "¥10"))
        buffer.onPage("user-a", "taobao", 2, "node", listOf("提交订单"))
        buffer.onPage("user-a", "taobao", 1, "node", listOf("商品标题", "评价 100 条"))
        assertEquals(
            listOf(listOf("商品标题", "¥10", "评价 100 条"), listOf("提交订单")),
            pages(),
        )
    }

    // A device log: one order panel read eight times reported dropped=42.
    @Test
    fun linesRemovedFromAScreenAreCountedOnceHoweverOftenItIsRead() {
        repeat(8) {
            buffer.onPage(
                "user-a", "pinduoduo", 1, "node",
                listOf("张三", "13800001111", "广东省深圳市南山区科技路 1 号", "洗手液", "更换支付方式"),
            )
        }
        val taken = buffer.take("user-a", "pinduoduo")!!
        assertEquals(3, taken.dropped)
        assertEquals(listOf(listOf("洗手液", "更换支付方式")), taken.context.pages.map { it.lines })
    }

    @Test
    fun aFreshPictureOfAScreenReplacesWhatWasKeptOfIt() {
        buffer.onPage("user-a", "taobao", 1, "ocr", listOf("确认订单", "宫保鸡丁"), checkout = true, replace = true)
        buffer.onPage("user-a", "taobao", 1, "ocr", listOf("确认订单", "鱼香肉丝"), checkout = true, replace = true)
        assertEquals(listOf(listOf("确认订单", "鱼香肉丝")), pages())
    }

    @Test
    fun aLongScrollKeepsTheTopOfThePageAndItsLatestLines() {
        buffer.onPage("user-a", "taobao", 1, "node", (1..200).map { "行$it" })
        val lines = pages()!!.single()
        assertEquals(80, lines.size)
        assertEquals("行1", lines.first())
        assertEquals("行40", lines[39])
        assertEquals("行161", lines[40])
        assertEquals("行200", lines.last())
    }

    @Test
    fun aPageIsCappedInCharactersAndAPaymentInPages() {
        buffer.onPage("user-a", "taobao", 1, "node", (1..80).map { "$it".padEnd(100, '字') })
        assertTrue(pages()!!.single().sumOf { it.length } <= 1_800)

        // However many screens follow, the checkout page and the one before it stay.
        buffer.onPage("user-a", "taobao", 1, "node", listOf("商品"))
        buffer.onPage("user-a", "taobao", 2, "node", listOf("提交订单"))
        (3..12).forEach { buffer.onPage("user-a", "taobao", it, "node", listOf("之后 $it")) }
        assertEquals(
            listOf(listOf("商品"), listOf("提交订单"), listOf("之后 11"), listOf("之后 12")),
            pages(),
        )

        buffer.onPage("user-a", "taobao", 1, "node", listOf("商品"))
        buffer.onPage("user-a", "taobao", 2, "node", listOf("提交订单"))
        (3..5).forEach { buffer.onPage("user-a", "taobao", it, "node", listOf("之后 $it")) }
        assertEquals(
            listOf(listOf("商品"), listOf("提交订单"), listOf("之后 4"), listOf("之后 5")),
            pages(),
        )
    }

    @Test
    fun staleScreensAndOtherAccountsScreensAreNotTaken() {
        buffer.onPage("user-a", "taobao", 1, "node", listOf("提交订单"))
        clock += OrderContextBuffer.STALE_AFTER + 1
        assertNull(buffer.take("user-a", "taobao"))

        buffer.onPage("user-a", "taobao", 1, "node", listOf("提交订单"))
        assertNull(buffer.take("user-b", "taobao"))

        buffer.onPage("user-a", "taobao", 1, "node", listOf("甲的订单 提交订单"))
        buffer.onPage("user-b", "taobao", 2, "node", listOf("乙的订单"))
        assertEquals(listOf(listOf("乙的订单")), pages(owner = "user-b"))
    }

    @Test
    fun platformsAreKeptApartAndAScrubbedAwayPageLeavesNothing() {
        buffer.onPage("user-a", "taobao", 1, "node", listOf("淘宝 提交订单"))
        buffer.onPage("user-a", "pinduoduo", 1, "node", listOf("拼多多 立即支付"))
        assertEquals(listOf(listOf("拼多多 立即支付")), pages("pinduoduo"))
        assertEquals(listOf(listOf("淘宝 提交订单")), pages("taobao"))

        buffer.onPage("user-a", "taobao", 1, "node", listOf("13800001111"))
        assertNull(buffer.take("user-a", "taobao"))

        buffer.onPage("user-a", "taobao", 1, "node", listOf("提交订单"))
        buffer.clear()
        assertNull(buffer.take("user-a", "taobao"))
    }

    @Test
    fun onlyTheShoppingAppsWithoutGoodsOfTheirOwnAreCollected() {
        assertTrue(OrderContextBuffer.collects("taobao"))
        assertTrue(OrderContextBuffer.collects("pinduoduo"))
        assertFalse(OrderContextBuffer.collects("wechat"))
        assertFalse(OrderContextBuffer.collects("alipay"))
        assertFalse(OrderContextBuffer.collects("jd"))
    }
}
