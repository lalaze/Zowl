part of 'sky.dart';

/// The owl as it stands outdoors: always ink-black, with a faint rim where
/// the sky or the page around it is dark.
class SkyOwl extends StatelessWidget {
  const SkyOwl({
    super.key,
    required this.size,
    this.gaze = const Offset(-2, 0),
    this.busy = false,
  });

  final double size;
  final Offset gaze;

  /// Moves while the page is loading or saving.
  final bool busy;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: LivelyOwl(
      size: size,
      gaze: gaze,
      busy: busy,
      variant: SkyPalette.of(context).moon || context.ze.dark
          ? OwlVariant.onNight
          : OwlVariant.onLight,
    ),
  );
}

/// The landscape below a [SkyBar], with the page's headline on the sky and
/// the owl standing on the paper hill that closes it off.
class SkyHeader extends StatelessWidget {
  const SkyHeader({
    super.key,
    required this.layout,
    required this.child,
    this.padding,
    this.bubble,
    this.owlGaze = const Offset(-2, 0),
    this.busy = false,
  });

  final SkyLayout layout;
  final Widget child;

  /// Defaults to the page margin and room for the hills below the text.
  final EdgeInsets? padding;

  /// Something the owl says, beside its head.
  final Widget? bubble;
  final Offset owlGaze;

  /// Whether the page is loading or saving, which sets the owl moving.
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final palette = SkyPalette.of(context);
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final scale = SkyLayout.scaleFor(width);
        final owl = layout.owl;
        final owlSize = layout.owlSize * scale;
        return RepaintBoundary(
          child: CustomPaint(
            painter: SkyPainter(
              palette: palette,
              layout: layout,
              paper: context.ze.canvas,
              top: skyBarExtent(context),
            ),
            child: Stack(
              children: [
                if (owl != null)
                  Positioned(
                    left: owl.dx * width / 360 - owlSize / 2,
                    // The feet end 11 units above the bottom of the owl's grid.
                    bottom: owl.dy * scale - owlSize * 11 / 200,
                    child: SkyOwl(size: owlSize, gaze: owlGaze, busy: busy),
                  ),
                Padding(
                  padding:
                      padding ?? EdgeInsets.fromLTRB(24, 8, 24, 96 * scale),
                  child: SizedBox(
                    width: double.infinity,
                    child: _OnSky(palette: palette, child: child),
                  ),
                ),
                if (bubble != null && owl != null)
                  Positioned(
                    right: width - owl.dx * width / 360 + owlSize * .31,
                    bottom: owl.dy * scale + owlSize * .24,
                    child: bubble!,
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// Pinned slim [SkyBar] plus a scrollable strip of hills, so secondary pages
/// keep the storybook skyline without sacrificing 138 px while scrolling.
List<Widget> skyStripSlivers({
  required String title,
  List<Widget> actions = const [],
}) => [
  PinnedHeaderSliver(
    child: SkyBar(
      layout: SkyLayout.strip,
      leading: const SkyBackButton(),
      title: SkyTitle(title, small: true),
      actions: actions,
    ),
  ),
  const SliverToBoxAdapter(
    child: SkyHeader(
      layout: SkyLayout.strip,
      padding: EdgeInsets.only(bottom: 46),
      child: SizedBox.shrink(),
    ),
  ),
];

/// What the owl in a [SkyHeader] says, its tail towards the owl on the right.
class OwlBubble extends StatelessWidget {
  const OwlBubble({
    super.key,
    required this.text,
    this.semanticLabel,
    this.onTap,
  });

  final String text;
  final String? semanticLabel;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    final color = t.dark ? const Color(0xff39405a) : Colors.white;
    return Semantics(
      button: onTap != null,
      label: semanticLabel ?? text,
      onTap: onTap,
      excludeSemantics: true,
      child: Padding(
        padding: const EdgeInsets.only(right: 10),
        child: CustomPaint(
          painter: _BubbleTail(color),
          child: Material(
            color: color,
            borderRadius: BorderRadius.circular(24),
            child: InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 44, maxWidth: 190),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 10, 8),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    spacing: 4,
                    children: [
                      Flexible(
                        child: Text(
                          text,
                          style: TextStyle(
                            color: t.ink,
                            fontSize: 14,
                            height: 1.25,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      Icon(Icons.chevron_right_rounded, size: 18, color: t.ink),
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

class _BubbleTail extends CustomPainter {
  const _BubbleTail(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final middle = math.min(size.height / 2, size.height - 20);
    canvas.drawPath(
      Path()
        ..moveTo(size.width - 5, middle - 8)
        ..quadraticBezierTo(size.width, middle - 2, size.width + 9, middle)
        ..quadraticBezierTo(size.width, middle + 4, size.width - 5, middle + 8)
        ..close(),
      Paint()..color = color,
    );
  }

  @override
  bool shouldRepaint(_BubbleTail oldDelegate) => oldDelegate.color != color;
}
