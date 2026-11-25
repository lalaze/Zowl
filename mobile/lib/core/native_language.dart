import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'l10n.dart';

final nativeLanguageBridgeProvider = Provider<NativeLanguageBridge>(
  (ref) => const NativeLanguageBridge(),
);

/// Tells Android which language the app shows, so its notifications, toasts,
/// Quick Settings tile, capture errors and requests to the server match it,
/// also while Flutter isn't running (NativeLanguage.kt keeps the choice).
class NativeLanguageBridge {
  const NativeLanguageBridge();

  static const channel = MethodChannel('com.zowl.mobile/language');

  Future<void> setLanguage(AppLanguage language) async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
    try {
      await channel.invokeMethod<void>('setLanguage', {
        'language': language.name,
      });
    } on MissingPluginException {
      // Widget tests and builds without the native side: nothing to tell.
    } on PlatformException {
      // Native text keeps its previous language; the app itself is unaffected.
    }
  }
}
