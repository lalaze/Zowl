import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:image_picker/image_picker.dart';
import 'package:riverpod/misc.dart' show Override;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:zowl_mobile/core/api.dart';
import 'package:zowl_mobile/core/l10n.dart';
import 'package:zowl_mobile/core/config.dart';
import 'package:zowl_mobile/core/models.dart';
import 'package:zowl_mobile/core/payment_capture.dart';
import 'package:zowl_mobile/core/providers.dart';
import 'package:zowl_mobile/core/repository.dart';
import 'package:zowl_mobile/core/screenshot_picker.dart';
import 'package:zowl_mobile/core/theme.dart';

import 'fixtures.dart';

class FakeTokenStore extends TokenStore {
  FakeTokenStore(SharedPreferences preferences, {this.token = 'test-token'})
    : super(const FlutterSecureStorage(), preferences);

  String? token;
  int writeCalls = 0;
  int clearCalls = 0;

  @override
  Future<String?> read() async => token;

  @override
  Future<void> write(String value) async {
    writeCalls++;
    token = value;
  }

  @override
  Future<void> clear() async {
    clearCalls++;
    token = null;
  }
}

class FakeScreenshotPicker implements ScreenshotPicker {
  List<XFile> files = const [];
  int calls = 0;
  int? requestedLimit;

  @override
  Future<List<XFile>> pickScreenshots({int limit = 10}) async {
    calls++;
    requestedLimit = limit;
    return files;
  }
}

class FakePaymentCaptureBridge implements PaymentCaptureBridge {
  String? pendingRouteForTest;
  PaymentCaptureStatus status = const PaymentCaptureStatus(
    supported: true,
    enabled: false,
    alipayEnabled: true,
    wechatEnabled: true,
    queuedCount: 0,
    authPaused: false,
  );
  int accessibilitySettingsCalls = 0;
  int notificationPermissionCalls = 0;
  int configureCalls = 0;
  int pauseCalls = 0;
  int clearCalls = 0;
  int flushCalls = 0;
  int resetDiagnosticsCalls = 0;
  int exportCaptureLogCalls = 0;
  final orderDetailsCalls = <bool>[];
  bool captureLogAvailable = true;
  String? configuredBaseUrl;
  String? configuredToken;
  String? configuredUserId;

  void enableForTest() {
    status = _updated(enabled: true);
  }

  void setDiagnosticsForTest(List<PaymentCaptureDiagnostic> diagnostics) {
    status = _updated(diagnostics: diagnostics);
  }

  PaymentCaptureStatus _updated({
    bool? enabled,
    bool? alipayEnabled,
    bool? wechatEnabled,
    bool? taobaoEnabled,
    bool? pinduoduoEnabled,
    bool? jdEnabled,
    bool? pupuEnabled,
    bool? xianyuEnabled,
    bool? orderDetailsEnabled,
    List<PaymentCaptureDiagnostic>? diagnostics,
  }) => PaymentCaptureStatus(
    accessibilityAccessGranted: status.accessibilityAccessGranted,
    accessibilityConnected: status.accessibilityConnected,
    supported: status.supported,
    enabled: enabled ?? status.enabled,
    alipayEnabled: alipayEnabled ?? status.alipayEnabled,
    wechatEnabled: wechatEnabled ?? status.wechatEnabled,
    taobaoEnabled: taobaoEnabled ?? status.taobaoEnabled,
    pinduoduoEnabled: pinduoduoEnabled ?? status.pinduoduoEnabled,
    jdEnabled: jdEnabled ?? status.jdEnabled,
    pupuEnabled: pupuEnabled ?? status.pupuEnabled,
    xianyuEnabled: xianyuEnabled ?? status.xianyuEnabled,
    orderDetailsEnabled: orderDetailsEnabled ?? status.orderDetailsEnabled,
    queuedCount: status.queuedCount,
    authPaused: status.authPaused,
    lastCaptureAt: status.lastCaptureAt,
    syncError: status.syncError,
    diagnostics: diagnostics ?? status.diagnostics,
  );

  @override
  Stream<String> get routes => const Stream.empty();

  @override
  Future<PaymentCaptureStatus> getStatus() async => status;

  @override
  Future<void> openAccessibilitySettings() async {
    accessibilitySettingsCalls++;
  }

  @override
  Future<void> requestNotificationPermission() async {
    notificationPermissionCalls++;
  }

  @override
  Future<PaymentCaptureStatus> setEnabled(bool enabled) async {
    status = _updated(enabled: enabled);
    return status;
  }

