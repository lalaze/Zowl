import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/local_ocr.dart';
import '../../core/providers.dart';
import '../common/owl_motion.dart';
import '../common/sky.dart';
import 'transaction_form_screen.dart';
import '../../core/l10n.dart';

class LocalOcrReviewScreen extends ConsumerStatefulWidget {
  const LocalOcrReviewScreen({super.key});
  @override
  ConsumerState<LocalOcrReviewScreen> createState() => _LocalOcrReviewState();
}

class _LocalOcrReviewState extends ConsumerState<LocalOcrReviewScreen> {
  late final Future<LocalOcrDraft?> _draft;
  late final LocalOcrBridge _bridge;
  String? _id;
  @override
  void initState() {
    super.initState();
    _bridge = ref.read(localOcrBridgeProvider);
    _draft = _load();
  }

  Future<LocalOcrDraft?> _load() async {
    await _bridge.protectReview(true);
    if (!mounted) return null;
    final owner = ref.read(authControllerProvider).value?.id;
    if (owner == null) return null;
    final draft = await _bridge.takeDraft(owner);
    if (!mounted) {
      if (draft != null) await _bridge.discard(draft.id);
      return null;
    }
    _id = draft?.id;
    return draft;
  }

  @override
  void dispose() {
    if (_id != null) _bridge.discard(_id!);
    _bridge.protectReview(false);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FutureBuilder(
    future: _draft,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) {
        return const Scaffold(body: OwlLoading());
      }
      final draft = snapshot.data;
      if (draft == null ||
          draft.owner != ref.watch(authControllerProvider).value?.id) {
        return Scaffold(
          appBar: SkyAppBar(title: tr('Scan draft unavailable', '识别草稿不可用')),
          body: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  tr(
                    'The draft expired, was cancelled, or the account changed. Go back to the payment page and tap the tile again.',
                    '草稿已过期、已取消或账号已变化。请返回支付页重新点击磁贴。',
                  ),
                ),
                TextButton(
                  onPressed: () => context.go('/settings/local-ocr'),
                  child: Text(tr('Open settings', '查看设置')),
                ),
              ],
            ),
          ),
        );
      }
      return TransactionFormScreen(key: ValueKey(draft.id), localOcr: draft);
    },
  );
}
