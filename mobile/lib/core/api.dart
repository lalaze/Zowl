import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'config.dart';
import 'l10n.dart';

class TokenStore {
  TokenStore(this._storage, this._preferences);

  // Kept from the zeMoney name: renaming them would sign existing users out.
  static const _tokenKey = 'zemoney_access_token';
  static const _installedKey = 'zemoney_install_initialized';

  final FlutterSecureStorage _storage;
  final SharedPreferences _preferences;

  // Every request reads the token; keep it in memory so only the first read
  // pays for a Keychain/Keystore round trip. This store is the only writer.
  String? _cachedToken;
  bool _cacheLoaded = false;

  Future<void> initialize() async {
    if (!_preferences.containsKey(_installedKey)) {
      await clear();
      await _preferences.setBool(_installedKey, true);
    }
  }

  Future<String?> read() async {
    if (_cacheLoaded) return _cachedToken;
    final token = await _storage.read(key: _tokenKey);
    if (!_cacheLoaded) {
      _cachedToken = token;
      _cacheLoaded = true;
    }
    return _cachedToken;
  }

  Future<void> write(String token) async {
    _cachedToken = token;
    _cacheLoaded = true;
    await _storage.write(key: _tokenKey, value: token);
  }

  Future<void> clear() async {
    _cachedToken = null;
    _cacheLoaded = true;
    await _storage.delete(key: _tokenKey);
  }
}

class ApiException implements Exception {
  const ApiException({
    required this.statusCode,
    required this.code,
    required this.message,
    this.fieldErrors = const {},
    this.data,
  });

  final int statusCode;
  final String code;
  final String message;
  final Map<String, List<String>> fieldErrors;
  final dynamic data;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient(ApiConfig config, this._tokenStore, {this.onUnauthorized})
    : dio = Dio(
        BaseOptions(
          baseUrl: config.baseUrl,
          connectTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 45),
          sendTimeout: const Duration(seconds: 45),
          validateStatus: (_) => true,
          headers: const {'accept': 'application/json'},
        ),
      ) {
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _tokenStore.read();
          if (token != null) options.headers['authorization'] = 'Bearer $token';
          options.headers['accept-language'] = acceptLanguage;
          handler.next(options);
        },
        onResponse: (response, handler) async {
          // Only a request that carried a session can lose it. A 401 to the
          // sign-in request itself means wrong credentials, not an expiry.
          final sentSession =
              response.requestOptions.headers['authorization'] != null;
          if (response.statusCode == 401 && sentSession) {
            await _tokenStore.clear();
            await onUnauthorized?.call();
          }
          handler.next(response);
        },
      ),
    );
  }

  final Dio dio;
  final TokenStore _tokenStore;
  final Future<void> Function()? onUnauthorized;

  String absoluteUrl(String path) => dio.options.baseUrl + path;

  Future<Map<String, String>> authenticatedHeaders() async {
    final token = await _tokenStore.read();
    return token == null ? const {} : {'Authorization': 'Bearer $token'};
  }

  Future<T> requestData<T>(
    String path, {
    String method = 'GET',
    Object? data,
    Map<String, dynamic>? query,
    T Function(dynamic json)? decode,
    ProgressCallback? onSendProgress,
    Duration? receiveTimeout,
  }) async {
    Response<dynamic> response;
    try {
      response = await dio.request<dynamic>(
        path,
        data: data,
        queryParameters: query,
        options: Options(method: method, receiveTimeout: receiveTimeout),
        onSendProgress: onSendProgress,
      );
    } on DioException catch (error) {
      throw ApiException(
        statusCode: error.response?.statusCode ?? 0,
        code: 'NETWORK_ERROR',
        message: error.type == DioExceptionType.connectionTimeout
            ? tr('Server connection timed out', '连接服务器超时')
            : tr(
                'Cannot connect to the server. Check your connection and try again',
                '无法连接服务器，请检查网络后重试',
              ),
      );
    }

    final body = response.data;
    final status = response.statusCode ?? 0;
    if (status < 200 || status >= 300) {
      final envelope = body is Map ? body : const <String, dynamic>{};
      final error = envelope['error'] is Map
          ? envelope['error'] as Map
          : const <String, dynamic>{};
      final fields = <String, List<String>>{};
      final rawFields = error['fieldErrors'];
      if (rawFields is Map) {
        for (final entry in rawFields.entries) {
          if (entry.value is List) {
            fields[entry.key.toString()] = (entry.value as List)
                .map((item) => item.toString())
                .toList();
          }
        }
      }
      throw ApiException(
        statusCode: status,
        code: error['code']?.toString() ?? 'HTTP_$status',
        message:
            error['message']?.toString() ??
            tr('Request failed. Try again later', '请求失败，请稍后重试'),
        fieldErrors: fields,
        data: envelope['data'],
      );
    }
    if (body is! Map || !body.containsKey('data')) {
      throw ApiException(
        statusCode: 0,
        code: 'INVALID_RESPONSE',
        message: tr('The server returned unrecognized data', '服务器返回了无法识别的数据'),
      );
    }
    final value = body['data'];
    return decode == null ? value as T : decode(value);
  }
}
