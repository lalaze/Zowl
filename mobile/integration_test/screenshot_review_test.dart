import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'support/device_test_support.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('uploads a fixture, reviews it, posts it, and voids the result', (
    tester,
  ) async {
    final merchant = testMarker('screenshot');
    final picker = DeviceFixtureScreenshotPicker();
    addTearDown(picker.dispose);
    await startAndSignIn(tester, screenshotPicker: picker);
    await openAddEntry(
      tester,
      'Recognize screenshots',
      find.text('Record a payment screenshot'),
    );

    await tapScrollable(tester, 'Select screenshots to begin');
    await waitFor(
      tester,
      find.text('Review screenshot transactions'),
      timeout: const Duration(seconds: 60),
      description: 'Review screen did not open after screenshot upload',
    );
    await waitFor(tester, find.text('Required fields are incomplete'));
    await tapScrollable(tester, 'Edit fields');
    await waitFor(tester, find.text('Edit transaction'));
    await tester.enterText(textField('Amount'), '17.60');
    await tester.enterText(textField('Merchant'), merchant);
    await tapScrollable(tester, 'Save and recheck');

    await waitFor(tester, find.text('Selected for posting'));
    await tapScrollable(tester, 'Post selected transactions');
    await waitFor(
      tester,
      find.textContaining('screenshot transactions added to the ledger'),
    );
    await tester.tap(find.text('Done'));
    await waitFor(tester, find.text('Out this month'));
    await tester.tap(find.byTooltip('Search'));
    await waitFor(tester, find.text('Search merchants or descriptions'));

    final searchInput = find.descendant(
      of: find.byType(SearchBar),
      matching: find.byType(EditableText),
    );
    await tester.enterText(searchInput, merchant);
    await tester.testTextInput.receiveAction(TextInputAction.search);
    final result = find.byWidgetPredicate(
      (widget) => widget is Text && widget.data == merchant,
    );
    await waitFor(tester, result);
    await tester.tap(result);
    await waitFor(tester, find.text('Transaction details'));
    await voidCurrentTransaction(tester);
    await tapNavigation(tester, 'Me', find.text('Personal details'));
    await logoutFromSettings(tester);
  });
}
