import 'package:zemoney_mobile/core/models.dart';

const testUser = SessionUser(
  id: 'user-1',
  email: 'test@zemoney.local',
  displayName: 'Ze',
  avatarPreset: 'piggy',
  timezone: 'Asia/Shanghai',
);

const foodCategory = Category(
  id: 'food',
  name: 'Food',
  kind: 'expense',
  color: '#f97316',
);

const salaryCategory = Category(
  id: 'salary',
  name: 'Salary',
  kind: 'income',
  color: '#16a34a',
);

const testTransaction = TransactionItem(
  id: 'tx-1',
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

const testSummary = FlowSummary(
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

const testStatistics = StatisticsOverview(
  month: '2026-07',
  currency: 'CNY',
  summary: testSummary,
  excludedCurrencies: [
    CurrencyBreakdown(currency: 'USD', summary: testSummary),
  ],
  categoryDistribution: [
    DistributionItem(
      name: 'Food',
      color: '#f97316',
      amountMinor: 148600,
      transactionCount: 12,
      sharePercent: 61.9,
    ),
  ],
  sourceDistribution: [
    DistributionItem(
      source: 'manual',
      amountMinor: 240000,
      transactionCount: 18,
      sharePercent: 100,
    ),
  ],
  dailyTrend: [
    TrendPoint(label: '1Day', netExpenseMinor: 3500, incomeMinor: 0),
  ],
  monthlyTrend: [
    TrendPoint(label: '7Month', netExpenseMinor: 240000, incomeMinor: 1280000),
  ],
  recentTransactions: [testTransaction],
);

const testProviderInfo = RecognitionProviderInfo(
  id: 'mock',
  label: 'Local recognition',
  sendsImagesToThirdParty: false,
  disclosure: 'Images are processed only by the local test service',
  retentionPolicy: 'Not retained',
);

const testRecognitionJob = RecognitionJob(
  id: 'job-1',
  status: 'reviewing',
  createdAt: '2026-07-18T04:30:00.000Z',
  providerId: 'mock',
  totalCount: 1,
);

const testRecognitionItem = RecognitionItem(
  id: 'item-1',
  fileId: 'file-1',
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
);

const testRecognitionReview = RecognitionReview(
  job: testRecognitionJob,
  items: [testRecognitionItem],
);

const testNotificationCapture = NotificationCaptureItem(
  id: 'capture-1',
  platform: 'alipay',
  notificationPostedAt: '2026-07-18T04:30:00.000Z',
  amountMinor: 1880,
  currency: 'CNY',
  transactionTime: '2026-07-18T04:30:00.000Z',
  confidenceBasisPoints: 9500,
  merchantName: 'Mountain Cafe',
  description: 'Alipay payment notification',
  categoryId: 'food',
  paymentMethod: 'Alipay',
  duplicateStatus: 'possible_duplicate',
  duplicateAssessmentDigest: 'assessment-1',
  status: 'reviewing',
);

const testNotificationCapturePage = NotificationCapturePage(
  items: [testNotificationCapture],
  pagination: Pagination(page: 1, limit: 20, total: 1, totalPages: 1),
  pendingCount: 1,
);

// Order details are kept off the default fixtures above; these are the
// variants for a shopping-app payment whose goods the server recognised.
const testOrderDetails = OrderDetails(
  shopName: 'Harbor Home Store',
  items: [
    OrderItem(
      name: 'Thick bin bags',
      spec: '128 pcs 45x50cm',
      quantity: 2,
      priceMinor: 1880,
    ),
    OrderItem(name: 'Dish sponge'),
  ],
);

const testOrderTransaction = TransactionItem(
  id: 'tx-1',
  type: 'expense',
  amountMinor: 3580,
  amount: '35.80',
  currency: 'CNY',
  merchantName: 'Harbor Home Store',
  description: 'Bin bags and 1 more',
  categoryId: 'food',
  categoryName: 'Food',
  categoryColor: '#f97316',
  transactionTime: '2026-07-18T04:30:00.000Z',
  source: 'taobao',
  paymentMethod: 'Taobao',
  currentRevisionId: 'revision-1',
  revisionNumber: 1,
  orderDetails: testOrderDetails,
);

const testOrderCapture = NotificationCaptureItem(
  id: 'capture-order',
  platform: 'taobao',
  captureMethod: 'payment_page',
  notificationPostedAt: '2026-07-18T04:30:00.000Z',
  amountMinor: 3580,
  currency: 'CNY',
  transactionTime: '2026-07-18T04:30:00.000Z',
  confidenceBasisPoints: 9500,
  merchantName: 'Harbor Home Store',
  description: 'Bin bags and 1 more',
  categoryId: 'food',
  paymentMethod: 'Taobao',
  duplicateStatus: 'unique',
  status: 'reviewing',
  orderDetails: testOrderDetails,
);
