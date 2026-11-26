import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../common/owl_motion.dart';
import '../common/page_states.dart';
import '../common/sky.dart';
import '../common/ze_labels.dart';
import '../common/ze_surfaces.dart';

class AdminAccountScreen extends ConsumerStatefulWidget {
  const AdminAccountScreen({super.key});

  @override
  ConsumerState<AdminAccountScreen> createState() => _AdminAccountScreenState();
}

class _AdminAccountScreenState extends ConsumerState<AdminAccountScreen> {
  AdminAccountPage? _accounts;
  String? _error;
  bool _loading = true;
  int _page = 1;
  String? _statusPendingId;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  Future<void> _load({int? page}) async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
        if (page != null) _page = page;
      });
    }
    try {
      final result = await ref
          .read(repositoryProvider)
          .adminAccounts(page: _page);
      if (mounted) {
        setState(() {
          _accounts = result;
          _page = result.pagination.page;
        });
      }
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _showMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _showCreateDialog() async {
    final created = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const _CreateAccountDialog(),
    );
    if (created == true && mounted) {
      _showMessage(tr('Account created', '账号已创建'));
      await _load();
    }
  }

  Future<void> _showResetDialog(AdminAccount target) async {
    final updated = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _ResetPasswordDialog(target: target),
    );
    if (updated != true || !mounted) return;

    final currentUser = ref.read(authControllerProvider).value;
    if (target.id == currentUser?.id) {
      try {
        await ref.read(authControllerProvider.notifier).logout();
      } catch (_) {
        // The password endpoint already revoked this token.
      }
      if (mounted) context.go('/login');
      return;
    }
    _showMessage(
      tr(
        '${target.email} password updated; previous sessions signed out',
        '${target.email} 的密码已更新，旧会话已退出登录',
      ),
    );
  }

  Future<void> _updateStatus(AdminAccount account) async {
    final disabling = !account.disabled;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          disabling
              ? tr('Disable account?', '停用账号？')
              : tr('Reactivate account?', '重新启用账号？'),
        ),
        content: Text(
          disabling
              ? tr(
                  '${account.email} will be signed out on all devices. Ledger data will be retained.',
                  '${account.email} 会在所有设备上立即退出登录，账本数据会保留。',
                )
              : tr(
                  '${account.email} can sign in again with the existing password.',
                  '${account.email} 可以使用原密码重新登录。',
                ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(tr('Cancel', '取消')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(disabling ? tr('Disable', '停用') : tr('Enable', '启用')),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _statusPendingId = account.id);
    try {
      await ref
          .read(repositoryProvider)
          .setAccountDisabled(accountId: account.id, disabled: disabling);
      _showMessage(
        disabling
            ? tr('Account disabled', '账号已停用')
            : tr('Account reactivated', '账号已重新启用'),
      );
      await _load();
    } on ApiException catch (error) {
      _showMessage(error.message);
    } finally {
      if (mounted) setState(() => _statusPendingId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final currentUser = ref.watch(authControllerProvider).value;
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showCreateDialog,
        icon: const Icon(Icons.person_add_alt_1_outlined),
        label: Text(tr('Add account', '新增账号')),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: SkyScrollScope(
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              ...skyStripSlivers(title: tr('Account management', '账号管理')),
              ..._buildSlivers(currentUser),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _buildSlivers(SessionUser? currentUser) {
    if (_loading && _accounts == null) {
      return const [
        SliverFillRemaining(hasScrollBody: false, child: OwlLoading()),
      ];
    }
    if (_error != null && _accounts == null) {
      return [
        SliverFillRemaining(
          hasScrollBody: false,
          child: ErrorView(error: _error!, onRetry: _load),
        ),
      ];
    }

    final accounts = _accounts!;
    return [
      SliverPadding(
        padding: const EdgeInsets.fromLTRB(24, 10, 24, 112),
        sliver: SliverList.list(
          children: [
            ZeCard(
              tone: ZeTone.income,
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  const ZeIconTile(
                    icon: Icons.shield_rounded,
                    tone: ZeTone.income,
                    size: 40,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      tr(
                        'Administrators manage login accounts only. They cannot view other users’ ledgers, statistics, or files.',
                        '管理员只能维护登录账号，不能查看其他用户的账本、统计或文件。',
                      ),
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 18),
            ZeSectionHeader(
              title: tr('System accounts', '系统账号'),
              subtitle: tr(
                'Total ${accounts.pagination.total} accounts',
                '共 ${accounts.pagination.total} 个账号',
              ),
            ),
            const SizedBox(height: 10),
            ...accounts.items.map(
              (account) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _AccountCard(
                  account: account,
                  current: account.id == currentUser?.id,
                  statusPending: _statusPendingId == account.id,
                  onResetPassword: () => _showResetDialog(account),
                  onUpdateStatus: account.role == 'admin'
                      ? null
                      : () => _updateStatus(account),
                ),
              ),
            ),
            if (accounts.pagination.totalPages > 1)
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  OutlinedButton.icon(
                    onPressed: accounts.pagination.page > 1
                        ? () => _load(page: accounts.pagination.page - 1)
                        : null,
                    icon: const Icon(Icons.chevron_left),
                    label: Text(tr('Previous', '上一页')),
                  ),
                  Text(
                    '${accounts.pagination.page} / ${accounts.pagination.totalPages}',
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                  OutlinedButton.icon(
                    onPressed:
                        accounts.pagination.page <
                            accounts.pagination.totalPages
                        ? () => _load(page: accounts.pagination.page + 1)
                        : null,
                    icon: const Icon(Icons.chevron_right),
                    label: Text(tr('Next', '下一页')),
                  ),
                ],
              ),
          ],
        ),
      ),
    ];
  }
}

class _AccountCard extends StatelessWidget {
  const _AccountCard({
    required this.account,
    required this.current,
    required this.statusPending,
    required this.onResetPassword,
    required this.onUpdateStatus,
  });

  final AdminAccount account;
  final bool current;
  final bool statusPending;
  final VoidCallback onResetPassword;
  final VoidCallback? onUpdateStatus;

  @override
  Widget build(BuildContext context) => Opacity(
    opacity: account.disabled ? 0.72 : 1,
    child: ZeCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              ZeIconTile(
                icon: account.role == 'admin'
                    ? Icons.admin_panel_settings_rounded
                    : Icons.person_rounded,
                tone: account.role == 'admin' ? ZeTone.info : ZeTone.primary,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 7,
                      runSpacing: 5,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(
                          account.displayName,
                          style: Theme.of(context).textTheme.titleMedium
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                        _StatusChip(
                          label: account.role == 'admin'
                              ? tr('Sole administrator', '唯一管理员')
                              : account.disabled
                              ? tr('Disabled', '已停用')
                              : tr('Active', '使用中'),
                          tone: account.role == 'admin'
                              ? ZeTone.info
                              : account.disabled
                              ? ZeTone.danger
                              : ZeTone.income,
                        ),
                        if (current)
                          _StatusChip(
                            label: tr('Current account', '当前账号'),
                            tone: ZeTone.primary,
                          ),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(
                      account.email,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 13),
          const Divider(height: 1),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                onPressed: onResetPassword,
                icon: const Icon(Icons.key_outlined, size: 18),
                label: Text(tr('Change password', '修改密码')),
              ),
              if (onUpdateStatus != null)
                FilledButton.tonalIcon(
                  onPressed: statusPending ? null : onUpdateStatus,
                  icon: statusPending
                      ? const SizedBox.square(
                          dimension: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Icon(
                          account.disabled
                              ? Icons.power_settings_new
                              : Icons.block_outlined,
                          size: 18,
                        ),
                  label: Text(
                    account.disabled
                        ? tr('Reactivate', '重新启用')
                        : tr('Disable account', '停用账号'),
                  ),
                ),
            ],
          ),
        ],
      ),
    ),
  );
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label, required this.tone});

  final String label;
  final ZeTone tone;

  @override
  Widget build(BuildContext context) => ZeBadge(label: label, tone: tone);
}

