part of 'sky.dart';

/// Colours of one hour's landscape. The shapes are the same all day; only
/// these change.
@immutable
class SkyPalette {
  const SkyPalette({
    required this.sky,
    required this.sun,
    required this.far,
    required this.near,
    required this.field,
    required this.ridge,
    required this.furrow,
    required this.roundTree,
    required this.cypress,
    required this.smallTree,
    required this.cloud,
    required this.foreground,
    required this.muted,
    this.stars = 0,
    this.moon = false,
  });

  /// Top, middle and horizon.
  final List<Color> sky;
  final Color sun;

  /// Pale hill at the back left, the hill in front of it, the sunlit field on
  /// the right, and the ridge behind that field.
  final Color far;
  final Color near;
  final Color field;
  final Color ridge;
  final Color furrow;
  final Color roundTree;
  final Color cypress;
  final Color smallTree;
  final Color cloud;

  /// Text and icons on the sky.
  final Color foreground;
  final Color muted;

  /// How many of the sky's stars are out.
  final int stars;
  final bool moon;

  bool get onDark => foreground == Colors.white;

  /// Backing for controls on the sky, so they stay readable in front of the
  /// sun or a cloud.
  Color get frost => Colors.white.withValues(alpha: onDark ? .18 : .55);

  /// Error text on the sky.
  Color get danger =>
      onDark ? const Color(0xffffc2c9) : const Color(0xffa3122a);

  /// Status bar icons on this sky; the system bar below is the page's own.
  SystemUiOverlayStyle get overlay => SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: onDark ? Brightness.light : Brightness.dark,
    statusBarBrightness: onDark ? Brightness.dark : Brightness.light,
  );

  static SkyPalette of(BuildContext context) {
    final t = context.ze;
    return forTime(t.time, dark: t.dark);
  }

  static SkyPalette forTime(SceneTime time, {required bool dark}) =>
      switch (time) {
        SceneTime.dawn => dark ? _dawnDark : _dawn,
        SceneTime.day => dark ? _dayDark : _day,
        SceneTime.dusk => dark ? _duskDark : _dusk,
        // Night is dark already, so both themes share it.
        SceneTime.night => _night,
      };

  static const _ink = Color(0xff1e2230);

  static const _dawn = SkyPalette(
    sky: [Color(0xfffdc1b9), Color(0xfffbd2c2), Color(0xfffde5c9)],
    sun: Color(0xfffc8452),
    far: Color(0xffd1c5cd),
    near: Color(0xff8e9e6c),
    field: Color(0xffb5b871),
    ridge: Color(0xff92a27b),
    furrow: Color(0xffe1d78c),
    roundTree: Color(0xff8b954f),
    cypress: Color(0xff6c795b),
    smallTree: Color(0xffa5aa56),
    cloud: Color(0xfffdf2de),
    foreground: _ink,
    muted: Color(0xff594639),
  );

  static const _day = SkyPalette(
    sky: [Color(0xff88ccf3), Color(0xffa0daf0), Color(0xffc4eeea)],
    sun: Color(0xfffdc75a),
    far: Color(0xff93d0d5),
    near: Color(0xff6ca065),
    field: Color(0xffadc35e),
    ridge: Color(0xff62a079),
    furrow: Color(0xffdfdd78),
    roundTree: Color(0xff779f49),
    cypress: Color(0xff3c5e6a),
    smallTree: Color(0xffa1ba54),
    cloud: Color(0xfff4f6f1),
    foreground: _ink,
    muted: Color(0xff31414f),
  );

  static const _dusk = SkyPalette(
    sky: [Color(0xff2a1b42), Color(0xff582b5c), Color(0xffb85a70)],
    sun: Color(0xfff4942d),
    far: Color(0xff75426d),
    near: Color(0xff461d3d),
    field: Color(0xff405c55),
    ridge: Color(0xff572848),
    furrow: Color(0xffd6a54c),
    roundTree: Color(0xff596237),
    cypress: Color(0xff34284e),
    smallTree: Color(0xff82883e),
    cloud: Color(0xff945574),
    foreground: Colors.white,
    muted: Color(0xfff0dfe6),
    stars: 3,
  );

  static const _night = SkyPalette(
    sky: [Color(0xff111634), Color(0xff1b2247), Color(0xff3d4a7a)],
    sun: Color(0xffffe7c0),
    far: Color(0xff4c6494),
    near: Color(0xff153149),
    field: Color(0xff2b4c68),
    ridge: Color(0xff1c3750),
    furrow: Color(0xff54779c),
    roundTree: Color(0xff103649),
    cypress: Color(0xff11273f),
    smallTree: Color(0xff113a4c),
    cloud: Color(0xff3a4a77),
    foreground: Colors.white,
    muted: Color(0xffd5d8ee),
    stars: 9,
    moon: true,
  );

  static const _dawnDark = SkyPalette(
    sky: [Color(0xff4f293e), Color(0xff653946), Color(0xff8d504a)],
    sun: Color(0xfffd725b),
    far: Color(0xff916b83),
    near: Color(0xff53593d),
    field: Color(0xff6d6a41),
    ridge: Color(0xff52563d),
    furrow: Color(0xffad9251),
    roundTree: Color(0xff67632c),
    cypress: Color(0xff4d5339),
    smallTree: Color(0xff807736),
    cloud: Color(0xff9a6268),
    foreground: Colors.white,
    muted: Color(0xfff0dfd6),
  );

  static const _dayDark = SkyPalette(
    sky: [Color(0xff1c364f), Color(0xff264f65), Color(0xff38777e)],
    sun: Color(0xfff9a71d),
    far: Color(0xff296468),
    near: Color(0xff1c4c31),
    field: Color(0xff50702c),
    ridge: Color(0xff175041),
    furrow: Color(0xff93963c),
    roundTree: Color(0xff315d2c),
    cypress: Color(0xff092435),
    smallTree: Color(0xff748833),
    cloud: Color(0xff567c88),
    foreground: Colors.white,
    muted: Color(0xffd6e4ec),
  );

  static const _duskDark = SkyPalette(
    sky: [Color(0xff1e0e29), Color(0xff351637), Color(0xff772e4f)],
    sun: Color(0xfff9a437),
    far: Color(0xff4b2242),
    near: Color(0xff281028),
    field: Color(0xff183b38),
    ridge: Color(0xff2e122b),
    furrow: Color(0xffeca842),
    roundTree: Color(0xff4d5e30),
    cypress: Color(0xff221735),
    smallTree: Color(0xff79853f),
    cloud: Color(0xff6b3350),
    foreground: Colors.white,
    muted: Color(0xfff0dfe6),
    stars: 3,
  );
}

