import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'support/device_test_support.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'explores statistics and restores profile, appearance, and session',
    (tester) async {
      final temporaryName = testMarker('profile');
      await startAndSignIn(tester);

      await tapNavigation(
        tester,
        'Insights',
        find.text('Net spending this month'),
      );
      await tapScrollable(tester, 'Category');
      await waitFor(tester, find.text('Where your money goes'));
      await tapScrollable(tester, 'Source');
      await waitFor(tester, find.text('Payment source'));
      await tester.tap(find.byTooltip('Previous month'));
      await boundedSettle(tester, duration: const Duration(seconds: 2));

      await tapNavigation(tester, 'Me', find.text('Personal details'));
      await tapScrollable(tester, 'Personal details');
      await tester.enterText(textField('Nickname'), temporaryName);
      await tester.tap(find.text('Save nickname'));
      await waitFor(tester, find.text('Nickname updated'));
      await tester.tap(find.bySemanticsLabel('Change avatar: Cat'));
      await boundedSettle(tester);
      await tester.enterText(textField('Nickname'), 'Ze');
      await tester.tap(find.text('Save nickname'));
      await waitFor(tester, find.text('Nickname updated'));
      await tester.tap(find.bySemanticsLabel('Change avatar: Piggy bank'));
      await boundedSettle(tester);
      await dismissSheet(tester);

      await tapScrollable(tester, 'Appearance');
      await tapScrollable(tester, 'Dark');
      await tapScrollable(tester, 'Forest');
      await dismissSheet(tester);
      await waitFor(tester, find.text('Dark mode · Forest'));

      await tapScrollable(tester, 'Appearance');
      await tapScrollable(tester, 'System');
      await tapScrollable(tester, 'Amber');
      await dismissSheet(tester);
      await waitFor(tester, find.text('Follow system · Amber'));

      await logoutFromSettings(tester);
    },
  );
}
