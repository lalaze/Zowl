import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../core/models.dart';
import '../core/providers.dart';
import '../features/auth/login_screen.dart';
import '../features/auth/splash_screen.dart';
import '../features/home/home_screen.dart';
import '../features/imports/import_screen.dart';
import '../features/imports/notification_capture_screen.dart';
import '../features/imports/receipt_review_screen.dart';
import '../features/settings/admin_account_screen.dart';
import '../features/settings/payment_capture_settings.dart';
import '../features/settings/settings_screen.dart';
import '../features/shell/app_shell.dart';
import '../features/statistics/statistics_screen.dart';
import '../features/transactions/transaction_detail_screen.dart';
import '../features/transactions/transaction_form_screen.dart';
import '../features/transactions/transaction_list_screen.dart';

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
