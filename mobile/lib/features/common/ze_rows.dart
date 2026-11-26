import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'ze_labels.dart';

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
