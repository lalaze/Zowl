part of 'notification_capture_screen.dart';

String? _categoryName(List<Category> categories, String? categoryId) {
  for (final category in categories) {
    if (category.id == categoryId) return category.name;
  }
  return null;
}

class _RecognitionJobsSection extends StatelessWidget {
  const _RecognitionJobsSection({
    required this.jobs,
    required this.pageLoading,
    required this.onRetry,
    required this.onOpenJob,
  });

  final AsyncValue<List<RecognitionJob>> jobs;
  final bool pageLoading;
  final VoidCallback onRetry;
  final ValueChanged<String> onOpenJob;

  @override
  Widget build(BuildContext context) => jobs.when(
    // The owl below stands for everything on the first load.
    loading: () =>
        pageLoading ? const SizedBox.shrink() : const LinearProgressIndicator(),
    error: (error, _) => ErrorView(error: error, onRetry: onRetry),
    data: (items) {
      final open = items
          .where(
            (job) => job.status == 'reviewing' || job.status == 'processing',
          )
          .toList();
      if (open.isEmpty) return const SizedBox.shrink();
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ZeGroup(
            children: [
              for (final job in open)
                ZeNavRow(
                  icon: Icons.collections_rounded,
                  tone: job.status == 'processing' ? ZeTone.info : ZeTone.warn,
                  title:
                      '${tr(plural(job.totalCount, 'screenshot'), '${job.totalCount} 张截图')} · ${job.status == 'processing' ? tr('Recognizing', '识别中') : tr('Awaiting review', '待核对')}',
                  subtitle: formatDateTime(job.createdAt),
                  onTap: () => onOpenJob(job.id),
                ),
            ],
          ),
          const SizedBox(height: 12),
        ],
      );
    },
  );
}

class _CandidatesSection extends StatelessWidget {
  const _CandidatesSection({
    required this.page,
    required this.categories,
    required this.currentPage,
    required this.batchMode,
    required this.batchBusy,
    required this.busyIds,
    required this.selectedIds,
    required this.uniqueIdSet,
    required this.onRetry,
    required this.onToggleBatchMode,
    required this.onEdit,
    required this.onAddMerchant,
    required this.onPost,
    required this.onSkip,
    required this.onToggleSelected,
    required this.onPageChanged,
  });

  final AsyncValue<NotificationCapturePage> page;
  final List<Category> categories;
  final int currentPage;
  final bool batchMode;
  final bool batchBusy;
  final Set<String> busyIds;
  final Set<String> selectedIds;
  final Set<String> uniqueIdSet;
  final VoidCallback onRetry;
  final VoidCallback onToggleBatchMode;
  final ValueChanged<NotificationCaptureItem> onEdit;
  final ValueChanged<NotificationCaptureItem> onAddMerchant;
  final ValueChanged<NotificationCaptureItem> onPost;
  final ValueChanged<NotificationCaptureItem> onSkip;
  final void Function(String id, bool checked) onToggleSelected;
  final ValueChanged<int> onPageChanged;

  @override
  Widget build(BuildContext context) => page.when(
    loading: () => const OwlLoading(),
    error: (error, _) => ErrorView(error: error, onRetry: onRetry),
    data: (value) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ZeSectionHeader(
          title: tr('Payment candidates', '支付候选'),
          subtitle: tr(
            '${value.pendingCount} awaiting confirmation',
            '${value.pendingCount} 笔待确认',
          ),
          actionLabel: uniqueIdSet.isEmpty && !batchMode
              ? null
              : batchMode
              ? tr('Cancel', '取消')
              : tr('Batch review', '批量核对'),
          onAction: batchBusy ? null : onToggleBatchMode,
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
            categoryName: _categoryName(categories, item.categoryId),
            busy: batchBusy || busyIds.contains(item.id),
            onEdit: () => onEdit(item),
            onAddMerchant: () => onAddMerchant(item),
            onPost: () => onPost(item),
            onSkip: () => onSkip(item),
            batchMode: batchMode,
            selected:
                uniqueIdSet.contains(item.id) && selectedIds.contains(item.id),
            onSelected: item.duplicateStatus != 'unique'
                ? null
                : (checked) => onToggleSelected(item.id, checked),
          ),
          const SizedBox(height: 12),
        ],
        if (value.pagination.totalPages > 1)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              TextButton(
                onPressed: currentPage > 1 && !batchBusy
                    ? () => onPageChanged(currentPage - 1)
                    : null,
                child: Text(tr('Previous', '上一页')),
              ),
              Text(
                tr(
                  'Page $currentPage of ${value.pagination.totalPages}',
                  '第 $currentPage / ${value.pagination.totalPages} 页',
                ),
              ),
              TextButton(
                onPressed:
                    currentPage < value.pagination.totalPages && !batchBusy
                    ? () => onPageChanged(currentPage + 1)
                    : null,
                child: Text(tr('Next', '下一页')),
              ),
            ],
          ),
      ],
    ),
  );
}

class _HistorySection extends StatelessWidget {
  const _HistorySection({
    required this.history,
    required this.pageLoading,
    required this.categories,
    required this.onRetry,
    required this.onOpenTransaction,
  });

  final AsyncValue<NotificationCapturePage> history;
  final bool pageLoading;
  final List<Category> categories;
  final VoidCallback onRetry;
  final ValueChanged<String> onOpenTransaction;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      ZeSectionHeader(
        title: tr('Recently processed', '最近处理'),
        subtitle: tr('Posted, linked, or skipped candidates', '已入账、已关联或已跳过的候选'),
      ),
      const SizedBox(height: 10),
      ...history.when(
        // The owl above stands for everything on the first load.
        loading: () => [if (!pageLoading) const LinearProgressIndicator()],
        error: (error, _) => <Widget>[
          ErrorView(error: error, onRetry: onRetry),
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
                        : item.resultTransactionId != null ||
                              item.duplicateTransactionId != null
                        ? Icons.check_rounded
                        : Icons.remove_done_rounded,
                    tone:
                        item.resultTransactionId != null ||
                            item.duplicateTransactionId != null
                        ? ZeTone.income
                        : ZeTone.neutral,
                    title: item.merchantName ?? _platformText(item.platform),
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
                        item.resultTransactionId != null ||
                            item.duplicateTransactionId != null
                        ? () => onOpenTransaction(
                            item.resultTransactionId ??
                                item.duplicateTransactionId!,
                          )
                        : null,
                  ),
              ],
            ),
          ];
        },
      ),
    ],
  );
}
