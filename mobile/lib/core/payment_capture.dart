import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class PaymentCaptureDiagnostic {
  const PaymentCaptureDiagnostic({
    required this.platform,
    required this.parserId,
    required this.parserVersion,
    required this.outcome,
    required this.count,
    this.reason,
  });

  final String platform;
  final String parserId;
  final int parserVersion;
  final String outcome;
  final String? reason;
  final int count;

  factory PaymentCaptureDiagnostic.fromMap(Map<dynamic, dynamic> map) =>
      PaymentCaptureDiagnostic(
        platform: map['platform']?.toString() ?? '',
        parserId: map['parserId']?.toString() ?? '',
        parserVersion: (map['parserVersion'] as num?)?.toInt() ?? 0,
        outcome: map['outcome']?.toString() ?? '',
        reason: map['reason']?.toString(),
        count: (map['count'] as num?)?.toInt() ?? 0,
      );
}

class PaymentCaptureStatus {
  const PaymentCaptureStatus({
    required this.supported,
    required this.enabled,
    required this.alipayEnabled,
    required this.wechatEnabled,
    required this.queuedCount,
    required this.authPaused,
    this.taobaoEnabled = false,
    this.pinduoduoEnabled = false,
    this.jdEnabled = false,
    this.pupuEnabled = false,
    this.orderDetailsEnabled = false,
    this.accessibilityAccessGranted = false,
    this.accessibilityConnected = false,
    this.lastCaptureAt,
    this.syncError,
    this.diagnostics = const [],
  });

  const PaymentCaptureStatus.unsupported()
    : accessibilityAccessGranted = false,
      accessibilityConnected = false,
      supported = false,
      enabled = false,
      alipayEnabled = false,
      wechatEnabled = false,
      taobaoEnabled = false,
      pinduoduoEnabled = false,
      jdEnabled = false,
      pupuEnabled = false,
      orderDetailsEnabled = false,
      queuedCount = 0,
      authPaused = false,
      lastCaptureAt = null,
      syncError = null,
      diagnostics = const [];

  final bool accessibilityAccessGranted;
  final bool accessibilityConnected;

  final bool supported;
  final bool enabled;
  final bool alipayEnabled;
  final bool wechatEnabled;
  final bool taobaoEnabled;
  final bool pinduoduoEnabled;
  final bool jdEnabled;
  final bool pupuEnabled;

  /// Whether order-page text is uploaded so the server can list the goods.
  final bool orderDetailsEnabled;
  final int queuedCount;
  final bool authPaused;
  final int? lastCaptureAt;
  final String? syncError;
  final List<PaymentCaptureDiagnostic> diagnostics;

  @Deprecated('Use syncError.')
  String? get lastError => syncError;

  factory PaymentCaptureStatus.fromMap(Map<dynamic, dynamic> map) =>
      PaymentCaptureStatus(
        accessibilityAccessGranted: map['accessibilityAccessGranted'] == true,
        accessibilityConnected: map['accessibilityConnected'] == true,
        supported: map['supported'] == true,
        enabled: map['enabled'] == true,
        alipayEnabled: map['alipayEnabled'] == true,
        wechatEnabled: map['wechatEnabled'] == true,
        taobaoEnabled: map['taobaoEnabled'] == true,
        pinduoduoEnabled: map['pinduoduoEnabled'] == true,
        jdEnabled: map['jdEnabled'] == true,
        pupuEnabled: map['pupuEnabled'] == true,
        orderDetailsEnabled: map['orderDetailsEnabled'] == true,
        queuedCount: (map['queuedCount'] as num?)?.toInt() ?? 0,
        authPaused: map['authPaused'] == true,
        lastCaptureAt: (map['lastCaptureAt'] as num?)?.toInt(),
        syncError: (map['syncError'] ?? map['lastError'])?.toString(),
        diagnostics:
            (map['diagnostics'] as List<dynamic>?)
                ?.whereType<Map<dynamic, dynamic>>()
                .map(PaymentCaptureDiagnostic.fromMap)
                .where(
                  (entry) =>
                      entry.platform.isNotEmpty &&
                      entry.parserId.isNotEmpty &&
                      entry.parserVersion > 0 &&
                      entry.count > 0,
                )
                .toList(growable: false) ??
            const [],
      );
}

abstract class PaymentCaptureBridge {
  Stream<String> get routes;
  Future<PaymentCaptureStatus> getStatus();
  Future<void> openAccessibilitySettings();
  Future<void> requestNotificationPermission();
  Future<PaymentCaptureStatus> setEnabled(bool enabled);
  Future<PaymentCaptureStatus> setSourceEnabled(String platform, bool enabled);
  Future<PaymentCaptureStatus> setOrderDetailsEnabled(bool enabled);
  Future<void> configureSession(String apiBaseUrl, String token, String userId);
  Future<void> pauseSession();
  Future<void> clearSession();
  Future<void> flushNow();
  Future<PaymentCaptureStatus> resetDiagnostics();

