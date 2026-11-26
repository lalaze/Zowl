# 快捷磁贴本地 OCR 只辅助手动确认

状态：已移除（2026-11-26，见文末）。日期：2026-11-08。

## 背景与兼容范围

一台 Xiaomi 手机（Android 16 / HyperOS 3 / 微信 8.0.80）的实际支付页面只暴露一个空无障碍节点。空树不能证明屏幕不可截图，继续扩大节点遍历也不能替代 OCR。

本决策扩展 ADR-0008 中“不请求截图能力”的范围：同一个、明确标注非屏幕阅读器的无障碍服务增加**用户主动单次点击**截图入口。原通知/页面模式仍互斥，原页面 parser、checkout session、队列、后台同步和自动入账授权不属于新入口。

安全折中：应用仍支持原 minSdk，但此功能限定 API 34+。API 30 的全屏 `takeScreenshot` 无法把截图对象原子绑定到点击时的支付窗口；本实现只用 API 34 的 `takeScreenshotOfWindow(windowId)`，不回退全屏截图。因此 Android 11–13 不提供该功能。Android 16 在范围内，但不代表已验证 HyperOS 或微信兼容性。

## 单次授权与窗口边界

- 独立设置开关默认关闭，说明本机识别、内存期限、手工确认和来源；用户手动开启无障碍。服务 `isAccessibilityTool=false`，不假冒 TalkBack，不执行手势、不请求 root、不绕过 FLAG_SECURE。
- 用户手动把「Zowl识别记账」加入快捷设置。每次点击即授权当前一次操作；缺少登录、开关或服务时仅打开设置，完成授权后必须重新点击。
- API 34+ 使用不可变 `PendingIntent` 的 `startActivityAndCollapse`，启动私有、透明、no-history Activity 并立即结束。Intent 只有不透明请求 ID，不含金额、商户、图像或文字。
- 点击时只接受默认显示器上唯一的微信/支付宝 application window。只取 root.packageName 和窗口元数据，不要求文本或子节点非空。无法证明窗口归属则失败，不猜测。
- 面板收起后窗口须连续稳定 450ms；最多等 4 秒。锁屏/熄屏、分屏、其他 application window、键盘、无障碍覆盖层、活动/聚焦系统窗口或遮挡内容的窗口均拒绝；仅允许不活动、不聚焦的窄系统边缘状态栏/导航栏。原 windowId 和 package 必须始终匹配。
- 截图回调前后再核验窗口、锁屏、请求、账号与窗口变更序号；识别完成再核验。任何变化丢弃结果。只发一次指定窗口截图请求，没有重试、轮询截图或后台持续截图。
- 重复点击不产生新请求；请求期最长 15 秒（正常超时提示在 12 秒）；存在待确认草稿时不再截图。只在截图/识别期间暂停既有页面回调解析，避免同一操作消费 checkout session；不修改持久化模式或授权，通知模式按原逻辑运行。

## 本地识别与数据契约

使用 `com.google.mlkit:text-recognition-chinese:16.0.1` bundled Chinese 模型；不选择 Play Services 动态下载 variant，不调用模型下载 API、截图上传端点或云端识别。SDK 的传递依赖仍可能包含 Play Services 公共实现组件；交付 APK 已检查包含 Hani 中文模型与 native OCR 库，不能仅凭依赖名判断模型是否 bundled。图像经 HardwareBuffer → Bitmap → InputImage 只在进程内流动，及时关闭 buffer，OCR task 完成即 recycle Bitmap / close recognizer。原始文字仅在成功回调解析，不存盘、不日志、不桥接、不计算上传摘要；失败也只显示固定文案。取消后迟到的回调不能生成草稿。

只接受独立行的支付成功标题和明确人民币金额；历史详情、退款、转账、红包、明显聊天/外币语义拒绝。无字、模型失败、secure window、过长正文或不支持页面直接失败。所有识别出的金额都参与歧义检查，不用“优惠/余额优先级”选一个；多个金额或缺失金额留空并提示人工填写。商户仅取明确标签后唯一、最长 120 字值，其他情况为空。时间**从不识别或默填**，必须用户在表单选日期和时间。模型可能误读，金额商户一律是待人工核对提示。

Native → Flutter `com.zowl.mobile/local_ocr` 的 `takeDraft(owner)` 只返回：

```text
id: opaque UUID
owner: current user ID
platform: wechat | alipay
amount: decimal CNY string | null
merchant: bounded string | null
warning: multiple_amounts | missing_amount | null
remainingMs: 1..300000
```

没有 `transactionTime`、截图、OCR 全文、原始异常、原 checkout session 或原 capture parser 身份。草稿只能读取一次；读取后 native 只保留授权票据和期限。金额/商户随表单留在 Flutter 内存，不进入 route extra、saved instance state、SharedPreferences、数据库或 WorkManager。仅持久化功能开关及下述固定、无内容诊断；owner 绑定也只在内存。

