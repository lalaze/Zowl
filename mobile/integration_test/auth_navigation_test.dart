import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

import 'support/device_test_support.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'authenticates, traverses every tab and the add menu, and revokes the session',
    (tester) async {
      await startApp(tester);
      expect(find.text('Open Zowl'), findsOneWidget);
      await signIn(tester);

      for (final label in ['Home', 'Activity', 'Insights', 'Me']) {
        expect(find.text(label), findsWidgets);
      }
      await tapNavigation(tester, 'Activity', find.text('Out this month'));
      await tapNavigation(
        tester,
        'Insights',
        find.text('Net spending this month'),
      );
      await tapNavigation(tester, 'Me', find.text('Personal details'));
      await tapNavigation(tester, 'Home', find.text('Balance this month'));

      await openAddEntry(
        tester,
        'Recognize screenshots',
        find.text('Record a payment screenshot'),
      );
      await tester.pageBack();
      await waitFor(tester, find.text('Balance this month'));

      await tapNavigation(tester, 'Me', find.text('Personal details'));
      await logoutFromSettings(tester);
    },
  );
}
