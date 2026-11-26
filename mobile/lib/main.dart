import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/api.dart';
import 'core/config.dart';
import 'core/day_time.dart';
import 'core/l10n.dart';
import 'core/models.dart';
import 'core/providers.dart';
import 'core/screenshot_picker.dart';
import 'core/shared_screenshot.dart';
import 'package:image_picker/image_picker.dart';
import 'core/theme.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/splash_screen.dart';
import 'features/home/home_screen.dart';
import 'features/imports/import_screen.dart';
import 'features/imports/notification_capture_screen.dart';
import 'features/imports/receipt_review_screen.dart';
import 'features/settings/settings_screen.dart';
import 'features/settings/payment_capture_settings.dart';
import 'features/settings/admin_account_screen.dart';
import 'features/shell/app_shell.dart';
import 'features/statistics/statistics_screen.dart';
import 'features/transactions/transaction_detail_screen.dart';
import 'features/transactions/transaction_form_screen.dart';
import 'features/transactions/transaction_list_screen.dart';

Future<void> main() => runZeMoney();

Future<void> runZeMoney({
  ScreenshotPicker? screenshotPicker,
  ApiConfig? config,
}) async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting();
  final preferences = await SharedPreferences.getInstance();
  final tokenStore = TokenStore(const FlutterSecureStorage(), preferences);
  await tokenStore.initialize();
  final apiConfig = config ?? ApiConfig.fromEnvironment();
  runApp(
    ProviderScope(
      overrides: [
        apiConfigProvider.overrideWithValue(apiConfig),
        preferencesProvider.overrideWithValue(preferences),
        tokenStoreProvider.overrideWithValue(tokenStore),
        if (screenshotPicker != null)
          screenshotPickerProvider.overrideWithValue(screenshotPicker),
      ],
      child: const ZeMoneyApp(),
    ),
  );
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier(0);
  ref.onDispose(refresh.dispose);
  ref.listen(authControllerProvider, (_, _) => refresh.value++);
  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: refresh,
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      if (auth.isLoading) {
        // A sign-in attempt stays on the login page so its form and any
        // error survive; only cold starts and session checks show the splash.
        const waitHere = {'/splash', '/login'};
        return waitHere.contains(state.matchedLocation) ? null : '/splash';
      }
      final signedIn = auth.value != null;
      final isLogin = state.matchedLocation == '/login';
      final isSplash = state.matchedLocation == '/splash';
      if (!signedIn) return isLogin ? null : '/login';
      if (isLogin || isSplash) return '/';
      if (state.matchedLocation == '/settings/admin' &&
          auth.value?.isAdmin != true) {
        return '/settings';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, _) => const SplashScreen()),
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => AppShell(navigationShell: shell),
        branches: [
          StatefulShellBranch(
            routes: [GoRoute(path: '/', builder: (_, _) => const HomeScreen())],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/transactions',
                builder: (_, _) => const TransactionListScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/statistics',
                builder: (_, _) => const StatisticsScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/settings',
                builder: (_, _) => const SettingsScreen(),
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: '/settings/payment-capture',
        builder: (_, _) => const PaymentCaptureSettingsScreen(),
      ),
      GoRoute(
        path: '/settings/admin',
        builder: (_, _) => const AdminAccountScreen(),
      ),
      GoRoute(
        path: '/transactions/new',
        builder: (_, _) => const TransactionFormScreen(),
      ),
      GoRoute(
        path: '/transactions/:id',
        builder: (_, state) => TransactionDetailScreen(
          id: state.pathParameters['id']!,
          initial: state.extra is TransactionItem
              ? state.extra as TransactionItem
              : null,
        ),
      ),
      GoRoute(
        path: '/transactions/:id/edit',
        builder: (_, state) =>
            TransactionFormScreen(initial: state.extra as TransactionItem?),
      ),
      GoRoute(path: '/imports', builder: (_, _) => const ImportScreen()),
      GoRoute(
        path: '/imports/shared',
        builder: (_, state) => ImportScreen(
          quick: true,
          sharedFiles: state.extra is XFile ? [state.extra as XFile] : null,
        ),
      ),
      GoRoute(
        path: '/imports/quick',
        builder: (_, _) => const ImportScreen(quick: true),
      ),
      GoRoute(
        path: '/imports/screenshots/:jobId',
        builder: (_, state) =>
            ReceiptReviewScreen(jobId: state.pathParameters['jobId']!),
      ),
      GoRoute(
        path: '/imports/notifications',
        builder: (_, _) => const NotificationCaptureScreen(),
      ),
    ],
  );
});

class ZeMoneyApp extends ConsumerStatefulWidget {
  const ZeMoneyApp({super.key});

  @override
  ConsumerState<ZeMoneyApp> createState() => _ZeMoneyAppState();
}

