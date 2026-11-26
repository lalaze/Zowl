import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zemoney_mobile/core/api.dart';
import 'package:zemoney_mobile/core/formatters.dart';
import 'package:zemoney_mobile/core/l10n.dart';
import 'package:zemoney_mobile/core/models.dart';
import 'package:zemoney_mobile/core/providers.dart';
import 'package:zemoney_mobile/features/statistics/statistics_screen.dart';

import 'support/fixtures.dart';
import 'support/test_harness.dart';

const _emptySummary = FlowSummary(
  grossExpenseMinor: 0,
  refundMinor: 0,
  netExpenseMinor: 0,
  incomeMinor: 0,
  transferMinor: 0,
  balanceMinor: 0,
  expenseCount: 0,
  refundCount: 0,
  incomeCount: 0,
  transferCount: 0,
  transactionCount: 0,
);

const _emptyStatistics = StatisticsOverview(
  month: '2026-07',
  currency: 'CNY',
  summary: _emptySummary,
  recentTransactions: [],
);

Future<void> _show(WidgetTester tester, MobileTestHarness harness) async {
  await tester.pumpWidget(harness.screen(const StatisticsScreen()));
  await tester.pumpAndSettle();
}

Future<void> _reveal(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
}

StatisticsOverview _spending(String month, List<int> days) =>
    StatisticsOverview(
      month: month,
      currency: 'CNY',
      summary: testSummary,
      dailyTrend: [
        for (final (index, minor) in days.indexed)
          TrendPoint(
            label: '${index + 1}Day',
            date: '$month-${'${index + 1}'.padLeft(2, '0')}',
            netExpenseMinor: minor,
            incomeMinor: 0,
          ),
      ],
      recentTransactions: const [],
    );