  @override
  Future<PaymentCaptureStatus> setSourceEnabled(
    String platform,
    bool enabled,
  ) async {
    status = switch (platform) {
      'alipay' => _updated(alipayEnabled: enabled),
      'wechat' => _updated(wechatEnabled: enabled),
      'taobao' => _updated(taobaoEnabled: enabled),
      'pinduoduo' => _updated(pinduoduoEnabled: enabled),
      'jd' => _updated(jdEnabled: enabled),
      'pupu' => _updated(pupuEnabled: enabled),
      'xianyu' => _updated(xianyuEnabled: enabled),
      _ => status,
    };
    return status;
  }

  @override
  Future<PaymentCaptureStatus> setOrderDetailsEnabled(bool enabled) async {
    orderDetailsCalls.add(enabled);
    status = _updated(orderDetailsEnabled: enabled);
    return status;
  }

  @override
  Future<void> configureSession(
    String apiBaseUrl,
    String token,
    String userId,
  ) async {
    configureCalls++;
    configuredBaseUrl = apiBaseUrl;
    configuredToken = token;
    configuredUserId = userId;
  }

  @override
  Future<void> pauseSession() async {
    pauseCalls++;
  }

  @override
  Future<void> clearSession() async {
    clearCalls++;
    status = _updated(enabled: false);
  }

  @override
  Future<void> flushNow() async {
    flushCalls++;
  }

  @override
  Future<PaymentCaptureStatus> resetDiagnostics() async {
    resetDiagnosticsCalls++;
    status = PaymentCaptureStatus(
      accessibilityAccessGranted: status.accessibilityAccessGranted,
      accessibilityConnected: status.accessibilityConnected,
      supported: status.supported,
      enabled: status.enabled,
      alipayEnabled: status.alipayEnabled,
      wechatEnabled: status.wechatEnabled,
      taobaoEnabled: status.taobaoEnabled,
      pinduoduoEnabled: status.pinduoduoEnabled,
      jdEnabled: status.jdEnabled,
      pupuEnabled: status.pupuEnabled,
      xianyuEnabled: status.xianyuEnabled,
      orderDetailsEnabled: status.orderDetailsEnabled,
      queuedCount: status.queuedCount,
      authPaused: status.authPaused,
      lastCaptureAt: status.lastCaptureAt,
      syncError: status.syncError,
    );
    return status;
  }

  @override
  Future<bool> exportCaptureLog() async {
    exportCaptureLogCalls += 1;
    return captureLogAvailable;
  }

  @override
  Future<String?> takePendingRoute() async {
    final route = pendingRouteForTest;
    pendingRouteForTest = null;
    return route;
  }
}

class TransactionRequest {
  const TransactionRequest({
    required this.page,
    required this.limit,
    this.keyword,
    this.type,
    this.source,
    this.categoryId,
    this.uncategorized,
    this.currency,
    this.dateFrom,
    this.dateTo,
  });

  final int page;
  final int limit;
  final String? keyword;
  final String? type;
  final String? source;
  final String? categoryId;
  final bool? uncategorized;
  final String? currency;
  final String? dateFrom;
  final String? dateTo;
}

class FakeZowlRepository extends ZowlRepository {
  FakeZowlRepository(super.api, super.tokenStore);

  SessionUser user = testUser;
  List<Category> categoryItems = const [foodCategory, salaryCategory];
  StatisticsOverview statisticsValue = testStatistics;
  TransactionPage transactionPage = const TransactionPage(
    items: [testTransaction],
    pagination: Pagination(page: 1, limit: 20, total: 1, totalPages: 1),
  );
  TransactionItem transactionValue = testTransaction;
  RecognitionProviderInfo providerInfo = testProviderInfo;
  List<RecognitionJob> jobs = const [];
  RecognitionReview review = testRecognitionReview;
  NotificationCapturePage notificationCapturePage = testNotificationCapturePage;
  NotificationCaptureSettings notificationCaptureSettingsValue =
      const NotificationCaptureSettings(
        autoPostAlipay: false,
        autoPostWechat: false,
        autoPostCmb: false,
        autoPostMaxAmountMinor: 50000,
        autoPostTrustedMaxAmountMinor: 500000,
      );
  AdminAccountPage adminAccountPage = const AdminAccountPage(
    items: [],
    pagination: Pagination(page: 1, limit: 20, total: 0, totalPages: 1),
  );

