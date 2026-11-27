import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'day_time.dart';
import 'l10n.dart';

/// Switchable accent palettes, all drawn from the owl's world. Surfaces stay
/// warm and neutral, so the accent is the only thing a theme changes.
enum AccentColor { amber, night, forest, berry }

class AccentPalette {
  const AccentPalette({
    required this.primary,
    required this.primaryDark,
    required this.soft,
    required this.softDark,
    this.onPrimary = Colors.white,
    required this.onPrimaryDark,
    this.income = const Color(0xff05744b),
    this.incomeDark = const Color(0xff3fd09a),
    this.accentText,
    this.accentTextDark,
  });

  final Color primary;
  final Color primaryDark;
  final Color soft;
  final Color softDark;
  final Color onPrimary;
  final Color onPrimaryDark;
  final Color income;
  final Color incomeDark;

  /// Accent used for text and icons on cards. Defaults to [primary]; amber
  /// needs a deeper value because the owl's eye colour is unreadable on white.
  final Color? accentText;
  final Color? accentTextDark;
}

extension AccentColorValue on AccentColor {
  AccentPalette get palette => switch (this) {
    // The owl's eyes: amber buttons carry ink text.
    AccentColor.amber => const AccentPalette(
      primary: Color(0xfff2b33d),
      primaryDark: Color(0xfff5bd4f),
      soft: Color(0xfffcefd2),
      softDark: Color(0xff3a2f14),
      onPrimary: Color(0xff1f2230),
      onPrimaryDark: Color(0xff1f2230),
      accentText: Color(0xff8a5300),
    ),
    AccentColor.night => const AccentPalette(
      primary: Color(0xff3d4a8f),
      primaryDark: Color(0xff9aa8ff),
      soft: Color(0xffe6e9f7),
      softDark: Color(0xff262b4a),
      onPrimaryDark: Color(0xff12162e),
    ),
    // A green primary would blur with green income, so income turns blue.
    AccentColor.forest => const AccentPalette(
      primary: Color(0xff2f7a57),
      primaryDark: Color(0xff6ccb9c),
      soft: Color(0xffdff0e6),
      softDark: Color(0xff18352a),
      onPrimaryDark: Color(0xff0c2418),
      accentText: Color(0xff2a6e4e),
      income: Color(0xff1d4ed8),
      incomeDark: Color(0xff8ab8ff),
    ),
    AccentColor.berry => const AccentPalette(
      primary: Color(0xffb8436f),
      primaryDark: Color(0xfff28db2),
      soft: Color(0xfff8e3eb),
      softDark: Color(0xff43202e),
      onPrimaryDark: Color(0xff2d0f1b),
      accentText: Color(0xffa33a62),
    ),
  };

  /// Swatch shown in the theme picker.
  Color get color => palette.primary;

  /// Secondary swatch for palettes whose dark variant differs in hue.
  Color get darkColor => palette.primaryDark;

  String get label => switch (this) {
    AccentColor.amber => tr('Amber', '琥珀'),
    AccentColor.night => tr('Night owl', '夜枭'),
    AccentColor.forest => tr('Forest', '森林'),
    AccentColor.berry => tr('Berry', '莓果'),
  };
}

class AppAppearance {
  const AppAppearance({required this.mode, required this.accent});
  final ThemeMode mode;
  final AccentColor accent;
}

const defaultAccent = AccentColor.amber;

/// Accent names saved by earlier versions of the app.
const _legacyAccents = {
  'orange': AccentColor.amber,
  'blue': AccentColor.night,
  'violet': AccentColor.night,
  'emerald': AccentColor.forest,
  'rose': AccentColor.berry,
};

AccentColor accentFromName(String? name) {
  for (final accent in AccentColor.values) {
    if (accent.name == name) return accent;
  }
  return _legacyAccents[name] ?? defaultAccent;
}

// Kept from the zeMoney name: renaming them would reset existing users' theme and accent choices.
const themeModeStorageKey = 'zemoney-theme';
const accentColorStorageKey = 'zemoney-accent';

AppAppearance readAppearance(SharedPreferences preferences) {
  final modeName = preferences.getString(themeModeStorageKey) ?? 'system';
  return AppAppearance(
    mode: ThemeMode.values.firstWhere(
      (value) => value.name == modeName,
      orElse: () => ThemeMode.system,
    ),
    accent: accentFromName(preferences.getString(accentColorStorageKey)),
  );
}

/// Semantic tone for status surfaces, badges and icon tiles.
enum ZeTone { neutral, primary, income, danger, warn, info }