void main() {
  testWidgets('the hill piles the month up and compares it with the last', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    final now = DateTime.now();
    final previous = DateTime(now.year, now.month - 1);
    // A finished month, so the day the suite runs on does not matter.
    harness.repository.statisticsHandler = (month, _) async => switch (month) {
      _ when month == monthKey(previous) => _spending(
        month,
        // A refund on the last day takes the pile down again.
        [1000, 2000, 500, -300],
      ),
      _ when month == monthKey(now) => _spending(month, []),
      _ => _spending(month, [4000, 1000]),
    };
    final semantics = tester.ensureSemantics();
    await _show(tester, harness);
    await tester.tap(find.byTooltip('Previous month'));
    await tester.pumpAndSettle();

    expect(
      find.bySemanticsLabel(
        'Spending by day 4: ¥32.00. Last month by then: ¥50.00',
      ),
      findsOneWidget,
    );
    expect(find.text('Last month'), findsOneWidget);
    expect(tester.takeException(), isNull);
    semantics.dispose();
  });

  testWidgets('a last month that cannot be read only loses its ridge', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    final now = DateTime.now();
    final previous = DateTime(now.year, now.month - 1);
    harness.repository.statisticsHandler = (month, _) async {
      if (month != monthKey(previous) && month != monthKey(now)) {
        throw const ApiException(
          statusCode: 503,
          code: 'UNAVAILABLE',
          message: 'Statistics temporarily unavailable',
        );
      }
      return _spending(month, [1000, 2000]);
    };
    final semantics = tester.ensureSemantics();
    await _show(tester, harness);
    await tester.tap(find.byTooltip('Previous month'));
    await tester.pumpAndSettle();

    expect(find.bySemanticsLabel('Spending by day 2: ¥30.00'), findsOneWidget);
    expect(find.text('Last month'), findsNothing);
    expect(find.textContaining('temporarily unavailable'), findsNothing);
    expect(find.text('Net spending this month'), findsOneWidget);
    semantics.dispose();
  });

  testWidgets('month, currency, and all three statistic sections are public', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    final requests = <String>[];
    harness.repository.statisticsHandler = (month, currency) async {
      requests.add('$month|$currency');
      return testStatistics;
    };

    await _show(tester, harness);

    final now = DateTime.now();
    final currentMonth = DateTime(now.year, now.month);
    // This month, then last month for the ridge behind it.
    expect(requests, [
      '${monthKey(currentMonth)}|CNY',
      '${monthKey(DateTime(now.year, now.month - 1))}|CNY',
    ]);
    expect(
      find.text(DateFormat('MMMM yyyy', 'en_US').format(now)),
      findsOneWidget,
    );
    expect(find.text('21 transactions'), findsOneWidget);
    expect(
      find.text(
        'Your top spending category this month is Food, accounting for 61.9%.',
      ),
      findsOneWidget,
    );
    expect(
      tester
          .widget<IconButton>(
            find.widgetWithIcon(IconButton, Icons.chevron_right),
          )
          .onPressed,
      isNull,
    );

    await tester.tap(find.byTooltip('Previous month'));
    await tester.pumpAndSettle();
    final previous = DateTime(now.year, now.month - 1);
    final beforeThat = DateTime(now.year, now.month - 2);
    expect(requests.last, '${monthKey(beforeThat)}|CNY');
    expect(
      find.text(DateFormat('MMMM yyyy', 'en_US').format(previous)),
      findsOneWidget,
    );

    await tester.tap(find.text('CNY').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('USD').last);
    await tester.pumpAndSettle();
    expect(requests, contains('${monthKey(previous)}|USD'));
    expect(requests.last, '${monthKey(beforeThat)}|USD');

    expect(find.text('Where your money goes'), findsOneWidget);
    expect(find.text('Food'), findsWidgets);

    await _reveal(tester, find.text('Trends'));
    await tester.tap(find.text('Trends'));
    await tester.pumpAndSettle();
    expect(find.text('Day by day'), findsOneWidget);
    expect(find.text('Last six months'), findsOneWidget);

    await _reveal(tester, find.text('Source'));
    await tester.tap(find.text('Source'));
    await tester.pumpAndSettle();
    expect(find.text('Payment source'), findsOneWidget);
    expect(find.text('Manual'), findsOneWidget);
    expect(find.text('18 transactions · 100.0%'), findsOneWidget);
  });

  testWidgets('empty trends, categories, and sources explain their state', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    harness.repository.statisticsValue = _emptyStatistics;

    await _show(tester, harness);

    expect(
      find.text('Record a few transactions to see spending highlights here.'),
      findsOneWidget,
    );
    expect(find.text('No spending data'), findsOneWidget);

    await _reveal(tester, find.text('Trends'));
    await tester.tap(find.text('Trends'));
    await tester.pumpAndSettle();
    expect(find.text('No data'), findsWidgets);

    await _reveal(tester, find.text('Source'));
    await tester.tap(find.text('Source'));
    await tester.pumpAndSettle();
    expect(find.text('No spending data'), findsOneWidget);
  });

  testWidgets('statistics errors can be retried without leaving the screen', (
    tester,
  ) async {
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

    await _show(tester, harness);

    expect(calls, 1);
    expect(
      find.textContaining('Statistics temporarily unavailable'),
      findsOneWidget,
    );
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();

    // The retry, then last month.
    expect(calls, 3);
    expect(find.text('Net spending this month'), findsOneWidget);
  });

  testWidgets('changing month keeps the last figures until the next arrive', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    final previousMonth = Completer<StatisticsOverview>();
    final current = monthKey(DateTime.now());
    harness.repository.statisticsHandler = (month, currency) =>
        month == current ? Future.value(testStatistics) : previousMonth.future;
    await _show(tester, harness);

    await tester.tap(find.byTooltip('Previous month'));
    await tester.pump();
    expect(find.text('21 transactions'), findsOneWidget);
    expect(find.byType(LinearProgressIndicator), findsOneWidget);

    previousMonth.complete(_emptyStatistics);
    await tester.pumpAndSettle();
    expect(find.text('21 transactions'), findsNothing);
    expect(find.byType(LinearProgressIndicator), findsNothing);
  });

  testWidgets('insights read in Chinese with Chinese month names', (
    tester,
  ) async {
    await initializeDateFormatting();
    applyLanguage(AppLanguage.zh);
    addTearDown(() => applyLanguage(AppLanguage.en));
    final harness = await MobileTestHarness.create();
    harness.repository.statisticsValue = const StatisticsOverview(
      month: '2026-07',
      currency: 'CNY',
      summary: testSummary,
      categoryDistribution: [
        DistributionItem(
          name: 'Food',
          color: '#f97316',
          amountMinor: 148600,
          transactionCount: 12,
          sharePercent: 61.9,
        ),
        DistributionItem(
          amountMinor: 91400,
          transactionCount: 1,
          sharePercent: 38.1,
        ),
      ],
      sourceDistribution: [
        DistributionItem(
          source: 'manual',
          amountMinor: 240000,
          transactionCount: 18,
          sharePercent: 100,
        ),
      ],
      dailyTrend: [
        TrendPoint(label: '1Day', netExpenseMinor: 3500, incomeMinor: 0),
      ],
      monthlyTrend: [
        TrendPoint(
          label: 'Jun',
          month: '2026-06',
          netExpenseMinor: 180000,
          incomeMinor: 1280000,
        ),
        TrendPoint(
          label: 'Jul',
          month: '2026-07',
          netExpenseMinor: 240000,
          incomeMinor: 1280000,
        ),
      ],
      peakSpendingDay: PeakSpendingDay(
        date: '2026-07-18',
        netExpenseMinor: 3580,
        expenseCount: 1,
        topExpense: PeakExpense(
          transactionId: 'tx-1',
          merchantName: 'Mountain Cafe',
          amountMinor: 3580,
        ),
      ),
      recentTransactions: [],
    );

    await _show(tester, harness);

    expect(find.text('统计'), findsOneWidget);
    expect(
      find.text(DateFormat('y年M月', 'zh_CN').format(DateTime.now())),
      findsOneWidget,
    );
    expect(find.byTooltip('上个月'), findsOneWidget);
    expect(find.text('本月净支出'), findsOneWidget);
    expect(find.text('21 笔交易'), findsOneWidget);
    expect(find.text('结余'), findsOneWidget);
    expect(
      find.text(
        '本月支出最多的分类是「Food」，占 61.9%。\n'
        '花得最多的一天：7月18日，在「Mountain Cafe」花了 ¥35.80。',
      ),
      findsOneWidget,
    );
    expect(find.text('钱都花在哪儿'), findsOneWidget);
    expect(find.text('个分类'), findsOneWidget);
    expect(find.text('未分类'), findsNWidgets(2));
    expect(find.text('12 笔交易 · 61.9%'), findsOneWidget);

    await _reveal(tester, find.text('趋势'));
    await tester.tap(find.text('趋势'));
    await tester.pumpAndSettle();
    expect(find.text('每日支出'), findsOneWidget);
    expect(find.text('近六个月'), findsOneWidget);
    expect(find.text('6月'), findsOneWidget);
    expect(find.text('1800'), findsOneWidget);
    expect(find.text('2400'), findsOneWidget);
    expect(find.text('7月'), findsOneWidget);
    expect(find.text('收入与支出'), findsOneWidget);
    expect(find.text('本月收入存下了 81%。'), findsOneWidget);

    await _reveal(tester, find.text('来源'));
    await tester.tap(find.text('来源'));
    await tester.pumpAndSettle();
    expect(find.text('支付来源'), findsOneWidget);
    expect(find.text('18 笔交易 · 100.0%'), findsOneWidget);
  });

  testWidgets(
    'legend integer shares always total 100% and tapping the hill shows a day readout',
    (tester) async {
      final harness = await MobileTestHarness.create();
      final now = DateTime.now();
      final previous = DateTime(now.year, now.month - 1);
      final prevMonth = monthKey(previous);
      harness.repository.statisticsHandler = (month, _) async =>
          StatisticsOverview(
            month: month,
            currency: 'CNY',
            summary: testSummary,
            categoryDistribution: const [
              DistributionItem(
                name: 'Food',
                color: '#f97316',
                amountMinor: 4960,
                transactionCount: 3,
                sharePercent: 49.6,
              ),
              DistributionItem(
                name: 'Transit',
                color: '#3b82f6',
                amountMinor: 3060,
                transactionCount: 2,
                sharePercent: 30.6,
              ),
              DistributionItem(
                name: 'Home',
                color: '#10b981',
                amountMinor: 1980,
                transactionCount: 1,
                sharePercent: 19.8,
              ),
            ],
            dailyTrend: [
              TrendPoint(
                label: '1Day',
                date: '$month-01',
                netExpenseMinor: 1200,
                incomeMinor: 0,
              ),
              TrendPoint(
                label: '2Day',
                date: '$month-02',
                netExpenseMinor: 2800,
                incomeMinor: 0,
              ),
              TrendPoint(
                label: '3Day',
                date: '$month-03',
                netExpenseMinor: 1000,
                incomeMinor: 0,
              ),
            ],
            recentTransactions: const [],
          );

      await _show(tester, harness);
      // Naive rounding of 49.6 + 30.6 + 19.8 would yield 50 + 31 + 20 = 101%;
      // largest-remainder rounding yields 50 + 30 + 20 = 100%.
      expect(find.text('50%'), findsOneWidget);
      expect(find.text('30%'), findsOneWidget);
      expect(find.text('20%'), findsOneWidget);

      await tester.tap(find.byTooltip('Previous month'));
      await tester.pumpAndSettle();
      expect(
        find.bySemanticsLabel(RegExp(r'^Spending by day 3: ¥50\.00')),
        findsOneWidget,
      );
      final hill = find.bySemanticsLabel(
        RegExp(r'^Spending by day 3: ¥50\.00'),
      );
      Future<void> slowVerticalScroll(double dy) async {
        // Hold > kPressTimeout (100ms) before dragging so a buggy onTapDown would fire.
        final gesture = await tester.startGesture(tester.getCenter(hill));
        await tester.pump(const Duration(milliseconds: 150));
        await gesture.moveBy(Offset(0, dy));
        await tester.pump();
        await gesture.up();
        await tester.pumpAndSettle();
      }

      // Holding briefly then scrolling vertically must not leave a day readout.
      await slowVerticalScroll(-140);
      final day2 = DateFormat(
        'MMM d',
        'en_US',
      ).format(DateTime.parse('$prevMonth-02'));
      expect(find.textContaining(' · ¥'), findsNothing);
      await tester.drag(find.byType(CustomScrollView), const Offset(0, 140));
      await tester.pumpAndSettle();

      await tester.tapAt(tester.getCenter(hill));
      await tester.pumpAndSettle();
      // Day 2 of the previous month has cumulative spending ¥40.00.
      expect(find.textContaining('$day2 · ¥40.00'), findsOneWidget);

      // Vertical scrolling does not clear an already-selected day.
      await slowVerticalScroll(-120);
      expect(find.textContaining('$day2 · ¥40.00'), findsOneWidget);
      await tester.drag(find.byType(CustomScrollView), const Offset(0, 120));
      await tester.pumpAndSettle();

      // Tapping the same day repeatedly toggles show/hide cleanly.
      await tester.tapAt(tester.getCenter(hill));
      await tester.pumpAndSettle();
      expect(find.textContaining('$day2 · ¥40.00'), findsNothing);

      await tester.tapAt(tester.getCenter(hill));
      await tester.pumpAndSettle();
      expect(find.textContaining('$day2 · ¥40.00'), findsOneWidget);

      await tester.tapAt(tester.getCenter(hill));
      await tester.pumpAndSettle();
      expect(find.textContaining('$day2 · ¥40.00'), findsNothing);
    },
  );

  testWidgets('first load failure shows error immediately while retrying', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    harness.repository.statisticsHandler = (_, _) async =>
        throw const ApiException(
          statusCode: 503,
          code: 'UNAVAILABLE',
          message: 'Statistics temporarily unavailable',
        );
    await tester.pumpWidget(
      ProviderScope(
        overrides: harness.overrides,
        // Simulate Riverpod's automatic retry schedule (10s backoff).
        retry: (count, _) => count < 2 ? const Duration(seconds: 10) : null,
        child: const MaterialApp(home: StatisticsScreen()),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(
      find.textContaining('Statistics temporarily unavailable'),
      findsOneWidget,
    );
    // Clean up pending Riverpod retry timers before test teardown.
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });

  testWidgets(
    'currency switcher stays reachable when switching to another currency fails',
    (tester) async {
      final harness = await MobileTestHarness.create();
      harness.repository.statisticsHandler = (month, currency) async {
        if (currency == 'USD') {
          throw const ApiException(
            statusCode: 503,
            code: 'UNAVAILABLE',
            message: 'USD statistics unavailable',
          );
        }
        return testStatistics;
      };
      await _show(tester, harness);
      expect(find.text('Net spending this month'), findsOneWidget);

      await tester.tap(find.text('CNY').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('USD').last);
      await tester.pumpAndSettle();

      expect(find.textContaining('USD statistics unavailable'), findsOneWidget);
      // Currency menu stays on screen so the user can return to CNY.
      await tester.tap(find.byTooltip('Currency'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('CNY').last);
      await tester.pumpAndSettle();
      expect(find.text('Net spending this month'), findsOneWidget);
    },
  );

  testWidgets(
    'hills and donut painters compare list contents in shouldRepaint',
    (tester) async {
      final harness = await MobileTestHarness.create();
      final now = DateTime.now();
      final previous = DateTime(now.year, now.month - 1);
      final beforePrevious = DateTime(now.year, now.month - 2);
      final prevKey = monthKey(previous);
      final beforePrevKey = monthKey(beforePrevious);

      var prevDays = [1000, 1000, 1000, 1000, 1000];
      var behindDays = [1000, 1000, 1000, 1000, 1000];
      var foodShare = 60.0;

      StatisticsOverview buildOverview(String month, List<int> days) =>
          StatisticsOverview(
            month: month,
            currency: 'CNY',
            summary: testSummary,
            categoryDistribution: [
              DistributionItem(
                name: 'Food',
                color: '#f97316',
                amountMinor: (foodShare * 100).round(),
                transactionCount: 3,
                sharePercent: foodShare,
              ),
              DistributionItem(
                name: 'Transit',
                color: '#3b82f6',
                amountMinor: ((100 - foodShare) * 100).round(),
                transactionCount: 2,
                sharePercent: 100 - foodShare,
              ),
            ],
            dailyTrend: [
              for (final (index, minor) in days.indexed)
                TrendPoint(
                  label: '${index + 1}Day',
                  date: '$month-${'${index + 1}'.padLeft(2, '0')}',
                  netExpenseMinor: minor,
                  incomeMinor: 0,
                ),
            ],
            recentTransactions: const [],
          );

      harness.repository.statisticsHandler = (month, _) async {
        if (month == prevKey) return buildOverview(month, [...prevDays]);
        if (month == beforePrevKey) {
          return buildOverview(month, [...behindDays]);
        }
        return buildOverview(month, const [1000]);
      };

      final semantics = tester.ensureSemantics();
      await _show(tester, harness);
      await tester.tap(find.byTooltip('Previous month'));
      await tester.pumpAndSettle();

      CustomPainter hillsPainter() => tester
          .widget<CustomPaint>(
            find
                .descendant(
                  of: find.bySemanticsLabel(RegExp(r'^Spending by day 5:')),
                  matching: find.byType(CustomPaint),
                )
                .first,
          )
          .painter!;

      CustomPainter donutPainter() => tester
          .widget<CustomPaint>(
            find
                .ancestor(
                  of: find.text('categories'),
                  matching: find.byType(CustomPaint),
                )
                .first,
          )
          .painter!;

      final container = ProviderScope.containerOf(
        tester.element(find.byType(StatisticsScreen)),
      );
      Future<void> reload() async {
        container.invalidate(statisticsProvider('$prevKey|CNY'));
        container.invalidate(statisticsProvider('$beforePrevKey|CNY'));
        await tester.pumpAndSettle();
      }

      final hills0 = hillsPainter();
      final donut0 = donutPainter();

      // Rebuilding with equal-content lists does not repaint either painter.
      await reload();
      final hillsSame = hillsPainter();
      final donutSame = donutPainter();
      expect(identical(hillsSame, hills0), isFalse);
      expect(hillsSame.shouldRepaint(hills0), isFalse);
      expect(identical(donutSame, donut0), isFalse);
      expect(donutSame.shouldRepaint(donut0), isFalse);

      // Moving spending between middle days keeps climb.length and climb.last
      // identical, yet must still trigger a hill repaint.
      prevDays = [1000, 1500, 500, 1000, 1000];
      await reload();
      final hillsMovedMiddle = hillsPainter();
      expect(hillsMovedMiddle.shouldRepaint(hills0), isTrue);

      // Same regression check for last month's ridge (behind).
      prevDays = [1000, 1000, 1000, 1000, 1000];
      behindDays = [1000, 1500, 500, 1000, 1000];
      await reload();
      final hillsMovedBehind = hillsPainter();
      expect(hillsMovedBehind.shouldRepaint(hills0), isTrue);

      // Changing a donut slice share triggers a donut repaint.
      foodShare = 70.0;
      await reload();
      final donutChanged = donutPainter();
      expect(donutChanged.shouldRepaint(donut0), isTrue);
      semantics.dispose();
    },
  );
}
