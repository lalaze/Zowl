# 支付采集漏记排查规程

当用户反馈某笔付款漏记，或要求定期回顾检查采集日志中的疑似漏记时，按本规程执行。

## 1. 获取手机上的采集日志

采集日志保存在手机的应用外部私有目录：
`/sdcard/Android/data/com.zowl.mobile/files/capture-log/`（旧文件自动压缩为 `.log.gz`，不自动删除）。

### 方式 A：通过 adb 拉取（推荐）

- **USB 连接**：直接接上线并允许 USB 调试。
- **无线调试**：在手机“开发者选项 → 无线调试”中开启。注意手机离开 Wi-Fi 后无线调试会自动关闭；如果手机和 Mac 通过 VPN（例如 Tailscale）互联，无线调试监听的是 `30000–49999` 之间的随机端口，可对手机的 VPN 地址在该端口范围做 TCP connect 探测找到端口后执行 `adb connect <host>:<port>`。

### 方式 B：无法连接 adb 时手动导出

请用户在手机上打开 **我的 → 支付自动采集 → 本地解析诊断 → 导出日志**，把分享出来的 `zowl-capture-log-YYYY-MM-DD.zip` 交给开发者，然后解压到本地镜像目录（默认 `~/.zowl/capture-logs/<机型>` 或 `ZOWL_CAPTURE_LOG_DIR` 指定的目录）。

## 2. 同步与扫描

在仓库根目录执行：

```bash
# 拉取增量日志到本地镜像目录（已压缩的 .log.gz 若大小一致则跳过，已转成 .gz 的旧 .log 会自动清理）
npx tsx scripts/capture-logs.ts pull

# 扫描疑似漏记流程（默认从 <mirror>/last-reviewed 起至最新一天；无该文件时扫描最近 7 天）
npx tsx scripts/capture-logs.ts scan
```

可用参数：

- `pull [--serial <adb serial>] [--out <dir>]`
- `scan [--dir <mirror>] [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--gap-seconds 180] [--json]`

## 3. 阅读疑似流程原始日志

`scan` 会输出每个疑似漏记流程的时间范围、涉及平台、命中的信号、窗口类名序列以及起止 `文件:行号`。按行号查看原始上下文（`.log.gz` 用 `gunzip -c <file> | nl -ba | sed -n 'start,endp'` 或 `zcat`）。

常见日志行含义：

| 日志前缀 / 模式 | 含义与排查要点 |
| --- | --- |
| `process start … version=` | 进程启动、当前版本号、Android API、机型与时区；确认是否已装上最新修复版本。 |
| `previous process … reason=` | 系统 `ApplicationExitInfo` 报告的上次进程退出原因（如 `freezer`、`user_requested`、`low_memory`、`crash`）。 |
| `service connected` / `service unbound` / `service destroyed` | 无障碍服务连接、解绑或销毁；结合时间空档判断服务是否中断。 |
| `<platform> ready` / `source off` / `signed out` | 各平台采集开关与登录就绪状态切换。 |
| `window-state <platform> window=<id> class=<Class>` | 无障碍看到的窗口切换与类名（含 `is a dialog or popup`、`activities unknown` 等补充）。 |
| `look … texts=N partial=` | 读取活动窗口无障碍节点树的结果（文本数、是否触达读取上限）。 |
| `ocr … role=…` | 自动截图并本地 OCR 后的结构摘要（角色、文本行数、金额数等，不含原文）。 |
| `screenshot … failed code=6` / `code=5` | 截图失败：`code=6` 为受保护窗口（`SECURE_WINDOW`，如密码页/付款码页）；`code=5` 为系统截图限频（间隔过短）。 |
| `cashier-text` | 收银台文本结构摘要及识别到的优惠行计数（`offers=`）。 |
| `cashier amount read` | 已成功从收银台读到待确认金额。 |
| `cashier dialog` | 检测到与收银台配对的结果/遮罩弹窗。 |
| `cashier closed with its overlay …: confirmed` | 收银台连同无文本遮罩一同关闭，按先前读到的金额确认付款。 |
| `payment-code shown` / `payment-code left without a capture: reminder` | 微信付款码页出现，以及离开付款码页后未捕到成功页而触发补记提醒（强漏记信号）。 |
| `order-page` | 为识别所购商品而截取的订单页结构摘要（或截图失败/拒绝原因）。 |
| `order-context` | 汇总给本次付款的订单页上下文统计（页数、行数、丢弃数、是否来自结账页）。 |
| `captured <platform> parser=…` | 手机端**已经采集成功**并入队；若用户在账本里没看到，继续查下面的 `upload` 行以及服务端待核对队列。 |
| `rejected <platform> parser=… reason=…` | 解析器拒绝该页面及原因代码（如 `multiple_amounts`、`unsupported_payment_page`、`page_screenshot_protected`）。 |
| `upload events=N http=…` | 上传入队事件时的网络与 HTTP 状态。 |
| `upload results [...]` | 服务端返回每条事件的 `platform/status/reviewStatus/code/resultCode`。 |
| `log paused: low storage` / `log resumed` | 设备可用空间低于 500 MiB 时暂停写日志，恢复后继续记录。 |

