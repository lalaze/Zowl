import 'package:json_annotation/json_annotation.dart';

import 'l10n.dart';

part 'models.g.dart';

@JsonSerializable()
class SessionUser {
  const SessionUser({
    required this.id,
    required this.email,
    required this.displayName,
    required this.avatarPreset,
    required this.timezone,
    this.role = 'member',
  });
  final String id;
  final String email;
  final String displayName;
  @JsonKey(defaultValue: 'member')
  final String role;
  final String avatarPreset;
  final String timezone;
  bool get isAdmin => role == 'admin';
  factory SessionUser.fromJson(Map<String, dynamic> json) =>
      _$SessionUserFromJson(json);
  Map<String, dynamic> toJson() => _$SessionUserToJson(this);
  SessionUser copyWith({String? displayName, String? avatarPreset}) =>
      SessionUser(
        id: id,
        email: email,
        displayName: displayName ?? this.displayName,
        role: role,
        avatarPreset: avatarPreset ?? this.avatarPreset,
        timezone: timezone,
      );
}

@JsonSerializable()
class AdminAccount {
  const AdminAccount({
    required this.id,
    required this.email,
    required this.displayName,
    required this.role,
    required this.disabled,
    required this.createdAt,
  });

  final String id;
  final String email;
  final String displayName;
  final String role;
  final bool disabled;
  final String createdAt;

  factory AdminAccount.fromJson(Map<String, dynamic> json) =>
      _$AdminAccountFromJson(json);
  Map<String, dynamic> toJson() => _$AdminAccountToJson(this);
}

@JsonSerializable()
class AdminAccountPage {
  const AdminAccountPage({required this.items, required this.pagination});

  final List<AdminAccount> items;
  final Pagination pagination;

  factory AdminAccountPage.fromJson(Map<String, dynamic> json) =>
      _$AdminAccountPageFromJson(json);
  Map<String, dynamic> toJson() => _$AdminAccountPageToJson(this);
}

@JsonSerializable()
class TokenSession {
  const TokenSession({
    required this.tokenType,
    required this.accessToken,
    required this.expiresAt,
    required this.user,
  });
  final String tokenType;
  final String accessToken;
  final String expiresAt;
  final SessionUser user;
  factory TokenSession.fromJson(Map<String, dynamic> json) =>
      _$TokenSessionFromJson(json);
  Map<String, dynamic> toJson() => _$TokenSessionToJson(this);
}

@JsonSerializable()
class Category {
  const Category({
    required this.id,
    required this.name,
    required this.kind,
    this.icon,
    this.color,
    this.sortOrder = 0,
  });
  final String id;
  final String name;
  final String kind;
  final String? icon;
  final String? color;
  final int sortOrder;
  factory Category.fromJson(Map<String, dynamic> json) =>
      _$CategoryFromJson(json);
  Map<String, dynamic> toJson() => _$CategoryToJson(this);
}

/// One line of goods read from a shopping app's order page.
class OrderItem {
  const OrderItem({
    required this.name,
    this.spec,
    this.quantity,
    this.priceMinor,
  });

  final String name;
  final String? spec;
  final int? quantity;

  /// Listed price on the order page in CNY minor units; not the amount paid.
  final int? priceMinor;

  factory OrderItem.fromJson(Map<String, dynamic> json) => OrderItem(
    name: _text(json['name']) ?? '',
    spec: _text(json['spec']),
    quantity: _whole(json['quantity']),
    priceMinor: _whole(json['priceMinor']),
  );

  Map<String, dynamic> toJson() => {
    'name': name,
    'spec': spec,
    'quantity': quantity,
    'priceMinor': priceMinor,
  };
}

/// The itemised goods the server attached to a shopping-app payment.
class OrderDetails {
  const OrderDetails({required this.items, this.shopName});

  final String? shopName;
  final List<OrderItem> items;

  factory OrderDetails.fromJson(Map<String, dynamic> json) => OrderDetails(
    shopName: _text(json['shopName']),
    items: [
      for (final entry in json['items'] as List? ?? const [])
        if (entry is Map) OrderItem.fromJson(Map<String, dynamic>.from(entry)),
    ].where((item) => item.name.isNotEmpty).toList(growable: false),
  );

