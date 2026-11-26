import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:zemoney_mobile/core/api.dart';
import 'package:zemoney_mobile/core/formatters.dart';
import 'package:zemoney_mobile/core/models.dart';
import 'package:zemoney_mobile/core/providers.dart';
import 'package:zemoney_mobile/features/imports/notification_capture_screen.dart';
import 'package:zemoney_mobile/main.dart';

import 'support/fixtures.dart';
import 'support/test_harness.dart';

void main() {
  testWidgets('a notification route survives cold-start authentication', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    harness.capture.pendingRouteForTest = '/imports/notifications';
    await tester.pumpWidget(
      ProviderScope(
        overrides: harness.overrides,
        retry: (_, _) => null,
        child: const ZeMoneyApp(),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(NotificationCaptureScreen), findsOneWidget);
    expect(harness.repository.createInputs, isEmpty);
    expect(harness.capture.configureCalls, 0);
  });

  testWidgets('a notification route waits for login without capturing', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create(token: null);
    harness.capture.pendingRouteForTest = '/imports/notifications';
    await tester.pumpWidget(
      ProviderScope(
        overrides: harness.overrides,
        retry: (_, _) => null,
        child: const ZeMoneyApp(),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Welcome back'), findsOneWidget);
    final container = ProviderScope.containerOf(
      tester.element(find.byType(ZeMoneyApp)),
    );
    await container
        .read(authControllerProvider.notifier)
        .login('test@zemoney.local', 'password');
    await tester.pumpAndSettle();
    expect(find.byType(NotificationCaptureScreen), findsOneWidget);
    expect(harness.repository.createInputs, isEmpty);
  });
  testWidgets('a rejected password keeps the form and says what failed', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create(token: null);
    await tester.pumpWidget(
      ProviderScope(
        overrides: harness.overrides,
        retry: (_, _) => null,
        child: const ZeMoneyApp(),
      ),
    );
    await tester.pumpAndSettle();
    final container = ProviderScope.containerOf(
      tester.element(find.byType(ZeMoneyApp)),
    );
    // Mirror the real API client: the 401 also reaches the session invalidator.
    harness.repository.loginHandler = (_, _) async {
      container.read(sessionInvalidationProvider.notifier).invalidateSession();
      throw const ApiException(
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Incorrect email or password',
      );
    };

    await tester.enterText(
      find.byType(TextFormField).at(0),
      'me@zemoney.local',
    );
    await tester.enterText(find.byType(TextFormField).at(1), 'wrong-password');
    await tester.ensureVisible(find.text('Open Zowl'));
    await tester.tap(find.text('Open Zowl'));
    await tester.pumpAndSettle();

    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.textContaining('Incorrect email or password'), findsOneWidget);
    expect(find.text('me@zemoney.local'), findsOneWidget);
    expect(harness.repository.loginCalls, 1);
  });

  testWidgets('a cold start without a token lands on login', (tester) async {
    final harness = await MobileTestHarness.create(token: null);

    await tester.pumpWidget(
      ProviderScope(
        overrides: harness.overrides,
        retry: (_, _) => null,
        child: const ZeMoneyApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Open Zowl'), findsOneWidget);
    expect(find.text('Welcome back'), findsOneWidget);
  });

  testWidgets('a restored session reaches every primary destination', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();

    await tester.pumpWidget(
      ProviderScope(
        overrides: harness.overrides,
        retry: (_, _) => null,
        child: const ZeMoneyApp(),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Balance this month'), findsOneWidget);

    const destinations = {
      'Activity': 'Out this month',
      'Insights': 'Net spending this month',
      'Me': 'Personal details',
      'Home': 'Recent transactions',
    };
    for (final entry in destinations.entries) {
      await tester.tap(find.text(entry.key).last);
      await tester.pumpAndSettle();
      if (entry.key == 'Home') {
        await tester.scrollUntilVisible(
          find.text(entry.value),
          200,
          scrollable: find.byType(Scrollable).first,
        );
      }
      expect(find.text(entry.value), findsWidgets);
    }
  });

  testWidgets('the add action offers manual entry, screenshots, and captures', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();

    await tester.pumpWidget(
      ProviderScope(
        overrides: harness.overrides,
        retry: (_, _) => null,
        child: const ZeMoneyApp(),
      ),
    );
    await tester.pumpAndSettle();

    const entries = {
      'Enter manually': 'Confirm and post',
      'Recognize screenshots': 'Record a payment screenshot',
      'Review inbox': 'Payment candidates',
    };
    for (final entry in entries.entries) {
      await tester.tap(find.byTooltip('Add to ledger'));
      await tester.pumpAndSettle();
      expect(find.text('Enter manually'), findsOneWidget);
      await tester.tap(find.text(entry.key));
      await tester.pumpAndSettle();
      expect(find.text(entry.value), findsWidgets);
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.text('Balance this month'), findsOneWidget);
    }
  });

  testWidgets('only the ground and the + take taps, not the air beside it', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final harness = await MobileTestHarness.create();
    await tester.pumpWidget(
      ProviderScope(
        overrides: harness.overrides,
        retry: (_, _) => null,
        child: const ZeMoneyApp(),
      ),
    );
    await tester.pumpAndSettle();

    final page = tester.renderObject(find.byType(Scaffold).last);
    bool reachesPage(Offset at) =>
        tester.hitTestOnBinding(at).path.any((entry) => entry.target == page);
    final add = tester.getRect(find.byTooltip('Add to ledger'));
    // Level with the top of the +, at the side of the screen.
    expect(reachesPage(Offset(30, add.top + 4)), isTrue);
    expect(reachesPage(add.center), isFalse);
    // On the ground, between two tabs.
    expect(reachesPage(const Offset(2, 840)), isFalse);
  });

  testWidgets(
    'center add opens manual entry and retains screenshot import access',
    (tester) async {
      final harness = await MobileTestHarness.create();
      await tester.pumpWidget(
        ProviderScope(
          overrides: harness.overrides,
          retry: (_, _) => null,
          child: const ZeMoneyApp(),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Add to ledger'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Enter manually'));
      await tester.pumpAndSettle();
      expect(find.text('Confirm and post'), findsOneWidget);
      await tester.tap(find.byTooltip('Recognize screenshots'));
      await tester.pumpAndSettle();
      expect(find.text('Record a payment screenshot'), findsOneWidget);
    },
  );

  testWidgets(
    'authenticated deep links resolve and session invalidation signs out',
    (tester) async {
      final harness = await MobileTestHarness.create();

      await tester.pumpWidget(
        ProviderScope(
          overrides: harness.overrides,
          retry: (_, _) => null,
          child: const ZeMoneyApp(),
        ),
      );
      await tester.pumpAndSettle();
      final container = ProviderScope.containerOf(
        tester.element(find.byType(ZeMoneyApp)),
      );

      container.read(routerProvider).go('/transactions/tx-1');
      await tester.pumpAndSettle();
      expect(find.text('Transaction details'), findsOneWidget);
      expect(find.text('Mountain Cafe'), findsOneWidget);

      harness.tokens.token = null;
      container.read(sessionInvalidationProvider.notifier).invalidateSession();
      await tester.pumpAndSettle();
      expect(find.text('Open Zowl'), findsOneWidget);
    },
  );

  testWidgets('administrator deep links are role-gated', (tester) async {
    final memberHarness = await MobileTestHarness.create();
    await tester.pumpWidget(
      ProviderScope(
        overrides: memberHarness.overrides,
        retry: (_, _) => null,
        child: const ZeMoneyApp(),
      ),
    );
    await tester.pumpAndSettle();
    var container = ProviderScope.containerOf(
      tester.element(find.byType(ZeMoneyApp)),
    );
    container.read(routerProvider).go('/settings/admin');
    await tester.pumpAndSettle();
    expect(find.text('Personal details'), findsOneWidget);
    expect(find.text('System accounts'), findsNothing);

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
    await tester.pumpWidget(
      ProviderScope(
        overrides: adminHarness.overrides,
        retry: (_, _) => null,
        child: const ZeMoneyApp(),
      ),
    );
    await tester.pumpAndSettle();
    container = ProviderScope.containerOf(
      tester.element(find.byType(ZeMoneyApp)),
    );
    container.read(routerProvider).go('/settings/admin');
    await tester.pumpAndSettle();
    expect(find.text('System accounts'), findsOneWidget);
  });

  testWidgets(
    'insights drill-down passes category, uncategorized, currency, and clears stale search',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final harness = await MobileTestHarness.create();
      harness.repository.transactionPage = TransactionPage(
        items: [
          for (var i = 0; i < 20; i++)
            TransactionItem(
              id: 'tx-$i',
              type: 'expense',
              amountMinor: 1000 + i,
              currency: 'CNY',
              merchantName: 'Merchant $i',
              transactionTime:
                  '2026-07-${(20 - i).toString().padLeft(2, '0')}T04:30:00.000Z',
              source: 'manual',
              currentRevisionId: 'rev-$i',
              revisionNumber: 1,
            ),
        ],
        pagination: const Pagination(
          page: 1,
          limit: 20,
          total: 20,
          totalPages: 1,
        ),
      );
      harness.repository.statisticsHandler = (month, currency) async =>
          StatisticsOverview(
            month: month,
            currency: currency,
            summary: testSummary,
            excludedCurrencies: [
              CurrencyBreakdown(
                currency: currency == 'CNY' ? 'USD' : 'CNY',
                summary: testSummary,
              ),
            ],
            categoryDistribution: const [
              DistributionItem(
                categoryId: 'food',
                name: 'Food',
                color: '#f97316',
                amountMinor: 148600,
                transactionCount: 12,
                sharePercent: 61.9,
              ),
              DistributionItem(
                categoryId: null,
                name: 'Uncategorized',
                amountMinor: 91400,
                transactionCount: 6,
                sharePercent: 38.1,
              ),
            ],
            sourceDistribution: const [
              DistributionItem(
                source: 'manual',
                amountMinor: 240000,
                transactionCount: 18,
                sharePercent: 100,
              ),
            ],
            dailyTrend: const [
              TrendPoint(label: '1Day', netExpenseMinor: 3500, incomeMinor: 0),
            ],
            recentTransactions: const [testTransaction],
          );

      await tester.pumpWidget(
        ProviderScope(
          overrides: harness.overrides,
          retry: (_, _) => null,
          child: const ZeMoneyApp(),
        ),
      );
      await tester.pumpAndSettle();

      // Leave an active search keyword and non-zero scroll position on Activity.
      await tester.tap(find.text('Activity').last);
      await tester.pumpAndSettle();
      await tester.drag(
        find.byType(CustomScrollView).last,
        const Offset(0, -600),
      );
      await tester.pumpAndSettle();
      final activityScroll = tester.widget<CustomScrollView>(
        find.byType(CustomScrollView).last,
      );
      expect(activityScroll.controller!.offset, greaterThan(100));
      await tester.tap(find.byTooltip('Search'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(SearchBar), 'coffee');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pumpAndSettle();
      expect(harness.repository.transactionRequests.last.keyword, 'coffee');

      // Switch to Insights and drill down into Uncategorized.
      await tester.tap(find.text('Insights').last);
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Uncategorized').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Uncategorized').last);
      await tester.pumpAndSettle();

      final uncategorizedReq = harness.repository.transactionRequests.last;
      expect(uncategorizedReq.type, 'expense');
      expect(uncategorizedReq.categoryId, isNull);
      expect(uncategorizedReq.uncategorized, isTrue);
      expect(uncategorizedReq.currency, 'CNY');
      expect(uncategorizedReq.keyword, '');
      expect(activityScroll.controller!.offset, 0);
      expect(find.widgetWithText(InputChip, 'Uncategorized'), findsOneWidget);
      expect(find.widgetWithText(InputChip, 'CNY'), findsOneWidget);

      // Return to Insights, switch to USD, and drill down into Food and Source.
      await tester.tap(find.text('Insights').last);
      await tester.pumpAndSettle();
      await tester.drag(find.byType(CustomScrollView).last, const Offset(0, 600));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Currency'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('USD').last);
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Food').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Food').last);
      await tester.pumpAndSettle();

      final usdFoodReq = harness.repository.transactionRequests.last;
      expect(usdFoodReq.type, 'expense');
      expect(usdFoodReq.categoryId, 'food');
      expect(usdFoodReq.uncategorized, isNull);
      expect(usdFoodReq.currency, 'USD');
      expect(find.widgetWithText(InputChip, 'USD'), findsOneWidget);

      await tester.tap(find.text('Insights').last);
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Source'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Source'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Manual'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Manual'));
      await tester.pumpAndSettle();

      final usdSourceReq = harness.repository.transactionRequests.last;
      expect(usdSourceReq.type, 'expense');
      expect(usdSourceReq.source, 'manual');
      expect(usdSourceReq.currency, 'USD');
    },
  );

  testWidgets(
    'tapping home daily bars jumps to insights trends on the home month',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final harness = await MobileTestHarness.create();
      final now = DateTime.now();
      harness.repository.statisticsHandler = (month, currency) async =>
          StatisticsOverview(
            month: month,
            currency: currency,
            summary: testSummary,
            dailyTrend: [
              TrendPoint(
                label: '1Day',
                date: '$month-01',
                netExpenseMinor: 3500,
                incomeMinor: 0,
              ),
            ],
            recentTransactions: const [testTransaction],
          );

      await tester.pumpWidget(
        ProviderScope(
          overrides: harness.overrides,
          retry: (_, _) => null,
          child: const ZeMoneyApp(),
        ),
      );
      await tester.pumpAndSettle();

      // Move Insights back two months so it is no longer on the current month.
      await tester.tap(find.text('Insights').last);
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Previous month'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Previous month'));
      await tester.pumpAndSettle();
      final twoMonthsAgo = DateFormat(
        'MMMM yyyy',
        'en_US',
      ).format(DateTime(now.year, now.month - 2));
      expect(find.text(twoMonthsAgo), findsOneWidget);

      // Go back to Home and tap the current month's daily spending bars.
      await tester.tap(find.text('Home').last);
      await tester.pumpAndSettle();
      final currentMonthName = DateFormat('MMMM', 'en_US').format(now);
      await tester.tap(
        find.bySemanticsLabel('Daily spending in $currentMonthName'),
      );
      await tester.pumpAndSettle();

      final currentMonthLabel = DateFormat('MMMM yyyy', 'en_US').format(now);
      expect(find.text(currentMonthLabel), findsOneWidget);
      expect(find.text('Day by day'), findsOneWidget);
      expect(
        monthKey(DateTime(now.year, now.month)),
        monthKey(now),
      );
    },
  );
}