/// Solid icon colours for rows that are not a category, from the landscape.
abstract final class ZeHues {
  static const terracotta = Color(0xffc9683a);
  static const rose = Color(0xffc05f75);
  static const plum = Color(0xff8a6196);
  static const sky = Color(0xff5a86b4);
  static const teal = Color(0xff3f8d84);
  static const moss = Color(0xff6f8c38);
  static const stone = Color(0xff8b857a);
}

/// Design tokens for the paper under the sky. Read them with `context.ze`.
@immutable
class ZeTokens extends ThemeExtension<ZeTokens> {
  const ZeTokens({
    required this.dark,
    required this.time,
    required this.canvas,
    required this.card,
    required this.well,
    required this.raised,
    required this.ink,
    required this.sub,
    required this.faint,
    required this.line,
    required this.track,
    required this.bar,
    required this.primary,
    required this.onPrimary,
    required this.primarySoft,
    required this.accentText,
    required this.income,
    required this.danger,
    required this.warn,
    required this.info,
  });

  factory ZeTokens.of(
    AccentColor accent,
    Brightness brightness, {
    SceneTime? time,
  }) {
    final dark = brightness == Brightness.dark;
    final hour = time ?? sceneTimeFor(storyNow());
    final p = accent.palette;
    final paper = _paper(hour);
    return ZeTokens(
      dark: dark,
      time: hour,
      canvas: dark ? const Color(0xff14161d) : paper.canvas,
      card: dark ? const Color(0xff1d2029) : Colors.white,
      well: dark ? const Color(0xff242833) : paper.well,
      raised: dark ? const Color(0xff353b4c) : Colors.white,
      ink: dark ? const Color(0xfff3efe7) : const Color(0xff1e2230),
      sub: dark ? const Color(0xffa7a8b2) : const Color(0xff6b665f),
      faint: dark ? const Color(0xff6f7280) : const Color(0xffa39d92),
      line: dark ? const Color(0xff282c38) : paper.line,
      track: dark ? const Color(0xff2b303d) : paper.track,
      bar: dark ? const Color(0xff434a5f) : paper.bar,
      primary: dark ? p.primaryDark : p.primary,
      onPrimary: dark ? p.onPrimaryDark : p.onPrimary,
      primarySoft: dark ? p.softDark : p.soft,
      accentText:
          (dark ? p.accentTextDark : p.accentText) ??
          (dark ? p.primaryDark : p.primary),
      income: dark ? p.incomeDark : p.income,
      danger: dark ? const Color(0xffff8593) : const Color(0xffc8243b),
      warn: dark ? const Color(0xfffbbf24) : const Color(0xff945600),
      info: dark ? const Color(0xff8ab8ff) : const Color(0xff1d4ed8),
    );
  }

  /// Paper picks up a trace of the sky above it, so the whole page moves with
  /// the hour. Dark mode keeps one paper for every hour.
  static ({Color canvas, Color well, Color line, Color track, Color bar})
  _paper(SceneTime time) => switch (time) {
    SceneTime.dawn => (
      canvas: const Color(0xfffbf5ee),
      well: const Color(0xfff4ebe1),
      line: const Color(0xffeee2d6),
      track: const Color(0xffebdfd3),
      bar: const Color(0xffd9c3b0),
    ),
    SceneTime.day => (
      canvas: const Color(0xfffaf7ef),
      well: const Color(0xfff1ede2),
      line: const Color(0xffebe5d9),
      track: const Color(0xffe8e3d5),
      bar: const Color(0xffc6cfa9),
    ),
    SceneTime.dusk => (
      canvas: const Color(0xfffaf4f1),
      well: const Color(0xfff2e8e5),
      line: const Color(0xffebdfdc),
      track: const Color(0xffe9dcd9),
      bar: const Color(0xffd2b5bc),
    ),
    SceneTime.night => (
      canvas: const Color(0xfff5f5f3),
      well: const Color(0xffebecef),
      line: const Color(0xffe3e4e7),
      track: const Color(0xffe0e2e7),
      bar: const Color(0xffb9c1d3),
    ),
  };

  final bool dark;

  /// Hour of the sky these surfaces sit under.
  final SceneTime time;
  final Color canvas;
  final Color card;
  final Color well;

  /// Surface lifted above [well], e.g. the selected segment.
  final Color raised;
  final Color ink;
  final Color sub;
  final Color faint;
  final Color line;
  final Color track;

  /// Ordinary column of a bar chart; the one in focus takes [primary].
  final Color bar;
  final Color primary;
  final Color onPrimary;
  final Color primarySoft;
  final Color accentText;
  final Color income;
  final Color danger;
  final Color warn;
  final Color info;

