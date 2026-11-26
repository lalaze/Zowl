import 'package:flutter/material.dart';

import '../../core/day_time.dart';
import '../../core/theme.dart';

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
