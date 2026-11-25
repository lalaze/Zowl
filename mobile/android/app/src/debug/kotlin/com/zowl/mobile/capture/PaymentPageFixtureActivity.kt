package com.zowl.mobile.capture

import android.app.Activity
import android.os.Bundle
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView

/** Synthetic payment UI for instrumentation only; not packaged in release builds. */
class PaymentPageFixtureActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        PaymentAccessibilityService.debugFixtureSource = PaymentPageParser.ALIPAY_PACKAGE
        current = this
        show(listOf("首页"))
    }

    fun show(lines: List<String>, unimportantContainer: Boolean = false, depth: Int = 0) {
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            if (unimportantContainer) importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
            setPadding(24, 80, 24, 24)
            var container = this
            repeat(depth) {
                val child = LinearLayout(this@PaymentPageFixtureActivity).apply { orientation = LinearLayout.VERTICAL }
                container.addView(child)
                container = child
            }
            lines.forEach { line -> container.addView(TextView(this@PaymentPageFixtureActivity).apply {
                text = line
                textSize = 24f
            }) }
        })
    }

    override fun onDestroy() {
        if (current === this) {
            current = null
            PaymentAccessibilityService.debugFixtureSource = null
        }
        super.onDestroy()
    }

    companion object { @Volatile var current: PaymentPageFixtureActivity? = null }
}
