// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SessionUser _$SessionUserFromJson(Map<String, dynamic> json) => SessionUser(
  id: json['id'] as String,
  email: json['email'] as String,
  displayName: json['displayName'] as String,
  avatarPreset: json['avatarPreset'] as String,
  timezone: json['timezone'] as String,
  role: json['role'] as String? ?? 'member',
);

Map<String, dynamic> _$SessionUserToJson(SessionUser instance) =>
    <String, dynamic>{
      'id': instance.id,
      'email': instance.email,
      'displayName': instance.displayName,
      'role': instance.role,
      'avatarPreset': instance.avatarPreset,
      'timezone': instance.timezone,
    };

AdminAccount _$AdminAccountFromJson(Map<String, dynamic> json) => AdminAccount(
  id: json['id'] as String,
  email: json['email'] as String,
  displayName: json['displayName'] as String,
  role: json['role'] as String,
  disabled: json['disabled'] as bool,
  createdAt: json['createdAt'] as String,
);

Map<String, dynamic> _$AdminAccountToJson(AdminAccount instance) =>
    <String, dynamic>{
      'id': instance.id,
      'email': instance.email,
      'displayName': instance.displayName,
      'role': instance.role,
      'disabled': instance.disabled,
      'createdAt': instance.createdAt,
    };

AdminAccountPage _$AdminAccountPageFromJson(Map<String, dynamic> json) =>
    AdminAccountPage(
      items: (json['items'] as List<dynamic>)
          .map((e) => AdminAccount.fromJson(e as Map<String, dynamic>))
          .toList(),
      pagination: Pagination.fromJson(
        json['pagination'] as Map<String, dynamic>,
      ),
    );

Map<String, dynamic> _$AdminAccountPageToJson(AdminAccountPage instance) =>
    <String, dynamic>{
      'items': instance.items,
      'pagination': instance.pagination,
    };

TokenSession _$TokenSessionFromJson(Map<String, dynamic> json) => TokenSession(
  tokenType: json['tokenType'] as String,
  accessToken: json['accessToken'] as String,
  expiresAt: json['expiresAt'] as String,
  user: SessionUser.fromJson(json['user'] as Map<String, dynamic>),
);

Map<String, dynamic> _$TokenSessionToJson(TokenSession instance) =>
    <String, dynamic>{
      'tokenType': instance.tokenType,
      'accessToken': instance.accessToken,
      'expiresAt': instance.expiresAt,
      'user': instance.user,
    };

Category _$CategoryFromJson(Map<String, dynamic> json) => Category(
  id: json['id'] as String,
  name: json['name'] as String,
  kind: json['kind'] as String,
  icon: json['icon'] as String?,
  color: json['color'] as String?,
  sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 0,
);

Map<String, dynamic> _$CategoryToJson(Category instance) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'kind': instance.kind,
  'icon': instance.icon,
  'color': instance.color,
  'sortOrder': instance.sortOrder,
};

TransactionItem _$TransactionItemFromJson(Map<String, dynamic> json) =>
    TransactionItem(
      id: json['id'] as String,
      type: json['type'] as String,
      amountMinor: (json['amountMinor'] as num).toInt(),
      currency: json['currency'] as String,
      transactionTime: json['transactionTime'] as String,
      source: json['source'] as String,
      amount: json['amount'] as String?,
      merchantName: json['merchantName'] as String?,
      description: json['description'] as String?,
      categoryId: json['categoryId'] as String?,
      categoryName: json['categoryName'] as String?,
      categoryColor: json['categoryColor'] as String?,
      paymentMethod: json['paymentMethod'] as String?,
      platformTransactionId: json['platformTransactionId'] as String?,
      currentRevisionId: json['currentRevisionId'] as String?,
      revisionNumber: (json['revisionNumber'] as num?)?.toInt() ?? 0,
      orderDetails: OrderDetails.parse(json['orderDetails']),
    );

