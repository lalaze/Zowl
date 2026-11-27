import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:zowl_mobile/core/l10n.dart';
import 'package:zowl_mobile/core/screenshot_picker.dart';
import 'package:zowl_mobile/features/transactions/transaction_detail_screen.dart';
import 'package:zowl_mobile/main.dart' as app;

const integrationEmail = String.fromEnvironment(
  'INTEGRATION_EMAIL',
  defaultValue: 'mobile-e2e@zowl.local',
);
const integrationPassword = String.fromEnvironment(
  'INTEGRATION_PASSWORD',
  defaultValue: 'zowl-mobile-e2e',
);
const integrationRunId = String.fromEnvironment(
  'INTEGRATION_RUN_ID',
  defaultValue: 'local-run',
);

String testMarker(String flow) => 'ZE-$integrationRunId-$flow';

Finder formField(String label) => find.widgetWithText(TextFormField, label);

Finder textField(String label) => find.byWidgetPredicate(
  (widget) => widget is TextField && widget.decoration?.labelText == label,
);

Finder get amountField => find.byType(TextFormField).first;

// The entry form also contains a "Transaction details" section heading.
Finder get transactionDetailScreen => find.byType(TransactionDetailScreen);

class DeviceFixtureScreenshotPicker implements ScreenshotPicker {
  File? _fixture;

  @override
  Future<List<XFile>> pickScreenshots({int limit = 10}) async {
    final file = _fixture ??= await _writeFixture();
    return [XFile(file.path, name: 'zowl-e2e.png', mimeType: 'image/png')];
  }

  Future<File> _writeFixture() async {
    final directory = await Directory.systemTemp.createTemp('zowl-e2e-');
    final file = File('${directory.path}/zowl-e2e.png');
    await file.writeAsBytes(
      base64Decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      ),
      flush: true,
    );
    return file;
  }

  Future<void> dispose() async {
    final fixture = _fixture;
    if (fixture != null && await fixture.parent.exists()) {
      await fixture.parent.delete(recursive: true);
    }
  }
}

Future<void> boundedSettle(
  WidgetTester tester, {
  Duration duration = const Duration(seconds: 1),
}) async {
  await tester.pump(duration);
}

Future<void> waitFor(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 45),
  String? description,
}) async {
  final attempts = timeout.inMilliseconds ~/ 500;
  for (var attempt = 0; attempt < attempts; attempt++) {
    if (finder.evaluate().isNotEmpty) return;
    await tester.pump(const Duration(milliseconds: 500));
  }
  fail(description ?? 'Timed out waiting for UI element:$finder');
}

Future<void> waitForHomeOrLogin(WidgetTester tester) async {
  for (var attempt = 0; attempt < 90; attempt++) {
    if (find.text('Balance this month').evaluate().isNotEmpty ||
        find.text('Open Zowl').evaluate().isNotEmpty) {
      return;
    }
    await tester.pump(const Duration(milliseconds: 500));
  }
  fail('Neither home nor login appeared after launch');
}

Future<void> startApp(
  WidgetTester tester, {
  ScreenshotPicker? screenshotPicker,
}) async {
  // Device tests assert English copy whatever language the phone uses.
  final preferences = await SharedPreferences.getInstance();
  await preferences.setString(languagePreferenceKey, AppLanguage.en.name);
  await app.runZowl(screenshotPicker: screenshotPicker);
  await tester.pump();
  await waitForHomeOrLogin(tester);
}

Future<void> signIn(WidgetTester tester) async {
  await tester.enterText(formField('Email'), integrationEmail);
  await tester.enterText(formField('Password'), integrationPassword);
  await tester.tap(find.text('Open Zowl'));
  await waitFor(
    tester,
    find.text('Balance this month'),
    description: 'Home did not appear after login',
  );
}

Future<void> startAndSignIn(
  WidgetTester tester, {
  ScreenshotPicker? screenshotPicker,
}) async {
  await startApp(tester, screenshotPicker: screenshotPicker);
  if (find.text('Open Zowl').evaluate().isNotEmpty) {
    await signIn(tester);
  }
  await waitFor(tester, find.text('Balance this month'));
}

/// Closes the open modal bottom sheet the way a user does, by tapping the
/// barrier above it. A fixed tap point is not enough: on shorter screens, or
/// with the keyboard up, a tall sheet reaches above it.
Future<void> dismissSheet(WidgetTester tester) async {
  FocusManager.instance.primaryFocus?.unfocus();
  await boundedSettle(tester, duration: const Duration(milliseconds: 500));
  final sheet = find.byType(BottomSheet);
  if (sheet.evaluate().isEmpty) return;
  final top = tester.getTopLeft(sheet.last).dy;
  if (top > 16) {
    await tester.tapAt(Offset(20, top / 2));
  } else {
    Navigator.of(tester.element(sheet.last)).pop();
  }
  for (
    var attempt = 0;
    attempt < 20 && sheet.evaluate().isNotEmpty;
    attempt++
  ) {
    await tester.pump(const Duration(milliseconds: 250));
  }
  expect(sheet, findsNothing, reason: 'Bottom sheet did not close');
}

