import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';

import 'flutter_test_config.dart';

class _RecordingComparator extends GoldenFileComparator {
  final calls = <String>[];

  @override
  Future<bool> compare(Uint8List imageBytes, Uri golden) async {
    calls.add('compare $golden');
    return false;
  }

  @override
  Future<void> update(Uri golden, Uint8List imageBytes) async {
    calls.add('update $golden');
  }

  @override
  Uri getTestUri(Uri key, int? version) => Uri.parse('resolved/$key');
}

void main() {
  test(
    'off macOS, golden comparisons pass without consulting baselines',
    () async {
      final delegate = _RecordingComparator();
      final comparator = MacOsOnlyGoldenComparator(delegate);
      final golden = Uri.parse('goldens/home_light.png');

      expect(await comparator.compare(Uint8List(4), golden), isTrue);
      expect(await comparator.compare(Uint8List(4), golden), isTrue);
      expect(delegate.calls, isEmpty);
    },
  );

  test('off macOS, golden baselines are never overwritten', () {
    final delegate = _RecordingComparator();
    final comparator = MacOsOnlyGoldenComparator(delegate);

    expect(
      () =>
          comparator.update(Uri.parse('goldens/home_light.png'), Uint8List(4)),
      throwsStateError,
    );
    expect(delegate.calls, isEmpty);
  });

  test('golden paths still resolve through the original comparator', () {
    final comparator = MacOsOnlyGoldenComparator(_RecordingComparator());

    expect(
      comparator.getTestUri(Uri.parse('goldens/home_light.png'), null),
      Uri.parse('resolved/goldens/home_light.png'),
    );
  });
}
