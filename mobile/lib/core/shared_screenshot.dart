import 'dart:async';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

class SharedScreenshotBridge {
  static const _channel = MethodChannel('com.zowl.mobile/screenshot_share');
  final _available = StreamController<void>.broadcast();
  Stream<void> get available => _available.stream;

  SharedScreenshotBridge() {
    _channel.setMethodCallHandler((call) async {
      if (call.method == 'sharedScreenshotAvailable') _available.add(null);
    });
  }

  Future<XFile?> take() async {
    try {
      final value = await _channel.invokeMapMethod<String, dynamic>(
        'takePendingScreenshot',
      );
      if (value == null) return null;
      if (value['error'] != null) throw StateError(value['error'].toString());
      final bytes = value['bytes'];
      if (bytes is! Uint8List ||
          bytes.isEmpty ||
          bytes.length > 8 * 1024 * 1024) {
        return null;
      }
      final name = value['name']?.toString() ?? 'shared-screenshot.png';
      return XFile.fromData(bytes, name: name, path: name);
    } on MissingPluginException {
      return null;
    }
  }

  void dispose() {
    _channel.setMethodCallHandler(null);
    _available.close();
  }
}
