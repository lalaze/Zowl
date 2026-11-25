import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:zemoney_mobile/core/api.dart';
import 'package:zemoney_mobile/core/l10n.dart';
import 'package:zemoney_mobile/core/models.dart';
import 'package:zemoney_mobile/features/imports/receipt_review_screen.dart';

import 'support/fixtures.dart';
import 'support/test_harness.dart';

(Widget, GoRouter) _app(MobileTestHarness harness) {
  final router = GoRouter(
    initialLocation: '/imports/screenshots/job-1',
    routes: [
      GoRoute(
        path: '/imports/screenshots/:jobId',
        builder: (_, state) =>
            ReceiptReviewScreen(jobId: state.pathParameters['jobId']!),
      ),
      GoRoute(
        path: '/transactions',
        builder: (_, _) => const Scaffold(body: Text('TRANSACTIONS')),
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

RecognitionItem _item({
  String id = 'item-1',
  int? amountMinor = 3580,
  String? type = 'expense',
  String? transactionTime = '2026-07-18T04:30:00.000Z',
  String? currency = 'CNY',
  String? duplicateKind,
  List<dynamic> warnings = const [],
  List<dynamic> validationErrors = const [],
  String? decision,
}) => RecognitionItem(
  id: id,
  fileId: 'file-$id',
  fileName: '$id.png',
  previewUrl: '',
  status: 'recognized',
  amountMinor: amountMinor,
  amount: amountMinor == null ? null : (amountMinor / 100).toStringAsFixed(2),
  type: type,
  transactionTime: transactionTime,
  currency: currency,
  merchantName: 'Mountain Cafe',
  duplicateKind: duplicateKind,
  warnings: warnings,
  validationErrors: validationErrors,
  decision: decision,
);

RecognitionReview _review(List<RecognitionItem> items) => RecognitionReview(
  job: RecognitionJob(
    id: 'job-1',
    status: 'reviewing',
    createdAt: '2026-07-18T04:30:00.000Z',
    totalCount: items.length,
  ),
  items: items,
);

Future<void> _settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 500));
}

void main() {
  testWidgets(
    'review distinguishes incomplete, warning, and possible duplicate items',
    (tester) async {
      final harness = await MobileTestHarness.create();
      harness.repository.review = _review([
        _item(
          id: 'incomplete',
          amountMinor: null,
          warnings: const ['Please confirm manually'],
          validationErrors: const [
            {'field': 'amountMinor', 'message': 'Enter an amount'},
          ],
        ),
        _item(id: 'duplicate', duplicateKind: 'possible_duplicate'),
      ]);
      final (widget, router) = _app(harness);
      addTearDown(router.dispose);
      await tester.pumpWidget(widget);
      await tester.pumpAndSettle();

      expect(find.text('Original image deleted'), findsOneWidget);
      expect(find.text('Please confirm manually'), findsOneWidget);
      expect(find.text('Required fields are incomplete'), findsOneWidget);
      expect(find.text('Edit fields'), findsOneWidget);
      expect(find.text('Skip'), findsOneWidget);

      await tester.scrollUntilVisible(
        find.text('Post anyway'),
        400,
        scrollable: find.byType(Scrollable).first,
      );
      await _settle(tester);
      expect(
        find.text('May duplicate an existing transaction. Choose an action'),
        findsOneWidget,
      );
      expect(find.text('Post anyway'), findsOneWidget);
      await tester.tap(find.text('Post anyway'));
      await _settle(tester);
      expect(harness.repository.recognitionInputs.last, {
        'decision': 'import_anyway',
      });
    },
  );

  testWidgets('review decisions are sent through the item command interface', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    harness.repository.review = _review([_item(id: 'unique')]);
    final (widget, router) = _app(harness);
    addTearDown(router.dispose);
    await tester.pumpWidget(widget);
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('Select for posting'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Select for posting'));
    await _settle(tester);
    expect(harness.repository.recognitionInputs.first, {'decision': 'import'});

    await tester.ensureVisible(find.text('Skip'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Skip'));
    await _settle(tester);
    expect(harness.repository.recognitionInputs.last, {'decision': 'skip'});
  });

  testWidgets(
    'receipt editing validates and resubmits normalized ledger fields',
    (tester) async {
      final harness = await MobileTestHarness.create();
      harness.repository.review = _review([_item(amountMinor: null)]);
      final (widget, router) = _app(harness);
      addTearDown(router.dispose);
      await tester.pumpWidget(widget);
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.text('Edit fields'));
      await _settle(tester);
      await tester.tap(find.text('Edit fields'));
      await _settle(tester);
      expect(find.text('Edit transaction'), findsOneWidget);
      expect(find.text('item-1.png'), findsOneWidget);
      await tester.drag(
        find.byType(SingleChildScrollView),
        const Offset(0, -700),
      );
      await _settle(tester);
      await tester.tap(find.text('Save and recheck'));
      await _settle(tester);
      expect(
        find.text('Enter a valid amount and three-letter currency code'),
        findsOneWidget,
      );

      await tester.drag(
        find.byType(SingleChildScrollView),
        const Offset(0, 700),
      );
      await _settle(tester);
      await tester.enterText(find.widgetWithText(TextField, 'Amount'), '18.60');
      await tester.enterText(
        find.widgetWithText(TextField, 'Merchant'),
        ' New merchant ',
      );
      await tester.drag(
        find.byType(SingleChildScrollView),
        const Offset(0, -700),
      );
      await _settle(tester);
      await tester.tap(find.text('Save and recheck'));
      await _settle(tester);

      final input = harness.repository.recognitionInputs.single;
      expect(input['amountMinor'], 1860);
      expect(input['currency'], 'CNY');
      expect(input['merchantName'], 'New merchant');
      expect(input['type'], 'expense');
      expect(find.text('Edit transaction'), findsNothing);
    },
  );

  testWidgets(
    'confirming review reports the outcome and returns to transactions',
    (tester) async {
      final harness = await MobileTestHarness.create();
      final (widget, router) = _app(harness);
      addTearDown(router.dispose);
      await tester.pumpWidget(widget);
      await tester.pumpAndSettle();

      await tester.tap(find.text('Post selected transactions'));
      await _settle(tester);
      expect(
        find.text('1 screenshot transactions added to the ledger'),
        findsOneWidget,
      );
      expect(find.text('Skip 0 items; failed: 0 items.'), findsOneWidget);
      await tester.tap(find.text('Done'));
      await _settle(tester);
      expect(find.text('TRANSACTIONS'), findsOneWidget);
    },
  );

  testWidgets('confirmation failures stay visible and reload review facts', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    var reviewReads = 0;
    harness.repository.reviewHandler = (_) async {
      reviewReads++;
      return testRecognitionReview;
    };
    harness.repository.confirmRecognitionHandler = (_) async =>
        throw const ApiException(
          statusCode: 409,
          code: 'NEEDS_REVIEW',
          message: 'Some transactions still need review',
        );
    final (widget, router) = _app(harness);
    addTearDown(router.dispose);
    await tester.pumpWidget(widget);
    await tester.pumpAndSettle();

    await tester.tap(find.text('Post selected transactions'));
    await tester.pumpAndSettle();
    expect(find.text('Some transactions still need review'), findsOneWidget);
    expect(reviewReads, 2);
    expect(find.text('Post selected transactions'), findsOneWidget);
  });

  testWidgets(
    'completed recognition jobs become a read-only completion state',
    (tester) async {
      final harness = await MobileTestHarness.create();
      harness.repository.review = const RecognitionReview(
        job: RecognitionJob(
          id: 'job-1',
          status: 'completed',
          createdAt: '2026-07-18T04:30:00.000Z',
          totalCount: 2,
          importedCount: 1,
          skippedCount: 1,
        ),
        items: [],
      );
      final (widget, router) = _app(harness);
      addTearDown(router.dispose);
      await tester.pumpWidget(widget);
      await tester.pumpAndSettle();

      expect(find.text('Review complete'), findsOneWidget);
      expect(find.text('Posted 1 screenshot transaction'), findsOneWidget);
      expect(find.text('Post selected transactions'), findsNothing);
    },
  );

  testWidgets('review cards and the editor read naturally in Chinese', (
    tester,
  ) async {
    applyLanguage(AppLanguage.zh);
    addTearDown(() => applyLanguage(AppLanguage.en));
    final harness = await MobileTestHarness.create();
    harness.repository.review = _review([
      _item(
        id: 'incomplete',
        amountMinor: null,
        validationErrors: const [
          {'field': 'amountMinor', 'message': '请输入金额'},
        ],
      ),
      _item(id: 'duplicate', duplicateKind: 'possible_duplicate'),
    ]);
    final (widget, router) = _app(harness);
    addTearDown(router.dispose);
    await tester.pumpWidget(widget);
    await tester.pumpAndSettle();

    expect(find.text('核对截图交易'), findsOneWidget);
    expect(find.text('2 笔候选 · 补全必填字段后再处理重复项'), findsOneWidget);
    expect(find.text('原图已删除'), findsWidgets);
    expect(find.text('待填写'), findsOneWidget);
    expect(find.text('必填字段尚未补全'), findsOneWidget);
    expect(find.text('确认选中交易入账'), findsOneWidget);
    expect(find.text('1 笔疑似重复需先核对 · 选中的交易将一起入账'), findsOneWidget);

    await tester.ensureVisible(find.text('编辑字段').first);
    await _settle(tester);
    await tester.tap(find.text('编辑字段').first);
    await _settle(tester);
    expect(find.text('编辑交易'), findsOneWidget);
    expect(find.text('incomplete.png'), findsOneWidget);
    expect(find.widgetWithText(TextField, '金额'), findsOneWidget);
    expect(find.text('收支类型'), findsOneWidget);
    expect(find.text('支出'), findsOneWidget);
  });

  testWidgets(
    'receipt editor filters categories with server categoryKindSupportsTransaction rules',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final harness = await MobileTestHarness.create();
      const otherCategory = Category(
        id: 'other',
        name: 'Other',
        kind: 'both',
        color: '#64748b',
      );
      harness.repository.categoryItems = const [
        foodCategory,
        salaryCategory,
        otherCategory,
      ];
      harness.repository.review = _review([_item(type: 'expense')]);
      final (widget, router) = _app(harness);
      addTearDown(router.dispose);
      await tester.pumpWidget(widget);
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.text('Edit fields'));
      await _settle(tester);
      await tester.tap(find.text('Edit fields'));
      await _settle(tester);

      // Expense shows expense + both, not income.
      expect(find.widgetWithText(ChoiceChip, 'Food'), findsOneWidget);
      expect(find.widgetWithText(ChoiceChip, 'Other'), findsOneWidget);
      expect(find.widgetWithText(ChoiceChip, 'Salary'), findsNothing);

      // Select 'Other' (both): switching types must keep it selected.
      await tester.tap(find.widgetWithText(ChoiceChip, 'Other'));
      await _settle(tester);
      await tester.tap(find.text('Refund'));
      await _settle(tester);
      // Refund shows income + both, not expense.
      expect(find.widgetWithText(ChoiceChip, 'Salary'), findsOneWidget);
      expect(find.widgetWithText(ChoiceChip, 'Other'), findsOneWidget);
      expect(find.widgetWithText(ChoiceChip, 'Food'), findsNothing);
      expect(
        tester
            .widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'Other'))
            .selected,
        isTrue,
      );

      // Select Salary on refund, then switch to transfer: Salary must be cleared and hidden.
      await tester.tap(find.widgetWithText(ChoiceChip, 'Salary'));
      await _settle(tester);
      await tester.tap(find.text('Transfer'));
      await _settle(tester);
      expect(find.widgetWithText(ChoiceChip, 'Food'), findsOneWidget);
      expect(find.widgetWithText(ChoiceChip, 'Other'), findsOneWidget);
      expect(find.widgetWithText(ChoiceChip, 'Salary'), findsNothing);
      expect(
        tester
            .widget<ChoiceChip>(
              find.widgetWithText(ChoiceChip, 'Uncategorized'),
            )
            .selected,
        isTrue,
      );

      // Switch back to Refund, pick Salary, and save.
      await tester.tap(find.text('Refund'));
      await _settle(tester);
      await tester.tap(find.widgetWithText(ChoiceChip, 'Salary'));
      await _settle(tester);
      await tester.drag(
        find.byType(SingleChildScrollView),
        const Offset(0, -700),
      );
      await _settle(tester);
      await tester.tap(find.text('Save and recheck'));
      await _settle(tester);

      expect(harness.repository.recognitionInputs.last['type'], 'refund');
      expect(
        harness.repository.recognitionInputs.last['categoryId'],
        'salary',
      );
    },
  );
}