## 4. 日志信息不足时补充查 logcat

若某次刚发生的漏记单靠采集日志无法判断窗口焦点或路由变化，可在手机端直接过滤拉取 logcat（**不要在慢速连接上全量拉取 logcat，容易超时**）：

```bash
adb shell "logcat -d -v time -t 'MM-DD HH:MM:SS.000' | grep -E 'ActivityTaskManager.*START|WindowManager.*(Focus not requested|not focusable)|MIUIInput.*publisher action'"
```

logcat 环形缓冲区只保留很短时间，此方法仅适用于刚刚发生的漏记。

## 5. 已知常见漏记原因

核心采集代码位于 `mobile/android/app/src/main/kotlin/com/zowl/mobile/capture/`：

- **遮罩窗口导致活动窗口不可见**：无障碍服务只读取 `rootInActiveWindow`，而被全屏或透明遮罩覆盖的底层窗口往往也同时不在无障碍 `windows` 列表中。
- **淘宝内嵌支付宝收银台与无文本遮罩同时关闭**：付款完成时收银台和无文本遮罩一并消失，靠 `TaobaoCashierDialogs` 结合先前读到的收银台金额推断确认。
- **支付宝收银台中的身份验证插页**：指纹、面容或密码验证窗口穿插在收银台流程中间，不应提前重置收银台会话状态。
- **支付宝收银台成功页被排除或当成重复页**：跨境收银台带外币字样（`excluded_semantics`），或上一笔的会话仍是已消费（`repeated_payment_page`）。自 1.0.28 起，同一收银台窗口先后显示相同的人民币金额和成功页即记账（`cashier-text alipay … paid=true`）。
- **收银台优惠行导致出现两个金额**：页面上同时出现原价/优惠立减和实付金额，需在金额解析前剔除优惠行（offer lines）。
- **微信付款码与小程序结果页**：微信付款码页受系统截图保护（`code=6`），付款结果可能落在小程序窗口（`WxaLiteAppLiteUI`），由 `WechatLiteWindows` 关联；中间出现的非 Activity 弹窗不能提前结束该流程。
- **系统冻结或杀进程**：表现为日志时间空档及下次启动后的 `previous process … reason=`（如 `freezer`、`low_memory`），冻结期间无障碍回调完全不会执行。

## 6. 修复与验证流程

1. **先补 JVM 回归测试**：在 `mobile/android/app/src/test/kotlin/com/zowl/mobile/capture/` 复现该流程的事件序列（可参考 `AlipayCashierReturnTest.kt` 等现有测试），确认修前失败、修后通过。
2. **运行 Android 采集单测**：
   ```bash
   cd mobile/android && ./gradlew -q :app:testDebugUnitTest --tests 'com.zowl.mobile.capture.*'
   ```
   检查 `mobile/build/app/test-results/testDebugUnitTest/` 下 XML 结果的时间戳与通过情况。
3. **更新对应 ADR**：在归属该规则的 ADR 末尾追加带日期的说明（`docs/adr/0010-*` 负责微信/支付宝 OCR，`docs/adr/0012-*` 负责电商应用，`docs/adr/0013-*` 负责采集日志）。
4. **若扫描器漏报或误报**：在 `scripts/capture-logs.ts` 的 `PAYMENT_SIGNALS` 信号表中补充或调整规则，并在 `scripts/capture-logs.test.ts` 中增加对应测试用例。
5. **升级版本并打包安装**：
   - 递增 `mobile/pubspec.yaml` 的 `version: x.y.z+N`；
   - 按 `scripts/build-android-release.ts` 运行 `npm run mobile:release` 构建 release APK；
   - 使用 `adb install -r <apk>` 覆盖安装（保留登录态与本地数据）；
   - 重新打开应用并在采集日志中确认出现新版本的 `process start … version=` 行。

## 7. 隐私与补记原则

- 采集日志不包含金额、商户或页面原文，**漏记交易的金额无法从日志还原**，需由用户在账本中手动补记。
- **严禁**将金额、商户、手机号、IP、机型隐私标识或个人消费时间写入采集日志、仓库代码、文档或排查报告中。

## 8. 标记回顾进度

本次回顾全部处理完毕后，更新水位线，使下次 `scan` 自动从此次日期继续：

```bash
npx tsx scripts/capture-logs.ts mark-reviewed <YYYY-MM-DD>
```