native 以 elapsedRealtime 控制五分钟 TTL；Flutter 定时退出，恢复前台和每次确认时重验 native 票据/owner。退出确认页、关闭功能、注销、会话失效、换账号、服务断开、进程终止均丢弃；注销在网络请求前清除绑定。确认页启用 FLAG_SECURE 防止系统最近任务缩略图保存该表单。没有持久化恢复或离线入账队列。异步识别库无法强制取消正在运行的 Task，逻辑取消立即阻止消费，图像在 Task 完成时释放；不把未完成 Task 的内存当成持久化草稿。

## 来源与入账

复用 `TransactionFormScreen`，显著标明“本地 OCR 辅助手动录入”，可编辑；仅按钮「确认并记账」提交。沿用 `POST /api/transactions` 的现有手工候选协议：canonical facts + `confirmation: {id, version:1}`，遇疑似重复沿用 digest-bound override 对话框。提交绑定当时 token，Dio 发请求前若 token 已改变则拒绝，不可能以新账号凭据发送旧草稿。

不发送 local draft id、owner、OCR 标记作为后端 provenance；后端来源仍为诚实的 **manual**，表示用户审核后手工提交的事实。它不会冒充 `payment_page_capture`、`notification_capture` 或服务端 screenshot task。不创建新 provenance、不要求生产迁移，也不会保存可回溯的 OCR 来源证据；这是兼容现有生产协议的明确取舍。若将来需要独立审计来源，必须另立后端契约与部署计划。

与此前已产生的通知/页面候选不会在设备上自动合并；服务器现有疑似重复检查仍可能提示，但不能承诺拦截所有重复（尤其商户或人工时间被修改时）。设置说明提醒先检查已有候选。

## 验证

JVM 单测覆盖金额歧义/拒绝语义、owner/TTL/单次消费/取消迟到、窗口归属和遮挡策略；Flutter 覆盖通道契约、开关分离、表单不自动提交/必选时间/编辑确认、过期/账号错配、会话 token 替换拒绝及既有手工流程回归。

真机必须验证服务重授权、磁贴收起时序、空节点微信截图、支付宝、飞行模式首次 OCR、FLAG_SECURE、系统覆盖层、锁屏/熄屏、切应用、连点、注销切账号、超时、取消、重复入账确认。合成文本单测和成功 APK 编译不能证明上述系统时序或真实支付兼容性。

