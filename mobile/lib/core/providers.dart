import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'config.dart';
import 'l10n.dart';
import 'models.dart';
import 'native_language.dart';
import 'payment_capture.dart';
import 'repository.dart';
import 'screenshot_picker.dart';
import 'theme.dart';

final apiConfigProvider = Provider<ApiConfig>(
  (ref) => throw UnimplementedError('ApiConfig must be overridden'),
);
final preferencesProvider = Provider<SharedPreferences>(
  (ref) => throw UnimplementedError('SharedPreferences must be overridden'),
);
final tokenStoreProvider = Provider<TokenStore>(
  (ref) => throw UnimplementedError('TokenStore must be overridden'),
);
final paymentCaptureBridgeProvider = Provider<PaymentCaptureBridge>(
  (ref) => SystemPaymentCaptureBridge(),
);

class SessionInvalidationController extends Notifier<int> {
  @override
  int build() => 0;

  void invalidateSession() => state++;
}

/// Bumped whenever the app returns to the foreground so screens holding their own
/// list state can reload: captures are posted in the background while the app is away.
class ForegroundRefreshController extends Notifier<int> {
  @override
  int build() => 0;

  void bump() => state++;
}

final foregroundRefreshProvider =
    NotifierProvider<ForegroundRefreshController, int>(
      ForegroundRefreshController.new,
    );

final sessionInvalidationProvider =
    NotifierProvider<SessionInvalidationController, int>(
      SessionInvalidationController.new,
    );

final apiClientProvider = Provider<ApiClient>(
  (ref) => ApiClient(
    ref.watch(apiConfigProvider),
    ref.watch(tokenStoreProvider),
    onUnauthorized: () async {
      await ref.read(paymentCaptureBridgeProvider).pauseSession();
      ref.read(sessionInvalidationProvider.notifier).invalidateSession();
    },
  ),
);
final repositoryProvider = Provider<ZeMoneyRepository>(
  (ref) => ZeMoneyRepository(
    ref.watch(apiClientProvider),
    ref.watch(tokenStoreProvider),
  ),
);

final screenshotPickerProvider = Provider<ScreenshotPicker>(
  (ref) => SystemScreenshotPicker(),
);

class AuthController extends AsyncNotifier<SessionUser?> {
  Future<void> _syncCaptureSession(SessionUser user) async {
    final bridge = ref.read(paymentCaptureBridgeProvider);
    final status = await bridge.getStatus();
    if (!status.enabled) return;
    final token = await ref.read(tokenStoreProvider).read();
    if (token == null) return;
    await bridge.configureSession(
      ref.read(apiConfigProvider).baseUrl,
      token,
      user.id,
    );
  }

  @override
  Future<SessionUser?> build() async {
    ref.watch(sessionInvalidationProvider);
    final repository = ref.read(repositoryProvider);
    if (await repository.tokenStore.read() == null) {
      return null;
    }
    try {
      final user = await repository.session();
      await _syncCaptureSession(user);
      return user;
    } on ApiException catch (error) {
      if (error.statusCode == 401) return null;
      rethrow;
    }
  }

  Future<void> login(String email, String password) async {
    state = const AsyncLoading();
    try {
      final session = await ref.read(repositoryProvider).login(email, password);
      await _syncCaptureSession(session.user);
      state = AsyncData(session.user);
    } catch (error, stack) {
      state = const AsyncData(null);
      Error.throwWithStackTrace(error, stack);
    }
  }

  Future<void> logout() async {
    try {
      await ref.read(repositoryProvider).logout();
    } finally {
      await ref.read(paymentCaptureBridgeProvider).clearSession();
      state = const AsyncData(null);
    }
  }

  void replaceUser(SessionUser user) => state = AsyncData(user);
}

final authControllerProvider =
    AsyncNotifierProvider<AuthController, SessionUser?>(AuthController.new);

class AppearanceController extends Notifier<AppAppearance> {
  SharedPreferences get _preferences => ref.read(preferencesProvider);

  @override
  AppAppearance build() => readAppearance(_preferences);

  Future<void> setMode(ThemeMode mode) async {
    await _preferences.setString('zemoney-theme', mode.name);
    state = AppAppearance(mode: mode, accent: state.accent);
  }

  Future<void> setAccent(AccentColor accent) async {
    await _preferences.setString('zemoney-accent', accent.name);
    state = AppAppearance(mode: state.mode, accent: accent);
  }
}

final appearanceProvider =
    NotifierProvider<AppearanceController, AppAppearance>(
      AppearanceController.new,
    );

class LanguageController extends Notifier<AppLanguage> {
  SharedPreferences get _preferences => ref.read(preferencesProvider);

  NativeLanguageBridge get _native => ref.read(nativeLanguageBridgeProvider);

