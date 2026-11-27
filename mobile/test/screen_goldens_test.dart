import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:riverpod/misc.dart' show Override;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:zowl_mobile/core/api.dart';
import 'package:zowl_mobile/core/config.dart';
import 'package:zowl_mobile/core/models.dart';
import 'package:zowl_mobile/core/payment_capture.dart';
import 'package:zowl_mobile/core/providers.dart';
import 'package:zowl_mobile/core/repository.dart';
import 'package:zowl_mobile/core/theme.dart';
import 'package:zowl_mobile/features/auth/login_screen.dart';
import 'package:zowl_mobile/features/home/home_screen.dart';
import 'package:zowl_mobile/features/imports/import_screen.dart';
import 'package:zowl_mobile/features/imports/receipt_review_screen.dart';
import 'package:zowl_mobile/features/settings/settings_screen.dart';
import 'package:zowl_mobile/features/statistics/statistics_screen.dart';
import 'package:zowl_mobile/features/transactions/transaction_detail_screen.dart';
import 'package:zowl_mobile/features/transactions/transaction_form_screen.dart';
import 'package:zowl_mobile/features/transactions/transaction_list_screen.dart';

const _user = SessionUser(
  id: 'golden-user',
  email: 'golden@zowl.local',
  displayName: 'Ze',
  avatarPreset: 'piggy',
  timezone: 'Asia/Shanghai',
);

const _transaction = TransactionItem(
  id: 'tx-golden',
  type: 'expense',
  amountMinor: 3580,
  amount: '35.80',
  currency: 'CNY',
  merchantName: 'Mountain Cafe',
  description: 'Oat latte',
  categoryId: 'food',
  categoryName: 'Food',
  categoryColor: '#f97316',
  transactionTime: '2026-07-18T04:30:00.000Z',
  source: 'manual',
  paymentMethod: 'Alipay',
  currentRevisionId: 'revision-1',
  revisionNumber: 1,
);

const _summary = FlowSummary(
  grossExpenseMinor: 248600,
  refundMinor: 8600,
  netExpenseMinor: 240000,
  incomeMinor: 1280000,
  transferMinor: 50000,
  balanceMinor: 1040000,
  expenseCount: 18,
  refundCount: 1,
  incomeCount: 1,
  transferCount: 1,
  transactionCount: 21,
);

class _FakeTokenStore extends TokenStore {
  _FakeTokenStore(SharedPreferences preferences)
    : super(const FlutterSecureStorage(), preferences);

  String? token = 'golden-token';

  @override
  Future<String?> read() async => token;

  @override
  Future<void> write(String value) async => token = value;

  @override
  Future<void> clear() async => token = null;
}

class _GoldenPaymentCaptureBridge implements PaymentCaptureBridge {
  @override
  Stream<String> get routes => const Stream.empty();

  @override
  Future<PaymentCaptureStatus> getStatus() async =>
      const PaymentCaptureStatus.unsupported();

  @override
  Future<void> openAccessibilitySettings() async {}

  @override
  Future<void> requestNotificationPermission() async {}

  @override
  Future<PaymentCaptureStatus> setEnabled(bool enabled) => getStatus();

  @override
  Future<PaymentCaptureStatus> setSourceEnabled(
    String platform,
    bool enabled,
  ) => getStatus();

  @override
  Future<PaymentCaptureStatus> setOrderDetailsEnabled(bool enabled) =>
      getStatus();

  @override
  Future<void> configureSession(
    String apiBaseUrl,
    String token,
    String userId,
  ) async {}

  @override
  Future<void> pauseSession() async {}

  @override
  Future<void> clearSession() async {}

  @override
  Future<void> flushNow() async {}

  @override
  Future<PaymentCaptureStatus> resetDiagnostics() => getStatus();

  @override
  Future<bool> exportCaptureLog() async => false;

  @override
  Future<String?> takePendingRoute() async => null;
}

class _GoldenRepository extends ZowlRepository {
  _GoldenRepository(super.api, super.tokenStore);

  @override
  Future<SessionUser> session() async => _user;

