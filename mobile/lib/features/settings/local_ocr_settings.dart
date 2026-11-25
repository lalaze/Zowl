import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/l10n.dart';
import '../../core/local_ocr.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../common/sky.dart';
import '../common/widgets.dart';

/// The Quick Settings tile's name; Android shows the same name natively.
String get _tileName => tr('Zowl Scan', 'Zowl识别记账');

String get _manualTileHint => tr(
  'The system can’t add the tile right now. Edit Quick Settings and add “Zowl Scan” yourself.',
  '系统添加暂不可用，请手动编辑下拉控制中心，添加「Zowl识别记账」。',
);

class LocalOcrSettingsTile extends ConsumerWidget {
  const LocalOcrSettingsTile({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => FutureBuilder(
    future: ref.read(localOcrBridgeProvider).status(),
    builder: (context, snapshot) => snapshot.data?['supported'] != true
        ? const SizedBox.shrink()
        : ListTile(
            minTileHeight: 64,
            leading: const ZeIconTile(
              icon: Icons.document_scanner_rounded,
              color: ZeHues.moss,
              size: 40,
            ),
            title: Text(_tileName),
            subtitle: Text(
              tr(
                'Quick Settings tile · On-device Chinese OCR · Confirm each entry',
                '快捷磁贴 · 本地中文 OCR · 逐笔确认',
              ),
            ),
            trailing: const ZeChevron(),
            onTap: () => context.push('/settings/local-ocr'),
          ),
  );
}

class LocalOcrSettingsScreen extends ConsumerStatefulWidget {
  const LocalOcrSettingsScreen({super.key});
  @override
  ConsumerState<LocalOcrSettingsScreen> createState() =>
      _LocalOcrSettingsState();
}

class _LocalOcrSettingsState extends ConsumerState<LocalOcrSettingsScreen>
    with WidgetsBindingObserver {
  Map<dynamic, dynamic> _status = const {};
  bool _busy = false;
  bool _addingTile = false;
  String? _tileMessage;
  Map<dynamic, dynamic> _diagnostics = const {};
  String? _error;
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
      final bridge = ref.read(localOcrBridgeProvider);
      final status = await bridge.status();
      final diagnostics = await bridge.diagnostics();
      if (mounted) {
        setState(() {
          _status = status;
          _diagnostics = diagnostics;
          _error = null;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(
          () =>
              _error = tr('Couldn’t read the status. Try again', '无法读取状态，请重试'),
        );
      }
    }
  }

  Future<void> _enable(bool enabled) async {
    setState(() => _busy = true);
    try {
      final bridge = ref.read(localOcrBridgeProvider);
      await bridge.bindOwner(ref.read(authControllerProvider).value?.id);
      await bridge.setEnabled(enabled);
      await _load();
    } catch (_) {
      if (mounted) {
        setState(
          () =>
              _error = tr('Couldn’t change the setting. Try again', '设置失败，请重试'),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _addTile() async {
    if (_addingTile) return;
    setState(() {
      _addingTile = true;
      _tileMessage = null;
    });
    try {
      final result = await ref.read(localOcrBridgeProvider).requestAddTile();
      if (!mounted) return;
      setState(
        () => _tileMessage = switch (result) {
          LocalOcrTileAddResult.added => tr(
            'Tile added. Go back to the WeChat or Alipay payment success page, pull down Quick Settings, and tap “Zowl Scan”.',
            '磁贴已添加。返回微信或支付宝支付成功页，下拉控制中心点击「Zowl识别记账」。',
          ),
          LocalOcrTileAddResult.alreadyAdded => tr(
            'The tile is already added. Look for “Zowl Scan” in Quick Settings.',
            '磁贴已经添加。请在下拉控制中心查找「Zowl识别记账」。',
          ),
          LocalOcrTileAddResult.notAdded => tr(
            'The tile wasn’t added (cancelled, declined, or not approved by the system). Tap the button again, or edit Quick Settings to add it yourself.',
            '本次未添加磁贴（取消、拒绝或系统未批准）。可再次点击按钮，或手动编辑控制中心添加。',
          ),
          LocalOcrTileAddResult.inProgress => tr(
            'The system is still handling the add request. Finish the system prompt first.',
            '系统添加请求仍在等待处理，请先完成系统确认。',
          ),
          LocalOcrTileAddResult.unavailable => _manualTileHint,
        },
      );
      await _load();
    } catch (_) {
      if (mounted) setState(() => _tileMessage = _manualTileHint);
    } finally {
      if (mounted) setState(() => _addingTile = false);
    }
  }

  Future<void> _resetDiagnostics() async {
    try {
      await ref.read(localOcrBridgeProvider).resetDiagnostics();
      if (mounted) await _load();
    } catch (_) {
      if (mounted) {
        setState(
          () => _error = tr(
            'Couldn’t clear diagnostics. Try again',
            '无法清空诊断，请重试',
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Scaffold(
      body: SkyScrollScope(
        child: CustomScrollView(
          slivers: [
            ...skyStripSlivers(title: _tileName),
            SliverPadding(
              padding: EdgeInsets.fromLTRB(
                24,
                8,
                24,
                MediaQuery.paddingOf(context).bottom + 32,
              ),
              sliver: SliverList.list(
                children: [
                  ZeCard(
                    padding: const EdgeInsets.all(18),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          tr('Start it from Quick Settings', '入口在下拉控制中心'),
                          style: textTheme.titleLarge,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          tr(
                            'The accessibility button at the edge of the screen does not start a scan. Add the “Zowl Scan” tile to Quick Settings and tap it there.',
                            '屏幕边缘的无障碍小人按钮不是 OCR 入口。请添加并点击快捷设置中的「Zowl识别记账」磁贴。',
                          ),
                          style: textTheme.bodyMedium,
                        ),
                        const SizedBox(height: 14),
                        FilledButton.icon(
                          onPressed:
                              _status['supported'] == true && !_addingTile
                              ? _addTile
                              : null,
                          icon: const Icon(Icons.add_box_outlined),
                          label: Text(
                            tr('Add Zowl Scan tile', '添加 Zowl识别记账 磁贴'),
                          ),
                        ),
                        const SizedBox(height: 10),
                        Text(
                          tr(
                            'This only asks the system to show an add prompt. You decide whether to add it; nothing is captured or posted.',
                            '此按钮仅请求系统显示添加确认；由你决定是否添加，不会开始截图或入账。',
                          ),
                          style: textTheme.bodySmall,
                        ),
                        if (_addingTile)
                          Padding(
                            padding: const EdgeInsets.only(top: 10),
                            child: Text(
                              tr('Waiting for the system…', '等待系统添加结果…'),
                              style: textTheme.bodySmall,
                            ),
                          ),
                        if (_tileMessage != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 10),
                            child: Text(
                              _tileMessage!,
                              style: textTheme.bodyMedium?.copyWith(
                                fontWeight: FontWeight.w600,
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
                          secondary: const Icon(Icons.document_scanner_rounded),
                          title: Text(
                            tr('Enable on-device scan from the tile', '启用快捷磁贴本地识别'),
                          ),
                          subtitle: Text(
                            _status['supported'] == true
                                ? tr(
                                    'Separate from automatic page capture and notification mode',
                                    '独立于自动页面采集和通知模式',
                                  )
                                : tr(
                                    'Requires Android 14 or later',
                                    '需要 Android 14 或以上',
                                  ),
                          ),
                          value: _status['enabled'] == true,
                          onChanged: _busy || _status['supported'] != true
                              ? null
                              : _enable,
                        ),
                        const Divider(height: 1, indent: 56),
                        ListTile(
                          leading: const Icon(Icons.accessibility_new_rounded),
                          title: Text(
                            tr('Accessibility screenshot access', '无障碍截图授权'),
                          ),
                          subtitle: Text(
                            _status['connected'] == true
                                ? tr('Connected', '已连接')
                                : _status['granted'] == true
                                ? tr(
                                    'Granted, but the service isn’t connected. Turn it off and on again',
                                    '已授权，服务未连接；请关闭后重新开启',
                                  )
                                : tr(
                                    'Turn on “Zowl payment pages (Beta)” in system settings',
                                    '需你在系统设置手动启用「Zowl 支付页采集（内测）」',
                                  ),
                          ),
                          trailing: const Icon(Icons.open_in_new_rounded, size: 18),
                          onTap: _status['supported'] != true
                              ? null
                              : () async {
                                  try {
                                    await ref
                                        .read(localOcrBridgeProvider)
                                        .openAccess();
                                  } catch (_) {
                                    if (mounted) {
                                      setState(
                                        () => _error = tr(
                                          'Couldn’t open system settings',
                                          '无法打开系统设置',
                                        ),
                                      );
                                    }
                                  }
                                },
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  ZeCard(
                    tone: ZeTone.info,
                    padding: EdgeInsets.zero,
                    child: ExpansionTile(
                      shape: const Border(),
                      collapsedShape: const Border(),
                      leading: const Icon(Icons.privacy_tip_outlined),
                      title: Text(tr('How it works & privacy', '工作原理与隐私说明')),
                      subtitle: Text(
                        tr(
                          'On-device OCR only · Screenshots stay in memory and are never uploaded',
                          '仅本机识别 · 截图仅留内存不上传，须手动确认入账',
                        ),
                      ),
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Text(
                                tr(
                                  'On a WeChat or Alipay payment success page, pull down Quick Settings and tap “Zowl Scan”. Once the panel closes, Zowl takes one screenshot of the payment window and reads its Chinese text on your phone.',
                                  '在微信或支付宝支付成功页，下拉快捷设置并主动点击「Zowl识别记账」。面板收起后，仅截取一次原支付窗口，在手机上识别中文。',
                                ),
                              ),
                              const SizedBox(height: 12),
                              Text(
                                tr(
                                  'The screenshot and recognized text stay in memory only and are never saved or uploaded. The Chinese text model ships inside the app, so nothing is downloaded and no cloud recognition is used. A draft lasts up to 5 minutes and is discarded when you sign out, switch accounts, turn this off, or leave the review page.',
                                  '截图和 OCR 全文仅在内存中处理，不保存、不上传。中文模型随 APK 内置，无需下载模型或使用云端识别。草稿最多保留 5 分钟，退出登录、换账号、关闭功能或离开确认页即丢弃。',
                                ),
                              ),
                              const SizedBox(height: 12),
                              Text(
                                tr(
                                  'Scanning only helps you fill in a manual entry: you can edit the amount and merchant, and you choose the time. Fields are submitted only when you tap “Confirm and post”, and the ledger records a manual entry. It never pays or posts on its own and does not inherit the auto-post permission of notification or page capture.',
                                  '识别只是手动录入辅助：金额和商户可以修改，时间必须由你选择；仅点击「确认并记账」后提交字段，账本来源为手动录入。不会自动付款或入账，不继承通知/页面自动入账授权。',
                                ),
                              ),
                              const SizedBox(height: 12),
                              Text(
                                tr(
                                  'After installing or updating, turn the service off and on again in system accessibility settings so it can take screenshots; this is not TalkBack. Then edit the Quick Settings panel and drag “Zowl Scan” into your tiles. After granting access or signing in, go back to the payment page and tap again; nothing is captured retroactively.',
                                  '首次安装或更新后，请在系统无障碍设置关闭再开启该服务以加载截图能力；这不是 TalkBack。然后编辑系统快捷设置面板，将「Zowl识别记账」拖入磁贴。授权或登录完成后须返回支付页重新点击，不会补拍。',
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  ZeCard(
                    padding: EdgeInsets.zero,
                    child: ExpansionTile(
                      shape: const Border(),
                      collapsedShape: const Border(),
                      leading: const Icon(Icons.info_outline_rounded),
                      title: Text(tr('When a scan is skipped', '何时不生成草稿')),
                      subtitle: Text(
                        tr(
                          'Lock screen, overlays, split screen, or multiple amounts',
                          '锁屏、遮挡、分屏、受保护窗口或识别到多个金额',
                        ),
                      ),
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                          child: Text(
                            tr(
                              'No draft is created if the screen is locked, a system panel, keyboard or floating window covers the page, in split screen, after switching apps, on a protected window, or when recognition fails or finds no text. If several amounts are found, the amount is left blank for you to fill in. If a notification or page candidate already exists, avoid posting it twice and check the duplicate warning.',
                              '锁屏、系统面板/键盘/悬浮窗遮挡、分屏、换应用、隐私保护窗口、模型失败或空文字均不生成草稿。识别出多个金额会留空，须人工填写。若已有通知或页面候选，请避免重复记账并核对重复提示。',
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  ZeCard(
                    padding: EdgeInsets.zero,
                    child: ExpansionTile(
                      shape: const Border(),
                      collapsedShape: const Border(),
                      leading: const Icon(Icons.monitor_heart_outlined),
                      title: Text(tr('Diagnostics for empty scans', '本机无内容诊断')),
                      subtitle: Text(
                        _diagnostics.isEmpty
                            ? tr(
                                'Nothing recorded yet. Clear, tap the Quick Settings tile once, then refresh',
                                '暂无记录；清空后点击一次控制中心磁贴再刷新',
                              )
                            : tr(
                                'Last stage: ${_diagnostics['last_stage'] ?? 'none'} / ${_diagnostics['last_reason'] ?? 'none'}',
                                '最近阶段：${_diagnostics['last_stage'] ?? 'none'} / ${_diagnostics['last_reason'] ?? 'none'}',
                              ),
                      ),
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                          child: Text(
                            tr(
                              'Only fixed stages, reasons, counts, and on/off values: no page content, account identifiers, or images. Nothing is uploaded automatically.',
                              '只含固定阶段、原因、计数与布尔值；无页面内容、账号标识或图片，不自动上传。',
                            ),
                            style: textTheme.bodySmall,
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 8),
                          child: Row(
                            children: [
                              TextButton(
                                onPressed: _load,
                                child: Text(tr('Refresh diagnostics', '刷新诊断')),
                              ),
                              TextButton(
                                onPressed: _resetDiagnostics,
                                child: Text(tr('Clear diagnostics', '清空诊断')),
                              ),
                            ],
                          ),
                        ),
                        for (final key
                            in _diagnostics.keys
                                .map((key) => key.toString())
                                .toList()
                              ..sort())
                          ListTile(
                            dense: true,
                            title: Text(key),
                            subtitle: Text('${_diagnostics[key]}'),
                          ),
                      ],
                    ),
                  ),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(
                        _error!,
                        style: TextStyle(color: context.ze.danger),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
