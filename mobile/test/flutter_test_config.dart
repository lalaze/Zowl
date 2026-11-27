import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:zowl_mobile/core/day_time.dart';

/// Pins the story scene to one evening so goldens and text expectations do
/// not change with the hour the suite runs.
///
/// Golden baselines are rendered on macOS. Text rasterises differently on
/// Linux and Windows (a few percent of pixels), so there the golden
/// comparison is skipped while the rest of each test still runs.
Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  debugStoryClock = () => DateTime(2026, 11, 12, 21);
  if (!Platform.isMacOS) {
    goldenFileComparator = MacOsOnlyGoldenComparator(goldenFileComparator);
  }
  await testMain();
}

/// Skips golden comparisons and refuses golden updates off macOS.
class MacOsOnlyGoldenComparator extends GoldenFileComparator {
  MacOsOnlyGoldenComparator(this.delegate);

  final GoldenFileComparator delegate;
  bool _announced = false;

  @override
  Future<bool> compare(Uint8List imageBytes, Uri golden) async {
    if (!_announced) {
      _announced = true;
      // ignore: avoid_print
      print(
        'Skipping golden comparisons on ${Platform.operatingSystem}: '
        'baselines are rendered on macOS.',
      );
    }
    return true;
  }

  @override
  Future<void> update(Uri golden, Uint8List imageBytes) {
    throw StateError(
      'Update golden baselines on macOS; '
      '${Platform.operatingSystem} renders text differently.',
    );
  }

  @override
  Uri getTestUri(Uri key, int? version) => delegate.getTestUri(key, version);
}
