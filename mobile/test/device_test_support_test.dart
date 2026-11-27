import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:zowl_mobile/core/api.dart';
import 'package:zowl_mobile/features/transactions/transaction_detail_screen.dart';
import 'package:zowl_mobile/features/transactions/transaction_form_screen.dart';

import '../integration_test/support/device_test_support.dart';
import 'support/test_harness.dart';

void main() {
  for (final duplicate in [false, true]) {
    testWidgets(
      'submission waits for delayed ${duplicate ? 'duplicate review and override' : 'success'} until the detail screen opens',
      (tester) async {
        final harness = await MobileTestHarness.create();
        harness.repository.createHandler = (input) async {
          await Future<void>.delayed(const Duration(seconds: 3));
          if (duplicate && !input.containsKey('duplicateOverride')) {
            throw const ApiException(
              statusCode: 409,
              code: 'NEEDS_REVIEW',
              message: 'Confirm duplicate transactions',
              data: {
                'status': 'needs_review',
                'assessmentDigest': 'digest-1',
                'assessment': {'reasonCode': 'exact_fingerprint'},
              },
            );
          }
          return {'id': 'tx-created'};
        };
        final router = GoRouter(
          initialLocation: '/form',
          routes: [
            GoRoute(
              path: '/form',
              builder: (_, _) => const TransactionFormScreen(),
            ),
            GoRoute(
              path: '/transactions/:id',
              builder: (_, state) =>
                  TransactionDetailScreen(id: state.pathParameters['id']!),
            ),
          ],
        );
        addTearDown(router.dispose);
        await tester.pumpWidget(
          ProviderScope(
            overrides: harness.overrides,
            retry: (_, _) => null,
            child: MaterialApp.router(routerConfig: router),
          ),
        );
        await tester.pumpAndSettle();
        await tester.enterText(amountField, '12.80');
        await tester.tap(find.text('Confirm and post'));
        await tester.pump();
        // Still on the form: the helpers must wait for the detail screen
        // itself, not for any "details" text the form may show.
        expect(find.byType(TransactionDetailScreen), findsNothing);

        await waitForDetailOrDuplicate(tester);
        if (duplicate) {
          expect(find.text('Post anyway'), findsOneWidget);
          expect(find.byType(TransactionDetailScreen), findsNothing);
        } else {
          expect(find.byType(TransactionDetailScreen), findsOneWidget);
        }

        await acceptDuplicateIfShown(tester);
        expect(find.byType(TransactionDetailScreen), findsOneWidget);
        expect(
          router.routeInformationProvider.value.uri.path,
          '/transactions/tx-created',
        );
        expect(harness.repository.createInputs, hasLength(duplicate ? 2 : 1));
        await tester.pumpAndSettle();
      },
    );
  }
}
