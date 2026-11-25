part of 'statistics_screen.dart';

/// The month so far as a hill: each day's spending piled on the last, with
/// last month as the ridge behind it and the owl standing on today.
class _MonthHills extends StatefulWidget {
  const _MonthHills({
    required this.data,
    required this.previous,
    required this.currency,
    required this.busy,
  });

  final StatisticsOverview data;

  /// Null until last month is loaded, or when it could not be.
  final StatisticsOverview? previous;
  final String currency;
  final bool busy;

  static const height = 240.0;

  @override
  State<_MonthHills> createState() => _MonthHillsState();
}

class _MonthHillsState extends State<_MonthHills> {
  int? _selectedDay;

  @override
  void didUpdateWidget(_MonthHills oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.data.month != widget.data.month ||
        oldWidget.currency != widget.currency) {
      _selectedDay = null;
    }
  }

  /// Spending piled up day by day, never below the ground.
  static List<int> _climb(StatisticsOverview overview, int days) {
    var total = 0;
    return [
      for (final point in overview.dailyTrend.take(days))
        math.max(0, total += point.netExpenseMinor),
    ];
  }

  /// Days of [data]'s month that have happened.
  static int _daysSoFar(StatisticsOverview data) {
    final now = DateTime.now();
    return monthKey(now) == data.month
        ? math.min(now.day, data.dailyTrend.length)
        : data.dailyTrend.length;
  }

  void _pickAt(double dx, _HillGeometry hills, int maxDay) {
    if (maxDay <= 0) return;
    final day = hills.dayForX(dx).clamp(1, maxDay);
    if (day != _selectedDay) setState(() => _selectedDay = day);
  }

  @override
  Widget build(BuildContext context) {
    final palette = SkyPalette.of(context);
    final paper = context.ze.canvas;
    final climb = _climb(widget.data, _daysSoFar(widget.data));
    final behind = widget.previous == null
        ? const <int>[]
        : _climb(widget.previous!, widget.previous!.dailyTrend.length);
    final spent = climb.isNotEmpty && climb.last > 0;
    final selected =
        _selectedDay != null && _selectedDay! <= climb.length
            ? _selectedDay
            : null;
    return Semantics(
      label: _semantics(climb, behind),
      image: true,
      child: SizedBox(
        height: _MonthHills.height,
        width: double.infinity,
        child: LayoutBuilder(
          builder: (context, constraints) {
            final size = constraints.biggest;
            final hills = _HillGeometry(
              size: size,
              days: math.max(widget.data.dailyTrend.length, 1),
              climb: climb,
              behind: behind,
            );
            final owl = spent
                ? hills.owl
                : Offset(size.width * 290 / 360, size.height - 40);
            return GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTapUp: spent
                  ? (details) {
                      final day = hills
                          .dayForX(details.localPosition.dx)
                          .clamp(1, climb.length);
                      setState(
                        () => _selectedDay = _selectedDay == day ? null : day,
                      );
                    }
                  : null,
              onHorizontalDragUpdate: spent
                  ? (details) =>
                        _pickAt(details.localPosition.dx, hills, climb.length)
                  : null,
              onHorizontalDragEnd: spent
                  ? (_) => setState(() => _selectedDay = null)
                  : null,
              child: CustomPaint(
                painter: _HillsPainter(
                  palette: palette,
                  paper: paper,
                  hills: spent ? hills : null,
                  owl: owl,
                  selectedDay: selected,
                  climb: climb,
                  behind: behind,
                ),
                child: Stack(
                  children: [
                    Positioned(
                      left: owl.dx - _HillGeometry.owlSize / 2,
                      top: owl.dy - _HillGeometry.owlSize * 189 / 200 + 1,
                      child: SkyOwl(
                        size: _HillGeometry.owlSize,
                        busy: widget.busy,
                      ),
                    ),
                    if (selected != null)
                      Positioned(
                        left: 24,
                        top: 6,
                        child: _DayReadout(
                          month: widget.data.month,
                          day: selected,
                          totalMinor: climb[selected - 1],
                          previousMinor: selected <= behind.length
                              ? behind[selected - 1]
                              : null,
                          currency: widget.currency,
                        ),
                      ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  String _semantics(List<int> climb, List<int> behind) {
    if (climb.isEmpty) return tr('Spending so far this month', '本月累计支出');
    final total = formatMoneyWithSymbol(climb.last, widget.currency);
    final day = climb.length;
    if (behind.isEmpty) {
      return tr('Spending by day $day: $total', '到 $day 日累计支出 $total');
    }
    final before = formatMoneyWithSymbol(
      behind[math.min(day, behind.length) - 1],
      widget.currency,
    );
    return tr(
      'Spending by day $day: $total. Last month by then: $before',
      '到 $day 日累计支出 $total，上月同期 $before',
    );
  }
}

class _DayReadout extends StatelessWidget {
  const _DayReadout({
    required this.month,
    required this.day,
    required this.totalMinor,
    required this.previousMinor,
    required this.currency,
  });

  final String month;
  final int day;
  final int totalMinor;
  final int? previousMinor;
  final String currency;

  @override
  Widget build(BuildContext context) {
    final date = DateTime.tryParse('$month-${day.toString().padLeft(2, '0')}');
    final dayLabel = date == null
        ? '$day'
        : DateFormat(isZh ? 'M月d日' : 'MMM d', intlLocale).format(date);
    final total = formatMoneyWithSymbol(totalMinor, currency);
    final summary = previousMinor == null
        ? tr('$dayLabel · $total', '$dayLabel · 累计 $total')
        : tr(
            '$dayLabel · $total (prev ${formatMoneyWithSymbol(previousMinor!, currency)})',
            '$dayLabel · 累计 $total（上月 ${formatMoneyWithSymbol(previousMinor!, currency)}）',
          );
    return SkyPill(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      child: Text(
        summary,
        style: const TextStyle(fontFeatures: tabularFigures),
      ),
    );
  }
}

class _HillGeometry {
  _HillGeometry({
    required this.size,
    required this.days,
    required this.climb,
    required this.behind,
  });

  static const owlSize = 98.0;

  /// The page margin, so the first and last day line up with the axis.
  static const _margin = 24.0;

  /// The field + paper hill in front, where the spending hill rises from.
  static const _ground = 44.0;

  /// Sky kept above the highest hill for the owl.
  static const _headroom = owlSize * .86;

  final Size size;
  final int days;
  final List<int> climb;
  final List<int> behind;

  late final int _max = [...climb, ...behind, 1].reduce(math.max);

  double xOf(int day) =>
      _margin +
      (days < 2 ? 0 : (day - 1) / (days - 1)) * (size.width - 2 * _margin);

  int dayForX(double dx) {
    if (days < 2) return 1;
    final span = size.width - 2 * _margin;
    if (span <= 0) return 1;
    final ratio = ((dx - _margin) / span).clamp(0.0, 1.0);
    return (ratio * (days - 1)).round() + 1;
  }

  double _yOf(int minor) =>
      size.height -
      _ground -
      minor / _max * (size.height - _ground - _headroom);

  /// Every few days and always the last, so the hill rolls instead of
  /// stepping; it passes through the real total on each of them.
  List<Offset> _points(List<int> values) => [
    Offset(0, _yOf(0)),
    for (var day = 1; day <= values.length; day++)
      if ((values.length - day) % 4 == 0)
        Offset(xOf(math.min(day, days)), _yOf(values[day - 1])),
  ];

  late final _Slope ridge = _Slope(_points(behind));
  late final _Slope slope = _Slope(_points(climb));

  /// Where today's hill stops rising.
  double get end => xOf(math.min(climb.length, days));

  late final Offset owl = () {
    final x = end.clamp(owlSize * .46, size.width - owlSize * .46);
    return Offset(x, slope.yAt(math.min(x, end)));
  }();

  /// A path under [line], closed along the bottom.
  Path area(_Slope line, double to) {
    final path = Path()..moveTo(0, size.height);
    for (var x = 0.0; x < to; x += 2) {
      path.lineTo(x, line.yAt(x));
    }
    return path..lineTo(to, line.yAt(to));
  }

  /// Open stroke path along the crest of [line].
  Path crest(_Slope line, double to) {
    final path = Path()..moveTo(0, line.yAt(0));
    for (var x = 2.0; x < to; x += 2) {
      path.lineTo(x, line.yAt(x));
    }
    return path..lineTo(to, line.yAt(to));
  }
}

/// A smooth line through points that never overshoots them (Fritsch–Carlson
/// monotone cubic).
class _Slope {
  _Slope(this.points) : _tangents = _tangentsOf(points);

  final List<Offset> points;
  final List<double> _tangents;

  static List<double> _tangentsOf(List<Offset> points) {
    if (points.length < 2) return List.filled(points.length, 0);
    final slopes = [
      for (var i = 0; i < points.length - 1; i++)
        (points[i + 1].dy - points[i].dy) /
            math.max(points[i + 1].dx - points[i].dx, .001),
    ];
    return [
      slopes.first,
      for (var i = 1; i < slopes.length; i++)
        slopes[i - 1] * slopes[i] <= 0
            ? 0
            : 2 * slopes[i - 1] * slopes[i] / (slopes[i - 1] + slopes[i]),
      slopes.last,
    ];
  }

  double yAt(double x) {
    if (points.isEmpty) return 0;
    if (x <= points.first.dx) return points.first.dy;
    if (x >= points.last.dx) return points.last.dy;
    var i = 0;
    while (points[i + 1].dx < x) {
      i++;
    }
    final from = points[i];
    final to = points[i + 1];
    final width = to.dx - from.dx;
    final t = (x - from.dx) / width;
    final t2 = t * t;
    final t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * from.dy +
        (t3 - 2 * t2 + t) * width * _tangents[i] +
        (3 * t2 - 2 * t3) * to.dy +
        (t3 - t2) * width * _tangents[i + 1];
  }
}

class _HillsPainter extends CustomPainter {
  const _HillsPainter({
    required this.palette,
    required this.paper,
    required this.hills,
    required this.owl,
    required this.selectedDay,
    required this.climb,
    required this.behind,
  });

  final SkyPalette palette;
  final Color paper;

  /// Null when nothing has been spent: plain hills.
  final _HillGeometry? hills;
  final Offset owl;
  final int? selectedDay;
  final List<int> climb;
  final List<int> behind;

  @override
  void paint(Canvas canvas, Size size) {
    final width = size.width;
    SkyPainter.paintSun(canvas, owl.translate(0, -44), 58, palette);
    SkyPainter.paintCloud(canvas, const Offset(20, 24), .76, palette.cloud);
    SkyPainter.paintCloud(canvas, Offset(width * .46, 6), .52, palette.cloud);
    canvas.save();
    canvas.clipRect(Offset.zero & size);
    final hills = this.hills;
    if (hills == null) {
      canvas.translate(0, size.height - 36);
      SkyPainter.paintHills(
        canvas,
        width / 360,
        SkyLayout.scaleFor(width),
        palette,
      );
      canvas.restore();
      SkyPainter.paintPaperHill(canvas, size, paper, crest: 20);
      return;
    }
    if (hills.behind.isNotEmpty) {
      canvas.drawPath(
        hills.area(hills.ridge, width)
          ..lineTo(width, size.height)
          ..close(),
        Paint()..color = palette.far,
      );
    }
    final end = hills.end;
    final y = hills.slope.yAt(end);
    final front = hills.area(hills.slope, end)
      ..lineTo(end, size.height)
      ..close();
    canvas.drawPath(front, Paint()..color = palette.near);

    // Subtle bright rim along this month's climb so it reads crisply on dusk/night.
    canvas.drawPath(
      hills.crest(hills.slope, end),
      Paint()
        ..color = palette.furrow.withValues(alpha: .72)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.2
        ..strokeCap = StrokeCap.round,
    );

    // Days still to come: soft fading mist + dashed projection instead
    // of a sharp drop-off cliff that mimics spending falling to zero.
    if (end < width - 8) {
      final futureRect = Rect.fromLTRB(end, y, width, size.height);
      canvas.drawRect(
        futureRect,
        Paint()
          ..shader = LinearGradient(
            colors: [
              palette.near.withValues(alpha: .24),
              palette.near.withValues(alpha: .04),
            ],
          ).createShader(futureRect),
      );
      final dashPaint = Paint()
        ..color = palette.foreground.withValues(alpha: .36)
        ..strokeWidth = 1.6
        ..strokeCap = StrokeCap.round;
      for (var dx = end + 6; dx < width - 4; dx += 9) {
        canvas.drawLine(
          Offset(dx, y),
          Offset(math.min(dx + 4.5, width - 4), y),
          dashPaint,
        );
      }
      // Subtle vertical "today" hairline down to the meadow.
      canvas.drawLine(
        Offset(end, y),
        Offset(end, size.height - _HillGeometry._ground + 8),
        Paint()
          ..color = palette.foreground.withValues(alpha: .22)
          ..strokeWidth = 1,
      );
    }

    // Selected-day scrub indicator.
    if (selectedDay != null) {
      final sx = hills.xOf(selectedDay!);
      final sy = hills.slope.yAt(sx);
      canvas.drawLine(
        Offset(sx, sy),
        Offset(sx, size.height - _HillGeometry._ground + 10),
        Paint()
          ..color = palette.foreground.withValues(alpha: .55)
          ..strokeWidth = 1.5,
      );
      canvas.drawCircle(
        Offset(sx, sy),
        5,
        Paint()..color = palette.sun,
      );
      canvas.drawCircle(
        Offset(sx, sy),
        5,
        Paint()
          ..color = palette.foreground
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5,
      );
    }

    // The field in front, with its furrow and three trees.
    final stretch = width / 360;
    double x(double value) => value * stretch;
    double up(double value) => size.height - value;
    canvas.drawPath(
      Path()
        ..moveTo(0, size.height)
        ..lineTo(0, up(44))
        ..cubicTo(x(80), up(56), x(200), up(54), width, up(38))
        ..lineTo(width, size.height)
        ..close(),
      Paint()..color = palette.field,
    );
    canvas.drawPath(
      Path()
        ..moveTo(0, up(26))
        ..cubicTo(x(110), up(44), x(230), up(42), width, up(28))
        ..lineTo(width, up(23))
        ..cubicTo(x(230), up(35), x(110), up(35), 0, up(18))
        ..close(),
      Paint()..color = palette.furrow,
    );
    if (end > width * .4) {
      SkyPainter.paintTrees(canvas, Offset(x(62), up(50)), .6, palette);
    }
    canvas.restore();
    // Signature paper hill joining the landscape to the warm page below.
    SkyPainter.paintPaperHill(canvas, size, paper, crest: 20);
  }

  @override
  bool shouldRepaint(_HillsPainter oldDelegate) =>
      oldDelegate.palette != palette ||
      oldDelegate.paper != paper ||
      oldDelegate.owl != owl ||
      oldDelegate.selectedDay != selectedDay ||
      oldDelegate.climb.length != climb.length ||
      oldDelegate.behind.length != behind.length ||
      (climb.isNotEmpty &&
          oldDelegate.climb.isNotEmpty &&
          oldDelegate.climb.last != climb.last);
}

/// High-contrast colour key on a frosted sky pill so swatches stay unmistakable
/// across dawn, day, dusk and night skies.
class _HillsKey extends StatelessWidget {
  const _HillsKey({required this.hasPrevious});

  final bool hasPrevious;

  @override
  Widget build(BuildContext context) {
    final palette = SkyPalette.of(context);
    Widget swatch(Color fill, {Color? crest, bool dashed = false}) => Container(
      width: 12,
      height: 12,
      decoration: BoxDecoration(
        color: fill,
        shape: BoxShape.circle,
        border: Border.all(
          color: crest ?? palette.foreground.withValues(alpha: dashed ? .65 : .9),
          width: crest != null ? 2 : 1.5,
        ),
      ),
    );
    Widget item(Widget dot, String label) => Row(
      mainAxisSize: MainAxisSize.min,
      spacing: 6,
      children: [
        dot,
        Flexible(
          child: Text(
            label,
            style: TextStyle(
              color: palette.foreground,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    );
    return SkyPill(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      child: Wrap(
        spacing: 12,
        runSpacing: 4,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          item(
            swatch(palette.near, crest: palette.furrow),
            tr('This month', '本月'),
          ),
          if (hasPrevious)
            item(
              swatch(palette.far, dashed: true),
              tr('Last month', '上月'),
            ),
        ],
      ),
    );
  }
}
