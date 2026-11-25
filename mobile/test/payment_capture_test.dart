import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zemoney_mobile/core/payment_capture.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('com.zowl.mobile/payment_capture');

  test('decodes native payment capture status', () {
    final status = PaymentCaptureStatus.fromMap({
      'supported': true,
      'enabled': true,
      'accessibilityAccessGranted': true,
      'accessibilityConnected': false,
      'alipayEnabled': true,
      'wechatEnabled': false,
      'jdEnabled': true,
      'pupuEnabled': true,
      'queuedCount': 3,
      'authPaused': true,
      'lastCaptureAt': 1_722_000_000_000,
      'syncError': 'AUTH_REQUIRED',
      'diagnostics': [
        {
          'platform': 'alipay',
          'parserId': 'alipay_payment_page_v1',
          'parserVersion': 1,
          'outcome': 'rejected',
          'reason': 'multiple_amounts',
          'count': 4,
        },
      ],
    });

    expect(status.supported, isTrue);
    expect(status.accessibilityAccessGranted, isTrue);
    expect(status.accessibilityConnected, isFalse);
    expect(status.jdEnabled, isTrue);
    expect(status.pupuEnabled, isTrue);
    expect(status.taobaoEnabled, isFalse);
    expect(status.pinduoduoEnabled, isFalse);
    // Builds from before the goods switch do not report it.
    expect(status.orderDetailsEnabled, isFalse);
    expect(
      PaymentCaptureStatus.fromMap({
        'supported': true,
        'orderDetailsEnabled': true,
      }).orderDetailsEnabled,
      isTrue,
    );
    expect(status.queuedCount, 3);
    expect(status.authPaused, isTrue);
    expect(status.syncError, 'AUTH_REQUIRED');
    expect(status.diagnostics.single.reason, 'multiple_amounts');
    expect(status.diagnostics.single.count, 4);
  });

  test(
    'an Android test process without the native channel is unsupported',
    () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      addTearDown(() => debugDefaultTargetPlatformOverride = null);

      final status = await SystemPaymentCaptureBridge().getStatus();

      expect(status.supported, isFalse);
      expect(status.enabled, isFalse);
    },
  );

  test(
    'forwards every supported Android operation over the native channel',
    () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      final calls = <MethodCall>[];
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
            calls.add(call);
            if (call.method == 'getStatus' ||
                call.method == 'setEnabled' ||
                call.method == 'setSourceEnabled' ||
                call.method == 'setOrderDetailsEnabled' ||
                call.method == 'resetDiagnostics') {
              return {
                'supported': true,
                'accessibilityAccessGranted': true,
                'accessibilityConnected': true,
                'enabled': call.method == 'setEnabled'
                    ? (call.arguments as Map)['enabled']
                    : true,
                'alipayEnabled': true,
                'wechatEnabled': true,
                'orderDetailsEnabled':
                    call.method == 'setOrderDetailsEnabled' &&
                    (call.arguments as Map)['enabled'] == true,
                'queuedCount': 2,
                'authPaused': false,
                'diagnostics': const [],
              };
            }
            if (call.method == 'takePendingRoute') {
              return '/imports/notifications';
            }
            return null;
          });
      try {
        final bridge = SystemPaymentCaptureBridge();

        expect((await bridge.getStatus()).queuedCount, 2);
        expect((await bridge.setEnabled(false)).enabled, isFalse);
        expect(
          (await bridge.setSourceEnabled('wechat', false)).supported,
          isTrue,
        );
        expect(
          (await bridge.setOrderDetailsEnabled(true)).orderDetailsEnabled,
          isTrue,
        );
        expect(
          (await bridge.setOrderDetailsEnabled(false)).orderDetailsEnabled,
          isFalse,
        );
        await bridge.openAccessibilitySettings();
        await bridge.requestNotificationPermission();
        await bridge.configureSession(
          'https://money.example.com',
          'token-1',
          'user-1',
        );
        await bridge.pauseSession();
        await bridge.clearSession();
        await bridge.flushNow();
        expect((await bridge.resetDiagnostics()).supported, isTrue);
        expect(await bridge.takePendingRoute(), '/imports/notifications');

        expect(
          calls.map((call) => call.method),
          containsAll([
            'getStatus',
            'setEnabled',
            'setSourceEnabled',
            'setOrderDetailsEnabled',
            'openAccessibilitySettings',
            'requestNotificationPermission',
            'configureSession',
            'pauseSession',
            'clearSession',
            'flushNow',
            'resetDiagnostics',
            'takePendingRoute',
          ]),
        );
        expect(
          calls
              .where((call) => call.method == 'setOrderDetailsEnabled')
              .map((call) => call.arguments),
          [
            {'enabled': true},
            {'enabled': false},
          ],
        );
        expect(
          calls
              .singleWhere((call) => call.method == 'configureSession')
              .arguments,
          {
            'apiBaseUrl': 'https://money.example.com',
            'token': 'token-1',
            'userId': 'user-1',
          },
        );
      } finally {
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(channel, null);
        debugDefaultTargetPlatformOverride = null;
      }
    },
  );

  test('non-Android platforms keep all native operations inert', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    try {
      final bridge = SystemPaymentCaptureBridge();

      expect((await bridge.getStatus()).supported, isFalse);
      expect((await bridge.setEnabled(true)).supported, isFalse);
      expect(
        (await bridge.setSourceEnabled('alipay', true)).supported,
        isFalse,
      );
      expect((await bridge.setOrderDetailsEnabled(true)).supported, isFalse);
      await bridge.openAccessibilitySettings();
      await bridge.requestNotificationPermission();
      await bridge.configureSession(
        'https://money.example.com',
        'token-1',
        'user-1',
      );
      await bridge.pauseSession();
      await bridge.clearSession();
      await bridge.flushNow();
      expect((await bridge.resetDiagnostics()).supported, isFalse);
      expect(await bridge.takePendingRoute(), isNull);
    } finally {
      debugDefaultTargetPlatformOverride = null;
    }
  });
}
