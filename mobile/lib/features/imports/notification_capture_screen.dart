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
import '../common/owl_motion.dart';
import '../common/page_states.dart';
import '../common/sky.dart';
import '../common/ze_labels.dart';
import '../common/ze_rows.dart';
import '../common/ze_surfaces.dart';

part 'notification_capture_card.dart';
part 'notification_capture_editor.dart';

class NotificationCaptureScreen extends ConsumerStatefulWidget {
  const NotificationCaptureScreen({super.key});

  @override
  ConsumerState<NotificationCaptureScreen> createState() =>
      _NotificationCaptureScreenState();
}

class _NotificationCaptureScreenState
    extends ConsumerState<NotificationCaptureScreen> {
  final _busyIds = <String>{};
  final _selected = <String>{};
  int _page = 1;
  bool _batchBusy = false;
  bool _batchMode = false;
  bool _privacyExpanded = false;

  String? _categoryName(List<Category> categories, String? categoryId) {
    for (final category in categories) {
      if (category.id == categoryId) return category.name;
    }
    return null;
  }

  Future<void> _refresh() async {
    refreshLedger(ref);
    NotificationCapturePage page;
    try {
      page = await ref.read(
        (_page == 1
                ? notificationCapturePageProvider
                : notificationCapturePagesProvider(_page))
            .future,
      );
    } catch (_) {
      return;
    }
    if (!mounted) return;
    setState(() {
      _selected.clear();
      _batchMode = false;
      if (_page > page.pagination.totalPages) {
        _page = page.pagination.totalPages;
      }
    });
  }

  Future<void> _confirmSelected(List<NotificationCaptureItem> items) async {
    final selected = items
        .where(
          (item) =>
              _selected.contains(item.id) && item.duplicateStatus == 'unique',
        )
        .toList();
    if (selected.isEmpty || _batchBusy) return;
    final approved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          tr(
            'Post ${selected.length} reviewed transactions?',
            '将 ${selected.length} 笔已核对的交易入账？',
          ),
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final item in selected)
                ListTile(
                  title: Text(
                    item.merchantName ?? _platformText(item.platform),
                  ),
                  subtitle: Text(formatDateTime(item.transactionTime)),
                  trailing: Text(
                    formatMoneyWithSymbol(item.amountMinor, item.currency),
                  ),
                ),
              Text(
                tr(
                  'If any transaction changes or needs duplicate review, the entire batch stays unposted.',
                  '只要有一笔发生变化或需要核对重复，整批都不会入账。',
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(tr('Cancel', '取消')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(tr('Confirm batch', '确认整批入账')),
          ),
        ],
      ),
    );
    if (approved != true || !mounted) return;
    setState(() => _batchBusy = true);
    try {
      await ref.read(repositoryProvider).confirmNotificationCaptures(selected);
      await _refresh();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(tr('Batch posting confirmed', '已批量入账'))),
        );
      }
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.message)));
      }
      await _refresh();
    } finally {
      if (mounted) setState(() => _batchBusy = false);
    }
  }

  Future<void> _confirm(
    NotificationCaptureItem item, {
    required String decision,
  }) async {
    if (_busyIds.contains(item.id) || _batchBusy) return;
    if (decision == 'post' && item.duplicateStatus == 'possible_duplicate') {
      TransactionItem? matched;
      if (item.duplicateTransactionId != null) {
        try {
          matched = await ref
              .read(repositoryProvider)
              .transaction(item.duplicateTransactionId!);
        } on ApiException {
          /* Link remains available for retry. */
        }
      }
      if (!mounted) return;
      final match = matched;
      final proceed =
          await showDialog<bool>(
            context: context,
            builder: (context) => AlertDialog(
              title: Text(tr('This may already be recorded', '这笔可能已经记过')),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${tr('New: ', '本次：')}${item.merchantName ?? _platformText(item.platform)} · ${formatMoneyWithSymbol(item.amountMinor, item.currency)} · ${formatDateTime(item.transactionTime)}',
                  ),
                  if (match != null)
                    Text(
                      '${tr('Existing: ', '已有：')}${displayNameFor(match)} · ${formatMoneyWithSymbol(match.amountMinor, match.currency)} · ${formatDateTime(match.transactionTime)}',
                    ),
                  Text(
                    tr(
                      'A bank debit and payment notice can describe the same purchase. Post only if these are separate transactions.',
                      '银行扣款通知和支付通知可能对应同一笔消费。只有确认是两笔不同的交易时才入账。',
                    ),
                  ),
                  if (item.duplicateTransactionId != null)
                    TextButton(
                      onPressed: () {
                        Navigator.pop(context, false);
                        this.context.push(
                          '/transactions/${item.duplicateTransactionId}',
                        );
                      },
                      child: Text(tr('View matching transaction', '查看匹配的交易')),
                    ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context, false),
                  child: Text(tr('Cancel', '取消')),
                ),
                FilledButton(
                  onPressed: () => Navigator.pop(context, true),
                  child: Text(tr('Post anyway', '仍然入账')),
                ),
              ],
            ),
          ) ??
          false;
      if (!proceed) return;
    }
    setState(() => _busyIds.add(item.id));
    try {
      await ref
          .read(repositoryProvider)
          .confirmNotificationCapture(
            item.id,
            decision: decision,
            assessmentDigest:
                decision == 'post' &&
                    item.duplicateStatus == 'possible_duplicate'
                ? item.duplicateAssessmentDigest
                : null,
          );
      await _refresh();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              decision == 'post'
                  ? (item.duplicateStatus == 'duplicate'
                        ? tr(
                            'Linked to existing transaction; no new posting',
                            '已关联到已有交易，未重复入账',
                          )
                        : tr('Posting confirmed', '已确认入账'))
                  : tr('Skipped', '已跳过'),
            ),
          ),
        );
      }
    } on ApiException catch (error) {
      await _refresh();
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _busyIds.remove(item.id));
    }
  }

  Future<void> _edit(
    NotificationCaptureItem item,
    List<Category> categories,
  ) async {
    final input = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      builder: (_) => _EditCaptureSheet(item: item, categories: categories),
    );
    if (input == null || !mounted) return;
    setState(() => _busyIds.add(item.id));
    try {
      await ref
          .read(repositoryProvider)
          .updateNotificationCapture(item.id, input);
      await _refresh();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              tr('Candidate updated and duplicates rechecked', '候选已更新并重新检查重复'),
            ),
          ),
        );
      }
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _busyIds.remove(item.id));
    }
  }

  Future<void> _quickAddMerchant(NotificationCaptureItem item) async {
    final merchantName = await showDialog<String>(
      context: context,
      builder: (_) => const _MerchantQuickConfirmDialog(),
    );
    if (merchantName == null || !mounted || _busyIds.contains(item.id)) return;

    setState(() => _busyIds.add(item.id));
    try {
      await ref
          .read(repositoryProvider)
          .quickConfirmNotificationCapture(item.id, merchantName: merchantName);
      await _refresh();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              tr('Merchant added and transaction posted', '已补充商户并入账'),
            ),
          ),
        );
      }
    } on ApiException catch (error) {
      await _refresh();
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _busyIds.remove(item.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final pageProvider = _page == 1
        ? notificationCapturePageProvider
        : notificationCapturePagesProvider(_page);
    ref.listen(pageProvider, (_, next) {
      final items = next.value?.items;
      if (items == null) return;
      final nextUnique = {
        for (final item in items)
          if (item.duplicateStatus == 'unique') item.id,
      };
      final staleSelected = _selected.any((id) => !nextUnique.contains(id));
      final shouldExitBatch = _batchMode && nextUnique.isEmpty;
      if (staleSelected || shouldExitBatch) {
        setState(() {
          _selected.removeWhere((id) => !nextUnique.contains(id));
          if (shouldExitBatch) _batchMode = false;
        });
      }
    });
    final page = ref.watch(pageProvider);
    final jobs = ref.watch(recognitionJobsProvider);
    final history = ref.watch(notificationHistoryProvider);
    final categories =
        ref.watch(categoriesProvider).value ?? const <Category>[];
    final currentItems = page.value?.items ?? const <NotificationCaptureItem>[];
    final uniqueIds = [
      for (final item in currentItems)
        if (item.duplicateStatus == 'unique') item.id,
    ];
    final uniqueIdSet = uniqueIds.toSet();
    final selectedIds = [
      for (final id in _selected)
        if (uniqueIdSet.contains(id)) id,
    ];
    final activeBatchMode = _batchMode && uniqueIds.isNotEmpty;
    final allUniqueSelected =
        uniqueIds.isNotEmpty && selectedIds.length == uniqueIds.length;
    void toggleBatchMode() => setState(() {
      _batchMode = !activeBatchMode;
      if (!_batchMode) _selected.clear();
    });
    return Scaffold(
      body: Column(
        children: [
          Expanded(
            child: RefreshIndicator(
              edgeOffset: skyBarExtent(context),
              onRefresh: _refresh,
              child: SkyScrollScope(
                child: CustomScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  slivers: [
                    ...skyStripSlivers(
                      title: tr('Review inbox', '待核对'),
                      actions: [
                        if (uniqueIds.isNotEmpty || activeBatchMode)
                          IconButton(
                            tooltip: activeBatchMode
                                ? tr('Exit batch review', '退出批量核对')
                                : tr('Batch review', '批量核对'),
                            onPressed: _batchBusy ? null : toggleBatchMode,
                            icon: Icon(
                              activeBatchMode
                                  ? Icons.close_rounded
                                  : Icons.checklist_rounded,
                            ),
                          ),
                      ],
                    ),
                    SliverPadding(
                      padding: EdgeInsets.fromLTRB(
                        24,
                        6,
                        24,
                        activeBatchMode
                            ? 20
                            : MediaQuery.paddingOf(context).bottom + 28,
                      ),
                      sliver: SliverToBoxAdapter(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            _PrivacyBanner(
                              expanded: _privacyExpanded,
                              onToggle: () => setState(
                                () => _privacyExpanded = !_privacyExpanded,
                              ),
                            ),
                            const SizedBox(height: 12),
                            ...jobs.when(
                              // The owl below stands for everything on the first load.
                              loading: () => [
                                if (!page.isLoading)
                                  const LinearProgressIndicator(),
                              ],
                              error: (error, _) => <Widget>[
                                ErrorView(
                                  error: error,
                                  onRetry: () =>
                                      ref.invalidate(recognitionJobsProvider),
                                ),
                              ],
                              data: (items) {
                                final open = items
                                    .where(
                                      (job) =>
                                          job.status == 'reviewing' ||
                                          job.status == 'processing',
                                    )
                                    .toList();
                                if (open.isEmpty) return const <Widget>[];
                                return <Widget>[
                                  ZeGroup(
                                    children: [
                                      for (final job in open)
                                        ZeNavRow(
                                          icon: Icons.collections_rounded,
                                          tone: job.status == 'processing'
                                              ? ZeTone.info
                                              : ZeTone.warn,
                                          title:
                                              '${tr(plural(job.totalCount, 'screenshot'), '${job.totalCount} 张截图')} · ${job.status == 'processing' ? tr('Recognizing', '识别中') : tr('Awaiting review', '待核对')}',
                                          subtitle: formatDateTime(
                                            job.createdAt,
                                          ),
                                          onTap: () async {
                                            await context.push(
                                              '/imports/screenshots/${job.id}',
                                            );
                                            if (mounted) await _refresh();
                                          },
                                        ),
                                    ],
                                  ),
                                  const SizedBox(height: 12),
                                ];
                              },
                            ),
                            page.when(
                              loading: () => const OwlLoading(),
                              error: (error, _) =>
                                  ErrorView(error: error, onRetry: _refresh),
                              data: (value) => Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  ZeSectionHeader(
                                    title: tr('Payment candidates', '支付候选'),
                                    subtitle: tr(
                                      '${value.pendingCount} awaiting confirmation',
                                      '${value.pendingCount} 笔待确认',
                                    ),
                                    actionLabel:
                                        uniqueIds.isEmpty && !activeBatchMode
                                        ? null
                                        : activeBatchMode
                                        ? tr('Cancel', '取消')
                                        : tr('Batch review', '批量核对'),
                                    onAction: _batchBusy
                                        ? null
                                        : toggleBatchMode,
                                  ),
                                  const SizedBox(height: 10),
                                  if (value.items.isEmpty)
                                    EmptyView(
                                      message: tr(
                                        'No captured payments awaiting confirmation',
                                        '没有待确认的支付',
                                      ),
                                      subtitle: tr(
                                        'Captured payment pages and debit notifications appear here.',
                                        '采集到的支付页和扣款通知会显示在这里。',
                                      ),
                                    ),
                                  for (final item in value.items) ...[
                                    _CaptureCard(
                                      item: item,
                                      categoryName: _categoryName(
                                        categories,
                                        item.categoryId,
                                      ),
                                      busy:
                                          _batchBusy ||
                                          _busyIds.contains(item.id),
                                      onEdit: () => _edit(item, categories),
                                      onAddMerchant: () =>
                                          _quickAddMerchant(item),
                                      onPost: () =>
                                          _confirm(item, decision: 'post'),
                                      onSkip: () =>
                                          _confirm(item, decision: 'skip'),
                                      batchMode: activeBatchMode,
                                      selected:
                                          uniqueIdSet.contains(item.id) &&
                                          _selected.contains(item.id),
                                      onSelected:
                                          item.duplicateStatus != 'unique'
                                          ? null
                                          : (checked) => setState(() {
                                              if (checked) {
                                                _selected.add(item.id);
                                              } else {
                                                _selected.remove(item.id);
                                              }
                                            }),
                                    ),
                                    const SizedBox(height: 12),
                                  ],
                                  if (value.pagination.totalPages > 1)
                                    Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.spaceBetween,
                                      children: [
                                        TextButton(
                                          onPressed: _page > 1 && !_batchBusy
                                              ? () => setState(() {
                                                  _page--;
                                                  _batchMode = false;
                                                  _selected.clear();
                                                })
                                              : null,
                                          child: Text(tr('Previous', '上一页')),
                                        ),
                                        Text(
                                          tr(
                                            'Page $_page of ${value.pagination.totalPages}',
                                            '第 $_page / ${value.pagination.totalPages} 页',
                                          ),
                                        ),
                                        TextButton(
                                          onPressed:
                                              _page <
                                                      value
                                                          .pagination
                                                          .totalPages &&
                                                  !_batchBusy
                                              ? () => setState(() {
                                                  _page++;
                                                  _batchMode = false;
                                                  _selected.clear();
                                                })
                                              : null,
                                          child: Text(tr('Next', '下一页')),
                                        ),
                                      ],
                                    ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 22),
                            ZeSectionHeader(
                              title: tr('Recently processed', '最近处理'),
                              subtitle: tr(
                                'Posted, linked, or skipped candidates',
                                '已入账、已关联或已跳过的候选',
                              ),
                            ),
                            const SizedBox(height: 10),
                            ...history.when(
                              // The owl above stands for everything on the first load.
                              loading: () => [
                                if (!page.isLoading)
                                  const LinearProgressIndicator(),
                              ],
                              error: (error, _) => <Widget>[
                                ErrorView(
                                  error: error,
                                  onRetry: () => ref.invalidate(
                                    notificationHistoryProvider,
                                  ),
                                ),
                              ],
                              data: (value) {
                                final done = value.items
                                    .where((item) => item.status == 'completed')
                                    .toList();
                                if (done.isEmpty) return const <Widget>[];
                                return <Widget>[
                                  ZeGroup(
                                    children: [
                                      for (final item in done)
                                        _HistoryRow(
                                          icon: item.resultCode == 'AUTO_POSTED'
                                              ? Icons.auto_awesome_rounded
                                              : item.resultTransactionId !=
                                                        null ||
                                                    item.duplicateTransactionId !=
                                                        null
                                              ? Icons.check_rounded
                                              : Icons.remove_done_rounded,
                                          tone:
                                              item.resultTransactionId !=
                                                      null ||
                                                  item.duplicateTransactionId !=
                                                      null
                                              ? ZeTone.income
                                              : ZeTone.neutral,
                                          title:
                                              item.merchantName ??
                                              _platformText(item.platform),
                                          amount: formatMoneyWithSymbol(
                                            item.amountMinor,
                                            item.currency,
                                          ),
                                          subtitle:
                                              '${item.resultCode == 'AUTO_POSTED'
                                                  ? tr('Automatically posted', '已自动入账')
                                                  : item.resultCode == 'SKIPPED_DUPLICATE'
                                                  ? tr('Linked to existing transaction', '已关联已有交易')
                                                  : item.resultTransactionId != null
                                                  ? tr('Posted', '已入账')
                                                  : tr('Skipped', '已跳过')} · ${_categoryName(categories, item.categoryId) ?? tr('Other', '其他')} · ${_platformText(item.platform)}',
                                          onTap:
                                              item.resultTransactionId !=
                                                      null ||
                                                  item.duplicateTransactionId !=
                                                      null
                                              ? () => context.push(
                                                  '/transactions/${item.resultTransactionId ?? item.duplicateTransactionId}',
                                                )
                                              : null,
                                        ),
                                    ],
                                  ),
                                ];
                              },
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (activeBatchMode)
            ZeBottomBar(
              child: Row(
                spacing: 10,
                children: [
                  OutlinedButton(
                    onPressed: _batchBusy || uniqueIds.isEmpty
                        ? null
                        : () => setState(() {
                            if (allUniqueSelected) {
                              _selected.clear();
                            } else {
                              _selected
                                ..clear()
                                ..addAll(uniqueIds);
                            }
                          }),
                    child: Text(
                      allUniqueSelected
                          ? tr('Clear', '取消全选')
                          : tr('Select all', '全选'),
                    ),
                  ),
                  Expanded(
                    child: FilledButton(
                      onPressed: _batchBusy || selectedIds.isEmpty
                          ? null
                          : () => _confirmSelected(currentItems),
                      child: Text(
                        selectedIds.isEmpty
                            ? tr('Select items to post', '选择要入账的交易')
                            : tr(
                                'Review and post ${selectedIds.length} selected',
                                '核对并入账选中的 ${selectedIds.length} 笔',
                              ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _PrivacyBanner extends StatelessWidget {
  const _PrivacyBanner({required this.expanded, required this.onToggle});

  final bool expanded;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    return InkWell(
      onTap: onToggle,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: t.well,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 1),
              child: Icon(Icons.privacy_tip_rounded, size: 15, color: t.income),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                expanded
                    ? tr(
                        'Review screenshots and captured payments here. Only structured transaction fields appear. Original page and notification text is never saved; skipping creates no transaction.',
                        '截图和采集到的支付都在这里核对。这里只显示结构化的交易字段，不会保存原始页面和通知正文；跳过不会产生交易。',
                      )
                    : tr(
                        'Structured fields only · Original page and notification text is never saved.',
                        '仅保留结构化字段 · 不会保存原始页面和通知正文。',
                      ),
                maxLines: expanded ? null : 1,
                overflow: expanded ? null : TextOverflow.ellipsis,
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(fontSize: 12),
              ),
            ),
            const SizedBox(width: 4),
            Icon(
              expanded
                  ? Icons.keyboard_arrow_up_rounded
                  : Icons.keyboard_arrow_down_rounded,
              size: 16,
              color: t.faint,
            ),
          ],
        ),
      ),
    );
  }
}
