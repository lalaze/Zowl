import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:zemoney_mobile/core/api.dart';
import 'package:zemoney_mobile/core/l10n.dart';
import 'package:zemoney_mobile/core/models.dart';
import 'package:zemoney_mobile/features/transactions/transaction_form_screen.dart';

import 'support/fixtures.dart';
import 'support/test_harness.dart';

Finder get _amount => find.byType(TextFormField).first;
Finder _field(String label) => find.widgetWithText(TextFormField, label);

/// Recent-merchant templates can push lower fields out of the lazy list.
Future<void> _reveal(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pump();
}

Future<void> _settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 500));
}

(Widget, GoRouter) _app(MobileTestHarness harness, {TransactionItem? initial}) {
  final router = GoRouter(
    initialLocation: '/form',
    routes: [
      GoRoute(
        path: '/form',
        builder: (_, _) => TransactionFormScreen(initial: initial),
      ),
      GoRoute(
        path: '/transactions/:id',
        builder: (_, state) =>
            Scaffold(body: Text('DETAIL ${state.pathParameters['id']}')),
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

TransactionItem _withRevision(String? revision) => TransactionItem(
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
  currentRevisionId: revision,
  revisionNumber: testTransaction.revisionNumber,
);

void main() {
  testWidgets(
    'post and continue clears the amount and rotates submission identity',
    (tester) async {
      final harness = await MobileTestHarness.create();
      final (widget, router) = _app(harness);
      addTearDown(router.dispose);
      await tester.pumpWidget(widget);
      await _settle(tester);
      await tester.enterText(_amount, '21.60');
      await tester.tap(find.text('Keep open to post another'));
      await tester.tap(find.text('Confirm and post'));
      await tester.pumpAndSettle();
      expect(
        find.text('Transaction posted. Ready for the next one'),
        findsOneWidget,
      );
      expect(tester.widget<TextFormField>(_amount).controller!.text, isEmpty);
      await tester.enterText(_amount, '31.60');
      await tester.tap(find.text('Confirm and post'));
      await tester.pumpAndSettle();
      expect(harness.repository.createInputs, hasLength(2));
      expect(
        harness.repository.createInputs[0]['confirmation']['id'],
        isNot(harness.repository.createInputs[1]['confirmation']['id']),
      );
      expect(router.routeInformationProvider.value.uri.path, '/form');
    },
  );

  testWidgets('manual entry validates exact money and currency input', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    final (widget, router) = _app(harness);
    addTearDown(router.dispose);
    await tester.pumpWidget(widget);
    await _settle(tester);

    await tester.enterText(_amount, '1.234');
    await tester.tap(find.text('CNY'));
    await _settle(tester);
    await tester.enterText(_field('Currency'), 'CN');
    await tester.tap(find.text('Apply'));
    await tester.pump();
    expect(find.text('Three-letter code'), findsOneWidget);
    Navigator.of(tester.element(find.text('Apply'))).pop();
    await _settle(tester);

    await tester.ensureVisible(find.text('Confirm and post'));
    await _settle(tester);
    await tester.tap(find.text('Confirm and post'));
    await tester.pump();

    expect(find.text('Up to two decimal places'), findsOneWidget);
    expect(harness.repository.createInputs, isEmpty);
  });

  testWidgets(
    'manual entry posts normalized facts and navigates to the ledger item',
    (tester) async {
      final harness = await MobileTestHarness.create();
      final (widget, router) = _app(harness);
      addTearDown(router.dispose);
      await tester.pumpWidget(widget);
      await _settle(tester);

      await tester.enterText(_amount, '12.80');
      await _reveal(tester, _field('Merchant name (optional)'));
      await tester.enterText(
        _field('Merchant name (optional)'),
        ' Mountain Cafe ',
      );
      // Let the field scroll its caret into view first.
      await _settle(tester);
      await _reveal(tester, find.text('More details'));
      await _settle(tester);
      await tester.tap(find.text('More details'));
      await _settle(tester);
      await tester.enterText(_field('Payment method'), 'Alipay');
      await tester.enterText(
        _field('Transaction description'),
        'Afternoon tea',
      );
      await tester.ensureVisible(find.text('Confirm and post'));
      await _settle(tester);
      await tester.tap(find.text('Confirm and post'));
      await _settle(tester);

      final input = harness.repository.createInputs.single;
      expect(input['type'], 'expense');
      expect(input['amount'], '12.80');
      expect(input['currency'], 'CNY');
      expect(input['merchantName'], 'Mountain Cafe');
      expect(input['paymentMethod'], 'Alipay');
      expect(input['description'], 'Afternoon tea');
      expect((input['confirmation'] as Map)['version'], 1);
      expect(find.text('DETAIL tx-created'), findsOneWidget);
    },
  );

  testWidgets('category choices follow the selected transaction direction', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    final (widget, router) = _app(harness);
    addTearDown(router.dispose);
    await tester.pumpWidget(widget);
    await _settle(tester);

    final food = find.text('Food');
    await tester.ensureVisible(food);
    await _settle(tester);
    expect(find.text('Uncategorized'), findsOneWidget);
    expect(find.text('Salary'), findsNothing);
    await tester.tap(food);
    await _settle(tester);
    // The grid tile and the category summary both show the choice.
    expect(find.text('Food'), findsNWidgets(2));
    expect(find.text('Uncategorized'), findsNothing);

    // The list builds lazily, so scroll back up to the type control.
    await tester.scrollUntilVisible(
      find.text('Income'),
      -200,
      scrollable: find.byType(Scrollable).first,
    );
    await _settle(tester);
    await tester.tap(find.text('Income'));
    await _settle(tester);
    await tester.scrollUntilVisible(
      find.text('Salary'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Uncategorized'), findsOneWidget);
    expect(find.text('Salary'), findsOneWidget);
    expect(find.text('Food'), findsNothing);
  });

  testWidgets('a long amount gets smaller type so all of it shows', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(360, 800));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final harness = await MobileTestHarness.create();
    final (widget, router) = _app(harness);
    addTearDown(router.dispose);
    await tester.pumpWidget(widget);
    await _settle(tester);

    double size() => tester
        .widget<EditableText>(
          find.descendant(of: _amount, matching: find.byType(EditableText)),
        )
        .style
        .fontSize!;
    await tester.enterText(_amount, '32.00');
    await _settle(tester);
    final short = size();
    await tester.enterText(_amount, '123456.78');
    await _settle(tester);
    expect(size(), lessThan(short));
    expect(tester.takeException(), isNull);
  });

  testWidgets('categories beyond the quick grid open the full picker', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    harness.repository.categoryItems = [
      for (var index = 1; index <= 9; index++)
        Category(id: 'c$index', name: 'Category $index', kind: 'expense'),
    ];
    final (widget, router) = _app(harness);
    addTearDown(router.dispose);
    await tester.pumpWidget(widget);
    await _settle(tester);

    expect(find.text('Category 9'), findsNothing);
    await tester.ensureVisible(find.text('All categories'));
    await _settle(tester);
    await tester.tap(find.text('All categories'));
    await _settle(tester);
    expect(find.text('Choose category'), findsOneWidget);
    await tester.ensureVisible(find.text('Category 9'));
    await _settle(tester);
    await tester.tap(find.text('Category 9'));
    await _settle(tester);

    // The chosen category joins the grid and the summary.
    expect(find.text('Choose category'), findsNothing);
    expect(find.text('Category 9'), findsNWidgets(2));
  });

  testWidgets('successful creation without a transaction id remains visible', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    harness.repository.createHandler = (_) async => {};
    final (widget, router) = _app(harness);
    addTearDown(router.dispose);
    await tester.pumpWidget(widget);
    await _settle(tester);

    await tester.enterText(_amount, '9.90');
    await tester.tap(find.text('Confirm and post'));
    await _settle(tester);
    await tester.drag(find.byType(CustomScrollView), const Offset(0, -900));
    await _settle(tester);

    expect(
      find.text('Posting succeeded but no transaction ID was returned'),
      findsOneWidget,
    );
    expect(find.textContaining('DETAIL'), findsNothing);
  });

  testWidgets('possible duplicates require an explicit digest-bound override', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    harness.repository.createHandler = (input) async {
      if (!input.containsKey('duplicateOverride')) {
        throw const ApiException(
          statusCode: 409,
          code: 'NEEDS_REVIEW',
          message: 'Confirm duplicate transactions',
          data: {
            'status': 'needs_review',
            'assessmentDigest': 'digest-1',
            'assessment': {
              'reasonCode': 'exact_fingerprint',
              'matchedTransactionId': 'tx-1',
            },
          },
        );
      }
      return {'id': 'tx-created'};
    };
    final (widget, router) = _app(harness);
    addTearDown(router.dispose);
    await tester.pumpWidget(widget);
    await _settle(tester);
    await tester.enterText(_amount, '35.80');
    await _reveal(tester, _field('Merchant name (optional)'));
    await tester.enterText(_field('Merchant name (optional)'), 'Mountain Cafe');

    await tester.tap(find.text('Confirm and post'));
    await _settle(tester);
    expect(find.text('This transaction may be a duplicate'), findsOneWidget);
    expect(find.textContaining('identical transaction facts'), findsOneWidget);
    expect(find.textContaining('Mountain Cafe'), findsWidgets);
    await tester.tap(find.text('Go back and edit'));
    await _settle(tester);
    expect(harness.repository.createInputs, hasLength(1));

    await tester.tap(find.text('Confirm and post'));
    await _settle(tester);
    await tester.tap(find.text('Post anyway'));
    await _settle(tester);

    expect(harness.repository.createInputs, hasLength(3));
    final firstId =
        (harness.repository.createInputs.first['confirmation'] as Map)['id'];
    final last = harness.repository.createInputs.last;
    expect((last['confirmation'] as Map)['id'], firstId);
    expect((last['duplicateOverride'] as Map)['assessmentDigest'], 'digest-1');
    expect(find.text('DETAIL tx-created'), findsOneWidget);
  });

  testWidgets(
    'revision conflicts preserve the draft and require the latest version',
    (tester) async {
      final harness = await MobileTestHarness.create();
      harness.repository.transactionValue = _withRevision('revision-2');
      harness.repository.amendHandler = (_, _) async {
        if (harness.repository.amendInputs.length == 1) {
          throw const ApiException(
            statusCode: 409,
            code: 'REVISION_CONFLICT',
            message: 'Revision conflict',
            data: {'status': 'revision_conflict'},
          );
        }
        return {'id': 'tx-1'};
      };
      final (widget, router) = _app(harness, initial: testTransaction);
      addTearDown(router.dispose);
      await tester.pumpWidget(widget);
      await _settle(tester);
      await tester.enterText(_amount, '36.80');

      await tester.tap(find.text('Save amendment'));
      await _settle(tester);
      expect(find.text('Transaction changed elsewhere'), findsOneWidget);
      await tester.tap(find.text('Review again'));
      await _settle(tester);
      expect(tester.widget<TextFormField>(_amount).controller?.text, '36.80');

      await tester.tap(find.text('Save amendment'));
      await _settle(tester);
      expect(harness.repository.amendInputs, hasLength(2));
      expect(
        harness.repository.amendInputs.last['expectedRevisionId'],
        'revision-2',
      );
      expect(find.text('DETAIL tx-1'), findsOneWidget);
    },
  );

  testWidgets(
    'amendment refuses to overwrite a transaction without a revision',
    (tester) async {
      final harness = await MobileTestHarness.create();
      final (widget, router) = _app(harness, initial: _withRevision(null));
      addTearDown(router.dispose);
      await tester.pumpWidget(widget);
      await _settle(tester);

      await tester.tap(find.text('Save amendment'));
      await tester.pump();
      await tester.drag(find.byType(CustomScrollView), const Offset(0, -900));
      await _settle(tester);

      expect(
        find.text('Missing transaction revision. Cannot safely amend'),
        findsOneWidget,
      );
      expect(harness.repository.amendInputs, isEmpty);
    },
  );

  testWidgets('new entry focuses the amount only after the page settles', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    final router = GoRouter(
      routes: [
        GoRoute(
          path: '/',
          builder: (context, _) => Scaffold(
            body: TextButton(
              onPressed: () => context.push('/form'),
              child: const Text('OPEN'),
            ),
          ),
        ),
        GoRoute(
          path: '/form',
          builder: (_, _) => const TransactionFormScreen(),
        ),
      ],
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: harness.overrides,
        retry: (_, _) => null,
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();

    bool amountFocused() => tester
        .widget<EditableText>(
          find.descendant(of: _amount, matching: find.byType(EditableText)),
        )
        .focusNode
        .hasFocus;

    await tester.tap(find.text('OPEN'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 60));
    expect(_amount, findsOneWidget);
    expect(amountFocused(), isFalse);

    await tester.pumpAndSettle();
    expect(amountFocused(), isTrue);
  });

  testWidgets('manual entry, validation and duplicate review read in Chinese', (
    tester,
  ) async {
    applyLanguage(AppLanguage.zh);
    addTearDown(() => applyLanguage(AppLanguage.en));
    final harness = await MobileTestHarness.create();
    harness.repository.createHandler = (input) async {
      if (!input.containsKey('duplicateOverride')) {
        throw const ApiException(
          statusCode: 409,
          code: 'NEEDS_REVIEW',
          message: 'Confirm duplicate transactions',
          data: {
            'status': 'needs_review',
            'assessmentDigest': 'digest-1',
            'assessment': {
              'reasonCode': 'exact_fingerprint',
              'matchedTransactionId': 'tx-1',
            },
          },
        );
      }
      return {'id': 'tx-created'};
    };
    final (widget, router) = _app(harness);
    addTearDown(router.dispose);
    await tester.pumpWidget(widget);
    await _settle(tester);

    expect(find.text('记一笔'), findsOneWidget);
    for (final type in ['支出', '收入', '退款', '转账']) {
      expect(find.text(type), findsOneWidget, reason: type);
    }
    expect(find.text('分类'), findsOneWidget);
    expect(find.text('未分类'), findsOneWidget);
    expect(find.text('入账后继续记下一笔'), findsOneWidget);

    await tester.enterText(_amount, '1.234');
    await tester.tap(find.text('CNY'));
    await _settle(tester);
    await tester.enterText(_field('币种'), 'CN');
    await tester.tap(find.text('应用'));
    await tester.pump();
    expect(find.text('请输入三位字母代码'), findsOneWidget);
    await tester.enterText(_field('币种'), 'CNY');
    await tester.tap(find.text('应用'));
    await _settle(tester);

    await tester.ensureVisible(find.text('确认入账'));
    await _settle(tester);
    await tester.tap(find.text('确认入账'));
    await tester.pump();
    expect(find.text('最多两位小数'), findsOneWidget);

    await tester.enterText(_amount, '35.80');
    await _reveal(tester, _field('商户名称（选填）'));
    expect(find.text('交易时间'), findsOneWidget);
    expect(find.text('更多信息'), findsOneWidget);
    await tester.enterText(_field('商户名称（选填）'), 'Mountain Cafe');
    await tester.tap(find.text('确认入账'));
    await _settle(tester);
    expect(find.text('这笔交易可能重复'), findsOneWidget);
    expect(find.textContaining('已有一笔信息完全相同的交易。'), findsOneWidget);
    expect(find.textContaining('匹配的交易：Mountain Cafe'), findsOneWidget);
    expect(find.textContaining('仍要入账吗？'), findsOneWidget);
    await tester.tap(find.text('仍然入账'));
    await _settle(tester);
    expect(find.text('DETAIL tx-created'), findsOneWidget);
  });

  testWidgets(
    'currency picker applies common and custom codes without disposing its controller early',
    (tester) async {
      final harness = await MobileTestHarness.create();
      final (widget, router) = _app(harness);
      addTearDown(router.dispose);
      addTearDown(tester.view.resetViewInsets);
      await tester.pumpWidget(widget);
      await _settle(tester);

      // Pick a preset currency chip.
      await tester.tap(find.text('CNY'));
      await _settle(tester);
      await tester.tap(find.widgetWithText(ChoiceChip, 'USD'));
      await tester.pumpAndSettle();
      expect(find.text('USD'), findsOneWidget);

      // Enter a custom lowercase currency code while keyboard insets are open,
      // then close the keyboard during sheet dismissal to catch premature disposal.
      await tester.tap(find.text('USD'));
      await _settle(tester);
      tester.view.viewInsets = const FakeViewPadding(bottom: 300);
      await tester.pump();
      await tester.enterText(_field('Currency'), 'gbp');
      await tester.tap(find.text('Apply'));
      await tester.pump(const Duration(milliseconds: 50));
      tester.view.resetViewInsets();
      await tester.pump(const Duration(milliseconds: 220));
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.text('GBP'), findsOneWidget);

      await tester.enterText(_amount, '42.00');
      await tester.ensureVisible(find.text('Confirm and post'));
      await _settle(tester);
      await tester.tap(find.text('Confirm and post'));
      await _settle(tester);
      expect(harness.repository.createInputs.single['currency'], 'GBP');
    },
  );
}
