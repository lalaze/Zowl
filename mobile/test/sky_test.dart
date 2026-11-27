import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zowl_mobile/core/l10n.dart';
import 'package:zowl_mobile/core/theme.dart';
import 'package:zowl_mobile/features/common/brand_mark.dart';
import 'package:zowl_mobile/features/common/category_visuals.dart';
import 'package:zowl_mobile/features/common/sky.dart';
import 'package:zowl_mobile/main.dart';

import 'support/test_harness.dart';
import 'package:zowl_mobile/core/day_time.dart';

DateTime _at(int hour) => DateTime(2026, 11, 12, hour);

double _contrast(Color a, Color b) {
  final x = a.computeLuminance();
  final y = b.computeLuminance();
  return x > y ? (x + .05) / (y + .05) : (y + .05) / (x + .05);
}

void main() {
  test('the sky follows the hour', () {
    expect(sceneTimeFor(_at(4)), SceneTime.night);
    expect(sceneTimeFor(_at(5)), SceneTime.dawn);
    expect(sceneTimeFor(_at(7)), SceneTime.dawn);
    expect(sceneTimeFor(_at(8)), SceneTime.day);
    expect(sceneTimeFor(_at(16)), SceneTime.day);
    expect(sceneTimeFor(_at(17)), SceneTime.dusk);
    expect(sceneTimeFor(_at(18)), SceneTime.dusk);
    expect(sceneTimeFor(_at(19)), SceneTime.night);
    expect(sceneTimeFor(_at(23)), SceneTime.night);
  });

  test('the greeting follows the hour', () {
    expect(greetingFor(_at(5)), 'Good morning');
    expect(greetingFor(_at(11)), 'Good morning');
    expect(greetingFor(_at(12)), 'Good afternoon');
    expect(greetingFor(_at(17)), 'Good afternoon');
    expect(greetingFor(_at(18)), 'Good evening');
    expect(greetingFor(_at(2)), 'Good evening');
  });

  test('the greeting follows the language', () {
    applyLanguage(AppLanguage.zh);
    addTearDown(() => applyLanguage(AppLanguage.en));
    expect(greetingFor(_at(7)), '早上好');
    expect(greetingFor(_at(14)), '下午好');
    expect(greetingFor(_at(21)), '晚上好');
  });

  test('tests run against a pinned evening clock', () {
    expect(storyNow(), _at(21));
  });

  test('the next change of sky is the next boundary, across midnight', () {
    DateTime at(int hour, int minute) => DateTime(2026, 11, 12, hour, minute);
    expect(nextSceneChange(at(4, 59)), at(5, 0));
    expect(nextSceneChange(at(5, 0)), at(8, 0));
    expect(nextSceneChange(at(16, 30)), at(17, 0));
    expect(nextSceneChange(at(18, 0)), at(19, 0));
    expect(nextSceneChange(at(19, 0)), DateTime(2026, 11, 13, 5));
    expect(nextSceneChange(at(23, 59)), DateTime(2026, 11, 13, 5));
  });

  test('every hour has its own sky, and night is shared by both themes', () {
    final palettes = {
      for (final dark in [false, true])
        for (final time in SceneTime.values)
          SkyPalette.forTime(time, dark: dark),
    };
    expect(palettes, hasLength(7));
    for (final palette in palettes) {
      for (final sky in palette.sky.take(2)) {
        expect(
          _contrast(palette.foreground, sky),
          greaterThan(4.5),
          reason: '$sky',
        );
        expect(_contrast(palette.muted, sky), greaterThan(4.5), reason: '$sky');
      }
    }
  });

  test('paper follows the hour in light mode only', () {
    Set<Color> papers(Brightness brightness) => {
      for (final time in SceneTime.values)
        ZeTokens.of(AccentColor.amber, brightness, time: time).canvas,
    };
    expect(papers(Brightness.light), hasLength(4));
    expect(papers(Brightness.dark), hasLength(1));
    for (final time in SceneTime.values) {
      final t = ZeTokens.of(AccentColor.amber, Brightness.light, time: time);
      for (final surface in [t.canvas, t.well]) {
        expect(_contrast(t.ink, surface), greaterThan(7));
        expect(_contrast(t.sub, surface), greaterThan(4.5), reason: time.name);
      }
    }
  });

  test('category colours carry a white icon, whatever the user picked', () {
    for (var hue = 0; hue < 360; hue += 5) {
      for (final lightness in [.2, .5, .9]) {
        final picked = HSLColor.fromAHSL(1, hue * 1.0, 1, lightness).toColor();
        expect(
          _contrast(landscapeTone(picked), Colors.white),
          greaterThanOrEqualTo(3),
          reason: 'hue $hue',
        );
      }
    }
  });

  testWidgets('the sky changes by itself when its hour comes', (tester) async {
    var now = DateTime(2026, 11, 12, 16, 59);
    final pinned = debugStoryClock;
    debugStoryClock = () => now;
    addTearDown(() => debugStoryClock = pinned);
    final harness = await MobileTestHarness.create(token: null);
    await tester.pumpWidget(
      ProviderScope(
        overrides: harness.overrides,
        retry: (_, _) => null,
        child: const ZowlApp(),
      ),
    );
    await tester.pumpAndSettle();
    SceneTime shown() => tester.element(find.byType(Scaffold).first).ze.time;
    expect(shown(), SceneTime.day);

    now = DateTime(2026, 11, 12, 17);
    await tester.pump(const Duration(minutes: 1));
    await tester.pumpAndSettle();
    expect(shown(), SceneTime.dusk);

    // Asleep through the evening: the timer did not run, resuming catches up.
    now = DateTime(2026, 11, 12, 22);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(shown(), SceneTime.night);
  });

  testWidgets(
    'resuming in the same hour keeps the exact ThemeData, and a new hour replaces it',
    (tester) async {
      var now = DateTime(2026, 11, 12, 10, 0);
      final pinned = debugStoryClock;
      debugStoryClock = () => now;
      addTearDown(() => debugStoryClock = pinned);
      final harness = await MobileTestHarness.create(token: null);
      await tester.pumpWidget(
        ProviderScope(
          overrides: harness.overrides,
          retry: (_, _) => null,
          child: const ZowlApp(),
        ),
      );
      await tester.pumpAndSettle();

      ThemeData currentTheme() =>
          Theme.of(tester.element(find.byType(Scaffold).first));

      final before = currentTheme();
      expect(before.extension<ZeTokens>()!.time, SceneTime.day);

      // Resume within the same hour bucket: no new ThemeData or lerp.
      now = DateTime(2026, 11, 12, 10, 30);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump();
      expect(identical(currentTheme(), before), isTrue);
      await tester.pumpAndSettle();
      expect(identical(currentTheme(), before), isTrue);

      // Resume after crossing into dusk: ThemeData updates to the new bucket.
      now = DateTime(2026, 11, 12, 17, 15);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      final after = currentTheme();
      expect(identical(after, before), isFalse);
      expect(after.extension<ZeTokens>()!.time, SceneTime.dusk);
    },
  );

  testWidgets('the owl stays ink-black, with a rim only where it is dark', (
    tester,
  ) async {
    Future<OwlVariant> owl(SceneTime time, Brightness brightness) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: buildTheme(AccentColor.amber, brightness, time: time),
          home: const Scaffold(body: SkyOwl(size: 80)),
        ),
      );
      await tester.pumpAndSettle();
      final paint = tester.widget<CustomPaint>(
        find.descendant(
          of: find.byType(OwlMark),
          matching: find.byType(CustomPaint),
        ),
      );
      return (paint.painter! as OwlPainter).variant;
    }

    expect(await owl(SceneTime.day, Brightness.light), OwlVariant.onLight);
    expect(await owl(SceneTime.dusk, Brightness.light), OwlVariant.onLight);
    expect(await owl(SceneTime.night, Brightness.light), OwlVariant.onNight);
    expect(await owl(SceneTime.day, Brightness.dark), OwlVariant.onNight);
  });

  testWidgets('dark mode keeps the hour with a darker sky', (tester) async {
    Widget scene(SceneTime time, Brightness brightness) => Theme(
      data: buildTheme(AccentColor.amber, brightness, time: time),
      child: Builder(
        builder: (context) => Material(
          color: context.ze.canvas,
          clipBehavior: Clip.hardEdge,
          child: const SingleChildScrollView(
            physics: NeverScrollableScrollPhysics(),
            child: Column(
              children: [
                SkyBar(layout: SkyLayout.page, title: SkyTitle('Hi')),
                SkyHeader(
                  layout: SkyLayout.page,
                  child: SkyAmount('¥6,612.00', size: 34),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    await tester.binding.setSurfaceSize(const Size(720, 880));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      MaterialApp(
        debugShowCheckedModeBanner: false,
        home: RepaintBoundary(
          child: Row(
            children: [
              for (final brightness in Brightness.values)
                Expanded(
                  child: Column(
                    children: [
                      for (final time in SceneTime.values)
                        Expanded(child: scene(time, brightness)),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
    await expectLater(
      find.byType(RepaintBoundary).first,
      matchesGoldenFile('goldens/story_scenes.png'),
    );
  });

  testWidgets('amounts of any size and currency stay on one line', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(360, 400));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    for (final text in ['¥0.00', '-¥123,456,789.00', 'JPY 1,200', '—']) {
      await tester.pumpWidget(
        MaterialApp(
          theme: buildTheme(AccentColor.amber, Brightness.light),
          home: Scaffold(body: SkyAmount(text)),
        ),
      );
      expect(find.text(text, findRichText: true), findsOneWidget);
      expect(tester.takeException(), isNull, reason: text);
    }
  });
}