  // Android native text (notifications, the tile, capture errors) follows the
  // same choice, so it is handed over at start and on every change.
  @override
  AppLanguage build() {
    final language = readLanguage(_preferences);
    applyLanguage(language);
    unawaited(_native.setLanguage(language));
    return language;
  }

  Future<void> setLanguage(AppLanguage language) async {
    await _preferences.setString(languagePreferenceKey, language.name);
    // Sent before the switch (channel messages arrive in order), so a screen
    // that reloads native status on the switch already gets the new wording.
    unawaited(_native.setLanguage(language));
    applyLanguage(language);
    state = language;
  }
}

final languageProvider = NotifierProvider<LanguageController, AppLanguage>(
  LanguageController.new,
);

final categoriesProvider = FutureProvider<List<Category>>(
  (ref) => ref.watch(repositoryProvider).categories(),
);

final transactionProvider = FutureProvider.family<TransactionItem, String>(
  (ref, id) => ref.watch(repositoryProvider).transaction(id),
);

final statisticsProvider = FutureProvider.family<StatisticsOverview, String>((
  ref,
  key,
) {
  final parts = key.split('|');
  return ref.watch(repositoryProvider).statistics(parts[0], parts[1]);
});

final recognitionProviderInfoProvider = FutureProvider<RecognitionProviderInfo>(
  (ref) => ref.watch(repositoryProvider).recognitionProvider(),
);

final notificationCapturePageProvider = FutureProvider<NotificationCapturePage>(
  (ref) => ref.watch(repositoryProvider).notificationCaptures(),
);

final recognitionJobsProvider = FutureProvider<List<RecognitionJob>>(
  (ref) => ref.watch(repositoryProvider).pendingRecognitionJobs(),
);
final pendingReviewCountProvider = FutureProvider<int>((ref) async {
  final jobs = await ref.watch(recognitionJobsProvider.future);
  final captures = await ref.watch(notificationCapturePageProvider.future);
  return captures.pendingCount +
      jobs
          .where((job) => job.status == 'reviewing')
          .fold<int>(
            0,
            (count, job) =>
                count +
                (job.totalCount - job.importedCount - job.skippedCount).clamp(
                  0,
                  job.totalCount,
                ),
          );
});
final notificationHistoryProvider = FutureProvider<NotificationCapturePage>(
  (ref) => ref
      .watch(repositoryProvider)
      .notificationCaptures(status: 'completed', limit: 5),
);
final notificationCapturePagesProvider = FutureProvider.autoDispose
    .family<NotificationCapturePage, int>(
      (ref, page) =>
          ref.watch(repositoryProvider).notificationCaptures(page: page),
    );

class LedgerRefreshController extends Notifier<int> {
  @override
  int build() => 0;
  void refresh() => state++;
}

final ledgerRefreshProvider = NotifierProvider<LedgerRefreshController, int>(
  LedgerRefreshController.new,
);

void refreshLedger(WidgetRef ref) {
  ref.read(ledgerRefreshProvider.notifier).refresh();
  ref.invalidate(statisticsProvider);
  ref.invalidate(notificationCapturePageProvider);
  ref.invalidate(notificationCapturePagesProvider);
  ref.invalidate(notificationHistoryProvider);
  ref.invalidate(recognitionJobsProvider);
  ref.invalidate(pendingReviewCountProvider);
}

final recentEntryTemplatesProvider = FutureProvider<List<TransactionItem>>((
  ref,
) async {
  ref.watch(ledgerRefreshProvider);
  return (await ref.watch(repositoryProvider).transactions(limit: 20)).items;
});

/// One-shot filter handoff from Insights / Home into the Activity ledger.
@immutable
class ActivityFilterRequest {
  const ActivityFilterRequest({
    this.type,
    this.categoryId,
    this.uncategorized = false,
    this.currency,
    this.dates,
    this.source,
  });

  final String? type;
  final String? categoryId;
  final bool uncategorized;
  final String? currency;
  final DateTimeRange? dates;
  final String? source;
}

class ActivityFilterRequestController extends Notifier<ActivityFilterRequest?> {
  @override
  ActivityFilterRequest? build() => null;

  void open(ActivityFilterRequest request) => state = request;

  void clear() => state = null;
}

final activityFilterRequestProvider =
    NotifierProvider<ActivityFilterRequestController, ActivityFilterRequest?>(
      ActivityFilterRequestController.new,
    );

/// One-shot navigation handoff into Insights (e.g. from Home daily bars).
@immutable
class InsightsRequest {
  const InsightsRequest({required this.section, this.month, this.currency});

  final int section;
  final DateTime? month;
  final String? currency;
}

class InsightsSectionRequestController extends Notifier<InsightsRequest?> {
  @override
  InsightsRequest? build() => null;

  void open(InsightsRequest request) => state = request;

  void clear() => state = null;
}

final insightsSectionRequestProvider =
    NotifierProvider<InsightsSectionRequestController, InsightsRequest?>(
      InsightsSectionRequestController.new,
    );