/// The shape of a paper hill, left to right across a 360-unit width: height
/// of each point below the hill's crest.
enum _PaperHill { slope, gentle, dome }

/// Where things stand in a header. Horizontal positions are on a 360-unit
/// width; vertical ones count up from the header's bottom edge, so the
/// landscape holds together however tall the text above it grows.
@immutable
class SkyLayout {
  const SkyLayout._({
    required this.skyHeight,
    required this.horizon,
    required this.crest,
    required _PaperHill hill,
    required this.sun,
    required this.sunRadius,
    this.owl,
    this.owlSize = 0,
    this.clouds = const [],
  }) : _hill = hill;

  /// Height the sky's gradient runs over, from the top of the screen.
  final double skyHeight;
  final double horizon;

  /// Top of the paper hill that closes the header off.
  final double crest;
  final _PaperHill _hill;
  final Offset sun;
  final double sunRadius;

  /// Where the owl's feet are.
  final Offset? owl;
  final double owlSize;
  final List<(double, double, double)> clouds;

  /// Home: the owl in front of a large sun.
  static const home = SkyLayout._(
    skyHeight: 332,
    horizon: 44,
    crest: 30,
    hill: _PaperHill.slope,
    sun: Offset(274, 114),
    sunRadius: 72,
    owl: Offset(274, 28),
    owlSize: 152,
    clouds: [(22, 114, .76), (300, 196, .68)],
  );

  /// Tab pages, the entry form and the detail page.
  static const page = SkyLayout._(
    skyHeight: 270,
    horizon: 30,
    crest: 24,
    hill: _PaperHill.gentle,
    sun: Offset(290, 85),
    sunRadius: 46,
    owl: Offset(290, 20),
    owlSize: 104,
    clouds: [(34, 82, .55)],
  );

  /// Secondary pages: a sun setting behind a strip of hills.
  static const strip = SkyLayout._(
    skyHeight: 150,
    horizon: 22,
    crest: 24,
    hill: _PaperHill.gentle,
    sun: Offset(288, 28),
    sunRadius: 17,
  );

  /// Insights: only the sky; the month's own hills stand in for the
  /// landscape.
  static const insights = SkyLayout._(
    skyHeight: 440,
    horizon: 30,
    crest: 24,
    hill: _PaperHill.gentle,
    sun: Offset.zero,
    sunRadius: 0,
  );

  static const login = SkyLayout._(
    skyHeight: 470,
    horizon: 62,
    crest: 38,
    hill: _PaperHill.dome,
    sun: Offset(180, 164),
    sunRadius: 106,
    owl: Offset(180, 34),
    owlSize: 208,
    clouds: [(26, 132, 1), (292, 240, .9)],
  );

  /// Sizes grow a little on wide screens, positions stretch with the width.
  static double scaleFor(double width) => (width / 360).clamp(.85, 1.2);
}