  Future<TokenSession> Function(String, String)? loginHandler;
  Future<SessionUser> Function()? sessionHandler;
  Future<void> Function()? logoutHandler;
  Future<List<Category>> Function()? categoriesHandler;
  Future<StatisticsOverview> Function(String, String)? statisticsHandler;
  Future<TransactionPage> Function(TransactionRequest)? transactionsHandler;
  Future<TransactionItem> Function(String)? transactionHandler;
  Future<Map<String, dynamic>> Function(Map<String, dynamic>)? createHandler;
  Future<Map<String, dynamic>> Function(String, Map<String, dynamic>)?
  amendHandler;
  Future<Map<String, dynamic>> Function(String, String, String)? voidHandler;
  Future<RecognitionProviderInfo> Function()? providerHandler;
  Future<List<RecognitionJob>> Function()? jobsHandler;
  Future<String> Function(List<XFile>, bool, ProgressCallback?)? uploadHandler;
  Future<RecognitionReview> Function(String)? reviewHandler;
  Future<RecognitionItem> Function(String, String, Map<String, dynamic>)?
  updateRecognitionHandler;
  Future<Map<String, dynamic>> Function(String)? confirmRecognitionHandler;
  Future<NotificationCapturePage> Function()? notificationCapturesHandler;
  Future<NotificationCapturePage> Function(String status, int page)?
  notificationCapturesPageHandler;
  final requestedCapturePages = <int>[];
  List<NotificationCaptureItem>? lastBatch;
  Future<Map<String, dynamic>> Function(List<NotificationCaptureItem>)?
  batchConfirmHandler;
  Future<NotificationCaptureItem> Function(String, Map<String, dynamic>)?
  updateNotificationCaptureHandler;
  Future<Map<String, dynamic>> Function(String, String, String?)?
  confirmNotificationCaptureHandler;
  Future<Map<String, dynamic>> Function(String, String?)?
  quickConfirmNotificationCaptureHandler;
  Future<NotificationCaptureSettings> Function()?
  notificationCaptureSettingsHandler;
  Future<NotificationCaptureSettings> Function(Map<String, dynamic>)?
  updateNotificationCaptureSettingsHandler;
  Future<SessionUser> Function(SessionUser, String?, String?)? profileHandler;
  Future<AdminAccountPage> Function(int, int)? adminAccountsHandler;
  Future<AdminAccount> Function(String, String?, String)?
  createMemberAccountHandler;
  Future<bool> Function(String, String, String)? resetAccountPasswordHandler;
  Future<AdminAccount> Function(String, bool)? setAccountDisabledHandler;

  final transactionRequests = <TransactionRequest>[];
  final createInputs = <Map<String, dynamic>>[];
  final amendInputs = <Map<String, dynamic>>[];
  final recognitionInputs = <Map<String, dynamic>>[];
  final notificationCaptureInputs = <Map<String, dynamic>>[];
  int uploadCalls = 0;
  final uploadSubmissionIds = <String?>[];
  final uploadAutoConfirm = <bool>[];
  int loginCalls = 0;
  int sessionCalls = 0;
  int logoutCalls = 0;
  int voidCalls = 0;
  int notificationCaptureReads = 0;
  int adminAccountReads = 0;
  final adminAccountCreates = <Map<String, String?>>[];
  final adminPasswordResets = <Map<String, String>>[];
  final adminStatusUpdates = <Map<String, Object>>[];
  bool? lastUploadConsent;
  String? lastVoidedId;
  String? lastExpectedRevisionId;

  @override
  Future<TokenSession> login(String email, String password) async {
    loginCalls++;
    final session =
        await (loginHandler?.call(email, password) ??
            Future.value(
              TokenSession(
                tokenType: 'Bearer',
                accessToken: 'signed-in-token',
                expiresAt: '2026-08-01T00:00:00.000Z',
                user: user,
              ),
            ));
    await tokenStore.write(session.accessToken);
    return session;
  }

  @override
  Future<SessionUser> session() {
    sessionCalls++;
    return sessionHandler?.call() ?? Future.value(user);
  }

  @override
  Future<void> logout() async {
    logoutCalls++;
    if (logoutHandler != null) return logoutHandler!.call();
    await tokenStore.clear();
  }

  @override
  Future<List<Category>> categories() =>
      categoriesHandler?.call() ?? Future.value(categoryItems);

  @override
  Future<StatisticsOverview> statistics(String month, String currency) =>
      statisticsHandler?.call(month, currency) ?? Future.value(statisticsValue);

