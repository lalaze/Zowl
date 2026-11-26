import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:uuid/uuid.dart';

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
import '../common/ze_labels.dart';
import '../common/ze_rows.dart';
import '../common/ze_surfaces.dart';

class TransactionDetailScreen extends ConsumerWidget {
  const TransactionDetailScreen({super.key, required this.id, this.initial});
  final String id;

  /// The row the user tapped, shown immediately while the full record loads.
  final TransactionItem? initial;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final result = ref.watch(transactionProvider(id));
    final preview = initial?.id == id ? initial : null;
    final failedWithoutRetry = result.hasError && !result.isLoading;
    final item = failedWithoutRetry ? null : (result.value ?? preview);
    final inlineError = item != null && result.hasError ? result.error : null;
    final fullError = item == null && result.hasError ? result.error : null;
    final busy = result.isLoading || result.hasError;
    return Scaffold(
      body: SkyScrollScope(
        child: CustomScrollView(
          slivers: [
            PinnedHeaderSliver(
              child: SkyBar(
                layout: SkyLayout.page,
                leading: const SkyBackButton(),
                title: SkyTitle(tr('Transaction details', '交易详情'), small: true),
              ),
            ),
            SliverToBoxAdapter(
              child: SkyHeader(
                layout: SkyLayout.page,
                busy: result.isLoading,
                child: item == null
                    ? const SizedBox(height: 64)
                    : _Headline(item: item),
              ),
            ),
            if (item != null)
              SliverPadding(
                padding: EdgeInsets.fromLTRB(
                  24,
                  4,
                  24,
                  MediaQuery.paddingOf(context).bottom + 28,
                ),
                sliver: SliverToBoxAdapter(
                  child: _facts(
                    context,
                    ref,
                    item,
                    busy: busy,
                    inlineError: inlineError,
                  ),
                ),
              )
            else
              SliverFillRemaining(
                hasScrollBody: false,
                child: fullError != null
                    ? ErrorView(
                        error: fullError,
                        onRetry: () => ref.invalidate(transactionProvider(id)),
                      )
                    : const PageLoading(),
              ),
          ],
        ),
      ),
    );
  }

  Widget _facts(
    BuildContext context,
    WidgetRef ref,
    TransactionItem item, {
    required bool busy,
    Object? inlineError,
  }) {
    final t = context.ze;
    final order = item.orderDetails;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (inlineError != null)
          ZeCard(
            tone: ZeTone.danger,
            margin: const EdgeInsets.only(bottom: 14),
            padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
            child: Row(
              children: [
                Icon(Icons.cloud_off_rounded, size: 18, color: t.danger),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    tr('Could not refresh: $inlineError', '刷新失败：$inlineError'),
                    style: TextStyle(
                      color: t.ink,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: () => ref.invalidate(transactionProvider(id)),
                  child: Text(tr('Retry', '重试')),
                ),
              ],
            ),
          ),
        ZeGroup(
          children: [
            ZeFactRow(
              label: tr('Time', '时间'),
              value: formatDateTime(item.transactionTime),
            ),
            ZeFactRow(
              label: tr('Category', '分类'),
              value: item.categoryName ?? tr('Uncategorized', '未分类'),
            ),
            ZeFactRow(
              label: tr('Payment method', '支付方式'),
              value: item.paymentMethod ?? '—',
            ),
            ZeFactRow(
              label: tr('Description', '说明'),
              value: item.description ?? '—',
            ),
            ZeFactRow(
              label: tr('Source', '来源'),
              value: sourceLabel(item.source),
            ),
            if (item.revisionNumber > 1)
              ZeFactRow(
                label: tr('Revision', '版本'),
                value: '${item.revisionNumber}',
              ),
          ],
        ),
        if (order != null && order.items.isNotEmpty) ...[
          const SizedBox(height: 20),
          ZeSectionHeader(title: tr('Items', '商品清单')),
          const SizedBox(height: 4),
          ZeGroup(
            children: [
              if (order.shopName != null)
                ZeFactRow(label: tr('Shop', '店铺'), value: order.shopName!),
              for (final line in order.items) _OrderItemRow(item: line),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              tr(
                'Listed prices from the order page; they may not add up to the amount paid.',
                '标价来自下单页，合计可能与实付金额不同。',
              ),
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
        ],
        const SizedBox(height: 20),
        FilledButton.icon(
          onPressed: busy
              ? null
              : () async {
                  await context.push('/transactions/$id/edit', extra: item);
                  ref.invalidate(transactionProvider(id));
                },
          icon: const Icon(Icons.edit_rounded),
          label: Text(tr('Amend transaction', '修改交易')),
        ),
        const SizedBox(height: 6),
        Center(
          child: TextButton.icon(
            style: TextButton.styleFrom(
              foregroundColor: t.danger,
              disabledForegroundColor: t.faint,
              minimumSize: const Size(120, 46),
            ),
            onPressed: busy || item.currentRevisionId == null
                ? null
                : () async {
                    final confirmed = await confirmDialog(
                      context,
                      title: tr('Void this transaction?', '作废这笔交易？'),
                      message: tr(
                        'The transaction will leave your current ledger and statistics. Audit revisions will be retained.',
                        '这笔交易将移出当前账本和统计，审计版本会保留。',
                      ),
                      confirmLabel: tr('Confirm void', '确认作废'),
                    );
                    if (!confirmed || !context.mounted) return;
                    try {
                      await ref
                          .read(repositoryProvider)
                          .voidTransaction(
                            id,
                            item.currentRevisionId!,
                            const Uuid().v4(),
                          );
                      if (context.mounted) {
                        refreshLedger(ref);
                        context.go('/transactions');
                      }
                    } on ApiException catch (error) {
                      if (context.mounted) {
                        context.showMessage(
                          error.statusCode == 409
                              ? tr(
                                  'Transaction changed. Refresh before voiding',
                                  '交易已变化，请刷新后再作废',
                                )
                              : error.message,
                        );
                      }
                    }
                  },
            icon: const Icon(Icons.block_rounded, size: 18),
            label: Text(tr('Void', '作废')),
          ),
        ),
      ],
    );
  }
}