API 依据：[指定窗口截图](https://developer.android.com/reference/android/accessibilityservice/AccessibilityService#takeScreenshotOfWindow(int,java.util.concurrent.Executor,android.accessibilityservice.AccessibilityService.TakeScreenshotCallback))、[Quick Settings PendingIntent](https://developer.android.com/reference/android/service/quicksettings/TileService#startActivityAndCollapse(android.app.PendingIntent))、[bundled 中文识别](https://developers.google.com/ml-kit/vision/text-recognition/v2/android)。


## 2026-11-09：系统添加磁贴与无内容诊断

实机反馈已确认用户点击的是屏幕边缘的无障碍小人按钮，控制中心并没有本应用磁贴；微信空节点仍有 `com.tencent.mm` 包名。这不是放宽窗口安全策略的依据，原 `LocalOcrWindowPolicy` 保持原样，不引入 event/package fallback，不读取窗口标题猜测身份。

设置页顶部新增「添加 Zowl识别记账 磁贴」，明确区分控制中心入口与边缘无障碍按钮。仅用户点击按钮时调用 `StatusBarManager.requestAddTileService`，使用本应用 `LocalOcrTileService` ComponentName、既有图标和固定 label，请系统让用户决定。API 自 33 提供，本功能仍限定 34+；不开启无障碍、不自动接受、不通过 adb/secure settings 加磁贴、不触发截图。结果以固定枚举回传 Flutter，处理 added/already_added/not_added/in_progress/unavailable，页面销毁与 Activity 销毁后不重复响应或更新旧 UI。

允许一个独立 SharedPreferences 文件 `local_ocr_diagnostics.xml` 持久化固定 schema 的阶段、原因、饱和计数和布尔/整数元数据，供用户在设备本地设置页或 debug APK 的只读 run-as 命令查看。字符串键和值都受封闭枚举白名单约束；没有任意异常正文、包名字符串、窗口/请求 ID、时间戳、账号 ID/token、文本、金额、商户或图像。最多保存每阶段的最近原因及有限计数，不保存逐次日志。非金融诊断保留到用户清空，不需要草稿加密；它不改变五分钟金融草稿的内存边界。诊断不参与放行决策，无网络上传或应用内分享接口，权限/存储失败不放宽截图边界。

覆盖 tile add/click、eligibility、prepare 窗口数量/包名是否为空、collapse、stable target、screenshot API success/error code、OCR success/固定拒绝原因和 draft ready。为减小开销不对每次无障碍事件或轮询写日志。最新阶段可能来自不同点击；复测应先清空再点一次。保留诊断是用户明确要求的产品内可观察性，不作为临时原文调试日志。

API 依据：[Android 系统添加磁贴确认](https://developer.android.com/reference/android/app/StatusBarManager#requestAddTileService(android.content.ComponentName,java.lang.CharSequence,android.graphics.drawable.Icon,java.util.concurrent.Executor,java.util.function.Consumer))。


## 2026-11-12：窗口改为面板收起后绑定

真机点击真实磁贴后固定提示“仅支持微信/支付宝单窗口支付结果页”。原因是设计缺陷而非用户操作：点击瞬间控制中心全屏且持有焦点，系统的无障碍窗口列表不会包含被完全遮住的应用窗口，所以“点击时只接受唯一的微信/支付宝 application window”在面板展开时不可能成立。

修订上文“单次授权与窗口边界”的两点，其余不变：

- 点击只创建一个未绑定窗口的请求。面板收起后才解析唯一的微信/支付宝 application window，同一 windowId 连续稳定 450ms 后绑定一次（不可改绑），再走原有的截图前后复核。仍限 4 秒；超时按固定原因提示并记入 `stable_target_reason`（`no_app_window / multiple_app_windows / package_empty / package_unsupported / blocked_window / not_focused` 等），`prepare_reason` 不再表示窗口情况。
- `takeScreenshotOfWindow` 只截目标窗口自身的 surface，其他窗口不会进入图像。因此遮挡判断只用于证明面板已收起、用户面对的是支付窗口：活动/聚焦窗口、键盘、覆盖目标四分之一以上的上层窗口仍拒绝；不聚焦的小悬浮窗（如边缘无障碍按钮、横幅通知）不再拒绝。其他应用的 application window（分屏、小窗）仍一律拒绝。

JVM 单测覆盖面板展开时无应用窗口、未绑定请求只绑定一次、小悬浮窗放行与大面积遮挡拒绝。真机截图与 OCR 仍未验证。

同日追加（code 8）：code 7 真机点击磁贴后没有任何反应。请求流程在三处依赖“后台拉起 Activity”（透明收起页、缺少条件时打开设置、识别完成后打开确认页），而部分厂商系统会不报错地拦掉后台拉起，请求随即静默等到过期；具体是哪一处尚未用真机诊断确认。修订：

- 轮询从磁贴点击处直接开始，不再由透明 Activity 触发。面板用无障碍全局动作 `GLOBAL_ACTION_DISMISS_NOTIFICATION_SHADE` 收起（系统级动作，不是在支付应用内执行手势，修订上文“不执行手势”的表述范围）；动作失败或 1.5 秒后面板仍在时，才退回原 `startActivityAndCollapse` 透明页。等待上限由 4 秒改为 6 秒。
- 点击后立即提示“正在识别支付结果页…”；开关未开、服务未连接、未绑定账号分别给出固定提示，不再只依赖打开设置页。
- 识别完成后同时发一条固定文案通知（不含金额、商户或识别文字，5 分钟超时，读取草稿时撤销）并尝试直接打开确认页；直接打开被拦时用户可点通知进入。
- 诊断词表新增 `global_action / global_action_failed / fallback_requested / notified / open_requested / open_error`。

同日追加（code 9）：code 8 真机已走通收起面板、指定窗口截图和本机 OCR，微信结果页（标题旁有品牌图标、下方“待某某确认收款”和单独一行金额）被解析规则判为不支持。未取得 OCR 原文，判断为标题行混入图标噪声导致“独立标题行”精确匹配失败。修订解析规则：标题两侧各容许至多两个非中文字符（图标噪声），紧邻中文仍拒绝；只含两位小数金额的独立行计入金额（容许缺失人民币符号或被读成 Y），多金额仍判歧义。拒绝原因细分为 `no_success_marker / excluded_content`，并记录行数、金额个数两个计数。注意：该页实际是好友转账待收款，页面没有“转账”字样，因此不会被转账排除规则拦下；手动确认路径下由用户判断，自动化前需单独决定是否计为支出。

## 2026-11-26：移除

用户决定移除「Zowl识别记账」磁贴。ADR-0010 起，支付页模式会对读不到文字的支付流程窗口自动截图并在本机识别，这个手动入口原本覆盖的微信、支付宝成功页已经由自动采集接手。剩下的用处很窄：只认微信和支付宝，只在 Android 14+ 可用，必须还停在成功页，结果按手动记账入账，还可能和自动采集对同一笔各记一次。付款码漏记由 ADR-0010 的补记提醒兜底，其他漏记用手动记账。

- 删除磁贴服务、收起面板用的透明 Activity、`com.zowl.mobile/local_ocr` 通道、五分钟草稿与窗口绑定、固定枚举诊断、设置页和确认页，以及记账表单里的草稿分支（必选时间、提交前核验草稿）。只为草稿服务的 `expectedSessionToken`（发请求前 token 变了就拒绝）一并删除。
- 文字解析规则保留，自动采集一直在用：`LocalOcrParser` 改名为 `capture/PaymentOcrText`，行为不变。ML Kit 内置中文模型和无障碍服务的截图能力也保留。
- 应用启动时删除旧版本留下的 `local_ocr`（开关）和 `local_ocr_diagnostics` 两个 SharedPreferences 文件。清单里没有磁贴服务后，系统应会把它从快捷设置里去掉，尚未真机确认。
- 无障碍服务说明删去这项功能。服务端不改：这个入口提交的一直是 `manual` 来源。
