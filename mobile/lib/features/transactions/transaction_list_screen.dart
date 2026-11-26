import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/api.dart';
import '../../core/formatters.dart';
import '../../core/l10n.dart';
import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../common/category_visuals.dart';
import '../common/owl_motion.dart';
import '../common/page_states.dart';
import '../common/sky.dart';
import '../common/ze_controls.dart';
import '../common/ze_labels.dart';
import '../common/ze_surfaces.dart';
import 'transaction_row.dart';

part 'transaction_list_filters.dart';
part 'transaction_list_view.dart';

class TransactionListScreen extends ConsumerStatefulWidget {
  const TransactionListScreen({super.key});
  @override
  ConsumerState<TransactionListScreen> createState() =>
      _TransactionListScreenState();
}

class _TransactionListScreenState extends ConsumerState<TransactionListScreen> {
  final _scroll = ScrollController();
  final _search = TextEditingController();
  final List<TransactionItem> _items = [];
  List<_DayGroup> _groups = const [];
  int _generation = 0;
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;
  int _page = 1;
  int _totalPages = 1;
  int _total = 0;
  List<TransactionCurrencyTotal>? _totals;
  bool _searching = false;
  Timer? _searchDebounce;
  String? _type;
  String? _source;
  String? _categoryId;
  bool _uncategorized = false;
  String? _currency;
  DateTimeRange? _dates;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.extentAfter < 280) _loadMore();
    });
    ref.listenManual(ledgerRefreshProvider, (_, _) {
      if (mounted) _refresh();
    });
    Future.microtask(() {
      final pending = ref.read(activityFilterRequestProvider);
      if (pending != null) {
        _applyFilterRequest(pending);
      } else {
        _refresh();
      }
    });
  }

  void _applyFilterRequest(ActivityFilterRequest request) {
    ref.read(activityFilterRequestProvider.notifier).clear();
    _searchDebounce?.cancel();
    _search.clear();
    setState(() {
      _searching = false;
      _type = request.type;
      _source = request.source;
      _categoryId = request.uncategorized ? null : request.categoryId;
      _uncategorized = request.uncategorized;
      _currency = request.currency;
      _dates = request.dates;
    });
    if (_scroll.hasClients) _scroll.jumpTo(0);
    _refresh();
  }

  void _onSearchChanged(String _) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) _refresh();
    });
  }

  void _update(VoidCallback mutation) => setState(mutation);

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _scroll.dispose();
    _search.dispose();
    super.dispose();
  }

  String _date(DateTime value) => value.toIso8601String().substring(0, 10);

  Future<void> _setQuickType(String? type) async {
    setState(() => _type = type);
    await _refresh();
  }

  // Grouping runs only when the loaded items change, not on every rebuild.
  void _regroup() {
    final groups = <String, List<TransactionItem>>{};
    final dayFormat = DateFormat('yyyy-MM-dd');
    for (final item in _items) {
      final parsed = DateTime.tryParse(item.transactionTime)?.toLocal();
      final key = parsed == null
          ? item.transactionTime
          : dayFormat.format(parsed);
      groups.putIfAbsent(key, () => []).add(item);
    }
    final dayCurrency = _currency ?? 'CNY';
    _groups = [
      for (final entry in groups.entries)
        _DayGroup(
          key: entry.key,
          items: entry.value,
          currency: dayCurrency,
          // Net movement for the day in the active currency (CNY by default);
          // transfers move money between the user's own accounts, so they are left out.
          netMinor: entry.value
              .where(
                (item) =>
                    item.currency == dayCurrency && item.type != 'transfer',
              )
              .fold<int>(
                0,
                (sum, item) => isIncoming(item.type)
                    ? sum + item.amountMinor
                    : sum - item.amountMinor,
              ),
        ),
    ];
  }

  // Keeps the current list on screen while reloading; only the first load
  // (or a load with nothing to show) falls back to a full-screen spinner.
  Future<void> _refresh() async {
    final generation = ++_generation;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await ref
          .read(repositoryProvider)
          .transactions(
            keyword: _search.text.trim(),
            type: _type,
            source: _source,
            categoryId: _uncategorized ? null : _categoryId,
            uncategorized: _uncategorized ? true : null,
            currency: _currency,
            dateFrom: _dates == null ? null : _date(_dates!.start),
            dateTo: _dates == null ? null : _date(_dates!.end),
          );
      if (!mounted || generation != _generation) return;
      setState(() {
        _items
          ..clear()
          ..addAll(result.items);
        _regroup();
        _page = result.pagination.page;
        _totalPages = result.pagination.totalPages;
        _total = result.pagination.total;
        _totals = result.totals;
      });
      ref.invalidate(statisticsProvider('${monthKey()}|CNY'));
    } on ApiException catch (error) {
      if (!mounted || generation != _generation) return;
      if (_items.isEmpty) {
        setState(() => _error = error.message);
      } else {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted && generation == _generation) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _openTransaction(TransactionItem item) async {
    await context.push('/transactions/${item.id}', extra: item);
    await _refresh();
  }

  Future<void> _loadMore() async {
    if (_loading || _loadingMore || _page >= _totalPages) return;
    final generation = _generation;
    setState(() => _loadingMore = true);
    try {
      final result = await ref
          .read(repositoryProvider)
          .transactions(
            page: _page + 1,
            keyword: _search.text.trim(),
            type: _type,
            source: _source,
            categoryId: _uncategorized ? null : _categoryId,
            uncategorized: _uncategorized ? true : null,
            currency: _currency,
            dateFrom: _dates == null ? null : _date(_dates!.start),
            dateTo: _dates == null ? null : _date(_dates!.end),
          );
      if (mounted && generation == _generation) {
        setState(() {
          _items.addAll(result.items);
          _regroup();
          _page = result.pagination.page;
          _totalPages = result.pagination.totalPages;
          if (result.totals != null) _totals = result.totals;
        });
      }
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Captures post in the background; reload when the app comes back to the foreground.
    ref.listen(foregroundRefreshProvider, (_, _) => _refresh());
    ref.listen(activityFilterRequestProvider, (_, next) {
      if (next != null) _applyFilterRequest(next);
    });
    return _buildTransactionList(context);
  }
}

class _DayGroup {
  const _DayGroup({
    required this.key,
    required this.items,
    required this.currency,
    required this.netMinor,
  });

  /// The local `yyyy-MM-dd` day, or the raw time when it does not parse.
  final String key;

  // Worked out on every build so the header follows the UI language.
  String get label {
    final day = DateTime.tryParse(key);
    return day == null ? key : formatDayLabel(day);
  }

  final List<TransactionItem> items;
  final String currency;
  final int netMinor;
}
