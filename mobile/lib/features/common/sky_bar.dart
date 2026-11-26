part of 'sky.dart';

/// Height of the bar at the top of a sky page, without the status bar.
const skyBarHeight = 56.0;

double skyBarExtent(BuildContext context) =>
    MediaQuery.paddingOf(context).top + skyBarHeight;

/// Tracks whether a vertical [CustomScrollView] has scrolled past the top, so
/// its pinned [SkyBar] can fade in a subtle bottom edge over scrolled content.
class SkyScrollScope extends StatefulWidget {
  const SkyScrollScope({super.key, required this.child});

  final Widget child;

  static bool isScrolledOf(BuildContext context) =>
      context
          .dependOnInheritedWidgetOfExactType<_SkyScrolledInherited>()
          ?.scrolled ??
      false;

  @override
  State<SkyScrollScope> createState() => _SkyScrollScopeState();
}

class _SkyScrollScopeState extends State<SkyScrollScope> {
  bool _scrolled = false;

  bool _onScroll(ScrollNotification notification) {
    if (notification.depth != 0 || notification.metrics.axis != Axis.vertical) {
      return false;
    }
    final next = notification.metrics.pixels > 12;
    if (next != _scrolled) setState(() => _scrolled = next);
    return false;
  }

  @override
  Widget build(BuildContext context) =>
      NotificationListener<ScrollNotification>(
        onNotification: _onScroll,
        child: _SkyScrolledInherited(scrolled: _scrolled, child: widget.child),
      );
}

class _SkyScrolledInherited extends InheritedWidget {
  const _SkyScrolledInherited({required this.scrolled, required super.child});

  final bool scrolled;

  @override
  bool updateShouldNotify(_SkyScrolledInherited oldWidget) =>
      oldWidget.scrolled != scrolled;
}

/// Bar that stays at the top of a page: its title and actions on the sky.
class SkyBar extends StatelessWidget {
  const SkyBar({
    super.key,
    required this.title,
    required this.layout,
    this.actions = const [],
    this.leading,
  });

  final Widget title;
  final SkyLayout layout;
  final List<Widget> actions;
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    final palette = SkyPalette.of(context);
    final scrolled = SkyScrollScope.isScrolledOf(context);
    return RepaintBoundary(
      child: AnnotatedRegion<SystemUiOverlayStyle>(
        value: palette.overlay,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          curve: Curves.easeOut,
          decoration: BoxDecoration(
            boxShadow: scrolled
                ? [
                    BoxShadow(
                      color: Colors.black.withValues(
                        alpha: context.ze.dark ? .28 : .08,
                      ),
                      blurRadius: 10,
                      offset: const Offset(0, 2),
                    ),
                  ]
                : const [],
          ),
          child: CustomPaint(
            painter: SkyPainter(
              palette: palette,
              layout: layout,
              landscape: false,
              bleed: 600,
            ),
            foregroundPainter: scrolled
                ? _SkyBarEdgePainter(
                    palette.onDark
                        ? Colors.white.withValues(alpha: .10)
                        : Colors.black.withValues(alpha: .07),
                  )
                : null,
            child: SizedBox(
              height: skyBarExtent(context),
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  leading == null ? 24 : 6,
                  MediaQuery.paddingOf(context).top,
                  // Actions are 38 px circles in 48 px targets, so the last one
                  // ends on the 24 px page margin.
                  19,
                  0,
                ),
                child: _OnSky(
                  palette: palette,
                  child: Row(
                    children: [
                      ?leading,
                      Expanded(
                        // Large type already; let it grow only as far as the bar.
                        child: MediaQuery.withClampedTextScaling(
                          maxScaleFactor: 1.5,
                          child: title,
                        ),
                      ),
                      const SizedBox(width: 8),
                      ...actions,
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SkyBarEdgePainter extends CustomPainter {
  const _SkyBarEdgePainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawLine(
      Offset(0, size.height - .5),
      Offset(size.width, size.height - .5),
      Paint()
        ..color = color
        ..strokeWidth = 1,
    );
  }

  @override
  bool shouldRepaint(_SkyBarEdgePainter oldDelegate) =>
      oldDelegate.color != color;
}

/// Page title in a [SkyBar].
class SkyTitle extends StatelessWidget {
  const SkyTitle(this.text, {super.key, this.small = false});

  final String text;

  /// For pages opened from another one, beside their back button.
  final bool small;

  @override
  Widget build(BuildContext context) => Semantics(
    header: true,
    child: Text(
      text,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: Theme.of(context).textTheme.headlineMedium?.copyWith(
        color: SkyPalette.of(context).foreground,
        fontSize: small ? 18 : null,
        height: 1.15,
      ),
    ),
  );
}

/// Back button in a [SkyBar]; nothing when there is nowhere to go back to.
class SkyBackButton extends StatelessWidget {
  const SkyBackButton({super.key});

  @override
  Widget build(BuildContext context) => _canGoBack(context)
      ? SizedBox(
          width: 50,
          child: BackButton(
            style: IconButton.styleFrom(
              foregroundColor: SkyPalette.of(context).foreground,
              backgroundColor: Colors.transparent,
              fixedSize: const Size.square(44),
              iconSize: 24,
            ),
          ),
        )
      : const SizedBox(width: 18);

  static bool _canGoBack(BuildContext context) =>
      ModalRoute.of(context)?.impliesAppBarDismissal ?? false;
}
