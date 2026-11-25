import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zemoney_mobile/core/l10n.dart';
import 'package:zemoney_mobile/core/models.dart';
import 'package:zemoney_mobile/features/settings/admin_account_screen.dart';

import 'support/test_harness.dart';

const adminUser = SessionUser(
  id: 'admin-user',
  email: 'admin@zemoney.local',
  displayName: 'Administrator',
  avatarPreset: 'piggy',
  timezone: 'Asia/Shanghai',
  role: 'admin',
);

const accountPage = AdminAccountPage(
  items: [
    AdminAccount(
      id: 'admin-user',
      email: 'admin@zemoney.local',
      displayName: 'Administrator',
      role: 'admin',
      disabled: false,
      createdAt: '2026-07-01T00:00:00.000Z',
    ),
    AdminAccount(
      id: 'member-user',
      email: 'member@zemoney.local',
      displayName: 'Regular account',
      role: 'member',
      disabled: false,
      createdAt: '2026-07-29T00:00:00.000Z',
    ),
  ],
  pagination: Pagination(page: 1, limit: 20, total: 2, totalPages: 1),
);

Future<MobileTestHarness> showAdminScreen(WidgetTester tester) async {
  final harness = await MobileTestHarness.create();
  harness.repository.user = adminUser;
  harness.repository.adminAccountPage = accountPage;
  await tester.pumpWidget(harness.screen(const AdminAccountScreen()));
  await tester.pumpAndSettle();
  return harness;
}

void main() {
  testWidgets('administrator can create a member account', (tester) async {
    final harness = await showAdminScreen(tester);

    expect(find.text('Sole administrator'), findsOneWidget);
    expect(find.text('Regular account'), findsOneWidget);
    await tester.tap(find.text('Add account'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Login email'),
      'new@zemoney.local',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Nickname (optional)'),
      'New account',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Password'),
      'new-account-password',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Confirm password'),
      'new-account-password',
    );
    await tester.tap(find.widgetWithText(FilledButton, 'Create account'));
    await tester.pumpAndSettle();

    expect(harness.repository.adminAccountCreates, [
      {
        'email': 'new@zemoney.local',
        'displayName': 'New account',
        'password': 'new-account-password',
      },
    ]);
    expect(find.text('Account created'), findsOneWidget);
  });

  testWidgets('account management reads naturally in Chinese', (tester) async {
    applyLanguage(AppLanguage.zh);
    addTearDown(() => applyLanguage(AppLanguage.en));
    await showAdminScreen(tester);

    expect(find.text('账号管理'), findsOneWidget);
    expect(find.text('共 2 个账号'), findsOneWidget);
    expect(find.text('唯一管理员'), findsOneWidget);
    expect(find.text('当前账号'), findsOneWidget);
    expect(find.text('使用中'), findsOneWidget);
    // Account names are user data and stay as entered.
    expect(find.text('Regular account'), findsOneWidget);

    await tester.tap(find.text('新增账号'));
    await tester.pumpAndSettle();
    expect(find.text('新增普通账号'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, '创建账号'));
    await tester.pumpAndSettle();
    expect(find.text('请输入有效邮箱'), findsOneWidget);
    expect(find.text('密码至少需要 12 个字符'), findsOneWidget);
  });

  testWidgets('administrator can reset and disable a member account', (
    tester,
  ) async {
    final harness = await showAdminScreen(tester);

    await tester.tap(find.text('Change password').last);
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Current administrator password'),
      'admin-current-password',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'New password'),
      'member-new-password',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Confirm new password'),
      'member-new-password',
    );
    await tester.tap(find.widgetWithText(FilledButton, 'Confirm change'));
    await tester.pumpAndSettle();

    expect(harness.repository.adminPasswordResets, [
      {
        'accountId': 'member-user',
        'adminPassword': 'admin-current-password',
        'newPassword': 'member-new-password',
      },
    ]);

    await tester.pump(const Duration(seconds: 5));
    await tester.ensureVisible(find.text('Disable account'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Disable account'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Disable'));
    await tester.pumpAndSettle();
    expect(harness.repository.adminStatusUpdates, [
      {'accountId': 'member-user', 'disabled': true},
    ]);
  });
}
