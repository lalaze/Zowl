// Renders the launcher icon sources in assets/brand/ from OwlMark, so the app
// icon always matches the in-app mascot. Run after changing brand_mark.dart:
//
//   flutter test tool/brand/export_icons_test.dart
//   dart run flutter_launcher_icons
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zemoney_mobile/features/common/brand_mark.dart';

const paper = Color(0xfff1ece3);

Future<void> _export(WidgetTester tester, Widget child, String path) async {
  final key = GlobalKey();
  await tester.pumpWidget(
    Directionality(
      textDirection: TextDirection.ltr,
      child: Center(
        child: RepaintBoundary(
          key: key,
          child: SizedBox.square(dimension: 1024, child: child),
        ),
      ),
    ),
  );
  await tester.pump();
  final boundary = key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
  await tester.runAsync(() async {
    final image = await boundary.toImage(pixelRatio: 1);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    File(path).writeAsBytesSync(bytes!.buffer.asUint8List());
  });
}

/// The owl's drawing is taller than it is wide and sits slightly low in its
/// 200-unit grid, so nudge it up to look centred.
Widget _owl(double mark, OwlVariant variant) => Transform.translate(
  offset: Offset(0, -mark * 8.5 / 200),
  child: Center(child: OwlMark(size: mark, variant: variant)),
);

void main() {
  testWidgets('export launcher icon sources', (tester) async {
    tester.view.physicalSize = const Size(1200, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final out = Platform.environment['ICON_OUT'] ?? 'assets/brand';
    Directory(out).createSync(recursive: true);

    // Full-bleed icon for iOS and legacy Android launchers.
    await _export(tester, ColoredBox(color: paper, child: _owl(780, OwlVariant.onLight)), '$out/zemoney-owl-icon.png');
    // Adaptive layers: flutter_launcher_icons insets them by 16% per side, which
    // already lands them in the launcher's safe zone, so the owl fills the canvas.
    await _export(tester, _owl(880, OwlVariant.onLight), '$out/zemoney-owl-foreground.png');
    // Android 13+ themed icon: the system tints this silhouette.
    await _export(tester, _owl(880, OwlVariant.monochrome), '$out/zemoney-owl-monochrome.png');
  });
}
