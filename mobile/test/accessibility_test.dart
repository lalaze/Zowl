import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zowl_mobile/features/auth/login_screen.dart';
import 'package:zowl_mobile/features/home/home_screen.dart';
import 'package:zowl_mobile/features/imports/import_screen.dart';
import 'package:zowl_mobile/features/imports/receipt_review_screen.dart';
import 'package:zowl_mobile/features/settings/settings_screen.dart';
import 'package:zowl_mobile/features/statistics/statistics_screen.dart';
import 'package:zowl_mobile/features/transactions/transaction_detail_screen.dart';
import 'package:zowl_mobile/features/transactions/transaction_form_screen.dart';
import 'package:zowl_mobile/features/transactions/transaction_list_screen.dart';
import 'package:zowl_mobile/main.dart';

import 'support/test_harness.dart';

Future<MobileTestHarness> _pumpLarge(WidgetTester tester, Widget child) async {
  await tester.binding.setSurfaceSize(const Size(390, 844));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  final harness = await MobileTestHarness.create();
  await tester.pumpWidget(harness.screen(child, textScale: 2));
  await tester.pumpAndSettle();
  return harness;
}

void main() {
  final screens = <String, Widget Function()>{
    'login': LoginScreen.new,
    'home': HomeScreen.new,
    'transactions': TransactionListScreen.new,
    'import': ImportScreen.new,
    'statistics': StatisticsScreen.new,
    'settings': SettingsScreen.new,
    'transaction form': TransactionFormScreen.new,
    'transaction detail': () => const TransactionDetailScreen(id: 'tx-1'),
    'receipt review': () => const ReceiptReviewScreen(jobId: 'job-1'),
  };

  for (final entry in screens.entries) {
    testWidgets('${entry.key} has no overflow at 2.0x text', (tester) async {
      await _pumpLarge(tester, entry.value());
      expect(tester.takeException(), isNull, reason: entry.key);
    });
  }

  testWidgets('primary actions remain hit-testable at 2.0x text', (
    tester,
  ) async {
    await _pumpLarge(tester, const HomeScreen());
    await tester.scrollUntilVisible(
      find.text('See all'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(find.text('See all').hitTestable(), findsOneWidget);

    await _pumpLarge(tester, const ImportScreen());
    await tester.ensureVisible(find.text('Select screenshots to begin'));
    await tester.pumpAndSettle();
    expect(
      find.text('Select screenshots to begin').hitTestable(),
      findsOneWidget,
    );

    await _pumpLarge(tester, const TransactionFormScreen());
    expect(find.text('Confirm and post').hitTestable(), findsOneWidget);

    await _pumpLarge(tester, const ReceiptReviewScreen(jobId: 'job-1'));
    expect(
      find.text('Post selected transactions').hitTestable(),
      findsOneWidget,
    );
  });

  testWidgets('tab navigation and the add action expose button semantics at 2.0x text', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(() {
      tester.platformDispatcher.clearTextScaleFactorTestValue();
      tester.binding.setSurfaceSize(null);
    });
    final harness = await MobileTestHarness.create();
    final semantics = tester.ensureSemantics();

    await tester.pumpWidget(
      ProviderScope(
        overrides: harness.overrides,
        retry: (_, _) => null,
        child: const ZowlApp(),
      ),
    );
    await tester.pumpAndSettle();

    for (final label in [
      'Home',
      'Activity',
      'Add to ledger',
      'Insights',
      'Me',
    ]) {
      final node = find.bySemanticsLabel(label);
      expect(node, findsOneWidget, reason: label);
      final data = tester.getSemantics(node).getSemanticsData();
      expect(data.hasAction(SemanticsAction.tap), isTrue, reason: label);
      if (label == 'Add to ledger') {
        expect(
          data.hasAction(SemanticsAction.longPress),
          isTrue,
          reason: label,
        );
      }
    }
    expect(tester.takeException(), isNull);
    semantics.dispose();
  });
}
