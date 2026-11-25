import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:zemoney_mobile/core/l10n.dart';
import 'package:zemoney_mobile/core/local_ocr.dart';
import 'package:zemoney_mobile/core/providers.dart';
import 'package:zemoney_mobile/features/settings/local_ocr_settings.dart';
import 'package:zemoney_mobile/features/transactions/local_ocr_review_screen.dart';

import 'support/test_harness.dart';

const draft = LocalOcrDraft(
  id: 'request-1',
  owner: 'user-1',
  platform: 'wechat',
  remainingMs: 300000,
  amount: '12.80',
  merchant: '测试商户',
);

class FakeLocalOcr extends LocalOcrBridge {
  LocalOcrDraft? pending = draft;
  bool valid = true;
  bool enabled = false;
  int accessCalls = 0;
  int addTileCalls = 0;
  Future<LocalOcrTileAddResult> Function()? addTileHandler;
  @override
  Future<LocalOcrTileAddResult> requestAddTile() {
    addTileCalls++;
    return addTileHandler?.call() ?? Future.value(LocalOcrTileAddResult.added);
  }

  @override
  Future<Map<dynamic, dynamic>> diagnostics() async => const {};
  @override
  Future<void> resetDiagnostics() async {}
  final discarded = <String>[];
  final owners = <String?>[];
  final protected = <bool>[];
  @override
  Future<Map<dynamic, dynamic>> status() async => {
    'supported': true,
    'enabled': enabled,
    'granted': false,
    'connected': false,
  };
  @override
  Future<void> bindOwner(String? owner) async {
    owners.add(owner);
  }

  @override
  Future<void> setEnabled(bool value) async {
    enabled = value;
  }

  @override
  Future<void> openAccess() async {
    accessCalls++;
  }

  @override
  Future<LocalOcrDraft?> takeDraft(String owner) async {
    final result = pending;
    pending = null;
    return result?.owner == owner ? result : null;
  }

  @override
  Future<bool> validate(LocalOcrDraft draft) async => valid;
  @override
  Future<void> discard(String id) async {
    discarded.add(id);
  }

  @override
  Future<void> protectReview(bool visible) async {
    protected.add(visible);
  }
}

Future<GoRouter> mount(
  WidgetTester tester,
  MobileTestHarness harness,
  FakeLocalOcr bridge, {
  String route = '/review',
}) async {
  final router = GoRouter(
    initialLocation: route,
    routes: [
      GoRoute(path: '/review', builder: (_, _) => const LocalOcrReviewScreen()),
      GoRoute(
        path: '/settings/local-ocr',
        builder: (_, _) => const LocalOcrSettingsScreen(),
      ),
      GoRoute(
        path: '/transactions/:id',
        builder: (_, _) => const Scaffold(body: Text('POSTED')),
      ),
    ],
  );
  final container = ProviderContainer(
    overrides: harness.overridesWithOcr(bridge),
  );
  addTearDown(container.dispose);
  addTearDown(router.dispose);
  await container.read(authControllerProvider.future);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp.router(routerConfig: router),
    ),
  );
  await tester.pumpAndSettle();
  return router;
}

