import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/formatters.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../core/payment_capture.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../common/owl_motion.dart';
import '../common/sky.dart';
import '../common/widgets.dart';

class PaymentCaptureSettingsTile extends ConsumerWidget {
  const PaymentCaptureSettingsTile({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => ListTile(
    minTileHeight: 64,
    leading: const ZeIconTile(
      icon: Icons.bolt_rounded,
      color: ZeHues.terracotta,
      size: 40,
    ),
    title: Text(tr('Automatic payment capture', '支付自动采集')),
    subtitle: Text(
      tr(
        'Alipay and WeChat payment pages · Optional auto-post',
        '支付宝与微信支付页 · 可选自动入账',
      ),
    ),
    trailing: const ZeChevron(),
    onTap: () {
      final router = GoRouter.maybeOf(context);
      if (router != null) {
        router.push('/settings/payment-capture');
      } else {
        Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => const PaymentCaptureSettingsScreen(),
          ),
        );
      }
    },
  );
}

class PaymentCaptureSettingsScreen extends ConsumerStatefulWidget {
  const PaymentCaptureSettingsScreen({super.key});

  @override
  ConsumerState<PaymentCaptureSettingsScreen> createState() =>
      _PaymentCaptureSettingsScreenState();
}

class _PaymentCaptureSettingsScreenState
    extends ConsumerState<PaymentCaptureSettingsScreen>
    with WidgetsBindingObserver {
  PaymentCaptureStatus? _status;
  NotificationCaptureSettings? _settings;
  Object? _loadError;
  bool _busy = false;

  PaymentCaptureBridge get _bridge => ref.read(paymentCaptureBridgeProvider);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _load();
  }

  Future<void> _load() async {
    try {
      final status = await _bridge.getStatus();
      if (mounted) {
        setState(() {
          _status = status;
          _loadError = null;
        });
      }
    } catch (error) {
      if (mounted) setState(() => _loadError = error);
    }
    try {
      final settings = await ref
          .read(repositoryProvider)
          .notificationCaptureSettings();
      if (mounted) setState(() => _settings = settings);
    } catch (_) {
      // 自动入账设置加载失败时不阻塞捕获状态展示
    }
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
      await _load();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(tr('Operation failed: $error', '操作失败：$error')),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _setEnabled(bool enabled) async {
    if (!enabled) {
      await _run(() => _bridge.setEnabled(false));
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(tr('Enable automatic payment capture?', '开启支付自动采集？')),
        content: Text(
          tr(
            'Zowl uses Android accessibility access to read enabled payment, checkout, and cashier pages on this device. Screenshots are never stored or uploaded. Page text is not stored or uploaded either unless you separately turn on “Recognise purchased items”, which sends order-page text to your server and the AI provider you configured. Otherwise, only structured transaction fields and an evidence digest are synced.',
            '开启后，Zowl 将通过 Android 无障碍权限在本机读取已开启来源的支付页、结算页与收银台。截图从不保存、从不上传；页面文字也不保存、不上传，除非你另行开启“识别所购商品”（仅发送下单页文字到你的服务器和你配置的 AI 服务商）。除此之外，仅同步结构化交易字段与证据摘要。',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(tr('Cancel', '取消')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(tr('Enable', '确认开启')),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await _run(() async {
      final token = await ref.read(tokenStoreProvider).read();
      final user = ref.read(authControllerProvider).value;
      if (token == null || user == null) {
        throw StateError(tr('Session expired. Sign in again', '登录已失效，请重新登录'));
      }
      await _bridge.configureSession(
        ref.read(apiConfigProvider).baseUrl,
        token,
        user.id,
      );
      final status = await _bridge.setEnabled(true);
      await _bridge.requestNotificationPermission();
      if (!status.accessibilityAccessGranted) {
        await _bridge.openAccessibilitySettings();
      }
    });
  }

  Future<void> _setSource(String platform, bool enabled) => _run(() async {
    await _bridge.setSourceEnabled(platform, enabled);
  });

  Future<void> _setOrderDetails(bool enabled) => _run(() async {
    await _bridge.setOrderDetailsEnabled(enabled);
  });

  Future<void> _saveCaptureSettings(Map<String, dynamic> input) =>
      _run(() async {
        final updated = await ref
            .read(repositoryProvider)
            .updateNotificationCaptureSettings(input);
        if (mounted) setState(() => _settings = updated);
      });

  Future<void> _editCap({
    required String title,
    required int currentMinor,
    required String settingsKey,
  }) async {
    final input = await showDialog<String>(
      context: context,
      builder: (_) => _AutoPostCapDialog(
        title: title,
        initialYuan: (currentMinor / 100).toStringAsFixed(0),
      ),
    );
    if (input == null) return;
    final yuan = double.tryParse(input.trim());
    if (yuan == null || yuan < 0 || yuan > 1000000) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              tr(
                'Enter an amount between 0 and 1000000',
                '请输入 0 到 1000000 之间的金额',
              ),
            ),
          ),
        );
      }
      return;
    }
    await _saveCaptureSettings({settingsKey: (yuan * 100).round()});
  }

  Future<void> _editAutoPostCap() async {
    final current = _settings;
    if (current == null) return;
    await _editCap(
      title: tr('Auto-post amount limit', '自动入账金额上限'),
      currentMinor: current.autoPostMaxAmountMinor,
      settingsKey: 'autoPostMaxAmountMinor',
    );
  }

  Future<void> _editTrustedAutoPostCap() async {
    final current = _settings;
    if (current == null) return;
    await _editCap(
      title: tr('Trusted merchant auto-post limit', '信任商户自动入账上限'),
      currentMinor: current.autoPostTrustedMaxAmountMinor,
      settingsKey: 'autoPostTrustedMaxAmountMinor',
    );
  }

  Future<void> _syncNow() => _run(() async {
    final token = await ref.read(tokenStoreProvider).read();
    final user = ref.read(authControllerProvider).value;
    if (token == null || user == null) {
      throw StateError(tr('Session expired. Sign in again', '登录已失效，请重新登录'));
    }
    await _bridge.configureSession(
      ref.read(apiConfigProvider).baseUrl,
      token,
      user.id,
    );
    await _bridge.flushNow();
  });

  Future<void> _resetDiagnostics() => _run(() async {
    await _bridge.resetDiagnostics();
  });

  Future<void> _exportCaptureLog() => _run(() async {
    final shared = await _bridge.exportCaptureLog();
    if (!shared && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(tr('No capture log yet', '还没有采集日志'))),
      );
    }
  });

  @override
  Widget build(BuildContext context) {
    final status = _status;
    return Scaffold(
      body: SkyScrollScope(
        child: CustomScrollView(
          slivers: [
            ...skyStripSlivers(
              title: tr('Automatic payment capture', '支付自动采集'),
            ),
            SliverPadding(
              padding: EdgeInsets.fromLTRB(
                24,
                8,
                24,
                MediaQuery.paddingOf(context).bottom + 32,
              ),
              sliver: SliverList.list(
                children: [
                  Text(
                    tr(
                      'Android Beta · Reads enabled payment, checkout, and cashier pages; review possible duplicates',
                      'Android 内测 · 读取已开启来源的支付页、结算页与收银台，疑似重复需核对',
                    ),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 14),
                  if (_loadError != null)
                    ErrorView(error: _loadError!, onRetry: _load)
                  else if (status == null)
                    const Padding(
                      padding: EdgeInsets.all(24),
                      child: OwlLoading(size: 72),
                    )
                  else if (!status.supported)
                    EmptyView(
                      message: tr(
                        'This environment does not support Android payment capture',
                        '当前环境不支持 Android 支付采集',
                      ),
                    )
                  else ...[
                    ZeCard(
                      padding: EdgeInsets.zero,
                      child: Column(
                        children: [
                          _StatusRow(
                            label: tr('Accessibility access', '无障碍权限'),
                            value: status.accessibilityAccessGranted
                                ? tr('Granted', '已授权')
                                : tr('Not granted', '未授权'),
                            warning: !status.accessibilityAccessGranted,
                          ),
                          const Divider(height: 1, indent: 16),
                          _StatusRow(
                            label: tr('Service connection', '服务连接'),
                            value: status.accessibilityConnected
                                ? tr('Connected', '已连接')
                                : tr('Disconnected', '未连接'),
                            warning:
                                status.enabled &&
                                status.accessibilityAccessGranted &&
                                !status.accessibilityConnected,
                          ),
                          const Divider(height: 1, indent: 16),
                          _StatusRow(
                            label: tr('Pending local uploads', '本地待上传'),
                            value: tr(
                              '${status.queuedCount} items',
                              '${status.queuedCount} 条',
                            ),
                          ),
                          if (status.lastCaptureAt != null) ...[
                            const Divider(height: 1, indent: 16),
                            _StatusRow(
                              label: tr('Last capture', '最近采集'),
                              value: formatDateTime(
                                DateTime.fromMillisecondsSinceEpoch(
                                  status.lastCaptureAt!,
                                ).toIso8601String(),
                              ),
                            ),
                          ],
                          if (status.authPaused) ...[
                            const Divider(height: 1, indent: 16),
                            _StatusRow(
                              label: tr('Sync status', '同步状态'),
                              value: tr(
                                'Session expired. Sign in again to resume',
                                '登录已过期，重新登录后恢复',
                              ),
                              warning: true,
                            ),
                          ],
                          if (status.syncError != null) ...[
                            const Divider(height: 1, indent: 16),
                            _StatusRow(
                              label: tr('Sync error', '同步错误'),
                              value: status.syncError!,
                              warning: true,
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    ZeCard(
                      tone: ZeTone.info,
                      padding: EdgeInsets.zero,
                      child: ExpansionTile(
                        initiallyExpanded: !status.enabled,
                        shape: const Border(),
                        collapsedShape: const Border(),
                        leading: const Icon(Icons.privacy_tip_outlined),
                        title: Text(
                          tr('How capture works & privacy', '工作原理与隐私说明'),
                        ),
                        subtitle: Text(
                          tr(
                            'Reads enabled payment, checkout, and cashier pages on this device · Screenshots never stored or uploaded',
                            '在本机读取已开启来源的支付页、结算页与收银台 · 截图不保存也不上传',
                          ),
                        ),
                        children: [
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                            child: Text(
                              tr(
                                'Zowl uses Android accessibility access to read enabled Alipay and WeChat success pages on this device. When a payment-flow screen exposes no readable text, Zowl screenshots only that window and recognises it on this device; chats and other non-payment screens are never screenshotted. Screenshots are never stored or uploaded, and neither is page text unless you turn on “Recognise purchased items”, which sends order-page text to your server and the AI provider you configured; apart from that, only amount, optional merchant, capture time and evidence digest are synced. Historical bills and refunds are not supported; a WeChat transfer awaiting receipt is recorded as an expense to the payee. New payments require an observed checkout before another success page. Taobao, Pinduoduo, JD.com and Pupu are experimental sources, off by default, and the shop name is not captured unless “Recognise purchased items” is on (Taobao and Pinduoduo only). For Taobao, Zowl screenshots only the payment cashier and the payment result page and recognises them on this device: the amount comes from the cashier and is recorded once the payment shows as successful. For Pinduoduo the amount comes from the submit button of the order panel and is recorded once the order goes through; a pay-later order is recorded when it is placed, before it is charged. For JD.com only the text of the order payment success page is read. For Pupu the amount comes from beside the pay button of the checkout page and is recorded once the payment-complete page is shown. An order paid through WeChat or Alipay may also be captured there, in which case the second candidate waits for your review as a possible duplicate.',
                                'Zowl 通过 Android 无障碍权限，在本机读取你开启的支付宝和微信支付成功页。付款流程页面没有可读文字时，Zowl 只截取该窗口并在本机识别；聊天等非支付页面不会被截图。截图不保存、不上传；页面文字也不保存、不上传，除非你开启“识别所购商品”，开启后下单页文字会发送到你的服务器和你配置的 AI 服务商。除此之外只同步金额、商户（如有）、采集时间和证据摘要。不支持历史账单和退款；待对方收款的微信转账记为付给收款人的支出。每笔新付款都要先看到付款流程，才会采集下一个成功页。淘宝、拼多多、京东和朴朴是实验性来源，默认关闭，不采集店铺名，除非开启“识别所购商品”（仅淘宝和拼多多）。淘宝只截取付款收银台和支付结果页并在本机识别：金额取自收银台，显示付款成功后才记录。拼多多的金额取自下单面板的付款按钮，下单成功后才记录；先用后付的订单在下单时就记录，实际扣款在确认收货时。京东只读取订单支付成功页上的文字。朴朴的金额取自结算页付款按钮旁，显示支付完成后才记录。如果订单是跳到微信或支付宝付款的，两边可能各采集一次，后一条会作为疑似重复等你核对。',
                              ),
                              style: const TextStyle(
                                fontWeight: FontWeight.w500,
                                height: 1.45,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    ZeCard(
                      padding: EdgeInsets.zero,
                      child: Column(
                        children: [
                          SwitchListTile(
                            secondary: const Icon(Icons.power_settings_new),
                            title: Text(tr('Master switch', '总开关')),
                            subtitle: Text(
                              status.enabled
                                  ? tr('Reading selected sources', '正在读取已选来源')
                                  : tr(
                                      'Turning this off clears the local candidate queue',
                                      '关闭后会清空本地候选队列',
                                    ),
                            ),
                            value: status.enabled,
                            onChanged: _busy ? null : _setEnabled,
                          ),
                          const Divider(height: 1, indent: 56),
                          SwitchListTile(
                            secondary: const Icon(Icons.account_balance_wallet),
                            title: Text(tr('Alipay', '支付宝')),
                            subtitle: Text(tr('Payment success pages', '支付成功页')),
                            value: status.alipayEnabled,
                            onChanged: !_busy && status.enabled
                                ? (value) => _setSource('alipay', value)
                                : null,
                          ),
                          const Divider(height: 1, indent: 56),
                          SwitchListTile(
                            secondary: const Icon(Icons.chat_bubble_outline),
                            title: Text(tr('WeChat Pay', '微信支付')),
                            subtitle: Text(tr('Payment success pages', '支付成功页')),
                            value: status.wechatEnabled,
                            onChanged: !_busy && status.enabled
                                ? (value) => _setSource('wechat', value)
                                : null,
                          ),
                          for (final (platform, label, enabled) in [
                            ('taobao', tr('Taobao', '淘宝'), status.taobaoEnabled),
                            (
                              'pinduoduo',
                              tr('Pinduoduo', '拼多多'),
                              status.pinduoduoEnabled,
                            ),
                            ('jd', tr('JD.com', '京东'), status.jdEnabled),
                            ('pupu', tr('Pupu', '朴朴'), status.pupuEnabled),
                          ]) ...[
                            const Divider(height: 1, indent: 56),
                            SwitchListTile(
                              secondary: const Icon(
                                Icons.shopping_bag_outlined,
                              ),
                              title: Text(label),
                              subtitle: Text(
                                platform == 'taobao'
                                    ? tr(
                                        'Experimental · Cashier and result page',
                                        '实验性 · 收银台与支付结果页',
                                      )
                                    : platform == 'pinduoduo'
                                    ? tr(
                                        'Experimental · Order panel and success notice',
                                        '实验性 · 下单面板与成功提示',
                                      )
                                    : platform == 'pupu'
                                    ? tr(
                                        'Experimental · Checkout and payment-complete page',
                                        '实验性 · 结算页与支付完成页',
                                      )
                                    : tr(
                                        'Experimental · Order payment success page',
                                        '实验性 · 订单支付成功页',
                                      ),
                              ),
                              value: enabled,
                              onChanged: !_busy && status.enabled
                                  ? (value) => _setSource(platform, value)
                                  : null,
                            ),
                          ],
                          const Divider(height: 1, indent: 56),
                          SwitchListTile(
                            secondary: const Icon(Icons.receipt_long_outlined),
                            title: Text(
                              tr('Recognise purchased items', '识别所购商品'),
                            ),
                            subtitle: Text(
                              tr(
                                'Sends text from the order page (goods, shop, prices) to your server and the AI provider you configured, after removing phone numbers and address lines on the device. For Taobao, the order page is screenshotted once as the cashier opens and recognised on this device; the image is never stored or uploaded. Off by default.',
                                '把下单页上的文字（商品、店铺、价格）在手机上去掉手机号和地址行后，发送到你的服务器和你配置的 AI 服务商，用来整理商品清单。淘宝会在收银台打开时对下单页截一次图并在本机识别，图片不保存、不上传。默认关闭。',
                              ),
                            ),
                            value: status.orderDetailsEnabled,
                            // Only Taobao and Pinduoduo have an order page to read.
                            onChanged:
                                !_busy &&
                                    status.enabled &&
                                    (status.taobaoEnabled ||
                                        status.pinduoduoEnabled)
                                ? _setOrderDetails
                                : null,
                          ),
                        ],
                      ),
                    ),
                    if (_settings != null) ...[
                      const SizedBox(height: 14),
                      ZeCard(
                        padding: EdgeInsets.zero,
                        child: Column(
                          children: [
                            SwitchListTile(
                              secondary: const Icon(Icons.bolt_outlined),
                              title: Text(
                                tr('Auto-post payment pages', '支付页自动入账'),
                              ),
                              subtitle: Text(
                                tr(
                                  'Off by default for testing. When enabled, post unique page candidates within your amount limit; possible duplicates still need review.',
                                  '内测期间默认关闭。开启后，金额上限内且不重复的支付页候选会自动入账；疑似重复仍需核对。',
                                ),
                              ),
                              value: _settings!.autoPostPaymentPages,
                              onChanged: _busy
                                  ? null
                                  : (value) => _saveCaptureSettings({
                                      'autoPostPaymentPages': value,
                                    }),
                            ),
                            const Divider(height: 1, indent: 56),
                            ListTile(
                              leading: const Icon(Icons.speed_outlined),
                              title: Text(
                                tr('Auto-post limit per transaction', '单笔自动入账上限'),
                              ),
                              subtitle: Text(
                                formatMoneyWithSymbol(
                                  _settings!.autoPostMaxAmountMinor,
                                ),
                              ),
                              trailing: const ZeChevron(),
                              onTap: _busy ? null : _editAutoPostCap,
                            ),
                            const Divider(height: 1, indent: 56),
                            ListTile(
                              leading: const Icon(Icons.verified_outlined),
                              title: Text(
                                tr(
                                  'Trusted merchant auto-post limit',
                                  '信任商户自动入账上限',
                                ),
                              ),
                              subtitle: Text(
                                formatMoneyWithSymbol(
                                  _settings!.autoPostTrustedMaxAmountMinor,
                                ),
                              ),
                              trailing: const ZeChevron(),
                              onTap: _busy ? null : _editTrustedAutoPostCap,
                            ),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    OutlinedButton.icon(
                      onPressed: _busy ? null : _bridge.openAccessibilitySettings,
                      icon: const Icon(Icons.settings_outlined),
                      label: Text(
                        tr('Open system accessibility settings', '打开系统无障碍设置'),
                      ),
                    ),
                    const SizedBox(height: 10),
                    FilledButton.icon(
                      onPressed: _busy || !status.enabled ? null : _syncNow,
                      icon: _busy
                          ? const SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.sync),
                      label: Text(tr('Sync now', '立即同步')),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      tr(
                        'After using Android Force stop, turn the Zowl accessibility service on again to resume capture.',
                        '在 Android 中「强制停止」Zowl 后，需要重新开启 Zowl 无障碍服务才能恢复采集。',
                      ),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 14),
                    _CaptureDiagnosticsPanel(
                      entries: status.diagnostics,
                      busy: _busy,
                      onReset: _resetDiagnostics,
                      onExportLog: _exportCaptureLog,
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AutoPostCapDialog extends StatefulWidget {
  const _AutoPostCapDialog({required this.title, required this.initialYuan});

  final String title;
  final String initialYuan;

  @override
  State<_AutoPostCapDialog> createState() => _AutoPostCapDialogState();
}

class _AutoPostCapDialogState extends State<_AutoPostCapDialog> {
  late final TextEditingController _controller = TextEditingController(
    text: widget.initialYuan,
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() => Navigator.pop(context, _controller.text);

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(widget.title),
    content: TextField(
      controller: _controller,
      autofocus: true,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      textInputAction: TextInputAction.done,
      decoration: InputDecoration(
        labelText: tr('Per-transaction limit (CNY)', '单笔上限（元）'),
        hintText: tr('For example: 500', '例如：500'),
      ),
      onSubmitted: (_) => _submit(),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: Text(tr('Cancel', '取消')),
      ),
      FilledButton(onPressed: _submit, child: Text(tr('Save', '保存'))),
    ],
  );
}

class _CaptureDiagnosticsPanel extends StatelessWidget {
  const _CaptureDiagnosticsPanel({
    required this.entries,
    required this.busy,
    required this.onReset,
    required this.onExportLog,
  });

  final List<PaymentCaptureDiagnostic> entries;
  final bool busy;
  final VoidCallback onReset;
  final VoidCallback onExportLog;

  @override
  Widget build(BuildContext context) {
    final accepted = entries
        .where((entry) => entry.outcome == 'accepted' && entry.reason == null)
        .fold<int>(0, (sum, entry) => sum + entry.count);
    final rejected = entries
        .where((entry) => entry.outcome == 'rejected')
        .fold<int>(0, (sum, entry) => sum + entry.count);
    final readable = entries
        .where(
          (entry) =>
              entry.outcome == 'observed' &&
              entry.reason == 'page_text_readable',
        )
        .fold<int>(0, (sum, entry) => sum + entry.count);
    return ZeCard(
      padding: EdgeInsets.zero,
      child: ExpansionTile(
        leading: const Icon(Icons.monitor_heart_outlined),
        title: Text(tr('Local parser diagnostics', '本地解析诊断')),
        subtitle: Text(
          entries.isEmpty
              ? tr('No local counts yet', '暂无本地计数')
              : tr(
                  '${readable > 0 ? 'Readable $readable · ' : ''}Accepted $accepted · Rejected $rejected · Stored only on this device',
                  '${readable > 0 ? '可读 $readable · ' : ''}接受 $accepted · 拒绝 $rejected · 仅保存在本机',
                ),
        ),
        children: [
          if (entries.isEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  tr(
                    'When enabled, counts are grouped by source, parser version, and rejection reason.',
                    '开启后会按来源、解析器版本和拒绝原因累计数量。',
                  ),
                ),
              ),
            )
          else
            ...entries.map(
              (entry) => ListTile(
                dense: true,
                title: Text(
                  '${_platformLabel(entry.platform)} · '
                  '${entry.parserId} v${entry.parserVersion}',
                ),
                subtitle: Text(_diagnosticLabel(entry)),
                trailing: Text('${entry.count}'),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
            child: Text(
              tr(
                'No page text, amounts, merchants, summaries, or evidence hashes are included. The on-device capture log also records when each step happened and which window it was in; it is kept on this device indefinitely (older days are compressed) and is removed only when the app is uninstalled or its data is cleared. Nothing is uploaded; “Export log” shares all of it as one zip file.',
                '不含页面原文、金额、商户、摘要或证据哈希。本机的采集日志还会记下每一步的时间和所在窗口，一直保存在本机（旧日志会压缩），卸载应用或清除应用数据时才删除。不会上传；“导出日志”会把全部日志打包成一个 zip 分享。',
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: busy ? null : onExportLog,
                  child: Text(tr('Export log', '导出日志')),
                ),
                TextButton(
                  onPressed: busy || entries.isEmpty ? null : onReset,
                  child: Text(tr('Reset', '重置')),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _platformLabel(String platform) => switch (platform) {
    'alipay' => tr('Alipay', '支付宝'),
    'wechat' => tr('WeChat Pay', '微信支付'),
    'taobao' => tr('Taobao', '淘宝'),
    'pinduoduo' => tr('Pinduoduo', '拼多多'),
    'jd' => tr('JD.com', '京东'),
    'pupu' => tr('Pupu', '朴朴'),
    _ => platform,
  };

  static String _diagnosticLabel(PaymentCaptureDiagnostic entry) {
    if (entry.outcome == 'observed') {
      final reason = entry.reason ?? '';
      // The window label after the prefix is a class-name fragment, not copy.
      if (reason.startsWith('ocr_window_allowed:')) {
        return tr(
          'OCR window · ${reason.substring(19)}',
          '自动识别的窗口 · ${reason.substring(19)}',
        );
      }
      if (reason.startsWith('ocr_window_skipped:')) {
        return tr(
          'Skipped window · ${reason.substring(19)}',
          '非支付窗口，未截图 · ${reason.substring(19)}',
        );
      }
      return switch (entry.reason) {
        'page_text_readable' => tr('Page text readable', '已读取页面文字'),
        'checkout_observed' => tr('Payment flow observed', '已看到付款流程或付款码'),
        'cashier_amount_read' => tr('Cashier amount read', '已读到收银台金额'),
        'payment_code_reminder' => tr(
          'Asked about a payment-code payment',
          '已提醒补记付款码付款',
        ),
        _ => tr('Page observed', '已看到页面'),
      };
    }
    if (entry.outcome == 'accepted') {
      return entry.reason == 'missing_merchant'
          ? tr('Accepted · No merchant', '接受 · 商户为空')
          : tr('Accepted', '接受');
    }
    final reason = switch (entry.reason) {
      'empty_content' => tr('Empty content', '未读取到文字'),
      'excluded_semantics' => tr('Excluded content', '含排除内容'),
      'missing_amount' => tr('Missing amount', '缺少金额'),
      'invalid_amount' => tr('Invalid amount', '金额无效'),
      'multiple_amounts' => tr('Multiple amounts', '多个金额'),
      'unsupported_payment_page' => tr(
        'Not a supported payment success page',
        '不是支持的支付成功页',
      ),
      'repeated_payment_page' => tr(
        'Success page already captured',
        '该成功页已采集过',
      ),
      'page_root_unavailable' => tr('Page unavailable', '系统未提供页面窗口'),
      'page_window_changed' => tr('Page changed', '已离开支付应用'),
      'page_read_limit' => tr('Page read limit', '页面未完整读取'),
      'page_read_error' => tr('Page read failed', '页面读取失败'),
      'page_screenshot_protected' => tr('Protected window', '受保护窗口无法截图'),
      'page_screenshot_failed' => tr('Screenshot failed', '截图失败'),
      _ => entry.reason ?? tr('Unknown reason', '未知原因'),
    };
    return tr('Rejected · $reason', '拒绝 · $reason');
  }
}

class _StatusRow extends StatelessWidget {
  const _StatusRow({
    required this.label,
    required this.value,
    this.warning = false,
  });

  final String label;
  final String value;
  final bool warning;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
    child: Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: TextStyle(
              color: warning
                  ? Theme.of(context).colorScheme.error
                  : Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ),
      ],
    ),
  );
}
