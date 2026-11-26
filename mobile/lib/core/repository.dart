import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';

import 'api.dart';
import 'models.dart';

Map<String, dynamic> _map(dynamic value) =>
    Map<String, dynamic>.from(value as Map);

class ZeMoneyRepository {
  const ZeMoneyRepository(this.api, this.tokenStore);

  final ApiClient api;
  final TokenStore tokenStore;

  Future<TokenSession> login(String email, String password) async {
    final session = await api.requestData<TokenSession>(
      '/api/auth/token',
      method: 'POST',
      data: {'email': email, 'password': password},
      decode: (json) => TokenSession.fromJson(_map(json)),
    );
    await tokenStore.write(session.accessToken);
    return session;
  }

  Future<SessionUser> session() => api.requestData<SessionUser>(
    '/api/auth/session',
    decode: (json) => SessionUser.fromJson(_map(_map(json)['user'])),
  );

  Future<void> logout() async {
    try {
      await api.requestData<Map<String, dynamic>>(
        '/api/auth/logout',
        method: 'POST',
        decode: _map,
      );
    } finally {
      await tokenStore.clear();
    }
  }

  Future<AdminAccountPage> adminAccounts({int page = 1, int limit = 20}) =>
      api.requestData<AdminAccountPage>(
        '/api/admin/accounts',
        query: {'page': page, 'limit': limit},
        decode: (json) => AdminAccountPage.fromJson(_map(json)),
      );

  Future<AdminAccount> createMemberAccount({
    required String email,
    String? displayName,
    required String password,
  }) => api.requestData<AdminAccount>(
    '/api/admin/accounts',
    method: 'POST',
    data: {
      'email': email,
      if (displayName?.isNotEmpty ?? false) 'displayName': displayName,
      'password': password,
    },
    decode: (json) => AdminAccount.fromJson(_map(json)),
  );

  Future<bool> resetAccountPassword({
    required String accountId,
    required String adminPassword,
    required String newPassword,
  }) => api.requestData<bool>(
    '/api/admin/accounts/$accountId/password',
    method: 'PATCH',
    data: {'adminPassword': adminPassword, 'newPassword': newPassword},
    decode: (json) => _map(json)['requiresReauthentication'] as bool? ?? false,
  );

  Future<AdminAccount> setAccountDisabled({
    required String accountId,
    required bool disabled,
  }) => api.requestData<AdminAccount>(
    '/api/admin/accounts/$accountId/status',
    method: 'PATCH',
    data: {'disabled': disabled},
    decode: (json) => AdminAccount.fromJson(_map(json)),
  );

  Future<List<Category>> categories() => api.requestData<List<Category>>(
    '/api/categories',
    decode: (json) =>
        (json as List).map((item) => Category.fromJson(_map(item))).toList(),
  );

  Future<StatisticsOverview> statistics(String month, String currency) =>
      api.requestData<StatisticsOverview>(
        '/api/statistics/overview',
        query: {'month': month, 'currency': currency},
        decode: (json) => StatisticsOverview.fromJson(_map(json)),
      );

  Future<TransactionPage> transactions({
    int page = 1,
    int limit = 20,
    String? keyword,
    String? type,
    String? source,
    String? categoryId,
    bool? uncategorized,
    String? currency,
    String? dateFrom,
    String? dateTo,
  }) => api.requestData<TransactionPage>(
    '/api/transactions',
    query: {
      'page': page,
      'limit': limit,
      if (keyword?.isNotEmpty ?? false) 'keyword': keyword,
      if (type?.isNotEmpty ?? false) 'type': type,
      if (source?.isNotEmpty ?? false) 'source': source,
      if (uncategorized == true)
        'uncategorized': 'true'
      else if (categoryId?.isNotEmpty ?? false)
        'categoryId': categoryId,
      if (currency?.isNotEmpty ?? false) 'currency': currency,
      'dateFrom': ?dateFrom,
      'dateTo': ?dateTo,
    },
    decode: (json) => TransactionPage.fromJson(_map(json)),
  );

  Future<TransactionItem> transaction(String id) =>
      api.requestData<TransactionItem>(
        '/api/transactions/$id',
        decode: (json) => TransactionItem.fromJson(_map(json)),
      );

  Future<Map<String, dynamic>> createTransaction(Map<String, dynamic> input) =>
      api.requestData<Map<String, dynamic>>(
        '/api/transactions',
        method: 'POST',
        data: input,
        decode: _map,
      );

  Future<Map<String, dynamic>> amendTransaction(
    String id,
    Map<String, dynamic> input,
  ) => api.requestData<Map<String, dynamic>>(
    '/api/transactions/$id',
    method: 'PATCH',
    data: input,
    decode: _map,
  );

  Future<Map<String, dynamic>> voidTransaction(
    String id,
    String expectedRevisionId,
    String operationId,
  ) => api.requestData<Map<String, dynamic>>(
    '/api/transactions/$id',
    method: 'DELETE',
    data: {
      'expectedRevisionId': expectedRevisionId,
      'operationId': operationId,
    },
    decode: _map,
  );

  Future<RecognitionProviderInfo> recognitionProvider() =>
      api.requestData<RecognitionProviderInfo>(
        '/api/imports/screenshots/provider',
        decode: (json) => RecognitionProviderInfo.fromJson(_map(json)),
      );

