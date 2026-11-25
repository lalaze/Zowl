import 'dart:math' as math;
import 'dart:ui' show lerpDouble;

import 'package:flutter/material.dart';

import '../../core/l10n.dart';

/// Which surface the owl sits on. The mark keeps fixed brand colours across
/// accent themes and stays ink-black everywhere; on dark surfaces a faint rim
/// of light traces its outline so it does not sink into the page.
enum OwlVariant { onLight, onDark, onNight, monochrome }

/// Zowl, the owl mascot: an egg-shaped body with folded wings, watchful amber
/// eyes under a calm brow and three ledger rules on the chest.
class OwlMark extends StatelessWidget {
  const OwlMark({
    super.key,
    this.size = 40,
    this.variant,
    this.pose = OwlPose.rest,
  });

  final double size;

  /// Null picks [OwlVariant.onLight] or [OwlVariant.onDark] from the theme.
  final OwlVariant? variant;
  final OwlPose pose;

  @override
  Widget build(BuildContext context) {
    final resolved =
        variant ??
        (Theme.of(context).brightness == Brightness.dark
            ? OwlVariant.onDark
            : OwlVariant.onLight);
    return Semantics(
      label: tr('Zowl the owl', '猫头鹰 Zowl'),
      image: true,
      child: SizedBox.square(
        dimension: size,
        child: CustomPaint(painter: OwlPainter(resolved, pose: pose)),
      ),
    );
  }
}

/// How the owl holds itself; [rest] is the mark as drawn. Lengths are in
/// design-grid units.
@immutable
class OwlPose {
  const OwlPose({
    this.gaze = Offset.zero,
    this.tilt = 0,
    this.lids = 0,
    this.joy = 0,
    this.lift = 0,
    this.squash = 0,
    this.flap = 0,
    this.written = 3,
    this.glow = 0,
  });

  static const rest = OwlPose();

  /// Where the pupils look.
  final Offset gaze;

  /// Head turned on the neck, in radians, clockwise.
  final double tilt;

  /// How far the lids are down.
  final double lids;

  /// How far the eyes are squeezed into a smile.
  final double joy;

  /// Height off the ground.
  final double lift;

  /// Pressed flat (positive) or stretched tall (negative), feet in place.
  final double squash;

  /// Wings raised off the body.
  final double flap;

  /// How many of the three rules on the chest are written.
  final double written;

  /// How much the rules glow amber, like fresh ink.
  final double glow;

  static OwlPose lerp(OwlPose a, OwlPose b, double t) => t <= 0
      ? a
      : t >= 1
      ? b
      : OwlPose(
          gaze: Offset.lerp(a.gaze, b.gaze, t)!,
          tilt: lerpDouble(a.tilt, b.tilt, t)!,
          lids: lerpDouble(a.lids, b.lids, t)!,
          joy: lerpDouble(a.joy, b.joy, t)!,
          lift: lerpDouble(a.lift, b.lift, t)!,
          squash: lerpDouble(a.squash, b.squash, t)!,
          flap: lerpDouble(a.flap, b.flap, t)!,
          written: lerpDouble(a.written, b.written, t)!,
          glow: lerpDouble(a.glow, b.glow, t)!,
        );

  @override
  bool operator ==(Object other) =>
      other is OwlPose &&
      other.gaze == gaze &&
      other.tilt == tilt &&
      other.lids == lids &&
      other.joy == joy &&
      other.lift == lift &&
      other.squash == squash &&
      other.flap == flap &&
      other.written == written &&
      other.glow == glow;

  @override
  int get hashCode =>
      Object.hash(gaze, tilt, lids, joy, lift, squash, flap, written, glow);
}

class OwlPalette {
  const OwlPalette({
    required this.body,
    required this.mask,
    required this.rule,
    required this.amber,
    required this.pupil,
    this.rim,
    this.rimWidth = 7,
  });

  final Color body;
  final Color mask;
  final Color rule;
  final Color amber;
  final Color pupil;

  /// Outline drawn just outside the body, for dark surfaces.
  final Color? rim;
  final double rimWidth;

