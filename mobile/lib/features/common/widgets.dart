import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/day_time.dart';
import '../../core/formatters.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../core/theme.dart';
import 'brand_mark.dart';
import 'category_visuals.dart';

/// Shared user avatar icon presets used across Home and Settings.
const zeAvatarPresets = <String, (String, String, IconData)>{
  'piggy': ('Piggy bank', '小猪存钱罐', Icons.savings_outlined),
  'cat': ('Cat', '小猫', Icons.pets),
  'dog': ('Dog', '小狗', Icons.pets_outlined),
  'rabbit': ('Rabbit', '小兔', Icons.cruelty_free_outlined),
  'sprout': ('Sprout', '嫩芽', Icons.eco_outlined),
  'sparkles': ('Sparkle', '闪光', Icons.auto_awesome_outlined),
};

IconData avatarIconFor(String? preset) =>
    zeAvatarPresets[preset]?.$3 ?? Icons.person_rounded;

/// Rounded card for things that stand on their own: a payment to review, a
/// notice, a chart. Lists and settings sit straight on the paper instead.
class ZeCard extends StatelessWidget {
  const ZeCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(20),
    this.margin,
    this.tone,
    this.color,
    this.radius = 24,
    this.onTap,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;

  /// Tinted status card. Null keeps the plain card surface.
  final ZeTone? tone;
  final Color? color;
  final double radius;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    final background = color ?? (tone == null ? t.card : t.toneSoft(tone!));
    // On pale night paper (#f5f5f3), white cards need a faint hairline to stay legible.
    final needsEdge =
        !t.dark && color == null && tone == null && t.time == SceneTime.night;
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(radius),
      side: needsEdge ? BorderSide(color: t.line) : BorderSide.none,
    );
    return Padding(
      padding: margin ?? EdgeInsets.zero,
      child: Material(
        color: background,
        shape: shape,
        clipBehavior: Clip.antiAlias,
        child: onTap == null
            ? Padding(padding: padding, child: child)
            : InkWell(
                onTap: onTap,
                child: Padding(padding: padding, child: child),
              ),
      ),
    );
  }
}

/// Round icon: solid in a category's colour, tinted for a status.
class ZeIconTile extends StatelessWidget {
  const ZeIconTile({
    super.key,
    required this.icon,
    this.color,
    this.tone = ZeTone.primary,
    this.size = 42,
  });

  final IconData icon;

  /// Fills the circle, e.g. with a category colour. Overrides [tone].
  final Color? color;
  final ZeTone tone;
  final double size;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color ?? t.toneSoft(tone),
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: Icon(
        icon,
        size: size * .48,
        color: color == null ? t.tone(tone) : Colors.white,
      ),
    );
  }
}

/// Small pill label for statuses ("Possible duplicate", "Active").
class ZeBadge extends StatelessWidget {
  const ZeBadge({
    super.key,
    required this.label,
    this.tone = ZeTone.neutral,
    this.icon,
  });

  final String label;
  final ZeTone tone;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    final foreground = tone == ZeTone.neutral ? t.sub : t.tone(tone);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: tone == ZeTone.neutral ? t.well : t.toneSoft(tone),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: foreground),
            const SizedBox(width: 4),
          ],
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: foreground,
                fontSize: 12,
                fontWeight: FontWeight.w700,
                fontFeatures: tabularFigures,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Section title with an optional subtitle and trailing action.
class ZeSectionHeader extends StatelessWidget {
  const ZeSectionHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.actionLabel,
    this.onAction,
    this.trailing,
  });

  final String title;
  final String? subtitle;
  final String? actionLabel;
  final VoidCallback? onAction;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    final theme = Theme.of(context).textTheme;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: theme.titleLarge),
              if (subtitle != null) ...[
                const SizedBox(height: 2),
                Text(subtitle!, style: theme.bodySmall),
              ],
            ],
          ),
        ),
        if (actionLabel != null)
          InkWell(
            onTap: onAction,
            borderRadius: BorderRadius.circular(10),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 0, 10),
              child: Text(
                actionLabel!,
                style: TextStyle(
                  color: t.sub,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ?trailing,
      ],
    );
  }
}

/// Segmented control: an ink pill on a soft track.
class ZeSegmented<T> extends StatelessWidget {
  const ZeSegmented({
    super.key,
    required this.segments,
    required this.selected,
    required this.onChanged,
  });

