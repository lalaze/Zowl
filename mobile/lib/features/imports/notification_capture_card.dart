part of 'notification_capture_screen.dart';

class _MerchantQuickConfirmDialog extends StatefulWidget {
  const _MerchantQuickConfirmDialog();

  @override
  State<_MerchantQuickConfirmDialog> createState() =>
      _MerchantQuickConfirmDialogState();
}

class _MerchantQuickConfirmDialogState
    extends State<_MerchantQuickConfirmDialog> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    final merchantName = _controller.text.trim();
    if (merchantName.isNotEmpty) Navigator.pop(context, merchantName);
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(tr('Add merchant', '补充商户')),
    content: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _controller,
          autofocus: true,
          maxLength: 120,
          textInputAction: TextInputAction.done,
          decoration: InputDecoration(
            labelText: tr('Merchant name', '商户名称'),
            hintText: tr('For example: Mountain Cafe', '例如：山岚咖啡'),
          ),
          onSubmitted: (_) => _submit(),
        ),
        const SizedBox(height: 6),
        Text(
          tr(
            'Saves this merchant name and posts the transaction right away.',
            '保存商户名称后会立即入账这笔交易。',
          ),
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: Text(tr('Cancel', '取消')),
      ),
      FilledButton(
        onPressed: _submit,
        child: Text(tr('Save and post', '保存并入账')),
      ),
    ],
  );
}

class _CaptureCard extends StatelessWidget {
  const _CaptureCard({
    required this.item,
    required this.categoryName,
    required this.busy,
    required this.onEdit,
    required this.onAddMerchant,
    required this.onPost,
    required this.onSkip,
    this.batchMode = false,
    this.selected = false,
    this.onSelected,
  });

  final NotificationCaptureItem item;
  final String? categoryName;
  final bool busy;
  final VoidCallback onEdit;
  final VoidCallback onAddMerchant;
  final VoidCallback onPost;
  final VoidCallback onSkip;

  /// Whether the screen is currently selecting candidates for batch posting.
  final bool batchMode;

  /// Whether the candidate is in the batch to review; [onSelected] is null
  /// when it cannot be.
  final bool selected;
  final ValueChanged<bool>? onSelected;

  String get _source => _platformName(item.platform);

  IconData get _sourceIcon => switch (item.platform) {
    'alipay' => Icons.account_balance_wallet_outlined,
    'wechat' => Icons.chat_bubble_outline,
    'cmb' => Icons.account_balance_outlined,
    'taobao' || 'pinduoduo' || 'jd' || 'pupu' || 'xianyu' =>
      Icons.shopping_bag_outlined,
    _ => Icons.notifications_outlined,
  };

  ZeTone get _sourceTone => switch (item.platform) {
    'alipay' => ZeTone.info,
    'wechat' => ZeTone.income,
    'cmb' => ZeTone.danger,
    'taobao' || 'pinduoduo' || 'jd' || 'pupu' || 'xianyu' => ZeTone.warn,
    _ => ZeTone.neutral,
  };

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    final possibleDuplicate = item.duplicateStatus == 'possible_duplicate';
    final itemCount = item.orderDetails?.items.length ?? 0;
    final goodsSummary = itemCount > 0 ? item.description?.trim() : null;
    final merchant = item.merchantName?.trim();
    final hasMerchant = merchant != null && merchant.isNotEmpty;
    final hasGoods = goodsSummary != null && goodsSummary.isNotEmpty;
    final sourceLine = item.captureMethod == 'payment_page'
        ? '$_source · ${tr('Payment page', '支付页')}'
        : _source;
    // Lead with what the user actually recognises (goods or merchant), keeping
    // the capture source in the subtitle instead of repeating it on every card.
    final headline = hasGoods
        ? goodsSummary
        : hasMerchant
        ? merchant
        : sourceLine;
    final subtitle = hasGoods || hasMerchant
        ? '$sourceLine · ${formatDateTime(item.transactionTime)}'
        : formatDateTime(item.transactionTime);
    final paymentMethod = item.paymentMethod?.trim();
    final showPaymentChip =
        paymentMethod != null &&
        paymentMethod.isNotEmpty &&
        paymentMethod != _source;
    final canSelect = batchMode && onSelected != null;

