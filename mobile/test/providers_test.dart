import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zowl_mobile/core/api.dart';
import 'package:zowl_mobile/core/providers.dart';
import 'package:zowl_mobile/core/theme.dart';

import 'support/fixtures.dart';
import 'support/test_harness.dart';

ApiException _apiError(int statusCode, String message) =>
    ApiException(statusCode: statusCode, code: 'TEST_ERROR', message: message);

ProviderContainer _container(MobileTestHarness harness) =>
    ProviderContainer(overrides: harness.overrides, retry: (_, _) => null);

void main() {
  test('authentication stays signed out when no device token exists', () async {
    final harness = await MobileTestHarness.create(token: null);
    final container = _container(harness);
    addTearDown(container.dispose);

    final user = await container.read(authControllerProvider.future);

    expect(user, isNull);
    expect(harness.repository.sessionCalls, 0);
  });

  test(
    'authentication restores valid sessions and treats a 401 as signed out',
    () async {
      final validHarness = await MobileTestHarness.create();
      validHarness.capture.enableForTest();
      final validContainer = _container(validHarness);
      addTearDown(validContainer.dispose);
      expect(
        await validContainer.read(authControllerProvider.future),
        testUser,
      );
      expect(validHarness.capture.configuredUserId, testUser.id);

      final expiredHarness = await MobileTestHarness.create();
      expiredHarness.repository.sessionHandler = () async =>
          throw _apiError(401, 'Sign in first');
      final expiredContainer = _container(expiredHarness);
      addTearDown(expiredContainer.dispose);

      expect(
        await expiredContainer.read(authControllerProvider.future),
        isNull,
      );
    },
  );

  test(
    'non-authentication session failures remain visible to the app',
    () async {
      final harness = await MobileTestHarness.create();
      harness.repository.sessionHandler = () async =>
          throw _apiError(503, 'Service temporarily unavailable');
      final container = _container(harness);
      addTearDown(container.dispose);

      await expectLater(
        container.read(authControllerProvider.future),
        throwsA(
          isA<ApiException>().having(
            (error) => error.message,
            'message',
            'Service temporarily unavailable',
          ),
        ),
      );
    },
  );

  test(
    'login, profile replacement, and logout update observable auth state',
    () async {
      final harness = await MobileTestHarness.create(token: null);
      harness.capture.enableForTest();
      final container = _container(harness);
      addTearDown(container.dispose);
      await container.read(authControllerProvider.future);
      final controller = container.read(authControllerProvider.notifier);

      await controller.login('test@zowl.local', 'secret');
      expect(container.read(authControllerProvider).value, testUser);
      expect(harness.repository.loginCalls, 1);
      expect(harness.capture.configuredUserId, testUser.id);

      controller.replaceUser(testUser.copyWith(displayName: 'New nickname'));
      expect(
        container.read(authControllerProvider).value?.displayName,
        'New nickname',
      );

      await controller.logout();
      expect(container.read(authControllerProvider).value, isNull);
      expect(harness.repository.logoutCalls, 1);
    },
  );

  test(
    'failed login returns to signed out and rethrows the public API error',
    () async {
      final harness = await MobileTestHarness.create(token: null);
      harness.repository.loginHandler = (_, _) async =>
          throw _apiError(401, 'Incorrect email or password');
      final container = _container(harness);
      addTearDown(container.dispose);
      await container.read(authControllerProvider.future);

      await expectLater(
        container
            .read(authControllerProvider.notifier)
            .login('test@zowl.local', 'bad'),
        throwsA(isA<ApiException>()),
      );
      expect(container.read(authControllerProvider).value, isNull);
    },
  );

  test(
    'session invalidation causes the authenticated user to be reloaded',
    () async {
      final harness = await MobileTestHarness.create();
      final container = _container(harness);
      addTearDown(container.dispose);
      await container.read(authControllerProvider.future);
      harness.repository.user = testUser.copyWith(
        displayName: 'Server nickname',
      );

      container.read(sessionInvalidationProvider.notifier).invalidateSession();
      final user = await container.read(authControllerProvider.future);

      expect(user?.displayName, 'Server nickname');
      expect(harness.repository.sessionCalls, 2);
    },
  );

  test(
    'appearance changes are observable and persisted independently',
    () async {
      final harness = await MobileTestHarness.create();
      final container = _container(harness);
      addTearDown(container.dispose);
      final controller = container.read(appearanceProvider.notifier);

      await controller.setMode(ThemeMode.dark);
      await controller.setAccent(AccentColor.forest);

      expect(container.read(appearanceProvider).mode, ThemeMode.dark);
      expect(container.read(appearanceProvider).accent, AccentColor.forest);
      expect(harness.preferences.getString('zemoney-theme'), 'dark');
      expect(harness.preferences.getString('zemoney-accent'), 'forest');
    },
  );

  test(
    'family providers forward public identifiers without reshaping them',
    () async {
      final harness = await MobileTestHarness.create();
      String? statisticsKey;
      String? transactionId;
      harness.repository.statisticsHandler = (month, currency) async {
        statisticsKey = '$month|$currency';
        return testStatistics;
      };
      harness.repository.transactionHandler = (id) async {
        transactionId = id;
        return testTransaction;
      };
      final container = _container(harness);
      addTearDown(container.dispose);

      await container.read(categoriesProvider.future);
      await container.read(statisticsProvider('2026-06|USD').future);
      await container.read(transactionProvider('tx-public').future);
      await container.read(recognitionProviderInfoProvider.future);

      expect(statisticsKey, '2026-06|USD');
      expect(transactionId, 'tx-public');
    },
  );
}