/// What was paid for and how much, on the sky.
class _Headline extends ConsumerWidget {
  const _Headline({required this.item});

  final TransactionItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final visual = visualForTransaction(item, watchCategoryLookup(ref));
    final types = {
      'expense': tr('Expense', '支出'),
      'income': tr('Income', '收入'),
      'refund': tr('Refund', '退款'),
      'transfer': tr('Transfer', '转账'),
    };
    return FractionallySizedBox(
      alignment: Alignment.centerLeft,
      // The owl has the right side of the sky.
      widthFactor: .72,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            spacing: 10,
            children: [
              ZeIconTile(icon: visual.icon, color: visual.color, size: 36),
              Expanded(
                child: Text(
                  displayNameFor(item),
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 16,
                    height: 1.25,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          SkyAmount(
            formatSignedMoneyWithSymbol(
              item.amountMinor,
              item.type,
              item.currency,
            ),
            size: 40,
          ),
          const SizedBox(height: 6),
          SkyPill(child: Text(types[item.type] ?? item.type)),
        ],
      ),
    );
  }
}

/// One bought item: name, then spec and quantity, with the listed price.
class _OrderItemRow extends StatelessWidget {
  const _OrderItemRow({required this.item});

  final OrderItem item;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    final detail = [?item.spec, if (item.quantity != null) '×${item.quantity}'];
    return MergeSemantics(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 15),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.name,
                    style: TextStyle(
                      color: t.ink,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (detail.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(
                      detail.join(' · '),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ],
              ),
            ),
            if (item.priceMinor != null) ...[
              const SizedBox(width: 16),
              Text(
                formatMoneyWithSymbol(item.priceMinor!),
                style: TextStyle(
                  color: t.ink,
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  fontFeatures: tabularFigures,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