  /// Reads the `orderDetails` field of a DTO: null when it is absent, null,
  /// not an object, or lists no usable item.
  static OrderDetails? parse(Object? json) {
    if (json is! Map) return null;
    final details = OrderDetails.fromJson(Map<String, dynamic>.from(json));
    return details.items.isEmpty ? null : details;
  }

  Map<String, dynamic> toJson() => {
    'shopName': shopName,
    'items': [for (final item in items) item.toJson()],
  };
}

String? _text(Object? value) {
  final text = value is String ? value.trim() : '';
  return text.isEmpty ? null : text;
}

int? _whole(Object? value) => value is num ? value.toInt() : null;

@JsonSerializable()
class TransactionItem {
  const TransactionItem({
    required this.id,
    required this.type,
    required this.amountMinor,
    required this.currency,
    required this.transactionTime,
    required this.source,
    this.amount,
    this.merchantName,
    this.description,
    this.categoryId,
    this.categoryName,
    this.categoryColor,
    this.paymentMethod,
    this.platformTransactionId,
    this.currentRevisionId,
    this.revisionNumber = 0,
    this.orderDetails,
  });
  final String id;
  final String type;
  final int amountMinor;
  final String currency;
  final String? amount;
  final String? merchantName;
  final String? description;
  final String? categoryId;
  final String? categoryName;
  final String? categoryColor;
  final String transactionTime;
  final String source;
  final String? paymentMethod;
  final String? platformTransactionId;
  final String? currentRevisionId;
  final int revisionNumber;

  /// Goods bought in this payment, when the server recognised them.
  @JsonKey(fromJson: OrderDetails.parse)
  final OrderDetails? orderDetails;
  factory TransactionItem.fromJson(Map<String, dynamic> json) =>
      _$TransactionItemFromJson(json);
  Map<String, dynamic> toJson() => _$TransactionItemToJson(this);
}

@JsonSerializable()
class Pagination {
  const Pagination({
    required this.page,
    required this.limit,
    required this.total,
    required this.totalPages,
  });
  final int page;
  final int limit;
  final int total;
  final int totalPages;
  factory Pagination.fromJson(Map<String, dynamic> json) =>
      _$PaginationFromJson(json);
  Map<String, dynamic> toJson() => _$PaginationToJson(this);
}

@JsonSerializable()
class TransactionCurrencyTotal {
  const TransactionCurrencyTotal({
    required this.currency,
    this.expenseMinor = 0,
    this.refundMinor = 0,
    this.incomeMinor = 0,
    this.transferMinor = 0,
  });
  final String currency;
  final int expenseMinor;
  final int refundMinor;
  final int incomeMinor;
  final int transferMinor;
  factory TransactionCurrencyTotal.fromJson(Map<String, dynamic> json) =>
      _$TransactionCurrencyTotalFromJson(json);
  Map<String, dynamic> toJson() => _$TransactionCurrencyTotalToJson(this);
}

@JsonSerializable()
class TransactionPage {
  const TransactionPage({
    required this.items,
    required this.pagination,
    this.totals,
  });
  final List<TransactionItem> items;
  final Pagination pagination;
  final List<TransactionCurrencyTotal>? totals;
  factory TransactionPage.fromJson(Map<String, dynamic> json) =>
      _$TransactionPageFromJson(json);
  Map<String, dynamic> toJson() => _$TransactionPageToJson(this);
}

@JsonSerializable()
class FlowSummary {
  const FlowSummary({
    required this.grossExpenseMinor,
    required this.refundMinor,
    required this.netExpenseMinor,
    required this.incomeMinor,
    required this.transferMinor,
    required this.balanceMinor,
    required this.expenseCount,
    required this.refundCount,
    required this.incomeCount,
    required this.transferCount,
    required this.transactionCount,
  });
  final int grossExpenseMinor;
  final int refundMinor;
  final int netExpenseMinor;
  final int incomeMinor;
  final int transferMinor;
  final int balanceMinor;
  final int expenseCount;
  final int refundCount;
  final int incomeCount;
  final int transferCount;
  final int transactionCount;
  factory FlowSummary.fromJson(Map<String, dynamic> json) =>
      _$FlowSummaryFromJson(json);
  Map<String, dynamic> toJson() => _$FlowSummaryToJson(this);
}

