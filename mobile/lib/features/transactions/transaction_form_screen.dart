import 'dart:convert';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';

import '../../core/api.dart';
import '../../core/formatters.dart';
import '../../core/models.dart';
import '../../core/providers.dart';
import '../../core/theme.dart';
import '../common/category_visuals.dart';
import '../common/owl_motion.dart';
import '../common/sky.dart';
import '../common/widgets.dart';
import '../../core/l10n.dart';

part 'transaction_form_logic.dart';
part 'transaction_form_pickers.dart';
part 'transaction_form_view.dart';

class TransactionFormScreen extends ConsumerStatefulWidget {
  const TransactionFormScreen({super.key, this.initial});
  final TransactionItem? initial;

  @override
  ConsumerState<TransactionFormScreen> createState() =>
      _TransactionFormScreenState();
}

class _TransactionFormScreenState extends ConsumerState<TransactionFormScreen> {
  final _key = GlobalKey<FormState>();
  final _amount = TextEditingController();
  final _currency = TextEditingController(text: 'CNY');
  final _merchant = TextEditingController();
  final _description = TextEditingController();
  final _payment = TextEditingController();
  final _amountFocus = FocusNode();
  bool _focusScheduled = false;
  String _type = 'expense';
  String? _categoryId;
  DateTime _time = DateTime.now();
  bool _learnRule = false;
  bool _saving = false;
  bool _postAnother = false;
  bool _posted = false;
  bool _discardAllowed = false;
  bool _hasUnsavedChanges = false;
  bool _updatingDraft = false;
  late String _initialDraft;
  String? _error;
  String? _lastSignature;
  String _operationId = const Uuid().v4();
  String? _expectedRevisionId;

  bool get _editing => widget.initial != null;

  @override
  void initState() {
    super.initState();
    final item = widget.initial;
    if (item != null) {
      _amount.text = item.amount ?? (item.amountMinor / 100).toStringAsFixed(2);
      _currency.text = item.currency;
      _merchant.text = item.merchantName ?? '';
      _description.text = item.description ?? '';
      _payment.text = item.paymentMethod ?? '';
      _type = item.type;
      _categoryId = item.categoryId;
      _time = DateTime.parse(item.transactionTime).toLocal();
      _expectedRevisionId = item.currentRevisionId;
    }
    _initialDraft = jsonEncode(_facts());
    for (final controller in [
      _amount,
      _currency,
      _merchant,
      _description,
      _payment,
    ]) {
      controller.addListener(_draftChanged);
    }
  }

  bool _hasDraftChanges() => jsonEncode(_facts()) != _initialDraft;

  void _draftChanged() {
    if (_updatingDraft || !mounted) return;
    final dirty = _hasDraftChanges();
    if (dirty != _hasUnsavedChanges) {
      setState(() => _hasUnsavedChanges = dirty);
    }
  }

  Future<void> _confirmLeave() async {
    if (_saving) return;
    final discard = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(tr('Discard unfinished changes?', '放弃未保存的修改？')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(tr('Keep editing', '继续编辑')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(tr('Discard draft', '放弃草稿')),
          ),
        ],
      ),
    );
    if (discard == true && mounted) {
      setState(() => _discardAllowed = true);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.pop();
      });
    }
  }

  // Focusing during the push transition makes the keyboard animate in while
  // the page slides, relaying out every frame. Wait until the route settles.
  // The route only attaches its real transition after the first frame.
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_editing || _focusScheduled) return;
    _focusScheduled = true;
    final animation = ModalRoute.of(context)?.animation;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (animation == null || animation.isCompleted) {
        _amountFocus.requestFocus();
        return;
      }
      void onStatus(AnimationStatus status) {
        if (status != AnimationStatus.completed) return;
        animation.removeStatusListener(onStatus);
        if (mounted) _amountFocus.requestFocus();
      }

      animation.addStatusListener(onStatus);
    });
  }

  @override
  void dispose() {
    _amountFocus.dispose();
    for (final controller in [
      _amount,
      _currency,
      _merchant,
      _description,
      _payment,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  String? _nullable(String input) => input.trim().isEmpty ? null : input.trim();

  void _update(VoidCallback mutation) {
    _updatingDraft = true;
    try {
      setState(() {
        mutation();
        _hasUnsavedChanges = _hasDraftChanges();
      });
    } finally {
      _updatingDraft = false;
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: _discardAllowed || (!_saving && !_hasUnsavedChanges),
    onPopInvokedWithResult: (didPop, _) {
      if (!didPop) _confirmLeave();
    },
    child: _buildTransactionForm(context),
  );
}
