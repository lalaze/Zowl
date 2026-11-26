import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app/router.dart';
import 'core/api.dart';
import 'core/config.dart';
import 'core/day_time.dart';
import 'core/l10n.dart';
import 'core/providers.dart';
import 'core/screenshot_picker.dart';
import 'core/shared_screenshot.dart';
import 'core/theme.dart';

export 'app/router.dart' show routerProvider;

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
