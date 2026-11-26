import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zemoney_mobile/core/formatters.dart';
import 'package:zemoney_mobile/core/l10n.dart';
import 'package:zemoney_mobile/core/models.dart';
import 'package:zemoney_mobile/core/providers.dart';
import 'package:zemoney_mobile/features/common/ze_labels.dart';
import 'package:zemoney_mobile/features/imports/notification_capture_screen.dart';

import 'support/fixtures.dart';
import 'support/test_harness.dart';

const _emptyPage = NotificationCapturePage(
  items: [],
  pagination: Pagination(page: 1, limit: 20, total: 0, totalPages: 1),
  pendingCount: 0,
);

const _cmbCapture = NotificationCaptureItem(
  id: 'cmb-capture',
  platform: 'cmb',
  notificationPostedAt: '2026-07-29T04:30:00.000Z',
  amountMinor: 1880,
  currency: 'CNY',
  transactionTime: '2026-07-29T04:30:00.000Z',
  confidenceBasisPoints: 9000,
  description: 'CMB debit notification',
  paymentMethod: 'China Merchants Bank',
  duplicateStatus: 'unique',
  status: 'reviewing',
);

const _missingMerchantCapture = NotificationCaptureItem(
  id: 'capture-missing-merchant',
  platform: 'alipay',
  notificationPostedAt: '2026-07-29T04:30:00.000Z',
  amountMinor: 10,
  currency: 'CNY',
  transactionTime: '2026-07-29T04:30:00.000Z',
  confidenceBasisPoints: 9000,
  description: 'Alipay payment notification',
  paymentMethod: 'Alipay',
  duplicateStatus: 'unique',
  status: 'reviewing',
);