  /// Expenses are the common case, so they stay neutral instead of red.
  Color get expense => ink;

  Color tone(ZeTone tone) => switch (tone) {
    ZeTone.neutral => sub,
    ZeTone.primary => accentText,
    ZeTone.income => income,
    ZeTone.danger => danger,
    ZeTone.warn => warn,
    ZeTone.info => info,
  };

  Color toneSoft(ZeTone tone) => switch (tone) {
    ZeTone.neutral => well,
    ZeTone.primary => primarySoft,
    _ => soften(this.tone(tone)),
  };

  /// Tinted background for a coloured icon or badge.
  Color soften(Color color) =>
      Color.alphaBlend(color.withValues(alpha: dark ? .16 : .1), card);

  Color amountColor(String type) => switch (type) {
    'income' || 'refund' => income,
    'transfer' => sub,
    _ => expense,
  };

  @override
  ZeTokens copyWith() => this;

  @override
  ZeTokens lerp(ZeTokens? other, double t) {
    if (other == null) return this;
    return ZeTokens(
      dark: t < .5 ? dark : other.dark,
      time: t < .5 ? time : other.time,
      canvas: Color.lerp(canvas, other.canvas, t)!,
      card: Color.lerp(card, other.card, t)!,
      well: Color.lerp(well, other.well, t)!,
      raised: Color.lerp(raised, other.raised, t)!,
      ink: Color.lerp(ink, other.ink, t)!,
      sub: Color.lerp(sub, other.sub, t)!,
      faint: Color.lerp(faint, other.faint, t)!,
      line: Color.lerp(line, other.line, t)!,
      track: Color.lerp(track, other.track, t)!,
      bar: Color.lerp(bar, other.bar, t)!,
      primary: Color.lerp(primary, other.primary, t)!,
      onPrimary: Color.lerp(onPrimary, other.onPrimary, t)!,
      primarySoft: Color.lerp(primarySoft, other.primarySoft, t)!,
      accentText: Color.lerp(accentText, other.accentText, t)!,
      income: Color.lerp(income, other.income, t)!,
      danger: Color.lerp(danger, other.danger, t)!,
      warn: Color.lerp(warn, other.warn, t)!,
      info: Color.lerp(info, other.info, t)!,
    );
  }
}

extension ZeThemeContext on BuildContext {
  /// Falls back to the default accent so widgets still render under a plain
  /// [ThemeData] (e.g. in isolated widget tests).
  ZeTokens get ze {
    final theme = Theme.of(this);
    return theme.extension<ZeTokens>() ??
        ZeTokens.of(defaultAccent, theme.brightness);
  }
}

const tabularFigures = [FontFeature.tabularFigures()];

/// Rounded type that matches the owl: bundled Nunito (Latin subset). Other
/// scripts fall back to the platform font.
const zeFont = 'Nunito';