Map<String, dynamic> _$TransactionItemToJson(TransactionItem instance) =>
    <String, dynamic>{
      'id': instance.id,
      'type': instance.type,
      'amountMinor': instance.amountMinor,
      'currency': instance.currency,
      'amount': instance.amount,
      'merchantName': instance.merchantName,
      'description': instance.description,
      'categoryId': instance.categoryId,
      'categoryName': instance.categoryName,
      'categoryColor': instance.categoryColor,
      'transactionTime': instance.transactionTime,
      'source': instance.source,
      'paymentMethod': instance.paymentMethod,
      'platformTransactionId': instance.platformTransactionId,
      'currentRevisionId': instance.currentRevisionId,
      'revisionNumber': instance.revisionNumber,
      'orderDetails': instance.orderDetails,
    };

Pagination _$PaginationFromJson(Map<String, dynamic> json) => Pagination(
  page: (json['page'] as num).toInt(),
  limit: (json['limit'] as num).toInt(),
  total: (json['total'] as num).toInt(),
  totalPages: (json['totalPages'] as num).toInt(),
);

Map<String, dynamic> _$PaginationToJson(Pagination instance) =>
    <String, dynamic>{
      'page': instance.page,
      'limit': instance.limit,
      'total': instance.total,
      'totalPages': instance.totalPages,
    };

TransactionCurrencyTotal _$TransactionCurrencyTotalFromJson(
  Map<String, dynamic> json,
) => TransactionCurrencyTotal(
  currency: json['currency'] as String,
  expenseMinor: (json['expenseMinor'] as num?)?.toInt() ?? 0,
  refundMinor: (json['refundMinor'] as num?)?.toInt() ?? 0,
  incomeMinor: (json['incomeMinor'] as num?)?.toInt() ?? 0,
  transferMinor: (json['transferMinor'] as num?)?.toInt() ?? 0,
);

Map<String, dynamic> _$TransactionCurrencyTotalToJson(
  TransactionCurrencyTotal instance,
) => <String, dynamic>{
  'currency': instance.currency,
  'expenseMinor': instance.expenseMinor,
  'refundMinor': instance.refundMinor,
  'incomeMinor': instance.incomeMinor,
  'transferMinor': instance.transferMinor,
};

