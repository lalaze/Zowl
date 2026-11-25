import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final localOcrBridgeProvider = Provider<LocalOcrBridge>(
  (ref) => LocalOcrBridge(),
);

enum LocalOcrTileAddResult {
  added,
  alreadyAdded,
  notAdded,
  inProgress,
  unavailable,
}

class LocalOcrDraft {
  const LocalOcrDraft({
    required this.id,
    required this.owner,
    required this.platform,
    required this.remainingMs,
    this.amount,
    this.merchant,
    this.warning,
  });
  final String id;
  final String owner;
  final String platform;
  final int remainingMs;
  final String? amount;
  final String? merchant;
  final String? warning;

  static LocalOcrDraft? fromMap(Map<dynamic, dynamic>? value, String owner) {
    if (value == null ||
        value['owner'] != owner ||
        value['id'] is! String ||
        (value['id'] as String).isEmpty ||
        value['remainingMs'] is! int ||
        (value['remainingMs'] as int) <= 0 ||
        (value['remainingMs'] as int) > 300000 ||
        !const ['wechat', 'alipay'].contains(value['platform'])) {
      return null;
    }
    return LocalOcrDraft(
      id: value['id'] as String,
      owner: owner,
      platform: value['platform'] as String,
      remainingMs: value['remainingMs'] as int,
      amount: value['amount'] as String?,
      merchant: value['merchant'] as String?,
      warning: value['warning'] as String?,
    );
  }
}

/// Only minimal hints cross this channel. Never images, OCR text or credentials.
class LocalOcrBridge {
  static const channel = MethodChannel('com.zowl.mobile/local_ocr');

  Future<T?> _call<T>(String method, [Map<String, dynamic>? args]) async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return null;
    try {
      return await channel.invokeMethod<T>(method, args);
    } on MissingPluginException {
      return null;
    }
  }

  Future<Map<dynamic, dynamic>> status() async =>
      await _call<Map<dynamic, dynamic>>('status') ?? const {};
  Future<LocalOcrTileAddResult> requestAddTile() async {
    try {
      return switch (await _call<String>('requestAddTile')) {
        'added' => LocalOcrTileAddResult.added,
        'already_added' => LocalOcrTileAddResult.alreadyAdded,
        'not_added' => LocalOcrTileAddResult.notAdded,
        'in_progress' => LocalOcrTileAddResult.inProgress,
        _ => LocalOcrTileAddResult.unavailable,
      };
    } on PlatformException {
      return LocalOcrTileAddResult.unavailable;
    }
  }

  Future<Map<dynamic, dynamic>> diagnostics() async =>
      await _call<Map<dynamic, dynamic>>('diagnostics') ?? const {};
  Future<void> resetDiagnostics() => _call<void>('resetDiagnostics');
  Future<void> bindOwner(String? owner) =>
      _call<void>('bindOwner', {'owner': owner});
  Future<void> setEnabled(bool enabled) =>
      _call<void>('setEnabled', {'enabled': enabled});
  Future<void> openAccess() => _call<void>('openAccess');
  Future<LocalOcrDraft?> takeDraft(String owner) async => LocalOcrDraft.fromMap(
    await _call<Map<dynamic, dynamic>>('takeDraft', {'owner': owner}),
    owner,
  );
  Future<bool> validate(LocalOcrDraft draft) async =>
      await _call<bool>('validate', {'id': draft.id, 'owner': draft.owner}) ??
      false;
  Future<void> discard(String id) => _call<void>('discard', {'id': id});
  Future<void> protectReview(bool visible) =>
      _call<void>('protectReview', {'visible': visible});
}