ThemeData buildTheme(
  AccentColor accent,
  Brightness brightness, {
  SceneTime? time,
}) {
  final t = ZeTokens.of(accent, brightness, time: time);
  final dark = t.dark;
  final scheme =
      ColorScheme.fromSeed(
        seedColor: accent.palette.primary,
        brightness: brightness,
      ).copyWith(
        primary: t.primary,
        onPrimary: t.onPrimary,
        primaryContainer: t.primarySoft,
        onPrimaryContainer: t.accentText,
        secondary: t.accentText,
        secondaryContainer: t.primarySoft,
        onSecondaryContainer: t.accentText,
        surface: t.card,
        onSurface: t.ink,
        onSurfaceVariant: t.sub,
        outline: t.line,
        outlineVariant: t.line,
        error: t.danger,
        surfaceTint: Colors.transparent,
        surfaceContainerLowest: t.canvas,
        surfaceContainerLow: t.card,
        surfaceContainer: t.card,
        surfaceContainerHigh: t.card,
        surfaceContainerHighest: t.well,
      );
  final base = ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    fontFamily: zeFont,
  );
  final text = base.textTheme.apply(bodyColor: t.ink, displayColor: t.ink);
  final textTheme = text.copyWith(
    displaySmall: text.displaySmall?.copyWith(
      fontSize: 38,
      height: 1.1,
      fontWeight: FontWeight.w800,
      letterSpacing: -.8,
      fontFeatures: tabularFigures,
    ),
    headlineMedium: text.headlineMedium?.copyWith(
      fontSize: 24,
      fontWeight: FontWeight.w800,
      letterSpacing: -.3,
    ),
    headlineSmall: text.headlineSmall?.copyWith(
      fontSize: 22,
      fontWeight: FontWeight.w800,
      letterSpacing: -.3,
    ),
    titleLarge: text.titleLarge?.copyWith(
      fontSize: 17,
      fontWeight: FontWeight.w800,
      letterSpacing: -.1,
    ),
    titleMedium: text.titleMedium?.copyWith(
      fontSize: 15.5,
      fontWeight: FontWeight.w700,
    ),
    titleSmall: text.titleSmall?.copyWith(
      fontSize: 14,
      fontWeight: FontWeight.w700,
    ),
    bodyLarge: text.bodyLarge?.copyWith(fontSize: 16),
    bodyMedium: text.bodyMedium?.copyWith(fontSize: 14),
    bodySmall: text.bodySmall?.copyWith(
      fontSize: 13,
      color: t.sub,
      fontWeight: FontWeight.w500,
    ),
    labelLarge: text.labelLarge?.copyWith(
      fontSize: 14,
      fontWeight: FontWeight.w700,
    ),
    labelMedium: text.labelMedium?.copyWith(
      fontSize: 12.5,
      color: t.sub,
      fontWeight: FontWeight.w600,
    ),
    labelSmall: text.labelSmall?.copyWith(
      fontSize: 11,
      color: t.faint,
      fontWeight: FontWeight.w600,
    ),
  );
  const buttonShape = StadiumBorder();
  const buttonText = TextStyle(
    fontFamily: zeFont,
    fontSize: 15.5,
    fontWeight: FontWeight.w800,
  );

  return base.copyWith(
    extensions: [t],
    textTheme: textTheme,
    scaffoldBackgroundColor: t.canvas,
    canvasColor: t.canvas,
    dividerTheme: DividerThemeData(color: t.line, thickness: 1, space: 1),
    cardTheme: CardThemeData(
      elevation: 0,
      margin: EdgeInsets.zero,
      color: t.card,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
    ),
    listTileTheme: ListTileThemeData(
      iconColor: t.sub,
      titleTextStyle: textTheme.titleMedium,
      subtitleTextStyle: textTheme.bodySmall,
      contentPadding: const EdgeInsets.symmetric(horizontal: 24),
      minVerticalPadding: 12,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: t.well,
      hintStyle: TextStyle(
        fontFamily: zeFont,
        color: t.faint,
        fontWeight: FontWeight.w500,
      ),
      labelStyle: TextStyle(
        fontFamily: zeFont,
        color: t.sub,
        fontWeight: FontWeight.w500,
      ),
      floatingLabelStyle: WidgetStateTextStyle.resolveWith(
        (states) => TextStyle(
          fontFamily: zeFont,
          color: states.contains(WidgetState.error)
              ? t.danger
              : states.contains(WidgetState.focused)
              ? t.accentText
              : t.sub,
          fontWeight: FontWeight.w600,
        ),
      ),
      prefixIconColor: t.faint,
      suffixIconColor: t.faint,
      contentPadding: const EdgeInsets.fromLTRB(16, 13, 16, 13),
      // Underline borders keep the floating label inside the filled shape.
      border: UnderlineInputBorder(
        borderRadius: BorderRadius.circular(18),
        borderSide: BorderSide.none,
      ),
      enabledBorder: UnderlineInputBorder(
        borderRadius: BorderRadius.circular(18),
        borderSide: BorderSide.none,
      ),
      disabledBorder: UnderlineInputBorder(
        borderRadius: BorderRadius.circular(18),
        borderSide: BorderSide.none,
      ),
      focusedBorder: UnderlineInputBorder(
        borderRadius: BorderRadius.circular(18),
        borderSide: BorderSide(color: t.primary, width: 2),
      ),
      errorBorder: UnderlineInputBorder(
        borderRadius: BorderRadius.circular(18),
        borderSide: BorderSide(color: t.danger, width: 1.5),
      ),
      focusedErrorBorder: UnderlineInputBorder(
        borderRadius: BorderRadius.circular(18),
        borderSide: BorderSide(color: t.danger, width: 2),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(0, 52),
        backgroundColor: t.primary,
        foregroundColor: t.onPrimary,
        disabledBackgroundColor: t.track,
        disabledForegroundColor: t.faint,
        elevation: 0,
        textStyle: buttonText,
        shape: buttonShape,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, 52),
        foregroundColor: t.ink,
        backgroundColor: t.well,
        side: BorderSide.none,
        textStyle: buttonText,
        shape: buttonShape,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: t.accentText,
        textStyle: const TextStyle(
          fontFamily: zeFont,
          fontSize: 14,
          fontWeight: FontWeight.w700,
        ),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(foregroundColor: t.ink),
    ),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: t.primary,
      foregroundColor: t.onPrimary,
      elevation: 0,
      shape: const StadiumBorder(),
    ),
    searchBarTheme: SearchBarThemeData(
      backgroundColor: WidgetStatePropertyAll(t.well),
      elevation: const WidgetStatePropertyAll(0),
      side: const WidgetStatePropertyAll(BorderSide.none),
      shape: const WidgetStatePropertyAll(StadiumBorder()),
      hintStyle: WidgetStatePropertyAll(
        TextStyle(
          fontFamily: zeFont,
          color: t.faint,
          fontWeight: FontWeight.w500,
        ),
      ),
      padding: const WidgetStatePropertyAll(
        EdgeInsets.symmetric(horizontal: 14),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: t.well,
      selectedColor: t.primarySoft,
      disabledColor: t.well,
      checkmarkColor: t.accentText,
      side: BorderSide.none,
      shape: const StadiumBorder(),
      labelStyle: TextStyle(
        fontFamily: zeFont,
        color: t.ink,
        fontWeight: FontWeight.w600,
      ),
      secondaryLabelStyle: TextStyle(
        fontFamily: zeFont,
        color: t.accentText,
        fontWeight: FontWeight.w700,
      ),
      iconTheme: IconThemeData(color: t.sub, size: 18),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: ButtonStyle(
        minimumSize: const WidgetStatePropertyAll(Size(0, 44)),
        backgroundColor: WidgetStateProperty.resolveWith(
          (states) =>
              states.contains(WidgetState.selected) ? t.primarySoft : t.well,
        ),
        foregroundColor: WidgetStateProperty.resolveWith(
          (states) =>
              states.contains(WidgetState.selected) ? t.accentText : t.sub,
        ),
        side: WidgetStatePropertyAll(BorderSide(color: t.card, width: 2)),
        textStyle: const WidgetStatePropertyAll(
          TextStyle(fontFamily: zeFont, fontWeight: FontWeight.w700),
        ),
      ),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? t.onPrimary
            : dark
            ? t.sub
            : Colors.white,
      ),
      trackColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? t.primary : t.track,
      ),
      trackOutlineColor: const WidgetStatePropertyAll(Colors.transparent),
    ),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? t.primary : null,
      ),
      checkColor: WidgetStatePropertyAll(t.onPrimary),
    ),
    radioTheme: RadioThemeData(
      fillColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? t.primary : t.faint,
      ),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: t.canvas,
      modalBackgroundColor: t.canvas,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      dragHandleColor: t.track,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: t.card,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      titleTextStyle: textTheme.titleLarge,
      contentTextStyle: textTheme.bodyMedium?.copyWith(color: t.sub),
    ),
    datePickerTheme: DatePickerThemeData(
      backgroundColor: t.card,
      surfaceTintColor: Colors.transparent,
      headerBackgroundColor: t.card,
      headerForegroundColor: t.ink,
    ),
    timePickerTheme: TimePickerThemeData(backgroundColor: t.card),
    popupMenuTheme: PopupMenuThemeData(
      color: t.card,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: dark ? t.raised : t.ink,
      contentTextStyle: TextStyle(
        fontFamily: zeFont,
        color: dark ? t.ink : Colors.white,
        fontWeight: FontWeight.w600,
      ),
      actionTextColor: dark ? t.accentText : t.primarySoft,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: t.primary,
      linearTrackColor: t.track,
      circularTrackColor: Colors.transparent,
    ),
    expansionTileTheme: ExpansionTileThemeData(
      iconColor: t.sub,
      collapsedIconColor: t.faint,
      textColor: t.ink,
      collapsedTextColor: t.ink,
      shape: const Border(),
      collapsedShape: const Border(),
    ),
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(
        color: dark ? t.raised : t.ink,
        borderRadius: BorderRadius.circular(8),
      ),
    ),
    appBarTheme: AppBarTheme(
      systemOverlayStyle: dark
          ? SystemUiOverlayStyle.light
          : SystemUiOverlayStyle.dark,
      centerTitle: false,
      elevation: 0,
      scrolledUnderElevation: 0,
      backgroundColor: t.canvas,
      surfaceTintColor: Colors.transparent,
      foregroundColor: t.ink,
      titleTextStyle: textTheme.titleLarge?.copyWith(fontSize: 19),
    ),
  );
}
