import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zowl_mobile/core/api.dart';
import 'package:zowl_mobile/core/models.dart';
import 'package:zowl_mobile/features/auth/login_screen.dart';

import 'support/fixtures.dart';
import 'support/test_harness.dart';

Finder _field(String label) => find.widgetWithText(TextFormField, label);

const _session = TokenSession(
  tokenType: 'Bearer',
  accessToken: 'token',
  expiresAt: '2026-08-01T00:00:00.000Z',
  user: testUser,
);

void main() {
  testWidgets(
    'login validates email and password before contacting the server',
    (tester) async {
      final harness = await MobileTestHarness.create(token: null);
      await tester.pumpWidget(harness.screen(const LoginScreen()));
      await tester.enterText(_field('Email'), 'invalid');
      await tester.enterText(_field('Password'), '');

      await tester.ensureVisible(find.text('Open Zowl'));
      await tester.tap(find.text('Open Zowl'));
      await tester.pump();

      expect(find.text('Enter a valid email address'), findsOneWidget);
      expect(find.text('Enter your password'), findsOneWidget);
      expect(harness.repository.loginCalls, 0);
    },
  );

  testWidgets('login exposes password visibility and the submitting state', (
    tester,
  ) async {
    final harness = await MobileTestHarness.create(token: null);
    final completer = Completer<TokenSession>();
    harness.repository.loginHandler = (_, _) => completer.future;
    await tester.pumpWidget(harness.screen(const LoginScreen()));

    expect(find.byTooltip('Show password'), findsOneWidget);
    await tester.ensureVisible(find.byTooltip('Show password'));
    await tester.tap(find.byTooltip('Show password'));
    await tester.pump();
    expect(find.byTooltip('Hide password'), findsOneWidget);

    await tester.ensureVisible(find.text('Open Zowl'));
    await tester.tap(find.text('Open Zowl'));
    await tester.pump();
    expect(find.text('Signing in…'), findsOneWidget);
    await tester.tap(find.text('Signing in…'));
    await tester.pump();
    expect(harness.repository.loginCalls, 1);

    completer.complete(_session);
    await tester.pumpAndSettle();
    expect(harness.repository.loginCalls, 1);
    expect(find.text('Open Zowl'), findsOneWidget);
  });

  testWidgets(
    'login renders API and unexpected failures without losing the form',
    (tester) async {
      final harness = await MobileTestHarness.create(token: null);
      harness.repository.loginHandler = (_, _) async =>
          throw const ApiException(
            statusCode: 401,
            code: 'INVALID_CREDENTIALS',
            message: 'Incorrect email or password',
          );
      await tester.pumpWidget(harness.screen(const LoginScreen()));

      await tester.ensureVisible(find.text('Open Zowl'));
      await tester.tap(find.text('Open Zowl'));
      await tester.pumpAndSettle();
      expect(
        find.text('Incorrect email or password. Check both and try again'),
        findsOneWidget,
      );

      harness.repository.loginHandler = (_, _) async =>
          throw StateError('offline');
      await tester.ensureVisible(find.text('Open Zowl'));
      await tester.tap(find.text('Open Zowl'));
      await tester.pumpAndSettle();
      expect(find.text('Login failed. Try again later'), findsOneWidget);
      expect(find.byType(TextFormField), findsNWidgets(2));
    },
  );
}