  final List<(T, String)> segments;
  final T selected;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    return Container(
      constraints: const BoxConstraints(minHeight: 44),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: t.well,
        borderRadius: BorderRadius.circular(22),
      ),
      child: Row(
        children: [
          for (final (value, label) in segments)
            Expanded(
              child: Semantics(
                button: true,
                selected: value == selected,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => onChanged(value),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 160),
                    curve: Curves.easeOut,
                    alignment: Alignment.center,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 4,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: value == selected ? t.ink : Colors.transparent,
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: value == selected
                            ? FontWeight.w800
                            : FontWeight.w700,
                        color: value == selected ? t.canvas : t.sub,
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Rows separated by hairlines (settings, details), straight on the page so
/// their text lines up with everything else on it.
class ZeGroup extends StatelessWidget {
  const ZeGroup({
    super.key,
    required this.children,
    this.margin,
    this.showDividers = true,
  });

  final List<Widget> children;
  final EdgeInsetsGeometry? margin;

  /// Turn off when a child may render nothing, to avoid a dangling hairline.
  final bool showDividers;

  @override
  Widget build(BuildContext context) => Padding(
    padding: margin ?? EdgeInsets.zero,
    child: ListTileTheme.merge(
      contentPadding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var index = 0; index < children.length; index++) ...[
            children[index],
            if (showDividers && index < children.length - 1) const Divider(),
          ],
        ],
      ),
    ),
  );
}

/// Navigation row with an icon tile. Built on [ListTile] for semantics.
class ZeNavRow extends StatelessWidget {
  const ZeNavRow({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.tone = ZeTone.primary,
    this.color,
    this.badge,
    this.trailing,
    this.onTap,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final ZeTone tone;
  final Color? color;

  /// Optional pill shown next to the disclosure chevron.
  final Widget? badge;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final end =
        trailing ??
        (badge != null && onTap != null
            ? Row(
                mainAxisSize: MainAxisSize.min,
                children: [badge!, const SizedBox(width: 4), const ZeChevron()],
              )
            : badge ?? (onTap == null ? null : const ZeChevron()));
    return ListTile(
      onTap: onTap,
      minTileHeight: 64,
      leading: ZeIconTile(icon: icon, tone: tone, color: color, size: 40),
      title: Text(title),
      subtitle: subtitle == null ? null : Text(subtitle!),
      trailing: end,
    );
  }
}

/// Chevron at the end of a row, its tip on the row's edge: the glyph has
/// blank space on both sides, which would leave it short of the text above.
class ZeChevron extends StatelessWidget {
  const ZeChevron({super.key});