  /// Opens the share sheet with the on-device capture log; false when there is none.
  Future<bool> exportCaptureLog();
  Future<String?> takePendingRoute();
}

class SystemPaymentCaptureBridge implements PaymentCaptureBridge {
  SystemPaymentCaptureBridge() {
    if (_supported) {
      _channel.setMethodCallHandler((call) async {
        if (call.method == 'captureRoute' && call.arguments is String) {
          _routes.add(call.arguments as String);
        }
      });
    }
  }

  static const _channel = MethodChannel('com.zowl.mobile/payment_capture');
  final _routes = StreamController<String>.broadcast();

  bool get _supported =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  Future<T> _invoke<T>(
    String method, {
    dynamic arguments,
    required T fallback,
  }) async {
    if (!_supported) return fallback;
    try {
      final value = await _channel.invokeMethod<T>(method, arguments);
      return value ?? fallback;
    } on MissingPluginException {
      // Unit/widget tests and older installed builds may not have the native
      // capture channel yet. Treat those environments as unsupported.
      return fallback;
    }
  }

  Future<Map<dynamic, dynamic>> _invokeMap(
    String method, [
    dynamic arguments,
  ]) async {
    if (!_supported) return const {};
    try {
      return await _channel.invokeMapMethod<dynamic, dynamic>(
            method,
            arguments,
          ) ??
          const {};
    } on MissingPluginException {
      return const {};
    }
  }

  @override
  Stream<String> get routes => _routes.stream;

  @override
  Future<PaymentCaptureStatus> getStatus() async {
    if (!_supported) return const PaymentCaptureStatus.unsupported();
    final value = await _invokeMap('getStatus');
    if (value.isEmpty) return const PaymentCaptureStatus.unsupported();
    return PaymentCaptureStatus.fromMap(value);
  }

  @override
  Future<void> openAccessibilitySettings() async {
    await _invoke<void>('openAccessibilitySettings', fallback: null);
  }

  @override
  Future<void> requestNotificationPermission() async {
    await _invoke<void>('requestNotificationPermission', fallback: null);
  }

  @override
  Future<PaymentCaptureStatus> setEnabled(bool enabled) async {
    if (!_supported) return const PaymentCaptureStatus.unsupported();
    final value = await _invokeMap('setEnabled', {'enabled': enabled});
    if (value.isEmpty) return const PaymentCaptureStatus.unsupported();
    return PaymentCaptureStatus.fromMap(value);
  }

  @override
  Future<PaymentCaptureStatus> setSourceEnabled(
    String platform,
    bool enabled,
  ) async {
    if (!_supported) return const PaymentCaptureStatus.unsupported();
    final value = await _invokeMap('setSourceEnabled', {
      'platform': platform,
      'enabled': enabled,
    });
    if (value.isEmpty) return const PaymentCaptureStatus.unsupported();
    return PaymentCaptureStatus.fromMap(value);
  }

  @override
  Future<PaymentCaptureStatus> setOrderDetailsEnabled(bool enabled) async {
    if (!_supported) return const PaymentCaptureStatus.unsupported();
    final value = await _invokeMap('setOrderDetailsEnabled', {
      'enabled': enabled,
    });
    if (value.isEmpty) return const PaymentCaptureStatus.unsupported();
    return PaymentCaptureStatus.fromMap(value);
  }

  @override
  Future<void> configureSession(
    String apiBaseUrl,
    String token,
    String userId,
  ) async {
    await _invoke<void>(
      'configureSession',
      arguments: {'apiBaseUrl': apiBaseUrl, 'token': token, 'userId': userId},
      fallback: null,
    );
  }

  @override
  Future<void> pauseSession() async {
    await _invoke<void>('pauseSession', fallback: null);
  }

  @override
  Future<void> clearSession() async {
    await _invoke<void>('clearSession', fallback: null);
  }

  @override
  Future<void> flushNow() async {
    await _invoke<void>('flushNow', fallback: null);
  }

  @override
  Future<PaymentCaptureStatus> resetDiagnostics() async {
    if (!_supported) return const PaymentCaptureStatus.unsupported();
    final value = await _invokeMap('resetDiagnostics');
    if (value.isEmpty) return const PaymentCaptureStatus.unsupported();
    return PaymentCaptureStatus.fromMap(value);
  }

  @override
  Future<bool> exportCaptureLog() =>
      _invoke<bool>('exportCaptureLog', fallback: false);

  @override
  Future<String?> takePendingRoute() async {
    return _invoke<String?>('takePendingRoute', fallback: null);
  }
}