  Future<List<RecognitionJob>> recognitionJobs() =>
      api.requestData<List<RecognitionJob>>(
        '/api/imports/screenshots',
        decode: (json) => (json as List)
            .map((item) => RecognitionJob.fromJson(_map(item)))
            .toList(),
      );

  Future<List<RecognitionJob>> pendingRecognitionJobs() =>
      api.requestData<List<RecognitionJob>>(
        '/api/imports/screenshots',
        query: {'status': 'pending'},
        decode: (json) => (json as List)
            .map((item) => RecognitionJob.fromJson(_map(item)))
            .toList(),
      );

  Future<String> uploadScreenshots(
    List<XFile> files, {
    required bool consentToThirdParty,
    bool autoConfirm = false,
    String? submissionId,
    ProgressCallback? onProgress,
  }) async {
    final form = FormData();
    form.fields.add(
      MapEntry('consentToThirdParty', consentToThirdParty.toString()),
    );
    if (autoConfirm) form.fields.add(const MapEntry('autoConfirm', 'true'));
    if (submissionId != null) {
      form.fields.add(MapEntry('submissionId', submissionId));
    }
    for (final file in files) {
      form.files.add(
        MapEntry(
          'images',
          MultipartFile.fromBytes(
            await file.readAsBytes(),
            filename: file.name,
          ),
        ),
      );
    }
    final result = await api.requestData<Map<String, dynamic>>(
      '/api/imports/screenshots',
      method: 'POST',
      data: form,
      onSendProgress: onProgress,
      receiveTimeout: const Duration(minutes: 2),
      decode: _map,
    );
    return result['jobId'].toString();
  }

  Future<RecognitionReview> recognitionReview(String jobId) =>
      api.requestData<RecognitionReview>(
        '/api/imports/screenshots/$jobId',
        decode: (json) => RecognitionReview.fromJson(_map(json)),
      );

  Future<NotificationCapturePage> notificationCaptures({
    String status = 'reviewing',
    int page = 1,
    int limit = 20,
  }) => api.requestData<NotificationCapturePage>(
    '/api/captures/notifications',
    query: {'status': status, 'page': page, 'limit': limit},
    decode: (json) => NotificationCapturePage.fromJson(
      Map<String, dynamic>.from(json as Map),
    ),
  );

  Future<Map<String, dynamic>> confirmNotificationCaptures(
    List<NotificationCaptureItem> items,
  ) => api.requestData<Map<String, dynamic>>(
    '/api/captures/notifications/confirm',
    method: 'POST',
    data: {
      'items': items
          .map((item) => {'id': item.id, 'version': item.confirmationVersion})
          .toList(),
    },
    decode: _map,
  );

  Future<NotificationCaptureItem> updateNotificationCapture(
    String id,
    Map<String, dynamic> input,
  ) => api.requestData<NotificationCaptureItem>(
    '/api/captures/notifications/$id',
    method: 'PATCH',
    data: input,
    decode: (json) => NotificationCaptureItem.fromJson(
      Map<String, dynamic>.from(json as Map),
    ),
  );

  Future<Map<String, dynamic>> confirmNotificationCapture(
    String id, {
    required String decision,
    String? assessmentDigest,
  }) => api.requestData<Map<String, dynamic>>(
    '/api/captures/notifications/$id/confirm',
    method: 'POST',
    data: {'decision': decision, 'assessmentDigest': ?assessmentDigest},
    decode: _map,
  );

  Future<Map<String, dynamic>> quickConfirmNotificationCapture(
    String id, {
    String? merchantName,
  }) => api.requestData<Map<String, dynamic>>(
    '/api/captures/notifications/$id/quick-confirm',
    method: 'POST',
    data: {'merchantName': ?merchantName},
    decode: _map,
  );

  Future<NotificationCaptureSettings> notificationCaptureSettings() =>
      api.requestData<NotificationCaptureSettings>(
        '/api/captures/settings',
        decode: (json) => NotificationCaptureSettings.fromJson(
          Map<String, dynamic>.from(json as Map),
        ),
      );

  Future<NotificationCaptureSettings> updateNotificationCaptureSettings(
    Map<String, dynamic> input,
  ) => api.requestData<NotificationCaptureSettings>(
    '/api/captures/settings',
    method: 'PUT',
    data: input,
    decode: (json) => NotificationCaptureSettings.fromJson(
      Map<String, dynamic>.from(json as Map),
    ),
  );

  Future<RecognitionItem> updateRecognitionItem(
    String jobId,
    String itemId,
    Map<String, dynamic> input,
  ) => api.requestData<RecognitionItem>(
    '/api/imports/screenshots/$jobId/items/$itemId',
    method: 'PATCH',
    data: input,
    decode: (json) => RecognitionItem.fromJson(_map(json)),
  );

  Future<Map<String, dynamic>> confirmRecognition(String jobId) =>
      api.requestData<Map<String, dynamic>>(
        '/api/imports/screenshots/$jobId/confirm',
        method: 'POST',
        decode: _map,
      );

  Future<SessionUser> updateProfile(
    SessionUser current, {
    String? displayName,
    String? avatarPreset,
  }) async {
    final result = await api.requestData<Map<String, dynamic>>(
      '/api/settings/profile',
      method: 'PATCH',
      data: {'displayName': ?displayName, 'avatarPreset': ?avatarPreset},
      decode: _map,
    );
    return current.copyWith(
      displayName: result['displayName']?.toString(),
      avatarPreset: result['avatarPreset']?.toString(),
    );
  }
}
