import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/formatters.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../core/theme.dart';
import '../common/category_visuals.dart';
import '../common/ze_labels.dart';

/// One transaction: category tile, name, meta line, amount.
class TransactionRow extends ConsumerWidget {
  const TransactionRow({
    super.key,
    required this.item,
    this.onTap,
    this.showDate = false,
    this.padding = const EdgeInsets.symmetric(vertical: 11),
  });

  final TransactionItem item;
  final VoidCallback? onTap;

  /// Lists grouped by day only need the time; flat lists need the date.
  final bool showDate;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.ze;
    final visual = visualForTransaction(item, watchCategoryLookup(ref));
    // A payment with recognised goods is titled after them, so its shop takes
    // the last slot of the meta line.
    final order = item.orderDetails;
    final shopName = order != null && order.items.isNotEmpty
        ? order.shopName?.trim()
        : null;
    final meta = [
      item.categoryName ?? tr('Uncategorized', '未分类'),
      showDate
          ? formatDateTime(item.transactionTime)
          : formatTime(item.transactionTime),
      if (shopName != null && shopName.isNotEmpty)
        shopName
      else if (item.paymentMethod?.trim().isNotEmpty == true)
        item.paymentMethod!,
    ].join(' · ');
    final amount = formatSignedMoneyWithSymbol(
      item.amountMinor,
      item.type,
      item.currency,
    );
    return Semantics(
      button: onTap != null,
      label: tr(
        '${displayNameFor(item)}, $amount, $meta',
        '${displayNameFor(item)}，$amount，$meta',
      ),
      onTap: onTap,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: padding,
          child: Row(
            children: [
              ZeIconTile(icon: visual.icon, color: visual.color),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      displayNameFor(item),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      meta,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Text(
                amount,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  fontFeatures: tabularFigures,
                  color: t.amountColor(item.type),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
