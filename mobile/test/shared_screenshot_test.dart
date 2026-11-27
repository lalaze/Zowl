import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zowl_mobile/core/shared_screenshot.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('com.zowl.mobile/screenshot_share');
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  tearDown(() => messenger.setMockMethodCallHandler(channel, null));

  test(
    'takes a shared image in memory without requiring a local file',
    () async {
      messenger.setMockMethodCallHandler(
        channel,
        (_) async => {
          'bytes': Uint8List.fromList([1, 2, 3]),
          'name': 'receipt.png',
        },
      );
      final bridge = SharedScreenshotBridge();
      addTearDown(bridge.dispose);
      final file = await bridge.take();
      expect(file!.name, 'receipt.png');
      expect(await file.readAsBytes(), [1, 2, 3]);
    },
  );

  test('empty or unavailable share input is harmless', () async {
    final bridge = SharedScreenshotBridge();
    addTearDown(bridge.dispose);
    expect(await bridge.take(), isNull);
    for (final value in [
      null,
      {'bytes': 'bad'},
      {'bytes': Uint8List(0)},
      {'bytes': Uint8List(8 * 1024 * 1024 + 1)},
    ]) {
      messenger.setMockMethodCallHandler(channel, (_) async => value);
      expect(await bridge.take(), isNull);
    }
  });

  test(
    'reports native share errors and receives foreground share events',
    () async {
      final bridge = SharedScreenshotBridge();
      addTearDown(bridge.dispose);
      messenger.setMockMethodCallHandler(
        channel,
        (_) async => {'error': 'Image too large'},
      );
      await expectLater(bridge.take(), throwsStateError);
      final available = bridge.available.first;
      await messenger.handlePlatformMessage(
        channel.name,
        const StandardMethodCodec().encodeMethodCall(
          const MethodCall('sharedScreenshotAvailable'),
        ),
        (_) {},
      );
      await available;
    },
  );
}
