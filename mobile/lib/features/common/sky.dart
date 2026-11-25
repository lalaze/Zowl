import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/day_time.dart';
import '../../core/theme.dart';
import 'brand_mark.dart';
import 'owl_motion.dart';

/// Colours of one hour's landscape. The shapes are the same all day; only
/// these change.
@immutable
class SkyPalette {
  const SkyPalette({
    required this.sky,
    required this.sun,
    required this.far,
    required this.near,
    required this.field,
    required this.ridge,
    required this.furrow,
    required this.roundTree,
    required this.cypress,
    required this.smallTree,
    required this.cloud,
    required this.foreground,
    required this.muted,
    this.stars = 0,
    this.moon = false,
  });

  /// Top, middle and horizon.
  final List<Color> sky;
  final Color sun;

  /// Pale hill at the back left, the hill in front of it, the sunlit field on
  /// the right, and the ridge behind that field.
  final Color far;
  final Color near;
  final Color field;
  final Color ridge;
  final Color furrow;
  final Color roundTree;
  final Color cypress;
  final Color smallTree;
  final Color cloud;

  /// Text and icons on the sky.
  final Color foreground;
  final Color muted;

  /// How many of the sky's stars are out.
  final int stars;
  final bool moon;

  bool get onDark => foreground == Colors.white;

  /// Backing for controls on the sky, so they stay readable in front of the
  /// sun or a cloud.
  Color get frost => Colors.white.withValues(alpha: onDark ? .18 : .55);

  /// Error text on the sky.
  Color get danger =>
      onDark ? const Color(0xffffc2c9) : const Color(0xffa3122a);