  static const onLight = OwlPalette(
    body: Color(0xff1e2230),
    mask: Color(0xff2d3345),
    rule: Color(0xff434b66),
    amber: Color(0xfff2b33d),
    pupil: Color(0xff12141b),
  );

  static const onDark = OwlPalette(
    body: Color(0xff1e2230),
    mask: Color(0xff2d3345),
    rule: Color(0xff434b66),
    amber: Color(0xfff5bd4f),
    pupil: Color(0xff12141b),
    rim: Color(0xff4a5170),
  );

  /// Outdoors at night: the moon is behind the owl, so a thin, dark rim is
  /// enough to keep it off the hills.
  static const onNight = OwlPalette(
    body: Color(0xff1e2230),
    mask: Color(0xff2d3345),
    rule: Color(0xff434b66),
    amber: Color(0xfff2b33d),
    pupil: Color(0xff12141b),
    rim: Color(0xff3b4470),
    rimWidth: 4,
  );
}

/// Paints the owl in a 200 × 200 design grid scaled to the canvas.
class OwlPainter extends CustomPainter {
  const OwlPainter(this.variant, {this.pose = OwlPose.rest});

  final OwlVariant variant;
  final OwlPose pose;

  /// Narrow at the head, full at the belly, with rounded ear tufts.
  static Path _body() => Path()
    ..moveTo(100, 188)
    ..cubicTo(64, 188, 40, 168, 40, 134)
    ..cubicTo(40, 106, 44, 86, 50, 70)
    ..cubicTo(52, 56, 53, 42, 56, 31)
    ..quadraticBezierTo(58, 26, 63, 29)
    ..cubicTo(71, 36, 79, 45, 88, 49)
    ..quadraticBezierTo(100, 45, 112, 49)
    ..cubicTo(121, 45, 129, 36, 137, 29)
    ..quadraticBezierTo(142, 26, 144, 31)
    ..cubicTo(147, 42, 148, 56, 150, 70)
    ..cubicTo(156, 86, 160, 106, 160, 134)
    ..cubicTo(160, 168, 136, 188, 100, 188)
    ..close();

  /// A folded wing along one side, clipped to the body when painted.
  static Path _wing({required bool left}) {
    double x(double value) => left ? value : 200 - value;
    return Path()
      ..moveTo(x(34), 114)
      ..cubicTo(x(56), 120, x(66), 142, x(64), 184)
      ..lineTo(x(28), 192)
      ..close();
  }

  /// A shallow brow that settles over the eyes like lids: calm and attentive.
  static Path _brow() => Path()
    ..moveTo(30, 30)
    ..lineTo(30, 78)
    ..cubicTo(58, 75, 86, 80, 100, 89)
    ..cubicTo(114, 80, 142, 75, 170, 78)
    ..lineTo(170, 30)
    ..close();

  static Path _beak() => Path()
    ..moveTo(91, 120)
    ..quadraticBezierTo(100, 116, 109, 120)
    ..quadraticBezierTo(107, 129, 100, 137)
    ..quadraticBezierTo(93, 129, 91, 120)
    ..close();

  /// The feet grip the perch in front of the belly.
  static Path _feet() {
    final path = Path();
    for (final x in [80.0, 120.0]) {
      path.addRRect(
        RRect.fromRectAndRadius(
          Rect.fromCenter(center: Offset(x, 184), width: 18, height: 10),
          const Radius.circular(5),
        ),
      );
    }
    return path;
  }

