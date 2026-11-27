import 'dart:async';

import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:zowl_mobile/core/api.dart';
import 'package:zowl_mobile/core/l10n.dart';
import 'package:zowl_mobile/core/models.dart';
import 'package:zowl_mobile/features/common/sky.dart';
import 'package:zowl_mobile/features/home/home_screen.dart';

import 'support/fixtures.dart';
import 'support/test_harness.dart';

void main() {
  testWidgets('home exposes loading, monthly facts, and recent transactions', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    final completer = Completer<StatisticsOverview>();
    harness.repository.statisticsHandler = (_, _) => completer.future;

    await tester.pumpWidget(harness.screen(const HomeScreen()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byType(HomeScreen), findsOneWidget);
    expect(find.bySemanticsLabel('Loading'), findsOneWidget);
    expect(tester.widget<SkyOwl>(find.byType(SkyOwl)).busy, isTrue);

    completer.complete(testStatistics);
    await tester.pumpAndSettle();
    expect(tester.widget<SkyOwl>(find.byType(SkyOwl)).busy, isFalse);
    expect(find.text('Balance this month'), findsOneWidget);
    expect(find.text('Mountain Cafe'), findsOneWidget);
    expect(find.text('Recent transactions'), findsOneWidget);
    expect(find.text('See all'), findsOneWidget);
  });

  testWidgets('home explains an empty ledger without hiding quick actions', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    harness.repository.statisticsValue = const StatisticsOverview(
      month: '2026-07',
      currency: 'CNY',
      summary: testSummary,
      recentTransactions: [],
    );

    await tester.pumpWidget(harness.screen(const HomeScreen()));
    await tester.pumpAndSettle();

    expect(
      find.text('No transactions yet. Add your first one.'),
      findsOneWidget,
    );
    expect(find.text('Add transaction'), findsOneWidget);
  });

  testWidgets('home retries a visible statistics failure', (tester) async {
    final harness = await MobileTestHarness.create();
    var calls = 0;
    harness.repository.statisticsHandler = (_, _) async {
      calls++;
      if (calls == 1) {
        throw const ApiException(
          statusCode: 503,
          code: 'UNAVAILABLE',
          message: 'Statistics temporarily unavailable',
        );
      }
      return testStatistics;
    };

    await tester.pumpWidget(harness.screen(const HomeScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Statistics temporarily unavailable'), findsOneWidget);

    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('Mountain Cafe'), findsOneWidget);
    expect(calls, 2);
  });

  testWidgets('home counts screenshots and notification candidates together', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    harness.repository.jobs = const [
      RecognitionJob(
        id: 'pending',
        status: 'reviewing',
        createdAt: '2026-09-24T12:00:00Z',
        totalCount: 3,
        importedCount: 1,
      ),
    ];
    harness.repository.notificationCapturePage = const NotificationCapturePage(
      items: [],
      pagination: Pagination(page: 1, limit: 20, total: 4, totalPages: 1),
      pendingCount: 4,
    );
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(harness.screen(const HomeScreen()));
    await tester.pumpAndSettle();
    expect(find.text('6 to review'), findsOneWidget);
    // What the owl says in short, its label says in full, and screen readers can tap it.
    final bubble = find.bySemanticsLabel(
      '6 payments to review, 4 captured, 2 from screenshots',
    );
    expect(bubble, findsOneWidget);
    expect(
      tester.getSemantics(bubble).getSemanticsData().hasAction(
        SemanticsAction.tap,
      ),
      isTrue,
    );
    final bars = find.bySemanticsLabel('Daily spending in July');
    expect(bars, findsOneWidget);
    expect(
      tester.getSemantics(bars).getSemanticsData().hasAction(
        SemanticsAction.tap,
      ),
      isTrue,
    );
    semantics.dispose();
  });

  testWidgets('home speaks Chinese when the app language is Chinese', (
    tester,
  ) async {
    await initializeDateFormatting();
    applyLanguage(AppLanguage.zh);
    addTearDown(() => applyLanguage(AppLanguage.en));
    final harness = await MobileTestHarness.create();
    harness.repository.notificationCapturePage = const NotificationCapturePage(
      items: [],
      pagination: Pagination(page: 1, limit: 20, total: 2, totalPages: 1),
      pendingCount: 2,
    );

    await tester.pumpWidget(harness.screen(const HomeScreen()));
    await tester.pumpAndSettle();

    expect(find.text('晚上好，Ze'), findsOneWidget);
    expect(find.text('2 笔等你核对'), findsOneWidget);
    expect(find.text('今天还没记账'), findsOneWidget);
    expect(find.text('本月结余'), findsOneWidget);
    expect(find.text('另有 USD'), findsOneWidget);
    expect(find.text('收入'), findsOneWidget);
    expect(find.text('支出'), findsOneWidget);
    expect(find.text('7月1日'), findsNWidgets(2));
    expect(find.text('每日支出'), findsOneWidget);
    expect(find.text('最近交易'), findsOneWidget);
    expect(find.text('查看全部'), findsOneWidget);
    expect(find.text('存下收入的 81%'), findsOneWidget);
    expect(find.byTooltip('待核对的付款'), findsOneWidget);
    expect(find.byTooltip('我的'), findsOneWidget);
    // Category names are user data and stay as entered.
    expect(find.textContaining('Food · '), findsOneWidget);
  });

  testWidgets('an empty ledger invites a first entry in Chinese', (
    tester,
  ) async {
    applyLanguage(AppLanguage.zh);
    addTearDown(() => applyLanguage(AppLanguage.en));
    final harness = await MobileTestHarness.create();
    harness.repository.notificationCapturePage = const NotificationCapturePage(
      items: [],
      pagination: Pagination(page: 1, limit: 20, total: 0, totalPages: 0),
      pendingCount: 0,
    );
    harness.repository.statisticsValue = const StatisticsOverview(
      month: '2026-07',
      currency: 'CNY',
      summary: testSummary,
      recentTransactions: [],
    );

    await tester.pumpWidget(harness.screen(const HomeScreen()));
    await tester.pumpAndSettle();

    expect(find.text('还没有交易，先记一笔吧。'), findsOneWidget);
    expect(find.text('可以手动记账，也可以识别支付截图。'), findsOneWidget);
    expect(find.byTooltip('已采集的付款'), findsOneWidget);
    expect(find.text('记一笔'), findsOneWidget);
    expect(find.text('今天还没记账'), findsOneWidget);
    // Nothing to review, so the owl has nothing to say.
    expect(find.byType(OwlBubble), findsNothing);
  });

  testWidgets('home highlights overspending when expenses exceed income', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    harness.repository.statisticsValue = const StatisticsOverview(
      month: '2026-07',
      currency: 'CNY',
      summary: FlowSummary(
        grossExpenseMinor: 125000,
        refundMinor: 0,
        netExpenseMinor: 125000,
        incomeMinor: 100000,
        transferMinor: 0,
        balanceMinor: -25000,
        expenseCount: 5,
        refundCount: 0,
        incomeCount: 1,
        transferCount: 0,
        transactionCount: 6,
      ),
      recentTransactions: [],
    );

    await tester.pumpWidget(harness.screen(const HomeScreen()));
    await tester.pumpAndSettle();

    expect(find.text('Spent 25% over income'), findsOneWidget);
  });
}