  /// Status bar icons on this sky; the system bar below is the page's own.
  SystemUiOverlayStyle get overlay => SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: onDark ? Brightness.light : Brightness.dark,
    statusBarBrightness: onDark ? Brightness.dark : Brightness.light,
  );

  static SkyPalette of(BuildContext context) {
    final t = context.ze;
    return forTime(t.time, dark: t.dark);
  }

  static SkyPalette forTime(SceneTime time, {required bool dark}) =>
      switch (time) {
        SceneTime.dawn => dark ? _dawnDark : _dawn,
        SceneTime.day => dark ? _dayDark : _day,
        SceneTime.dusk => dark ? _duskDark : _dusk,
        // Night is dark already, so both themes share it.
        SceneTime.night => _night,
      };

  static const _ink = Color(0xff1e2230);

  static const _dawn = SkyPalette(
    sky: [Color(0xfffdc1b9), Color(0xfffbd2c2), Color(0xfffde5c9)],
    sun: Color(0xfffc8452),
    far: Color(0xffd1c5cd),
    near: Color(0xff8e9e6c),
    field: Color(0xffb5b871),
    ridge: Color(0xff92a27b),
    furrow: Color(0xffe1d78c),
    roundTree: Color(0xff8b954f),
    cypress: Color(0xff6c795b),
    smallTree: Color(0xffa5aa56),
    cloud: Color(0xfffdf2de),
    foreground: _ink,
    muted: Color(0xff594639),
  );

  static const _day = SkyPalette(
    sky: [Color(0xff88ccf3), Color(0xffa0daf0), Color(0xffc4eeea)],
    sun: Color(0xfffdc75a),
    far: Color(0xff93d0d5),
    near: Color(0xff6ca065),
    field: Color(0xffadc35e),
    ridge: Color(0xff62a079),
    furrow: Color(0xffdfdd78),
    roundTree: Color(0xff779f49),
    cypress: Color(0xff3c5e6a),
    smallTree: Color(0xffa1ba54),
    cloud: Color(0xfff4f6f1),
    foreground: _ink,
    muted: Color(0xff31414f),
  );

  static const _dusk = SkyPalette(
    sky: [Color(0xff2a1b42), Color(0xff582b5c), Color(0xffb85a70)],
    sun: Color(0xfff4942d),
    far: Color(0xff75426d),
    near: Color(0xff461d3d),
    field: Color(0xff405c55),
    ridge: Color(0xff572848),
    furrow: Color(0xffd6a54c),
    roundTree: Color(0xff596237),
    cypress: Color(0xff34284e),
    smallTree: Color(0xff82883e),
    cloud: Color(0xff945574),
    foreground: Colors.white,
    muted: Color(0xfff0dfe6),
    stars: 3,
  );

  static const _night = SkyPalette(
    sky: [Color(0xff111634), Color(0xff1b2247), Color(0xff3d4a7a)],
    sun: Color(0xffffe7c0),
    far: Color(0xff4c6494),
    near: Color(0xff153149),
    field: Color(0xff2b4c68),
    ridge: Color(0xff1c3750),
    furrow: Color(0xff54779c),
    roundTree: Color(0xff103649),
    cypress: Color(0xff11273f),
    smallTree: Color(0xff113a4c),
    cloud: Color(0xff3a4a77),
    foreground: Colors.white,
    muted: Color(0xffd5d8ee),
    stars: 9,
    moon: true,
  );

  static const _dawnDark = SkyPalette(
    sky: [Color(0xff4f293e), Color(0xff653946), Color(0xff8d504a)],
    sun: Color(0xfffd725b),
    far: Color(0xff916b83),
    near: Color(0xff53593d),
    field: Color(0xff6d6a41),
    ridge: Color(0xff52563d),
    furrow: Color(0xffad9251),
    roundTree: Color(0xff67632c),
    cypress: Color(0xff4d5339),
    smallTree: Color(0xff807736),
    cloud: Color(0xff9a6268),
    foreground: Colors.white,
    muted: Color(0xfff0dfd6),
  );

  static const _dayDark = SkyPalette(
    sky: [Color(0xff1c364f), Color(0xff264f65), Color(0xff38777e)],
    sun: Color(0xfff9a71d),
    far: Color(0xff296468),
    near: Color(0xff1c4c31),
    field: Color(0xff50702c),
    ridge: Color(0xff175041),
    furrow: Color(0xff93963c),
    roundTree: Color(0xff315d2c),
    cypress: Color(0xff092435),
    smallTree: Color(0xff748833),
    cloud: Color(0xff567c88),
    foreground: Colors.white,
    muted: Color(0xffd6e4ec),
  );

  static const _duskDark = SkyPalette(
    sky: [Color(0xff1e0e29), Color(0xff351637), Color(0xff772e4f)],
    sun: Color(0xfff9a437),
    far: Color(0xff4b2242),
    near: Color(0xff281028),
    field: Color(0xff183b38),
    ridge: Color(0xff2e122b),
    furrow: Color(0xffeca842),
    roundTree: Color(0xff4d5e30),
    cypress: Color(0xff221735),
    smallTree: Color(0xff79853f),
    cloud: Color(0xff6b3350),
    foreground: Colors.white,
    muted: Color(0xfff0dfe6),
    stars: 3,
  );
}

/// The shape of a paper hill, left to right across a 360-unit width: height
/// of each point below the hill's crest.
enum _PaperHill { slope, gentle, dome }

/// Where things stand in a header. Horizontal positions are on a 360-unit
/// width; vertical ones count up from the header's bottom edge, so the
/// landscape holds together however tall the text above it grows.
@immutable
class SkyLayout {
  const SkyLayout._({
    required this.skyHeight,
    required this.horizon,
    required this.crest,
    required _PaperHill hill,
    required this.sun,
    required this.sunRadius,
    this.owl,
    this.owlSize = 0,
    this.clouds = const [],
  }) : _hill = hill;

  /// Height the sky's gradient runs over, from the top of the screen.
  final double skyHeight;
  final double horizon;

  /// Top of the paper hill that closes the header off.
  final double crest;
  final _PaperHill _hill;
  final Offset sun;
  final double sunRadius;

  /// Where the owl's feet are.
  final Offset? owl;
  final double owlSize;
  final List<(double, double, double)> clouds;

  /// Home: the owl in front of a large sun.
  static const home = SkyLayout._(
    skyHeight: 332,
    horizon: 44,
    crest: 30,
    hill: _PaperHill.slope,
    sun: Offset(274, 114),
    sunRadius: 72,
    owl: Offset(274, 28),
    owlSize: 152,
    clouds: [(22, 114, .76), (300, 196, .68)],
  );