class _AccountFormDialog extends StatelessWidget {
  const _AccountFormDialog({
    required this.title,
    required this.description,
    required this.submitLabel,
    required this.formKey,
    required this.fields,
    required this.pending,
    required this.error,
    required this.onCancel,
    required this.onSubmit,
  });

  final String title;
  final String description;
  final String submitLabel;
  final GlobalKey<FormState> formKey;
  final List<Widget> fields;
  final bool pending;
  final String? error;
  final VoidCallback onCancel;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(title),
    content: SizedBox(
      width: 420,
      child: SingleChildScrollView(
        child: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(description),
              const SizedBox(height: 16),
              for (final field in fields) ...[
                field,
                const SizedBox(height: 10),
              ],
              if (error != null)
                Text(
                  error!,
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.error,
                    fontWeight: FontWeight.w700,
                  ),
                ),
            ],
          ),
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: pending ? null : onCancel,
        child: Text(tr('Cancel', '取消')),
      ),
      FilledButton(
        onPressed: pending ? null : onSubmit,
        child: pending
            ? const SizedBox.square(
                dimension: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : Text(submitLabel),
      ),
    ],
  );
}

class _CreateAccountDialog extends ConsumerStatefulWidget {
  const _CreateAccountDialog();

  @override
  ConsumerState<_CreateAccountDialog> createState() =>
      _CreateAccountDialogState();
}

