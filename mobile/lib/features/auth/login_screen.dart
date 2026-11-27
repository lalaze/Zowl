import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api.dart';
import '../../core/l10n.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../common/sky.dart';
import '../common/ze_labels.dart';
import '../common/ze_surfaces.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController(
    text: kDebugMode ? 'demo@zowl.local' : '',
  );
  final _password = TextEditingController(text: kDebugMode ? 'zowl-demo' : '');
  bool _obscure = true;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ref
          .read(authControllerProvider.notifier)
          .login(_email.text.trim(), _password.text);
    } on ApiException catch (error) {
      if (mounted) {
        setState(
          // The server cannot tell which field is wrong without leaking
          // whether the account exists, so name both.
          () => _error = error.code == 'INVALID_CREDENTIALS'
              ? tr(
                  'Incorrect email or password. Check both and try again',
                  '邮箱或密码不正确，请检查后重试',
                )
              : error.message,
        );
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _error = tr('Login failed. Try again later', '登录失败，请稍后重试'),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    final palette = SkyPalette.of(context);
    return Scaffold(
      body: SingleChildScrollView(
        padding: const EdgeInsets.only(bottom: 32),
        child: Column(
          children: [
            SkyBar(
              layout: SkyLayout.login,
              title: const SkyTitle('Zowl', small: true),
              actions: [
                InkWell(
                  borderRadius: BorderRadius.circular(99),
                  onTap: () => ref
                      .read(languageProvider.notifier)
                      .setLanguage(isZh ? AppLanguage.en : AppLanguage.zh),
                  child: SkyPill(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 7,
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      spacing: 5,
                      children: [
                        Icon(
                          Icons.translate_rounded,
                          size: 15,
                          color: palette.foreground,
                        ),
                        Text(isZh ? 'English' : '中文'),
                      ],
                    ),
                  ),
                ),
              ],
            ),
            SkyHeader(
              layout: SkyLayout.login,
              busy: _submitting,
              padding: EdgeInsets.fromLTRB(
                24,
                0,
                24,
                236 * SkyLayout.scaleFor(MediaQuery.sizeOf(context).width),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 4,
                children: [
                  Text(
                    tr('Welcome back', '欢迎回来'),
                    style: const TextStyle(
                      fontSize: 28,
                      height: 1.15,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -.4,
                    ),
                  ),
                  Text(
                    tr(
                      'Keep track of everyday life, one transaction at a time.',
                      '一笔一笔，记下日常生活。',
                    ),
                    style: TextStyle(
                      color: palette.muted,
                      fontSize: 14,
                      height: 1.35,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 0),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 440),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      ZeSectionHeader(
                        title: tr('Sign in to Zowl', '登录 Zowl'),
                        subtitle: tr(
                          'Your ledger, shared with the web app',
                          '账本与网页版同步',
                        ),
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        autofillHints: const [AutofillHints.username],
                        decoration: InputDecoration(
                          labelText: tr('Email', '邮箱'),
                          prefixIcon: const Icon(Icons.mail_rounded),
                        ),
                        validator: (value) =>
                            value == null || !value.contains('@')
                            ? tr('Enter a valid email address', '请输入有效的邮箱地址')
                            : null,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _password,
                        obscureText: _obscure,
                        autofillHints: const [AutofillHints.password],
                        decoration: InputDecoration(
                          labelText: tr('Password', '密码'),
                          prefixIcon: const Icon(Icons.lock_rounded),
                          suffixIcon: IconButton(
                            tooltip: _obscure
                                ? tr('Show password', '显示密码')
                                : tr('Hide password', '隐藏密码'),
                            onPressed: () =>
                                setState(() => _obscure = !_obscure),
                            icon: Icon(
                              _obscure
                                  ? Icons.visibility_rounded
                                  : Icons.visibility_off_rounded,
                            ),
                          ),
                        ),
                        validator: (value) => value?.isNotEmpty == true
                            ? null
                            : tr('Enter your password', '请输入密码'),
                        onFieldSubmitted: (_) => _submit(),
                      ),
                      if (_error != null) ...[
                        const SizedBox(height: 12),
                        ZeCard(
                          tone: ZeTone.danger,
                          radius: 14,
                          padding: const EdgeInsets.all(12),
                          child: Text(
                            _error!,
                            style: TextStyle(
                              color: t.danger,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                      const SizedBox(height: 16),
                      FilledButton.icon(
                        onPressed: _submitting ? null : _submit,
                        icon: _submitting
                            ? SizedBox.square(
                                dimension: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: t.onPrimary,
                                ),
                              )
                            : const Icon(Icons.arrow_forward_rounded),
                        label: Text(
                          _submitting
                              ? tr('Signing in…', '正在登录…')
                              : tr('Open Zowl', '进入 Zowl'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
