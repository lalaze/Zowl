// Renders every main screen with sample data at 360 × 800, light and dark.
// Not part of the automated suite. From mobile/:
//   ZOWL_PREVIEW_OUT=/tmp/zowl flutter test tool/preview_screens_test.dart
// ZOWL_PREVIEW_FONTS may name a directory of Nunito-*.ttf files that also
// carry CJK glyphs; without it Chinese renders as blocks.
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:zemoney_mobile/core/l10n.dart';
import 'package:zemoney_mobile/core/models.dart';
import 'package:zemoney_mobile/core/providers.dart';
import 'package:zemoney_mobile/core/day_time.dart';
import 'package:zemoney_mobile/main.dart';

import '../test/support/test_harness.dart';

const _weights = [
  'Regular',
  'Medium',
  'SemiBold',
  'Bold',
  'ExtraBold',
  'Black',
];

Future<void> _loadFonts() async {
  final dir = Platform.environment['ZOWL_PREVIEW_FONTS'];
  for (final family in ['Nunito', 'Roboto', 'Ahem']) {
    final loader = FontLoader(family);
    for (final weight in _weights) {
      loader.addFont(
        dir == null
            ? rootBundle.load('assets/fonts/Nunito-$weight.ttf')
            : Future.value(
                ByteData.sublistView(
                  File('$dir/Nunito-$weight.ttf').readAsBytesSync(),
                ),
              ),
      );
    }
    await loader.load();
  }
  await (FontLoader('MaterialIcons')
        ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf')))
      .load();
}

const _categories = [
  Category(id: 'food', name: '餐饮', kind: 'expense', color: '#f97316', icon: 'utensils'),
  Category(id: 'grocery', name: '买菜', kind: 'expense', color: '#22c55e', icon: 'shopping-basket'),
  Category(id: 'transport', name: '交通', kind: 'expense', color: '#3b82f6', icon: 'bus'),
  Category(id: 'shopping', name: '购物', kind: 'expense', color: '#ec4899', icon: 'shopping-bag'),
  Category(id: 'home', name: '居家', kind: 'expense', color: '#14b8a6', icon: 'house'),
  Category(id: 'fun', name: '娱乐', kind: 'expense', color: '#a855f7', icon: 'clapperboard'),
  Category(id: 'health', name: '医疗', kind: 'expense', color: '#ef4444', icon: 'heart-pulse'),
  Category(id: 'edu', name: '学习', kind: 'expense', color: '#6366f1', icon: 'book-open'),
  Category(id: 'digital', name: '数码', kind: 'expense', color: '#64748b', icon: 'laptop'),
  Category(id: 'salary', name: '工资', kind: 'income', color: '#16a34a', icon: 'briefcase'),
];

void main() {
  testWidgets('render the main screens', (tester) async {
    await _loadFonts();
    await initializeDateFormatting();
    applyLanguage(AppLanguage.zh);
    const size = Size(360, 800);
    final hour = int.parse(Platform.environment['ZOWL_PREVIEW_HOUR'] ?? '10');
    final now = DateTime.now();
    debugStoryClock = () => DateTime(now.year, now.month, now.day, hour);
    addTearDown(() => debugStoryClock = null);
    await tester.binding.setSurfaceSize(size);
    addTearDown(() => tester.binding.setSurfaceSize(null));
    tester.view.padding = FakeViewPadding(
      top: 36 * tester.view.devicePixelRatio,
      bottom: 16 * tester.view.devicePixelRatio,
    );
    tester.view.viewPadding = tester.view.padding;
    addTearDown(tester.view.reset);

    final harness = await MobileTestHarness.create();
    await harness.preferences.setString('zowl-language', 'zh');
    final today = DateTime(now.year, now.month, now.day);
    TransactionItem tx(
      String id,
      String name,
      String categoryId,
      int minor,
      int daysAgo,
      int hour,
      int minute, {
      String type = 'expense',
      String pay = '支付宝',
    }) {
      final category = _categories.firstWhere((c) => c.id == categoryId);
      return TransactionItem(
        id: id,
        type: type,
        amountMinor: minor,
        currency: 'CNY',
        merchantName: name,
        categoryId: category.id,
        categoryName: category.name,
        categoryColor: category.color,
        paymentMethod: pay,
        transactionTime: today
            .subtract(Duration(days: daysAgo))
            .add(Duration(hours: hour, minutes: minute))
            .toIso8601String(),
        source: 'manual',
        description: '午餐套餐',
        currentRevisionId: 'r1',
        revisionNumber: 1,
      );
    }

    final items = [
      tx('1', '山岚咖啡', 'food', 3200, 0, 9, 12),
      tx('2', '地铁', 'transport', 600, 0, 8, 31, pay: '微信'),
      tx('3', '朴朴超市', 'grocery', 8640, 1, 20, 5),
      tx('4', '万达影城', 'fun', 9600, 1, 19, 40, pay: '微信'),
      tx('5', '十一月工资', 'salary', 1280000, 2, 10, 0, type: 'income', pay: '招商银行'),
      tx('6', '淘宝 · 棉麻四件套与收纳箱', 'home', 25900, 2, 22, 18),
      tx('7', '兰州拉面', 'food', 2600, 3, 12, 22, pay: '微信'),
      tx('8', '中信书店', 'edu', 12800, 3, 16, 3),
    ];
    harness.repository.transactionValue = items.first;
    harness.repository.categoryItems = _categories;
    harness.repository.transactionPage = TransactionPage(
      items: items,
      pagination: const Pagination(page: 1, limit: 20, total: 8, totalPages: 1),
    );
    harness.repository.user = const SessionUser(
      id: 'user-1',
      email: 'demo@example.com',
      displayName: 'Ze',
      avatarPreset: 'sprout',
      timezone: 'Asia/Shanghai',
    );
    const daily = [
      4200, 1800, 9600, 2400, 0, 15800, 3200, 2600, 7400, 1200, 5600, 3800, //
      4280, 0, 6100, 2300, 8800, 3100, 1900, 15200, 4100, 18240, 3800, //
    ];
    final month = monthKey0(now);
    harness.repository.statisticsValue = StatisticsOverview(
      month: month,
      currency: 'CNY',
      summary: const FlowSummary(
        grossExpenseMinor: 618800,
        refundMinor: 0,
        netExpenseMinor: 618800,
        incomeMinor: 1280000,
        transferMinor: 0,
        balanceMinor: 661200,
        expenseCount: 38,
        refundCount: 0,
        incomeCount: 1,
        transferCount: 0,
        transactionCount: 39,
      ),
      categoryDistribution: const [
        DistributionItem(name: '餐饮', color: '#f97316', icon: 'utensils', amountMinor: 216000, transactionCount: 18, sharePercent: 34.9),
        DistributionItem(name: '购物', color: '#ec4899', icon: 'shopping-bag', amountMinor: 148000, transactionCount: 6, sharePercent: 23.9),
        DistributionItem(name: '买菜', color: '#22c55e', icon: 'shopping-basket', amountMinor: 102000, transactionCount: 7, sharePercent: 16.5),
        DistributionItem(name: '交通', color: '#3b82f6', icon: 'bus', amountMinor: 62800, transactionCount: 12, sharePercent: 10.1),
        DistributionItem(name: '娱乐', color: '#a855f7', icon: 'clapperboard', amountMinor: 52000, transactionCount: 3, sharePercent: 8.4),
        DistributionItem(name: '学习', color: '#6366f1', icon: 'book-open', amountMinor: 38000, transactionCount: 2, sharePercent: 6.2),
      ],
      sourceDistribution: const [
        DistributionItem(source: 'alipay', amountMinor: 380000, transactionCount: 22, sharePercent: 61.4),
        DistributionItem(source: 'wechat', amountMinor: 160000, transactionCount: 11, sharePercent: 25.9),
        DistributionItem(source: 'manual', amountMinor: 78800, transactionCount: 5, sharePercent: 12.7),
      ],
      recentTransactions: items,
      dailyTrend: [
        for (var day = 1; day <= DateTime(now.year, now.month + 1, 0).day; day++)
          TrendPoint(
            label: '$day',
            date: '$month-${day.toString().padLeft(2, '0')}',
            netExpenseMinor: day <= now.day
                ? daily[(day - 1) % daily.length] * 10
                : 0,
            incomeMinor: day == 10 ? 1280000 : 0,
          ),
      ],
      monthlyTrend: [
        for (final (index, value)
            in [520000, 610000, 480000, 702000, 655000, 618800].indexed)
          TrendPoint(
            label: '$index',
            month: monthKey0(DateTime(now.year, now.month - 5 + index)),
            netExpenseMinor: value,
            incomeMinor: 1280000,
          ),
      ],
      peakSpendingDay: PeakSpendingDay(
        date: '$month-22',
        netExpenseMinor: 182400,
        expenseCount: 3,
      ),
    );
    NotificationCaptureItem capture(
      String id,
      String platform,
      int minor,
      String? merchant, {
      String status = 'unique',
    }) => NotificationCaptureItem(
      id: id,
      platform: platform,
      captureMethod: 'payment_page',
      notificationPostedAt: today.add(const Duration(hours: 9)).toIso8601String(),
      amountMinor: minor,
      currency: 'CNY',
      transactionTime: today.add(const Duration(hours: 9)).toIso8601String(),
      confidenceBasisPoints: 9500,
      merchantName: merchant,
      categoryId: 'food',
      paymentMethod: platform == 'wechat' ? '微信' : '支付宝',
      duplicateStatus: status,
      duplicateAssessmentDigest: 'a',
      status: 'reviewing',
    );
    harness.repository.notificationCapturePage = NotificationCapturePage(
      items: [
        capture('c1', 'alipay', 3200, '山岚咖啡'),
        capture('c2', 'wechat', 1880, null),
        capture('c3', 'taobao', 12900, '棉麻生活馆', status: 'possible_duplicate'),
      ],
      pagination: const Pagination(page: 1, limit: 20, total: 3, totalPages: 1),
      pendingCount: 3,
    );

    final boundaryKey = GlobalKey();
    final container = ProviderContainer(
      overrides: harness.overrides,
      retry: (_, _) => null,
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      RepaintBoundary(
        key: boundaryKey,
        child: UncontrolledProviderScope(
          container: container,
          child: const ZeMoneyApp(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final out = Directory(
      Platform.environment['ZOWL_PREVIEW_OUT'] ?? '/tmp/zowl-preview',
    )..createSync(recursive: true);
    Future<void> settle() async {
      // Decode the backdrops for real, then draw them.
      await tester.runAsync(() async {
        for (final element in find.byType(Image).evaluate()) {
          await precacheImage((element.widget as Image).image, element);
        }
      });
      await tester.pumpAndSettle();
    }

    Future<void> capture2(String name) async {
      await settle();
      final error = tester.takeException();
      if (error != null) debugPrint('$name: $error');
      await tester.runAsync(() async {
        final boundary =
            boundaryKey.currentContext!.findRenderObject()!
                as RenderRepaintBoundary;
        final image = await boundary.toImage(pixelRatio: 2);
        final data = await image.toByteData(format: ui.ImageByteFormat.png);
        File(
          '${out.path}/$name.png',
        ).writeAsBytesSync(data!.buffer.asUint8List());
        image.dispose();
      });
    }

    final router = container.read(routerProvider);
    for (final brightness in Brightness.values.reversed) {
      tester.platformDispatcher.platformBrightnessTestValue = brightness;
      await tester.pumpAndSettle();
      final mode = brightness.name;
      for (final (name, route) in [
        ('home', '/'),
        ('activity', '/transactions'),
        ('insights', '/statistics'),
        ('me', '/settings'),
      ]) {
        router.go(route);
        await tester.pumpAndSettle();
        await capture2('${name}_$mode');
        if (name == 'home' || name == 'insights') {
          await tester.drag(
            find.byType(Scrollable).last,
            const Offset(0, -420),
            warnIfMissed: false,
          );
          await tester.pumpAndSettle();
          await capture2('${name}2_$mode');
        }
      }
      router.go('/');
      await tester.pumpAndSettle();
      await tester.tap(find.bySemanticsLabel('记一笔').first);
      await tester.pumpAndSettle();
      await capture2('add_$mode');
      router.pop();
      await tester.pumpAndSettle();
      for (final (name, route) in [
        ('detail', '/transactions/1'),
        ('form', '/transactions/new'),
        ('inbox', '/imports/notifications'),
        ('imports', '/imports'),
      ]) {
        router.push(route);
        await tester.pumpAndSettle();
        await capture2('${name}_$mode');
        router.pop();
        await tester.pumpAndSettle();
      }
    }
    tester.platformDispatcher.platformBrightnessTestValue = Brightness.light;
    await tester.pumpAndSettle();
    await container.read(authControllerProvider.notifier).logout();
    await tester.pumpAndSettle();
    await capture2('login_light');
    tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
    await capture2('login_dark');
    tester.platformDispatcher.clearPlatformBrightnessTestValue();
  });
}

String monthKey0(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}';
