part of 'transaction_form_screen.dart';

extension _TransactionFormLogic on _TransactionFormScreenState {
  Map<String, dynamic> _facts() => {
    'type': _type,
    'amount': _amount.text.trim(),
    'currency': _currency.text.trim().toUpperCase(),
    'merchantName': _nullable(_merchant.text),
    'description': _nullable(_description.text),
    'categoryId': _categoryId,
    'transactionTime': _time.toUtc().toIso8601String(),
    'paymentMethod': _nullable(_payment.text),
  };

  void _refreshOperationIdentity(Map<String, dynamic> facts) {
    final signature = jsonEncode(facts);
    if (_lastSignature != signature) {
      _operationId = const Uuid().v4();
      _lastSignature = signature;
    }
  }

  Map<dynamic, dynamic>? _duplicateAssessment(dynamic data) {
    if (data is! Map) return null;
    return data['assessment'] is Map
        ? data['assessment'] as Map
        : data['items'] is List && (data['items'] as List).isNotEmpty
        ? ((data['items'] as List).first as Map)['assessment'] as Map?
        : null;
  }

  String _duplicateDescription(dynamic data) {
    final assessment = _duplicateAssessment(data);
    final reason = assessment?['reasonCode']?.toString();
    return switch (reason) {
      'same_amount_merchant_near_time' => tr(
        'A transaction has the same amount and merchant at a nearby time.',
        '已有一笔金额、商户相同且时间相近的交易。',
      ),
      'same_platform_transaction_id' => tr(
        'A transaction has the same platform transaction ID.',
        '已有一笔平台交易号相同的交易。',
      ),
      'exact_fingerprint' => tr(
        'A transaction has identical transaction facts.',
        '已有一笔信息完全相同的交易。',
      ),
      _ => tr('A potentially matching transaction was found.', '发现一笔可能相同的交易。'),
    };
  }

  String? _assessmentDigest(dynamic data) {
    if (data is! Map) return null;
    if (data['assessmentDigest'] != null) {
      return data['assessmentDigest'].toString();
    }
    final items = data['items'];
    if (items is List && items.isNotEmpty && items.first is Map) {
      return (items.first as Map)['assessmentDigest']?.toString();
    }
    return null;
  }

  Future<bool> _confirmDuplicate(dynamic data) async {
    final matchedId = _duplicateAssessment(
      data,
    )?['matchedTransactionId']?.toString();
    TransactionItem? matched;
    if (matchedId != null) {
      try {
        matched = await ref.read(repositoryProvider).transaction(matchedId);
      } on ApiException {
        // The assessment is still valid even if the matching row changed
        // before this read. The digest is revalidated by the backend.
      }
    }
    if (!mounted) return false;
    final matchedFacts = matched == null
        ? ''
        : '${displayNameFor(matched)}\n'
              '${formatSignedMoney(matched.amountMinor, matched.type, matched.currency)} · '
              '${formatDateTime(matched.transactionTime)}';
    final matchedSummary = matched == null
        ? matchedId == null
              ? ''
              : tr(
                  '\n\nMatching transaction:$matchedId',
                  '\n\n匹配的交易：$matchedId',
                )
        : tr(
            '\n\nMatching transaction: $matchedFacts',
            '\n\n匹配的交易：$matchedFacts',
          );
    return confirmDialog(
      context,
      title: tr('This transaction may be a duplicate', '这笔交易可能重复'),
      message:
          '${_duplicateDescription(data)}$matchedSummary\n\n'
          '${tr('Post anyway?', '仍要入账吗？')}',
      cancelLabel: tr('Go back and edit', '返回修改'),
      confirmLabel: tr('Post anyway', '仍然入账'),
    );
  }

  Future<void> _submit({String? duplicateDigest}) async {
    if (_saving && duplicateDigest == null) return;
    if (!_key.currentState!.validate()) return;
    if (_editing && _expectedRevisionId == null) {
      _update(
        () => _error = tr(
          'Missing transaction revision. Cannot safely amend',
          '缺少交易版本，无法安全修改',
        ),
      );
      return;
    }
    final facts = _facts();
    _refreshOperationIdentity(facts);
    _update(() {
      _saving = true;
      _posted = false;
      _error = null;
    });
    try {
      Map<String, dynamic> result;
      if (_editing) {
        result = await ref.read(repositoryProvider).amendTransaction(
          widget.initial!.id,
          {
            ...facts,
            'learnCategoryRule': _learnRule,
            'expectedRevisionId': _expectedRevisionId,
            'operationId': _operationId,
            if (duplicateDigest != null)
              'duplicateOverride': {'assessmentDigest': duplicateDigest},
          },
        );
      } else {
        result = await ref.read(repositoryProvider).createTransaction({
          ...facts,
          'confirmation': {'id': _operationId, 'version': 1},
          if (duplicateDigest != null)
            'duplicateOverride': {'assessmentDigest': duplicateDigest},
        });
      }
      if (!mounted) return;
      final id = _editing ? widget.initial!.id : result['id']?.toString();
      if (id == null) {
        throw ApiException(
          statusCode: 0,
          code: 'MISSING_ID',
          message: tr(
            'Posting succeeded but no transaction ID was returned',
            '已入账，但没有返回交易编号',
          ),
        );
      }
      refreshLedger(ref);
      ref.invalidate(transactionProvider(id));
      if (!_editing && _postAnother) {
        _update(() {
          _amount.clear();
          _merchant.clear();
          _description.clear();
          _payment.clear();
          _time = DateTime.now();
          _lastSignature = null;
          _operationId = const Uuid().v4();
          _initialDraft = jsonEncode(_facts());
          _posted = true;
        });
        _amountFocus.requestFocus();
      } else {
        _discardAllowed = true;
        context.go('/transactions/$id');
      }
    } on ApiException catch (error) {
      if (!mounted) return;
      if (error.statusCode == 409 && error.data is Map) {
        final status = (error.data as Map)['status']?.toString();
        if (status == 'needs_review') {
          final digest = _assessmentDigest(error.data);
          if (digest != null &&
              await _confirmDuplicate(error.data) &&
              mounted) {
            await _submit(duplicateDigest: digest);
            return;
          }
        } else if (status == 'revision_conflict' && _editing) {
          final latest = await ref
              .read(repositoryProvider)
              .transaction(widget.initial!.id);
          _expectedRevisionId = latest.currentRevisionId;
          _operationId = const Uuid().v4();
          if (mounted) {
            await showDialog<void>(
              context: context,
              builder: (context) => AlertDialog(
                title: Text(tr('Transaction changed elsewhere', '这笔交易已在别处修改')),
                content: Text(
                  tr(
                    'The latest revision has been loaded and your draft preserved. Review all fields before saving again; changes are never overwritten automatically.',
                    '已载入最新版本，你的草稿也已保留。请重新核对所有字段后再保存；系统不会自动覆盖任何修改。',
                  ),
                ),
                actions: [
                  FilledButton(
                    onPressed: () => Navigator.pop(context),
                    child: Text(tr('Review again', '重新核对')),
                  ),
                ],
              ),
            );
          }
          return;
        }
      }
      _update(() => _error = error.message);
    } finally {
      if (mounted) _update(() => _saving = false);
    }
  }
}