  static const _rules = [(150.0, 25.0), (161.0, 25.0), (172.0, 15.0)];

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 200, size.height / 200);
    if (variant == OwlVariant.monochrome) {
      _paintMonochrome(canvas);
    } else {
      _paintColour(canvas, switch (variant) {
        OwlVariant.onDark => OwlPalette.onDark,
        OwlVariant.onNight => OwlPalette.onNight,
        _ => OwlPalette.onLight,
      });
    }
    canvas.restore();
  }

  /// The neck: the body is as wide as a circle here, so the head can turn on
  /// it without a dent in the outline.
  static const _neck = Offset(100, 100);
  static const _ground = 188.0;

  static final Path _head = Path.combine(
    PathOperation.union,
    Path.combine(
      PathOperation.intersect,
      _body(),
      Path()..addRect(const Rect.fromLTRB(0, 0, 200, 100)),
    ),
    Path()..addOval(Rect.fromCircle(center: _neck, radius: 58)),
  );

  static final Path _torso = Path.combine(
    PathOperation.union,
    Path.combine(
      PathOperation.intersect,
      _body(),
      Path()..addRect(const Rect.fromLTRB(0, 100, 200, 200)),
    ),
    Path()..addOval(Rect.fromCircle(center: _neck, radius: 56)),
  );

  /// A wing held away from the body, hanging from the shoulder at the origin.
  static Path _raisedWing({required bool left}) {
    double x(double value) => left ? value : -value;
    return Path()
      ..moveTo(x(-5), -12)
      ..cubicTo(x(-19), 6, x(-21), 34, x(-8), 58)
      ..quadraticBezierTo(x(-3), 64, x(2), 58)
      ..cubicTo(x(16), 38, x(20), 8, x(14), -8)
      ..close();
  }

  static Path _turn(Path path, Offset about, double angle) => path.transform(
    (Matrix4.translationValues(about.dx, about.dy, 0)
          ..rotateZ(angle)
          ..translateByDouble(-about.dx, -about.dy, 0, 1))
        .storage,
  );

  void _paintColour(Canvas canvas, OwlPalette palette) {
    Paint fill(Color color) => Paint()
      ..color = color
      ..isAntiAlias = true;
    if (pose.lift != 0 || pose.squash != 0) {
      canvas.translate(100, _ground - pose.lift);
      canvas.scale(1 + pose.squash * .7, 1 - pose.squash);
      canvas.translate(-100, -_ground);
    }

    final body = _body();
    final head = pose.tilt == 0 ? null : _turn(_head, _neck, pose.tilt);
    final outline = [
      if (head == null) body else ...[_torso, head],
    ];
    final wings = [
      if (pose.flap > 0)
        for (final left in [true, false])
          _turn(
            _raisedWing(left: left).shift(Offset(left ? 56 : 144, 116)),
            Offset(left ? 56 : 144, 116),
            (left ? 1 : -1) * pose.flap,
          ),
    ];
    if (palette.rim case final rim?) {
      final stroke = fill(rim)
        ..style = PaintingStyle.stroke
        ..strokeWidth = palette.rimWidth
        ..strokeJoin = StrokeJoin.round;
      for (final path in [...wings, ...outline]) {
        canvas.drawPath(path, stroke);
      }
    }
    for (final path in wings) {
      canvas.drawPath(path, fill(palette.mask));
    }
    for (final path in outline) {
      canvas.drawPath(path, fill(palette.body));
    }
    canvas.save();
    canvas.clipPath(body);
    canvas.drawPath(_wing(left: true), fill(palette.mask));
    canvas.drawPath(_wing(left: false), fill(palette.mask));
    if (head != null) {
      canvas.restore();
      canvas.save();
      _turnHead(canvas);
      canvas.clipPath(_head);
    }
    canvas.drawCircle(const Offset(74, 98), 31, fill(palette.mask));
    canvas.drawCircle(const Offset(126, 98), 31, fill(palette.mask));
    final open = pose.lids <= 0 && pose.joy <= 0;
    for (final (eye, pupil) in _eyes) {
      canvas.drawCircle(eye, _eyeRadius, fill(palette.amber));
      if (open) continue;
      canvas.drawCircle(pupil + pose.gaze, 8.5, fill(palette.pupil));
      _paintLids(canvas, palette, eye);
    }
    canvas.drawPath(_brow(), fill(palette.body));
    canvas.restore();
    canvas.save();
    _turnHead(canvas);
    if (open) {
      for (final (_, pupil) in _eyes) {
        canvas.drawCircle(pupil + pose.gaze, 8.5, fill(palette.pupil));
      }
    }
    canvas.drawPath(_beak(), fill(palette.amber));
    canvas.restore();

    final rule = Paint()
      ..color = Color.lerp(palette.rule, palette.amber, pose.glow)!
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round;
    for (final (index, (y, half)) in _rules.indexed) {
      final length = (pose.written - index).clamp(0.0, 1.0) * half * 2;
      if (length <= 0) continue;
      canvas.drawLine(
        Offset(100 - half, y),
        Offset(100 - half + length, y),
        rule,
      );
    }
    canvas.drawPath(_feet(), fill(palette.amber));
  }

  void _turnHead(Canvas canvas) {
    if (pose.tilt == 0) return;
    canvas.translate(_neck.dx, _neck.dy);
    canvas.rotate(pose.tilt);
    canvas.translate(-_neck.dx, -_neck.dy);
  }

  /// Centre of each eye and of its pupil.
  static const _eyes = [
    (Offset(74, 99), Offset(78, 103)),
    (Offset(126, 99), Offset(122, 103)),
  ];
  static const _eyeRadius = 21.0;

  /// An eye going under its lid, or squeezed from below into a smile.
  void _paintLids(Canvas canvas, OwlPalette palette, Offset eye) {
    Paint fill(Color color) => Paint()
      ..color = color
      ..isAntiAlias = true;
    canvas.save();
    canvas.clipPath(
      Path()..addOval(Rect.fromCircle(center: eye, radius: _eyeRadius + 1)),
    );
    if (pose.lids > 0) {
      // The lid's edge bows down a little, like the brow above it.
      final edge = eye.dy - _eyeRadius + (2 * _eyeRadius + 6) * pose.lids;
      canvas.drawPath(
        Path()
          ..moveTo(eye.dx - 24, eye.dy - 30)
          ..lineTo(eye.dx + 24, eye.dy - 30)
          ..lineTo(eye.dx + 24, edge - 5)
          ..quadraticBezierTo(eye.dx, edge + 5, eye.dx - 24, edge - 5)
          ..close(),
        fill(palette.mask),
      );
    }
    if (pose.joy > 0) {
      canvas.drawCircle(
        eye + Offset(0, 46 - 34 * math.min(pose.joy, 1)),
        22,
        fill(palette.mask),
      );
    }
    canvas.restore();
    if (pose.lids > .6) {
      // Where the lids meet.
      canvas.drawPath(
        Path()
          ..moveTo(eye.dx - 15, eye.dy + 4)
          ..quadraticBezierTo(eye.dx, eye.dy + 14, eye.dx + 15, eye.dy + 4),
        fill(palette.amber.withValues(alpha: (pose.lids - .6) / .4))
          ..style = PaintingStyle.stroke
          ..strokeWidth = 5
          ..strokeCap = StrokeCap.round,
      );
    }
  }

  /// Single-colour silhouette with the eyes, beak and rules cut out, for
  /// Android themed icons.
  void _paintMonochrome(Canvas canvas) {
    final ink = Paint()..color = Colors.white;
    final shape = Path.combine(PathOperation.union, _body(), _feet());
    final eyes = Path.combine(
      PathOperation.difference,
      Path()
        ..addOval(Rect.fromCircle(center: const Offset(74, 99), radius: 21))
        ..addOval(Rect.fromCircle(center: const Offset(126, 99), radius: 21)),
      _brow(),
    );
    final cutouts = Path()
      ..addPath(eyes, Offset.zero)
      ..addPath(_beak(), Offset.zero);
    for (final (y, half) in _rules) {
      cutouts.addRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTRB(100 - half - 2.5, y - 2.5, 100 + half + 2.5, y + 2.5),
          const Radius.circular(2.5),
        ),
      );
    }
    canvas.drawPath(
      Path.combine(PathOperation.difference, shape, cutouts),
      ink,
    );
    // Pupils sit inside the cut-out eyes.
    canvas.drawCircle(const Offset(78, 103), 8.5, ink);
    canvas.drawCircle(const Offset(122, 103), 8.5, ink);
  }

  @override
  bool shouldRepaint(covariant OwlPainter oldDelegate) =>
      oldDelegate.variant != variant || oldDelegate.pose != pose;
}