TransactionPage _$TransactionPageFromJson(
  Map<String, dynamic> json,
) => TransactionPage(
  items: (json['items'] as List<dynamic>)
      .map((e) => TransactionItem.fromJson(e as Map<String, dynamic>))
      .toList(),
  pagination: Pagination.fromJson(json['pagination'] as Map<String, dynamic>),
  totals: (json['totals'] as List<dynamic>?)
      ?.map((e) => TransactionCurrencyTotal.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$TransactionPageToJson(TransactionPage instance) =>
    <String, dynamic>{
      'items': instance.items,
      'pagination': instance.pagination,
      'totals': instance.totals,
    };

FlowSummary _$FlowSummaryFromJson(Map<String, dynamic> json) => FlowSummary(
  grossExpenseMinor: (json['grossExpenseMinor'] as num).toInt(),
  refundMinor: (json['refundMinor'] as num).toInt(),
  netExpenseMinor: (json['netExpenseMinor'] as num).toInt(),
  incomeMinor: (json['incomeMinor'] as num).toInt(),
  transferMinor: (json['transferMinor'] as num).toInt(),
  balanceMinor: (json['balanceMinor'] as num).toInt(),
  expenseCount: (json['expenseCount'] as num).toInt(),
  refundCount: (json['refundCount'] as num).toInt(),
  incomeCount: (json['incomeCount'] as num).toInt(),
  transferCount: (json['transferCount'] as num).toInt(),
  transactionCount: (json['transactionCount'] as num).toInt(),
);

Map<String, dynamic> _$FlowSummaryToJson(FlowSummary instance) =>
    <String, dynamic>{
      'grossExpenseMinor': instance.grossExpenseMinor,
      'refundMinor': instance.refundMinor,
      'netExpenseMinor': instance.netExpenseMinor,
      'incomeMinor': instance.incomeMinor,
      'transferMinor': instance.transferMinor,
      'balanceMinor': instance.balanceMinor,
      'expenseCount': instance.expenseCount,
      'refundCount': instance.refundCount,
      'incomeCount': instance.incomeCount,
      'transferCount': instance.transferCount,
      'transactionCount': instance.transactionCount,
    };

DistributionItem _$DistributionItemFromJson(Map<String, dynamic> json) =>
    DistributionItem(
      amountMinor: (json['amountMinor'] as num).toInt(),
      transactionCount: (json['transactionCount'] as num).toInt(),
      sharePercent: (json['sharePercent'] as num).toDouble(),
      categoryId: json['categoryId'] as String?,
      name: json['name'] as String?,
      source: json['source'] as String?,
      color: json['color'] as String?,
      icon: json['icon'] as String?,
    );

Map<String, dynamic> _$DistributionItemToJson(DistributionItem instance) =>
    <String, dynamic>{
      'categoryId': instance.categoryId,
      'name': instance.name,
      'source': instance.source,
      'color': instance.color,
      'icon': instance.icon,
      'amountMinor': instance.amountMinor,
      'transactionCount': instance.transactionCount,
      'sharePercent': instance.sharePercent,
    };

TrendPoint _$TrendPointFromJson(Map<String, dynamic> json) => TrendPoint(
  label: json['label'] as String,
  netExpenseMinor: (json['netExpenseMinor'] as num).toInt(),
  incomeMinor: (json['incomeMinor'] as num).toInt(),
  date: json['date'] as String?,
  month: json['month'] as String?,
);

Map<String, dynamic> _$TrendPointToJson(TrendPoint instance) =>
    <String, dynamic>{
      'label': instance.label,
      'date': instance.date,
      'month': instance.month,
      'netExpenseMinor': instance.netExpenseMinor,
      'incomeMinor': instance.incomeMinor,
    };

CurrencyBreakdown _$CurrencyBreakdownFromJson(Map<String, dynamic> json) =>
    CurrencyBreakdown(
      currency: json['currency'] as String,
      summary: FlowSummary.fromJson(json['summary'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$CurrencyBreakdownToJson(CurrencyBreakdown instance) =>
    <String, dynamic>{
      'currency': instance.currency,
      'summary': instance.summary,
    };

MonthChange _$MonthChangeFromJson(Map<String, dynamic> json) => MonthChange(
  currentMinor: (json['currentMinor'] as num).toInt(),
  previousMinor: (json['previousMinor'] as num).toInt(),
  deltaMinor: (json['deltaMinor'] as num).toInt(),
  status: json['status'] as String,
  ratePercent: (json['ratePercent'] as num?)?.toDouble(),
);

Map<String, dynamic> _$MonthChangeToJson(MonthChange instance) =>
    <String, dynamic>{
      'currentMinor': instance.currentMinor,
      'previousMinor': instance.previousMinor,
      'deltaMinor': instance.deltaMinor,
      'ratePercent': instance.ratePercent,
      'status': instance.status,
    };

MonthChanges _$MonthChangesFromJson(Map<String, dynamic> json) => MonthChanges(
  netExpense: json['netExpense'] == null
      ? null
      : MonthChange.fromJson(json['netExpense'] as Map<String, dynamic>),
  income: json['income'] == null
      ? null
      : MonthChange.fromJson(json['income'] as Map<String, dynamic>),
  balance: json['balance'] == null
      ? null
      : MonthChange.fromJson(json['balance'] as Map<String, dynamic>),
);

Map<String, dynamic> _$MonthChangesToJson(MonthChanges instance) =>
    <String, dynamic>{
      'netExpense': instance.netExpense,
      'income': instance.income,
      'balance': instance.balance,
    };

PeakExpense _$PeakExpenseFromJson(Map<String, dynamic> json) => PeakExpense(
  transactionId: json['transactionId'] as String,
  amountMinor: (json['amountMinor'] as num).toInt(),
  merchantName: json['merchantName'] as String?,
);

Map<String, dynamic> _$PeakExpenseToJson(PeakExpense instance) =>
    <String, dynamic>{
      'transactionId': instance.transactionId,
      'merchantName': instance.merchantName,
      'amountMinor': instance.amountMinor,
    };

PeakSpendingDay _$PeakSpendingDayFromJson(Map<String, dynamic> json) =>
    PeakSpendingDay(
      date: json['date'] as String,
      netExpenseMinor: (json['netExpenseMinor'] as num).toInt(),
      expenseCount: (json['expenseCount'] as num).toInt(),
      topExpense: json['topExpense'] == null
          ? null
          : PeakExpense.fromJson(json['topExpense'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$PeakSpendingDayToJson(PeakSpendingDay instance) =>
    <String, dynamic>{
      'date': instance.date,
      'netExpenseMinor': instance.netExpenseMinor,
      'expenseCount': instance.expenseCount,
      'topExpense': instance.topExpense,
    };

StatisticsOverview _$StatisticsOverviewFromJson(Map<String, dynamic> json) =>
    StatisticsOverview(
      month: json['month'] as String,
      currency: json['currency'] as String,
      summary: FlowSummary.fromJson(json['summary'] as Map<String, dynamic>),
      recentTransactions: (json['recentTransactions'] as List<dynamic>)
          .map((e) => TransactionItem.fromJson(e as Map<String, dynamic>))
          .toList(),
      changes: json['changes'] == null
          ? null
          : MonthChanges.fromJson(json['changes'] as Map<String, dynamic>),
      peakSpendingDay: json['peakSpendingDay'] == null
          ? null
          : PeakSpendingDay.fromJson(
              json['peakSpendingDay'] as Map<String, dynamic>,
            ),
      excludedCurrencies:
          (json['excludedCurrencies'] as List<dynamic>?)
              ?.map(
                (e) => CurrencyBreakdown.fromJson(e as Map<String, dynamic>),
              )
              .toList() ??
          const [],
      categoryDistribution:
          (json['categoryDistribution'] as List<dynamic>?)
              ?.map((e) => DistributionItem.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
      sourceDistribution:
          (json['sourceDistribution'] as List<dynamic>?)
              ?.map((e) => DistributionItem.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
      dailyTrend:
          (json['dailyTrend'] as List<dynamic>?)
              ?.map((e) => TrendPoint.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
      monthlyTrend:
          (json['monthlyTrend'] as List<dynamic>?)
              ?.map((e) => TrendPoint.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
    );

Map<String, dynamic> _$StatisticsOverviewToJson(StatisticsOverview instance) =>
    <String, dynamic>{
      'month': instance.month,
      'currency': instance.currency,
      'summary': instance.summary,
      'changes': instance.changes,
      'peakSpendingDay': instance.peakSpendingDay,
      'excludedCurrencies': instance.excludedCurrencies,
      'categoryDistribution': instance.categoryDistribution,
      'sourceDistribution': instance.sourceDistribution,
      'dailyTrend': instance.dailyTrend,
      'monthlyTrend': instance.monthlyTrend,
      'recentTransactions': instance.recentTransactions,
    };

RecognitionProviderInfo _$RecognitionProviderInfoFromJson(
  Map<String, dynamic> json,
) => RecognitionProviderInfo(
  id: json['id'] as String,
  label: json['label'] as String,
  sendsImagesToThirdParty: json['sendsImagesToThirdParty'] as bool,
  disclosure: json['disclosure'] as String,
  retentionPolicy: json['retentionPolicy'] as String,
);

Map<String, dynamic> _$RecognitionProviderInfoToJson(
  RecognitionProviderInfo instance,
) => <String, dynamic>{
  'id': instance.id,
  'label': instance.label,
  'sendsImagesToThirdParty': instance.sendsImagesToThirdParty,
  'disclosure': instance.disclosure,
  'retentionPolicy': instance.retentionPolicy,
};

RecognitionJob _$RecognitionJobFromJson(Map<String, dynamic> json) =>
    RecognitionJob(
      id: json['id'] as String,
      status: json['status'] as String,
      createdAt: json['createdAt'] as String,
      providerId: json['providerId'] as String?,
      totalCount: (json['totalCount'] as num?)?.toInt() ?? 0,
      importedCount: (json['importedCount'] as num?)?.toInt() ?? 0,
      skippedCount: (json['skippedCount'] as num?)?.toInt() ?? 0,
    );

Map<String, dynamic> _$RecognitionJobToJson(RecognitionJob instance) =>
    <String, dynamic>{
      'id': instance.id,
      'status': instance.status,
      'createdAt': instance.createdAt,
      'providerId': instance.providerId,
      'totalCount': instance.totalCount,
      'importedCount': instance.importedCount,
      'skippedCount': instance.skippedCount,
    };

RecognitionItem _$RecognitionItemFromJson(Map<String, dynamic> json) =>
    RecognitionItem(
      id: json['id'] as String,
      fileId: json['fileId'] as String,
      fileName: json['fileName'] as String,
      previewUrl: json['previewUrl'] as String,
      status: json['status'] as String,
      resultTransactionId: json['resultTransactionId'] as String?,
      transactionTime: json['transactionTime'] as String?,
      type: json['type'] as String?,
      amountMinor: (json['amountMinor'] as num?)?.toInt(),
      amount: json['amount'] as String?,
      currency: json['currency'] as String?,
      merchantName: json['merchantName'] as String?,
      categoryId: json['categoryId'] as String?,
      description: json['description'] as String?,
      paymentMethod: json['paymentMethod'] as String?,
      platformTransactionId: json['platformTransactionId'] as String?,
      transactionStatus: json['transactionStatus'] as String?,
      confidence: (json['confidence'] as num?)?.toDouble(),
      duplicateKind: json['duplicateKind'] as String?,
      decision: json['decision'] as String?,
      warnings: json['warnings'] as List<dynamic>? ?? const [],
      validationErrors: json['validationErrors'] as List<dynamic>? ?? const [],
    );

Map<String, dynamic> _$RecognitionItemToJson(RecognitionItem instance) =>
    <String, dynamic>{
      'resultTransactionId': instance.resultTransactionId,
      'id': instance.id,
      'fileId': instance.fileId,
      'fileName': instance.fileName,
      'previewUrl': instance.previewUrl,
      'status': instance.status,
      'transactionTime': instance.transactionTime,
      'type': instance.type,
      'amountMinor': instance.amountMinor,
      'amount': instance.amount,
      'currency': instance.currency,
      'merchantName': instance.merchantName,
      'categoryId': instance.categoryId,
      'description': instance.description,
      'paymentMethod': instance.paymentMethod,
      'platformTransactionId': instance.platformTransactionId,
      'transactionStatus': instance.transactionStatus,
      'confidence': instance.confidence,
      'duplicateKind': instance.duplicateKind,
      'decision': instance.decision,
      'warnings': instance.warnings,
      'validationErrors': instance.validationErrors,
    };

RecognitionReview _$RecognitionReviewFromJson(Map<String, dynamic> json) =>
    RecognitionReview(
      job: RecognitionJob.fromJson(json['job'] as Map<String, dynamic>),
      items: (json['items'] as List<dynamic>)
          .map((e) => RecognitionItem.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$RecognitionReviewToJson(RecognitionReview instance) =>
    <String, dynamic>{'job': instance.job, 'items': instance.items};
