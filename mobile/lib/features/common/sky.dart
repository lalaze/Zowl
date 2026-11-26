import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/day_time.dart';
import '../../core/theme.dart';
import 'brand_mark.dart';
import 'owl_motion.dart';

part 'sky_scene.dart';
part 'sky_painter.dart';
part 'sky_bar.dart';
part 'sky_header.dart';
part 'sky_text.dart';

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