  @override
  Future<List<Category>> categories() async => const [
    Category(id: 'food', name: 'Food', kind: 'expense', color: '#f97316'),
  ];

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
  }) async => const TransactionPage(
    items: [_transaction],
    pagination: Pagination(page: 1, limit: 20, total: 1, totalPages: 1),
  );

  @override
  Future<TransactionItem> transaction(String id) async => _transaction;

  @override
  Future<StatisticsOverview> statistics(String month, String currency) async =>
      StatisticsOverview(
        month: month,
        currency: currency,
        summary: _summary,
        excludedCurrencies: const [
          CurrencyBreakdown(currency: 'USD', summary: _summary),
        ],
        categoryDistribution: const [
          DistributionItem(
            name: 'Food',
            color: '#f97316',
            amountMinor: 148600,
            transactionCount: 12,
            sharePercent: 61.9,
          ),
          DistributionItem(
            name: 'Transport',
            color: '#2563eb',
            amountMinor: 91400,
            transactionCount: 6,
            sharePercent: 38.1,
          ),
        ],
        sourceDistribution: const [
          DistributionItem(
            source: 'manual',
            amountMinor: 160000,
            transactionCount: 13,
            sharePercent: 66.7,
          ),
          DistributionItem(
            source: 'screenshot',
            amountMinor: 80000,
            transactionCount: 5,
            sharePercent: 33.3,
          ),
        ],
        dailyTrend: const [
          TrendPoint(label: '1Day', netExpenseMinor: 3500, incomeMinor: 0),
          TrendPoint(label: '2Day', netExpenseMinor: 8200, incomeMinor: 0),
          TrendPoint(
            label: '3Day',
            netExpenseMinor: 2600,
            incomeMinor: 1280000,
          ),
        ],
        monthlyTrend: const [
          TrendPoint(label: '5Month', netExpenseMinor: 198000, incomeMinor: 0),
          TrendPoint(label: '6Month', netExpenseMinor: 228000, incomeMinor: 0),
          TrendPoint(label: '7Month', netExpenseMinor: 240000, incomeMinor: 0),
        ],
        recentTransactions: const [_transaction],
      );

  @override
  Future<RecognitionReview> recognitionReview(String jobId) async =>
      const RecognitionReview(
        job: RecognitionJob(
          id: 'job-golden',
          status: 'reviewing',
          createdAt: '2026-07-18T04:30:00.000Z',
          providerId: 'mock',
          totalCount: 1,
        ),
        items: [
          RecognitionItem(
            id: 'item-golden',
            fileId: 'file-golden',
            fileName: 'payment.png',
            previewUrl: '',
            status: 'recognized',
            transactionTime: '2026-07-18T04:30:00.000Z',
            type: 'expense',
            amountMinor: 3580,
            amount: '35.80',
            currency: 'CNY',
            merchantName: 'Mountain Cafe',
            confidence: .92,
            duplicateKind: 'possible_duplicate',
            warnings: ['Check the merchant name'],
          ),
        ],
      );

  @override
  Future<RecognitionProviderInfo> recognitionProvider() async =>
      const RecognitionProviderInfo(
        id: 'mock',
        label: 'Local recognition',
        sendsImagesToThirdParty: false,
        disclosure: 'Images are processed only by the local test service',
        retentionPolicy: 'Not retained',
      );

  @override
  Future<List<RecognitionJob>> pendingRecognitionJobs() => recognitionJobs();

  @override
  Future<List<RecognitionJob>> recognitionJobs() async => const [
    RecognitionJob(
      id: 'job-golden',
      status: 'reviewing',
      createdAt: '2026-07-18T04:30:00.000Z',
      providerId: 'mock',
      totalCount: 1,
    ),
  ];

  @override
  Future<NotificationCapturePage> notificationCaptures({
    String status = 'reviewing',
    int page = 1,
    int limit = 20,
  }) async => const NotificationCapturePage(
    items: [],
    pagination: Pagination(page: 1, limit: 20, total: 0, totalPages: 1),
    pendingCount: 0,
  );
}

class _Harness {
  _Harness({
    required this.preferences,
    required this.tokens,
    required this.api,
    required this.repository,
  });

  final SharedPreferences preferences;
  final _FakeTokenStore tokens;
  final ApiClient api;
  final _GoldenRepository repository;