class _CreateAccountDialogState extends ConsumerState<_CreateAccountDialog> {
  final _email = TextEditingController();
  final _displayName = TextEditingController();
  final _password = TextEditingController();
  final _confirmation = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _pending = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _displayName.dispose();
    _password.dispose();
    _confirmation.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _pending = true);
    try {
      await ref
          .read(repositoryProvider)
          .createMemberAccount(
            email: _email.text.trim(),
            displayName: _displayName.text.trim(),
            password: _password.text,
          );
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (error) {
      if (mounted) {
        setState(() {
          _pending = false;
          _error = error.message;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => _AccountFormDialog(
    title: tr('Add regular account', '新增普通账号'),
    description: tr(
      'The account gets its own ledger and default categories.',
      '账号会获得独立账本和默认分类。',
    ),
    submitLabel: tr('Create account', '创建账号'),
    formKey: _formKey,
    fields: [
      TextFormField(
        controller: _email,
        keyboardType: TextInputType.emailAddress,
        autocorrect: false,
        decoration: InputDecoration(labelText: tr('Login email', '登录邮箱')),
        validator: (value) {
          final text = value?.trim() ?? '';
          return text.contains('@')
              ? null
              : tr('Enter a valid email address', '请输入有效邮箱');
        },
      ),
      TextFormField(
        controller: _displayName,
        maxLength: 40,
        decoration: InputDecoration(
          labelText: tr('Nickname (optional)', '昵称（可选）'),
        ),
      ),
      TextFormField(
        controller: _password,
        obscureText: true,
        autocorrect: false,
        decoration: InputDecoration(labelText: tr('Password', '密码')),
        validator: (value) => (value?.length ?? 0) >= 12
            ? null
            : tr(
                'Password must contain at least 12 characters',
                '密码至少需要 12 个字符',
              ),
      ),
      TextFormField(
        controller: _confirmation,
        obscureText: true,
        autocorrect: false,
        decoration: InputDecoration(labelText: tr('Confirm password', '确认密码')),
        validator: (value) => value == _password.text
            ? null
            : tr('Passwords do not match', '两次输入的密码不一致'),
      ),
    ],
    pending: _pending,
    error: _error,
    onCancel: () => Navigator.pop(context, false),
    onSubmit: _submit,
  );
}

class _ResetPasswordDialog extends ConsumerStatefulWidget {
  const _ResetPasswordDialog({required this.target});

  final AdminAccount target;

  @override
  ConsumerState<_ResetPasswordDialog> createState() =>
      _ResetPasswordDialogState();
}

class _ResetPasswordDialogState extends ConsumerState<_ResetPasswordDialog> {
  final _adminPassword = TextEditingController();
  final _newPassword = TextEditingController();
  final _confirmation = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _pending = false;
  String? _error;

  @override
  void dispose() {
    _adminPassword.dispose();
    _newPassword.dispose();
    _confirmation.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _pending = true);
    try {
      await ref
          .read(repositoryProvider)
          .resetAccountPassword(
            accountId: widget.target.id,
            adminPassword: _adminPassword.text,
            newPassword: _newPassword.text,
          );
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (error) {
      if (mounted) {
        setState(() {
          _pending = false;
          _error = error.message;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => _AccountFormDialog(
    title: tr(
      'Change ${widget.target.displayName} password',
      '修改「${widget.target.displayName}」的密码',
    ),
    description: tr(
      'All web and mobile sessions for this account will be signed out.',
      '修改后，该账号在网页和手机上的所有会话都会退出登录。',
    ),
    submitLabel: tr('Confirm change', '确认修改'),
    formKey: _formKey,
    fields: [
      TextFormField(
        controller: _adminPassword,
        obscureText: true,
        autocorrect: false,
        decoration: InputDecoration(
          labelText: tr('Current administrator password', '管理员当前密码'),
        ),
        validator: (value) => (value?.isNotEmpty ?? false)
            ? null
            : tr('Enter the current administrator password', '请输入管理员当前密码'),
      ),
      TextFormField(
        controller: _newPassword,
        obscureText: true,
        autocorrect: false,
        decoration: InputDecoration(labelText: tr('New password', '新密码')),
        validator: (value) => (value?.length ?? 0) >= 12
            ? null
            : tr(
                'Password must contain at least 12 characters',
                '密码至少需要 12 个字符',
              ),
      ),
      TextFormField(
        controller: _confirmation,
        obscureText: true,
        autocorrect: false,
        decoration: InputDecoration(
          labelText: tr('Confirm new password', '确认新密码'),
        ),
        validator: (value) => value == _newPassword.text
            ? null
            : tr('New passwords do not match', '两次输入的新密码不一致'),
      ),
    ],
    pending: _pending,
    error: _error,
    onCancel: () => Navigator.pop(context, false),
    onSubmit: _submit,
  );
}