@JsonSerializable()
class DistributionItem {
  const DistributionItem({
    required this.amountMinor,
    required this.transactionCount,
    required this.sharePercent,
    this.categoryId,
    this.name,
    this.source,
    this.color,
    this.icon,
  });
  final String? categoryId;
  final String? name;
  final String? source;
  final String? color;
  final String? icon;
  final int amountMinor;
  final int transactionCount;
  final double sharePercent;
  factory DistributionItem.fromJson(Map<String, dynamic> json) =>
      _$DistributionItemFromJson(json);
  Map<String, dynamic> toJson() => _$DistributionItemToJson(this);
}

@JsonSerializable()
class TrendPoint {
  const TrendPoint({
    required this.label,
    required this.netExpenseMinor,
    required this.incomeMinor,
    this.date,
    this.month,
  });
  final String label;
  final String? date;
  final String? month;
  final int netExpenseMinor;
  final int incomeMinor;
  factory TrendPoint.fromJson(Map<String, dynamic> json) =>
      _$TrendPointFromJson(json);
  Map<String, dynamic> toJson() => _$TrendPointToJson(this);
}

@JsonSerializable()
class CurrencyBreakdown {
  const CurrencyBreakdown({required this.currency, required this.summary});
  final String currency;
  final FlowSummary summary;
  factory CurrencyBreakdown.fromJson(Map<String, dynamic> json) =>
      _$CurrencyBreakdownFromJson(json);
  Map<String, dynamic> toJson() => _$CurrencyBreakdownToJson(this);
}

@JsonSerializable()
class MonthChange {
  const MonthChange({
    required this.currentMinor,
    required this.previousMinor,
    required this.deltaMinor,
    required this.status,
    this.ratePercent,
  });
  final int currentMinor;
  final int previousMinor;
  final int deltaMinor;

  /// Null when the previous month was zero and this month is not.
  final double? ratePercent;

  /// up, down, unchanged or new.
  final String status;
  factory MonthChange.fromJson(Map<String, dynamic> json) =>
      _$MonthChangeFromJson(json);
  Map<String, dynamic> toJson() => _$MonthChangeToJson(this);
}

@JsonSerializable()
class MonthChanges {
  const MonthChanges({this.netExpense, this.income, this.balance});
  final MonthChange? netExpense;
  final MonthChange? income;
  final MonthChange? balance;
  factory MonthChanges.fromJson(Map<String, dynamic> json) =>
      _$MonthChangesFromJson(json);
  Map<String, dynamic> toJson() => _$MonthChangesToJson(this);
}

@JsonSerializable()
class PeakExpense {
  const PeakExpense({
    required this.transactionId,
    required this.amountMinor,
    this.merchantName,
  });
  final String transactionId;
  final String? merchantName;
  final int amountMinor;
  factory PeakExpense.fromJson(Map<String, dynamic> json) =>
      _$PeakExpenseFromJson(json);
  Map<String, dynamic> toJson() => _$PeakExpenseToJson(this);
}

/// The day with the highest net spending this month, and its largest expense.
@JsonSerializable()
class PeakSpendingDay {
  const PeakSpendingDay({
    required this.date,
    required this.netExpenseMinor,
    required this.expenseCount,
    this.topExpense,
  });
  final String date;
  final int netExpenseMinor;
  final int expenseCount;
  final PeakExpense? topExpense;
  factory PeakSpendingDay.fromJson(Map<String, dynamic> json) =>
      _$PeakSpendingDayFromJson(json);
  Map<String, dynamic> toJson() => _$PeakSpendingDayToJson(this);
}

@JsonSerializable()
class StatisticsOverview {
  const StatisticsOverview({
    required this.month,
    required this.currency,
    required this.summary,
    required this.recentTransactions,
    this.changes,
    this.peakSpendingDay,
    this.excludedCurrencies = const [],
    this.categoryDistribution = const [],
    this.sourceDistribution = const [],
    this.dailyTrend = const [],
    this.monthlyTrend = const [],
  });
  final String month;
  final String currency;
  final FlowSummary summary;
  final MonthChanges? changes;
  final PeakSpendingDay? peakSpendingDay;
  final List<CurrencyBreakdown> excludedCurrencies;
  final List<DistributionItem> categoryDistribution;
  final List<DistributionItem> sourceDistribution;
  final List<TrendPoint> dailyTrend;
  final List<TrendPoint> monthlyTrend;
  final List<TransactionItem> recentTransactions;
  factory StatisticsOverview.fromJson(Map<String, dynamic> json) =>
      _$StatisticsOverviewFromJson(json);
  Map<String, dynamic> toJson() => _$StatisticsOverviewToJson(this);
}

