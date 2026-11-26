import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api.dart';
import '../../core/formatters.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../common/category_visuals.dart';
import '../common/feedback.dart';
import '../common/owl_motion.dart';
import '../common/page_states.dart';
import '../common/sky.dart';
import '../common/ze_controls.dart';
import '../common/ze_labels.dart';
import '../common/ze_surfaces.dart';

part 'receipt_review_banner.dart';
part 'receipt_review_cards.dart';
part 'receipt_editor_sheet.dart';

// Loaded once per review screen instead of once per card rebuild, so preview
// images do not flash back to a spinner whenever a card rebuilds.
final _previewHeadersProvider = FutureProvider.autoDispose<Map<String, String>>(
  (ref) => ref.watch(apiClientProvider).authenticatedHeaders(),
);

class ReceiptReviewScreen extends ConsumerStatefulWidget {
  const ReceiptReviewScreen({super.key, required this.jobId});
  final String jobId;
  @override
  ConsumerState<ReceiptReviewScreen> createState() =>
      _ReceiptReviewScreenState();
}

class _ReceiptReviewScreenState extends ConsumerState<ReceiptReviewScreen> {
  late Future<RecognitionReview> _review;
  bool _confirming = false;

  @override
  void initState() {
    super.initState();
    _review = ref.read(repositoryProvider).recognitionReview(widget.jobId);
  }

  void _reload() {
    setState(() {
      _review = ref.read(repositoryProvider).recognitionReview(widget.jobId);
    });
  }

  Future<void> _decision(RecognitionItem item, String decision) async {
    try {
      await ref.read(repositoryProvider).updateRecognitionItem(
        widget.jobId,
        item.id,
        {'decision': decision},
      );
      _reload();
    } on ApiException catch (error) {
      if (mounted) context.showMessage(error.message);
    }
  }

