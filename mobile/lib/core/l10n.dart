import 'dart:ui' show Locale, PlatformDispatcher;

import 'package:shared_preferences/shared_preferences.dart';

/// The UI language picked in Settings. [system] follows the device language.
enum AppLanguage { system, zh, en }

const languagePreferenceKey = 'zowl-language';

const englishLocale = Locale('en', 'US');
const chineseLocale = Locale('zh', 'CN');
const supportedAppLocales = [englishLocale, chineseLocale];

// The resolved language is process-wide so plain helpers (formatters, model
// labels, API headers) can localize without a BuildContext. The app marks
// every element dirty when it changes, so nothing keeps stale copy.
bool _zh = false;

/// Whether the UI currently shows Chinese.
bool get isZh => _zh;

/// Picks the copy for the current UI language: `tr('Save', '保存')`.
String tr(String en, String zh) => _zh ? zh : en;

/// Locale name for `intl` formatters (`DateFormat`, `NumberFormat`).
String get intlLocale => _zh ? 'zh_CN' : 'en_US';

/// Locale handed to `MaterialApp` so Material widgets match the copy.
Locale get appLocale => _zh ? chineseLocale : englishLocale;

/// Value for the `Accept-Language` header so server messages match the UI.
String get acceptLanguage => _zh ? 'zh-CN,zh;q=0.9,en;q=0.5' : 'en-US,en;q=0.9';

bool resolvesToChinese(AppLanguage language, [Locale? deviceLocale]) =>
    switch (language) {
      AppLanguage.zh => true,
      AppLanguage.en => false,
      AppLanguage.system =>
        (deviceLocale ?? PlatformDispatcher.instance.locale).languageCode ==
            'zh',
    };

/// Resolves [language] and makes it current. Returns whether the UI language
/// changed, i.e. whether already-built widgets now show stale copy.
bool applyLanguage(AppLanguage language, [Locale? deviceLocale]) {
  final next = resolvesToChinese(language, deviceLocale);
  if (next == _zh) return false;
  _zh = next;
  return true;
}

AppLanguage readLanguage(SharedPreferences preferences) {
  final name = preferences.getString(languagePreferenceKey);
  return AppLanguage.values.firstWhere(
    (value) => value.name == name,
    orElse: () => AppLanguage.system,
  );
}

/// The language's own name, so people can find theirs whatever is showing.
String languageName(AppLanguage language) => switch (language) {
  AppLanguage.system => tr('System', '跟随系统'),
  AppLanguage.zh => '中文',
  AppLanguage.en => 'English',
};
