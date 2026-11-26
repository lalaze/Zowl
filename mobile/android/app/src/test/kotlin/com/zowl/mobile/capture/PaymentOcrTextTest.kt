package com.zowl.mobile.capture

import org.junit.Assert.*
import org.junit.Test

class PaymentOcrTextTest {
    @Test fun parserRequiresExplicitSuccessAndNeverGuessesMissingFacts() {
        val fields = PaymentOcrText.parse("支付成功\n￥12.80\n收款方：山岚咖啡\n完成")
        assertEquals("12.80", fields.amount)
        assertEquals("山岚咖啡", fields.merchant)
        assertNull(fields.warning)
        assertNull(PaymentOcrText.parse("支付成功\n¥12.80\n完成").merchant)
        assertEquals("missing_amount", PaymentOcrText.parse("付款成功\n完成").warning)
        assertEquals("12.80", PaymentOcrText.parse("付款成功\n实付金额\n12.80\n完成").amount)
    }

    @Test fun parserRejectsHistoricalChatRefundForeignAndEmptyText() {
        assertEquals("empty_text", PaymentOcrText.parse(" \n").warning)
        listOf("好友说支付成功\n￥12.80", "支付成功\n退款\n￥12.80", "交易详情\n支付成功\n￥12.80",
            "支付成功\nUSD 12.80", "支付成功\n港币￥12.80", "切换到按住说话\n支付成功\n￥12.80").forEach {
            assertEquals("unsupported_page", PaymentOcrText.parse(it).warning)
            assertNull(PaymentOcrText.parse(it).amount)
        }
        assertEquals("too_much_text", PaymentOcrText.parse("a".repeat(12001)).warning)
    }

    @Test fun ambiguityNeverRanksAmountsOrMerchants() {
        val fields = PaymentOcrText.parse("支付成功\n实付金额12.80\n优惠￥2.00\n收款方：甲\n收款方：乙")
        assertEquals("multiple_amounts", fields.warning)
        assertNull(fields.amount)
        assertNull(fields.merchant)
        assertEquals("12.80", PaymentOcrText.parse("支付成功\n￥12.80\n12.8元").amount)
        listOf("￥0.00", "￥12.345", "￥1,234.56", "1,234.56元", "￥999999999999.99").forEach {
            assertNull(PaymentOcrText.parse("支付成功\n$it").amount)
        }
    }

    @Test fun headingToleratesIconNoiseAndBareAmountLinesButNotSurroundingWords() {
        // The WeChat result page as a screenshot: brand icon beside the heading, payee line, bare amount.
        listOf("支付成功", "O 支付成功", "© 支付成功", "✓支付成功", "支 付 成 功", "支付成功 >").forEach { heading ->
            val fields = PaymentOcrText.parse("$heading\n待某某（昵称）确认收款\n¥1.00")
            assertNull(heading, fields.warning)
            assertEquals(heading, "1.00", fields.amount)
        }
        listOf("1.00", "Y1.00", "¥ 1.00", "￥1.00").forEach {
            assertEquals(it, "1.00", PaymentOcrText.parse("支付成功\n$it").amount)
        }
        listOf("好友说支付成功", "支付成功了吗", "ABC支付成功", "等待支付成功通知").forEach {
            val fields = PaymentOcrText.parse("$it\n¥1.00")
            assertEquals(it, "unsupported_page", fields.warning)
            assertEquals(it, "no_success_marker", fields.detail)
        }
        assertEquals("excluded_content", PaymentOcrText.parse("支付成功\n转账给某某\n¥1.00").detail)
        assertEquals("missing_amount", PaymentOcrText.parse("支付成功\n10:30\n1.5").warning)
        assertEquals("multiple_amounts", PaymentOcrText.parse("支付成功\n1.00\n2.00").warning)
    }

    @Test fun billDetailWithASuccessStatusIsNeverANewPayment() {
        listOf("当前状态\n支付成功\n¥12.80", "支付成功\n¥12.80\n支付时间 2026年11月13日", "支付成功\n¥12.80\n交易单号 4200001",
            "支付成功\n¥12.80\n商户单号 88").forEach {
            val fields = PaymentOcrText.parse(it)
            assertEquals(it, "unsupported_page", fields.warning)
            assertEquals(it, "excluded_content", fields.detail)
        }
    }
}
