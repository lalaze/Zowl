import 'l10n.dart';

/// Part of the day the sky is painted for. Dark mode keeps the hour with a
/// darker sky, so daytime still reads as day without a bright block on a dark
/// page.
enum SceneTime { dawn, day, dusk, night }

/// Replaces the clock behind the sky and greeting, so previews and tests
/// render the same scene at any hour.
DateTime Function()? debugStoryClock;

DateTime storyNow() => (debugStoryClock ?? DateTime.now)();

SceneTime sceneTimeFor(DateTime now) => switch (now.hour) {
  >= 5 && < 8 => SceneTime.dawn,
  >= 8 && < 17 => SceneTime.day,
  >= 17 && < 19 => SceneTime.dusk,
  _ => SceneTime.night,
};

/// When the sky after [now] changes next.
DateTime nextSceneChange(DateTime now) {
  for (final hour in const [5, 8, 17, 19]) {
    if (now.hour < hour) return DateTime(now.year, now.month, now.day, hour);
  }
  return DateTime(now.year, now.month, now.day + 1, 5);
}

String greetingFor(DateTime now) => switch (now.hour) {
  >= 5 && < 12 => tr('Good morning', '早上好'),
  >= 12 && < 18 => tr('Good afternoon', '下午好'),
  _ => tr('Good evening', '晚上好'),
};
