import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zemoney_mobile/core/l10n.dart';
import 'package:zemoney_mobile/core/theme.dart';
import 'package:zemoney_mobile/features/auth/splash_screen.dart';
import 'package:zemoney_mobile/features/common/brand_mark.dart';
import 'package:zemoney_mobile/features/common/owl_motion.dart';

const _rest = OwlPose(gaze: Offset(-2, 0));

Widget _app(Widget child, {bool still = false}) => MaterialApp(
  theme: buildTheme(AccentColor.amber, Brightness.light),
  home: MediaQuery(
    data: MediaQueryData(disableAnimations: still),
    child: Scaffold(body: child),
  ),
);

Widget _owl({required bool busy, bool still = false}) => _app(
  LivelyOwl(size: 80, gaze: _rest.gaze, busy: busy),
  still: still,
);

OwlPose _pose(WidgetTester tester) =>
    tester.widget<OwlMark>(find.byType(OwlMark)).pose;

void main() {
  tearDown(() => applyLanguage(AppLanguage.en));

  test('a round ends where it starts, with the owl back on its feet', () {
    final start = OwlMotion.at(0);
    final end = OwlMotion.at(1);
    expect(end, start);
    expect(start.lift, 0);
    expect(start.lids, 0);
    expect(start.written, 0);
  });

  test('a round writes three rules in order, then hops and wipes them', () {
    final written = [
      for (var t = .10; t <= .46; t += .01) OwlMotion.at(t).written,
    ];
    expect(written.first, closeTo(0, .01));
    expect(written.last, closeTo(3, .1));
    for (var i = 1; i < written.length; i++) {
      expect(written[i], greaterThan(written[i - 1]));
    }
    for (var t = 0.0; t <= .67; t += .01) {
      expect(OwlMotion.at(t).lift, 0, reason: 'on the ground at $t');
    }
    final top = OwlMotion.at(.77);
    expect(top.lift, closeTo(26, .5));
    expect(top.joy, 1);
    expect(top.written, 3);
    expect(OwlMotion.at(.87).lift, 0);
    expect(OwlMotion.at(.995).written, closeTo(0, .01));
  });

  test('the motion has no jumps', () {
    var last = OwlMotion.at(0);
    // One frame at 60 Hz.
    const step = 1 / (2.6 * 60);
    for (var t = step; t <= 1; t += step) {
      final pose = OwlMotion.at(t);
      expect((pose.lift - last.lift).abs(), lessThan(5), reason: 'lift at $t');
      expect((pose.squash - last.squash).abs(), lessThan(.07));
      expect((pose.tilt - last.tilt).abs(), lessThan(.06));
      last = pose;
    }
  });

  testWidgets('the owl moves while busy and settles at rest after', (
    tester,
  ) async {
    await tester.pumpWidget(_owl(busy: false));
    await tester.pumpAndSettle();
    expect(_pose(tester), _rest);

    await tester.pumpWidget(_owl(busy: true));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 900));
    expect(_pose(tester), isNot(_rest));
    expect(_pose(tester).written, lessThan(3));

    await tester.pumpWidget(_owl(busy: false));
    await tester.pumpAndSettle();
    expect(_pose(tester), _rest);

    // And starts again for the next load.
    await tester.pumpWidget(_owl(busy: true));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 900));
    expect(_pose(tester), isNot(_rest));
  });

  testWidgets('a load that is over at once never moves the owl', (
    tester,
  ) async {
    await tester.pumpWidget(_owl(busy: true));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(_pose(tester), _rest);
    await tester.pumpWidget(_owl(busy: false));
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 16));
      expect(_pose(tester), _rest);
    }
  });

  testWidgets('the owl holds still when animations are off', (tester) async {
    await tester.pumpWidget(_owl(busy: true, still: true));
    await tester.pumpAndSettle();
    expect(_pose(tester), _rest);

    // Turning them off mid-round stops it there and then.
    await tester.pumpWidget(_owl(busy: true));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 900));
    expect(_pose(tester), isNot(_rest));
    await tester.pumpWidget(_owl(busy: true, still: true));
    await tester.pumpAndSettle();
    expect(_pose(tester), _rest);
  });

  testWidgets('loading is put in words, and only once', (tester) async {
    final semantics = tester.ensureSemantics();
    for (final (widget, caption) in const [
      (OwlLoading(), true),
      (OwlLoading.small(), false),
      (PageLoading(), true),
    ]) {
      await tester.pumpWidget(_app(widget));
      await tester.pump(const Duration(milliseconds: 500));
      expect(find.bySemanticsLabel('Loading'), findsOneWidget);
      expect(
        find.text('Just a moment…'),
        caption ? findsOneWidget : findsNothing,
      );
      await tester.pumpWidget(const SizedBox());
    }
    applyLanguage(AppLanguage.zh);
    await tester.pumpWidget(_app(const OwlLoading()));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('马上就好…'), findsOneWidget);
    expect(find.bySemanticsLabel('正在加载'), findsOneWidget);
    semantics.dispose();
  });

  testWidgets('loading fades in after a moment, the splash is there at once', (
    tester,
  ) async {
    await tester.pumpWidget(_app(const OwlLoading()));
    await tester.pump(const Duration(milliseconds: 100));
    expect(tester.widget<Opacity>(find.byType(Opacity)).opacity, 0);
    await tester.pump(const Duration(milliseconds: 400));
    expect(tester.widget<Opacity>(find.byType(Opacity)).opacity, 1);

    await tester.pumpWidget(_app(const SplashScreen()));
    await tester.pump();
    expect(find.byType(Opacity), findsNothing);
    expect(find.byType(LivelyOwl), findsOneWidget);
  });

  testWidgets('the owl keeps its shape through a round', (tester) async {
    const times = [0.0, .16, .30, .44, .54, .60, .66, .70, .77, .84, .88, .92];
    await tester.binding.setSurfaceSize(const Size(480, 320));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    Widget row(Color color, OwlVariant variant) => ColoredBox(
      color: color,
      child: Wrap(
        children: [
          for (final t in times)
            OwlMark(size: 80, variant: variant, pose: OwlMotion.at(t)),
        ],
      ),
    );
    await tester.pumpWidget(
      MaterialApp(
        debugShowCheckedModeBanner: false,
        home: Column(
          children: [
            row(const Color(0xfff6f1e7), OwlVariant.onLight),
            row(const Color(0xff16181f), OwlVariant.onDark),
          ],
        ),
      ),
    );
    await expectLater(
      find.byType(Column),
      matchesGoldenFile('goldens/owl_motion.png'),
    );
  });
}