@JsonSerializable()
class RecognitionProviderInfo {
  const RecognitionProviderInfo({
    required this.id,
    required this.label,
    required this.sendsImagesToThirdParty,
    required this.disclosure,
    required this.retentionPolicy,
  });
  final String id;
  final String label;
  final bool sendsImagesToThirdParty;
  final String disclosure;
  final String retentionPolicy;
  factory RecognitionProviderInfo.fromJson(Map<String, dynamic> json) =>
      _$RecognitionProviderInfoFromJson(json);
  Map<String, dynamic> toJson() => _$RecognitionProviderInfoToJson(this);
}

@JsonSerializable()
class RecognitionJob {
  const RecognitionJob({
    required this.id,
    required this.status,
    required this.createdAt,
    this.providerId,
    this.totalCount = 0,
    this.importedCount = 0,
    this.skippedCount = 0,
  });
  final String id;
  final String status;
  final String createdAt;
  final String? providerId;
  final int totalCount;
  final int importedCount;
  final int skippedCount;
  factory RecognitionJob.fromJson(Map<String, dynamic> json) =>
      _$RecognitionJobFromJson(json);
  Map<String, dynamic> toJson() => _$RecognitionJobToJson(this);
}

@JsonSerializable()
class RecognitionItem {
  const RecognitionItem({
    required this.id,
    required this.fileId,
    required this.fileName,
    required this.previewUrl,
    required this.status,
    this.resultTransactionId,
    this.transactionTime,
    this.type,
    this.amountMinor,
    this.amount,
    this.currency,
    this.merchantName,
    this.categoryId,
    this.description,
    this.paymentMethod,
    this.platformTransactionId,
    this.transactionStatus,
    this.confidence,
    this.duplicateKind,
    this.decision,
    this.warnings = const [],
    this.validationErrors = const [],
  });
  final String? resultTransactionId;
  final String id;
  final String fileId;
  final String fileName;
  final String previewUrl;
  final String status;
  final String? transactionTime;
  final String? type;
  final int? amountMinor;
  final String? amount;
  final String? currency;
  final String? merchantName;
  final String? categoryId;
  final String? description;
  final String? paymentMethod;
  final String? platformTransactionId;
  final String? transactionStatus;
  final double? confidence;
  final String? duplicateKind;
  final String? decision;
  final List<dynamic> warnings;
  final List<dynamic> validationErrors;
  factory RecognitionItem.fromJson(Map<String, dynamic> json) =>
      _$RecognitionItemFromJson(json);
  Map<String, dynamic> toJson() => _$RecognitionItemToJson(this);
}

@JsonSerializable()
class RecognitionReview {
  const RecognitionReview({required this.job, required this.items});
  final RecognitionJob job;
  final List<RecognitionItem> items;
  factory RecognitionReview.fromJson(Map<String, dynamic> json) =>
      _$RecognitionReviewFromJson(json);
  Map<String, dynamic> toJson() => _$RecognitionReviewToJson(this);
}

class NotificationCaptureItem {
  const NotificationCaptureItem({
    required this.id,
    required this.platform,
    required this.notificationPostedAt,
    required this.amountMinor,
    required this.currency,
    required this.transactionTime,
    required this.duplicateStatus,
    required this.status,
    required this.confidenceBasisPoints,
    this.captureMethod = 'notification',
    this.confirmationVersion = 1,
    this.merchantName,
    this.description,
    this.categoryId,
    this.paymentMethod,
    this.duplicateTransactionId,
    this.duplicateAssessmentDigest,
    this.resultTransactionId,
    this.resultCode,
    this.orderDetails,
    this.warnings = const [],
    this.validationErrors = const [],
  });

  final int confirmationVersion;
  final String id;
  final String platform;
  final String captureMethod;
  final String notificationPostedAt;
  final int amountMinor;
  final String currency;
  final String transactionTime;
  final int confidenceBasisPoints;
  final String? merchantName;
  final String? description;
  final String? categoryId;
  final String? paymentMethod;
  final String duplicateStatus;
  final String? duplicateTransactionId;
  final String? duplicateAssessmentDigest;
  final String status;
  final String? resultTransactionId;
  final String? resultCode;
  final OrderDetails? orderDetails;
  final List<dynamic> warnings;
  final List<dynamic> validationErrors;

