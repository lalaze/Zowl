part of 'sky.dart';

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
