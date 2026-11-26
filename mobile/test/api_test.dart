import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:zemoney_mobile/core/api.dart';
import 'package:zemoney_mobile/core/config.dart';
import 'package:zemoney_mobile/core/l10n.dart';

class _FakeTokenStore extends TokenStore {
  _FakeTokenStore(SharedPreferences preferences)
    : super(const FlutterSecureStorage(), preferences);

  String? token;
  int clearCalls = 0;

  @override
  Future<String?> read() async => token;

  @override
  Future<void> write(String value) async => token = value;

  @override
  Future<void> clear() async {
    clearCalls++;
    token = null;
  }
}

class _StubAdapter implements HttpClientAdapter {
  _StubAdapter(this.statusCode, this.body, {this.failure});

  final int statusCode;
  final Object? body;
  final DioExceptionType? failure;
  RequestOptions? lastRequest;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    lastRequest = options;
    if (failure != null) {
      throw DioException(requestOptions: options, type: failure!);
    }
    return ResponseBody.fromString(
      jsonEncode(body),
      statusCode,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

class _CountingSecureStorage implements FlutterSecureStorage {
  String? value;
  int reads = 0;

  @override
  dynamic noSuchMethod(Invocation invocation) {
    switch (invocation.memberName) {
      case #read:
        reads++;
        return Future<String?>.value(value);
      case #write:
        value = invocation.namedArguments[#value] as String?;
        return Future<void>.value();
      case #delete:
        value = null;
        return Future<void>.value();
    }
    return super.noSuchMethod(invocation);
  }
}

Future<(_FakeTokenStore, ApiClient)> _client(
  int statusCode,
  Object? body, {
  Future<void> Function()? onUnauthorized,
  DioExceptionType? failure,
}) async {
  SharedPreferences.setMockInitialValues({});
  final preferences = await SharedPreferences.getInstance();
  final tokens = _FakeTokenStore(preferences)..token = 'mobile-token';
  final client = ApiClient(
    ApiConfig.parse('http://100.64.0.10:3000', release: false),
    tokens,
    onUnauthorized: onUnauthorized,
  );
  client.dio.httpClientAdapter = _StubAdapter(
    statusCode,
    body,
    failure: failure,
  );
  return (tokens, client);
}

void main() {
  test('first install clears a restored secure session only once', () async {
    SharedPreferences.setMockInitialValues({});
    final preferences = await SharedPreferences.getInstance();
    final tokens = _FakeTokenStore(preferences)..token = 'restored-token';

    await tokens.initialize();
    expect(tokens.token, isNull);
    expect(tokens.clearCalls, 1);

    tokens.token = 'current-token';
    await tokens.initialize();
    expect(tokens.token, 'current-token');
    expect(tokens.clearCalls, 1);
  });

  test('token reads hit secure storage once and follow writes', () async {
    SharedPreferences.setMockInitialValues({});
    final preferences = await SharedPreferences.getInstance();
    final storage = _CountingSecureStorage()..value = 'stored-token';
    final tokens = TokenStore(storage, preferences);

    expect(await tokens.read(), 'stored-token');
    expect(await tokens.read(), 'stored-token');
    expect(storage.reads, 1);

    await tokens.write('next-token');
    expect(await tokens.read(), 'next-token');
    expect(storage.value, 'next-token');

    await tokens.clear();
    expect(await tokens.read(), isNull);
    expect(storage.value, isNull);
    expect(storage.reads, 1);
  });

  test('decodes the successful data envelope', () async {
    final (_, client) = await _client(200, {
      'data': {'value': 42},
    });

    final result = await client.requestData<int>(
      '/test',
      decode: (json) => (json as Map)['value'] as int,
    );
    expect(result, 42);
  });

  test(
    'adds bearer authorization and forwards the public request options',
    () async {
      final (_, client) = await _client(200, {'data': true});
      final adapter = client.dio.httpClientAdapter as _StubAdapter;

      final result = await client.requestData<bool>(
        '/items',
        method: 'POST',
        data: {'name': 'Coffee'},
        query: {'page': 2},
      );

      expect(result, isTrue);
      expect(adapter.lastRequest?.method, 'POST');
      expect(adapter.lastRequest?.queryParameters, {'page': 2});
      expect(adapter.lastRequest?.data, {'name': 'Coffee'});
      expect(
        adapter.lastRequest?.headers['authorization'],
        'Bearer mobile-token',
      );
      expect(
        client.absoluteUrl('/api/files/file-1'),
        'http://100.64.0.10:3000/api/files/file-1',
      );
      expect(await client.authenticatedHeaders(), {
        'Authorization': 'Bearer mobile-token',
      });
    },
  );

  test('omits authorization when the device has no session', () async {
    final (tokens, client) = await _client(200, {'data': true});
    tokens.token = null;
    final adapter = client.dio.httpClientAdapter as _StubAdapter;

    await client.requestData<bool>('/public');

    expect(adapter.lastRequest?.headers.containsKey('authorization'), isFalse);
    expect(await client.authenticatedHeaders(), isEmpty);
  });

  test('maps 422 field errors and preserves 409 business data', () async {
    final (_, invalidClient) = await _client(422, {
      'error': {
        'code': 'VALIDATION_ERROR',
        'message': 'Check your entries',
        'fieldErrors': {
          'amount': ['Enter an amount'],
        },
      },
    });
    await expectLater(
      invalidClient.requestData<dynamic>('/test'),
      throwsA(
        isA<ApiException>()
            .having((error) => error.statusCode, 'statusCode', 422)
            .having((error) => error.fieldErrors['amount'], 'amount error', [
              'Enter an amount',
            ]),
      ),
    );

    final (_, conflictClient) = await _client(409, {
      'data': {'status': 'revision_conflict'},
    });
    await expectLater(
      conflictClient.requestData<dynamic>('/test'),
      throwsA(
        isA<ApiException>()
            .having((error) => error.statusCode, 'statusCode', 409)
            .having(
              (error) => (error.data as Map)['status'],
              'business status',
              'revision_conflict',
            ),
      ),
    );
  });

  test('a 401 clears the token and notifies the session router', () async {
    var unauthorizedCalls = 0;
    final (tokens, client) = await _client(401, {
      'error': {'code': 'UNAUTHENTICATED', 'message': 'Sign in first'},
    }, onUnauthorized: () async => unauthorizedCalls++);

    await expectLater(
      client.requestData<dynamic>('/test'),
      throwsA(isA<ApiException>()),
    );
    expect(tokens.token, isNull);
    expect(tokens.clearCalls, 1);
    expect(unauthorizedCalls, 1);
  });

  test('a 401 to a request sent without a session is not a sign-out', () async {
    var unauthorizedCalls = 0;
    final (tokens, client) = await _client(401, {
      'error': {
        'code': 'INVALID_CREDENTIALS',
        'message': 'Incorrect email or password',
      },
    }, onUnauthorized: () async => unauthorizedCalls++);
    tokens.token = null;

    await expectLater(
      client.requestData<dynamic>('/api/auth/token', method: 'POST'),
      throwsA(
        isA<ApiException>().having(
          (error) => error.code,
          'code',
          'INVALID_CREDENTIALS',
        ),
      ),
    );
    expect(tokens.clearCalls, 0);
    expect(unauthorizedCalls, 0);
  });

  test(
    'rejects malformed success envelopes and supplies safe HTTP defaults',
    () async {
      final (_, malformed) = await _client(200, {'value': 42});
      await expectLater(
        malformed.requestData<dynamic>('/test'),
        throwsA(
          isA<ApiException>()
              .having((error) => error.code, 'code', 'INVALID_RESPONSE')
              .having(
                (error) => error.toString(),
                'message',
                'The server returned unrecognized data',
              ),
        ),
      );

      final (_, plainFailure) = await _client(503, 'unavailable');
      await expectLater(
        plainFailure.requestData<dynamic>('/test'),
        throwsA(
          isA<ApiException>()
              .having((error) => error.code, 'code', 'HTTP_503')
              .having(
                (error) => error.message,
                'message',
                'Request failed. Try again later',
              ),
        ),
      );
    },
  );

  test(
    'maps transport failures to stable user-facing network errors',
    () async {
      final (_, timeout) = await _client(
        0,
        null,
        failure: DioExceptionType.connectionTimeout,
      );
      await expectLater(
        timeout.requestData<dynamic>('/test'),
        throwsA(
          isA<ApiException>()
              .having((error) => error.statusCode, 'statusCode', 0)
              .having(
                (error) => error.message,
                'message',
                'Server connection timed out',
              ),
        ),
      );

      final (_, offline) = await _client(
        0,
        null,
        failure: DioExceptionType.connectionError,
      );
      await expectLater(
        offline.requestData<dynamic>('/test'),
        throwsA(
          isA<ApiException>().having(
            (error) => error.message,
            'message',
            'Cannot connect to the server. Check your connection and try again',
          ),
        ),
      );
    },
  );

  test('client-side fallbacks and request language follow the UI', () async {
    applyLanguage(AppLanguage.zh);
    addTearDown(() => applyLanguage(AppLanguage.en));

    final (_, timeout) = await _client(
      0,
      null,
      failure: DioExceptionType.connectionTimeout,
    );
    await expectLater(
      timeout.requestData<dynamic>('/test'),
      throwsA(
        isA<ApiException>().having(
          (error) => error.message,
          'message',
          '连接服务器超时',
        ),
      ),
    );
    final adapter = timeout.dio.httpClientAdapter as _StubAdapter;
    expect(
      adapter.lastRequest!.headers['accept-language'],
      startsWith('zh-CN'),
    );

    final (_, offline) = await _client(
      0,
      null,
      failure: DioExceptionType.connectionError,
    );
    await expectLater(
      offline.requestData<dynamic>('/test'),
      throwsA(
        isA<ApiException>().having(
          (error) => error.message,
          'message',
          '无法连接服务器，请检查网络后重试',
        ),
      ),
    );

    final (_, plainFailure) = await _client(503, 'unavailable');
    await expectLater(
      plainFailure.requestData<dynamic>('/test'),
      throwsA(
        isA<ApiException>().having(
          (error) => error.message,
          'message',
          '请求失败，请稍后重试',
        ),
      ),
    );

    final (_, malformed) = await _client(200, {'value': 42});
    await expectLater(
      malformed.requestData<dynamic>('/test'),
      throwsA(
        isA<ApiException>().having(
          (error) => error.message,
          'message',
          '服务器返回了无法识别的数据',
        ),
      ),
    );

    // Server messages arrive already localized and pass through untouched.
    final (_, rejected) = await _client(422, {
      'error': {'code': 'VALIDATION_ERROR', 'message': '请检查填写内容'},
    });
    await expectLater(
      rejected.requestData<dynamic>('/test'),
      throwsA(
        isA<ApiException>().having(
          (error) => error.message,
          'message',
          '请检查填写内容',
        ),
      ),
    );
  });
}
