import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:zowl_mobile/core/api.dart';
import 'package:zowl_mobile/core/l10n.dart';
import 'package:zowl_mobile/core/models.dart';
import 'package:zowl_mobile/features/shell/app_shell.dart';
import 'package:zowl_mobile/features/transactions/transaction_list_screen.dart';

import 'support/fixtures.dart';
import 'support/test_harness.dart';

TransactionItem _transaction(int index, {String? merchant}) => TransactionItem(
  id: 'tx-$index',
  type: 'expense',
  amountMinor: 1000 + index,
  amount: '${10 + index ~/ 100}.${(index % 100).toString().padLeft(2, '0')}',
  currency: 'CNY',
  merchantName: merchant ?? 'Paged merchant $index',
  transactionTime:
      '2026-07-18T04:${(index % 60).toString().padLeft(2, '0')}:00.000Z',
  source: 'manual',
  currentRevisionId: 'revision-$index',
  revisionNumber: 1,
);

void main() {
  testWidgets(
    'transaction list renders ledger facts grouped by transaction day',
    (tester) async {
      final harness = await MobileTestHarness.create();
      final yesterday = DateTime.now().subtract(const Duration(days: 1));
      harness.repository.transactionPage = TransactionPage(
        items: [
          TransactionItem(
            id: testTransaction.id,
            type: testTransaction.type,
            amountMinor: testTransaction.amountMinor,
            amount: testTransaction.amount,
            currency: testTransaction.currency,
            merchantName: testTransaction.merchantName,
            description: testTransaction.description,
            categoryId: testTransaction.categoryId,
            categoryName: testTransaction.categoryName,
            transactionTime: yesterday.toUtc().toIso8601String(),
            source: testTransaction.source,
            paymentMethod: testTransaction.paymentMethod,
            currentRevisionId: testTransaction.currentRevisionId,
            revisionNumber: testTransaction.revisionNumber,
          ),
        ],
        pagination: const Pagination(
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        ),
      );

      await tester.pumpWidget(harness.screen(const TransactionListScreen()));
      await tester.pumpAndSettle();

      expect(find.text('Mountain Cafe'), findsOneWidget);
      expect(find.textContaining('Yesterday · '), findsOneWidget);
      // The day header carries the day's net, the row carries the amount.
      expect(find.text('-¥35.80'), findsNWidgets(2));
      expect(harness.repository.transactionRequests.single.page, 1);
    },
  );

  testWidgets('search and quick type filters reload through the public query', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    await tester.pumpWidget(harness.screen(const TransactionListScreen()));
    await tester.pumpAndSettle();

    expect(find.byType(SearchBar), findsNothing);
    await tester.tap(find.byTooltip('Search'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(SearchBar), 'Coffee');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();
    expect(harness.repository.transactionRequests.last.keyword, 'Coffee');

    await tester.tap(find.text('Expense'));
    await tester.pumpAndSettle();
    expect(harness.repository.transactionRequests.last.type, 'expense');

    await tester.tap(find.byTooltip('Clear search'));
    await tester.pumpAndSettle();
    expect(harness.repository.transactionRequests.last.keyword, '');
  });

  testWidgets(
    'advanced filters forward type, source, category, and inclusive dates',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final harness = await MobileTestHarness.create();
      await tester.pumpWidget(harness.screen(const TransactionListScreen()));
      await tester.pumpAndSettle();

      await tester.tap(find.byTooltip('More filters'));
      await tester.pumpAndSettle();
      expect(find.text('Filter transactions'), findsOneWidget);

      await tester.tap(find.widgetWithText(ChoiceChip, 'Refund'));
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.widgetWithText(ChoiceChip, 'Food'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(ChoiceChip, 'Food'));
      await tester.pumpAndSettle();

      await tester.ensureVisible(
        find.widgetWithText(ChoiceChip, 'Screenshots'),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(ChoiceChip, 'Screenshots'));
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.text('Choose date range'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Choose date range'));
      await tester.pumpAndSettle();
      final now = DateTime.now();
      await tester.tap(find.byTooltip('Switch to input'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'Start Date'),
        '${now.month}/10/${now.year}',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'End Date'),
        '${now.month}/12/${now.year}',
      );
      tester.testTextInput.hide();
      await tester.pump();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Apply'));
      await tester.pumpAndSettle();

      final request = harness.repository.transactionRequests.last;
      expect(request.type, 'refund');
      expect(request.source, 'screenshot');
      expect(request.categoryId, 'food');
      expect(
        request.dateFrom,
        '${now.year}-${now.month.toString().padLeft(2, '0')}-10',
      );
      expect(
        request.dateTo,
        '${now.year}-${now.month.toString().padLeft(2, '0')}-12',
      );
      // Active filters stay visible and individually removable.
      expect(find.widgetWithText(InputChip, 'Refunds'), findsOneWidget);
      expect(find.widgetWithText(InputChip, 'Screenshot'), findsOneWidget);
      expect(find.widgetWithText(InputChip, 'Food'), findsOneWidget);
      await tester.tap(find.text('Clear all'));
      await tester.pumpAndSettle();
      final cleared = harness.repository.transactionRequests.last;
      expect(cleared.type, isNull);
      expect(cleared.source, isNull);
      expect(cleared.categoryId, isNull);
      expect(cleared.dateFrom, isNull);
      expect(find.byType(InputChip), findsNothing);
    },
  );

  testWidgets(
    'pagination appends results and pull-to-refresh resets page one',
    (tester) async {
      final harness = await MobileTestHarness.create();
      harness.repository.transactionsHandler = (request) async =>
          request.page == 1
          ? TransactionPage(
              items: List.generate(12, _transaction),
              pagination: const Pagination(
                page: 1,
                limit: 20,
                total: 13,
                totalPages: 2,
              ),
            )
          : TransactionPage(
              items: [_transaction(99, merchant: 'Second-page merchant')],
              pagination: const Pagination(
                page: 2,
                limit: 20,
                total: 13,
                totalPages: 2,
              ),
            );

      await tester.pumpWidget(harness.screen(const TransactionListScreen()));
      await tester.pumpAndSettle();
      final ledger = find.byType(CustomScrollView);

      await tester.fling(ledger, const Offset(0, -2000), 3000);
      await tester.pumpAndSettle();
      expect(
        harness.repository.transactionRequests.any(
          (request) => request.page == 2,
        ),
        isTrue,
      );
      expect(find.text('Second-page merchant'), findsOneWidget);

      final pageOneReads = harness.repository.transactionRequests
          .where((request) => request.page == 1)
          .length;
      await tester.fling(ledger, const Offset(0, 2500), 3000);
      await tester.pumpAndSettle();
      await tester.drag(ledger, const Offset(0, 450));
      await tester.pump();
      await tester.pumpAndSettle();

      expect(
        harness.repository.transactionRequests
            .where((request) => request.page == 1)
            .length,
        pageOneReads + 1,
      );
      expect(find.text('Second-page merchant'), findsNothing);
    },
  );

  testWidgets('refreshing keeps the ledger visible and ignores stale pages', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    final pending = <String?, Completer<TransactionPage>>{};
    harness.repository.transactionsHandler = (request) {
      if (request.type == null && pending.isEmpty) {
        return Future.value(harness.repository.transactionPage);
      }
      return (pending[request.type] = Completer<TransactionPage>()).future;
    };
    await tester.pumpWidget(harness.screen(const TransactionListScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Mountain Cafe'), findsOneWidget);

    await tester.tap(find.text('Expense'));
    await tester.pump();
    expect(find.text('Mountain Cafe'), findsOneWidget);
    expect(find.byType(LinearProgressIndicator), findsWidgets);

    await tester.tap(find.text('Income'));
    await tester.pump();
    pending['income']!.complete(
      TransactionPage(
        items: [_transaction(1, merchant: 'Latest income')],
        pagination: const Pagination(
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        ),
      ),
    );
    await tester.pumpAndSettle();
    pending['expense']!.complete(
      TransactionPage(
        items: [_transaction(2, merchant: 'Stale expense')],
        pagination: const Pagination(
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Latest income'), findsOneWidget);
    expect(find.text('Stale expense'), findsNothing);
    expect(find.byType(LinearProgressIndicator), findsNothing);
  });

  testWidgets('transaction list exposes empty and retryable error states', (
    tester,
  ) async {
    final emptyHarness = await MobileTestHarness.create();
    emptyHarness.repository.transactionPage = const TransactionPage(
      items: [],
      pagination: Pagination(page: 1, limit: 20, total: 0, totalPages: 0),
    );
    await tester.pumpWidget(emptyHarness.screen(const TransactionListScreen()));
    await tester.pumpAndSettle();
    expect(find.text('No matching transactions'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();

    final errorHarness = await MobileTestHarness.create();
    var calls = 0;
    errorHarness.repository.transactionsHandler = (_) async {
      calls++;
      if (calls == 1) {
        throw const ApiException(
          statusCode: 503,
          code: 'UNAVAILABLE',
          message: 'Transactions temporarily unavailable',
        );
      }
      return errorHarness.repository.transactionPage;
    };
    await tester.pumpWidget(errorHarness.screen(const TransactionListScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Transactions temporarily unavailable'), findsOneWidget);

    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text(testTransaction.merchantName!), findsOneWidget);
    expect(calls, 2);
  });

  testWidgets('the ledger, its filters and empty state read in Chinese', (
    tester,
  ) async {
    await initializeDateFormatting();
    applyLanguage(AppLanguage.zh);
    addTearDown(() => applyLanguage(AppLanguage.en));
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final harness = await MobileTestHarness.create();
    await tester.pumpWidget(harness.screen(const TransactionListScreen()));
    await tester.pumpAndSettle();

    expect(find.text('明细'), findsOneWidget);
    expect(find.text('本月支出'), findsOneWidget);
    expect(find.text('本月收入'), findsOneWidget);
    expect(find.text('全部'), findsOneWidget);
    expect(find.text('支出'), findsOneWidget);
    expect(find.text('收入'), findsOneWidget);
    expect(find.byTooltip('搜索'), findsOneWidget);

    await tester.tap(find.byTooltip('更多筛选'));
    await tester.pumpAndSettle();
    expect(find.text('筛选交易'), findsOneWidget);
    expect(find.text('交易类型'), findsOneWidget);
    expect(find.text('分类'), findsOneWidget);
    expect(find.text('来源'), findsOneWidget);

    await tester.tap(find.widgetWithText(ChoiceChip, '退款'));
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('选择日期范围'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('选择日期范围'));
    await tester.pumpAndSettle();
    // The date picker itself is Material's, in whatever locale it was given.
    final material = MaterialLocalizations.of(
      tester.element(find.byType(DateRangePickerDialog)),
    );
    final now = DateTime.now();
    await tester.tap(find.byTooltip(material.inputDateModeButtonLabel));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextField, material.dateRangeStartLabel),
      material.formatCompactDate(DateTime(now.year, now.month, 10)),
    );
    await tester.enterText(
      find.widgetWithText(TextField, material.dateRangeEndLabel),
      material.formatCompactDate(DateTime(now.year, now.month, 12)),
    );
    tester.testTextInput.hide();
    await tester.pump();
    await tester.tap(find.text(material.okButtonLabel));
    await tester.pumpAndSettle();
    final month = now.month.toString().padLeft(2, '0');
    expect(
      find.text('${now.year}-$month-10 至 ${now.year}-$month-12'),
      findsOneWidget,
    );

    await tester.tap(find.text('应用'));
    await tester.pumpAndSettle();
    expect(harness.repository.transactionRequests.last.type, 'refund');
    expect(find.widgetWithText(InputChip, '退款'), findsOneWidget);
    expect(
      find.widgetWithText(InputChip, '${now.month}月10日 – ${now.month}月12日'),
      findsOneWidget,
    );

    harness.repository.transactionPage = const TransactionPage(
      items: [],
      pagination: Pagination(page: 1, limit: 20, total: 0, totalPages: 0),
    );
    await tester.tap(find.text('全部清除'));
    await tester.pumpAndSettle();
    expect(find.byType(InputChip), findsNothing);
    expect(find.text('没有符合条件的交易'), findsOneWidget);
    expect(find.text('换个关键词或筛选条件试试'), findsOneWidget);
  });

  testWidgets('the tab bar and add sheet around the ledger read in Chinese', (
    tester,
  ) async {
    await initializeDateFormatting();
    applyLanguage(AppLanguage.zh);
    addTearDown(() => applyLanguage(AppLanguage.en));
    final harness = await MobileTestHarness.create();
    final router = GoRouter(
      initialLocation: '/transactions',
      routes: [
        StatefulShellRoute.indexedStack(
          builder: (_, _, shell) => AppShell(navigationShell: shell),
          branches: [
            for (final path in ['/', '/transactions', '/statistics', '/me'])
              StatefulShellBranch(
                routes: [
                  GoRoute(
                    path: path,
                    builder: (_, _) => path == '/transactions'
                        ? const TransactionListScreen()
                        : Text('PAGE $path'),
                  ),
                ],
              ),
          ],
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: harness.overrides,
        retry: (_, _) => null,
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();

    for (final tab in ['首页', '统计', '我的']) {
      expect(find.text(tab), findsOneWidget, reason: tab);
    }
    // The Activity tab and the ledger's own title.
    expect(find.text('明细'), findsNWidgets(2));

    await tester.tap(find.byTooltip('记一笔'));
    await tester.pumpAndSettle();
    expect(find.text('记一笔——今天要记点什么？'), findsOneWidget);
    expect(find.text('手动记账'), findsOneWidget);
    expect(find.text('一次最多识别 10 张支付截图'), findsOneWidget);
    expect(find.text('待核对'), findsOneWidget);
  });

  testWidgets(
    'filtered summary uses server totals across pages and never shows a partial page sum',
    (tester) async {
      final harness = await MobileTestHarness.create();
      harness.repository.transactionsHandler = (request) async =>
          TransactionPage(
            items: List.generate(20, _transaction),
            pagination: const Pagination(
              page: 1,
              limit: 20,
              total: 47,
              totalPages: 3,
            ),
            totals: request.type == 'expense'
                ? const [
                    TransactionCurrencyTotal(
                      currency: 'CNY',
                      expenseMinor: 123450,
                    ),
                  ]
                : null,
          );
      await tester.pumpWidget(harness.screen(const TransactionListScreen()));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Expense'));
      await tester.pumpAndSettle();
      expect(find.text('47 items'), findsOneWidget);
      expect(find.text('¥1,234.50'), findsOneWidget);

      // Without server totals on a partial page, show count only (no smaller sum).
      await tester.tap(find.text('Income'));
      await tester.pumpAndSettle();
      expect(find.text('47 items'), findsOneWidget);
      expect(find.text('¥1,234.50'), findsNothing);
      expect(find.text('Shown in'), findsNothing);
    },
  );
}