  List<Override> get overrides => [
    apiConfigProvider.overrideWithValue(
      ApiConfig.parse('http://100.64.0.10:3000', release: false),
    ),
    preferencesProvider.overrideWithValue(preferences),
    tokenStoreProvider.overrideWithValue(tokens),
    apiClientProvider.overrideWithValue(api),
    repositoryProvider.overrideWithValue(repository),
    paymentCaptureBridgeProvider.overrideWithValue(
      _GoldenPaymentCaptureBridge(),
    ),
  ];
}

Future<_Harness> _harness() async {
  SharedPreferences.setMockInitialValues({});
  final preferences = await SharedPreferences.getInstance();
  final tokens = _FakeTokenStore(preferences);
  final config = ApiConfig.parse('http://100.64.0.10:3000', release: false);
  final api = ApiClient(config, tokens);
  return _Harness(
    preferences: preferences,
    tokens: tokens,
    api: api,
    repository: _GoldenRepository(api, tokens),
  );
}

Widget _screen(
  _Harness harness,
  Widget child,
  Brightness brightness, {
  double textScale = 1,
}) => ProviderScope(
  overrides: harness.overrides,
  child: MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: buildTheme(AccentColor.amber, brightness),
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(
        context,
      ).copyWith(textScaler: TextScaler.linear(textScale)),
      child: child!,
    ),
    home: child,
  ),
);

void main() {
  final cases = <String, Widget>{
    'login': const LoginScreen(),
    'home': const HomeScreen(),
    'transactions': const TransactionListScreen(),
    'import': const ImportScreen(),
    'review': const ReceiptReviewScreen(jobId: 'job-golden'),
    'transaction_detail': const TransactionDetailScreen(id: 'tx-golden'),
    'transaction_form': const TransactionFormScreen(),
    'statistics': const StatisticsScreen(),
    'settings': const SettingsScreen(),
  };

  for (final entry in cases.entries) {
    testWidgets('${entry.key} has light and dark 390x844 baselines', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final harness = await _harness();

      for (final brightness in Brightness.values) {
        await tester.pumpWidget(_screen(harness, entry.value, brightness));
        await tester.pumpAndSettle();
        await expectLater(
          find.byType(Scaffold).first,
          matchesGoldenFile('goldens/${entry.key}_${brightness.name}.png'),
        );
      }
    });
  }

  testWidgets('large text keeps settings accessible with avatar semantics', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final semantics = tester.ensureSemantics();
    final harness = await _harness();

    await tester.pumpWidget(
      _screen(
        harness,
        const SettingsScreen(),
        Brightness.light,
        textScale: 1.6,
      ),
    );
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('Personal details'), findsOneWidget);
    await tester.ensureVisible(find.text('Personal details'));
    await tester.pumpAndSettle();
    tester
        .widget<ListTile>(find.widgetWithText(ListTile, 'Personal details'))
        .onTap!
        .call();
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    final avatarHeading = find.text('Choose avatar', skipOffstage: false);
    expect(avatarHeading, findsOneWidget);
    await tester.ensureVisible(avatarHeading);
    await tester.pumpAndSettle();
    final avatar = find.bySemanticsLabel('Change avatar: Piggy bank');
    expect(avatar, findsOneWidget);
    semantics.dispose();
  });

  testWidgets('large text keeps the home summary and review action visible', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final harness = await _harness();

    await tester.pumpWidget(
      _screen(harness, const HomeScreen(), Brightness.light, textScale: 1.6),
    );
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('Balance this month'), findsOneWidget);
    expect(find.text('1 to review').hitTestable(), findsOneWidget);
  });

  testWidgets('manual entry keeps confirmation reachable above the keyboard', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    tester.view.viewInsets = const FakeViewPadding(bottom: 300);
    addTearDown(() {
      tester.binding.setSurfaceSize(null);
      tester.view.resetViewInsets();
    });
    final harness = await _harness();

    await tester.pumpWidget(
      _screen(harness, const TransactionFormScreen(), Brightness.light),
    );
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('Confirm and post').hitTestable(), findsOneWidget);
  });
}
