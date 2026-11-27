import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:zowl_mobile/core/formatters.dart';
import 'package:zowl_mobile/core/l10n.dart';
import 'package:zowl_mobile/core/models.dart';

import 'support/fixtures.dart';

void main() {
  test('decodes the transaction page API contract', () {
    final page = TransactionPage.fromJson({
      'items': [
        {
          'id': 'tx-1',
          'type': 'expense',
          'amountMinor': 3580,
          'amount': '35.80',
          'currency': 'CNY',
          'merchantName': 'Mountain Cafe',
          'description': null,
          'categoryId': 'food',
          'categoryName': 'Food',
          'categoryColor': '#f97316',
          'transactionTime': '2026-07-18T04:30:00.000Z',
          'source': 'manual',
          'paymentMethod': 'Alipay',
          'platformTransactionId': null,
          'currentRevisionId': 'revision-1',
          'revisionNumber': 1,
        },
      ],
      'pagination': {'page': 1, 'limit': 20, 'total': 1, 'totalPages': 1},
    });

    expect(page.items.single.amountMinor, 3580);
    expect(page.items.single.currentRevisionId, 'revision-1');
    expect(page.pagination.total, 1);
  });

  test('formats integer minor units without floating point storage', () {
    expect(formatMoney(3580), contains('35.80'));
    expect(formatSignedMoney(3580, 'expense', 'CNY'), startsWith('-'));
    expect(formatSignedMoney(3580, 'refund', 'CNY'), startsWith('+'));
    expect(formatMoneyWithSymbol(-349606), '-¥3,496.06');
    expect(formatSignedMoneyWithSymbol(3580, 'expense', 'CNY'), '-¥35.80');
    expect(formatSignedMoneyWithSymbol(3580, 'income', 'CNY'), '+¥35.80');
  });

  test('decodes screenshot review warnings and validation issues', () {
    final review = RecognitionReview.fromJson({
      'job': {
        'id': 'job-1',
        'status': 'reviewing',
        'createdAt': '2026-07-18T04:30:00.000Z',
        'providerId': 'mock',
        'totalCount': 1,
      },
      'items': [
        {
          'id': 'item-1',
          'fileId': 'file-1',
          'fileName': 'payment.png',
          'previewUrl': '/api/files/file-1',
          'status': 'recognized',
          'warnings': ['Please confirm manually'],
          'validationErrors': [
            {'field': 'amountMinor', 'message': 'Enter an amount'},
          ],
        },
      ],
    });
    expect(review.items.single.warnings, ['Please confirm manually']);
    expect(review.items.single.validationErrors, isNotEmpty);
  });

  test(
    'decodes notification candidates without requiring notification text',
    () {
      final page = NotificationCapturePage.fromJson({
        'items': [
          {
            'id': 'capture-1',
            'platform': 'wechat',
            'notificationPostedAt': '2026-07-18T04:30:00.000Z',
            'amountMinor': 1880,
            'currency': 'CNY',
            'transactionTime': '2026-07-18T04:30:00.000Z',
            'confidenceBasisPoints': 9500,
            'merchantName': null,
            'description': 'WeChat Pay notification',
            'paymentMethod': 'WeChat',
            'duplicateStatus': 'possible_duplicate',
            'duplicateAssessmentDigest': 'assessment-1',
            'status': 'reviewing',
            'warnings': ['Similar amount and merchant'],
            'validationErrors': [],
          },
        ],
        'pagination': {'page': 1, 'limit': 20, 'total': 1, 'totalPages': 1},
        'pendingCount': 1,
      });

      expect(page.pendingCount, 1);
      expect(page.items.single.platform, 'wechat');
      expect(page.items.single.amountMinor, 1880);
      expect(page.items.single.duplicateAssessmentDigest, 'assessment-1');
    },
  );

  group('order details', () {
    const orderJson = {
      'shopName': '某某旗舰店',
      'items': [
        {
          'name': '便携洗手液',
          'spec': '24包 30x40cm',
          'quantity': 1,
          'priceMinor': 1880,
        },
        {'name': '洗碗海绵', 'spec': null, 'quantity': null, 'priceMinor': null},
      ],
    };
    Map<String, dynamic> transactionJson([Map<String, dynamic>? extra]) => {
      'id': 'tx-order',
      'type': 'expense',
      'amountMinor': 3580,
      'currency': 'CNY',
      'merchantName': '某某旗舰店',
      'description': '便携洗手液等 2 件',
      'transactionTime': '2026-07-18T04:30:00.000Z',
      'source': 'taobao',
      ...?extra,
    };
    Map<String, dynamic> captureJson([Map<String, dynamic>? extra]) => {
      'id': 'capture-order',
      'platform': 'taobao',
      'notificationPostedAt': '2026-07-18T04:30:00.000Z',
      'amountMinor': 3580,
      'currency': 'CNY',
      'transactionTime': '2026-07-18T04:30:00.000Z',
      ...?extra,
    };

    test('a transaction carries the goods the server recognised', () {
      final item = TransactionItem.fromJson(
        transactionJson({'orderDetails': orderJson}),
      );
      final order = item.orderDetails!;

      expect(order.shopName, '某某旗舰店');
      expect(order.items, hasLength(2));
      expect(order.items.first.name, '便携洗手液');
      expect(order.items.first.spec, '24包 30x40cm');
      expect(order.items.first.quantity, 1);
      expect(order.items.first.priceMinor, 1880);
      expect(order.items.last.name, '洗碗海绵');
      expect(order.items.last.spec, isNull);
      expect(order.items.last.quantity, isNull);
      expect(order.items.last.priceMinor, isNull);

      final again = TransactionItem.fromJson(
        Map<String, dynamic>.from(jsonDecode(jsonEncode(item)) as Map),
      );
      expect(again.orderDetails!.shopName, '某某旗舰店');
      expect(again.orderDetails!.items.first.priceMinor, 1880);
    });

    test('a transaction without order details decodes to none', () {
      expect(
        TransactionItem.fromJson(
          transactionJson({'orderDetails': null}),
        ).orderDetails,
        isNull,
      );
      // An older server does not send the field at all.
      expect(TransactionItem.fromJson(transactionJson()).orderDetails, isNull);
    });

    test('a capture candidate carries order details the same way', () {
      final order = NotificationCaptureItem.fromJson(
        captureJson({'orderDetails': orderJson}),
      ).orderDetails!;
      expect(order.shopName, '某某旗舰店');
      expect(order.items.map((item) => item.name), ['便携洗手液', '洗碗海绵']);

      expect(
        NotificationCaptureItem.fromJson(
          captureJson({'orderDetails': null}),
        ).orderDetails,
        isNull,
      );
      expect(
        NotificationCaptureItem.fromJson(captureJson()).orderDetails,
        isNull,
      );
    });

    test('order details without a usable item count as none', () {
      expect(OrderDetails.parse('unexpected'), isNull);
      expect(OrderDetails.parse({'shopName': '某某旗舰店', 'items': []}), isNull);
      expect(OrderDetails.parse({'shopName': '某某旗舰店'}), isNull);
      final order = OrderDetails.parse({
        'shopName': '  ',
        'items': [
          'unexpected',
          {'name': ' '},
          {'name': '猫粮', 'quantity': '2', 'priceMinor': 9900.0},
        ],
      })!;
      expect(order.shopName, isNull);
      expect(order.items.single.name, '猫粮');
      expect(order.items.single.quantity, isNull);
      expect(order.items.single.priceMinor, 9900);
    });

    test('a payment with recognised goods is named after the goods', () {
      expect(displayNameFor(testOrderTransaction), 'Bin bags and 1 more');
      // Without items the merchant still comes first.
      expect(displayNameFor(testTransaction), 'Mountain Cafe');
      expect(
        displayNameFor(
          const TransactionItem(
            id: 'tx-empty-order',
            type: 'expense',
            amountMinor: 100,
            currency: 'CNY',
            merchantName: 'Harbor Home Store',
            description: 'Bin bags',
            transactionTime: '2026-07-18T04:30:00.000Z',
            source: 'taobao',
            orderDetails: OrderDetails(items: []),
          ),
        ),
        'Harbor Home Store',
      );
      // Goods without a summary fall back to the shop.
      expect(
        displayNameFor(
          const TransactionItem(
            id: 'tx-no-summary',
            type: 'expense',
            amountMinor: 100,
            currency: 'CNY',
            merchantName: 'Harbor Home Store',
            description: ' ',
            transactionTime: '2026-07-18T04:30:00.000Z',
            source: 'taobao',
            orderDetails: testOrderDetails,
          ),
        ),
        'Harbor Home Store',
      );
    });
  });

  test('round-trips session, category, and statistics API contracts', () {
    final session = TokenSession.fromJson({
      'tokenType': 'Bearer',
      'accessToken': 'token-1',
      'expiresAt': '2026-08-01T00:00:00.000Z',
      'user': testUser.toJson(),
    });
    final category = Category.fromJson({
      'id': 'other',
      'name': 'Other',
      'kind': 'both',
    });
    final statistics = StatisticsOverview.fromJson(
      Map<String, dynamic>.from(jsonDecode(jsonEncode(testStatistics)) as Map),
    );

    expect(
      session.user.copyWith(displayName: 'New nickname').displayName,
      'New nickname',
    );
    expect(session.user.copyWith(avatarPreset: 'cat').email, testUser.email);
    expect(category.sortOrder, 0);
    expect(statistics.excludedCurrencies.single.currency, 'USD');
    expect(statistics.categoryDistribution.single.sharePercent, 61.9);
    expect(statistics.dailyTrend.single.label, '1Day');
    expect(statistics.recentTransactions.single.id, 'tx-1');
  });

  test('applies recognition defaults and preserves optional review facts', () {
    final provider = RecognitionProviderInfo.fromJson(
      testProviderInfo.toJson(),
    );
    final job = RecognitionJob.fromJson({
      'id': 'job-empty',
      'status': 'processing',
      'createdAt': '2026-07-18T04:30:00.000Z',
    });
    final item = RecognitionItem.fromJson({
      'id': 'item-empty',
      'fileId': 'file-empty',
      'fileName': 'empty.png',
      'previewUrl': '',
      'status': 'failed',
    });

    expect(provider.label, 'Local recognition');
    expect(job.totalCount, 0);
    expect(job.importedCount, 0);
    expect(job.skippedCount, 0);
    expect(item.amountMinor, isNull);
    expect(item.warnings, isEmpty);
    expect(item.validationErrors, isEmpty);
  });

  test('chooses stable transaction names and direction semantics', () {
    expect(displayNameFor(testTransaction), 'Mountain Cafe');
    expect(
      displayNameFor(
        const TransactionItem(
          id: 'tx-description',
          type: 'income',
          amountMinor: 100,
          currency: 'CNY',
          description: 'Red packets',
          transactionTime: '2026-07-18T04:30:00.000Z',
          source: 'manual',
        ),
      ),
      'Red packets',
    );
    expect(
      displayNameFor(
        const TransactionItem(
          id: 'tx-unnamed',
          type: 'transfer',
          amountMinor: 100,
          currency: 'CNY',
          transactionTime: '2026-07-18T04:30:00.000Z',
          source: 'manual',
        ),
      ),
      'Untitled transaction',
    );
    expect(isIncoming('income'), isTrue);
    expect(isIncoming('refund'), isTrue);
    expect(isIncoming('expense'), isFalse);
  });

  test('formats supported symbols, fallback currencies, dates, and months', () {
    expect(currencySymbol('CNY'), '¥');
    expect(currencySymbol('USD'), r'$');
    expect(currencySymbol('EUR'), '€');
    expect(currencySymbol('GBP'), '£');
    expect(currencySymbol('JPY'), '¥');
    expect(currencySymbol('HKD'), 'HKD ');
    expect(formatDateTime('invalid-date'), 'invalid-date');
    expect(
      formatDateTime('2026-07-18T04:30:00.000Z'),
      matches(r'^2026-07-18 '),
    );
    expect(monthKey(DateTime(2026, 2, 1)), '2026-02');
  });

  test('labels list days and sources in English', () {
    final now = DateTime(2026, 11, 12, 9);
    expect(
      formatDayLabel(DateTime(2026, 11, 12, 20), now: now),
      'Today · Thu 12',
    );
    expect(
      formatDayLabel(DateTime(2026, 11, 11), now: now),
      'Yesterday · Wed 11',
    );
    expect(formatDayLabel(DateTime(2026, 11, 3), now: now), 'Tue, Nov 3');
    expect(
      formatDayLabel(DateTime(2025, 11, 12), now: now),
      'Wed, Nov 12, 2025',
    );
    expect(sourceLabel('manual'), 'Manual');
    expect(sourceLabel('generic'), 'Statement import');
    expect(sourceLabel('custom'), 'custom');
    expect(sourceLabel(null), 'Other');
  });

  test(
    'labels list days, sources, and unnamed transactions in Chinese',
    () async {
      await initializeDateFormatting();
      applyLanguage(AppLanguage.zh);
      addTearDown(() => applyLanguage(AppLanguage.en));
      final now = DateTime(2026, 11, 12, 9);

      expect(
        formatDayLabel(DateTime(2026, 11, 12, 20), now: now),
        '今天 · 11月12日 周四',
      );
      expect(
        formatDayLabel(DateTime(2026, 11, 11), now: now),
        '昨天 · 11月11日 周三',
      );
      expect(formatDayLabel(DateTime(2026, 11, 3), now: now), '11月3日 周二');
      expect(
        formatDayLabel(DateTime(2025, 11, 12), now: now),
        '2025年11月12日 周三',
      );
      expect(sourceLabel('manual'), '手动记账');
      expect(sourceLabel('screenshot'), '截图');
      expect(sourceLabel('alipay'), '支付宝');
      expect(sourceLabel('wechat'), '微信');
      expect(sourceLabel('cmb'), '招商银行');
      expect(sourceLabel('generic'), '账单导入');
      expect(sourceLabel('other'), '其他');
      expect(sourceLabel(null), '其他');
      expect(
        displayNameFor(
          const TransactionItem(
            id: 'tx-unnamed',
            type: 'expense',
            amountMinor: 100,
            currency: 'CNY',
            transactionTime: '2026-07-18T04:30:00.000Z',
            source: 'manual',
          ),
        ),
        '未命名交易',
      );
      expect(displayNameFor(testTransaction), 'Mountain Cafe');
    },
  );

  test(
    'formats short days and months across runtime language switches',
    () async {
      await initializeDateFormatting();
      addTearDown(() => applyLanguage(AppLanguage.en));
      final sample = DateTime(2026, 7, 5);

      applyLanguage(AppLanguage.en);
      expect(formatShortDay(sample), 'Jul 5');
      expect(formatShortMonth(sample), 'Jul');

      applyLanguage(AppLanguage.zh);
      expect(formatShortDay(sample), '7月5日');
      expect(formatShortMonth(sample), '7月');

      applyLanguage(AppLanguage.en);
      expect(formatShortDay(sample), 'Jul 5');
      expect(formatShortMonth(sample), 'Jul');
    },
  );
}
