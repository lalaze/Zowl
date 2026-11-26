import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../common/avatar_presets.dart';
import '../common/sky.dart';
import '../common/ze_controls.dart';
import '../common/ze_labels.dart';
import '../common/ze_rows.dart';
import '../common/ze_surfaces.dart';
import 'payment_capture_settings.dart';

String _avatarName((String, String, IconData) avatar) =>
    tr(avatar.$1, avatar.$2);

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});
  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  final _name = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _saveName() async {
    final user = ref.read(authControllerProvider).value;
    if (user == null || _name.text.trim().isEmpty) return;
    setState(() => _saving = true);
    try {
      final updated = await ref
          .read(repositoryProvider)
          .updateProfile(user, displayName: _name.text.trim());
      ref.read(authControllerProvider.notifier).replaceUser(updated);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(tr('Nickname updated', '昵称已更新'))),
        );
      }
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _setAvatar(String avatar) async {
    final user = ref.read(authControllerProvider).value;
    if (user == null) return;
    try {
      final updated = await ref
          .read(repositoryProvider)
          .updateProfile(user, avatarPreset: avatar);
      ref.read(authControllerProvider.notifier).replaceUser(updated);
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }

  Future<void> _showProfileSheet() async {
    final user = ref.read(authControllerProvider).value;
    if (user == null) return;
    _name.text = user.displayName;
    var selectedAvatar = user.avatarPreset;
    await showModalBottomSheet<void>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) => SafeArea(
          child: SingleChildScrollView(
            padding: EdgeInsets.fromLTRB(
              24,
              8,
              24,
              MediaQuery.viewInsetsOf(context).bottom + 20,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ZeSectionHeader(
                  title: tr('Edit profile', '编辑个人资料'),
                  subtitle: tr(
                    'Your nickname and avatar sync with the web app',
                    '昵称和头像会同步到网页端',
                  ),
                ),
                const SizedBox(height: 18),
                TextField(
                  controller: _name,
                  maxLength: 40,
                  decoration: InputDecoration(labelText: tr('Nickname', '昵称')),
                ),
                FilledButton(
                  onPressed: _saving
                      ? null
                      : () async {
                          setSheetState(() {});
                          await _saveName();
                          if (context.mounted) setSheetState(() {});
                        },
                  child: Text(
                    _saving
                        ? tr('Saving…', '正在保存…')
                        : tr('Save nickname', '保存昵称'),
                  ),
                ),
                const SizedBox(height: 20),
                Text(
                  tr('Choose avatar', '选择头像'),
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: zeAvatarPresets.entries
                      .map(
                        (entry) => Semantics(
                          label: tr(
                            'Change avatar: ${_avatarName(entry.value)}',
                            '更换头像：${_avatarName(entry.value)}',
                          ),
                          button: true,
                          child: ChoiceChip(
                            selected: selectedAvatar == entry.key,
                            onSelected: (_) async {
                              await _setAvatar(entry.key);
                              if (context.mounted) {
                                setSheetState(() => selectedAvatar = entry.key);
                              }
                            },
                            avatar: Icon(entry.value.$3, size: 18),
                            label: Text(_avatarName(entry.value)),
                          ),
                        ),
                      )
                      .toList(),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _showAppearanceSheet() => showModalBottomSheet<void>(
    context: context,
    useRootNavigator: true,
    isScrollControlled: true,
    builder: (context) => Consumer(
      builder: (context, ref, _) {
        final appearance = ref.watch(appearanceProvider);
        return SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ZeSectionHeader(
                  title: tr('Appearance', '外观'),
                  subtitle: tr(
                    'Choose a display mode and theme color',
                    '选择显示模式和主题色',
                  ),
                ),
                const SizedBox(height: 18),
                ZeSegmented<ThemeMode>(
                  segments: [
                    (ThemeMode.system, tr('System', '跟随系统')),
                    (ThemeMode.light, tr('Light', '浅色')),
                    (ThemeMode.dark, tr('Dark', '深色')),
                  ],
                  selected: appearance.mode,
                  onChanged: (value) =>
                      ref.read(appearanceProvider.notifier).setMode(value),
                ),
                const SizedBox(height: 22),
                Text(
                  tr('Theme color', '主题色'),
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    for (final accent in AccentColor.values) ...[
                      Expanded(
                        child: _AccentOption(
                          accent: accent,
                          selected: appearance.accent == accent,
                          onTap: () => ref
                              .read(appearanceProvider.notifier)
                              .setAccent(accent),
                        ),
                      ),
                      if (accent != AccentColor.values.last)
                        const SizedBox(width: 10),
                    ],
                  ],
                ),
              ],
            ),
          ),
        );
      },
    ),
  );

  Future<void> _showLanguageSheet() => showModalBottomSheet<void>(
    context: context,
    useRootNavigator: true,
    builder: (context) => Consumer(
      builder: (context, ref, _) {
        final language = ref.watch(languageProvider);
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ZeSectionHeader(
                  title: tr('Language', '语言'),
                  subtitle: tr('Applies to this device only', '仅对这台设备生效'),
                ),
                const SizedBox(height: 18),
                ZeSegmented<AppLanguage>(
                  segments: [
                    for (final value in AppLanguage.values)
                      (value, languageName(value)),
                  ],
                  selected: language,
                  onChanged: (value) =>
                      ref.read(languageProvider.notifier).setLanguage(value),
                ),
              ],
            ),
          ),
        );
      },
    ),
  );

  Future<void> _showSessionSheet() => showModalBottomSheet<void>(
    context: context,
    useRootNavigator: true,
    builder: (context) {
      final user = ref.read(authControllerProvider).value;
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ZeSectionHeader(
                title: tr('Account and session', '账号与会话'),
                subtitle: tr(
                  'Use the same account on mobile and web',
                  '手机端和网页端使用同一个账号',
                ),
              ),
              const SizedBox(height: 18),
              ZeCard(
                padding: const EdgeInsets.all(14),
                child: Row(
                  children: [
                    const ZeIconTile(
                      icon: Icons.mail_rounded,
                      tone: ZeTone.neutral,
                      size: 40,
                    ),
                    const SizedBox(width: 12),
                    Expanded(child: Text(user?.email ?? '')),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  foregroundColor: context.ze.danger,
                  backgroundColor: context.ze.toneSoft(ZeTone.danger),
                ),
                onPressed: () {
                  Navigator.pop(context);
                  ref.read(authControllerProvider.notifier).logout();
                },
                icon: const Icon(Icons.logout),
                label: Text(tr('Sign out', '退出登录')),
              ),
            ],
          ),
        ),
      );
    },
  );

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authControllerProvider).value;
    final appearance = ref.watch(appearanceProvider);
    final language = ref.watch(languageProvider);
    if (user != null && _name.text.isEmpty) _name.text = user.displayName;
    final android = !kIsWeb && defaultTargetPlatform == TargetPlatform.android;
    return Scaffold(
      body: SkyScrollScope(
        child: CustomScrollView(
          slivers: [
            PinnedHeaderSliver(
              child: SkyBar(
                layout: SkyLayout.page,
                title: SkyTitle(tr('Me', '我的')),
              ),
            ),
            SliverToBoxAdapter(
              child: SkyHeader(
                layout: SkyLayout.page,
                child: _Profile(
                  name: user?.displayName ?? '',
                  email: user?.email ?? '',
                  icon: avatarIconFor(user?.avatarPreset),
                  onTap: _showProfileSheet,
                ),
              ),
            ),
            SliverPadding(
              padding: EdgeInsets.fromLTRB(
                24,
                8,
                24,
                MediaQuery.paddingOf(context).bottom + 24,
              ),
              sliver: SliverToBoxAdapter(
                child: _settings(context, user, appearance, language, android),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _settings(
    BuildContext context,
    SessionUser? user,
    AppAppearance appearance,
    AppLanguage language,
    bool android,
  ) {
    final t = context.ze;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _GroupLabel(tr('Preferences', '偏好设置')),
        ZeGroup(
          children: [
            ZeNavRow(
              icon: Icons.person_rounded,
              color: ZeHues.terracotta,
              title: tr('Personal details', '个人资料'),
              subtitle: tr('Nickname and avatar', '昵称与头像'),
              onTap: _showProfileSheet,
            ),
            ZeNavRow(
              icon: Icons.palette_rounded,
              color: ZeHues.rose,
              title: tr('Appearance', '外观'),
              subtitle:
                  '${switch (appearance.mode) {
                    ThemeMode.system => tr('Follow system', '跟随系统'),
                    ThemeMode.light => tr('Light mode', '浅色模式'),
                    ThemeMode.dark => tr('Dark mode', '深色模式'),
                  }} · ${appearance.accent.label}',
              onTap: _showAppearanceSheet,
            ),
            ZeNavRow(
              icon: Icons.translate_rounded,
              color: ZeHues.sky,
              title: tr('Language', '语言'),
              subtitle: languageName(language),
              onTap: _showLanguageSheet,
            ),
          ],
        ),
        if (android) ...[
          const SizedBox(height: 14),
          _GroupLabel(tr('Capture', '采集')),
          const ZeGroup(
            showDividers: false,
            children: [PaymentCaptureSettingsTile()],
          ),
        ],
        const SizedBox(height: 14),
        _GroupLabel(tr('Account', '账号')),
        ZeGroup(
          children: [
            if (user?.isAdmin == true)
              ZeNavRow(
                icon: Icons.manage_accounts_rounded,
                color: ZeHues.plum,
                title: tr('Account management', '账号管理'),
                subtitle: tr(
                  'Add accounts, reset passwords, and disable accounts',
                  '新增账号、重置密码与停用账号',
                ),
                onTap: () => context.go('/settings/admin'),
              ),
            ZeNavRow(
              icon: Icons.shield_rounded,
              color: ZeHues.teal,
              title: tr('Account and session', '账号与会话'),
              subtitle: user?.email ?? '',
              onTap: _showSessionSheet,
            ),
          ],
        ),
        const SizedBox(height: 14),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 1),
              child: Icon(Icons.cloud_done_rounded, size: 16, color: t.faint),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                tr(
                  'Transactions are stored online and shared with the web app. No local ledger is kept on your phone.',
                  '交易在线保存并与网页端共享，手机上不会保留本地账本。',
                ),
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// Who is signed in, on the sky.
class _Profile extends StatelessWidget {
  const _Profile({
    required this.name,
    required this.email,
    required this.icon,
    required this.onTap,
  });

  final String name;
  final String email;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    final palette = SkyPalette.of(context);
    return FractionallySizedBox(
      alignment: Alignment.centerLeft,
      // The owl has the right side of the sky.
      widthFactor: .68,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(24),
        child: Row(
          spacing: 12,
          children: [
            CircleAvatar(
              radius: 24,
              backgroundColor: t.primary,
              child: Icon(icon, color: t.onPrimary, size: 24),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  Text(
                    email,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: palette.muted,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _GroupLabel extends StatelessWidget {
  const _GroupLabel(this.label);

  final String label;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 2),
    child: Text(label, style: Theme.of(context).textTheme.labelMedium),
  );
}

class _AccentOption extends StatelessWidget {
  const _AccentOption({
    required this.accent,
    required this.selected,
    required this.onTap,
  });

  final AccentColor accent;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    return Semantics(
      button: true,
      selected: selected,
      label: tr('Theme color: ${accent.label}', '主题色：${accent.label}'),
      onTap: onTap,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            color: t.card,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: selected ? t.primary : Colors.transparent,
              width: 2,
            ),
          ),
          child: Column(
            children: [
              SizedBox.square(
                dimension: 34,
                child: CustomPaint(
                  painter: _SwatchPainter(accent.color, accent.darkColor),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                accent.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 12,
                  color: selected ? t.ink : t.sub,
                  fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Light and dark variants of an accent as two halves of a circle.
class _SwatchPainter extends CustomPainter {
  const _SwatchPainter(this.light, this.dark);

  final Color light;
  final Color dark;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    canvas.drawArc(rect, 1.5708 * 1.5, 3.14159, true, Paint()..color = light);
    canvas.drawArc(rect, -1.5708 * .5, 3.14159, true, Paint()..color = dark);
  }

  @override
  bool shouldRepaint(covariant _SwatchPainter oldDelegate) =>
      oldDelegate.light != light || oldDelegate.dark != dark;
}
