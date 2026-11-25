part of 'receipt_review_screen.dart';

Future<void> _editReceipt(
  BuildContext context,
  WidgetRef ref,
  String jobId,
  RecognitionItem item,
) async {
  final categories = await ref.read(repositoryProvider).categories();
  if (!context.mounted) return;
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (context) =>
        _ReceiptEditorSheet(jobId: jobId, item: item, categories: categories),
  );
}

class _ReceiptEditorSheet extends ConsumerStatefulWidget {
  const _ReceiptEditorSheet({
    required this.jobId,
    required this.item,
    required this.categories,
  });

  final String jobId;
  final RecognitionItem item;
  final List<Category> categories;

  @override
  ConsumerState<_ReceiptEditorSheet> createState() =>
      _ReceiptEditorSheetState();
}

class _ReceiptEditorSheetState extends ConsumerState<_ReceiptEditorSheet> {
  late final TextEditingController _amount;
  late final TextEditingController _currency;
  late final TextEditingController _merchant;
  late final TextEditingController _description;
  late final TextEditingController _payment;
  late String _type;
  late String? _categoryId;
  late DateTime _time;
  String? _error;

  @override
  void initState() {
    super.initState();
    final item = widget.item;
    _amount = TextEditingController(
      text:
          item.amount ??
          (item.amountMinor == null
              ? ''
              : (item.amountMinor! / 100).toStringAsFixed(2)),
    );
    _currency = TextEditingController(text: item.currency ?? 'CNY');
    _merchant = TextEditingController(text: item.merchantName ?? '');
    _description = TextEditingController(text: item.description ?? '');
    _payment = TextEditingController(text: item.paymentMethod ?? '');
    _type = item.type ?? 'expense';
    _categoryId = item.categoryId;
    _time = item.transactionTime == null
        ? DateTime.now()
        : DateTime.parse(item.transactionTime!).toLocal();
  }

  @override
  void dispose() {
    _amount.dispose();
    _currency.dispose();
    _merchant.dispose();
    _description.dispose();
    _payment.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final parsed = double.tryParse(_amount.text);
    if (parsed == null ||
        parsed <= 0 ||
        !RegExp(r'^[A-Za-z]{3}$').hasMatch(_currency.text)) {
      setState(
        () => _error = tr(
          'Enter a valid amount and three-letter currency code',
          '请填写有效金额和三位币种代码',
        ),
      );
      return;
    }
    try {
      final item = widget.item;
      await ref
          .read(repositoryProvider)
          .updateRecognitionItem(widget.jobId, item.id, {
            'type': _type,
            'amountMinor': (parsed * 100).round(),
            'currency': _currency.text.toUpperCase(),
            'merchantName': _merchant.text.trim().isEmpty
                ? null
                : _merchant.text.trim(),
            'description': _description.text.trim().isEmpty
                ? null
                : _description.text.trim(),
            'transactionTime': _time.toUtc().toIso8601String(),
            'paymentMethod': _payment.text.trim().isEmpty
                ? null
                : _payment.text.trim(),
            'platformTransactionId': item.platformTransactionId,
            'transactionStatus': item.transactionStatus,
            'categoryId': _categoryId,
          });
      if (mounted) Navigator.pop(context);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  Future<void> _pickDateTime() async {
    final pickedDate = await showDatePicker(
      context: context,
      firstDate: DateTime(2000),
      lastDate: DateTime.now().add(const Duration(days: 365)),
      initialDate: _time,
    );
    if (pickedDate == null || !mounted) return;
    final pickedTime = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_time),
    );
    if (!mounted) return;
    setState(
      () => _time = DateTime(
        pickedDate.year,
        pickedDate.month,
        pickedDate.day,
        pickedTime?.hour ?? _time.hour,
        pickedTime?.minute ?? _time.minute,
      ),
    );
  }

  List<Category> get _matchingCategories => widget.categories
      .where(
        (category) =>
            categoryKindSupportsTransaction(category.kind, _type) ||
            category.id == _categoryId,
      )
      .toList();

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final t = context.ze;
    final categories = _matchingCategories;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          24,
          12,
          24,
          MediaQuery.viewInsetsOf(context).bottom + 24,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ZeSectionHeader(
              title: tr('Edit transaction', '编辑交易'),
              subtitle: item.fileName,
            ),
            const SizedBox(height: 16),
            Text(
              tr('Transaction type', '收支类型'),
              style: Theme.of(context).textTheme.labelMedium,
            ),
            const SizedBox(height: 8),
            ZeSegmented<String>(
              segments: [
                ('expense', tr('Expense', '支出')),
                ('income', tr('Income', '收入')),
                ('refund', tr('Refund', '退款')),
                ('transfer', tr('Transfer', '转账')),
              ],
              selected: _type,
              onChanged: (value) => setState(() {
                _type = value;
                if (_categoryId != null) {
                  final keep = widget.categories.any(
                    (c) =>
                        c.id == _categoryId &&
                        categoryKindSupportsTransaction(c.kind, _type),
                  );
                  if (!keep) _categoryId = null;
                }
              }),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  flex: 3,
                  child: TextField(
                    controller: _amount,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    decoration: InputDecoration(labelText: tr('Amount', '金额')),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextField(
                    controller: _currency,
                    textCapitalization: TextCapitalization.characters,
                    decoration: InputDecoration(
                      labelText: tr('Currency', '币种'),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _merchant,
              decoration: InputDecoration(labelText: tr('Merchant', '商户')),
            ),
            const SizedBox(height: 14),
            Text(
              tr('Category', '分类'),
              style: Theme.of(context).textTheme.labelMedium,
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ChoiceChip(
                  selected: _categoryId == null,
                  onSelected: (_) => setState(() => _categoryId = null),
                  label: Text(tr('Uncategorized', '未分类')),
                ),
                for (final category in categories)
                  Builder(
                    builder: (context) {
                      final visual = categoryVisual(
                        icon: category.icon,
                        color: category.color,
                        name: category.name,
                        type: _type,
                      );
                      return ChoiceChip(
                        selected: _categoryId == category.id,
                        onSelected: (_) =>
                            setState(() => _categoryId = category.id),
                        avatar: Icon(visual.icon, size: 16, color: visual.color),
                        label: Text(category.name),
                      );
                    },
                  ),
              ],
            ),
            const SizedBox(height: 14),
            ZeCard(
              padding: EdgeInsets.zero,
              child: ListTile(
                leading: ZeIconTile(
                  icon: Icons.schedule_rounded,
                  color: t.primary,
                  size: 38,
                ),
                title: Text(tr('Transaction time', '交易时间')),
                subtitle: Text(formatDateTime(_time.toUtc().toIso8601String())),
                trailing: const ZeChevron(),
                onTap: _pickDateTime,
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _payment,
              decoration: InputDecoration(
                labelText: tr('Payment method', '支付方式'),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _description,
              maxLines: 2,
              decoration: InputDecoration(labelText: tr('Notes', '备注')),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(
                  _error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            const SizedBox(height: 18),
            FilledButton(
              onPressed: _save,
              child: Text(tr('Save and recheck', '保存并重新检查')),
            ),
          ],
        ),
      ),
    );
  }
}
