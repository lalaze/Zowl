import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/day_time.dart';
import '../../core/formatters.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../common/brand_mark.dart';
import '../common/owl_motion.dart';
import '../common/sky.dart';
import '../common/widgets.dart';
import '../shell/app_shell.dart';

/// Screenshot candidates that were recognised but neither posted nor skipped.
/// Built on the shared job list so `refreshLedger` keeps it current.
final pendingScreenshotReviewProvider = FutureProvider<int>((ref) async {
  final jobs = await ref.watch(recognitionJobsProvider.future);
  var count = 0;
  for (final job in jobs) {
    if (job.status == 'reviewing') {
      final pending = job.totalCount - job.importedCount - job.skippedCount;
      if (pending > 0) count += pending;
    }
  }
  return count;
});

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final month = monthKey();
    final overview = ref.watch(statisticsProvider('$month|CNY'));
    final screenshots = ref.watch(pendingScreenshotReviewProvider).value ?? 0;
    final captures =
        ref.watch(notificationCapturePageProvider).value?.pendingCount ?? 0;
    final user = ref.watch(authControllerProvider).value;

    Future<void> refresh() async {
      refreshLedger(ref);
      ref.invalidate(statisticsProvider('$month|CNY'));
      await ref.read(statisticsProvider('$month|CNY').future);
    }

    final pending = screenshots + captures;
    final data = overview.value;

    return Scaffold(
      body: RefreshIndicator(
        edgeOffset: skyBarExtent(context),
        onRefresh: refresh,
        child: SkyScrollScope(
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              PinnedHeaderSliver(
                child: SkyBar(
                  layout: SkyLayout.home,
                  title: _Greeting(name: user?.displayName.trim() ?? ''),
                  actions: [
                    IconButton(
                      tooltip: pending > 0
                          ? tr('Payments to review', '待核对的付款')
                          : tr('Captured payments', '已采集的付款'),
                      // Screenshots and captured payments share one inbox.
                      onPressed: () => context.push('/imports/notifications'),
                      icon: Badge(
                        isLabelVisible: pending > 0,
                        smallSize: 8,
                        backgroundColor: const Color(0xffe0533d),
                        child: const Icon(Icons.notifications_rounded),
                      ),
                    ),
                    _Avatar(icon: avatarIconFor(user?.avatarPreset)),
                  ],
                ),
              ),
              SliverToBoxAdapter(
                child: SkyHeader(
                  layout: SkyLayout.home,
                  padding: EdgeInsets.fromLTRB(
                    24,
                    10,
                    24,
                    118 * SkyLayout.scaleFor(MediaQuery.sizeOf(context).width),
                  ),
                  busy: overview.isLoading,
                  bubble: pending > 0
                      ? OwlBubble(
                          text: tr('$pending to review', '$pending 笔等你核对'),
                          semanticLabel: [
                            tr(
                              '${plural(pending, 'payment')} to review',
                              '$pending 笔付款待核对',
                            ),
                            if (captures > 0)
                              tr('$captures captured', '采集 $captures 笔'),
                            if (screenshots > 0)
                              tr(
                                '$screenshots from screenshots',
                                '截图 $screenshots 笔',
                              ),
                          ].join(tr(', ', '，')),
                          onTap: () => context.push('/imports/notifications'),
                        )
                      : null,
                  child: _Balance(data: data),
                ),
              ),
              SliverPadding(
                padding: EdgeInsets.fromLTRB(
                  24,
                  8,
                  24,
                  MediaQuery.paddingOf(context).bottom + 24,
                ),
                sliver: overview.when(
                  loading: () => const SliverFillRemaining(
                    hasScrollBody: false,
                    child: PageLoading(),
                  ),
                  error: (error, _) => SliverFillRemaining(
                    hasScrollBody: false,
                    child: ErrorView(
                      error: error,
                      onRetry: () =>
                          ref.invalidate(statisticsProvider('$month|CNY')),
                    ),
                  ),
                  data: (data) => SliverToBoxAdapter(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _DailySpending(
                          data: data,
                          onOpenTrends: () {
                            final monthDate = DateTime.tryParse(
                              '${data.month}-01',
                            );
                            final now = DateTime.now();
                            ref
                                .read(insightsSectionRequestProvider.notifier)
                                .open(
                                  InsightsRequest(
                                    section: 1,
                                    month: monthDate != null
                                        ? DateTime(
                                            monthDate.year,
                                            monthDate.month,
                                          )
                                        : DateTime(now.year, now.month),
                                    currency: data.currency,
                                  ),
                                );
                            context.go('/statistics');
                          },
                        ),
                        const SizedBox(height: 22),
                        _Recent(items: data.recentTransactions),
                        if (data.summary.incomeMinor > 0) ...[
                          const SizedBox(height: 24),
                          _Savings(data: data),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// One line about today, heading the daily columns.
String _todayLine(StatisticsOverview data) {
  final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
  final spent =
      data.dailyTrend
          .where((point) => point.date == today)
          .firstOrNull
          ?.netExpenseMinor ??
      0;
  if (spent > 0) {
    final money = formatMoneyWithSymbol(spent);
    return tr('Spent $money today', '今天花了 $money');
  }
  return tr('Nothing recorded today', '今天还没记账');
}

class _Greeting extends StatelessWidget {
  const _Greeting({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    final greeting = greetingFor(storyNow());
    return Text(
      name.isEmpty ? greeting : tr('$greeting, $name', '$greeting，$name'),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.icon});

  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    return Tooltip(
      message: tr('Me', '我的'),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: () => context.go('/settings'),
        child: SizedBox.square(
          dimension: 48,
          child: Center(
            child: CircleAvatar(
              radius: 19,
              backgroundColor: t.primary,
              child: Icon(icon, color: t.onPrimary, size: 20),
            ),
          ),
        ),
      ),
    );
  }
}

/// The month's balance, written on the sky.
class _Balance extends StatelessWidget {
  const _Balance({required this.data});

  /// Null while the month loads, so the sky keeps its height.
  final StatisticsOverview? data;

  @override
  Widget build(BuildContext context) {
    final palette = SkyPalette.of(context);
    final summary = data?.summary;
    final excluded = data?.excludedCurrencies ?? const [];
    Widget flow(String label, int? minor) => Row(
      mainAxisSize: MainAxisSize.min,
      spacing: 8,
      children: [
        Text(
          label,
          style: TextStyle(
            color: palette.muted,
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
        Text(
          minor == null ? '—' : formatMoneyWithSymbol(minor),
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w800,
            fontFeatures: tabularFigures,
          ),
        ),
      ],
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          spacing: 8,
          children: [
            Flexible(
              child: Text(
                tr('Balance this month', '本月结余'),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: palette.muted,
                  fontSize: 13.5,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            if (excluded.isNotEmpty)
              SkyPill(
                child: Text(
                  tr(
                    'Also ${excluded.map((item) => item.currency).join(', ')}',
                    '另有 ${excluded.map((item) => item.currency).join('、')}',
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 2),
        SkyAmount(
          summary == null ? '—' : formatMoneyWithSymbol(summary.balanceMinor),
        ),
        const SizedBox(height: 8),
        // The owl and the sun have the right side of the sky.
        FractionallySizedBox(
          widthFactor: .56,
          child: FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 2,
              children: [
                flow(tr('Income', '收入'), summary?.incomeMinor),
                flow(tr('Spending', '支出'), summary?.netExpenseMinor),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _DailySpending extends StatelessWidget {
  const _DailySpending({required this.data, this.onOpenTrends});

  final StatisticsOverview data;
  final VoidCallback? onOpenTrends;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final monthDate = DateTime.tryParse('${data.month}-01') ?? now;
    final isCurrentMonth =
        monthDate.year == now.year && monthDate.month == now.month;
    final daily = [
      for (final point in data.dailyTrend)
        point.netExpenseMinor > 0 ? point.netExpenseMinor : 0,
    ];
    final monthName = DateFormat(
      isZh ? 'M月' : 'MMMM',
      intlLocale,
    ).format(monthDate);
    String dayLabel(int day) => isZh
        ? DateFormat(
            'M月d日',
            intlLocale,
          ).format(DateTime(monthDate.year, monthDate.month, day))
        : '${DateFormat('MMM', 'en_US').format(monthDate)} $day';
    final theme = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          spacing: 12,
          children: [
            Flexible(
              flex: 2,
              child: Text(_todayLine(data), style: theme.titleLarge),
            ),
            if (daily.isNotEmpty)
              Flexible(
                child: Text(
                  tr('Daily spending', '每日支出'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.labelMedium,
                ),
              ),
          ],
        ),
        if (daily.isNotEmpty) ...[
          const SizedBox(height: 12),
          ZeBars(
            values: daily,
            height: 44,
            gap: 4,
            highlight: isCurrentMonth ? now.day - 1 : null,
            futureAfter: isCurrentMonth ? now.day - 1 : null,
            semanticLabel: tr('Daily spending in $monthName', '$monthName每日支出'),
            onTap: onOpenTrends,
          ),
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(dayLabel(1), style: theme.labelSmall),
              Text(dayLabel(daily.length), style: theme.labelSmall),
            ],
          ),
        ],
      ],
    );
  }
}

class _Recent extends StatelessWidget {
  const _Recent({required this.items});

  final List<TransactionItem> items;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return EmptyView(
        illustration: const OwlMark(size: 84),
        message: tr('No transactions yet. Add your first one.', '还没有交易，先记一笔吧。'),
        subtitle: tr(
          'Enter one by hand, or recognise a payment screenshot.',
          '可以手动记账，也可以识别支付截图。',
        ),
        action: FilledButton.icon(
          onPressed: () => showAddSheet(context),
          icon: const Icon(Icons.add_rounded),
          label: Text(tr('Add transaction', '记一笔')),
        ),
      );
    }
    final groups = <String, List<TransactionItem>>{};
    for (final item in items.take(5)) {
      final time = DateTime.tryParse(item.transactionTime)?.toLocal();
      final label = time == null ? '' : formatDayLabel(time).split(' · ').first;
      groups.putIfAbsent(label, () => []).add(item);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ZeSectionHeader(
          title: tr('Recent transactions', '最近交易'),
          actionLabel: tr('See all', '查看全部'),
          onAction: () => context.go('/transactions'),
        ),
        for (final entry in groups.entries) ...[
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Text(
              entry.key,
              style: Theme.of(context).textTheme.labelMedium,
            ),
          ),
          for (final (index, item) in entry.value.indexed) ...[
            if (index > 0) const Divider(),
            TransactionRow(
              item: item,
              onTap: () =>
                  context.push('/transactions/${item.id}', extra: item),
            ),
          ],
        ],
      ],
    );
  }
}

class _Savings extends StatelessWidget {
  const _Savings({required this.data});

  final StatisticsOverview data;

  /// Consecutive days with at least one posted transaction, ending today
  /// (or yesterday, so the streak survives until the user records today).
  int _streak() {
    final active = [
      for (final point in data.dailyTrend)
        point.incomeMinor != 0 || point.netExpenseMinor != 0,
    ];
    final now = DateTime.now();
    if (monthKey(now) != data.month || active.isEmpty) return 0;
    var index = (now.day - 1).clamp(0, active.length - 1);
    if (!active[index]) index--;
    var streak = 0;
    while (index >= 0 && active[index]) {
      streak++;
      index--;
    }
    return streak;
  }

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    final summary = data.summary;
    final overspent = summary.balanceMinor < 0;
    final progress = summary.incomeMinor > 0
        ? (overspent
              ? 1.0
              : (summary.balanceMinor / summary.incomeMinor).clamp(0.0, 1.0))
        : 0.0;
    final percent = summary.incomeMinor > 0
        ? (summary.balanceMinor.abs() / summary.incomeMinor * 100).round()
        : 0;
    final streak = _streak();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          spacing: 8,
          children: [
            Expanded(
              child: Text(
                overspent
                    ? tr('Spent $percent% over income', '支出超出收入 $percent%')
                    : tr('Kept $percent% of income', '存下收入的 $percent%'),
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ),
            if (streak >= 2)
              ZeBadge(
                label: tr('$streak-day streak', '连续记账 $streak 天'),
                tone: ZeTone.income,
                icon: Icons.local_fire_department_rounded,
              ),
          ],
        ),
        const SizedBox(height: 12),
        ZeProgress(value: progress, color: overspent ? t.danger : t.income),
        const SizedBox(height: 8),
        Text(
          tr(
            '${formatMoneyWithSymbol(summary.balanceMinor)} of ${formatMoneyWithSymbol(summary.incomeMinor)}',
            '结余 ${formatMoneyWithSymbol(summary.balanceMinor)} / 收入 ${formatMoneyWithSymbol(summary.incomeMinor)}',
          ),
          style: Theme.of(
            context,
          ).textTheme.labelMedium?.copyWith(fontFeatures: tabularFigures),
        ),
      ],
    );
  }
}
