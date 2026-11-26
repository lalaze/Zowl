import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/theme.dart';

/// Coloured dot + label over a value ("Income ¥12,800.00").
class ZeMetric extends StatelessWidget {
  const ZeMetric({
    super.key,
    required this.label,
    required this.value,
    required this.dot,
    this.valueColor,
  });

  final String label;
  final String value;
  final Color dot;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              width: 7,
              height: 7,
              decoration: BoxDecoration(color: dot, shape: BoxShape.circle),
            ),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.labelMedium,
              ),
            ),
          ],
        ),
        const SizedBox(height: 3),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            value,
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w800,
              color: valueColor ?? t.ink,
              fontFeatures: tabularFigures,
            ),
          ),
        ),
      ],
    );
  }
}

/// Rounded progress bar for shares and ratios (not loading state).
class ZeProgress extends StatelessWidget {
  const ZeProgress({
    super.key,
    required this.value,
    this.color,
    this.height = 8,
  });

  final double value;
  final Color? color;
  final double height;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    final clamped = value.isNaN ? 0.0 : value.clamp(0.0, 1.0).toDouble();
    return Semantics(
      value: '${(clamped * 100).round()}%',
      child: Container(
        height: height,
        decoration: BoxDecoration(
          color: t.track,
          borderRadius: BorderRadius.circular(99),
        ),
        alignment: Alignment.centerLeft,
        child: FractionallySizedBox(
          widthFactor: clamped,
          heightFactor: 1,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: color ?? t.primary,
              borderRadius: BorderRadius.circular(99),
            ),
          ),
        ),
      ),
    );
  }
}

/// Compact daily bar chart. Past zero-spend days render as a grounded stub,
/// while days after [futureAfter] stay faint and flat.
class ZeBars extends StatelessWidget {
  const ZeBars({
    super.key,
    required this.values,
    this.height = 56,
    this.highlight,
    this.futureAfter,
    this.gap = 3,
    this.semanticLabel,
    this.onTap,
  });

  final List<int> values;
  final double height;
  final int? highlight;

  /// Indices strictly greater than this are future days in the current month.
  final int? futureAfter;
  final double gap;
  final String? semanticLabel;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    final max = values.isEmpty ? 0 : values.reduce(math.max);
    final bars = SizedBox(
      height: height,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (var index = 0; index < values.length; index++)
            Expanded(
              child: Padding(
                padding: EdgeInsets.symmetric(horizontal: gap / 2),
                child: () {
                  final isFuture = futureAfter != null && index > futureAfter!;
                  final v = values[index];
                  final barHeight = isFuture
                      ? 2.0
                      : v <= 0 || max <= 0
                      ? 4.0
                      : math.max(5.0, height * v / max);
                  final color = isFuture
                      ? t.track.withValues(alpha: .55)
                      : v <= 0
                      ? t.bar.withValues(alpha: .42)
                      : index == highlight
                      ? t.primary
                      : t.bar;
                  return Container(
                    height: barHeight,
                    decoration: BoxDecoration(
                      color: color,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  );
                }(),
              ),
            ),
        ],
      ),
    );
    return Semantics(
      button: onTap != null,
      label: semanticLabel,
      onTap: onTap,
      child: ExcludeSemantics(
        child: onTap == null
            ? bars
            : InkWell(
                onTap: onTap,
                borderRadius: BorderRadius.circular(10),
                child: bars,
              ),
      ),
    );
  }
}