    return ZeCard(
      padding: const EdgeInsets.all(16),
      onTap: canSelect && !busy ? () => onSelected!(!selected) : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (batchMode) ...[
                Padding(
                  padding: const EdgeInsets.only(top: 10, right: 10),
                  child: MergeSemantics(
                    child: Semantics(
                      label: tr(
                        'Include $headline, ${formatMoneyWithSymbol(item.amountMinor, item.currency)} in batch review',
                        '将 $headline（${formatMoneyWithSymbol(item.amountMinor, item.currency)}）加入批量核对',
                      ),
                      child: SizedBox.square(
                        dimension: 20,
                        child: Checkbox(
                          value: selected,
                          visualDensity: VisualDensity.compact,
                          materialTapTargetSize:
                              MaterialTapTargetSize.shrinkWrap,
                          onChanged: busy || onSelected == null
                              ? null
                              : (value) => onSelected!(value == true),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
              ZeIconTile(icon: _sourceIcon, tone: _sourceTone, size: 42),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      headline,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Text(
                '-${formatMoneyWithSymbol(item.amountMinor, item.currency)}',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: t.expense,
                  fontFeatures: tabularFigures,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Wrap(
            spacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (!hasMerchant)
                _FactChip(
                  icon: Icons.add_business_rounded,
                  label: tr('+ Add merchant', '+ 补充商户'),
                  accent: true,
                  onTap: busy ? null : onAddMerchant,
                )
              else if (hasGoods)
                _FactChip(
                  icon: Icons.storefront_rounded,
                  label: merchant,
                ),
              if (itemCount > 0)
                _FactChip(
                  icon: Icons.shopping_basket_outlined,
                  label: tr(plural(itemCount, 'item'), '$itemCount 件'),
                ),
              _FactChip(
                icon: Icons.category_rounded,
                label: categoryName ?? tr('Other', '其他'),
              ),
              if (showPaymentChip)
                _FactChip(
                  icon: Icons.payments_rounded,
                  label: paymentMethod,
                ),
            ],
          ),
          if (possibleDuplicate) ...[
            const SizedBox(height: 10),
            ZeCard(
              tone: ZeTone.warn,
              radius: 12,
              padding: const EdgeInsets.all(10),
              child: Row(
                children: [
                  Icon(Icons.warning_amber_rounded, size: 18, color: t.warn),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      tr(
                        'Possible duplicate. Check existing transactions before deciding',
                        '疑似重复，请核对已有交易后再决定',
                      ),
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (!batchMode) ...[
            const SizedBox(height: 6),
            Row(
              children: [
                TextButton(
                  onPressed: busy ? null : onSkip,
                  // The label starts at the card's content edge, like the rows above.
                  style: TextButton.styleFrom(
                    foregroundColor: t.sub,
                    padding: EdgeInsets.zero,
                    minimumSize: const Size(56, 44),
                    alignment: AlignmentDirectional.centerStart,
                  ),
                  child: Text(tr('Skip', '跳过')),
                ),
                const Spacer(),
                OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, 44),
                    padding: const EdgeInsets.symmetric(horizontal: 18),
                  ),
                  onPressed: busy ? null : onEdit,
                  child: Text(tr('Edit', '编辑')),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  style: FilledButton.styleFrom(
                    minimumSize: const Size(0, 44),
                    padding: const EdgeInsets.symmetric(horizontal: 18),
                  ),
                  onPressed: busy ? null : onPost,
                  child: busy
                      ? SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: t.onPrimary,
                          ),
                        )
                      : Text(tr('Confirm and post', '确认入账')),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// Display name of a capture's source app or bank.
String _platformName(String platform) => switch (platform) {
  'alipay' => tr('Alipay', '支付宝'),
  'wechat' => tr('WeChat', '微信'),
  'cmb' => tr('China Merchants Bank', '招商银行'),
  'taobao' => tr('Taobao', '淘宝'),
  'pinduoduo' => tr('Pinduoduo', '拼多多'),
  'jd' => tr('JD.com', '京东'),
  'pupu' => tr('Pupu', '朴朴'),
  'xianyu' => tr('Xianyu', '闲鱼'),
  _ => tr('Other sources', '其他来源'),
};

/// Where English shows the raw platform id, Chinese shows the source's name.
String _platformText(String platform) =>
    isZh ? _platformName(platform) : platform;

class _FactChip extends StatelessWidget {
  const _FactChip({
    required this.icon,
    required this.label,
    this.accent = false,
    this.onTap,
  });

  final IconData icon;
  final String label;

  /// Drawn in the accent colour: a chip that asks for something.
  final bool accent;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    // Every chip is drawn 32 high and centred in its run, so the one that can be
    // tapped has a full touch target without standing lower than its neighbours.
    final chip = ConstrainedBox(
      constraints: BoxConstraints(minHeight: accent ? 48 : 40),
      child: Center(
        widthFactor: 1,
        child: Container(
          constraints: const BoxConstraints(minHeight: 32),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: accent ? t.primarySoft : t.well,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 15, color: accent ? t.accentText : t.sub),
              const SizedBox(width: 5),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: accent ? t.accentText : null,
                    fontWeight: accent ? FontWeight.w700 : FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (!accent) return chip;
    return Semantics(
      button: true,
      enabled: onTap != null,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: chip,
      ),
    );
  }
}

/// A processed candidate. Amounts and arrows each stand in one column, and a
/// long merchant name is cut rather than pushing the amount to its own line.
class _HistoryRow extends StatelessWidget {
  const _HistoryRow({
    required this.icon,
    required this.tone,
    required this.title,
    required this.amount,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final ZeTone tone;
  final String title;
  final String amount;
  final String subtitle;

  /// Opens the posted transaction; null when there is none.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    return ListTile(
      onTap: onTap,
      minTileHeight: 64,
      leading: ZeIconTile(icon: icon, tone: tone, size: 40),
      title: Row(
        children: [
          Expanded(
            child: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
          const SizedBox(width: 10),
          Text(
            amount,
            style: TextStyle(
              color: t.ink,
              fontSize: 15,
              fontWeight: FontWeight.w700,
              fontFeatures: tabularFigures,
            ),
          ),
        ],
      ),
      subtitle: Text(subtitle),
      horizontalTitleGap: 14,
      trailing: SizedBox.square(
        dimension: 20,
        child: onTap == null
            ? null
            : Icon(Icons.chevron_right_rounded, size: 20, color: t.faint),
      ),
    );
  }
}
