import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:zemoney_mobile/core/api.dart';
import 'package:zemoney_mobile/core/l10n.dart';
import 'package:zemoney_mobile/core/models.dart';
import 'package:zemoney_mobile/core/providers.dart';
import 'package:zemoney_mobile/core/theme.dart';
import 'package:zemoney_mobile/features/common/widgets.dart';
import 'package:zemoney_mobile/features/transactions/transaction_detail_screen.dart';

import 'support/fixtures.dart';
import 'support/test_harness.dart';

(Widget, GoRouter) _app(MobileTestHarness harness) {
  final router = GoRouter(
    initialLocation: '/transactions/tx-1',
    routes: [
      GoRoute(
        path: '/transactions',
        builder: (_, _) => const Scaffold(body: Text('LIST')),
      ),
      GoRoute(
        path: '/transactions/:id',
        builder: (_, state) =>
            TransactionDetailScreen(id: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/transactions/:id/edit',
        builder: (_, _) => const Scaffold(body: Text('EDIT')),
      ),
    ],
  );
  return (
    ProviderScope(
      overrides: harness.overrides,
      retry: (_, _) => null,
      child: MaterialApp.router(routerConfig: router),
    ),
    router,
  );
}

TransactionItem _withoutRevision() => TransactionItem(
  id: testTransaction.id,
  type: testTransaction.type,
  amountMinor: testTransaction.amountMinor,
  amount: testTransaction.amount,
  currency: testTransaction.currency,
  merchantName: testTransaction.merchantName,
  description: testTransaction.description,
  categoryId: testTransaction.categoryId,
  categoryName: testTransaction.categoryName,
  transactionTime: testTransaction.transactionTime,
  source: testTransaction.source,
  paymentMethod: testTransaction.paymentMethod,
  currentRevisionId: null,
  revisionNumber: testTransaction.revisionNumber,
);

Future<void> _showActions(WidgetTester tester) async {
  await tester.drag(find.byType(CustomScrollView), const Offset(0, -900));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('fact values all end at the same edge', (tester) async {
    await tester.binding.setSurfaceSize(const Size(360, 400));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      MaterialApp(
        theme: buildTheme(AccentColor.amber, Brightness.dark),
        home: const Scaffold(
          body: ZeGroup(
            children: [
              ZeFactRow(label: 'At', value: 'short'),
              ZeFactRow(label: 'Payment method', value: 'v'),
              ZeFactRow(
                label:
                    'A label far too long to leave the value any room at all',
                value: 'A value that is long enough to need a second line too',
              ),
            ],
          ),
        ),
      ),
    );
    final edge = tester.getTopRight(find.text('short')).dx;
    // On the group's own edge, where the dividers end.
    expect(edge, closeTo(360, .5));
    expect(tester.getTopRight(find.text('v')).dx, closeTo(edge, .5));
    expect(
      tester.getTopRight(find.textContaining('A value')).dx,
      closeTo(edge, .5),
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('detail shows ledger facts and only voids after confirmation', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    final (widget, router) = _app(harness);
    addTearDown(router.dispose);
    await tester.pumpWidget(widget);
    await tester.pumpAndSettle();

    expect(find.text('Mountain Cafe'), findsOneWidget);
    expect(find.text('Food'), findsOneWidget);
    expect(find.text('Alipay'), findsOneWidget);
    expect(find.text('Oat latte'), findsOneWidget);
    await _showActions(tester);

    await tester.tap(find.text('Void'));
    await tester.pumpAndSettle();
    expect(find.text('Void this transaction?'), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(harness.repository.voidCalls, 0);

    await tester.tap(find.text('Void'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Confirm void'));
    await tester.pumpAndSettle();
    expect(harness.repository.voidCalls, 1);
    expect(harness.repository.lastVoidedId, 'tx-1');
    expect(harness.repository.lastExpectedRevisionId, 'revision-1');
    expect(find.text('LIST'), findsOneWidget);
  });

  testWidgets('detail keeps revision conflicts visible and stays on the item', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    harness.repository.voidHandler = (_, _, _) async =>
        throw const ApiException(
          statusCode: 409,
          code: 'REVISION_CONFLICT',
          message: 'Revision conflict',
        );
    final (widget, router) = _app(harness);
    addTearDown(router.dispose);
    await tester.pumpWidget(widget);
    await tester.pumpAndSettle();
    await _showActions(tester);

    await tester.tap(find.text('Void'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Confirm void'));
    await tester.pumpAndSettle();

    expect(
      find.text('Transaction changed. Refresh before voiding'),
      findsOneWidget,
    );
    expect(find.text('Transaction details'), findsOneWidget);
  });

  testWidgets('detail opens the correction route with the current item', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    final (widget, router) = _app(harness);
    addTearDown(router.dispose);
    await tester.pumpWidget(widget);
    await tester.pumpAndSettle();
    await _showActions(tester);

    await tester.tap(find.text('Amend transaction'));
    await tester.pumpAndSettle();

    expect(find.text('EDIT'), findsOneWidget);
  });

  testWidgets('detail surfaces non-conflict void failures without navigating', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    harness.repository.voidHandler = (_, _, _) async =>
        throw const ApiException(
          statusCode: 503,
          code: 'UNAVAILABLE',
          message: 'Voiding temporarily unavailable',
        );
    final (widget, router) = _app(harness);
    addTearDown(router.dispose);
    await tester.pumpWidget(widget);
    await tester.pumpAndSettle();
    await _showActions(tester);

    await tester.tap(find.text('Void'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Confirm void'));
    await tester.pumpAndSettle();

    expect(find.text('Voiding temporarily unavailable'), findsOneWidget);
    expect(find.text('Transaction details'), findsOneWidget);
  });

  testWidgets('detail disables voiding when no safe revision is available', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    harness.repository.transactionValue = _withoutRevision();
    final (widget, router) = _app(harness);
    addTearDown(router.dispose);
    await tester.pumpWidget(widget);
    await tester.pumpAndSettle();
    await _showActions(tester);

    await tester.tap(find.text('Void'), warnIfMissed: false);
    await tester.pump();
    expect(find.text('Void this transaction?'), findsNothing);
    expect(harness.repository.voidCalls, 0);
  });

  testWidgets(
    'detail errors can be retried through the transaction interface',
    (tester) async {
      final harness = await MobileTestHarness.create();
      var calls = 0;
      harness.repository.transactionHandler = (_) async {
        calls++;
        if (calls == 1) {
          throw const ApiException(
            statusCode: 503,
            code: 'UNAVAILABLE',
            message: 'Details temporarily unavailable',
          );
        }
        return testTransaction;
      };
      final (widget, router) = _app(harness);
      addTearDown(router.dispose);
      await tester.pumpWidget(widget);
      await tester.pumpAndSettle();
      expect(find.text('Details temporarily unavailable'), findsOneWidget);

      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.text('Mountain Cafe'), findsOneWidget);
      expect(calls, 2);
    },
  );

  testWidgets('tapped row renders at once while the full record loads', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    final pending = Completer<TransactionItem>();
    harness.repository.transactionHandler = (_) => pending.future;
    await tester.pumpWidget(
      harness.screen(
        TransactionDetailScreen(
          id: testTransaction.id,
          initial: testTransaction,
        ),
      ),
    );
    await tester.pump();

    expect(find.text(testTransaction.merchantName!), findsWidgets);
    expect(find.byType(CircularProgressIndicator), findsNothing);

    pending.complete(_withoutRevision());
    await tester.pumpAndSettle();
    expect(find.text(testTransaction.merchantName!), findsWidgets);
  });

  testWidgets('detail lists the goods bought with their listed prices', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(800, 2000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final harness = await MobileTestHarness.create();
    harness.repository.transactionValue = testOrderTransaction;
    final (widget, router) = _app(harness);
    addTearDown(router.dispose);
    await tester.pumpWidget(widget);
    await tester.pumpAndSettle();

    // The goods summary is the title; the shop moves into the items group.
    expect(find.text('Bin bags and 1 more'), findsNWidgets(2));
    expect(find.text('Items'), findsOneWidget);
    final items = find.ancestor(
      of: find.text('Thick bin bags'),
      matching: find.byType(ZeGroup),
    );
    expect(
      find.descendant(of: items, matching: find.text('Shop')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: items, matching: find.text('Harbor Home Store')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: items, matching: find.text('128 pcs 45x50cm · ×2')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: items, matching: find.text('¥18.80')),
      findsOneWidget,
    );
    // An item with only a name shows neither a detail line nor a price.
    expect(
      find.descendant(of: items, matching: find.text('Dish sponge')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: items, matching: find.textContaining('¥')),
      findsOneWidget,
    );
    expect(
      find.text(
        'Listed prices from the order page; they may not add up to the amount paid.',
      ),
      findsOneWidget,
    );
    // The list is read-only.
    expect(
      find.descendant(of: items, matching: find.byType(InkWell)),
      findsNothing,
    );
    expect(find.text('Amend transaction'), findsOneWidget);
  });

  testWidgets('detail shows quantity alone and omits a missing shop', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    harness.repository.transactionValue = const TransactionItem(
      id: 'tx-1',
      type: 'expense',
      amountMinor: 990,
      currency: 'CNY',
      description: 'Cat food',
      transactionTime: '2026-07-18T04:30:00.000Z',
      source: 'pinduoduo',
      orderDetails: OrderDetails(
        items: [OrderItem(name: 'Cat food 2kg', quantity: 3)],
      ),
    );
    final (widget, router) = _app(harness);
    addTearDown(router.dispose);
    await tester.pumpWidget(widget);
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Cat food 2kg'),
      200,
      scrollable: find.byType(Scrollable).first,
    );

    expect(find.text('×3'), findsOneWidget);
    expect(find.text('Shop'), findsNothing);
  });

  testWidgets('detail without order details shows no items group', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(800, 2000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final harness = await MobileTestHarness.create();
    final (widget, router) = _app(harness);
    addTearDown(router.dispose);
    await tester.pumpWidget(widget);
    await tester.pumpAndSettle();

    expect(find.text('Items'), findsNothing);
    expect(find.text('Shop'), findsNothing);
    expect(find.textContaining('Listed prices'), findsNothing);
  });

  testWidgets('the items group reads in Chinese', (tester) async {
    applyLanguage(AppLanguage.zh);
    addTearDown(() => applyLanguage(AppLanguage.en));
    tester.view.physicalSize = const Size(800, 2000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final harness = await MobileTestHarness.create();
    harness.repository.transactionValue = testOrderTransaction;
    final (widget, router) = _app(harness);
    addTearDown(router.dispose);
    await tester.pumpWidget(widget);
    await tester.pumpAndSettle();

    expect(find.text('商品清单'), findsOneWidget);
    expect(find.text('店铺'), findsOneWidget);
    expect(find.text('标价来自下单页，合计可能与实付金额不同。'), findsOneWidget);
  });

  testWidgets('detail facts and the void flow read in Chinese', (tester) async {
    applyLanguage(AppLanguage.zh);
    addTearDown(() => applyLanguage(AppLanguage.en));
    final harness = await MobileTestHarness.create();
    final (widget, router) = _app(harness);
    addTearDown(router.dispose);
    await tester.pumpWidget(widget);
    await tester.pumpAndSettle();

    expect(find.text('交易详情'), findsOneWidget);
    expect(find.text('支出'), findsOneWidget);
    for (final label in ['时间', '分类', '支付方式', '说明', '来源']) {
      expect(find.text(label), findsOneWidget, reason: label);
    }
    // Unamended revision 1 stays quiet; only amended records show a revision row.
    expect(find.text('版本'), findsNothing);
    // User data stays as entered.
    expect(find.text('Mountain Cafe'), findsOneWidget);
    expect(find.text('Food'), findsOneWidget);
    await _showActions(tester);
    expect(find.text('修改交易'), findsOneWidget);

    await tester.tap(find.text('作废'));
    await tester.pumpAndSettle();
    expect(find.text('作废这笔交易？'), findsOneWidget);
    expect(find.text('这笔交易将移出当前账本和统计，审计版本会保留。'), findsOneWidget);
    await tester.tap(find.text('取消'));
    await tester.pumpAndSettle();
    expect(harness.repository.voidCalls, 0);

    await tester.tap(find.text('作废'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('确认作废'));
    await tester.pumpAndSettle();
    expect(harness.repository.voidCalls, 1);
  });

  testWidgets('detail shows revision number only after an amendment', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    harness.repository.transactionValue = TransactionItem(
      id: testTransaction.id,
      type: testTransaction.type,
      amountMinor: testTransaction.amountMinor,
      amount: testTransaction.amount,
      currency: testTransaction.currency,
      merchantName: testTransaction.merchantName,
      description: testTransaction.description,
      categoryId: testTransaction.categoryId,
      categoryName: testTransaction.categoryName,
      transactionTime: testTransaction.transactionTime,
      source: testTransaction.source,
      paymentMethod: testTransaction.paymentMethod,
      currentRevisionId: 'revision-2',
      revisionNumber: 2,
    );
    final (widget, router) = _app(harness);
    addTearDown(router.dispose);
    await tester.pumpWidget(widget);
    await tester.pumpAndSettle();

    expect(find.text('Revision'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
  });

  testWidgets(
    'reload failure after loading shows error instead of stale revision data',
    (tester) async {
      final harness = await MobileTestHarness.create();
      var calls = 0;
      harness.repository.transactionHandler = (_) async {
        calls++;
        if (calls == 1) return testTransaction;
        throw const ApiException(
          statusCode: 503,
          code: 'UNAVAILABLE',
          message: 'Reload failed',
        );
      };
      final (widget, router) = _app(harness);
      addTearDown(router.dispose);
      await tester.pumpWidget(widget);
      await tester.pumpAndSettle();
      expect(find.text('Mountain Cafe'), findsOneWidget);

      final container = ProviderScope.containerOf(
        tester.element(find.byType(TransactionDetailScreen)),
      );
      container.invalidate(transactionProvider('tx-1'));
      await tester.pumpAndSettle();

      expect(find.text('Reload failed'), findsOneWidget);
      expect(find.text('Void'), findsNothing);
    },
  );

  testWidgets(
    'transient retry keeps the tapped preview visible instead of flashing error',
    (tester) async {
      final harness = await MobileTestHarness.create();
      var calls = 0;
      harness.repository.transactionHandler = (_) async {
        calls++;
        if (calls == 1) {
          throw const ApiException(
            statusCode: 503,
            code: 'UNAVAILABLE',
            message: 'Temporary hiccup',
          );
        }
        return testOrderTransaction;
      };
      await tester.pumpWidget(
        ProviderScope(
          overrides: harness.overrides,
          retry: (count, _) =>
              count == 0 ? const Duration(milliseconds: 50) : null,
          child: const MaterialApp(
            home: TransactionDetailScreen(id: 'tx-1', initial: testTransaction),
          ),
        ),
      );
      await tester.pump();
      await tester.pump();

      // First failure triggers Riverpod retry: preview stays visible (no full ErrorView),
      // while an inline refresh notice appears and mutating actions stay disabled.
      expect(find.text('Mountain Cafe'), findsOneWidget);
      expect(find.byType(ErrorView), findsNothing);
      expect(find.textContaining('Temporary hiccup'), findsOneWidget);
      await tester.drag(find.byType(CustomScrollView), const Offset(0, -900));
      await tester.pump();
      expect(
        tester
            .widget<ButtonStyleButton>(
              find.ancestor(
                of: find.text('Amend transaction'),
                matching: find.bySubtype<ButtonStyleButton>(),
              ),
            )
            .onPressed,
        isNull,
      );
      expect(
        tester
            .widget<ButtonStyleButton>(
              find.ancestor(
                of: find.text('Void'),
                matching: find.bySubtype<ButtonStyleButton>(),
              ),
            )
            .onPressed,
        isNull,
      );

      // Retry fires and loads full record with items.
      await tester.pump(const Duration(milliseconds: 60));
      await tester.pumpAndSettle();
      expect(find.text('Items'), findsOneWidget);
      expect(find.textContaining('Temporary hiccup'), findsNothing);
      expect(calls, 2);
    },
  );

  testWidgets(
    'reload failure during auto-retry keeps loaded value, shows inline retry, and disables amend and void',
    (tester) async {
      final harness = await MobileTestHarness.create();
      final loaded53 = TransactionItem(
        id: testTransaction.id,
        type: testTransaction.type,
        amountMinor: 5300,
        amount: '53.00',
        currency: testTransaction.currency,
        merchantName: testTransaction.merchantName,
        description: 'Updated description',
        categoryId: testTransaction.categoryId,
        categoryName: testTransaction.categoryName,
        transactionTime: testTransaction.transactionTime,
        source: testTransaction.source,
        paymentMethod: testTransaction.paymentMethod,
        currentRevisionId: 'revision-2',
        revisionNumber: 2,
      );
      final loaded60 = TransactionItem(
        id: testTransaction.id,
        type: testTransaction.type,
        amountMinor: 6000,
        amount: '60.00',
        currency: testTransaction.currency,
        merchantName: testTransaction.merchantName,
        description: 'Latest description',
        categoryId: testTransaction.categoryId,
        categoryName: testTransaction.categoryName,
        transactionTime: testTransaction.transactionTime,
        source: testTransaction.source,
        paymentMethod: testTransaction.paymentMethod,
        currentRevisionId: 'revision-3',
        revisionNumber: 3,
      );
      var calls = 0;
      harness.repository.transactionHandler = (_) async {
        calls++;
        if (calls == 1) return loaded53;
        if (calls == 2) {
          throw const ApiException(
            statusCode: 503,
            code: 'UNAVAILABLE',
            message: 'Reload failed',
          );
        }
        return loaded60;
      };
      await tester.pumpWidget(
        ProviderScope(
          overrides: harness.overrides,
          retry: (count, _) =>
              count < 2 ? const Duration(seconds: 10) : null,
          child: const MaterialApp(
            home: TransactionDetailScreen(
              id: 'tx-1',
              initial: testTransaction,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Updated description'), findsOneWidget);

      final container = ProviderScope.containerOf(
        tester.element(find.byType(TransactionDetailScreen)),
      );
      container.invalidate(transactionProvider('tx-1'));
      await tester.pump();
      await tester.pump();

      // Must keep loaded ¥53 record instead of reverting to ¥35 initial preview.
      expect(find.text('Updated description'), findsOneWidget);
      expect(find.text('Oat latte'), findsNothing);
      expect(find.textContaining('Reload failed'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);

      await tester.drag(find.byType(CustomScrollView), const Offset(0, -900));
      await tester.pump();
      expect(
        tester
            .widget<ButtonStyleButton>(
              find.ancestor(
                of: find.text('Amend transaction'),
                matching: find.bySubtype<ButtonStyleButton>(),
              ),
            )
            .onPressed,
        isNull,
      );
      expect(
        tester
            .widget<ButtonStyleButton>(
              find.ancestor(
                of: find.text('Void'),
                matching: find.bySubtype<ButtonStyleButton>(),
              ),
            )
            .onPressed,
        isNull,
      );

      // Tapping inline Retry recovers with latest revision and re-enables actions.
      await tester.drag(find.byType(CustomScrollView), const Offset(0, 900));
      await tester.pump();
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.text('Latest description'), findsOneWidget);
      expect(find.textContaining('Reload failed'), findsNothing);
      await _showActions(tester);
      expect(
        tester
            .widget<ButtonStyleButton>(
              find.ancestor(
                of: find.text('Amend transaction'),
                matching: find.bySubtype<ButtonStyleButton>(),
              ),
            )
            .onPressed,
        isNotNull,
      );
      expect(
        tester
            .widget<ButtonStyleButton>(
              find.ancestor(
                of: find.text('Void'),
                matching: find.bySubtype<ButtonStyleButton>(),
              ),
            )
            .onPressed,
        isNotNull,
      );

      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
    },
  );
}
