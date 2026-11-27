// Renders the real Zowl home screen for the web download page.
// Not part of the automated suite. From mobile/:
//   flutter test tool/capture_download_screens_test.dart
// Writes ../public/screenshots/zowl-home-{light,dark}.png (390 × 844 at 2x).
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zowl_mobile/core/models.dart';
import 'package:zowl_mobile/core/day_time.dart';
import 'package:zowl_mobile/main.dart';

import '../test/support/test_harness.dart';

const _nunito = [
  'Regular',
  'Medium',
  'SemiBold',
  'Bold',
  'ExtraBold',
  'Black',
];

/// Widget tests render every font as Ahem blocks; load the bundled Nunito
/// under the names the app and Material fall back to.
Future<void> _loadFonts() async {
  for (final family in ['Nunito', 'Roboto', 'Ahem']) {
    final loader = FontLoader(family);
    for (final weight in _nunito) {
      loader.addFont(rootBundle.load('assets/fonts/Nunito-$weight.ttf'));
    }
    await loader.load();
  }
  final icons = FontLoader('MaterialIcons')
    ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
  await icons.load();
}

void main() {
  testWidgets('capture the home screen for the download page', (tester) async {
    await _loadFonts();
    // The app labels "today" by the real date, so the samples follow it. The sky
    // is always the afternoon's.
    final now = DateTime.now();
    debugStoryClock = () => DateTime(now.year, now.month, now.day, 14);
    addTearDown(() => debugStoryClock = null);
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final harness = await MobileTestHarness.create();
    final today = DateTime(now.year, now.month, now.day);
    TransactionItem expense(
      String id,
      String merchant,
      String category,
      String color,
      int amountMinor,
      int daysAgo,
      int hour,
    ) => TransactionItem(
      id: id,
      type: 'expense',
      amountMinor: amountMinor,
      currency: 'CNY',
      merchantName: merchant,
      categoryName: category,
      categoryColor: color,
      transactionTime: today
          .subtract(Duration(days: daysAgo))
          .add(Duration(hours: hour))
          .toIso8601String(),
      source: 'manual',
    );
    final month = '${now.year}-${now.month.toString().padLeft(2, '0')}';
    const daily = [
      4200, 1800, 9600, 2400, 0, 15800, 3200, //
      2600, 7400, 1200, 5600, 3800, 4280,
    ];
    final days = List.generate(now.day, (index) => index + 1);
    harness.repository.statisticsValue = StatisticsOverview(
      month: month,
      currency: 'CNY',
      summary: const FlowSummary(
        grossExpenseMinor: 618800,
        refundMinor: 0,
        netExpenseMinor: 618800,
        incomeMinor: 1250000,
        transferMinor: 0,
        balanceMinor: 631200,
        expenseCount: 38,
        refundCount: 0,
        incomeCount: 1,
        transferCount: 0,
        transactionCount: 39,
      ),
      recentTransactions: [
        expense('1', 'Noodle House', 'Food', '#f97316', 3200, 0, 12),
        expense('2', 'Metro', 'Transport', '#3b82f6', 600, 0, 8),
        expense('3', 'Corner Bakery', 'Food', '#f97316', 1800, 1, 9),
        expense('4', 'City Cinema', 'Entertainment', '#a855f7', 9600, 1, 20),
        expense('5', 'Book Nook', 'Shopping', '#ec4899', 5600, 2, 16),
      ],
      dailyTrend: [
        for (final day in days)
          TrendPoint(
            label: '$day',
            date: '$month-${day.toString().padLeft(2, '0')}',
            netExpenseMinor: day == now.day
                ? 3800
                : daily[(day - 1) % daily.length],
            incomeMinor: day == 1 ? 1250000 : 0,
          ),
      ],
    );
    harness.repository.notificationCapturePage = const NotificationCapturePage(
      items: [],
      pagination: Pagination(page: 1, limit: 20, total: 3, totalPages: 1),
      pendingCount: 3,
    );

    final boundaryKey = GlobalKey();
    await tester.pumpWidget(
      RepaintBoundary(
        key: boundaryKey,
        child: ProviderScope(
          overrides: harness.overrides,
          retry: (_, _) => null,
          child: const ZowlApp(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final output = Directory('../public/screenshots')
      ..createSync(recursive: true);
    Future<void> capture(String name) async {
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.runAsync(() async {
        final boundary =
            boundaryKey.currentContext!.findRenderObject()!
                as RenderRepaintBoundary;
        final image = await boundary.toImage(pixelRatio: 2);
        final data = await image.toByteData(format: ui.ImageByteFormat.png);
        await File(
          '${output.path}/zowl-home-$name.png',
        ).writeAsBytes(data!.buffer.asUint8List());
        image.dispose();
      });
    }

    await capture('light');
    tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
    addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
    await tester.pumpAndSettle();
    await capture('dark');
  });
}
