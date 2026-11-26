part of 'transaction_list_screen.dart';

extension _TransactionListFilters on _TransactionListScreenState {
  Future<void> _filters() async {
    final categories = await ref.read(categoriesProvider.future);
    if (!mounted) return;
    var type = _type;
    var source = _source;
    var categoryId = _categoryId;
    var uncategorized = _uncategorized;
    var currency = _currency;
    var dates = _dates;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final thisMonth = DateTimeRange(
      start: DateTime(now.year, now.month, 1),
      end: DateTime(now.year, now.month + 1, 0),
    );
    final lastMonth = DateTimeRange(
      start: DateTime(now.year, now.month - 1, 1),
      end: DateTime(now.year, now.month, 0),
    );
    final last7Days = DateTimeRange(
      start: today.subtract(const Duration(days: 6)),
      end: today,
    );
    final last30Days = DateTimeRange(
      start: today.subtract(const Duration(days: 29)),
      end: today,
    );
    bool sameRange(DateTimeRange? a, DateTimeRange b) =>
        a != null &&
        _date(a.start) == _date(b.start) &&
        _date(a.end) == _date(b.end);

    final types = <(String?, String)>[
      (null, tr('All', '全部')),
      ('expense', tr('Expense', '支出')),
      ('income', tr('Income', '收入')),
      ('refund', tr('Refund', '退款')),
      ('transfer', tr('Transfer', '转账')),
    ];
    final sources = <(String?, String)>[
      (null, tr('All', '全部')),
      ('manual', tr('Manual', '手动记账')),
      ('screenshot', tr('Screenshots', '截图')),
      ('alipay', tr('Alipay', '支付宝')),
      ('wechat', tr('WeChat', '微信')),
      ('cmb', tr('China Merchants Bank', '招商银行')),
      ('taobao', tr('Taobao', '淘宝')),
      ('pinduoduo', tr('Pinduoduo', '拼多多')),
      ('jd', tr('JD.com', '京东')),
      ('pupu', tr('Pupu', '朴朴')),
      ('xianyu', tr('Xianyu', '闲鱼')),
      ('generic', tr('Generic import', '通用导入')),
    ];
    final datePresets = <(String, DateTimeRange)>[
      (tr('This month', '本月'), thisMonth),
      (tr('Last month', '上月'), lastMonth),
      (tr('Last 7 days', '近 7 天'), last7Days),
      (tr('Last 30 days', '近 30 天'), last30Days),
    ];

    final applied = await showModalBottomSheet<bool>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) {
          Widget heading(String text) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              text,
              style: Theme.of(context).textTheme.titleSmall,
            ),
          );
          return SafeArea(
            child: ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.sizeOf(context).height * .85,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Flexible(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(24, 0, 24, 16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          ZeSectionHeader(
                            title: tr('Filter transactions', '筛选交易'),
                          ),
                          const SizedBox(height: 16),
                          heading(tr('Transaction type', '交易类型')),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              for (final (value, label) in types)
                                ChoiceChip(
                                  label: Text(label),
                                  selected: type == value,
                                  onSelected: (_) =>
                                      setSheetState(() => type = value),
                                ),
                            ],
                          ),
                          const SizedBox(height: 16),
                          heading(tr('Date range', '日期范围')),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              for (final (label, range) in datePresets)
                                ChoiceChip(
                                  label: Text(label),
                                  selected: sameRange(dates, range),
                                  onSelected: (selected) => setSheetState(
                                    () => dates = selected ? range : null,
                                  ),
                                ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          OutlinedButton.icon(
                            onPressed: () async {
                              final selected = await showDateRangePicker(
                                context: context,
                                firstDate: DateTime(2000),
                                lastDate: DateTime.now().add(
                                  const Duration(days: 365),
                                ),
                                initialDateRange: dates,
                              );
                              if (selected != null) {
                                setSheetState(() => dates = selected);
                              }
                            },
                            icon: const Icon(Icons.date_range_outlined),
                            label: Text(
                              dates == null
                                  ? tr('Choose date range', '选择日期范围')
                                  : tr(
                                      '${_date(dates!.start)} to ${_date(dates!.end)}',
                                      '${_date(dates!.start)} 至 ${_date(dates!.end)}',
                                    ),
                            ),
                          ),
                          const SizedBox(height: 16),
                          heading(tr('Category', '分类')),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              ChoiceChip(
                                label: Text(tr('All', '全部')),
                                selected: categoryId == null && !uncategorized,
                                onSelected: (_) => setSheetState(() {
                                  categoryId = null;
                                  uncategorized = false;
                                }),
                              ),
                              ChoiceChip(
                                label: Text(tr('Uncategorized', '未分类')),
                                selected: uncategorized,
                                onSelected: (_) => setSheetState(() {
                                  uncategorized = !uncategorized;
                                  if (uncategorized) categoryId = null;
                                }),
                              ),
                              for (final item in categories)
                                () {
                                  final visual = visualForCategory(item);
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
                                    label: Text(item.name),
                                    selected:
                                        !uncategorized && categoryId == item.id,
                                    onSelected: (_) => setSheetState(() {
                                      uncategorized = false;
                                      categoryId = categoryId == item.id
                                          ? null
                                          : item.id;
                                    }),
                                  );
                                }(),
                            ],
                          ),
                          const SizedBox(height: 16),
                          heading(tr('Source', '来源')),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              for (final (value, label) in sources)
                                ChoiceChip(
                                  label: Text(label),
                                  selected: source == value,
                                  onSelected: (_) =>
                                      setSheetState(() => source = value),
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  ZeBottomBar(
                    child: Row(
                      spacing: 10,
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () => setSheetState(() {
                              type = null;
                              source = null;
                              categoryId = null;
                              uncategorized = false;
                              currency = null;
                              dates = null;
                            }),
                            child: Text(tr('Clear', '清除')),
                          ),
                        ),
                        Expanded(
                          flex: 2,
                          child: FilledButton(
                            onPressed: () => Navigator.pop(context, true),
                            child: Text(tr('Apply', '应用')),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
    if (applied == true) {
      _update(() {
        _type = type;
        _source = source;
        _categoryId = uncategorized ? null : categoryId;
        _uncategorized = uncategorized;
        _currency = currency;
        _dates = dates;
      });
      await _refresh();
    }
  }
}