  /// Tab pages, the entry form and the detail page.
  static const page = SkyLayout._(
    skyHeight: 270,
    horizon: 30,
    crest: 24,
    hill: _PaperHill.gentle,
    sun: Offset(290, 85),
    sunRadius: 46,
    owl: Offset(290, 20),
    owlSize: 104,
    clouds: [(34, 82, .55)],
  );

  /// Secondary pages: a sun setting behind a strip of hills.
  static const strip = SkyLayout._(
    skyHeight: 150,
    horizon: 22,
    crest: 24,
    hill: _PaperHill.gentle,
    sun: Offset(288, 28),
    sunRadius: 17,
  );

  /// Insights: only the sky; the month's own hills stand in for the
  /// landscape.
  static const insights = SkyLayout._(
    skyHeight: 440,
    horizon: 30,
    crest: 24,
    hill: _PaperHill.gentle,
    sun: Offset.zero,
    sunRadius: 0,
  );

  static const login = SkyLayout._(
    skyHeight: 470,
    horizon: 62,
    crest: 38,
    hill: _PaperHill.dome,
    sun: Offset(180, 164),
    sunRadius: 106,
    owl: Offset(180, 34),
    owlSize: 208,
    clouds: [(26, 132, 1), (292, 240, .9)],
  );

  /// Sizes grow a little on wide screens, positions stretch with the width.
  static double scaleFor(double width) => (width / 360).clamp(.85, 1.2);
}

/// The sky, its sun or moon, the hills, and the paper hill in front.
class SkyPainter extends CustomPainter {
  const SkyPainter({
    required this.palette,
    required this.layout,
    this.paper,
    this.top = 0,
    this.bleed = 1,
    this.landscape = true,
  });

  final SkyPalette palette;
  final SkyLayout layout;

  /// Colour of the page below; null leaves the hills uncovered.
  final Color? paper;

  /// How far below the top of the screen this canvas starts. The bar and the
  /// header below it each paint their own slice of one sky.
  final double top;

  /// Sky painted above the canvas, so no seam or overscroll gap shows.
  final double bleed;

  /// False paints only the sky: the bar above a header, or a chart's backdrop.
  final bool landscape;

  @override
  void paint(Canvas canvas, Size size) {
    final width = size.width;
    final stretch = width / 360;
    final scale = SkyLayout.scaleFor(width);
    paintSky(canvas, size);
    if (!landscape) return;
    double up(double value) => size.height - value * scale;

    final sun = Offset(layout.sun.dx * stretch, up(layout.sun.dy));
    paintSun(canvas, sun, layout.sunRadius * scale, palette);
    for (final (x, y, s) in layout.clouds) {
      paintCloud(canvas, Offset(x * stretch, up(y)), s * scale, palette.cloud);
    }

    canvas.save();
    canvas.clipRect(Offset.zero & size);
    canvas.translate(0, up(layout.horizon));
    paintHills(canvas, stretch, scale, palette);
    canvas.restore();

    if (paper case final paper?) {
      canvas.save();
      canvas.translate(0, up(layout.crest));
      canvas.scale(stretch, scale);
      canvas.drawPath(
        _paperHill(layout._hill, layout.crest + 1),
        Paint()..color = paper,
      );
      canvas.restore();
    }
  }

