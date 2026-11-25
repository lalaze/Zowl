import 'dart:io';

const _overallMinimum = 80.0;
const _coreMinimum = 90.0;

String _normalize(String path) => File(path).absolute.path;

void main(List<String> arguments) {
  final report = File(
    arguments.isEmpty ? 'coverage/lcov.info' : arguments.single,
  );
  if (!report.existsSync()) {
    stderr.writeln('Coverage report not found: ${report.path}');
    exitCode = 2;
    return;
  }

  final expected = Directory('lib')
      .listSync(recursive: true)
      .whereType<File>()
      .where(
        (file) => file.path.endsWith('.dart') && !file.path.endsWith('.g.dart'),
      )
      .map((file) => _normalize(file.path))
      .toSet();
  final coverage = <String, ({int found, int hit})>{};
  String? source;
  var found = 0;
  var hit = 0;

  void finishRecord() {
    if (source != null && !source!.endsWith('.g.dart')) {
      coverage[_normalize(source!)] = (found: found, hit: hit);
    }
    source = null;
    found = 0;
    hit = 0;
  }

  for (final line in report.readAsLinesSync()) {
    if (line.startsWith('SF:')) {
      finishRecord();
      source = line.substring(3);
    } else if (line.startsWith('LF:')) {
      found = int.parse(line.substring(3));
    } else if (line.startsWith('LH:')) {
      hit = int.parse(line.substring(3));
    } else if (line == 'end_of_record') {
      finishRecord();
    }
  }
  finishRecord();

  final missing = expected.difference(coverage.keys.toSet()).toList()..sort();
  var overallFound = 0;
  var overallHit = 0;
  var coreFound = 0;
  var coreHit = 0;
  for (final file in expected) {
    final facts = coverage[file];
    if (facts == null) continue;
    overallFound += facts.found;
    overallHit += facts.hit;
    if (file.contains(
      '${Platform.pathSeparator}lib${Platform.pathSeparator}core${Platform.pathSeparator}',
    )) {
      coreFound += facts.found;
      coreHit += facts.hit;
    }
  }

  double percent(int hit, int found) => found == 0 ? 0 : hit * 100 / found;
  final overall = percent(overallHit, overallFound);
  final core = percent(coreHit, coreFound);
  stdout.writeln(
    'Coverage: ${overall.toStringAsFixed(2)}% '
    '($overallHit/$overallFound), core: ${core.toStringAsFixed(2)}% '
    '($coreHit/$coreFound)',
  );

  var failed = false;
  if (missing.isNotEmpty) {
    failed = true;
    stderr.writeln('Files missing from coverage report:');
    for (final path in missing) {
      stderr.writeln(
        '  ${File(path).path.replaceFirst('${Directory.current.path}${Platform.pathSeparator}', '')}',
      );
    }
  }
  if (overall < _overallMinimum) {
    failed = true;
    stderr.writeln('Overall line coverage must be at least $_overallMinimum%.');
  }
  if (core < _coreMinimum) {
    failed = true;
    stderr.writeln('lib/core line coverage must be at least $_coreMinimum%.');
  }
  if (failed) exitCode = 1;
}