  @override
  Widget build(BuildContext context) => Transform.translate(
    offset: const Offset(7, 0),
    child: Icon(Icons.chevron_right_rounded, size: 22, color: context.ze.faint),
  );
}

/// Label/value line used on detail screens.
class ZeFactRow extends StatelessWidget {
  const ZeFactRow({super.key, required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 15),
      // The label takes what it needs, up to a share; the value always reaches
      // the row's end, so values line up whatever their labels are.
      child: LayoutBuilder(
        builder: (context, constraints) => Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ConstrainedBox(
              constraints: BoxConstraints(maxWidth: constraints.maxWidth * .4),
              child: Text(
                label,
                style: TextStyle(
                  color: t.sub,
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Text(
                value,
                textAlign: TextAlign.end,
                style: TextStyle(
                  color: t.ink,
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  fontFeatures: tabularFigures,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

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

/// One transaction: category tile, name, meta line, amount.
class TransactionRow extends ConsumerWidget {
  const TransactionRow({
    super.key,
    required this.item,
    this.onTap,
    this.showDate = false,
    this.padding = const EdgeInsets.symmetric(vertical: 11),
  });

  final TransactionItem item;
  final VoidCallback? onTap;

  /// Lists grouped by day only need the time; flat lists need the date.
  final bool showDate;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.ze;
    final visual = visualForTransaction(item, watchCategoryLookup(ref));
    // A payment with recognised goods is titled after them, so its shop takes
    // the last slot of the meta line.
    final order = item.orderDetails;
    final shopName = order != null && order.items.isNotEmpty
        ? order.shopName?.trim()
        : null;
    final meta = [
      item.categoryName ?? tr('Uncategorized', '未分类'),
      showDate
          ? formatDateTime(item.transactionTime)
          : formatTime(item.transactionTime),
      if (shopName != null && shopName.isNotEmpty)
        shopName
      else if (item.paymentMethod?.trim().isNotEmpty == true)
        item.paymentMethod!,
    ].join(' · ');
    final amount = formatSignedMoneyWithSymbol(
      item.amountMinor,
      item.type,
      item.currency,
    );
    return Semantics(
      button: onTap != null,
      label: tr(
        '${displayNameFor(item)}, $amount, $meta',
        '${displayNameFor(item)}，$amount，$meta',
      ),
      onTap: onTap,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: padding,
          child: Row(
            children: [
              ZeIconTile(icon: visual.icon, color: visual.color),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      displayNameFor(item),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      meta,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Text(
                amount,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  fontFeatures: tabularFigures,
                  color: t.amountColor(item.type),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The owl next to the Zowl wordmark.
class Brand extends StatelessWidget {
  const Brand({super.key, this.compact = false});
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    final size = compact ? 20.0 : 30.0;
    return Semantics(
      label: 'Zowl',
      excludeSemantics: true,
      child: FittedBox(
        fit: BoxFit.scaleDown,
        alignment: Alignment.centerLeft,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            OwlMark(size: size * 1.45),
            SizedBox(width: size * .3),
            Text(
              'Zowl',
              style: TextStyle(
                color: t.ink,
                fontSize: size,
                height: 1,
                fontWeight: FontWeight.w900,
                letterSpacing: -size * .02,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.error, required this.onRetry});
  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const ZeIconTile(
            icon: Icons.cloud_off_rounded,
            tone: ZeTone.neutral,
            size: 64,
          ),
          const SizedBox(height: 16),
          Text(
            error.toString(),
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 16),
          FilledButton.tonal(
            onPressed: onRetry,
            style: FilledButton.styleFrom(
              minimumSize: const Size(120, 46),
              backgroundColor: context.ze.primarySoft,
              foregroundColor: context.ze.accentText,
            ),
            child: Text(tr('Retry', '重试')),
          ),
        ],
      ),
    ),
  );
}

/// Empty state: the owl, a message, an optional hint and action.
class EmptyView extends StatelessWidget {
  const EmptyView({
    super.key,
    required this.message,
    this.subtitle,
    this.illustration,
    this.action,
  });

  final String message;
  final String? subtitle;

  /// Replaces the owl, e.g. with a larger one for first-run states.
  final Widget? illustration;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 28),
    child: Column(
      children: [
        illustration ?? const OwlMark(size: 72),
        const SizedBox(height: 14),
        Text(
          message,
          textAlign: TextAlign.center,
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 4),
          Text(
            subtitle!,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
        if (action != null) ...[const SizedBox(height: 16), action!],
      ],
    ),
  );
}

/// Full-width primary action with a loading state.
class ZePrimaryButton extends StatelessWidget {
  const ZePrimaryButton({
    super.key,
    required this.label,
    this.icon,
    this.loading = false,
    this.onPressed,
  });

  final String label;
  final IconData? icon;
  final bool loading;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    return SizedBox(
      width: double.infinity,
      height: 54,
      child: FilledButton(
        onPressed: loading ? null : onPressed,
        style: loading
            ? FilledButton.styleFrom(
                disabledBackgroundColor: t.primary.withValues(alpha: .7),
                disabledForegroundColor: t.onPrimary,
              )
            : null,
        child: loading
            ? SizedBox.square(
                dimension: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2.4,
                  color: t.onPrimary,
                ),
              )
            : Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (icon != null) ...[
                    Icon(icon, size: 20),
                    const SizedBox(width: 8),
                  ],
                  Flexible(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

/// Bottom action area that stays above the keyboard.
class ZeBottomBar extends StatelessWidget {
  const ZeBottomBar({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: t.canvas,
        border: Border(top: BorderSide(color: t.line)),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 10, 24, 12),
        child: SafeArea(top: false, child: child),
      ),
    );
  }
}

/// The owl saying something: a short, friendly line next to the mascot.
class OwlSays extends StatelessWidget {
  const OwlSays({super.key, required this.message, this.owlSize = 64});

  final String message;
  final double owlSize;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.center,
    children: [
      OwlMark(size: owlSize),
      const SizedBox(width: 4),
      Expanded(child: SpeechBubble(text: message)),
    ],
  );
}

/// White bubble with a tail pointing left, towards whoever is speaking.
class SpeechBubble extends StatelessWidget {
  const SpeechBubble({super.key, required this.text, this.color});

  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    return CustomPaint(
      painter: _BubblePainter(color ?? t.card),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 12, 16, 12),
        child: Text(
          text,
          style: TextStyle(
            color: t.ink,
            fontSize: 14,
            height: 1.35,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

class _BubblePainter extends CustomPainter {
  const _BubblePainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color;
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(9, 0, size.width - 9, size.height),
        const Radius.circular(20),
      ),
      paint,
    );
    final middle = size.height / 2;
    canvas.drawPath(
      Path()
        ..moveTo(11, middle - 8)
        ..quadraticBezierTo(4, middle, 0, middle + 6)
        ..quadraticBezierTo(8, middle + 5, 11, middle + 8)
        ..close(),
      paint,
    );
  }

  @override
  bool shouldRepaint(covariant _BubblePainter oldDelegate) =>
      oldDelegate.color != color;
}
