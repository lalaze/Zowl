import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:zowl_mobile/core/api.dart';
import 'package:zowl_mobile/core/l10n.dart';
import 'package:zowl_mobile/core/models.dart';
import 'package:zowl_mobile/features/imports/import_screen.dart';

import 'support/test_harness.dart';

Future<void> _pumpUntil(
  WidgetTester tester,
  Finder finder, {
  int attempts = 20,
}) async {
  for (var attempt = 0; attempt < attempts; attempt++) {
    await tester.pump(const Duration(milliseconds: 50));
    if (finder.evaluate().isNotEmpty) return;
  }
}

(Widget, GoRouter) _routerApp(MobileTestHarness harness) {
  final router = GoRouter(
    initialLocation: '/imports',
    routes: [
      GoRoute(path: '/imports', builder: (_, _) => const ImportScreen()),
      GoRoute(
        path: '/imports/screenshots/:jobId',
        builder: (_, state) =>
            Scaffold(body: Text('REVIEW ${state.pathParameters['jobId']}')),
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

void main() {
  testWidgets('cancelling screenshot selection never starts an upload', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();

    await tester.pumpWidget(harness.screen(const ImportScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Select screenshots to begin'));
    await tester.pumpAndSettle();

    expect(harness.picker.calls, 1);
    expect(harness.picker.requestedLimit, 10);
    expect(harness.repository.uploadCalls, 0);
  });

  testWidgets('unsupported screenshots are rejected before upload', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    harness.picker.files = [
      XFile.fromData(Uint8List.fromList([1, 2, 3]), path: '/tmp/payment.gif'),
    ];

    await tester.pumpWidget(harness.screen(const ImportScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Select screenshots to begin'));
    await tester.pumpAndSettle();

    expect(
      find.text('Only supports JPG, PNG or WebP screenshots'),
      findsOneWidget,
    );
    expect(harness.repository.uploadCalls, 0);
  });

  testWidgets('screenshot batches over 40 MiB are rejected before upload', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    harness.picker.files = [
      XFile.fromData(
        Uint8List.fromList([1]),
        path: '/tmp/large.png',
        length: 40 * 1024 * 1024 + 1,
      ),
    ];

    await tester.pumpWidget(harness.screen(const ImportScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Select screenshots to begin'));
    await _pumpUntil(tester, find.textContaining('40 MiB'));

    expect(
      find.text('Total screenshot size must not exceed 40 MiB'),
      findsOneWidget,
    );
    expect(harness.repository.uploadCalls, 0);
  });

  testWidgets(
    'third-party recognition requires consent before sending images',
    (tester) async {
      final harness = await MobileTestHarness.create();
      harness.repository.providerInfo = const RecognitionProviderInfo(
        id: 'remote',
        label: 'Remote recognition service',
        sendsImagesToThirdParty: true,
        disclosure: 'Images will be sent to a third party',
        retentionPolicy: 'Provider retains data for 24 hours',
      );
      harness.picker.files = [
        XFile.fromData(Uint8List.fromList([1, 2, 3]), path: '/tmp/payment.png'),
      ];
      final (widget, router) = _routerApp(harness);
      addTearDown(router.dispose);
      await tester.pumpWidget(widget);
      await tester.pumpAndSettle();

      await tester.tap(find.text('Select screenshots to begin'));
      await _pumpUntil(tester, find.byType(AlertDialog));
      expect(find.byType(AlertDialog), findsOneWidget);
      expect(find.text('Remote recognition service'), findsWidgets);
      expect(
        find.textContaining('Images will be sent to a third party'),
        findsWidgets,
      );
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(harness.repository.uploadCalls, 0);

      await tester.tap(find.text('Select screenshots to begin'));
      await _pumpUntil(tester, find.byType(AlertDialog));
      await tester.tap(find.text('Agree and upload'));
      await tester.pumpAndSettle();

      expect(harness.repository.uploadCalls, 1);
      expect(harness.repository.lastUploadConsent, isTrue);
      expect(find.text('REVIEW job-1'), findsOneWidget);
    },
  );

  testWidgets(
    'accepted screenshots report progress and open their review job',
    (tester) async {
      final harness = await MobileTestHarness.create();
      harness.picker.files = [
        XFile.fromData(
          Uint8List.fromList([137, 80, 78, 71]),
          path: '/tmp/pay.png',
        ),
      ];
      bool? consent;
      final upload = Completer<String>();
      harness.repository.uploadHandler = (files, allowed, onProgress) async {
        consent = allowed;
        onProgress?.call(50, 100);
        return upload.future;
      };
      final (widget, router) = _routerApp(harness);
      addTearDown(router.dispose);
      await tester.pumpWidget(widget);
      await tester.pumpAndSettle();

      await tester.tap(find.text('Select screenshots to begin'));
      await _pumpUntil(tester, find.text('Uploading 50%'));
      expect(find.text('Uploading 50%'), findsOneWidget);
      upload.complete('job-uploaded');
      await tester.pumpAndSettle();

      expect(consent, isTrue);
      expect(harness.repository.uploadCalls, 1);
      expect(find.text('REVIEW job-uploaded'), findsOneWidget);
    },
  );

  testWidgets('upload failures remain recoverable and refresh task history', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    harness.picker.files = [
      XFile.fromData(
        Uint8List.fromList([137, 80, 78, 71]),
        path: '/tmp/pay.png',
      ),
    ];
    var jobReads = 0;
    harness.repository.jobsHandler = () async {
      jobReads++;
      return const [];
    };
    harness.repository.uploadHandler = (_, _, _) async =>
        throw const ApiException(
          statusCode: 0,
          code: 'NETWORK_ERROR',
          message: 'Network disconnected',
        );

    await tester.pumpWidget(harness.screen(const ImportScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Select screenshots to begin'));
    await _pumpUntil(tester, find.textContaining('Network disconnected'));

    expect(find.textContaining('Network disconnected'), findsOneWidget);
    expect(find.textContaining('check the task history first'), findsOneWidget);
    expect(jobReads, 2);
    expect(find.text('Select screenshots to begin'), findsOneWidget);
  });

  testWidgets('recent recognition jobs expose their status and resume review', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    harness.repository.jobs = const [
      RecognitionJob(
        id: 'job-processing',
        status: 'processing',
        createdAt: '2026-07-19T04:30:00.000Z',
        totalCount: 4,
      ),
      RecognitionJob(
        id: 'job-review',
        status: 'reviewing',
        createdAt: '2026-07-18T04:30:00.000Z',
        totalCount: 2,
      ),
      RecognitionJob(
        id: 'job-complete',
        status: 'completed',
        createdAt: '2026-07-17T04:30:00.000Z',
        totalCount: 1,
      ),
      RecognitionJob(
        id: 'job-failed',
        status: 'failed',
        createdAt: '2026-07-16T04:30:00.000Z',
        totalCount: 3,
      ),
    ];
    final (widget, router) = _routerApp(harness);
    addTearDown(router.dispose);
    await tester.pumpWidget(widget);
    await tester.pumpAndSettle();

    expect(find.text('4 screenshots · Recognizing'), findsOneWidget);
    expect(find.text('2 screenshots · Awaiting review'), findsOneWidget);
    expect(find.text('1 screenshot · Completed'), findsOneWidget);
    expect(find.text('3 screenshots · Failed'), findsOneWidget);
    await tester.drag(find.byType(CustomScrollView), const Offset(0, -400));
    await tester.pumpAndSettle();
    await tester.tap(find.text('2 screenshots · Awaiting review'));
    await tester.pumpAndSettle();
    expect(find.text('REVIEW job-review'), findsOneWidget);
  });
  testWidgets('quick screenshot entry retries the same authorized submission', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create();
    harness.picker.files = [
      XFile.fromData(Uint8List.fromList([1, 2, 3]), path: '/tmp/payment.png'),
    ];
    harness.repository.uploadHandler = (_, _, _) async =>
        throw const ApiException(
          statusCode: 0,
          code: 'NETWORK_ERROR',
          message: 'Result unknown',
        );
    await tester.pumpWidget(harness.screen(const ImportScreen(quick: true)));
    await _pumpUntil(tester, find.text('Retry same submission'));
    expect(harness.picker.requestedLimit, 1);
    final id = harness.repository.uploadSubmissionIds.single;
    expect(id, isNotNull);
    await tester.tap(find.text('Retry same submission'));
    await tester.pumpAndSettle();
    expect(harness.repository.uploadSubmissionIds, [id, id]);
    expect(harness.repository.uploadAutoConfirm, [true, true]);
  });

  testWidgets('the import screen reads naturally in Chinese', (tester) async {
    applyLanguage(AppLanguage.zh);
    addTearDown(() => applyLanguage(AppLanguage.en));
    final harness = await MobileTestHarness.create();
    harness.repository.jobs = const [
      RecognitionJob(
        id: 'job-processing',
        status: 'processing',
        createdAt: '2026-07-19T04:30:00.000Z',
        totalCount: 4,
      ),
      RecognitionJob(
        id: 'job-complete',
        status: 'completed',
        createdAt: '2026-07-17T04:30:00.000Z',
        totalCount: 1,
      ),
    ];
    harness.picker.files = [
      XFile.fromData(Uint8List.fromList([1, 2, 3]), path: '/tmp/payment.gif'),
    ];

    await tester.pumpWidget(harness.screen(const ImportScreen()));
    await tester.pumpAndSettle();

    expect(find.text('截图识别'), findsOneWidget);
    expect(find.text('从支付截图记账'), findsOneWidget);
    expect(find.text('核对'), findsOneWidget);
    expect(find.text('入账'), findsOneWidget);
    expect(find.text('待核对'), findsOneWidget);
    expect(find.text('最近识别任务'), findsOneWidget);
    expect(find.text('4 张截图 · 识别中'), findsOneWidget);
    expect(find.text('1 张截图 · 已完成'), findsOneWidget);

    await tester.tap(find.text('选择截图开始'));
    await tester.pumpAndSettle();
    expect(find.text('仅支持 JPG、PNG 或 WebP 截图'), findsOneWidget);
    expect(harness.repository.uploadCalls, 0);
  });
}
