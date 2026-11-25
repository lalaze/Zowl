import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:zemoney_mobile/core/theme.dart';

Future<AppAppearance> _read(Map<String, Object> values) async {
  SharedPreferences.setMockInitialValues(values);
  return readAppearance(await SharedPreferences.getInstance());
}

void main() {
  test('loads persisted theme and accent independently', () async {
    final appearance = await _read({
      'zemoney-theme': 'dark',
      'zemoney-accent': 'forest',
    });
    expect(appearance.mode, ThemeMode.dark);
    expect(appearance.accent, AccentColor.forest);
  });

  test('falls back to system mode and the amber accent', () async {
    final appearance = await _read({});
    expect(appearance.mode, ThemeMode.system);
    expect(appearance.accent, AccentColor.amber);
  });

  test('maps accents saved by earlier versions onto the new palettes', () async {
    expect((await _read({'zemoney-accent': 'orange'})).accent, AccentColor.amber);
    expect((await _read({'zemoney-accent': 'blue'})).accent, AccentColor.night);
    expect((await _read({'zemoney-accent': 'violet'})).accent, AccentColor.night);
    expect((await _read({'zemoney-accent': 'emerald'})).accent, AccentColor.forest);
    expect((await _read({'zemoney-accent': 'rose'})).accent, AccentColor.berry);
    expect((await _read({'zemoney-accent': 'nonsense'})).accent, AccentColor.amber);
  });

  test('every accent keeps text at WCAG AA contrast in light and dark themes', () {
    double luminance(Color color) => color.computeLuminance();
    double contrast(Color a, Color b) {
      final light = luminance(a) > luminance(b) ? a : b;
      final dark = identical(light, a) ? b : a;
      return (luminance(light) + .05) / (luminance(dark) + .05);
    }

    for (final accent in AccentColor.values) {
      for (final brightness in Brightness.values) {
        final tokens = buildTheme(accent, brightness).extension<ZeTokens>()!;
        expect(
          contrast(tokens.primary, tokens.onPrimary),
          greaterThanOrEqualTo(4.5),
          reason: '${accent.name} ${brightness.name} button text',
        );
        expect(
          contrast(tokens.accentText, tokens.card),
          greaterThanOrEqualTo(4.5),
          reason: '${accent.name} ${brightness.name} accent text on cards',
        );
        expect(
          contrast(tokens.accentText, tokens.primarySoft),
          greaterThanOrEqualTo(4.5),
          reason: '${accent.name} ${brightness.name} accent text on soft fills',
        );
        for (final surface in [tokens.card, tokens.well]) {
          expect(
            contrast(tokens.income, surface),
            greaterThanOrEqualTo(4.5),
            reason: '${accent.name} ${brightness.name} income amounts',
          );
          expect(
            contrast(tokens.sub, surface),
            greaterThanOrEqualTo(4.5),
            reason: '${accent.name} ${brightness.name} secondary text',
          );
        }
        for (final tone in ZeTone.values) {
          expect(
            contrast(tokens.tone(tone), tokens.toneSoft(tone)),
            greaterThanOrEqualTo(4.5),
            reason: '${accent.name} ${brightness.name} ${tone.name} badge text',
          );
        }
      }
    }
  });
}