  @override
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
  }) {
    final request = TransactionRequest(
      page: page,
      limit: limit,
      keyword: keyword,
      type: type,
      source: source,
      categoryId: categoryId,
      uncategorized: uncategorized,
      currency: currency,
      dateFrom: dateFrom,
      dateTo: dateTo,
    );
    transactionRequests.add(request);
    return transactionsHandler?.call(request) ?? Future.value(transactionPage);
  }

  @override
  Future<TransactionItem> transaction(String id) =>
      transactionHandler?.call(id) ?? Future.value(transactionValue);

  @override
  Future<Map<String, dynamic>> createTransaction(Map<String, dynamic> input) {
    createInputs.add(input);
    return createHandler?.call(input) ?? Future.value({'id': 'tx-created'});
  }

  @override
  Future<Map<String, dynamic>> amendTransaction(
    String id,
    Map<String, dynamic> input,
  ) {
    amendInputs.add(input);
    return amendHandler?.call(id, input) ?? Future.value({'id': id});
  }

  @override
  Future<Map<String, dynamic>> voidTransaction(
    String id,
    String expectedRevisionId,
    String operationId,
  ) {
    voidCalls++;
    lastVoidedId = id;
    lastExpectedRevisionId = expectedRevisionId;
    return voidHandler?.call(id, expectedRevisionId, operationId) ??
        Future.value({'id': id});
  }

  @override
  Future<RecognitionProviderInfo> recognitionProvider() =>
      providerHandler?.call() ?? Future.value(providerInfo);

  @override
  Future<List<RecognitionJob>> pendingRecognitionJobs() => recognitionJobs();

  @override
  Future<List<RecognitionJob>> recognitionJobs() =>
      jobsHandler?.call() ?? Future.value(jobs);

  @override
  Future<String> uploadScreenshots(
    List<XFile> files, {
    required bool consentToThirdParty,
    bool autoConfirm = false,
    String? submissionId,
    ProgressCallback? onProgress,
  }) {
    uploadCalls++;
    uploadSubmissionIds.add(submissionId);
    uploadAutoConfirm.add(autoConfirm);
    lastUploadConsent = consentToThirdParty;
    return uploadHandler?.call(files, consentToThirdParty, onProgress) ??
        Future.value('job-1');
  }

  @override
  Future<RecognitionReview> recognitionReview(String jobId) =>
      reviewHandler?.call(jobId) ?? Future.value(review);

  @override
  Future<RecognitionItem> updateRecognitionItem(
    String jobId,
    String itemId,
    Map<String, dynamic> input,
  ) {
    recognitionInputs.add(input);
    return updateRecognitionHandler?.call(jobId, itemId, input) ??
        Future.value(testRecognitionItem);
  }

  @override
  Future<Map<String, dynamic>> confirmRecognition(String jobId) =>
      confirmRecognitionHandler?.call(jobId) ??
      Future.value({'createdCount': 1, 'skippedCount': 0, 'failedCount': 0});

  @override
  Future<NotificationCapturePage> notificationCaptures({
    String status = 'reviewing',
    int page = 1,
    int limit = 20,
  }) {
    notificationCaptureReads++;
    requestedCapturePages.add(page);
    return notificationCapturesPageHandler?.call(status, page) ??
        notificationCapturesHandler?.call() ??
        Future.value(notificationCapturePage);
  }

  @override
  Future<Map<String, dynamic>> confirmNotificationCaptures(
    List<NotificationCaptureItem> items,
  ) {
    lastBatch = items;
    return batchConfirmHandler?.call(items) ??
        Future.value({'status': 'completed'});
  }

  @override
  Future<NotificationCaptureItem> updateNotificationCapture(
    String id,
    Map<String, dynamic> input,
  ) {
    notificationCaptureInputs.add(input);
    return updateNotificationCaptureHandler?.call(id, input) ??
        Future.value(testNotificationCapture);
  }

  @override
  Future<Map<String, dynamic>> confirmNotificationCapture(
    String id, {
    required String decision,
    String? assessmentDigest,
  }) {
    notificationCaptureInputs.add({
      'id': id,
      'decision': decision,
      'assessmentDigest': ?assessmentDigest,
    });
    return confirmNotificationCaptureHandler?.call(
          id,
          decision,
          assessmentDigest,
        ) ??
        Future.value({'status': 'completed'});
  }

  @override
  Future<Map<String, dynamic>> quickConfirmNotificationCapture(
    String id, {
    String? merchantName,
  }) {
    notificationCaptureInputs.add({'id': id, 'merchantName': ?merchantName});
    return quickConfirmNotificationCaptureHandler?.call(id, merchantName) ??
        Future.value({'status': 'completed'});
  }

  @override
  Future<NotificationCaptureSettings> notificationCaptureSettings() =>
      notificationCaptureSettingsHandler?.call() ??
      Future.value(notificationCaptureSettingsValue);

  final notificationCaptureSettingsInputs = <Map<String, dynamic>>[];

  @override
  Future<NotificationCaptureSettings> updateNotificationCaptureSettings(
    Map<String, dynamic> input,
  ) {
    notificationCaptureSettingsInputs.add(input);
    return updateNotificationCaptureSettingsHandler?.call(input) ??
        Future.value(notificationCaptureSettingsValue);
  }

  @override
  Future<SessionUser> updateProfile(
    SessionUser current, {
    String? displayName,
    String? avatarPreset,
  }) =>
      profileHandler?.call(current, displayName, avatarPreset) ??
      Future.value(
        current.copyWith(displayName: displayName, avatarPreset: avatarPreset),
      );

  @override
  Future<AdminAccountPage> adminAccounts({int page = 1, int limit = 20}) {
    adminAccountReads++;
    return adminAccountsHandler?.call(page, limit) ??
        Future.value(adminAccountPage);
  }

  @override
  Future<AdminAccount> createMemberAccount({
    required String email,
    String? displayName,
    required String password,
  }) {
    adminAccountCreates.add({
      'email': email,
      'displayName': displayName,
      'password': password,
    });
    return createMemberAccountHandler?.call(email, displayName, password) ??
        Future.value(
          AdminAccount(
            id: 'created-account',
            email: email,
            displayName: displayName ?? email.split('@').first,
            role: 'member',
            disabled: false,
            createdAt: '2026-07-29T00:00:00.000Z',
          ),
        );
  }

  @override
  Future<bool> resetAccountPassword({
    required String accountId,
    required String adminPassword,
    required String newPassword,
  }) {
    adminPasswordResets.add({
      'accountId': accountId,
      'adminPassword': adminPassword,
      'newPassword': newPassword,
    });
    return resetAccountPasswordHandler?.call(
          accountId,
          adminPassword,
          newPassword,
        ) ??
        Future.value(false);
  }

  @override
  Future<AdminAccount> setAccountDisabled({
    required String accountId,
    required bool disabled,
  }) {
    adminStatusUpdates.add({'accountId': accountId, 'disabled': disabled});
    return setAccountDisabledHandler?.call(accountId, disabled) ??
        Future.value(
          AdminAccount(
            id: accountId,
            email: 'member@zowl.local',
            displayName: 'Regular account',
            role: 'member',
            disabled: disabled,
            createdAt: '2026-07-29T00:00:00.000Z',
          ),
        );
  }
}

