import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zowl_mobile/core/providers.dart';
import 'package:zowl_mobile/features/transactions/transaction_row.dart';

import 'support/fixtures.dart';
import 'support/test_harness.dart';

void main() {
  testWidgets(
    'transaction rows rebuild after categories reload while no row was shown',
    (tester) async {
      final harness = await MobileTestHarness.create();
      final showRows = ValueNotifier(true);
      addTearDown(showRows.dispose);
      late WidgetRef rootRef;

      await tester.pumpWidget(
        harness.screen(
          Consumer(
            builder: (context, ref, _) {
              rootRef = ref;
              return Scaffold(
                body: ValueListenableBuilder<bool>(
                  valueListenable: showRows,
                  builder: (context, show, _) => show
                      ? ListView(
                          children: const [
                            TransactionRow(item: testTransaction),
                            TransactionRow(item: testTransaction),
                          ],
                        )
                      : const SizedBox.shrink(),
                ),
              );
            },
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Leave the list (as switching tabs does), reload categories the way a
      // sign-in does, then come back to the list.
      showRows.value = false;
      await tester.pumpAndSettle();
      rootRef.invalidate(categoriesProvider);
      await tester.pumpAndSettle();
      showRows.value = true;
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.byType(TransactionRow), findsNWidgets(2));
    },
  );
}
