part of 'receipt_review_screen.dart';

class _ReviewBanner extends StatelessWidget {
  const _ReviewBanner({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) => ZeCard(
    tone: count == 0 ? ZeTone.income : ZeTone.warn,
    margin: const EdgeInsets.only(bottom: 12),
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    radius: 16,
    child: Row(
      children: [
        Icon(
          count == 0 ? Icons.check_circle_rounded : Icons.fact_check_rounded,
          size: 18,
          color: context.ze.tone(count == 0 ? ZeTone.income : ZeTone.warn),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            count == 0
                ? tr(
                    'All screenshots reviewed · Pull to refresh',
                    '截图已全部核对 · 下拉可刷新',
                  )
                : tr(
                    '${plural(count, 'candidate')} · Complete required fields before resolving duplicates',
                    '$count 笔候选 · 补全必填字段后再处理重复项',
                  ),
            style: TextStyle(
              color: context.ze.ink,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    ),
  );
}