  Future<void> _confirm() async {
    setState(() => _confirming = true);
    try {
      final result = await ref
          .read(repositoryProvider)
          .confirmRecognition(widget.jobId);
      if (!mounted) return;
      refreshLedger(ref);
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(
            tr(
              '${result['createdCount'] ?? 0} screenshot transactions added to the ledger',
              '${result['createdCount'] ?? 0} 笔截图交易已加入账本',
            ),
          ),
          content: Text(
            tr(
              'Skip ${result['skippedCount'] ?? 0} items; failed: ${result['failedCount'] ?? 0} items.',
              '跳过 ${result['skippedCount'] ?? 0} 笔，失败 ${result['failedCount'] ?? 0} 笔。',
            ),
          ),
          actions: [
            FilledButton(
              onPressed: () => Navigator.pop(context),
              child: Text(tr('Done', '完成')),
            ),
          ],
        ),
      );
      if (mounted) context.go('/transactions');
    } on ApiException catch (error) {
      if (mounted) context.showMessage(error.message);
      _reload();
    } finally {
      if (mounted) setState(() => _confirming = false);
    }
  }

  Widget _wrapSlivers({required List<Widget> slivers}) => SkyScrollScope(
    child: CustomScrollView(
      slivers: [
        ...skyStripSlivers(
          title: tr('Review screenshot transactions', '核对截图交易'),
        ),
        ...slivers,
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: FutureBuilder<RecognitionReview>(
        future: _review,
        builder: (context, snapshot) {
          // FutureBuilder keeps the previous review while a reload is
          // waiting, so decisions refresh in place instead of blanking out.
          final waiting = snapshot.connectionState == ConnectionState.waiting;
          if (waiting && !snapshot.hasData) {
            return _wrapSlivers(
              slivers: const [
                SliverFillRemaining(hasScrollBody: false, child: OwlLoading()),
              ],
            );
          }
          if (snapshot.hasError) {
            return _wrapSlivers(
              slivers: [
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: ErrorView(error: snapshot.error!, onRetry: _reload),
                ),
              ],
            );
          }
          final review = snapshot.data!;
          if (review.job.status == 'completed') {
            return _wrapSlivers(
              slivers: [
                SliverPadding(
                  padding: EdgeInsets.fromLTRB(
                    24,
                    48,
                    24,
                    MediaQuery.paddingOf(context).bottom + 32,
                  ),
                  sliver: SliverToBoxAdapter(
                    child: EmptyView(
                      message: tr('Review complete', '核对完成'),
                      subtitle: tr(
                        'Posted ${plural(review.job.importedCount, 'screenshot transaction')}',
                        '已入账 ${review.job.importedCount} 笔截图交易',
                      ),
                      action: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // Each posted result stays one tap away for amendment.
                          for (final item in review.items.where(
                            (item) => item.resultTransactionId != null,
                          ))
                            TextButton(
                              onPressed: () => context.push(
                                '/transactions/${item.resultTransactionId}',
                              ),
                              child: Text(
                                tr(
                                  '${item.merchantName ?? 'Transaction'} · ${item.currency ?? ''} ${item.amount ?? ''} · View / amend',
                                  '${item.merchantName ?? '交易'} · ${item.currency ?? ''} ${item.amount ?? ''} · 查看 / 修改',
                                ),
                              ),
                            ),
                          const SizedBox(height: 8),
                          FilledButton(
                            onPressed: () => context.go('/transactions'),
                            child: Text(tr('View transactions', '查看交易')),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            );
          }
          final duplicateCount = review.items
              .where((item) => item.duplicateKind == 'possible_duplicate')
              .length;
          final banner = _ReviewBanner(count: review.items.length);
          return Column(
            children: [
              Expanded(
                child: Stack(
                  children: [
                    RefreshIndicator(
                      onRefresh: () async {
                        _reload();
                        await _review;
                      },
                      child: SkyScrollScope(
                        child: CustomScrollView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          slivers: [
                            ...skyStripSlivers(
                              title: tr(
                                'Review screenshot transactions',
                                '核对截图交易',
                              ),
                            ),
                            if (review.items.isEmpty)
                              SliverPadding(
                                padding: const EdgeInsets.fromLTRB(
                                  24,
                                  12,
                                  24,
                                  24,
                                ),
                                sliver: SliverList.list(
                                  children: [
                                    banner,
                                    const SizedBox(height: 40),
                                    EmptyView(
                                      message: tr(
                                        'No candidates awaiting review',
                                        '没有待核对的候选',
                                      ),
                                    ),
                                  ],
                                ),
                              )
                            else
                              SliverPadding(
                                padding: const EdgeInsets.fromLTRB(
                                  24,
                                  12,
                                  24,
                                  24,
                                ),
                                sliver: SliverList.builder(
                                  itemCount: review.items.length + 1,
                                  itemBuilder: (context, index) => index == 0
                                      ? banner
                                      : _ReceiptCard(
                                          jobId: widget.jobId,
                                          item: review.items[index - 1],
                                          onChanged: _reload,
                                          onDecision: _decision,
                                        ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                    if (waiting)
                      Positioned(
                        top: MediaQuery.paddingOf(context).top + 56,
                        left: 0,
                        right: 0,
                        child: const LinearProgressIndicator(minHeight: 2),
                      ),
                  ],
                ),
              ),
              ZeBottomBar(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ZePrimaryButton(
                      onPressed: _confirming ? null : _confirm,
                      loading: _confirming,
                      icon: Icons.check_rounded,
                      label: tr('Post selected transactions', '确认选中交易入账'),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      duplicateCount > 0
                          ? tr(
                              '${plural(duplicateCount, 'possible duplicate')} ${duplicateCount == 1 ? 'needs' : 'need'} review · Selected items will be posted together',
                              '$duplicateCount 笔疑似重复需先核对 · 选中的交易将一起入账',
                            )
                          : tr(
                              'Selected items will be posted together',
                              '选中的交易将一起入账',
                            ),
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.labelMedium,
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