  factory NotificationCaptureItem.fromJson(Map<String, dynamic> json) =>
      NotificationCaptureItem(
        id: json['id'].toString(),
        confirmationVersion:
            (json['confirmationVersion'] as num?)?.toInt() ?? 1,
        platform: json['platform'].toString(),
        captureMethod: json['captureMethod']?.toString() ?? 'notification',
        notificationPostedAt: json['notificationPostedAt'].toString(),
        amountMinor: (json['amountMinor'] as num).toInt(),
        currency: json['currency'].toString(),
        transactionTime: json['transactionTime'].toString(),
        confidenceBasisPoints:
            (json['confidenceBasisPoints'] as num?)?.toInt() ?? 0,
        merchantName: json['merchantName']?.toString(),
        description: json['description']?.toString(),
        categoryId: json['categoryId']?.toString(),
        paymentMethod: json['paymentMethod']?.toString(),
        duplicateStatus: json['duplicateStatus']?.toString() ?? 'unique',
        duplicateTransactionId: json['duplicateTransactionId']?.toString(),
        duplicateAssessmentDigest: json['duplicateAssessmentDigest']
            ?.toString(),
        status: json['status']?.toString() ?? 'reviewing',
        resultTransactionId: json['resultTransactionId']?.toString(),
        resultCode: json['resultCode']?.toString(),
        orderDetails: OrderDetails.parse(json['orderDetails']),
        warnings: json['warnings'] as List? ?? const [],
        validationErrors: json['validationErrors'] as List? ?? const [],
      );
}

class NotificationCaptureSettings {
  const NotificationCaptureSettings({
    required this.autoPostAlipay,
    required this.autoPostWechat,
    required this.autoPostCmb,
    this.autoPostPaymentPages = false,
    required this.autoPostMaxAmountMinor,
    required this.autoPostTrustedMaxAmountMinor,
  });

  final bool autoPostAlipay;
  final bool autoPostWechat;
  final bool autoPostCmb;
  final bool autoPostPaymentPages;
  final int autoPostMaxAmountMinor;
  final int autoPostTrustedMaxAmountMinor;

  factory NotificationCaptureSettings.fromJson(Map<String, dynamic> json) =>
      NotificationCaptureSettings(
        autoPostAlipay: json['autoPostAlipay'] == true,
        autoPostWechat: json['autoPostWechat'] == true,
        autoPostCmb: json['autoPostCmb'] == true,
        autoPostPaymentPages: json['autoPostPaymentPages'] == true,
        autoPostMaxAmountMinor:
            (json['autoPostMaxAmountMinor'] as num?)?.toInt() ?? 50000,
        autoPostTrustedMaxAmountMinor:
            (json['autoPostTrustedMaxAmountMinor'] as num?)?.toInt() ?? 500000,
      );
}

class NotificationCapturePage {
  const NotificationCapturePage({
    required this.items,
    required this.pagination,
    required this.pendingCount,
  });

  final List<NotificationCaptureItem> items;
  final Pagination pagination;
  final int pendingCount;

  factory NotificationCapturePage.fromJson(Map<String, dynamic> json) =>
      NotificationCapturePage(
        items: (json['items'] as List)
            .map(
              (item) => NotificationCaptureItem.fromJson(
                Map<String, dynamic>.from(item as Map),
              ),
            )
            .toList(),
        pagination: Pagination.fromJson(
          Map<String, dynamic>.from(json['pagination'] as Map),
        ),
        pendingCount: (json['pendingCount'] as num?)?.toInt() ?? 0,
      );
}

/// The title of a transaction. A payment with recognised goods is named after
/// what was bought; its shop goes in the subtitle instead.
String displayNameFor(TransactionItem item) {
  final hasItems = item.orderDetails?.items.isNotEmpty ?? false;
  final summary = hasItems ? _text(item.description) : null;
  return summary ??
      item.merchantName ??
      item.description ??
      tr('Untitled transaction', '未命名交易');
}

bool isIncoming(String type) => type == 'income' || type == 'refund';

/// Matches server-side `categoryKindSupportsTransaction` (`src/lib/category-kind.ts`).
bool categoryKindSupportsTransaction(String kind, String type) {
  if (kind == 'both') return true;
  return isIncoming(type) ? kind == 'income' : kind == 'expense';
}