void main() {
  testWidgets('a candidate card keeps its rows on the same edges', (
    tester,
  ) async {
    // The test font is twice as wide as the real one.
    await tester.binding.setSurfaceSize(const Size(640, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    applyLanguage(AppLanguage.zh);
    addTearDown(() => applyLanguage(AppLanguage.en));
    final harness = await MobileTestHarness.create();
    harness.repository.notificationCapturePage = const NotificationCapturePage(
      items: [_missingMerchantCapture],
      pagination: Pagination(page: 1, limit: 20, total: 1, totalPages: 1),
      pendingCount: 1,
    );
    await tester.pumpWidget(harness.screen(const NotificationCaptureScreen()));
    await tester.pumpAndSettle();

    // The chip that can be tapped stands level with the ones beside it.
    final add = find.text('+ 补充商户');
    final neighbour = find.descendant(
      of: find.byType(Wrap),
      matching: find.byIcon(Icons.category_rounded),
    );
    expect(
      tester.getCenter(add).dy,
      closeTo(tester.getCenter(neighbour).dy, .5),
    );
    // Left edge: icon and skip. Right edge: amount and confirm.
    final left = tester.getTopLeft(find.byType(ZeIconTile).first).dx;
    expect(tester.getTopLeft(find.text('跳过')).dx, closeTo(left, 1));
    final right = tester.getTopRight(find.text('-¥0.10')).dx;
    expect(
      tester.getTopRight(find.widgetWithText(FilledButton, '确认入账')).dx,
      closeTo(right, 1),
    );
    // Batch selection checkboxes appear only after entering batch mode.
    expect(find.byType(Checkbox), findsNothing);
    await tester.tap(find.text('批量核对'));
    await tester.pumpAndSettle();
    expect(find.byType(Checkbox), findsOneWidget);
    expect(tester.getTopLeft(find.byType(Checkbox)).dx, closeTo(left, 1));
    expect(tester.takeException(), isNull);
  });

  testWidgets('processed candidates keep amounts in one column', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(640, 1400));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final harness = await MobileTestHarness.create();
    NotificationCaptureItem done(String id, int amount, String? merchant) =>
        NotificationCaptureItem(
          id: id,
          platform: 'taobao',
          notificationPostedAt: '2026-07-29T04:30:00.000Z',
          amountMinor: amount,
          currency: 'CNY',
          transactionTime: '2026-07-29T04:30:00.000Z',
          confidenceBasisPoints: 9000,
          merchantName: merchant,
          duplicateStatus: 'unique',
          status: 'completed',
          resultCode: merchant == null ? null : 'AUTO_POSTED',
          resultTransactionId: merchant == null ? null : 'tx-$id',
        );
    harness.repository.notificationCapturePage = NotificationCapturePage(
      items: [
        done('a', 25000, 'A merchant whose name is far too long for one line'),
        done('b', 3360, null),
      ],
      pagination: const Pagination(page: 1, limit: 20, total: 2, totalPages: 1),
      pendingCount: 0,
    );
    await tester.pumpWidget(harness.screen(const NotificationCaptureScreen()));
    await tester.pumpAndSettle();

    final long = find.text('¥250.00');
    final short = find.text('¥33.60');
    await tester.ensureVisible(short);
    await tester.pumpAndSettle();
    expect(
      tester.getTopRight(long).dx,
      closeTo(tester.getTopRight(short).dx, .5),
    );
    final row = find.ancestor(of: long, matching: find.byType(ListTile));
    expect(tester.getSize(row).height, lessThan(90));
    expect(tester.takeException(), isNull);
  });

  testWidgets('quickly fills a missing merchant and posts the capture', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    harness.repository.notificationCapturePage = const NotificationCapturePage(
      items: [_missingMerchantCapture],
      pagination: Pagination(page: 1, limit: 20, total: 1, totalPages: 1),
      pendingCount: 1,
    );
    harness.repository.quickConfirmNotificationCaptureHandler =
        (id, merchantName) async {
          expect(id, 'capture-missing-merchant');
          expect(merchantName, 'Mountain Cafe');
          harness.repository.notificationCapturePage = _emptyPage;
          return {'status': 'completed'};
        };

    await tester.pumpWidget(harness.screen(const NotificationCaptureScreen()));
    await tester.pumpAndSettle();

    await tester.tap(find.text('+ Add merchant'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '  Mountain Cafe  ');
    await tester.tap(find.text('Save and post'));
    await tester.pumpAndSettle();

    expect(
      harness.repository.notificationCaptureInputs.single,
      containsPair('merchantName', 'Mountain Cafe'),
    );
    expect(
      find.text('No captured payments awaiting confirmation'),
      findsOneWidget,
    );
  });

  testWidgets(
    'shows structured facts and binds duplicate confirmation digest',
    (tester) async {
      final harness = await MobileTestHarness.create();
      harness.repository.confirmNotificationCaptureHandler =
          (id, decision, digest) async {
            expect(id, 'capture-1');
            expect(decision, 'post');
            expect(digest, 'assessment-1');
            harness.repository.notificationCapturePage = _emptyPage;
            return {'status': 'completed'};
          };

      await tester.pumpWidget(
        harness.screen(const NotificationCaptureScreen()),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('Alipay'), findsWidgets);
      expect(find.text('-¥18.80'), findsOneWidget);
      expect(find.text('Mountain Cafe'), findsOneWidget);
      expect(find.textContaining('Possible duplicate'), findsOneWidget);
      expect(
        find.textContaining(
          'Original page and notification text is never saved',
        ),
        findsOneWidget,
      );

      await tester.tap(find.text('Confirm and post'));
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsOneWidget);
      await tester.tap(find.text('Post anyway'));
      await tester.pumpAndSettle();

      expect(
        harness.repository.notificationCaptureInputs.single,
        containsPair('assessmentDigest', 'assessment-1'),
      );
      expect(
        find.text('No captured payments awaiting confirmation'),
        findsOneWidget,
      );
    },
  );

  testWidgets('a candidate with recognised goods shows them and their count', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    harness.repository.notificationCapturePage = const NotificationCapturePage(
      items: [testOrderCapture],
      pagination: Pagination(page: 1, limit: 20, total: 1, totalPages: 1),
      pendingCount: 1,
    );

    await tester.pumpWidget(harness.screen(const NotificationCaptureScreen()));
    await tester.pumpAndSettle();

    final sourceLine = find.textContaining('Taobao · Payment page');
    expect(sourceLine, findsOneWidget);
    expect(find.text('Bin bags and 1 more'), findsOneWidget);
    expect(find.text('2 items'), findsOneWidget);
    expect(find.text('Harbor Home Store'), findsOneWidget);
    // Recognised goods lead the card above the source and capture time line.
    final summaryTop = tester.getTopLeft(find.text('Bin bags and 1 more')).dy;
    expect(summaryTop, lessThan(tester.getTopLeft(sourceLine).dy));
    expect(
      find.textContaining(formatDateTime(testOrderCapture.transactionTime)),
      findsOneWidget,
    );
  });

  testWidgets('a candidate without order details keeps its plain card', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();

    await tester.pumpWidget(harness.screen(const NotificationCaptureScreen()));
    await tester.pumpAndSettle();

    expect(find.text('Mountain Cafe'), findsOneWidget);
    expect(find.text(testNotificationCapture.description!), findsNothing);
    expect(find.textContaining(RegExp(r'^\d+ items?$')), findsNothing);
  });

  testWidgets('the goods count on a candidate reads in Chinese', (
    tester,
  ) async {
    applyLanguage(AppLanguage.zh);
    addTearDown(() => applyLanguage(AppLanguage.en));
    final harness = await MobileTestHarness.create();
    harness.repository.notificationCapturePage = const NotificationCapturePage(
      items: [testOrderCapture],
      pagination: Pagination(page: 1, limit: 20, total: 1, totalPages: 1),
      pendingCount: 1,
    );

    await tester.pumpWidget(harness.screen(const NotificationCaptureScreen()));
    await tester.pumpAndSettle();

    expect(find.text('2 件'), findsOneWidget);
    expect(find.text('Bin bags and 1 more'), findsOneWidget);
  });

  testWidgets('edits normalized fields and asks the server to recalculate', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    harness.repository.updateNotificationCaptureHandler = (id, input) async {
      harness.repository.notificationCapturePage = _emptyPage;
      return testNotificationCapture;
    };

    await tester.pumpWidget(harness.screen(const NotificationCaptureScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Edit'));
    await tester.pumpAndSettle();

    final amount = find.widgetWithText(TextFormField, 'Amount');
    await tester.enterText(amount, '25.50');
    await tester.ensureVisible(find.text('Save changes'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save changes'));
    await tester.pumpAndSettle();

    expect(
      harness.repository.notificationCaptureInputs.single,
      containsPair('amountMinor', 2550),
    );
    expect(
      find.text('Candidate updated and duplicates rechecked'),
      findsOneWidget,
    );
  });

  testWidgets('skip completes a candidate without a duplicate override', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    harness.repository.confirmNotificationCaptureHandler =
        (id, decision, digest) async {
          expect(decision, 'skip');
          expect(digest, isNull);
          harness.repository.notificationCapturePage = _emptyPage;
          return {'status': 'completed'};
        };

    await tester.pumpWidget(harness.screen(const NotificationCaptureScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Skip'));
    await tester.pumpAndSettle();

    expect(find.byType(AlertDialog), findsNothing);
    expect(
      find.text('No captured payments awaiting confirmation'),
      findsOneWidget,
    );
  });

  testWidgets('shows CMB notification candidates as a bank source', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    harness.repository.notificationCapturePage = const NotificationCapturePage(
      items: [_cmbCapture],
      pagination: Pagination(page: 1, limit: 20, total: 1, totalPages: 1),
      pendingCount: 1,
    );

    await tester.pumpWidget(harness.screen(const NotificationCaptureScreen()));
    await tester.pumpAndSettle();

    expect(find.text('China Merchants Bank'), findsWidgets);
    expect(find.text('-¥18.80'), findsOneWidget);
    expect(find.text('+ Add merchant'), findsOneWidget);
  });
  testWidgets(
    'reviews selected unique candidates before atomic batch posting',
    (tester) async {
      final harness = await MobileTestHarness.create();
      harness.repository.notificationCapturePage =
          const NotificationCapturePage(
            items: [_cmbCapture],
            pagination: Pagination(page: 1, limit: 20, total: 1, totalPages: 1),
            pendingCount: 1,
          );
      harness.repository.batchConfirmHandler = (items) async {
        harness.repository.notificationCapturePage = _emptyPage;
        return {'status': 'completed'};
      };
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(
        harness.screen(const NotificationCaptureScreen()),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Batch review'));
      await tester.pumpAndSettle();
      expect(
        find.bySemanticsLabel(
          'Include China Merchants Bank, ¥18.80 in batch review',
        ),
        findsOneWidget,
      );
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      semantics.dispose();
      await tester.tap(find.byType(Checkbox).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Review and post 1 selected'));
      await tester.pumpAndSettle();
      expect(harness.repository.lastBatch, isNull);
      expect(
        find.textContaining('entire batch stays unposted'),
        findsOneWidget,
      );
      await tester.tap(find.text('Confirm batch'));
      await tester.pumpAndSettle();
      expect(harness.repository.lastBatch!.single.id, 'cmb-capture');
      expect(
        find.text('No captured payments awaiting confirmation'),
        findsOneWidget,
      );
    },
  );

  testWidgets('candidate pagination reaches older pending notifications', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    harness.repository.notificationCapturePage = const NotificationCapturePage(
      items: [_cmbCapture],
      pagination: Pagination(page: 1, limit: 20, total: 21, totalPages: 2),
      pendingCount: 21,
    );
    await tester.pumpWidget(harness.screen(const NotificationCaptureScreen()));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Next'), 150);
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    expect(harness.repository.requestedCapturePages, contains(2));
  });

  testWidgets('the review inbox reads naturally in Chinese', (tester) async {
    applyLanguage(AppLanguage.zh);
    addTearDown(() => applyLanguage(AppLanguage.en));
    final harness = await MobileTestHarness.create();

    await tester.pumpWidget(harness.screen(const NotificationCaptureScreen()));
    await tester.pumpAndSettle();

    expect(find.text('待核对'), findsOneWidget);
    expect(find.text('支付候选'), findsOneWidget);
    expect(find.text('1 笔待确认'), findsOneWidget);
    expect(find.textContaining('支付宝'), findsOneWidget);
    expect(find.text('疑似重复，请核对已有交易后再决定'), findsOneWidget);
    expect(find.textContaining('不会保存原始页面和通知正文'), findsOneWidget);
    expect(find.text('跳过'), findsOneWidget);

    await tester.tap(find.text('确认入账'));
    await tester.pumpAndSettle();
    expect(find.text('这笔可能已经记过'), findsOneWidget);
    expect(find.textContaining('本次：Mountain Cafe'), findsOneWidget);
    expect(find.text('仍然入账'), findsOneWidget);
    await tester.tap(find.text('取消'));
    await tester.pumpAndSettle();
    expect(harness.repository.notificationCaptureInputs, isEmpty);

    await tester.tap(find.text('编辑'));
    await tester.pumpAndSettle();
    expect(find.text('编辑支付候选'), findsOneWidget);
    expect(find.widgetWithText(TextFormField, '金额'), findsOneWidget);
    expect(find.text('商户（选填）'), findsOneWidget);
  });

  testWidgets(
    'turning from batch mode to a duplicate-only page exits batch mode and restores card actions',
    (tester) async {
      final harness = await MobileTestHarness.create();
      harness.repository.notificationCapturesPageHandler =
          (status, page) async {
            if (status == 'completed') return _emptyPage;
            return page == 1
                ? const NotificationCapturePage(
                    items: [_cmbCapture],
                    pagination: Pagination(
                      page: 1,
                      limit: 20,
                      total: 21,
                      totalPages: 2,
                    ),
                    pendingCount: 21,
                  )
                : const NotificationCapturePage(
                    items: [testNotificationCapture],
                    pagination: Pagination(
                      page: 2,
                      limit: 20,
                      total: 21,
                      totalPages: 2,
                    ),
                    pendingCount: 21,
                  );
          };

      await tester.pumpWidget(
        harness.screen(const NotificationCaptureScreen()),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Batch review'));
      await tester.pumpAndSettle();
      expect(find.text('Select items to post'), findsOneWidget);
      expect(find.text('Confirm and post'), findsNothing);

      await tester.scrollUntilVisible(find.text('Next'), 150);
      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();

      // Page 2 has only possible duplicates: batch mode must not trap the user.
      expect(find.text('Select items to post'), findsNothing);
      expect(find.text('Confirm and post'), findsOneWidget);
      expect(find.text('Skip'), findsOneWidget);
      expect(find.text('Edit'), findsOneWidget);
    },
  );

  testWidgets(
    'background refresh prunes stale batch selections and keeps exited batch mode off',
    (tester) async {
      final harness = await MobileTestHarness.create();
      const secondUnique = NotificationCaptureItem(
        id: 'cmb-capture-2',
        platform: 'cmb',
        notificationPostedAt: '2026-07-29T04:31:00.000Z',
        amountMinor: 2400,
        currency: 'CNY',
        transactionTime: '2026-07-29T04:31:00.000Z',
        confidenceBasisPoints: 9000,
        merchantName: 'Second Shop',
        duplicateStatus: 'unique',
        status: 'reviewing',
      );
      const secondNowDuplicate = NotificationCaptureItem(
        id: 'cmb-capture-2',
        platform: 'cmb',
        notificationPostedAt: '2026-07-29T04:31:00.000Z',
        amountMinor: 2400,
        currency: 'CNY',
        transactionTime: '2026-07-29T04:31:00.000Z',
        confidenceBasisPoints: 9000,
        merchantName: 'Second Shop',
        duplicateStatus: 'possible_duplicate',
        duplicateAssessmentDigest: 'dup-2',
        status: 'reviewing',
      );
      const thirdUnique = NotificationCaptureItem(
        id: 'cmb-capture-3',
        platform: 'cmb',
        notificationPostedAt: '2026-07-29T04:35:00.000Z',
        amountMinor: 990,
        currency: 'CNY',
        transactionTime: '2026-07-29T04:35:00.000Z',
        confidenceBasisPoints: 9000,
        merchantName: 'Third Shop',
        duplicateStatus: 'unique',
        status: 'reviewing',
      );

      var stage = 0;
      harness
          .repository
          .notificationCapturesPageHandler = (status, page) async {
        if (status == 'completed') return _emptyPage;
        return switch (stage) {
          0 => const NotificationCapturePage(
            items: [_cmbCapture, secondUnique],
            pagination: Pagination(page: 1, limit: 20, total: 2, totalPages: 1),
            pendingCount: 2,
          ),
          1 => const NotificationCapturePage(
            items: [_cmbCapture, secondNowDuplicate],
            pagination: Pagination(page: 1, limit: 20, total: 2, totalPages: 1),
            pendingCount: 2,
          ),
          2 => const NotificationCapturePage(
            items: [secondNowDuplicate],
            pagination: Pagination(page: 1, limit: 20, total: 1, totalPages: 1),
            pendingCount: 1,
          ),
          _ => const NotificationCapturePage(
            items: [thirdUnique],
            pagination: Pagination(page: 1, limit: 20, total: 1, totalPages: 1),
            pendingCount: 1,
          ),
        };
      };

      await tester.pumpWidget(
        harness.screen(const NotificationCaptureScreen()),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Batch review'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Select all'));
      await tester.pumpAndSettle();
      expect(find.text('Review and post 2 selected'), findsOneWidget);

      final container = ProviderScope.containerOf(
        tester.element(find.byType(NotificationCaptureScreen)),
      );

      // Background refresh turns the second item into possible_duplicate: count drops to 1.
      stage = 1;
      container.invalidate(notificationCapturePageProvider);
      await tester.pumpAndSettle();
      expect(find.text('Review and post 1 selected'), findsOneWidget);

      // Background refresh leaves only duplicates: batch mode exits.
      stage = 2;
      container.invalidate(notificationCapturePageProvider);
      await tester.pumpAndSettle();
      expect(find.text('Review and post 1 selected'), findsNothing);
      expect(find.text('Confirm and post'), findsOneWidget);

      // Later refresh brings a new unique item: batch mode must NOT re-enter on its own.
      stage = 3;
      container.invalidate(notificationCapturePageProvider);
      await tester.pumpAndSettle();
      expect(find.text('Third Shop'), findsOneWidget);
      expect(find.byType(Checkbox), findsNothing);
      expect(find.text('Confirm and post'), findsOneWidget);
    },
  );
}
