part of 'receipt_review_screen.dart';

class _ReceiptCard extends ConsumerWidget {
  const _ReceiptCard({
    required this.jobId,
    required this.item,
    required this.onChanged,
    required this.onDecision,
  });
  final String jobId;
  final RecognitionItem item;
  final VoidCallback onChanged;
  final Future<void> Function(RecognitionItem, String) onDecision;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.ze;
    final needsFields =
        item.validationErrors.isNotEmpty ||
        item.amountMinor == null ||
        item.type == null ||
        item.transactionTime == null ||
        item.currency == null;
    final duplicate = item.duplicateKind == 'possible_duplicate';
    final category = item.categoryId == null
        ? null
        : watchCategoryLookup(ref)[item.categoryId];
    final visual = categoryVisual(
      icon: category?.icon,
      color: category?.color,
      name: category?.name,
      type: item.type,
    );
    final headers = ref.watch(_previewHeadersProvider);
    final previewCacheWidth =
        (MediaQuery.sizeOf(context).width *
                MediaQuery.devicePixelRatioOf(context))
            .round();
    final imageUrl = item.previewUrl.isEmpty
        ? null
        : ref.read(apiClientProvider).absoluteUrl(item.previewUrl);
    return ZeCard(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: imageUrl == null
                ? Container(
                    constraints: const BoxConstraints(minHeight: 84),
                    color: t.well,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 14,
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.image_not_supported_outlined,
                          size: 18,
                          color: t.faint,
                        ),
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            tr('Original image deleted', '原图已删除'),
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: t.sub,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  )
                : headers.isLoading && !headers.hasValue
                ? SizedBox(
                    height: 220,
                    child: ColoredBox(
                      color: t.well,
                      child: const OwlLoading.small(),
                    ),
                  )
                : Material(
                    color: t.well,
                    child: InkWell(
                      onTap: () => _openFullPreview(
                        context,
                        imageUrl: imageUrl,
                        headers: headers.value,
                        title: item.merchantName ?? item.fileName,
                      ),
                      child: SizedBox(
                        height: 220,
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            // Portrait receipts stay uncropped inside the well,
                            // and tapping opens a pinch-to-zoom full viewer.
                            Padding(
                              padding: const EdgeInsets.all(6),
                              child: Image.network(
                                imageUrl,
                                headers: headers.value,
                                cacheWidth: previewCacheWidth,
                                fit: BoxFit.contain,
                                errorBuilder: (_, _, _) => Center(
                                  child: Icon(
                                    Icons.broken_image_rounded,
                                    color: t.faint,
                                  ),
                                ),
                              ),
                            ),
                            Positioned(
                              right: 10,
                              bottom: 10,
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  color: Colors.black.withValues(alpha: .58),
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 5,
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      const Icon(
                                        Icons.zoom_in_rounded,
                                        size: 14,
                                        color: Colors.white,
                                      ),
                                      const SizedBox(width: 4),
                                      Text(
                                        tr('View full', '查看大图'),
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 11.5,
                                          fontWeight: FontWeight.w700,
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
                    ),
                  ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(6, 14, 6, 4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    ZeIconTile(
                      icon: visual.icon,
                      color: visual.color,
                      size: 40,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.merchantName ?? item.fileName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            item.transactionTime == null
                                ? tr('Time required', '时间待填写')
                                : formatDateTime(item.transactionTime!),
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      item.amountMinor == null
                          ? tr('Required', '待填写')
                          : formatMoneyWithSymbol(
                              item.amountMinor!,
                              item.currency ?? 'CNY',
                            ),
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                        fontFeatures: tabularFigures,
                        color: item.amountMinor == null
                            ? t.danger
                            : t.amountColor(item.type ?? 'expense'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    ZeBadge(label: tr('Screenshot recognition', '截图识别')),
                    if (duplicate)
                      ZeBadge(
                        label: tr('Possible duplicate', '疑似重复'),
                        tone: ZeTone.warn,
                      )
                    else if (!needsFields)
                      ZeBadge(
                        label: tr('Ready to post', '可入账'),
                        tone: ZeTone.income,
                      ),
                    if (item.confidence != null)
                      ZeBadge(
                        label: tr(
                          'Recognition confidence ${(item.confidence! * 100).round()}%',
                          '识别置信度 ${(item.confidence! * 100).round()}%',
                        ),
                      ),
                  ],
                ),
                if (item.warnings.isNotEmpty)
                  _Notice(
                    icon: Icons.warning_amber_rounded,
                    tone: ZeTone.warn,
                    text: item.warnings
                        .map((value) => value is Map ? value['message'] : value)
                        .join(tr('; ', '；')),
                  ),
                if (needsFields)
                  _Notice(
                    icon: Icons.error_outline_rounded,
                    tone: ZeTone.danger,
                    text: tr('Required fields are incomplete', '必填字段尚未补全'),
                  ),
                if (duplicate)
                  _Notice(
                    icon: Icons.report_gmailerrorred_rounded,
                    tone: ZeTone.danger,
                    text: tr(
                      'May duplicate an existing transaction. Choose an action',
                      '可能与已有交易重复，请选择处理方式',
                    ),
                  ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(0, 46),
                        ),
                        onPressed: () async {
                          await _editReceipt(context, ref, jobId, item);
                          onChanged();
                        },
                        icon: const Icon(Icons.edit_rounded, size: 18),
                        label: Text(tr('Edit fields', '编辑字段')),
                      ),
                    ),
                    const SizedBox(width: 8),
                    OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(72, 46),
                      ),
                      onPressed: () => onDecision(item, 'skip'),
                      child: Text(tr('Skip', '跳过')),
                    ),
                  ],
                ),
                if (!needsFields) ...[
                  const SizedBox(height: 8),
                  FilledButton(
                    style: item.decision == 'import' && !duplicate
                        ? FilledButton.styleFrom(
                            minimumSize: const Size(0, 46),
                            backgroundColor: t.primarySoft,
                            foregroundColor: t.accentText,
                          )
                        : FilledButton.styleFrom(
                            minimumSize: const Size(0, 46),
                          ),
                    onPressed: () => onDecision(
                      item,
                      duplicate ? 'import_anyway' : 'import',
                    ),
                    child: Text(
                      duplicate
                          ? tr('Post anyway', '仍然入账')
                          : item.decision == 'import'
                          ? tr('Selected for posting', '已选入账')
                          : tr('Select for posting', '选择入账'),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Tinted inline notice for warnings and blocking problems.
class _Notice extends StatelessWidget {
  const _Notice({required this.icon, required this.tone, required this.text});

  final IconData icon;
  final ZeTone tone;
  final String text;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: t.toneSoft(tone),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 16, color: t.tone(tone)),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                text,
                style: TextStyle(
                  color: tone == ZeTone.danger ? t.danger : t.ink,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

void _openFullPreview(
  BuildContext context, {
  required String imageUrl,
  required Map<String, String>? headers,
  required String title,
}) {
  showDialog<void>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: .9),
    builder: (dialogContext) => Dialog.fullscreen(
      backgroundColor: Colors.black,
      child: SafeArea(
        child: Stack(
          children: [
            Positioned.fill(
              child: InteractiveViewer(
                minScale: 1,
                maxScale: 4,
                child: Center(
                  child: Image.network(
                    imageUrl,
                    headers: headers,
                    fit: BoxFit.contain,
                    errorBuilder: (_, _, _) => const Icon(
                      Icons.broken_image_rounded,
                      color: Colors.white54,
                      size: 48,
                    ),
                  ),
                ),
              ),
            ),
            Positioned(
              top: 8,
              left: 16,
              right: 8,
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: tr('Close', '关闭'),
                    onPressed: () => Navigator.of(dialogContext).pop(),
                    icon: const Icon(Icons.close_rounded, color: Colors.white),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