class MobileTestHarness {
  const MobileTestHarness({
    required this.preferences,
    required this.tokens,
    required this.api,
    required this.repository,
    required this.picker,
    required this.capture,
  });

  final SharedPreferences preferences;
  final FakeTokenStore tokens;
  final ApiClient api;
  final FakeZowlRepository repository;
  final FakeScreenshotPicker picker;
  final FakePaymentCaptureBridge capture;

  static Future<MobileTestHarness> create({
    String? token = 'test-token',
  }) async {
    SharedPreferences.setMockInitialValues({});
    final preferences = await SharedPreferences.getInstance();
    final tokens = FakeTokenStore(preferences, token: token);
    final api = ApiClient(
      ApiConfig.parse('http://100.64.0.10:3000', release: false),
      tokens,
    );
    return MobileTestHarness(
      preferences: preferences,
      tokens: tokens,
      api: api,
      repository: FakeZowlRepository(api, tokens),
      picker: FakeScreenshotPicker(),
      capture: FakePaymentCaptureBridge(),
    );
  }

  List<Override> get overrides => [
    apiConfigProvider.overrideWithValue(
      ApiConfig.parse('http://100.64.0.10:3000', release: false),
    ),
    preferencesProvider.overrideWithValue(preferences),
    tokenStoreProvider.overrideWithValue(tokens),
    apiClientProvider.overrideWithValue(api),
    repositoryProvider.overrideWithValue(repository),
    screenshotPickerProvider.overrideWithValue(picker),
    paymentCaptureBridgeProvider.overrideWithValue(capture),
  ];

  Widget screen(
    Widget child, {
    Brightness brightness = Brightness.light,
    double textScale = 1,
  }) => ProviderScope(
    overrides: overrides,
    retry: (_, _) => null,
    child: MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: buildTheme(AccentColor.amber, brightness),
      locale: appLocale,
      supportedLocales: supportedAppLocales,
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(
          context,
        ).copyWith(textScaler: TextScaler.linear(textScale)),
        child: child!,
      ),
      home: child,
    ),
  );
}