  void paintSky(Canvas canvas, Size size) {
    final width = size.width;
    final rect = Rect.fromLTRB(0, -bleed, width, size.height);
    canvas.drawRect(
      rect,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: palette.sky,
          stops: const [0, .5, .9],
        ).createShader(Rect.fromLTWH(0, -top, width, layout.skyHeight)),
    );
    final stretch = width / 360;
    canvas.save();
    canvas.clipRect(Offset.zero & size);
    for (final (x, y, r) in _stars.take(palette.stars)) {
      final at = Offset(x * stretch, y - top);
      final paint = Paint()
        ..color = (palette.moon ? palette.sun : const Color(0xfff2b36a))
            .withValues(alpha: .85);
      r > 2
          ? canvas.drawPath(_star(at, r * 2.4), paint)
          : canvas.drawCircle(at, r, paint);
    }
    canvas.restore();
  }

  /// Clear of the text on the left and the controls on the right.
  static const _stars = [
    (252.0, 112.0, 2.2),
    (350.0, 152.0, 1.4),
    (196.0, 238.0, 1.5),
    (350.0, 106.0, 1.2),
    (150.0, 254.0, 1.2),
    (92.0, 240.0, 1.4),
    (216.0, 266.0, 2.1),
    (40.0, 264.0, 1.2),
    (300.0, 150.0, 1.2),
  ];

  static Path _star(Offset at, double r) => Path()
    ..moveTo(at.dx, at.dy - r)
    ..quadraticBezierTo(at.dx, at.dy, at.dx + r, at.dy)
    ..quadraticBezierTo(at.dx, at.dy, at.dx, at.dy + r)
    ..quadraticBezierTo(at.dx, at.dy, at.dx - r, at.dy)
    ..quadraticBezierTo(at.dx, at.dy, at.dx, at.dy - r)
    ..close();

  static void paintSun(
    Canvas canvas,
    Offset center,
    double radius,
    SkyPalette palette,
  ) {
    canvas.drawCircle(center, radius, Paint()..color = palette.sun);
    if (!palette.moon) return;
    final crater = Paint()..color = const Color(0xfff3d8a9);
    for (final (dx, dy, r) in const [
      (-.32, -.34, .12),
      (.53, -.53, .08),
      (-.53, .1, .065),
    ]) {
      canvas.drawCircle(center + Offset(dx, dy) * radius, r * radius, crater);
    }
  }

  static void paintCloud(Canvas canvas, Offset at, double scale, Color color) {
    canvas.save();
    canvas.translate(at.dx, at.dy);
    canvas.scale(scale);
    canvas.drawPath(
      Path()
        ..moveTo(0, 10)
        ..cubicTo(0, 5, 4, 2, 9, 2)
        ..lineTo(16, 2)
        ..cubicTo(22, -8, 40, -9, 47, -1)
        ..cubicTo(50, 2, 51, 6, 51, 10)
        ..cubicTo(51, 11, 50, 11.5, 49, 11.5)
        ..lineTo(2, 11.5)
        ..quadraticBezierTo(0, 11.5, 0, 10)
        ..close(),
      Paint()..color = color,
    );
    canvas.restore();
  }

  /// Hills around the origin's horizon line.
  static void paintHills(
    Canvas canvas,
    double stretch,
    double scale,
    SkyPalette palette,
  ) {
    void fill(Path path, Color color) =>
        canvas.drawPath(path, Paint()..color = color);
    canvas.save();
    canvas.scale(stretch, scale);
    fill(
      Path()
        ..moveTo(-10, 2)
        ..cubicTo(40, -30, 92, -38, 138, -38)
        ..cubicTo(200, -38, 262, -18, 330, 4)
        ..lineTo(330, 90)
        ..lineTo(-10, 90)
        ..close(),
      palette.far,
    );
    fill(
      Path()
        ..moveTo(238, 4)
        ..cubicTo(276, -26, 316, -38, 352, -36)
        ..lineTo(372, -33)
        ..lineTo(372, 80)
        ..lineTo(238, 80)
        ..close(),
      palette.ridge,
    );
    canvas.restore();
    paintTrees(canvas, Offset(206 * stretch, scale), .78 * scale, palette);
    canvas.save();
    canvas.scale(stretch, scale);
    fill(
      Path()
        ..moveTo(96, 40)
        ..cubicTo(150, 6, 226, -6, 300, -6)
        ..cubicTo(330, -6, 350, -3, 372, 1)
        ..lineTo(372, 120)
        ..lineTo(96, 120)
        ..close(),
      palette.field,
    );
    fill(
      Path()
        ..moveTo(140, 62)
        ..cubicTo(200, 14, 276, -1, 372, 1.5)
        ..lineTo(372, 3.5)
        ..cubicTo(286, 3, 226, 22, 160, 66)
        ..close(),
      palette.furrow,
    );
    fill(
      Path()
        ..moveTo(196, 90)
        ..cubicTo(244, 34, 300, 10, 372, 5)
        ..lineTo(372, 8)
        ..cubicTo(312, 16, 262, 44, 220, 92)
        ..close(),
      palette.furrow,
    );
    fill(
      Path()
        ..moveTo(-10, 18)
        ..cubicTo(30, 0, 64, -5, 96, -3)
        ..cubicTo(160, 1, 210, 40, 262, 86)
        ..lineTo(262, 120)
        ..lineTo(-10, 120)
        ..close(),
      palette.near,
    );
    canvas.restore();
  }

  static void paintTrees(
    Canvas canvas,
    Offset at,
    double scale,
    SkyPalette palette,
  ) {
    canvas.save();
    canvas.translate(at.dx, at.dy);
    canvas.scale(scale);
    final trunk = Paint()
      ..color = palette.cypress
      ..strokeWidth = 3.6;
    canvas.drawLine(const Offset(-21, 2), const Offset(-21, -24), trunk);
    canvas.drawLine(const Offset(0, 2), const Offset(0, -24), trunk);
    canvas.drawLine(const Offset(18, 2), const Offset(18, -16), trunk);
    canvas.drawCircle(
      const Offset(-21, -27),
      14.5,
      Paint()..color = palette.roundTree,
    );
    canvas.drawPath(
      Path()
        ..moveTo(0, -52)
        ..cubicTo(5, -44, 8.2, -33, 8.2, -25)
        ..cubicTo(8.2, -17, 4.5, -14, 0, -14)
        ..cubicTo(-4.5, -14, -8.2, -17, -8.2, -25)
        ..cubicTo(-8.2, -33, -5, -44, 0, -52)
        ..close(),
      Paint()..color = palette.cypress,
    );
    canvas.drawCircle(
      const Offset(18, -18),
      8.8,
      Paint()..color = palette.smallTree,
    );
    canvas.restore();
  }

  /// A hill whose crest is at the origin, filled down to [bottom].
  static Path _paperHill(_PaperHill hill, double bottom) {
    final path = Path();
    switch (hill) {
      case _PaperHill.slope:
        path
          ..moveTo(0, 26)
          ..cubicTo(70, 30, 150, 22, 214, 6)
          ..cubicTo(250, -3, 300, -3, 360, 18);
      case _PaperHill.gentle:
        path
          ..moveTo(0, 18)
          ..cubicTo(90, 22, 180, 14, 250, 3)
          ..cubicTo(290, -2, 330, 2, 360, 12);
      case _PaperHill.dome:
        path
          ..moveTo(0, 30)
          ..cubicTo(80, 8, 130, 0, 190, 0)
          ..cubicTo(260, 0, 310, 14, 360, 34);
    }
    return path
      ..lineTo(360, bottom)
      ..lineTo(0, bottom)
      ..close();
  }

  /// Paints the signature gentle paper hill along the bottom edge of a sky canvas.
  static void paintPaperHill(
    Canvas canvas,
    Size size,
    Color paper, {
    double crest = 22,
  }) {
    final stretch = size.width / 360;
    final scale = SkyLayout.scaleFor(size.width);
    canvas.save();
    canvas.translate(0, size.height - crest * scale);
    canvas.scale(stretch, scale);
    canvas.drawPath(
      _paperHill(_PaperHill.gentle, crest + 2),
      Paint()..color = paper,
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(SkyPainter oldDelegate) =>
      oldDelegate.palette != palette ||
      oldDelegate.layout != layout ||
      oldDelegate.paper != paper ||
      oldDelegate.top != top ||
      oldDelegate.landscape != landscape;
}

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
    return AnnotatedRegion<SystemUiOverlayStyle>(
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

/// Text and icon colours for whatever sits on the sky.
class _OnSky extends StatelessWidget {
  const _OnSky({required this.palette, required this.child});

  final SkyPalette palette;
  final Widget child;

  @override
  Widget build(BuildContext context) => IconButtonTheme(
    data: IconButtonThemeData(
      style: IconButton.styleFrom(
        foregroundColor: palette.foreground,
        disabledForegroundColor: palette.foreground.withValues(alpha: .38),
        backgroundColor: palette.frost,
        fixedSize: const Size.square(38),
        minimumSize: const Size.square(38),
        padding: EdgeInsets.zero,
        iconSize: 20,
      ),
    ),
    child: IconTheme.merge(
      data: IconThemeData(color: palette.foreground),
      child: DefaultTextStyle.merge(
        style: TextStyle(color: palette.foreground),
        child: child,
      ),
    ),
  );
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

/// App bar of the pages behind the tabs: a strip of the same sky and hills.
class SkyAppBar extends StatelessWidget implements PreferredSizeWidget {
  const SkyAppBar({super.key, required this.title, this.actions = const []});

  final String title;
  final List<Widget> actions;

  static const _strip = 46.0;

  @override
  Size get preferredSize => const Size.fromHeight(skyBarHeight + _strip);

  @override
  Widget build(BuildContext context) {
    final palette = SkyPalette.of(context);
    return AppBar(
      toolbarHeight: skyBarHeight,
      systemOverlayStyle: palette.overlay,
      backgroundColor: palette.sky.first,
      foregroundColor: palette.foreground,
      iconTheme: IconThemeData(color: palette.foreground),
      titleTextStyle: Theme.of(
        context,
      ).textTheme.titleLarge?.copyWith(color: palette.foreground, fontSize: 18),
      // Where a [SkyBar] has its title, with and without a back button.
      titleSpacing: SkyBackButton._canGoBack(context) ? 0 : 24,
      title: Text(title),
      actions: [...actions, const SizedBox(width: 12)],
      flexibleSpace: CustomPaint(
        size: Size.infinite,
        painter: SkyPainter(
          palette: palette,
          layout: SkyLayout.strip,
          paper: context.ze.canvas,
        ),
      ),
      bottom: const PreferredSize(
        preferredSize: Size.fromHeight(_strip),
        child: SizedBox(height: _strip),
      ),
    );
  }
}

/// A pill on the sky: a small fact, or a control.
class SkyPill extends StatelessWidget {
  const SkyPill({super.key, required this.child, this.padding});

  final Widget child;
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    final palette = SkyPalette.of(context);
    return Container(
      padding:
          padding ?? const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: palette.frost,
        borderRadius: BorderRadius.circular(99),
      ),
      child: DefaultTextStyle.merge(
        style: TextStyle(
          color: palette.foreground,
          fontSize: 12.5,
          fontWeight: FontWeight.w700,
        ),
        child: child,
      ),
    );
  }
}

/// A large amount on the sky or the page, its currency and cents set smaller.
class SkyAmount extends StatelessWidget {
  const SkyAmount(this.text, {super.key, this.size = 48, this.color});

  /// A formatted amount such as `-¥6,612.00`.
  final String text;
  final double size;
  final Color? color;

  static final _parts = RegExp(r'^([^\d]*)([\d,]+)(\.\d+)?(.*)$');

  @override
  Widget build(BuildContext context) {
    final match = _parts.firstMatch(text);
    final base = TextStyle(
      color: color ?? SkyPalette.of(context).foreground,
      fontSize: size,
      height: 1.1,
      fontWeight: FontWeight.w800,
      letterSpacing: -size * .02,
      fontFeatures: tabularFigures,
    );
    final small = TextStyle(
      fontSize: size * .58,
      fontWeight: FontWeight.w700,
      letterSpacing: 0,
    );
    return FittedBox(
      fit: BoxFit.scaleDown,
      alignment: Alignment.centerLeft,
      child: match == null
          ? Text(text, style: base)
          : Text.rich(
              TextSpan(
                children: [
                  TextSpan(text: match[1], style: small),
                  TextSpan(text: match[2]),
                  if (match[3] != null)
                    TextSpan(
                      text: match[3],
                      style: small.copyWith(
                        color: base.color!.withValues(alpha: .72),
                      ),
                    ),
                  TextSpan(text: match[4], style: small),
                ],
              ),
              style: base,
            ),
    );
  }
}

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
