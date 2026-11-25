import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zemoney_mobile/core/l10n.dart';
import 'package:zemoney_mobile/core/native_language.dart';
import 'package:zemoney_mobile/core/providers.dart';
import 'package:zemoney_mobile/main.dart';

import 'support/test_harness.dart';

Widget _app(MobileTestHarness harness) => ProviderScope(
  overrides: harness.overrides,
  retry: (_, _) => null,
  child: const ZeMoneyApp(),
);

void main() {
  tearDown(() => applyLanguage(AppLanguage.en));

  test('system language follows the device and choices override it', () {
    expect(
      resolvesToChinese(AppLanguage.system, const Locale('zh', 'TW')),
      isTrue,
    );
    expect(
      resolvesToChinese(AppLanguage.system, const Locale('en', 'GB')),
      isFalse,
    );
    expect(resolvesToChinese(AppLanguage.zh, const Locale('en', 'US')), isTrue);
    expect(
      resolvesToChinese(AppLanguage.en, const Locale('zh', 'CN')),
      isFalse,
    );
  });

  testWidgets('the sign-in toggle switches the whole app and remembers it', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create(token: null);
    await tester.pumpWidget(_app(harness));
    await tester.pumpAndSettle();
    expect(find.text('Welcome back'), findsOneWidget);

    await tester.ensureVisible(find.text('中文'));
    await tester.tap(find.text('中文'));
    await tester.pumpAndSettle();

    expect(find.text('欢迎回来'), findsOneWidget);
    expect(find.text('进入 Zowl'), findsOneWidget);
    expect(find.text('English'), findsOneWidget);
    expect(harness.preferences.getString(languagePreferenceKey), 'zh');
    final context = tester.element(find.text('欢迎回来'));
    expect(Localizations.localeOf(context), chineseLocale);
    expect(MaterialLocalizations.of(context).okButtonLabel, '确定');

    await tester.ensureVisible(find.text('English'));
    await tester.tap(find.text('English'));
    await tester.pumpAndSettle();
    expect(find.text('Welcome back'), findsOneWidget);
    expect(harness.preferences.getString(languagePreferenceKey), 'en');
  });

  testWidgets('a saved language applies from the first frame', (tester) async {
    final harness = await MobileTestHarness.create(token: null);
    await harness.preferences.setString(languagePreferenceKey, 'zh');
    await tester.pumpWidget(_app(harness));
    await tester.pumpAndSettle();
    expect(find.text('欢迎回来'), findsOneWidget);
  });

  testWidgets('Android gets the language at start and on every change', (
    tester,
  ) async {
    final sent = <Object?>[];
    final messenger = tester.binding.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(NativeLanguageBridge.channel, (
      call,
    ) async {
      if (call.method == 'setLanguage') sent.add(call.arguments);
      return null;
    });
    addTearDown(
      () => messenger.setMockMethodCallHandler(
        NativeLanguageBridge.channel,
        null,
      ),
    );
    final harness = await MobileTestHarness.create(token: null);
    await harness.preferences.setString(languagePreferenceKey, 'zh');
    await tester.pumpWidget(_app(harness));
    await tester.pumpAndSettle();
    expect(sent, [
      {'language': 'zh'},
    ]);

    await tester.ensureVisible(find.text('English'));
    await tester.tap(find.text('English'));
    await tester.pumpAndSettle();
    expect(find.text('Welcome back'), findsOneWidget);
    expect(sent.last, {'language': 'en'});

    final container = ProviderScope.containerOf(
      tester.element(find.byType(ZeMoneyApp)),
    );
    await container
        .read(languageProvider.notifier)
        .setLanguage(AppLanguage.system);
    await tester.pumpAndSettle();
    expect(sent, [
      {'language': 'zh'},
      {'language': 'en'},
      {'language': 'system'},
    ]);
  });

  test('the native language call is harmless off Android or unhandled', () async {
    const bridge = NativeLanguageBridge();
    // Android without a handler (widget tests, older builds) completes quietly.
    await bridge.setLanguage(AppLanguage.zh);

    final sent = <MethodCall>[];
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(NativeLanguageBridge.channel, (
      call,
    ) async {
      sent.add(call);
      return null;
    });
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    addTearDown(() {
      debugDefaultTargetPlatformOverride = null;
      messenger.setMockMethodCallHandler(NativeLanguageBridge.channel, null);
    });
    await bridge.setLanguage(AppLanguage.en);
    expect(sent, isEmpty);
  });

  testWidgets('settings offers system, Chinese and English', (tester) async {
    final harness = await MobileTestHarness.create();
    await tester.pumpWidget(_app(harness));
    await tester.pumpAndSettle();
    final container = ProviderScope.containerOf(
      tester.element(find.byType(ZeMoneyApp)),
    );
    container.read(routerProvider).go('/settings');
    await tester.pumpAndSettle();

    await tester.tap(find.text('Language'));
    await tester.pumpAndSettle();
    // The row subtitle and the selected segment both name the choice.
    expect(find.text('System'), findsNWidgets(2));
    expect(find.text('English'), findsOneWidget);
    await tester.tap(find.text('中文').last);
    await tester.pumpAndSettle();

    expect(find.text('语言'), findsWidgets);
    expect(find.text('跟随系统'), findsOneWidget);
    expect(harness.preferences.getString(languagePreferenceKey), 'zh');
  });
}