Future<void> pickTime(WidgetTester tester) async {
  // The form list is lazy: scroll until the time row is built, then reveal it.
  await tester.scrollUntilVisible(
    find.widgetWithText(ListTile, 'Transaction time'),
    200,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.pumpAndSettle();
  await tester.tap(find.widgetWithText(ListTile, 'Transaction time'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('OK'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('OK'));
  await tester.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'tile-add bridge maps only fixed native outcomes and handles errors',
    () async {
      final messenger =
          TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
      addTearDown(
        () => messenger.setMockMethodCallHandler(LocalOcrBridge.channel, null),
      );
      for (final entry in <String, LocalOcrTileAddResult>{
        'added': LocalOcrTileAddResult.added,
        'already_added': LocalOcrTileAddResult.alreadyAdded,
        'not_added': LocalOcrTileAddResult.notAdded,
        'in_progress': LocalOcrTileAddResult.inProgress,
        'unknown-native-code': LocalOcrTileAddResult.unavailable,
      }.entries) {
        messenger.setMockMethodCallHandler(LocalOcrBridge.channel, (
          call,
        ) async {
          expect(call.method, 'requestAddTile');
          expect(call.arguments, isNull);
          return entry.key;
        });
        expect(await LocalOcrBridge().requestAddTile(), entry.value);
      }
      messenger.setMockMethodCallHandler(LocalOcrBridge.channel, (_) async {
        throw PlatformException(code: 'DENIED', message: 'not for display');
      });
      expect(
        await LocalOcrBridge().requestAddTile(),
        LocalOcrTileAddResult.unavailable,
      );
      messenger.setMockMethodCallHandler(LocalOcrBridge.channel, null);
      expect(
        await LocalOcrBridge().requestAddTile(),
        LocalOcrTileAddResult.unavailable,
      );
    },
  );

  test(
    'diagnostic bridge only reads or explicitly resets local diagnostics',
    () async {
      final calls = <String>[];
      final messenger =
          TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
      messenger.setMockMethodCallHandler(LocalOcrBridge.channel, (call) async {
        calls.add(call.method);
        expect(call.arguments, isNull);
        return call.method == 'diagnostics'
            ? {
                'last_stage': 'tile_click',
                'last_reason': 'received',
                'count_tile_click_received': 1,
              }
            : null;
      });
      addTearDown(
        () => messenger.setMockMethodCallHandler(LocalOcrBridge.channel, null),
      );
      expect(
        (await LocalOcrBridge().diagnostics())['count_tile_click_received'],
        1,
      );
      await LocalOcrBridge().resetDiagnostics();
      expect(calls, ['diagnostics', 'resetDiagnostics']);
    },
  );

  for (final entry in <LocalOcrTileAddResult, String>{
    LocalOcrTileAddResult.added: 'Tile added.',
    LocalOcrTileAddResult.alreadyAdded: 'The tile is already added.',
    LocalOcrTileAddResult.notAdded: 'The tile wasn’t added',
    LocalOcrTileAddResult.unavailable:
        'The system can’t add the tile right now',
  }.entries) {
    testWidgets('add tile displays ${entry.key.name} without starting capture', (
      tester,
    ) async {
      final harness = await MobileTestHarness.create();
      final bridge = FakeLocalOcr()..addTileHandler = () async => entry.key;
      await mount(tester, harness, bridge, route: '/settings/local-ocr');
      expect(find.text('Add Zowl Scan tile').hitTestable(), findsOneWidget);
      expect(
        find.textContaining(
          'The accessibility button at the edge of the screen does not start a scan',
        ),
        findsOneWidget,
      );
      expect(bridge.addTileCalls, 0);
      await tester.tap(find.text('Add Zowl Scan tile'));
      await tester.pumpAndSettle();
      expect(bridge.addTileCalls, 1);
      expect(find.textContaining(entry.value), findsOneWidget);
      expect(bridge.enabled, isFalse);
      expect(bridge.accessCalls, 0);
      expect(bridge.pending, same(draft));
      expect(harness.repository.createInputs, isEmpty);
      expect(harness.capture.configureCalls, 0);
    });
  }

  testWidgets('tile settings keep the Chinese tile name in Chinese', (
    tester,
  ) async {
    applyLanguage(AppLanguage.zh);
    addTearDown(() => applyLanguage(AppLanguage.en));
    final harness = await MobileTestHarness.create();
    final bridge = FakeLocalOcr();
    await mount(tester, harness, bridge, route: '/settings/local-ocr');

    expect(find.text('Zowl识别记账'), findsOneWidget);
    expect(find.text('入口在下拉控制中心'), findsOneWidget);
    expect(find.text('启用快捷磁贴本地识别'), findsOneWidget);
    expect(find.text('Zowl Scan'), findsNothing);
    await tester.tap(find.text('添加 Zowl识别记账 磁贴'));
    await tester.pumpAndSettle();
    expect(find.textContaining('磁贴已添加。'), findsOneWidget);
    expect(bridge.addTileCalls, 1);
  });

  testWidgets(
    'enable leaves add button visible without automatically requesting it',
    (tester) async {
      final harness = await MobileTestHarness.create();
      final bridge = FakeLocalOcr();
      await mount(tester, harness, bridge, route: '/settings/local-ocr');
      await tester.tap(find.byType(SwitchListTile));
      await tester.pumpAndSettle();
      expect(bridge.enabled, isTrue);
      expect(bridge.addTileCalls, 0);
      expect(find.text('Add Zowl Scan tile').hitTestable(), findsOneWidget);
    },
  );

  testWidgets(
    'tile request deduplicates taps and ignores completion after disposal',
    (tester) async {
      final harness = await MobileTestHarness.create();
      final completion = Completer<LocalOcrTileAddResult>();
      final bridge = FakeLocalOcr()..addTileHandler = () => completion.future;
      final router = await mount(
        tester,
        harness,
        bridge,
        route: '/settings/local-ocr',
      );
      await tester.tap(find.text('Add Zowl Scan tile'));
      await tester.pump();
      await tester.tap(find.text('Add Zowl Scan tile'));
      await tester.pump();
      expect(bridge.addTileCalls, 1);
      router.go('/transactions/placeholder');
      await tester.pumpAndSettle();
      completion.complete(LocalOcrTileAddResult.added);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.textContaining('Tile added.'), findsNothing);
      expect(harness.repository.createInputs, isEmpty);
    },
  );

  test(
    'channel rejects wrong owner, invalid lifetime and unsupported platform',
    () {
      final value = <String, dynamic>{
        'id': 'a',
        'owner': 'user-1',
        'platform': 'wechat',
        'remainingMs': 1000,
      };
      expect(LocalOcrDraft.fromMap(value, 'other'), isNull);
      expect(
        LocalOcrDraft.fromMap({...value, 'remainingMs': 0}, 'user-1'),
        isNull,
      );
      expect(
        LocalOcrDraft.fromMap({...value, 'remainingMs': 300001}, 'user-1'),
        isNull,
      );
      expect(
        LocalOcrDraft.fromMap({...value, 'platform': 'cmb'}, 'user-1'),
        isNull,
      );
      expect(LocalOcrDraft.fromMap(value, 'user-1')?.amount, isNull);
    },
  );

  test(
    'channel transfers only minimal draft fields and validates before use',
    () async {
      final calls = <MethodCall>[];
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(LocalOcrBridge.channel, (call) async {
            calls.add(call);
            return switch (call.method) {
              'takeDraft' => {
                'id': 'a',
                'owner': 'user-1',
                'platform': 'wechat',
                'remainingMs': 1000,
              },
              'validate' => true,
              _ => null,
            };
          });
      addTearDown(
        () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(LocalOcrBridge.channel, null),
      );
      final bridge = LocalOcrBridge();
      await bridge.bindOwner('user-1');
      final value = await bridge.takeDraft('user-1');
      expect(value, isNotNull);
      expect(await bridge.validate(value!), isTrue);
      await bridge.discard(value.id);
      expect(calls.map((call) => call.method), [
        'bindOwner',
        'takeDraft',
        'validate',
        'discard',
      ]);
      expect(calls[2].arguments, {'id': 'a', 'owner': 'user-1'});
    },
  );

  testWidgets(
    'manual OCR form never posts on opening and requires user-selected time',
    (tester) async {
      final harness = await MobileTestHarness.create();
      final bridge = FakeLocalOcr();
      await mount(tester, harness, bridge);
      expect(harness.repository.createInputs, isEmpty);
      expect(find.text('On-device scan · Confirm manually'), findsOneWidget);
      expect(
        tester
            .widget<TextFormField>(find.byType(TextFormField).first)
            .controller!
            .text,
        '12.80',
      );
      await tester.tap(find.text('Confirm and post'));
      await tester.pumpAndSettle();
      expect(harness.repository.createInputs, isEmpty);
      await pickTime(tester);
      await tester.ensureVisible(find.byType(TextFormField).first);
      await tester.enterText(find.byType(TextFormField).first, '18.20');
      await tester.tap(find.text('Confirm and post'));
      await tester.pumpAndSettle();
      final input = harness.repository.createInputs.single;
      expect(input['amount'], '18.20');
      expect(input['merchantName'], '测试商户');
      expect(input['paymentMethod'], 'WeChat Pay');
      expect(
        input['source'],
        isNull,
      ); // Existing manual endpoint owns provenance.
      expect(
        input.keys,
        unorderedEquals([
          'type',
          'amount',
          'currency',
          'merchantName',
          'description',
          'categoryId',
          'transactionTime',
          'paymentMethod',
          'confirmation',
        ]),
      );
      expect(find.text('POSTED'), findsOneWidget);
      expect(bridge.discarded, ['request-1']);
      expect(bridge.protected, [true, false]);
    },
  );

  testWidgets('expired or revoked native draft cannot post', (tester) async {
    final harness = await MobileTestHarness.create();
    final bridge = FakeLocalOcr();
    await mount(tester, harness, bridge);
    await pickTime(tester);
    bridge.valid = false;
    await tester.tap(find.text('Confirm and post'));
    await tester.pumpAndSettle();
    expect(harness.repository.createInputs, isEmpty);
    expect(bridge.discarded, contains('request-1'));
  });

  testWidgets('TTL removes the form and disposes the draft', (tester) async {
    final harness = await MobileTestHarness.create();
    final bridge = FakeLocalOcr()
      ..pending = const LocalOcrDraft(
        id: 'short',
        owner: 'user-1',
        platform: 'wechat',
        remainingMs: 2000,
        amount: '12.80',
      );
    await mount(tester, harness, bridge);
    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();
    expect(find.text('On-device scan · Confirm manually'), findsNothing);
    expect(harness.repository.createInputs, isEmpty);
    expect(bridge.discarded, contains('short'));
  });

  testWidgets('wrong owner and cancelled draft cannot be loaded', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    final bridge = FakeLocalOcr()
      ..pending = const LocalOcrDraft(
        id: 'other',
        owner: 'other-user',
        platform: 'wechat',
        remainingMs: 300000,
        amount: '99.00',
      );
    await mount(tester, harness, bridge);
    expect(find.text('Scan draft unavailable'), findsOneWidget);
    expect(harness.repository.createInputs, isEmpty);
  });

  testWidgets(
    'setting is independent and access is explicitly opened by user',
    (tester) async {
      final harness = await MobileTestHarness.create();
      final bridge = FakeLocalOcr();
      await mount(tester, harness, bridge, route: '/settings/local-ocr');
      await tester.ensureVisible(find.byType(SwitchListTile));
      await tester.tap(find.byType(SwitchListTile));
      await tester.pumpAndSettle();
      expect(bridge.enabled, isTrue);
      expect(bridge.accessCalls, 0);
      expect(harness.capture.configureCalls, 0);
      await tester.ensureVisible(find.text('Accessibility screenshot access'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Accessibility screenshot access'));
      await tester.pumpAndSettle();
      expect(bridge.accessCalls, 1);
    },
  );
}
