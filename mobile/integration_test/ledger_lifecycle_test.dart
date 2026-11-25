import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'support/device_test_support.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'creates, amends, and voids one uniquely identified ledger item',
    (tester) async {
      final merchant = testMarker('ledger');
      await startAndSignIn(tester);

      await openAddEntry(tester, 'Enter manually', find.byType(TextFormField));
      await tester.enterText(amountField, '12.80');
      await enterScrollable(
        tester,
        formField('Merchant name (optional)'),
        merchant,
      );
      await tapScrollable(tester, 'More details');
      await waitFor(tester, formField('Transaction description'));
      await tester.enterText(
        formField('Transaction description'),
        'Device test entry $merchant',
      );
      await tapScrollable(tester, 'Confirm and post');
      await waitForDetailOrDuplicate(tester);
      await acceptDuplicateIfShown(tester);
      await waitFor(tester, find.text('Transaction details'));
      await waitFor(tester, find.text(merchant));

      await tapScrollable(tester, 'Amend transaction');
      await waitFor(tester, find.byType(TextFormField));
      await tester.enterText(amountField, '13.80');
      await tapScrollable(tester, 'More details');
      await waitFor(tester, formField('Transaction description'));
      await tester.enterText(
        formField('Transaction description'),
        'Device test amendment $merchant',
      );
      await tapScrollable(tester, 'Save amendment');
      await waitForDetailOrDuplicate(tester);
      await acceptDuplicateIfShown(tester);
      await waitFor(tester, find.textContaining('13.80'));

      await voidCurrentTransaction(tester);
      await tapNavigation(tester, 'Me', find.text('Personal details'));
      await logoutFromSettings(tester);
    },
  );
}
