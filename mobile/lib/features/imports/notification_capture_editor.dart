part of 'notification_capture_screen.dart';

class _EditCaptureSheet extends StatefulWidget {
  const _EditCaptureSheet({required this.item, required this.categories});

  final NotificationCaptureItem item;
  final List<Category> categories;

  @override
  State<_EditCaptureSheet> createState() => _EditCaptureSheetState();
}

class _EditCaptureSheetState extends State<_EditCaptureSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _amount;
  late final TextEditingController _merchant;
  late final TextEditingController _description;
  late final TextEditingController _payment;
  late DateTime _time;
  String? _categoryId;

  @override
  void initState() {
    super.initState();
    final item = widget.item;
    _amount = TextEditingController(
      text: (item.amountMinor / 100).toStringAsFixed(2),
    );
    _merchant = TextEditingController(text: item.merchantName ?? '');
    _description = TextEditingController(text: item.description ?? '');
    _payment = TextEditingController(text: item.paymentMethod ?? '');
    _time = DateTime.parse(item.transactionTime).toLocal();
    _categoryId = item.categoryId;
  }

  @override
  void dispose() {
    _amount.dispose();
    _merchant.dispose();
    _description.dispose();
    _payment.dispose();
    super.dispose();
  }

  String? _nullable(String value) {
    final trimmed = value.trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  Future<void> _pickTime() async {
    final date = await showDatePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 1)),
      initialDate: _time,
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_time),
    );
    if (time == null) return;
    setState(() {
      _time = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    });
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    final amount = double.tryParse(_amount.text.trim());
    if (amount == null) return;
    Navigator.pop(context, {
      'amountMinor': (amount * 100).round(),
      'merchantName': _nullable(_merchant.text),
      'description': _nullable(_description.text),
      'categoryId': _categoryId,
      'transactionTime': _time.toUtc().toIso8601String(),
      'paymentMethod': _nullable(_payment.text),
    });
  }

  @override
  Widget build(BuildContext context) {
    final expenseCategories = widget.categories
        .where(
          (category) => category.kind == 'expense' || category.kind == 'both',
        )
        .toList();
    final prefix = currencySymbol(widget.item.currency).trim();
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          24,
          0,
          24,
          MediaQuery.viewInsetsOf(context).bottom + 24,
        ),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ZeSectionHeader(
                title: tr('Edit payment candidate', '编辑支付候选'),
                subtitle: tr(
                  'Saving will reclassify and recheck duplicates',
                  '保存后会重新分类并检查重复',
                ),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _amount,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: InputDecoration(
                  labelText: tr('Amount', '金额'),
                  prefixText: '$prefix ',
                ),
                validator: (value) {
                  final amount = double.tryParse(value?.trim() ?? '');
                  return amount == null || amount <= 0
                      ? tr('Enter a valid amount', '请输入有效金额')
                      : null;
                },
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: _merchant,
                maxLength: 120,
                decoration: InputDecoration(
                  labelText: tr('Merchant (optional)', '商户（选填）'),
                  counterText: '',
                ),
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: _description,
                maxLength: 240,
                decoration: InputDecoration(
                  labelText: tr('Description', '描述'),
                  counterText: '',
                ),
              ),
              const SizedBox(height: 14),
              Text(
                tr('Category', '分类'),
                style: Theme.of(context).textTheme.titleSmall,
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  ChoiceChip(
                    label: Text(tr('Automatic categorization', '自动分类')),
                    selected: _categoryId == null,
                    onSelected: (_) => setState(() => _categoryId = null),
                  ),
                  for (final category in expenseCategories)
                    () {
                      final visual = visualForCategory(category);
                      return ChoiceChip(
                        avatar: CircleAvatar(
                          backgroundColor: visual.color,
                          radius: 10,
                          child: Icon(
                            visual.icon,
                            size: 12,
                            color: Colors.white,
                          ),
                        ),
                        label: Text(category.name),
                        selected: _categoryId == category.id,
                        onSelected: (_) => setState(
                          () => _categoryId = _categoryId == category.id
                              ? null
                              : category.id,
                        ),
                      );
                    }(),
                ],
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _payment,
                maxLength: 80,
                decoration: InputDecoration(
                  labelText: tr('Payment method', '支付方式'),
                  counterText: '',
                ),
              ),
              const SizedBox(height: 4),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const ZeIconTile(
                  icon: Icons.schedule_rounded,
                  tone: ZeTone.neutral,
                  size: 38,
                ),
                title: Text(tr('Transaction time', '交易时间')),
                subtitle: Text(formatDateTime(_time.toIso8601String())),
                trailing: const ZeChevron(),
                onTap: _pickTime,
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: _submit,
                child: Text(tr('Save changes', '保存修改')),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
