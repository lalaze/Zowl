part of 'transaction_form_screen.dart';

extension _TransactionFormPickers on _TransactionFormScreenState {
  Future<void> _pickTime() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _time,
      firstDate: DateTime(2000),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_time),
    );
    if (time != null) {
      _update(() {
        _ocrTimeConfirmed = true;
        _time = DateTime(
          date.year,
          date.month,
          date.day,
          time.hour,
          time.minute,
        );
      });
    }
  }

  Future<void> _pickCategory(List<Category> categories) async {
    final selected = await showModalBottomSheet<String>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * .75,
          ),
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.fromLTRB(24, 0, 24, 16),
            children: [
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: ZeSectionHeader(
                  title: tr('Choose category', '选择分类'),
                  subtitle: tr(
                    'Only categories compatible with this transaction type are shown',
                    '只显示适用于当前交易类型的分类',
                  ),
                ),
              ),
              ZeGroup(
                children: [
                  _categoryChoice(
                    context,
                    icon: Icons.category_rounded,
                    color: ZeHues.stone,
                    label: tr('Uncategorized', '未分类'),
                    selected: _categoryId == null,
                    value: '__none__',
                  ),
                  for (final item in categories)
                    _categoryChoice(
                      context,
                      icon: visualForCategory(item).icon,
                      color: visualForCategory(item).color,
                      label: item.name,
                      selected: _categoryId == item.id,
                      value: item.id,
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
    if (selected != null && mounted) {
      _update(() => _categoryId = selected == '__none__' ? null : selected);
    }
  }

  Widget _categoryChoice(
    BuildContext context, {
    required IconData icon,
    required Color color,
    required String label,
    required bool selected,
    required String value,
  }) => ListTile(
    leading: ZeIconTile(icon: icon, color: color, size: 38),
    title: Text(label),
    trailing: selected
        ? Icon(Icons.check_rounded, color: context.ze.accentText)
        : null,
    onTap: () => Navigator.pop(context, value),
  );

  Future<void> _pickCurrency() async {
    final selected = await showModalBottomSheet<String>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      builder: (_) => _CurrencyPickerSheet(
        initialCurrency: _currency.text.trim().toUpperCase(),
      ),
    );
    if (selected != null && mounted) {
      _update(() => _currency.text = selected);
    }
  }

  Widget _submitBar(BuildContext context) {
    final t = context.ze;
    return ZeBottomBar(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // An OCR draft is single-use, so only manual entry can chain posts.
          if (!_editing && widget.localOcr == null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: MergeSemantics(
                child: InkWell(
                  onTap: _saving
                      ? null
                      : () => _update(() => _postAnother = !_postAnother),
                  borderRadius: BorderRadius.circular(10),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            tr('Keep open to post another', '入账后继续记下一笔'),
                            style: TextStyle(
                              color: t.sub,
                              fontSize: 13.5,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        SizedBox.square(
                          dimension: 20,
                          child: Checkbox(
                            value: _postAnother,
                            visualDensity: VisualDensity.compact,
                            materialTapTargetSize:
                                MaterialTapTargetSize.shrinkWrap,
                            onChanged: _saving
                                ? null
                                : (value) => _update(
                                    () => _postAnother = value ?? false,
                                  ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ZePrimaryButton(
            onPressed: _saving ? null : _submit,
            loading: _saving,
            icon: Icons.check_rounded,
            label: widget.localOcr != null
                ? tr('Confirm and post', '确认并记账')
                : _editing
                ? tr('Save amendment', '保存修改')
                : tr('Confirm and post', '确认入账'),
          ),
        ],
      ),
    );
  }
}

class _CurrencyPickerSheet extends StatefulWidget {
  const _CurrencyPickerSheet({required this.initialCurrency});

  final String initialCurrency;

  @override
  State<_CurrencyPickerSheet> createState() => _CurrencyPickerSheetState();
}

class _CurrencyPickerSheetState extends State<_CurrencyPickerSheet> {
  static const _common = ['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'HKD'];
  late final TextEditingController _custom = TextEditingController(
    text: widget.initialCurrency,
  );
  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _custom.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Padding(
      padding: EdgeInsets.fromLTRB(
        24,
        0,
        24,
        MediaQuery.viewInsetsOf(context).bottom + 20,
      ),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ZeSectionHeader(
              title: tr('Currency', '币种'),
              subtitle: tr(
                'Pick a common currency or enter a three-letter code',
                '选择常用币种或输入三位字母代码',
              ),
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final code in _common)
                  ChoiceChip(
                    label: Text(code),
                    selected: widget.initialCurrency == code,
                    onSelected: (_) => Navigator.pop(context, code),
                  ),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _custom,
                    textCapitalization: TextCapitalization.characters,
                    maxLength: 3,
                    decoration: InputDecoration(
                      labelText: tr('Currency', '币种'),
                      counterText: '',
                    ),
                    validator: (value) =>
                        RegExp(r'^[A-Za-z]{3}$').hasMatch(value?.trim() ?? '')
                        ? null
                        : tr('Three-letter code', '请输入三位字母代码'),
                  ),
                ),
                const SizedBox(width: 10),
                FilledButton(
                  onPressed: () {
                    if (_formKey.currentState!.validate()) {
                      Navigator.pop(context, _custom.text.trim().toUpperCase());
                    }
                  },
                  child: Text(tr('Apply', '应用')),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  );
}
