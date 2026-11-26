import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/l10n.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../common/speech_bubble.dart';
import '../common/ze_labels.dart';
import '../common/ze_rows.dart';
import '../common/ze_surfaces.dart';

class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: t.dark ? Brightness.light : Brightness.dark,
        systemNavigationBarColor: t.card,
        systemNavigationBarIconBrightness: t.dark
            ? Brightness.light
            : Brightness.dark,
      ),
      child: Scaffold(
        // Pages scroll on behind the mound the + stands on.
        extendBody: true,
        body: navigationShell,
        bottomNavigationBar: _ZeBottomNavigation(
          selectedIndex: navigationShell.currentIndex,
          onSelected: (index) => navigationShell.goBranch(
            index,
            initialLocation: index == navigationShell.currentIndex,
          ),
          onAdd: () => showAddSheet(context),
          onQuickAdd: () => GoRouter.of(context).push('/transactions/new'),
        ),
      ),
    );
  }
}

/// The three ways to get a transaction into the ledger.
Future<void> showAddSheet(BuildContext context) => showModalBottomSheet<void>(
  context: context,
  useRootNavigator: true,
  builder: (sheetContext) => const _AddSheet(),
);

class _AddSheet extends ConsumerWidget {
  const _AddSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Screenshots and captured payments share one review inbox.
    final pending = ref.watch(pendingReviewCountProvider).value ?? 0;
    void open(String route) {
      Navigator.of(context).pop();
      GoRouter.of(context).push(route);
    }

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(0, 0, 0, 12),
              child: OwlSays(
                owlSize: 56,
                message: tr(
                  'Add to ledger — what shall we write down?',
                  '记一笔——今天要记点什么？',
                ),
              ),
            ),
            ZeGroup(
              children: [
                ZeNavRow(
                  icon: Icons.edit_rounded,
                  color: ZeHues.terracotta,
                  title: tr('Enter manually', '手动记账'),
                  subtitle: tr('Amount, category and time', '金额、分类和时间'),
                  onTap: () => open('/transactions/new'),
                ),
                ZeNavRow(
                  icon: Icons.document_scanner_rounded,
                  color: ZeHues.sky,
                  title: tr('Recognize screenshots', '识别截图'),
                  subtitle: tr(
                    'Up to 10 payment screenshots at once',
                    '一次最多识别 10 张支付截图',
                  ),
                  onTap: () => open('/imports'),
                ),
                ZeNavRow(
                  icon: Icons.bolt_rounded,
                  color: ZeHues.moss,
                  title: tr('Review inbox', '待核对'),
                  subtitle: pending > 0
                      ? tr('$pending waiting for your review', '$pending 笔等你核对')
                      : tr(
                          'Screenshots, payment pages and notifications',
                          '截图、支付页和通知',
                        ),
                  badge: pending > 0
                      ? ZeBadge(label: '$pending', tone: ZeTone.warn)
                      : null,
                  onTap: () => open('/imports/notifications'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Height of the bar without the mound or the system inset.
const _barHeight = 68.0;

/// How far the mound under the + rises above the bar.
const _moundHeight = 22.0;

class _ZeBottomNavigation extends StatelessWidget {
  const _ZeBottomNavigation({
    required this.selectedIndex,
    required this.onSelected,
    required this.onAdd,
    required this.onQuickAdd,
  });

  final int selectedIndex;
  final ValueChanged<int> onSelected;
  final VoidCallback onAdd;
  final VoidCallback onQuickAdd;

  // A getter, not a constant, so the labels follow the UI language.
  static List<(IconData, IconData, String)> get _items => [
    (Icons.home_outlined, Icons.home_rounded, tr('Home', '首页')),
    (
      Icons.receipt_long_outlined,
      Icons.receipt_long_rounded,
      tr('Activity', '明细'),
    ),
    (
      Icons.donut_large_outlined,
      Icons.donut_large_rounded,
      tr('Insights', '统计'),
    ),
    (Icons.person_outline_rounded, Icons.person_rounded, tr('Me', '我的')),
  ];

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    final items = _items;
    Widget item(int index) => Expanded(
      child: _ZeNavigationItem(
        icon: items[index].$1,
        selectedIcon: items[index].$2,
        label: items[index].$3,
        selected: selectedIndex == index,
        onTap: () => onSelected(index),
      ),
    );

    return RepaintBoundary(
      child: CustomPaint(
        painter: _GroundPainter(
          color: t.card,
          edge: t.line,
          shadow: Colors.black.withValues(alpha: t.dark ? .35 : .06),
        ),
        child: SafeArea(
          top: false,
          child: SizedBox(
            height: _barHeight + _moundHeight,
            child: Stack(
              alignment: Alignment.bottomCenter,
              children: [
                SizedBox(
                  height: _barHeight,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    child: Row(
                      children: [
                        item(0),
                        item(1),
                        const Expanded(child: SizedBox()),
                        item(2),
                        item(3),
                      ],
                    ),
                  ),
                ),
                Positioned(
                  top: 10,
                  child: Tooltip(
                    message: tr('Add to ledger', '记一笔'),
                    child: Semantics(
                      button: true,
                      label: tr('Add to ledger', '记一笔'),
                      onTap: onAdd,
                      onLongPress: onQuickAdd,
                      excludeSemantics: true,
                      child: Material(
                        color: t.primary,
                        shape: const CircleBorder(),
                        child: InkWell(
                          customBorder: const CircleBorder(),
                          onTap: onAdd,
                          onLongPress: onQuickAdd,
                          child: SizedBox.square(
                            dimension: 56,
                            child: Icon(
                              Icons.add_rounded,
                              color: t.onPrimary,
                              size: 30,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The ground the tabs stand on, swelling into a mound under the +.
class _GroundPainter extends CustomPainter {
  const _GroundPainter({
    required this.color,
    required this.edge,
    required this.shadow,
  });

  final Color color;
  final Color edge;
  final Color shadow;

  static Path _topEdge(Size size) {
    final middle = size.width / 2;
    const ground = _moundHeight;
    return Path()
      ..moveTo(0, ground)
      ..lineTo(middle - 68, ground)
      ..cubicTo(middle - 42, ground, middle - 38, 0, middle, 0)
      ..cubicTo(middle + 38, 0, middle + 42, ground, middle + 68, ground)
      ..lineTo(size.width, ground);
  }

  static Path _path(Size size) => _topEdge(size)
    ..lineTo(size.width, size.height)
    ..lineTo(0, size.height)
    ..close();

  @override
  void paint(Canvas canvas, Size size) {
    final path = _path(size);
    canvas.drawPath(
      path.shift(const Offset(0, -2)),
      Paint()
        ..color = shadow
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
    );
    canvas.drawPath(path, Paint()..color = color);
    canvas.drawPath(
      _topEdge(size),
      Paint()
        ..color = edge
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
  }

  /// Beside the mound, taps go to the page behind it.
  @override
  bool hitTest(Offset position) => position.dy >= _moundHeight;

  @override
  bool shouldRepaint(_GroundPainter oldDelegate) =>
      oldDelegate.color != color ||
      oldDelegate.edge != edge ||
      oldDelegate.shadow != shadow;
}

class _ZeNavigationItem extends StatelessWidget {
  const _ZeNavigationItem({
    required this.icon,
    required this.selectedIcon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    final color = selected ? t.ink : t.sub;
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      onTap: onTap,
      excludeSemantics: true,
      child: InkResponse(
        onTap: onTap,
        radius: 32,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(selected ? selectedIcon : icon, size: 24, color: color),
            const SizedBox(height: 4),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: color,
                fontSize: 11,
                height: 1.15,
                fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
