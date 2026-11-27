import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:zowl_mobile/core/config.dart';
import 'package:zowl_mobile/core/providers.dart';
import 'package:zowl_mobile/core/screenshot_picker.dart';
import 'package:zowl_mobile/main.dart';

class _InjectedPicker implements ScreenshotPicker {
  @override
  Future<List<XFile>> pickScreenshots({int limit = 10}) async => const [];
}

void main() {
  testWidgets('device bootstrap installs the supplied screenshot boundary', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    final picker = _InjectedPicker();

    await runZowl(
      screenshotPicker: picker,
      config: ApiConfig.parse('https://money.example.com', release: false),
    );
    await tester.pump();

    final element = tester.element(find.byType(ZowlApp));
    final container = ProviderScope.containerOf(element);
    expect(container.read(screenshotPickerProvider), same(picker));
  });
}
