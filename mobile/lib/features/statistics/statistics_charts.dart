part of 'statistics_screen.dart';

String _compactMoney(int minor) {
  final value = minor / 100;
  // Chinese groups large amounts by 万 (ten thousand), not by thousands.
  if (isZh) {
    if (value.abs() >= 100000) return '${(value / 10000).toStringAsFixed(0)}万';
    if (value.abs() >= 10000) return '${(value / 10000).toStringAsFixed(1)}万';
    return value.toStringAsFixed(0);
  }
  if (value.abs() >= 10000) return '${(value / 1000).toStringAsFixed(0)}k';
  if (value.abs() >= 1000) return '${(value / 1000).toStringAsFixed(1)}k';
  return value.toStringAsFixed(0);
}

class _MonthlyBars extends StatelessWidget {
  const _MonthlyBars({required this.points, required this.currency});

  final List<TrendPoint> points;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    final values = [
      for (final point in points) math.max(0, point.netExpenseMinor),
    ];
    if (values.isEmpty || values.every((value) => value == 0)) {
      return SizedBox(
        height: 120,
        child: Center(
          child: Text(
            tr('No data', '暂无数据'),
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ),
      );
    }
    final max = values.reduce(math.max);
    const barArea = 120.0;
    return Semantics(
      label: [
        for (var index = 0; index < points.length; index++)
          tr(
            '${points[index].label}: ${formatMoneyWithSymbol(values[index], currency)}',
            '${_shortMonth(points[index])}：${formatMoneyWithSymbol(values[index], currency)}',
          ),
      ].join(tr(', ', '，')),
      child: ExcludeSemantics(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            for (var index = 0; index < points.length; index++)
              Expanded(
                child: Column(
                  children: [
                    Text(
                      _compactMoney(values[index]),
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: index == points.length - 1 ? t.ink : t.sub,
                        fontFeatures: tabularFigures,
                      ),
                    ),
                    const SizedBox(height: 6),
                    SizedBox(
                      height: barArea,
                      child: Align(
                        alignment: Alignment.bottomCenter,
                        child: Container(
                          width: 26,
                          height: values[index] == 0
                              ? 3
                              : math.max(4, barArea * values[index] / max),
                          decoration: BoxDecoration(
                            color: index == points.length - 1
                                ? t.primary
                                : t.bar,
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _shortMonth(points[index]),
                      style: Theme.of(context).textTheme.labelSmall,
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  String _shortMonth(TrendPoint point) {
    final date = DateTime.tryParse('${point.month}-01');
    return date == null
        ? point.label
        : DateFormat(isZh ? 'M月' : 'MMM', intlLocale).format(date);
  }
}

class _IncomeVersusSpending extends StatelessWidget {
  const _IncomeVersusSpending({required this.summary, required this.currency});

  final FlowSummary summary;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    final max = math.max(summary.incomeMinor, summary.netExpenseMinor);
    Widget row(String label, int value, Color color) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleSmall,
                ),
              ),
              Flexible(
                flex: 2,
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerRight,
                  child: Text(
                    formatMoneyWithSymbol(value, currency),
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      fontFeatures: tabularFigures,
                      color: t.ink,
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ZeProgress(value: max == 0 ? 0 : value / max, color: color),
        ],
      ),
    );
    final kept = summary.incomeMinor > 0
        ? (summary.balanceMinor / summary.incomeMinor * 100).round()
        : null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        row(tr('Income', '收入'), summary.incomeMinor, t.income),
        row(tr('Spending', '支出'), summary.netExpenseMinor, t.primary),
        if (kept != null) ...[
          const SizedBox(height: 6),
          Text(
            kept >= 0
                ? tr(
                    'You kept $kept% of this month’s income.',
                    '本月收入存下了 $kept%。',
                  )
                : tr(
                    'Spending is ${-kept}% above this month’s income.',
                    '支出超出本月收入 ${-kept}%。',
                  ),
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ],
    );
  }
}

class _CategoryBreakdown extends StatelessWidget {
  const _CategoryBreakdown({
    required this.items,
    required this.currency,
    this.onSelect,
  });

  final List<DistributionItem> items;
  final String currency;
  final ValueChanged<DistributionItem>? onSelect;

  static const _donutSlices = 4;

  /// Largest-remainder rounding so integer legend percentages always sum to 100.
  static List<int> _roundedPercentages(List<double> raw) {
    if (raw.isEmpty) return const [];
    final sum = raw.fold<double>(0, (a, b) => a + b);
    if (sum <= 0) return List.filled(raw.length, 0);
    final scaled = [for (final v in raw) v * 100 / sum];
    final floors = [for (final v in scaled) v.floor()];
    var remaining = 100 - floors.fold<int>(0, (a, b) => a + b);
    final order = List<int>.generate(raw.length, (i) => i)
      ..sort(
        (a, b) => (scaled[b] - floors[b]).compareTo(scaled[a] - floors[a]),
      );
    for (var i = 0; i < remaining && i < order.length; i++) {
      floors[order[i]]++;
    }
    return floors;
  }

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    if (items.isEmpty) {
      return SizedBox(
        height: 120,
        child: Center(child: Text(tr('No spending data', '暂无支出数据'))),
      );
    }
    final ranked = [...items]
      ..sort((left, right) => right.amountMinor.compareTo(left.amountMinor));
    final visuals = [
      for (final item in ranked)
        categoryVisual(icon: item.icon, color: item.color, name: item.name),
    ];
    final head = ranked.take(_donutSlices).toList();
    final otherShare = ranked
        .skip(_donutSlices)
        .fold<double>(0, (sum, item) => sum + item.sharePercent);
    final legendRaw = [
      for (final item in head) item.sharePercent,
      if (otherShare > 0) otherShare,
    ];
    final legendPct = _roundedPercentages(legendRaw);
    final slices = [
      for (var index = 0; index < head.length; index++)
        (head[index].sharePercent / 100, visuals[index].color),
      if (otherShare > 0) (otherShare / 100, t.faint),
    ];
    final maxShare = ranked.first.sharePercent == 0
        ? 1.0
        : ranked.first.sharePercent;
    return Column(
      children: [
        Row(
          children: [
            SizedBox.square(
              dimension: 128,
              child: CustomPaint(
                painter: _DonutPainter(slices),
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        '${ranked.length}',
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      Text(
                        tr(
                          ranked.length == 1 ? 'category' : 'categories',
                          '个分类',
                        ),
                        style: Theme.of(context).textTheme.labelSmall,
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(width: 20),
            Expanded(
              child: Column(
                children: [
                  for (var index = 0; index < head.length; index++)
                    _Legend(
                      color: visuals[index].color,
                      label: head[index].name ?? tr('Uncategorized', '未分类'),
                      share: legendPct[index],
                    ),
                  if (otherShare > 0)
                    _Legend(
                      color: t.faint,
                      label: tr('Other', '其他'),
                      share: legendPct.last,
                    ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        for (var index = 0; index < ranked.length; index++)
          InkWell(
            onTap: onSelect == null ? null : () => onSelect!(ranked[index]),
            borderRadius: BorderRadius.circular(14),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                children: [
                  ZeIconTile(
                    icon: visuals[index].icon,
                    color: visuals[index].color,
                    size: 38,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                ranked[index].name ?? tr('Uncategorized', '未分类'),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: Theme.of(context).textTheme.titleSmall,
                              ),
                            ),
                            Text(
                              formatMoneyWithSymbol(
                                ranked[index].amountMinor,
                                currency,
                              ),
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                color: t.ink,
                                fontFeatures: tabularFigures,
                              ),
                            ),
                            if (onSelect != null)
                              Padding(
                                padding: const EdgeInsets.only(left: 2),
                                child: Icon(
                                  Icons.chevron_right_rounded,
                                  size: 16,
                                  color: t.faint,
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 7),
                        ZeProgress(
                          value: ranked[index].sharePercent / maxShare,
                          color: visuals[index].color,
                          height: 6,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${tr(plural(ranked[index].transactionCount, 'transaction'), '${ranked[index].transactionCount} 笔交易')} · ${ranked[index].sharePercent.toStringAsFixed(1)}%',
                          style: Theme.of(context).textTheme.labelSmall,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend({
    required this.color,
    required this.label,
    required this.share,
  });

  final Color color;
  final String label;
  final int share;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 5),
    child: Row(
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(3),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
          ),
        ),
        Text(
          '$share%',
          style: TextStyle(
            color: context.ze.sub,
            fontWeight: FontWeight.w700,
            fontFeatures: tabularFigures,
          ),
        ),
      ],
    ),
  );
}

class _DonutPainter extends CustomPainter {
  _DonutPainter(this.slices);

  final List<(double, Color)> slices;

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = size.width * .16;
    final arc = (Offset.zero & size).deflate(stroke / 2);
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke;
    final total = slices.fold<double>(0, (sum, slice) => sum + slice.$1);
    var start = -math.pi / 2;
    final gap = slices.length > 1 ? .04 : 0.0;
    for (final (share, color) in slices) {
      final sweep = total == 0 ? 0.0 : share / total * 2 * math.pi;
      if (sweep > gap) {
        canvas.drawArc(
          arc,
          start + gap / 2,
          sweep - gap,
          false,
          paint..color = color,
        );
      }
      start += sweep;
    }
  }

  @override
  bool shouldRepaint(covariant _DonutPainter oldDelegate) =>
      oldDelegate.slices != slices;
}
