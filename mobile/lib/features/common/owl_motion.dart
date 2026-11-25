import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/l10n.dart';
import '../../core/theme.dart';
import 'brand_mark.dart';

/// What the owl does while something loads: it looks down, writes the three
/// rules on its chest, blinks, and hops.
abstract final class OwlMotion {
  static const period = Duration(milliseconds: 2600);

  /// The pose at [t], a fraction of one round.
  static OwlPose at(double t) {
    final hop = _between(t, .68, .86);
    final lift = hop > 0 && hop < 1 ? 4 * hop * (1 - hop) : 0.0;
    final line = _between(t, .10, .46) * 3;
    final writing = _bump(t, .04, .10, .46, .52);
    // The eyes follow the pen along each line and jump back to the next.
    final pen = line >= 3 ? 1.0 : line - line.floorToDouble();
    return OwlPose(
      gaze: Offset.lerp(
        const Offset(0, 1),
        Offset(4 - 8 * (1 - pen), 5),
        writing,
      )!,
      tilt:
          -.13 * writing +
          .02 * writing * math.sin(line * math.pi) +
          .10 * _bump(t, .54, .60, .62, .68),
      lids: _bump(t, .515, .535, .545, .575),
      joy: _bump(t, .66, .71, .87, .93),
      lift: 26 * lift,
      squash:
          .11 * _bump(t, .60, .655, .66, .69) -
          .05 * _bump(t, .68, .72, .80, .85) +
          .10 * _bump(t, .85, .875, .88, .93) -
          .025 * _bump(t, .92, .95, .95, .99),
      flap: .72 * lift * (.72 + .28 * math.cos(hop * math.pi * 5)),
      written: t < .5 ? line : 3 * (1 - _ease(_between(t, .90, .99))),
      glow: 1,
    );
  }

  static double _between(double t, double start, double end) =>
      ((t - start) / (end - start)).clamp(0.0, 1.0);

  static double _ease(double t) => Curves.easeInOut.transform(t);

  /// Rises from [a] to [b], holds, falls from [c] to [d].
  static double _bump(double t, double a, double b, double c, double d) =>
      _ease(_between(t, a, b)) * (1 - _ease(_between(t, c, d)));
}

/// The owl, moving while [busy] and easing back to its resting pose after.
class LivelyOwl extends StatefulWidget {
  const LivelyOwl({
    super.key,
    required this.size,
    this.variant,
    this.gaze = Offset.zero,
    this.busy = true,
    this.shadow = false,
  });

  final double size;
  final OwlVariant? variant;

  /// Where the owl looks at rest.
  final Offset gaze;
  final bool busy;

  /// A shadow on the ground, where nothing else shows the owl leaving it.
  final bool shadow;

  @override
  State<LivelyOwl> createState() => _LivelyOwlState();
}

class _LivelyOwlState extends State<LivelyOwl> with TickerProviderStateMixin {
  late final _round = AnimationController(
    vsync: this,
    duration: OwlMotion.period,
  );

  /// How much of the motion shows. The first moments show none, so a load
  /// that is over at once does not make the owl twitch.
  late final _share = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 420),
    reverseDuration: const Duration(milliseconds: 280),
  );
  late final _shown = CurvedAnimation(
    parent: _share,
    curve: const Interval(.3, 1, curve: Curves.easeInOut),
    reverseCurve: Curves.easeInOut,
  );

  bool _still = false;

  @override
  void initState() {
    super.initState();
    _share.addStatusListener((status) {
      if (status.isDismissed) _round.stop();
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _still = MediaQuery.disableAnimationsOf(context);
    _follow();
  }

  @override
  void didUpdateWidget(LivelyOwl oldWidget) {
    super.didUpdateWidget(oldWidget);
    _follow();
  }

  void _follow() {
    if (_still) {
      _round.stop();
      _share.value = 0;
    } else if (widget.busy) {
      if (!_round.isAnimating) _round.repeat();
      _share.forward();
    } else {
      _share.reverse();
    }
  }

  @override
  void dispose() {
    _shown.dispose();
    _share.dispose();
    _round.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => RepaintBoundary(
    child: AnimatedBuilder(
      animation: Listenable.merge([_round, _shown]),
      builder: (context, _) {
        final pose = OwlPose.lerp(
          OwlPose(gaze: widget.gaze),
          OwlMotion.at(_round.value),
          _shown.value,
        );
        final owl = OwlMark(
          size: widget.size,
          variant: widget.variant,
          pose: pose,
        );
        if (!widget.shadow) return owl;
        return CustomPaint(
          painter: _ShadowPainter(context.ze.track, pose.lift),
          child: owl,
        );
      },
    ),
  );
}

class _ShadowPainter extends CustomPainter {
  const _ShadowPainter(this.color, this.lift);

  final Color color;
  final double lift;

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / 200;
    final shrink = 1 - lift / 70;
    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(size.width / 2, 189 * scale),
        width: 128 * scale * shrink,
        height: 14 * scale * shrink,
      ),
      Paint()..color = color,
    );
  }

  @override
  bool shouldRepaint(_ShadowPainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.lift != lift;
}

/// Loading, on a page with no owl of its own.
class OwlLoading extends StatelessWidget {
  const OwlLoading({super.key, this.size = 96})
    : caption = true,
      delayed = true;

  /// For a corner of a page: the owl alone.
  const OwlLoading.small({super.key, this.size = 48})
    : caption = false,
      delayed = true;

  /// The app starting: there at once, as there is nothing else to see.
  const OwlLoading.splash({super.key, this.size = 132})
    : caption = false,
      delayed = false;

  final double size;
  final bool caption;
  final bool delayed;

  @override
  Widget build(BuildContext context) {
    final owl = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ExcludeSemantics(child: LivelyOwl(size: size, shadow: true)),
        if (caption) ...[const SizedBox(height: 10), const LoadingCaption()],
      ],
    );
    return Center(
      child: Semantics(
        label: caption ? null : tr('Loading', '正在加载'),
        child: delayed ? _Appear(child: owl) : owl,
      ),
    );
  }
}

/// The words for loading, alone where the page's own owl does the moving.
class LoadingCaption extends StatelessWidget {
  const LoadingCaption({super.key});

  @override
  Widget build(BuildContext context) => Semantics(
    label: tr('Loading', '正在加载'),
    excludeSemantics: true,
    child: Text(
      tr('Just a moment…', '马上就好…'),
      textAlign: TextAlign.center,
      style: Theme.of(context).textTheme.bodySmall,
    ),
  );
}

/// The body of a page whose header has the owl.
class PageLoading extends StatelessWidget {
  const PageLoading({super.key});

  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.only(top: 56, bottom: 24),
    child: Align(
      alignment: Alignment.topCenter,
      child: _Appear(child: LoadingCaption()),
    ),
  );
}

/// Fades in after a moment, so what loads at once never shows it.
class _Appear extends StatelessWidget {
  const _Appear({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
    tween: Tween(begin: 0, end: 1),
    duration: const Duration(milliseconds: 420),
    curve: const Interval(.4, 1),
    builder: (context, opacity, child) =>
        Opacity(opacity: opacity, child: child),
    child: child,
  );
}
