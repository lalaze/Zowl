import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zemoney_mobile/core/formatters.dart';
import 'package:zemoney_mobile/core/l10n.dart';
import 'package:zemoney_mobile/core/models.dart';
import 'package:zemoney_mobile/core/providers.dart';
import 'package:zemoney_mobile/core/theme.dart';
import 'package:zemoney_mobile/features/common/brand_mark.dart';
import 'package:zemoney_mobile/features/common/widgets.dart';

const transaction = TransactionItem(
  id: 'tx-1',
  type: 'expense',
  amountMinor: 3580,
  amount: '35.80',
  currency: 'CNY',
  merchantName: 'Mountain Cafe',
  categoryId: 'food',
  categoryName: 'Food',
  categoryColor: '#f97316',
  paymentMethod: 'Alipay',
  transactionTime: '2026-07-18T04:30:00.000Z',
  source: 'manual',
);

const income = TransactionItem(
  id: 'tx-2',
  type: 'income',
  amountMinor: 1280000,
  currency: 'CNY',
  merchantName: 'Acme Ltd',
  categoryName: 'Salary',
  transactionTime: '2026-07-18T09:00:00.000Z',
  source: 'manual',
);

Widget showcase(Brightness brightness, {AccentColor accent = AccentColor.amber}) =>
    ProviderScope(
      overrides: [
        categoriesProvider.overrideWith(
          (ref) async => const [
            Category(
              id: 'food',
              name: 'Food',
              kind: 'expense',
              icon: 'Utensils',
              color: '#f97316',
            ),
          ],
        ),
      ],
      child: MaterialApp(
        theme: buildTheme(accent, brightness),
        home: Scaffold(
          body: SafeArea(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Brand(),
                const SizedBox(height: 16),
                const ZeCard(
                  child: Row(
                    children: [
                      Expanded(
                        child: ZeMetric(
                          label: 'Income',
                          value: '¥12,800.00',
                          dot: Colors.green,
                        ),
                      ),
                      SizedBox(width: 10),
                      Expanded(
                        child: ZeMetric(
                          label: 'Balance this month',
                          value: '¥10,400.00',
                          dot: Colors.grey,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                ZeSegmented<int>(
                  segments: const [(0, 'All'), (1, 'Expense'), (2, 'Income')],
                  selected: 0,
                  onChanged: (_) {},
                ),
                const SizedBox(height: 12),
                const ZeCard(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Column(
                    children: [
                      TransactionRow(item: transaction),
                      TransactionRow(item: income),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                const Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    ZeBadge(label: 'Screenshot'),
                    ZeBadge(label: 'Ready to post', tone: ZeTone.income),
                    ZeBadge(label: 'Possible duplicate', tone: ZeTone.warn),
                    ZeBadge(label: 'Disabled', tone: ZeTone.danger),
                  ],
                ),
                const SizedBox(height: 12),
                const ZeProgress(value: .81),
              ],
            ),
          ),
        ),
      ),
    );

void main() {
  testWidgets('core mobile components meet the 390px visual target', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(showcase(Brightness.light));
    await tester.pumpAndSettle();
    expect(find.text('Balance this month'), findsOneWidget);
    expect(find.text('Mountain Cafe'), findsOneWidget);
    expect(find.text('-¥35.80'), findsOneWidget);
    expect(find.text('+¥12,800.00'), findsOneWidget);
    expect(find.textContaining('Food · '), findsOneWidget);
    await expectLater(
      find.byType(Scaffold),
      matchesGoldenFile('goldens/components_light.png'),
    );
  });

  testWidgets('core components render in dark mode', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(showcase(Brightness.dark));
    await tester.pumpAndSettle();
    await expectLater(
      find.byType(Scaffold),
      matchesGoldenFile('goldens/components_dark.png'),
    );
  });

  testWidgets('every accent renders the components without errors', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    for (final accent in AccentColor.values) {
      for (final brightness in Brightness.values) {
        await tester.pumpWidget(showcase(brightness, accent: accent));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull, reason: accent.name);
      }
    }
  });

  testWidgets('a transaction row reads as one labelled button', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [categoriesProvider.overrideWith((ref) async => const [])],
        child: MaterialApp(
          theme: buildTheme(AccentColor.amber, Brightness.light),
          home: Scaffold(body: TransactionRow(item: transaction, onTap: () {})),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.bySemanticsLabel(RegExp(r'^Mountain Cafe, -¥35\.80, Food · ')),
      findsOneWidget,
    );
    semantics.dispose();
  });

  testWidgets('a row with recognised goods shows the goods and their shop', (
    tester,
  ) async {
    const bought = TransactionItem(
      id: 'tx-goods',
      type: 'expense',
      amountMinor: 1880,
      currency: 'CNY',
      merchantName: 'Harbor Home Store',
      description: 'Thick bin bags',
      categoryName: 'Shopping',
      paymentMethod: 'Taobao',
      transactionTime: '2026-07-18T04:30:00.000Z',
      source: 'taobao',
      orderDetails: OrderDetails(
        shopName: 'Harbor Home Store',
        items: [OrderItem(name: 'Thick bin bags')],
      ),
    );
    // The same payment before the server recognised any goods.
    const plain = TransactionItem(
      id: 'tx-plain',
      type: 'expense',
      amountMinor: 2990,
      currency: 'CNY',
      merchantName: 'Taobao payment page',
      description: 'Captured payment',
      categoryName: 'Shopping',
      paymentMethod: 'Taobao',
      transactionTime: '2026-07-18T04:30:00.000Z',
      source: 'taobao',
    );
    // Goods from an order page that named no shop.
    const noShop = TransactionItem(
      id: 'tx-no-shop',
      type: 'expense',
      amountMinor: 990,
      currency: 'CNY',
      description: 'Cat food',
      categoryName: 'Pets',
      paymentMethod: 'Pinduoduo',
      transactionTime: '2026-07-18T04:30:00.000Z',
      source: 'pinduoduo',
      orderDetails: OrderDetails(items: [OrderItem(name: 'Cat food')]),
    );
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [categoriesProvider.overrideWith((ref) async => const [])],
        child: MaterialApp(
          theme: buildTheme(AccentColor.amber, Brightness.light),
          home: const Scaffold(
            body: Column(
              children: [
                TransactionRow(item: bought),
                TransactionRow(item: plain),
                TransactionRow(item: noShop),
              ],
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final time = formatTime(bought.transactionTime);

    expect(find.text('Thick bin bags'), findsOneWidget);
    expect(find.text('Shopping · $time · Harbor Home Store'), findsOneWidget);
    expect(
      find.bySemanticsLabel(
        'Thick bin bags, -¥18.80, Shopping · $time · Harbor Home Store',
      ),
      findsOneWidget,
    );

    expect(find.text('Taobao payment page'), findsOneWidget);
    expect(find.text('Captured payment'), findsNothing);
    expect(find.text('Shopping · $time · Taobao'), findsOneWidget);
    expect(
      find.bySemanticsLabel(
        'Taobao payment page, -¥29.90, Shopping · $time · Taobao',
      ),
      findsOneWidget,
    );

    expect(find.text('Cat food'), findsOneWidget);
    expect(find.text('Pets · $time · Pinduoduo'), findsOneWidget);
    semantics.dispose();
  });

  testWidgets('the owl renders in every variant and the brand reads as Zowl', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    for (final brightness in Brightness.values) {
      await tester.pumpWidget(
        MaterialApp(
          theme: buildTheme(AccentColor.amber, brightness),
          home: const Scaffold(
            body: Column(
              children: [
                Brand(),
                OwlMark(size: 64),
                OwlMark(size: 64, variant: OwlVariant.monochrome),
              ],
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.bySemanticsLabel('Zowl'), findsOneWidget);
      final owls = tester.widgetList<CustomPaint>(
        find.descendant(of: find.byType(OwlMark), matching: find.byType(CustomPaint)),
      );
      final expected = brightness == Brightness.dark
          ? OwlVariant.onDark
          : OwlVariant.onLight;
      expect((owls.first.painter! as OwlPainter).variant, expected);
    }
    semantics.dispose();
  });

  testWidgets('shared widgets switch their copy to Chinese', (tester) async {
    applyLanguage(AppLanguage.zh);
    addTearDown(() => applyLanguage(AppLanguage.en));
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [categoriesProvider.overrideWith((ref) async => const [])],
        child: MaterialApp(
          theme: buildTheme(AccentColor.amber, Brightness.light),
          home: Scaffold(
            body: Column(
              children: [
                TransactionRow(
                  item: const TransactionItem(
                    id: 'tx-3',
                    type: 'expense',
                    amountMinor: 1200,
                    currency: 'CNY',
                    merchantName: 'Corner Shop',
                    transactionTime: '2026-07-18T04:30:00.000Z',
                    source: 'manual',
                  ),
                  onTap: () {},
                ),
                const OwlMark(size: 48),
                Expanded(
                  child: ErrorView(error: 'Offline', onRetry: () {}),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('未分类 · '), findsOneWidget);
    expect(
      find.bySemanticsLabel(RegExp(r'^Corner Shop，-¥12\.00，未分类 · ')),
      findsOneWidget,
    );
    expect(find.bySemanticsLabel('猫头鹰 Zowl'), findsOneWidget);
    expect(find.text('重试'), findsOneWidget);
    semantics.dispose();
  });
}
