part of 'transaction_list_screen.dart';

extension _TransactionListView on _TransactionListScreenState {
  void _clearFilters() {
    _update(() {
      _type = null;
      _source = null;
      _categoryId = null;
      _uncategorized = false;
      _currency = null;
      _dates = null;
    });
    _refresh();
  }

  void _closeSearch() {
    _searchDebounce?.cancel();
    final hadQuery = _search.text.isNotEmpty;
    _update(() => _searching = false);
    if (hadQuery) {
      _search.clear();
      _refresh();
    }
  }

  Widget _buildTransactionList(BuildContext context) {
    final t = context.ze;
    final hasAdvancedFilters =
        _source != null ||
        _categoryId != null ||
        _uncategorized ||
        _currency != null ||
        _dates != null;
    final hasAnyFilter =
        hasAdvancedFilters || _type != null || _search.text.trim().isNotEmpty;
    final monthOverview = ref.watch(statisticsProvider('${monthKey()}|CNY'));
    final categoryName = _categoryId == null
        ? null
        : ref
              .watch(categoriesProvider)
              .value
              ?.where((item) => item.id == _categoryId)
              .firstOrNull
              ?.name;
    final showsChips =
        hasAdvancedFilters || _type == 'refund' || _type == 'transfer';
    return Scaffold(
      body: RefreshIndicator(
        edgeOffset: skyBarExtent(context),
        onRefresh: _refresh,
        child: SkyScrollScope(
          child: CustomScrollView(
            controller: _scroll,
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              PinnedHeaderSliver(
                child: SkyBar(
                  layout: SkyLayout.page,
                  title: SkyTitle(tr('Activity', '明细')),
                  actions: [
                    IconButton(
                      tooltip: _searching
                          ? tr('Close search', '关闭搜索')
                          : tr('Search', '搜索'),
                      onPressed: _searching
                          ? _closeSearch
                          : () => _update(() => _searching = true),
                      icon: Icon(
                        _searching
                            ? Icons.search_off_rounded
                            : Icons.search_rounded,
                      ),
                    ),
                    IconButton(
                      tooltip: tr('More filters', '更多筛选'),
                      onPressed: _filters,
                      icon: Badge(
                        isLabelVisible: hasAdvancedFilters,
                        smallSize: 8,
                        backgroundColor: t.primary,
                        child: const Icon(Icons.tune_rounded),
                      ),
                    ),
                  ],
                ),
              ),
              SliverToBoxAdapter(
                child: SkyHeader(
                  layout: SkyLayout.page,
                  busy: _loading,
                  child: hasAnyFilter
                      ? _FilteredSummary(
                          total: _total,
                          items: _items,
                          totals: _totals,
                          type: _type,
                          currency: _currency,
                        )
                      : _MonthFlow(summary: monthOverview.value?.summary),
                ),
              ),
              PinnedHeaderSliver(
                child: ColoredBox(
                  color: t.canvas,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(24, 8, 24, 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      spacing: 8,
                      children: [
                        if (_searching) _searchField(context),
                        ZeSegmented<String?>(
                          segments: [
                            (null, tr('All', '全部')),
                            ('expense', tr('Expense', '支出')),
                            ('income', tr('Income', '收入')),
                          ],
                          selected: _type,
                          onChanged: _setQuickType,
                        ),
                        if (showsChips)
                          Wrap(
                            spacing: 8,
                            runSpacing: 4,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              if (_type == 'refund' || _type == 'transfer')
                                _FilterChip(
                                  label: _type == 'refund'
                                      ? tr('Refunds', '退款')
                                      : tr('Transfers', '转账'),
                                  onDeleted: () => _setQuickType(null),
                                ),
                              if (_source != null)
                                _FilterChip(
                                  label: sourceLabel(_source),
                                  onDeleted: () {
                                    _update(() => _source = null);
                                    _refresh();
                                  },
                                ),
                              if (_uncategorized)
                                _FilterChip(
                                  label: tr('Uncategorized', '未分类'),
                                  onDeleted: () {
                                    _update(() => _uncategorized = false);
                                    _refresh();
                                  },
                                )
                              else if (_categoryId != null)
                                _FilterChip(
                                  label: categoryName ?? tr('Category', '分类'),
                                  onDeleted: () {
                                    _update(() => _categoryId = null);
                                    _refresh();
                                  },
                                ),
                              if (_currency != null)
                                _FilterChip(
                                  label: _currency!,
                                  onDeleted: () {
                                    _update(() => _currency = null);
                                    _refresh();
                                  },
                                ),
                              if (_dates != null)
                                _FilterChip(
                                  label:
                                      '${formatShortDay(_dates!.start)} – ${formatShortDay(_dates!.end)}',
                                  onDeleted: () {
                                    _update(() => _dates = null);
                                    _refresh();
                                  },
                                ),
                              TextButton(
                                onPressed: _clearFilters,
                                child: Text(tr('Clear all', '全部清除')),
                              ),
                            ],
                          ),
                        // Keeps its height, so a reload does not nudge the list.
                        SizedBox(
                          height: 2,
                          child: _loading && _items.isNotEmpty
                              ? const LinearProgressIndicator(minHeight: 2)
                              : null,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              if (_loading && _items.isEmpty)
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: PageLoading(),
                )
              else if (_error != null)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: ErrorView(error: _error!, onRetry: _refresh),
                )
              else if (_items.isEmpty)
                SliverPadding(
                  padding: EdgeInsets.fromLTRB(
                    24,
                    16,
                    24,
                    MediaQuery.paddingOf(context).bottom + 24,
                  ),
                  sliver: SliverToBoxAdapter(
                    child: EmptyView(
                      message: tr('No matching transactions', '没有符合条件的交易'),
                      subtitle: tr(
                        'Try another search or filter',
                        '换个关键词或筛选条件试试',
                      ),
                    ),
                  ),
                )
              else
                SliverPadding(
                  padding: EdgeInsets.fromLTRB(
                    24,
                    0,
                    24,
                    MediaQuery.paddingOf(context).bottom + 24,
                  ),
                  sliver: SliverList.builder(
                    itemCount: _groups.length + (_loadingMore ? 1 : 0),
                    itemBuilder: (context, index) {
                      if (index == _groups.length) {
                        return const Padding(
                          padding: EdgeInsets.all(16),
                          child: OwlLoading.small(),
                        );
                      }
                      return _Day(
                        group: _groups[index],
                        onOpen: _openTransaction,
                      );
                    },
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _searchField(BuildContext context) => SearchBar(
    controller: _search,
    autoFocus: true,
    hintText: tr('Search merchants or descriptions', '搜索商户或说明'),
    leading: Icon(Icons.search_rounded, color: context.ze.faint),
    // Only the clear button listens to typing, so keystrokes do not rebuild
    // the whole ledger.
    trailing: [
      ValueListenableBuilder(
        valueListenable: _search,
        builder: (context, value, _) => value.text.isEmpty
            ? const SizedBox.shrink()
            : IconButton(
                tooltip: tr('Clear search', '清除搜索'),
                onPressed: () {
                  _searchDebounce?.cancel();
                  _search.clear();
                  _refresh();
                },
                icon: const Icon(Icons.close),
              ),
      ),
    ],
    onChanged: _onSearchChanged,
    onSubmitted: (_) {
      _searchDebounce?.cancel();
      _refresh();
    },
  );
}

/// Summary of the active filter or search, replacing the monthly totals on the sky.
class _FilteredSummary extends StatelessWidget {
  const _FilteredSummary({
    required this.total,
    required this.items,
    this.totals,
    this.type,
    this.currency,
  });

  final int total;
  final List<TransactionItem> items;
  final List<TransactionCurrencyTotal>? totals;
  final String? type;
  final String? currency;

  TransactionCurrencyTotal? _resolveCurrencyTotal() {
    final serverTotals = totals;
    if (serverTotals != null) {
      if (currency != null) {
        return serverTotals
            .where((entry) => entry.currency == currency)
            .firstOrNull;
      }
      return serverTotals.length == 1 ? serverTotals.single : null;
    }
    // Never show a partial page sum next to a larger total count.
    if (items.length < total) return null;
    final relevant = [
      for (final item in items)
        if (currency == null || item.currency == currency) item,
    ];
    final currencies = {
      for (final item in relevant)
        if (type == 'transfer' || item.type != 'transfer') item.currency,
    };
    if (currencies.length != 1) return null;
    var expenseMinor = 0;
    var refundMinor = 0;
    var incomeMinor = 0;
    var transferMinor = 0;
    for (final item in relevant) {
      switch (item.type) {
        case 'expense':
          expenseMinor += item.amountMinor;
        case 'refund':
          refundMinor += item.amountMinor;
        case 'income':
          incomeMinor += item.amountMinor;
        case 'transfer':
          transferMinor += item.amountMinor;
      }
    }
    return TransactionCurrencyTotal(
      currency: currencies.single,
      expenseMinor: expenseMinor,
      refundMinor: refundMinor,
      incomeMinor: incomeMinor,
      transferMinor: transferMinor,
    );
  }

  (String, int, String)? _headlineAmount() {
    final entry = _resolveCurrencyTotal();
    if (entry == null) return null;
    switch (type) {
      case 'expense':
        return entry.expenseMinor > 0
            ? (tr('Expenses', '筛选支出'), entry.expenseMinor, entry.currency)
            : null;
      case 'income':
        return entry.incomeMinor > 0
            ? (tr('Income', '筛选收入'), entry.incomeMinor, entry.currency)
            : null;
      case 'refund':
        return entry.refundMinor > 0
            ? (tr('Refunds', '筛选退款'), entry.refundMinor, entry.currency)
            : null;
      case 'transfer':
        return entry.transferMinor > 0
            ? (tr('Transfers', '筛选转账'), entry.transferMinor, entry.currency)
            : null;
      default:
        final netOut = entry.expenseMinor - entry.refundMinor;
        if (entry.expenseMinor > 0 && netOut > 0) {
          return (
            entry.refundMinor > 0
                ? tr('Net out', '筛选净支出')
                : tr('Expenses', '筛选支出'),
            netOut,
            entry.currency,
          );
        }
        if (entry.incomeMinor > 0) {
          return (tr('Income', '筛选收入'), entry.incomeMinor, entry.currency);
        }
        if (entry.refundMinor > 0) {
          return (tr('Refunds', '筛选退款'), entry.refundMinor, entry.currency);
        }
        if (entry.transferMinor > 0) {
          return (tr('Transfers', '筛选转账'), entry.transferMinor, entry.currency);
        }
        return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = SkyPalette.of(context);
    final amount = _headlineAmount();
    Widget stat(String label, String value) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            color: palette.muted,
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 1),
        Text(
          value,
          style: const TextStyle(
            fontSize: 18,
            height: 1.2,
            fontWeight: FontWeight.w800,
            fontFeatures: tabularFigures,
          ),
        ),
      ],
    );
    return FractionallySizedBox(
      alignment: Alignment.centerLeft,
      widthFactor: .7,
      child: FittedBox(
        fit: BoxFit.scaleDown,
        alignment: Alignment.centerLeft,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 22,
          children: [
            stat(tr('Matching', '符合条件'), tr(plural(total, 'item'), '$total 笔')),
            if (amount != null)
              stat(amount.$1, formatMoneyWithSymbol(amount.$2, amount.$3)),
          ],
        ),
      ),
    );
  }
}

/// This month's money out and in, on the sky.
class _MonthFlow extends StatelessWidget {
  const _MonthFlow({required this.summary});

  /// Null while the month loads or when it could not be read.
  final FlowSummary? summary;

  @override
  Widget build(BuildContext context) {
    final palette = SkyPalette.of(context);
    Widget flow(String label, int? minor) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            color: palette.muted,
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 1),
        Text(
          minor == null ? '—' : formatMoneyWithSymbol(minor),
          style: const TextStyle(
            fontSize: 18,
            height: 1.2,
            fontWeight: FontWeight.w800,
            fontFeatures: tabularFigures,
          ),
        ),
      ],
    );
    return FractionallySizedBox(
      alignment: Alignment.centerLeft,
      // The owl has the right side of the sky.
      widthFactor: .7,
      child: FittedBox(
        fit: BoxFit.scaleDown,
        alignment: Alignment.centerLeft,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 22,
          children: [
            flow(tr('Out this month', '本月支出'), summary?.netExpenseMinor),
            flow(tr('In this month', '本月收入'), summary?.incomeMinor),
          ],
        ),
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({required this.label, required this.onDeleted});

  final String label;
  final VoidCallback onDeleted;

  @override
  Widget build(BuildContext context) => InputChip(
    label: Text(label),
    onDeleted: onDeleted,
    deleteIconColor: context.ze.sub,
    backgroundColor: context.ze.well,
    visualDensity: VisualDensity.compact,
  );
}

class _Day extends StatelessWidget {
  const _Day({required this.group, required this.onOpen});

  final _DayGroup group;
  final ValueChanged<TransactionItem> onOpen;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    final net = group.netMinor;
    return Padding(
      padding: const EdgeInsets.only(top: 10, bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            spacing: 12,
            children: [
              Expanded(
                child: Text(
                  group.label,
                  style: Theme.of(
                    context,
                  ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800),
                ),
              ),
              if (net != 0)
                Text(
                  '${net > 0 ? '+' : '-'}${formatMoneyWithSymbol(net.abs(), group.currency)}',
                  style: TextStyle(
                    color: t.sub,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    fontFeatures: tabularFigures,
                  ),
                ),
            ],
          ),
          for (final (index, item) in group.items.indexed) ...[
            if (index > 0) const Divider(),
            TransactionRow(item: item, onTap: () => onOpen(item)),
          ],
        ],
      ),
    );
  }
}
