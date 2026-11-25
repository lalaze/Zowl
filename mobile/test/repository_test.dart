import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:zemoney_mobile/core/api.dart';
import 'package:zemoney_mobile/core/config.dart';
import 'package:zemoney_mobile/core/repository.dart';

import 'support/fixtures.dart';
import 'support/test_harness.dart';

class _Response {
  const _Response(this.body, {this.status = 200});
  final Object? body;
  final int status;
}

class _RecordingAdapter implements HttpClientAdapter {
  _RecordingAdapter(Iterable<_Response> responses)
    : responses = List.of(responses);

  final List<_Response> responses;
  final List<RequestOptions> requests = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final response = responses.removeAt(0);
    return ResponseBody.fromString(
      jsonEncode(response.body),
      response.status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Future<(ZeMoneyRepository, FakeTokenStore, _RecordingAdapter)> _repository(
  List<_Response> responses,
) async {
  SharedPreferences.setMockInitialValues({});
  final preferences = await SharedPreferences.getInstance();
  final tokens = FakeTokenStore(preferences, token: 'old-token');
  final api = ApiClient(
    ApiConfig.parse('http://100.64.0.10:3000', release: false),
    tokens,
  );
  final adapter = _RecordingAdapter(responses);
  api.dio.httpClientAdapter = adapter;
  return (ZeMoneyRepository(api, tokens), tokens, adapter);
}

void main() {
  test(
    'authentication establishes, reads, and revokes the mobile session',
    () async {
      final sessionJson = {
        'tokenType': 'Bearer',
        'accessToken': 'new-token',
        'expiresAt': '2026-08-01T00:00:00.000Z',
        'user': testUser.toJson(),
      };
      final (repository, tokens, adapter) = await _repository([
        _Response({'data': sessionJson}),
        _Response({
          'data': {'user': testUser.toJson()},
        }),
        const _Response({'data': <String, dynamic>{}}),
      ]);

      final login = await repository.login('test@zemoney.local', 'secret');
      final current = await repository.session();
      await repository.logout();

      expect(login.accessToken, 'new-token');
      expect(current.email, testUser.email);
      expect(tokens.writeCalls, 1);
      expect(tokens.clearCalls, 1);
      expect(adapter.requests.map((request) => request.path), [
        '/api/auth/token',
        '/api/auth/session',
        '/api/auth/logout',
      ]);
      expect(adapter.requests.first.method, 'POST');
      expect(adapter.requests.first.data, {
        'email': 'test@zemoney.local',
        'password': 'secret',
      });
    },
  );

  test('logout clears the local token even when revocation fails', () async {
    final (repository, tokens, _) = await _repository([
      const _Response({
        'error': {'code': 'SERVER_ERROR', 'message': 'Temporarily unavailable'},
      }, status: 503),
    ]);

    await expectLater(repository.logout(), throwsA(isA<ApiException>()));
    expect(tokens.clearCalls, 1);
    expect(tokens.token, isNull);
  });

  test(
    'read queries preserve filters and decode shared ledger contracts',
    () async {
      final (repository, _, adapter) = await _repository([
        _Response({
          'data': [foodCategory.toJson()],
        }),
        _Response({'data': testStatistics.toJson()}),
        _Response({
          'data': {
            'items': [testTransaction.toJson()],
            'pagination': {
              'page': 2,
              'limit': 20,
              'total': 21,
              'totalPages': 2,
            },
            'totals': [
              {
                'currency': 'USD',
                'expenseMinor': 9900,
                'refundMinor': 0,
                'incomeMinor': 0,
                'transferMinor': 0,
              },
            ],
          },
        }),
        _Response({'data': testTransaction.toJson()}),
      ]);

      final categories = await repository.categories();
      final statistics = await repository.statistics('2026-07', 'CNY');
      final page = await repository.transactions(
        page: 2,
        keyword: 'Coffee',
        type: 'expense',
        source: 'manual',
        uncategorized: true,
        currency: 'USD',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-31',
      );
      final transaction = await repository.transaction('tx-1');

      expect(categories.single.name, 'Food');
      expect(statistics.summary.netExpenseMinor, 240000);
      expect(page.pagination.totalPages, 2);
      expect(page.totals?.single.currency, 'USD');
      expect(page.totals?.single.expenseMinor, 9900);
      expect(transaction.currentRevisionId, 'revision-1');
      expect(adapter.requests[1].queryParameters, {
        'month': '2026-07',
        'currency': 'CNY',
      });
      expect(adapter.requests[2].queryParameters, {
        'page': 2,
        'limit': 20,
        'keyword': 'Coffee',
        'type': 'expense',
        'source': 'manual',
        'uncategorized': 'true',
        'currency': 'USD',
        'dateFrom': '2026-07-01',
        'dateTo': '2026-07-31',
      });
      expect(adapter.requests[3].path, '/api/transactions/tx-1');
    },
  );

  test(
    'write operations forward ledger identities and profile changes',
    () async {
      final (repository, _, adapter) = await _repository([
        const _Response({
          'data': {'id': 'tx-created'},
        }, status: 201),
        const _Response({
          'data': {'id': 'tx-1', 'currentRevisionId': 'revision-2'},
        }),
        const _Response({
          'data': {'id': 'tx-1'},
        }),
        const _Response({
          'data': {'displayName': 'New nickname', 'avatarPreset': 'cat'},
        }),
      ]);
      final facts = {'type': 'expense', 'amount': '35.80'};

      await repository.createTransaction(facts);
      await repository.amendTransaction('tx-1', {
        ...facts,
        'expectedRevisionId': 'revision-1',
        'operationId': 'operation-1',
      });
      await repository.voidTransaction('tx-1', 'revision-2', 'operation-2');
      final profile = await repository.updateProfile(
        testUser,
        displayName: 'New nickname',
        avatarPreset: 'cat',
      );

      expect(adapter.requests.map((request) => request.method), [
        'POST',
        'PATCH',
        'DELETE',
        'PATCH',
      ]);
      expect(adapter.requests[2].data, {
        'expectedRevisionId': 'revision-2',
        'operationId': 'operation-2',
      });
      expect(adapter.requests[3].path, '/api/settings/profile');
      expect(profile.displayName, 'New nickname');
      expect(profile.avatarPreset, 'cat');
    },
  );

  test(
    'administrator account operations preserve the mobile API contract',
    () async {
      const account = {
        'id': 'member-user',
        'email': 'member@zemoney.local',
        'displayName': 'Regular account',
        'role': 'member',
        'disabled': false,
        'createdAt': '2026-07-29T00:00:00.000Z',
      };
      final disabledAccount = Map<String, Object>.from(account)
        ..['disabled'] = true;
      final (repository, _, adapter) = await _repository([
        const _Response({
          'data': {
            'items': [account],
            'pagination': {'page': 1, 'limit': 20, 'total': 1, 'totalPages': 1},
          },
        }),
        const _Response({'data': account}, status: 201),
        const _Response({
          'data': {'requiresReauthentication': false},
        }),
        _Response({'data': disabledAccount}),
      ]);

      final page = await repository.adminAccounts();
      final created = await repository.createMemberAccount(
        email: 'member@zemoney.local',
        displayName: 'Regular account',
        password: 'member-account-password',
      );
      final reauthenticate = await repository.resetAccountPassword(
        accountId: 'member-user',
        adminPassword: 'admin-current-password',
        newPassword: 'member-new-password',
      );
      final disabled = await repository.setAccountDisabled(
        accountId: 'member-user',
        disabled: true,
      );

      expect(page.items.single.email, 'member@zemoney.local');
      expect(created.role, 'member');
      expect(reauthenticate, isFalse);
      expect(disabled.disabled, isTrue);
      expect(adapter.requests.map((request) => request.path), [
        '/api/admin/accounts',
        '/api/admin/accounts',
        '/api/admin/accounts/member-user/password',
        '/api/admin/accounts/member-user/status',
      ]);
      expect(adapter.requests.first.queryParameters, {'page': 1, 'limit': 20});
      expect(adapter.requests[1].data, {
        'email': 'member@zemoney.local',
        'displayName': 'Regular account',
        'password': 'member-account-password',
      });
      expect(adapter.requests[2].data, {
        'adminPassword': 'admin-current-password',
        'newPassword': 'member-new-password',
      });
      expect(adapter.requests[3].data, {'disabled': true});
    },
  );

  test(
    'screenshot operations cover provider, multipart, review, and confirmation',
    () async {
      final directory = await Directory.systemTemp.createTemp('zemoney-test-');
      addTearDown(() => directory.delete(recursive: true));
      final image = File('${directory.path}/payment.png');
      await image.writeAsBytes(const [137, 80, 78, 71]);
      final (repository, _, adapter) = await _repository([
        _Response({'data': testProviderInfo.toJson()}),
        _Response({
          'data': [testRecognitionJob.toJson()],
        }),
        const _Response({
          'data': {'jobId': 'job-1'},
        }, status: 201),
        _Response({'data': testRecognitionReview.toJson()}),
        _Response({'data': testRecognitionItem.toJson()}),
        const _Response({
          'data': {'createdCount': 1, 'skippedCount': 0, 'failedCount': 0},
        }),
      ]);

      final provider = await repository.recognitionProvider();
      final jobs = await repository.recognitionJobs();
      final jobId = await repository.uploadScreenshots([
        XFile(image.path, name: 'payment.png'),
      ], consentToThirdParty: false);
      final review = await repository.recognitionReview(jobId);
      final item = await repository.updateRecognitionItem(jobId, 'item-1', {
        'decision': 'import',
      });
      final result = await repository.confirmRecognition(jobId);

      expect(provider.sendsImagesToThirdParty, isFalse);
      expect(jobs.single.status, 'reviewing');
      expect(review.items.single.fileName, 'payment.png');
      expect(item.amountMinor, 3580);
      expect(result['createdCount'], 1);
      final form = adapter.requests[2].data as FormData;
      expect(form.fields.single.value, 'false');
      expect(form.files.single.key, 'images');
      expect(form.files.single.value.filename, 'payment.png');
      expect(form.files.single.value.contentType.toString(), 'image/png');
      expect(adapter.requests.map((request) => request.path), [
        '/api/imports/screenshots/provider',
        '/api/imports/screenshots',
        '/api/imports/screenshots',
        '/api/imports/screenshots/job-1',
        '/api/imports/screenshots/job-1/items/item-1',
        '/api/imports/screenshots/job-1/confirm',
      ]);
    },
  );

  test(
    'notification capture settings round-trip the mobile API contract',
    () async {
      const settings = {
        'autoPostAlipay': true,
        'autoPostWechat': false,
        'autoPostCmb': false,
        'autoPostMaxAmountMinor': 50000,
        'autoPostTrustedMaxAmountMinor': 500000,
      };
      final (repository, _, adapter) = await _repository([
        const _Response({'data': settings}),
        const _Response({'data': settings}),
      ]);

      final loaded = await repository.notificationCaptureSettings();
      final updated = await repository.updateNotificationCaptureSettings({
        'autoPostAlipay': true,
      });

      expect(loaded.autoPostAlipay, isTrue);
      expect(loaded.autoPostWechat, isFalse);
      expect(loaded.autoPostMaxAmountMinor, 50000);
      expect(updated.autoPostAlipay, isTrue);
      expect(adapter.requests.map((request) => request.path), [
        '/api/captures/settings',
        '/api/captures/settings',
      ]);
      expect(adapter.requests[1].method, 'PUT');
      expect(adapter.requests[1].data, {'autoPostAlipay': true});
    },
  );
  test(
    'pending screenshots and reviewed notification batches use dedicated endpoints',
    () async {
      final (repository, _, adapter) = await _repository([
        _Response({
          'data': [testRecognitionJob.toJson()],
        }),
        const _Response({
          'data': {'status': 'completed', 'outcomes': []},
        }),
      ]);
      expect(await repository.pendingRecognitionJobs(), hasLength(1));
      await repository.confirmNotificationCaptures([testNotificationCapture]);
      expect(adapter.requests[0].queryParameters, {'status': 'pending'});
      expect(adapter.requests[1].path, '/api/captures/notifications/confirm');
      expect(adapter.requests[1].data, {
        'items': [
          {'id': testNotificationCapture.id, 'version': 1},
        ],
      });
    },
  );
}
