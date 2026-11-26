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
