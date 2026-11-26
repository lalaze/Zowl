import 'dart:math' as math;

import 'package:flutter/foundation.dart' show listEquals;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/formatters.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../common/category_visuals.dart';
import '../common/owl_motion.dart';
import '../common/page_states.dart';
import '../common/sky.dart';
import '../common/ze_charts.dart';
import '../common/ze_controls.dart';
import '../common/ze_labels.dart';
import '../common/ze_surfaces.dart';

part 'statistics_charts.dart';
part 'statistics_hills.dart';
part 'statistics_source_panel.dart';

class StatisticsScreen extends ConsumerStatefulWidget {
  const StatisticsScreen({super.key});
  @override
  ConsumerState<StatisticsScreen> createState() => _StatisticsScreenState();
}

class _StatisticsScreenState extends ConsumerState<StatisticsScreen> {
  late DateTime _month;
  String _currency = 'CNY';
  int _section = 0;
  // Last loaded overview, kept on screen while another month or currency loads.
  StatisticsOverview? _shown;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _month = DateTime(now.year, now.month);
    final requested = ref.read(insightsSectionRequestProvider);
    if (requested != null) {
      _applyInsightsRequest(requested);
      Future.microtask(
        () => ref.read(insightsSectionRequestProvider.notifier).clear(),
      );
    }
  }

  void _applyInsightsRequest(InsightsRequest request) {
    _section = request.section;
    if (request.month != null) {
      _month = DateTime(request.month!.year, request.month!.month);
    }
    if (request.currency != null) {
      _currency = request.currency!;
    }
  }

  DateTimeRange get _monthRange => DateTimeRange(
    start: DateTime(_month.year, _month.month, 1),
    end: DateTime(_month.year, _month.month + 1, 0),
  );

  void _drillDownCategory(DistributionItem item) {
    final router = GoRouter.maybeOf(context);
    if (router == null) return;
    final categories = ref.read(categoriesProvider).value ?? const <Category>[];
    final categoryId =
        item.categoryId ??
        (item.name == null
            ? null
            : categories.where((c) => c.name == item.name).firstOrNull?.id);
    ref
        .read(activityFilterRequestProvider.notifier)
        .open(
          ActivityFilterRequest(
            type: 'expense',
            categoryId: categoryId,
            uncategorized: categoryId == null,
            currency: _currency,
            dates: _monthRange,
          ),
        );
    router.go('/transactions');
  }

  void _drillDownSource(DistributionItem item) {
    final router = GoRouter.maybeOf(context);
    if (router == null) return;
    ref
        .read(activityFilterRequestProvider.notifier)
        .open(
          ActivityFilterRequest(
            type: 'expense',
            source: item.source,
            currency: _currency,
            dates: _monthRange,
          ),
        );
    router.go('/transactions');
  }

  String get _key => '${monthKey(_month)}|$_currency';

  bool get _isCurrentMonth {
    final now = DateTime.now();
    return _month.year == now.year && _month.month == now.month;
  }

  void _move(int months) =>
      setState(() => _month = DateTime(_month.year, _month.month + months));

  @override
  Widget build(BuildContext context) {
    ref.listen(insightsSectionRequestProvider, (_, next) {
      if (next != null) {
        setState(() => _applyInsightsRequest(next));
        ref.read(insightsSectionRequestProvider.notifier).clear();
      }
    });
    final overview = ref.watch(statisticsProvider(_key));
    if (overview.value case final value?) _shown = value;
    final data = _shown;
    final stale = !overview.hasValue;
    final failed = stale && overview.hasError;
    // Last month is only a backdrop, so it waits for this month and its
    // failures stay silent.
    final previousKey =
        '${monthKey(DateTime(_month.year, _month.month - 1))}|$_currency';
    final previous = overview.hasValue
        ? ref.watch(statisticsProvider(previousKey)).value
        : null;
    final currencies = {
      _currency,
      ?data?.currency,
      ...?data?.excludedCurrencies.map((item) => item.currency),
    };
    return Scaffold(
      body: RefreshIndicator(
        edgeOffset: skyBarExtent(context),
        onRefresh: () async => ref.invalidate(statisticsProvider(_key)),
        child: SkyScrollScope(
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              PinnedHeaderSliver(
                child: SkyBar(
                  layout: _skyLayout,
                  title: SkyTitle(tr('Insights', '统计')),
                  actions: [
                    _MonthSwitcher(
                      month: _month,
                      onPrevious: () => _move(-1),
                      onNext: _isCurrentMonth ? null : () => _move(1),
                    ),
                  ],
                ),
              ),
              if (data == null || failed) ...[
                SliverToBoxAdapter(
                  child: SkyHeader(
                    layout: SkyLayout.page,
                    busy: overview.isLoading,
                    child: currencies.length > 1
                        ? Align(
                            alignment: Alignment.centerLeft,
                            child: _CurrencyPicker(
                              currency: _currency,
                              currencies: currencies,
                              onCurrency: (value) =>
                                  setState(() => _currency = value),
                            ),
                          )
                        : const SizedBox(height: 40),
                  ),
                ),
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: overview.hasError
                      ? ErrorView(
                          error: overview.error!,
                          onRetry: () =>
                              ref.invalidate(statisticsProvider(_key)),
                        )
                      : const PageLoading(),
                ),
              ] else ...[
                SliverToBoxAdapter(
                  child: AnimatedOpacity(
                    opacity: stale ? .45 : 1,
                    duration: const Duration(milliseconds: 150),
                    child: _SpendingSky(
                      data: data,
                      previous: previous,
                      currency: _currency,
                      currencies: currencies,
                      busy: overview.isLoading,
                      onCurrency: (value) => setState(() => _currency = value),
                    ),
                  ),
                ),
                SliverToBoxAdapter(
                  child: SizedBox(
                    height: 2,
                    child: stale && overview.isLoading
                        ? const LinearProgressIndicator(minHeight: 2)
                        : null,
                  ),
                ),
                SliverPadding(
                  padding: EdgeInsets.fromLTRB(
                    24,
                    4,
                    24,
                    MediaQuery.paddingOf(context).bottom + 28,
                  ),
                  sliver: SliverToBoxAdapter(
                    child: AnimatedOpacity(
                      opacity: stale ? .45 : 1,
                      duration: const Duration(milliseconds: 150),
                      child: IgnorePointer(
                        ignoring: stale,
                        child: _content(context, data),
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _content(BuildContext context, StatisticsOverview data) {
    final t = context.ze;
    final summary = data.summary;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (data.dailyTrend.isNotEmpty) _DayAxis(days: data.dailyTrend.length),
        const SizedBox(height: 14),
        _Highlight(message: _highlight(data, _currency)),
        const SizedBox(height: 18),
        Row(
          children: [
            Expanded(
              child: ZeMetric(
                label: tr('Income', '收入'),
                value: formatMoneyWithSymbol(summary.incomeMinor, _currency),
                dot: t.income,
                valueColor: t.income,
              ),
            ),
            Container(
              width: 1,
              height: 34,
              color: t.line,
              margin: const EdgeInsets.only(right: 20),
            ),
            Expanded(
              child: ZeMetric(
                label: tr('Balance', '结余'),
                value: formatMoneyWithSymbol(summary.balanceMinor, _currency),
                dot: t.faint,
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        ZeSegmented<int>(
          segments: [
            (0, tr('Category', '分类')),
            (1, tr('Trends', '趋势')),
            (2, tr('Source', '来源')),
          ],
          selected: _section,
          onChanged: (value) => setState(() => _section = value),
        ),
        const SizedBox(height: 20),
        if (_section == 0)
          _Chart(
            title: tr('Where your money goes', '钱都花在哪儿'),
            subtitle: tr('Spending categories this month', '本月各分类支出'),
            child: _CategoryBreakdown(
              items: data.categoryDistribution,
              currency: _currency,
              onSelect: GoRouter.maybeOf(context) != null
                  ? _drillDownCategory
                  : null,
            ),
          ),
        if (_section == 1) ...[
          _Chart(
            title: tr('Day by day', '每日支出'),
            subtitle: tr('The busiest day stands out', '花得最多的一天最显眼'),
            child: _DailyBars(data: data),
          ),
          const SizedBox(height: 28),
          _Chart(
            title: tr('Last six months', '近六个月'),
            subtitle: tr('Net spending per month', '每月净支出'),
            child: _MonthlyBars(points: data.monthlyTrend, currency: _currency),
          ),
          const SizedBox(height: 28),
          _Chart(
            title: tr('Income and spending', '收入与支出'),
            subtitle: tr('This month', '本月'),
            child: _IncomeVersusSpending(
              summary: data.summary,
              currency: _currency,
            ),
          ),
        ],
        if (_section == 2)
          _SourcePanel(
            items: data.sourceDistribution,
            currency: _currency,
            onSelect: GoRouter.maybeOf(context) != null
                ? _drillDownSource
                : null,
          ),
      ],
    );
  }
}

/// The sky behind the headline and the hills, top of the screen to the axis.
const _skyLayout = SkyLayout.insights;

class _MonthSwitcher extends StatelessWidget {
  const _MonthSwitcher({
    required this.month,
    required this.onPrevious,
    required this.onNext,
  });

  final DateTime month;
  final VoidCallback onPrevious;
  final VoidCallback? onNext;

  @override
  Widget build(BuildContext context) {
    final palette = SkyPalette.of(context);
    final bare = IconButton.styleFrom(
      backgroundColor: Colors.transparent,
      disabledBackgroundColor: Colors.transparent,
      foregroundColor: palette.foreground,
    );
    return Container(
      height: 40,
      margin: const EdgeInsets.only(right: 5),
      // Leaves the page title its room on narrow phones.
      constraints: BoxConstraints(
        maxWidth: MediaQuery.sizeOf(context).width * .58,
      ),
      decoration: BoxDecoration(
        color: palette.frost,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            tooltip: tr('Previous month', '上个月'),
            onPressed: onPrevious,
            style: bare,
            icon: const Icon(Icons.chevron_left),
          ),
          Flexible(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                DateFormat(
                  isZh ? 'y年M月' : 'MMMM yyyy',
                  intlLocale,
                ).format(month),
                textScaler: MediaQuery.textScalerOf(
                  context,
                ).clamp(maxScaleFactor: 1.2),
                style: const TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w800,
                  fontFeatures: tabularFigures,
                ),
              ),
            ),
          ),
          IconButton(
            tooltip: tr('Next month', '下个月'),
            onPressed: onNext,
            style: bare,
            icon: const Icon(Icons.chevron_right),
          ),
        ],
      ),
    );
  }
}

/// Currency menu pill shared between the loaded sky and the error sky.
class _CurrencyPicker extends StatelessWidget {
  const _CurrencyPicker({
    required this.currency,
    required this.currencies,
    required this.onCurrency,
  });

  final String currency;
  final Set<String> currencies;
  final ValueChanged<String> onCurrency;

  @override
  Widget build(BuildContext context) {
    final palette = SkyPalette.of(context);
    return PopupMenuButton<String>(
      tooltip: tr('Currency', '币种'),
      initialValue: currency,
      onSelected: onCurrency,
      itemBuilder: (_) => [
        for (final value in currencies)
          PopupMenuItem(value: value, child: Text(value)),
      ],
      child: SkyPill(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          spacing: 4,
          children: [
            Icon(
              Icons.unfold_more_rounded,
              size: 14,
              color: palette.foreground,
            ),
            Text(currency),
          ],
        ),
      ),
    );
  }
}

/// Net spending on the sky, and the month as a hill below it.
class _SpendingSky extends StatelessWidget {
  const _SpendingSky({
    required this.data,
    required this.previous,
    required this.currency,
    required this.currencies,
    required this.busy,
    required this.onCurrency,
  });

  final StatisticsOverview data;
  final StatisticsOverview? previous;
  final String currency;
  final Set<String> currencies;
  final bool busy;
  final ValueChanged<String> onCurrency;

  @override
  Widget build(BuildContext context) {
    final palette = SkyPalette.of(context);
    final summary = data.summary;
    final label = TextStyle(
      color: palette.muted,
      fontSize: 13.5,
      fontWeight: FontWeight.w700,
    );
    return RepaintBoundary(
      child: CustomPaint(
        painter: SkyPainter(
          palette: palette,
          layout: _skyLayout,
          top: skyBarExtent(context),
          landscape: false,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 10, 24, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    spacing: 8,
                    children: [
                      Expanded(
                        child: Wrap(
                          spacing: 8,
                          children: [
                            Text(
                              tr('Net spending this month', '本月净支出'),
                              style: label,
                            ),
                            Text(
                              tr(
                                plural(summary.transactionCount, 'transaction'),
                                '${summary.transactionCount} 笔交易',
                              ),
                              style: label,
                            ),
                          ],
                        ),
                      ),
                      _CurrencyPicker(
                        currency: currency,
                        currencies: currencies,
                        onCurrency: onCurrency,
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  SkyAmount(
                    formatMoneyWithSymbol(summary.netExpenseMinor, currency),
                    size: 44,
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 12,
                    runSpacing: 6,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      if (_change(data) case final change?)
                        SkyPill(
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            spacing: 4,
                            children: [
                              Icon(
                                change.$1,
                                size: 13,
                                color: palette.foreground,
                              ),
                              Flexible(child: Text(change.$2)),
                            ],
                          ),
                        ),
                      _HillsKey(
                        hasPrevious: previous?.dailyTrend.isNotEmpty ?? false,
                      ),
                    ],
                  ),
                ],
              ),
            ),
            _MonthHills(
              data: data,
              previous: previous,
              currency: currency,
              busy: busy,
            ),
          ],
        ),
      ),
    );
  }

  /// Arrow and words for the change against last month.
  (IconData, String)? _change(StatisticsOverview data) {
    final change = data.changes?.netExpense;
    final rate = change?.ratePercent;
    if (change == null || rate == null || change.status == 'unchanged') {
      return null;
    }
    final previous = DateTime.tryParse('${data.month}-01');
    final previousName = previous == null
        ? 'last month'
        : DateFormat(
            'MMM',
            'en_US',
          ).format(DateTime(previous.year, previous.month - 1));
    final down = change.status == 'down';
    final percent = rate.abs().round();
    return (
      down ? Icons.south_rounded : Icons.north_rounded,
      tr(
        '$percent% ${down ? 'less' : 'more'} than $previousName',
        '比上月${down ? '少' : '多'} $percent%',
      ),
    );
  }
}

