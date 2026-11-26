import 'package:flutter/material.dart';

import '../../core/theme.dart';

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