class _ZeMoneyAppState extends ConsumerState<ZeMoneyApp>
    with WidgetsBindingObserver {
  StreamSubscription<String>? _captureRouteSubscription;
  String? _pendingCaptureRoute;
  final _shareBridge = SharedScreenshotBridge();
  StreamSubscription<void>? _shareSubscription;
  XFile? _pendingScreenshot;
  late SceneTime _time;
  Timer? _skyTimer;
  (AccentColor, SceneTime)? _themeKey;
  late ThemeData _lightTheme;
  late ThemeData _darkTheme;

  void _ensureThemes(AccentColor accent) {
    final key = (accent, _time);
    if (_themeKey == key) return;
    _themeKey = key;
    _lightTheme = buildTheme(accent, Brightness.light, time: _time);
    _darkTheme = buildTheme(accent, Brightness.dark, time: _time);
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _followSky();
    _shareSubscription = _shareBridge.available.listen(
      (_) => _takeSharedScreenshot(),
    );
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => _takeSharedScreenshot(),
    );
    final bridge = ref.read(paymentCaptureBridgeProvider);
    _captureRouteSubscription = bridge.routes.listen(_openCaptureRoute);
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final route = await bridge.takePendingRoute();
      if (route != null) _openCaptureRoute(route);
    });
  }

  Future<void> _takeSharedScreenshot() async {
    try {
      final file = await _shareBridge.take();
      if (file == null || !mounted) return;
      _pendingScreenshot = file;
      _openPendingScreenshot();
    } catch (error) {
      final context = ref
          .read(routerProvider)
          .routerDelegate
          .navigatorKey
          .currentContext;
      if (context != null && context.mounted) {
        ScaffoldMessenger.maybeOf(
          context,
        )?.showSnackBar(SnackBar(content: Text(error.toString())));
      }
    }
  }

  void _openPendingScreenshot() {
    if (_pendingScreenshot == null ||
        ref.read(authControllerProvider).value == null) {
      return;
    }
    final screenshot = _pendingScreenshot!;
    _pendingScreenshot = null;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        ref.read(routerProvider).push('/imports/shared', extra: screenshot);
      }
    });
  }

  /// Keeps the sky and the paper under it on the current hour.
  void _followSky() {
    final now = storyNow();
    _time = sceneTimeFor(now);
    _skyTimer?.cancel();
    _skyTimer = Timer(nextSceneChange(now).difference(now), () {
      if (mounted) setState(_followSky);
    });
  }

  @override
  void didChangeLocales(List<Locale>? locales) {
    if (ref.read(languageProvider) != AppLanguage.system) return;
    final device = locales == null || locales.isEmpty ? null : locales.first;
    if (applyLanguage(AppLanguage.system, device)) _showNewLanguage();
  }

  // Widgets read copy through the global `tr`, so a language switch has to
  // rebuild every element; State (forms, scroll, navigation) is kept.
  void _showNewLanguage() {
    if (!mounted) return;
    setState(() {});
    void markDirty(Element element) {
      element.markNeedsBuild();
      element.visitChildren(markDirty);
    }

    (context as Element).visitChildren(markDirty);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) return;
    // Timers stand still while the phone sleeps.
    setState(_followSky);
    if (ref.read(authControllerProvider).value != null) _refreshLedgerData();
  }

  // Payments are captured and posted while the app is in the background.
  void _refreshLedgerData() {
    refreshLedger(ref);
    ref.read(foregroundRefreshProvider.notifier).bump();
  }

  void _openCaptureRoute(String route) {
    if (!mounted ||
        !const {
          '/imports/notifications',
          '/transactions',
          '/transactions/new',
        }.contains(route)) {
      return;
    }
    if (ref.read(authControllerProvider).value == null) {
      _pendingCaptureRoute = route;
      return;
    }
    _pendingCaptureRoute = null;
    final router = ref.read(routerProvider);
    if (route == '/transactions/new') {
      // The form opens over the transaction list, so saving or backing out lands there.
      router.go('/transactions');
      router.push(route);
      _refreshLedgerData();
      return;
    }
    router.go(route);
    if (route == '/transactions') _refreshLedgerData();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _skyTimer?.cancel();
    _captureRouteSubscription?.cancel();
    _shareSubscription?.cancel();
    _shareBridge.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(authControllerProvider, (previous, next) {
      if (previous?.value?.id != next.value?.id) {
        refreshLedger(ref);
        ref.invalidate(categoriesProvider);
        ref.invalidate(transactionProvider);
        if (previous?.value != null) _pendingScreenshot = null;
        if (next.value != null) _openPendingScreenshot();
      }
      if (next.value != null && _pendingCaptureRoute != null) {
        final route = _pendingCaptureRoute!;
        WidgetsBinding.instance.addPostFrameCallback(
          (_) => _openCaptureRoute(route),
        );
      }
    });
    ref.listen(languageProvider, (_, _) => _showNewLanguage());
    ref.watch(languageProvider);
    final appearance = ref.watch(appearanceProvider);
    _ensureThemes(appearance.accent);
    return MaterialApp.router(
      title: 'Zowl',
      debugShowCheckedModeBanner: false,
      themeMode: appearance.mode,
      theme: _lightTheme,
      darkTheme: _darkTheme,
      routerConfig: ref.watch(routerProvider),
      locale: appLocale,
      supportedLocales: supportedAppLocales,
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
    );
  }
}
