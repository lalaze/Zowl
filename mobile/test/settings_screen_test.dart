import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zemoney_mobile/core/api.dart';
import 'package:zemoney_mobile/core/l10n.dart';
import 'package:zemoney_mobile/core/models.dart';
import 'package:zemoney_mobile/core/payment_capture.dart';
import 'package:zemoney_mobile/features/settings/payment_capture_settings.dart';
import 'package:zemoney_mobile/features/settings/settings_screen.dart';

import 'support/fixtures.dart';
import 'support/test_harness.dart';

Future<void> _show(WidgetTester tester, MobileTestHarness harness) async {
  await tester.pumpWidget(harness.screen(const SettingsScreen()));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('profile sheet updates trimmed names and semantic avatars', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    String? savedName;
    String? savedAvatar;
    harness.repository.profileHandler =
        (SessionUser current, String? displayName, String? avatarPreset) async {
          savedName = displayName ?? savedName;
          savedAvatar = avatarPreset ?? savedAvatar;
          return current.copyWith(
            displayName: displayName,
            avatarPreset: avatarPreset,
          );
        };

    final semantics = tester.ensureSemantics();
    await _show(tester, harness);

    expect(find.text(testUser.displayName), findsOneWidget);
    await tester.tap(find.text('Personal details'));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Change avatar: Piggy bank'), findsOneWidget);

    await tester.enterText(
      find.widgetWithText(TextField, 'Nickname'),
      '  New nickname  ',
    );
    await tester.tap(find.text('Save nickname'));
    await tester.pumpAndSettle();
    expect(savedName, 'New nickname');
    expect(find.text('Nickname updated'), findsOneWidget);

    await tester.tap(find.bySemanticsLabel('Change avatar: Cat'));
    await tester.pumpAndSettle();
    expect(savedAvatar, 'cat');
    semantics.dispose();
  });

  testWidgets('profile API errors are surfaced and keep the editor open', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    harness.repository.profileHandler = (_, _, _) async =>
        throw const ApiException(
          statusCode: 422,
          code: 'INVALID_PROFILE',
          message: 'Nickname unavailable',
        );

    await _show(tester, harness);
    await tester.tap(find.text('Personal details'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextField, 'Nickname'),
      'Conflicting nickname',
    );
    await tester.tap(find.text('Save nickname'));
    await tester.pumpAndSettle();

    expect(find.text('Nickname unavailable'), findsOneWidget);
    expect(find.text('Edit profile'), findsOneWidget);
    expect(find.text('Save nickname'), findsOneWidget);
  });

  testWidgets('appearance choices persist mode and accent immediately', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    await _show(tester, harness);

    await tester.tap(find.text('Appearance'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Dark'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Forest'));
    await tester.pumpAndSettle();

    expect(harness.preferences.getString('zemoney-theme'), 'dark');
    expect(harness.preferences.getString('zemoney-accent'), 'forest');
  });

  testWidgets('session sheet exposes the account and logs out', (tester) async {
    final harness = await MobileTestHarness.create();
    await _show(tester, harness);

    await tester.tap(find.text('Account and session'));
    await tester.pumpAndSettle();
    expect(find.text(testUser.email), findsWidgets);
    await tester.tap(find.text('Sign out'));
    await tester.pumpAndSettle();

    expect(harness.repository.logoutCalls, 1);
    expect(harness.tokens.token, isNull);
    expect(harness.capture.clearCalls, 1);
  });

  testWidgets(
    'Android payment capture settings disclose and configure access',
    (tester) async {
      final harness = await MobileTestHarness.create();
      harness.capture.setDiagnosticsForTest(const [
        PaymentCaptureDiagnostic(
          platform: 'wechat',
          parserId: 'wechat_payment_page_v1',
          parserVersion: 1,
          outcome: 'rejected',
          reason: 'multiple_amounts',
          count: 2,
        ),
      ]);
      await _show(tester, harness);

      await tester.tap(find.text('Automatic payment capture'));
      await tester.pumpAndSettle();
      final captureSettingsScroll = find.descendant(
        of: find.byType(PaymentCaptureSettingsScreen),
        matching: find.byType(Scrollable),
      );
      expect(find.text('Accessibility access'), findsOneWidget);
      expect(find.text('Notification access'), findsNothing);
      expect(find.text('China Merchants Bank'), findsNothing);
      // Full privacy disclosure is expanded above the master switch before enabling.
      expect(
        find.textContaining(
          'page text unless you turn on “Recognise purchased items”',
        ),
        findsOneWidget,
      );
      expect(
        find.textContaining(
          'not captured unless “Recognise purchased items” is on',
        ),
        findsOneWidget,
      );

      await tester.scrollUntilVisible(
        find.widgetWithText(SwitchListTile, 'Master switch'),
        160,
        scrollable: captureSettingsScroll,
      );
      await tester.ensureVisible(
        find.widgetWithText(SwitchListTile, 'Master switch'),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(SwitchListTile, 'Master switch'));
      await tester.pumpAndSettle();
      expect(find.text('Enable automatic payment capture?'), findsOneWidget);
      expect(
        find.textContaining('Screenshots are never stored or uploaded.'),
        findsOneWidget,
      );
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(harness.capture.status.enabled, isFalse);

      await tester.tap(find.widgetWithText(SwitchListTile, 'Master switch'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Enable'));
      await tester.pumpAndSettle();

      expect(harness.capture.status.enabled, isTrue);
      expect(harness.capture.configureCalls, 1);
      expect(harness.capture.configuredToken, 'test-token');
      expect(harness.capture.configuredUserId, testUser.id);
      expect(harness.capture.notificationPermissionCalls, 1);
      expect(harness.capture.accessibilitySettingsCalls, 1);

      await tester.ensureVisible(
        find.widgetWithText(SwitchListTile, 'WeChat Pay'),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(SwitchListTile, 'WeChat Pay'));
      await tester.pumpAndSettle();
      expect(harness.capture.status.wechatEnabled, isFalse);

      await tester.scrollUntilVisible(
        find.text('Sync now'),
        160,
        scrollable: captureSettingsScroll,
      );
      await tester.ensureVisible(find.text('Sync now'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Sync now'));
      await tester.pumpAndSettle();
      expect(harness.capture.flushCalls, 1);

      await tester.scrollUntilVisible(
        find.text('Local parser diagnostics'),
        160,
        scrollable: captureSettingsScroll,
      );
      await tester.tap(find.text('Local parser diagnostics'));
      await tester.pumpAndSettle();
      expect(find.text('Rejected · Multiple amounts'), findsOneWidget);
      expect(find.textContaining('Nothing is uploaded'), findsOneWidget);
      await tester.ensureVisible(find.widgetWithText(TextButton, 'Export log'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(TextButton, 'Export log'));
      await tester.pumpAndSettle();
      expect(harness.capture.exportCaptureLogCalls, 1);
      expect(find.text('No capture log yet'), findsNothing);
      harness.capture.captureLogAvailable = false;
      await tester.tap(find.widgetWithText(TextButton, 'Export log'));
      await tester.pump();
      expect(find.text('No capture log yet'), findsOneWidget);
      ScaffoldMessenger.of(
        tester.element(find.text('No capture log yet')),
      ).removeCurrentSnackBar();
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(TextButton, 'Reset'));
      await tester.pumpAndSettle();
      expect(harness.capture.resetDiagnosticsCalls, 1);
    },
  );

  testWidgets(
    'page diagnostics distinguish readable text and payment-code observations from rejection',
    (tester) async {
      final harness = await MobileTestHarness.create();
      harness.capture.setDiagnosticsForTest(const [
        PaymentCaptureDiagnostic(
          platform: 'wechat',
          parserId: 'wechat_payment_page_v1',
          parserVersion: 1,
          outcome: 'observed',
          reason: 'page_text_readable',
          count: 4,
        ),
        PaymentCaptureDiagnostic(
          platform: 'wechat',
          parserId: 'wechat_payment_page_v1',
          parserVersion: 1,
          outcome: 'observed',
          reason: 'checkout_observed',
          count: 2,
        ),
        PaymentCaptureDiagnostic(
          platform: 'wechat',
          parserId: 'wechat_payment_page_v1',
          parserVersion: 1,
          outcome: 'rejected',
          reason: 'page_read_limit',
          count: 1,
        ),
      ]);
      await _show(tester, harness);
      await tester.tap(find.text('Automatic payment capture'));
      await tester.pumpAndSettle();
      final scroll = find.descendant(
        of: find.byType(PaymentCaptureSettingsScreen),
        matching: find.byType(Scrollable),
      );
      await tester.scrollUntilVisible(
        find.text('Local parser diagnostics'),
        200,
        scrollable: scroll,
      );
      await tester.ensureVisible(find.text('Local parser diagnostics'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Local parser diagnostics'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('Readable 4 · Accepted 0 · Rejected 1'),
        findsOneWidget,
      );
      await tester.scrollUntilVisible(
        find.text('Payment flow observed'),
        120,
        scrollable: scroll,
      );
      expect(find.text('Payment flow observed'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('Rejected · Page read limit'),
        120,
        scrollable: scroll,
      );
      expect(find.text('Rejected · Page read limit'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'capture reads payment pages only and page posting has its own authorization',
    (tester) async {
      tester.view.physicalSize = const Size(1080, 3000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final harness = await MobileTestHarness.create();
      harness.capture.enableForTest();
      await _show(tester, harness);
      await tester.tap(find.text('Automatic payment capture'));
      await tester.pumpAndSettle();
      expect(find.text('Use payment pages (Beta)'), findsNothing);
      expect(harness.capture.status.jdEnabled, isFalse);
      await tester.tap(find.widgetWithText(SwitchListTile, 'JD.com'));
      await tester.pumpAndSettle();
      expect(harness.capture.status.jdEnabled, isTrue);
      expect(harness.capture.status.pupuEnabled, isFalse);
      await tester.tap(find.widgetWithText(SwitchListTile, 'Pupu'));
      await tester.pumpAndSettle();
      expect(harness.capture.status.pupuEnabled, isTrue);
      expect(harness.capture.status.xianyuEnabled, isFalse);
      await tester.tap(find.widgetWithText(SwitchListTile, 'Xianyu'));
      await tester.pumpAndSettle();
      expect(harness.capture.status.xianyuEnabled, isTrue);
      expect(harness.capture.status.taobaoEnabled, isFalse);
      expect(find.widgetWithText(SwitchListTile, 'Taobao'), findsOneWidget);
      expect(find.widgetWithText(SwitchListTile, 'Pinduoduo'), findsOneWidget);
      expect(find.text('Accessibility access'), findsOneWidget);
      expect(find.text('Alipay auto-post'), findsNothing);
      expect(find.text('CMB auto-post'), findsNothing);
      expect(
        tester
            .widget<SwitchListTile>(
              find.widgetWithText(SwitchListTile, 'Auto-post payment pages'),
            )
            .value,
        isFalse,
      );
      await tester.tap(
        find.widgetWithText(SwitchListTile, 'Auto-post payment pages'),
      );
      await tester.pumpAndSettle();
      expect(harness.repository.notificationCaptureSettingsInputs.last, {
        'autoPostPaymentPages': true,
      });
    },
  );

  testWidgets(
    'recognising purchased items is opt-in and needs Taobao or Pinduoduo',
    (tester) async {
      tester.view.physicalSize = const Size(1080, 3000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final harness = await MobileTestHarness.create();
      harness.capture.enableForTest();
      await _show(tester, harness);
      await tester.tap(find.text('Automatic payment capture'));
      await tester.pumpAndSettle();

      final goods = find.widgetWithText(
        SwitchListTile,
        'Recognise purchased items',
      );
      SwitchListTile tile() => tester.widget<SwitchListTile>(goods);
      expect(
        find.textContaining(
          'Sends text from the order page (goods, shop, prices)',
        ),
        findsOneWidget,
      );
      // Off by default, and locked while no shopping app with an order page
      // is being read.
      expect(tile().value, isFalse);
      expect(tile().onChanged, isNull);
      await tester.tap(find.widgetWithText(SwitchListTile, 'JD.com'));
      await tester.pumpAndSettle();
      expect(tile().onChanged, isNull);
      await tester.tap(goods, warnIfMissed: false);
      await tester.pumpAndSettle();
      expect(harness.capture.orderDetailsCalls, isEmpty);

      await tester.tap(find.widgetWithText(SwitchListTile, 'Pinduoduo'));
      await tester.pumpAndSettle();
      expect(tile().onChanged, isNotNull);
      await tester.tap(goods);
      await tester.pumpAndSettle();
      expect(harness.capture.orderDetailsCalls, [true]);
      expect(harness.capture.status.orderDetailsEnabled, isTrue);
      expect(tile().value, isTrue);

      await tester.tap(goods);
      await tester.pumpAndSettle();
      expect(harness.capture.orderDetailsCalls, [true, false]);
      expect(tile().value, isFalse);

      // Taobao alone unlocks it as well.
      await tester.tap(find.widgetWithText(SwitchListTile, 'Pinduoduo'));
      await tester.pumpAndSettle();
      expect(tile().onChanged, isNull);
      await tester.tap(find.widgetWithText(SwitchListTile, 'Taobao'));
      await tester.pumpAndSettle();
      expect(tile().onChanged, isNotNull);

      // The master switch locks every source toggle, this one included.
      await tester.tap(find.widgetWithText(SwitchListTile, 'Master switch'));
      await tester.pumpAndSettle();
      expect(harness.capture.status.enabled, isFalse);
      expect(tile().onChanged, isNull);
    },
  );

  testWidgets(
    'auto-post settings toggle and cap persist through the repository',
    (tester) async {
      // 放大测试窗口，让底部弹窗内容无需滚动即可全部命中
      tester.view.physicalSize = const Size(1080, 3000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);

      final harness = await MobileTestHarness.create();
      harness.repository.updateNotificationCaptureSettingsHandler =
          (input) async {
            final current = harness.repository.notificationCaptureSettingsValue;
            final updated = NotificationCaptureSettings(
              autoPostAlipay:
                  input['autoPostAlipay'] as bool? ?? current.autoPostAlipay,
              autoPostWechat:
                  input['autoPostWechat'] as bool? ?? current.autoPostWechat,
              autoPostCmb: input['autoPostCmb'] as bool? ?? current.autoPostCmb,
              autoPostPaymentPages:
                  input['autoPostPaymentPages'] as bool? ??
                  current.autoPostPaymentPages,
              autoPostMaxAmountMinor:
                  input['autoPostMaxAmountMinor'] as int? ??
                  current.autoPostMaxAmountMinor,
              autoPostTrustedMaxAmountMinor:
                  input['autoPostTrustedMaxAmountMinor'] as int? ??
                  current.autoPostTrustedMaxAmountMinor,
            );
            harness.repository.notificationCaptureSettingsValue = updated;
            return updated;
          };
      await _show(tester, harness);

      await tester.tap(find.text('Automatic payment capture'));
      await tester.pumpAndSettle();

      await tester.tap(
        find.widgetWithText(SwitchListTile, 'Auto-post payment pages'),
      );
      await tester.pumpAndSettle();
      expect(harness.repository.notificationCaptureSettingsInputs, [
        {'autoPostPaymentPages': true},
      ]);
      expect(
        harness
            .repository
            .notificationCaptureSettingsValue
            .autoPostPaymentPages,
        isTrue,
      );

      await tester.tap(find.text('Auto-post limit per transaction'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'Per-transaction limit (CNY)'),
        '200',
      );
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(harness.repository.notificationCaptureSettingsInputs.last, {
        'autoPostMaxAmountMinor': 20000,
      });
      expect(find.text('¥200.00'), findsOneWidget);

      await tester.tap(find.text('Trusted merchant auto-post limit'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'Per-transaction limit (CNY)'),
        '5000',
      );
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(harness.repository.notificationCaptureSettingsInputs.last, {
        'autoPostTrustedMaxAmountMinor': 500000,
      });
      expect(find.text('¥5,000.00'), findsOneWidget);
    },
  );

  testWidgets('payment capture status values share one right edge', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    final lastCaptureAt = DateTime(2026, 7, 30, 12, 56);
    harness.capture.status = PaymentCaptureStatus(
      supported: true,
      accessibilityAccessGranted: true,
      accessibilityConnected: true,
      enabled: true,
      alipayEnabled: true,
      wechatEnabled: true,
      queuedCount: 0,
      authPaused: false,
      lastCaptureAt: lastCaptureAt.millisecondsSinceEpoch,
    );
    await _show(tester, harness);

    await tester.tap(find.text('Automatic payment capture'));
    await tester.pumpAndSettle();

    final sheetScroll = find.descendant(
      of: find.byType(PaymentCaptureSettingsScreen),
      matching: find.byType(Scrollable),
    );
    await tester.scrollUntilVisible(
      find.text('Accessibility access'),
      160,
      scrollable: sheetScroll,
    );
    final rightEdges = [
      tester.getTopRight(find.text('Granted')).dx,
      tester.getTopRight(find.text('Connected')).dx,
      tester.getTopRight(find.text('0 items')).dx,
      tester.getTopRight(find.text('2026-07-30 12:56')).dx,
    ];
    for (final edge in rightEdges.skip(1)) {
      expect(edge, closeTo(rightEdges.first, .5));
    }
  });

  testWidgets('settings and payment capture read naturally in Chinese', (
    tester,
  ) async {
    // The screen watches the saved language, so save it as well as applying it.
    applyLanguage(AppLanguage.zh);
    addTearDown(() => applyLanguage(AppLanguage.en));
    final harness = await MobileTestHarness.create();
    await harness.preferences.setString(languagePreferenceKey, 'zh');
    harness.capture.setDiagnosticsForTest(const [
      PaymentCaptureDiagnostic(
        platform: 'wechat',
        parserId: 'wechat_payment_page_v1',
        parserVersion: 1,
        outcome: 'rejected',
        reason: 'page_read_limit',
        count: 1,
      ),
    ]);
    await _show(tester, harness);

    expect(find.text('我的'), findsOneWidget);
    expect(find.text('偏好设置'), findsOneWidget);
    expect(find.text('个人资料'), findsOneWidget);
    expect(find.text('昵称与头像'), findsOneWidget);
    expect(find.text('采集与识别'), findsOneWidget);
    expect(find.text('Personal details'), findsNothing);

    await tester.tap(find.text('支付自动采集'));
    await tester.pumpAndSettle();
    expect(
      find.text('Android 内测 · 读取已开启来源的支付页、结算页与收银台，疑似重复需核对'),
      findsOneWidget,
    );
    expect(find.text('无障碍权限'), findsOneWidget);
    expect(find.text('未授权'), findsOneWidget);
    expect(
      find.text('在本机读取已开启来源的支付页、结算页与收银台 · 截图不保存也不上传'),
      findsOneWidget,
    );
    expect(find.textContaining('除非你开启“识别所购商品”'), findsOneWidget);
    final scroll = find.descendant(
      of: find.byType(PaymentCaptureSettingsScreen),
      matching: find.byType(Scrollable),
    );
    await tester.scrollUntilVisible(
      find.widgetWithText(SwitchListTile, '总开关'),
      160,
      scrollable: scroll,
    );
    expect(find.widgetWithText(SwitchListTile, '总开关'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.widgetWithText(SwitchListTile, '微信支付'),
      160,
      scrollable: scroll,
    );
    expect(find.widgetWithText(SwitchListTile, '微信支付'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.widgetWithText(SwitchListTile, '识别所购商品'),
      160,
      scrollable: scroll,
    );
    expect(find.textContaining('默认关闭。'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('本地解析诊断'),
      160,
      scrollable: scroll,
    );
    await tester.ensureVisible(find.text('本地解析诊断'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('本地解析诊断'));
    await tester.pumpAndSettle();
    expect(find.text('接受 0 · 拒绝 1 · 仅保存在本机'), findsOneWidget);
    expect(find.text('微信支付 · wechat_payment_page_v1 v1'), findsOneWidget);
    expect(find.text('拒绝 · 页面未完整读取'), findsOneWidget);
  });

  testWidgets('payment capture settings stay hidden on iOS', (tester) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    try {
      final harness = await MobileTestHarness.create();
      await _show(tester, harness);
      expect(find.text('Automatic payment capture'), findsNothing);
    } finally {
      debugDefaultTargetPlatformOverride = null;
    }
  });

  testWidgets('account management entry is visible only to administrators', (
    tester,
  ) async {
    final memberHarness = await MobileTestHarness.create();
    await _show(tester, memberHarness);
    expect(find.text('Account management'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();

    final adminHarness = await MobileTestHarness.create();
    adminHarness.repository.user = const SessionUser(
      id: 'admin-user',
      email: 'admin@zemoney.local',
      displayName: 'Administrator',
      avatarPreset: 'piggy',
      timezone: 'Asia/Shanghai',
      role: 'admin',
    );
    await _show(tester, adminHarness);
    await tester.scrollUntilVisible(
      find.text('Account management'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Account management'), findsOneWidget);
    expect(
      find.text('Add accounts, reset passwords, and disable accounts'),
      findsOneWidget,
    );
  });
}