class _DayAxis extends StatelessWidget {
  const _DayAxis({required this.days});

  final int days;

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.labelSmall;
    final ticks = {1, 8, 15, 22, days}.where((day) => day <= days).toList()
      ..sort();
    return Row(
      children: [
        for (final (index, tick) in ticks.indexed) ...[
          if (index > 0) Spacer(flex: math.max(1, tick - ticks[index - 1])),
          Text('$tick', style: style),
        ],
      ],
    );
  }
}

/// What the owl on the hill above says, with an upward tail toward the owl.
class _Highlight extends StatelessWidget {
  const _Highlight({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    return Padding(
      padding: const EdgeInsets.only(top: 7),
      child: CustomPaint(
        painter: _UpBubbleTail(t.well),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: t.well,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            message,
            style: TextStyle(
              color: t.ink,
              fontSize: 14,
              height: 1.4,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ),
    );
  }
}

class _UpBubbleTail extends CustomPainter {
  const _UpBubbleTail(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final tipX = size.width * .78;
    canvas.drawPath(
      Path()
        ..moveTo(tipX - 9, 2)
        ..quadraticBezierTo(tipX - 2, -2, tipX, -8)
        ..quadraticBezierTo(tipX + 3, -2, tipX + 9, 2)
        ..close(),
      Paint()..color = color,
    );
  }

  @override
  bool shouldRepaint(_UpBubbleTail oldDelegate) => oldDelegate.color != color;
}

class _DailyBars extends StatelessWidget {
  const _DailyBars({required this.data});

  final StatisticsOverview data;

  @override
  Widget build(BuildContext context) {
    final daily = [
      for (final point in data.dailyTrend)
        point.netExpenseMinor > 0 ? point.netExpenseMinor : 0,
    ];
    if (daily.isEmpty || daily.every((value) => value == 0)) {
      return SizedBox(
        height: 60,
        child: Center(
          child: Text(
            tr('No data', '暂无数据'),
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ),
      );
    }
    final peak = data.peakSpendingDay;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ZeBars(
          values: daily,
          height: 96,
          gap: 4,
          highlight: peak == null
              ? null
              : data.dailyTrend.indexWhere((point) => point.date == peak.date),
          semanticLabel: tr('Daily spending', '每日支出'),
        ),
        const SizedBox(height: 8),
        _DayAxis(days: daily.length),
      ],
    );
  }
}

/// What the owl says about the month: the top category and the busiest day.
String _highlight(StatisticsOverview data, String currency) {
  final top = data.categoryDistribution.firstOrNull;
  final peak = data.peakSpendingDay;
  final lines = <String>[
    if (top != null)
      tr(
        'Your top spending category this month is ${top.name ?? 'Uncategorized'}, accounting for ${top.sharePercent.toStringAsFixed(1)}%.',
        '本月支出最多的分类是「${top.name ?? '未分类'}」，占 ${top.sharePercent.toStringAsFixed(1)}%。',
      ),
    if (peak != null) _peakSentence(peak, currency),
  ];
  return lines.isEmpty
      ? tr(
          'Record a few transactions to see spending highlights here.',
          '记上几笔，这里就会显示本月的支出重点。',
        )
      : lines.join('\n');
}

String _peakSentence(PeakSpendingDay peak, String currency) {
  final date = DateTime.tryParse(peak.date);
  final day = date == null
      ? peak.date
      : DateFormat(isZh ? 'M月d日' : 'MMM d', intlLocale).format(date);
  final total = formatMoneyWithSymbol(peak.netExpenseMinor, currency);
  final merchant = peak.topExpense?.merchantName?.trim();
  if (merchant == null || merchant.isEmpty) {
    return tr('Biggest day: $day, $total.', '花得最多的一天：$day，共 $total。');
  }
  if (peak.expenseCount < 2) {
    return tr(
      'Biggest day: $day, $total at $merchant.',
      '花得最多的一天：$day，在「$merchant」花了 $total。',
    );
  }
  final largest = formatMoneyWithSymbol(peak.topExpense!.amountMinor, currency);
  return tr(
    'Biggest day: $day, $total — largest at $merchant ($largest).',
    '花得最多的一天：$day，共 $total，最大一笔在「$merchant」（$largest）。',
  );
}

class _Chart extends StatelessWidget {
  const _Chart({required this.title, required this.child, this.subtitle});

  final String title;
  final String? subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      ZeSectionHeader(title: title, subtitle: subtitle),
      const SizedBox(height: 16),
      child,
    ],
  );
}