Future<void> tapNavigation(
  WidgetTester tester,
  String label,
  Finder marker,
) async {
  // Wait until the tab is tappable: during a route transition (iOS slides the
  // previous page back in from the left) the navigator ignores pointers.
  final tab = find.text(label).hitTestable();
  await waitFor(tester, tab, description: 'Navigation tab $label not tappable');
  await tester.tap(tab.last);
  await waitFor(tester, marker, description: 'Did not open $label page');
}

/// Types into a field of a lazily built form list. While a keyboard is up, or
/// still animating, the list is shorter and a field below the fold may be
/// unbuilt at any moment. So drop the previous field's keyboard and let the
/// layout settle first, then scroll until the field exists before typing.
Future<void> enterScrollable(
  WidgetTester tester,
  Finder field,
  String text,
) async {
  FocusManager.instance.primaryFocus?.unfocus();
  await boundedSettle(tester, duration: const Duration(milliseconds: 1200));
  for (var attempt = 0; attempt < 8 && field.evaluate().isEmpty; attempt++) {
    final lists = find.byType(ListView);
    if (lists.evaluate().isEmpty) break;
    await tester.drag(lists.last, const Offset(0, -300));
    await boundedSettle(tester, duration: const Duration(milliseconds: 350));
  }
  expect(field, findsOneWidget, reason: 'Field not found:$field');
  await tester.ensureVisible(field);
  await boundedSettle(tester, duration: const Duration(milliseconds: 300));
  await tester.enterText(field, text);
}

Future<void> tapScrollable(WidgetTester tester, String label) async {
  FocusManager.instance.primaryFocus?.unfocus();
  await boundedSettle(tester, duration: const Duration(milliseconds: 500));
  final text = find.text(label);
  for (var attempt = 0; attempt < 8 && text.evaluate().isEmpty; attempt++) {
    final lists = find.byType(ListView);
    if (lists.evaluate().isEmpty) break;
    await tester.drag(lists.last, const Offset(0, -450));
    await boundedSettle(tester, duration: const Duration(milliseconds: 350));
  }
  final chips = find.ancestor(of: text, matching: find.byType(ChoiceChip));
  final action = chips.evaluate().isNotEmpty ? chips : text;
  expect(action, findsWidgets, reason: 'Action not found:$label');
  if (action.hitTestable().evaluate().isEmpty) {
    await tester.ensureVisible(action.last);
    await boundedSettle(tester, duration: const Duration(milliseconds: 500));
  }
  await tester.tap(action.last);
  await boundedSettle(tester);
}

Future<void> waitForDetailOrDuplicate(WidgetTester tester) async {
  for (var attempt = 0; attempt < 90; attempt++) {
    if (transactionDetailScreen.evaluate().isNotEmpty ||
        find.text('Post anyway').evaluate().isNotEmpty) {
      return;
    }
    await tester.pump(const Duration(milliseconds: 500));
  }
  fail(
    'Neither transaction details nor duplicate confirmation appeared after submission',
  );
}

Future<void> acceptDuplicateIfShown(WidgetTester tester) async {
  if (find.text('Post anyway').evaluate().isNotEmpty) {
    await tester.tap(find.text('Post anyway'));
    await waitFor(tester, transactionDetailScreen);
  }
}

Future<void> voidCurrentTransaction(WidgetTester tester) async {
  await waitFor(
    tester,
    find.text('Void'),
    description: 'Void action was missing after transaction details loaded',
  );
  await tapScrollable(tester, 'Void');
  await waitFor(tester, find.text('Void this transaction?'));
  await tester.tap(find.text('Confirm void'));
  await waitFor(tester, find.text('Activity'));
}

/// Opens one of the three entries behind the centre add button.
Future<void> openAddEntry(
  WidgetTester tester,
  String entry,
  Finder marker,
) async {
  await tester.tap(find.byTooltip('Add to ledger'));
  await waitFor(tester, find.text(entry));
  await tester.tap(find.text(entry));
  await waitFor(tester, marker, description: 'Did not open $entry');
}

Future<void> logoutFromSettings(WidgetTester tester) async {
  await tapScrollable(tester, 'Account and session');
  await waitFor(tester, find.text('Sign out'));
  await tester.tap(find.text('Sign out'));
  await waitFor(tester, find.text('Open Zowl'));
}
