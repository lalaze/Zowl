part of 'statistics_screen.dart';

IconData _sourceIcon(String? source) => switch (source) {
  'manual' => Icons.edit_rounded,
  'screenshot' => Icons.document_scanner_rounded,
  'alipay' || 'wechat' || 'cmb' => Icons.bolt_rounded,
  'taobao' || 'pinduoduo' || 'jd' || 'pupu' || 'xianyu' =>
    Icons.shopping_bag_rounded,
  'generic' => Icons.upload_file_rounded,
  _ => Icons.account_balance_wallet_rounded,
};

class _SourcePanel extends StatelessWidget {
  const _SourcePanel({
    required this.items,
    required this.currency,
    this.onSelect,
  });

  final List<DistributionItem> items;
  final String currency;
  final ValueChanged<DistributionItem>? onSelect;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      ZeSectionHeader(
        title: tr('Payment source', '支付来源'),
        subtitle: tr('How spending entered your ledger', '支出是从哪里记入账本的'),
      ),
      const SizedBox(height: 4),
      if (items.isEmpty)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 20),
          child: Text(tr('No spending data', '暂无支出数据')),
        ),
      ZeGroup(
        children: [
          for (final item in items)
            ListTile(
              onTap: onSelect == null ? null : () => onSelect!(item),
              leading: ZeIconTile(
                icon: _sourceIcon(item.source),
                tone: ZeTone.neutral,
                size: 40,
              ),
              title: Text(sourceLabel(item.source)),
              subtitle: Text(
                '${tr(plural(item.transactionCount, 'transaction'), '${item.transactionCount} 笔交易')} · ${item.sharePercent.toStringAsFixed(1)}%',
              ),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    formatMoneyWithSymbol(item.amountMinor, currency),
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 15,
                      color: context.ze.ink,
                      fontFeatures: tabularFigures,
                    ),
                  ),
                  if (onSelect != null) const ZeChevron(),
                ],
              ),
            ),
        ],
      ),
    ],
  );
}
