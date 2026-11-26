part of 'sky.dart';

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
