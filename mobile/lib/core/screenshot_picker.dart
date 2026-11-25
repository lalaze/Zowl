import 'package:image_picker/image_picker.dart';

abstract interface class ScreenshotPicker {
  Future<List<XFile>> pickScreenshots({int limit = 10});
}

final class SystemScreenshotPicker implements ScreenshotPicker {
  SystemScreenshotPicker([ImagePicker? picker])
    : _picker = picker ?? ImagePicker();

  final ImagePicker _picker;

  @override
  Future<List<XFile>> pickScreenshots({int limit = 10}) =>
      _picker.pickMultiImage(limit: limit);
}
