part of 'transaction_form_screen.dart';

const _quickCategoryCount = 7;

extension _TransactionFormView on _TransactionFormScreenState {
  Widget _buildTransactionForm(BuildContext context) {
    final categories = ref.watch(categoriesProvider);
    // Recent entries drive merchant templates and category order.
    final recent =
        ref.watch(recentEntryTemplatesProvider).value ??
        const <TransactionItem>[];
    final merchants = <String>{};
    final templates = recent
        .where(
          (item) =>
              item.merchantName != null && merchants.add(item.merchantName!),
        )
        .take(4)
        .toList();
    final title = widget.localOcr != null
        ? tr('On-device scan · Confirm manually', '本地识别 · 手动确认')
        : _editing
        ? tr('Amend transaction', '修改交易')
        : tr('Add transaction', '记一笔');
    return Scaffold(
      body: Form(
        key: _key,
        child: Column(
          children: [
            Expanded(
              child: SkyScrollScope(
                child: CustomScrollView(
                  slivers: [
                    PinnedHeaderSliver(
                      child: SkyBar(
                        layout: SkyLayout.page,
                        leading: const SkyBackButton(),
                        title: SkyTitle(title, small: true),
                        actions: [
                          if (!_editing && widget.localOcr == null)
                            IconButton(
                              tooltip: tr('Recognize screenshots', '识别截图'),
                              onPressed: () =>
                                  context.pushReplacement('/imports'),
                              icon: const Icon(Icons.document_scanner_rounded),
                            ),
                        ],
                      ),
                    ),
                    SliverToBoxAdapter(
                      child: SkyHeader(
                        layout: SkyLayout.page,
                        padding: EdgeInsets.fromLTRB(
                          24,
                          4,
                          24,
                          72 *
                              SkyLayout.scaleFor(
                                MediaQuery.sizeOf(context).width,
                              ),
                        ),
                        // The owl watches the amount being typed.
                        owlGaze: const Offset(-4, -3),
                        busy: categories.isLoading || _saving,
                        child: categories.hasValue
                            ? _amountField(context)
                            : const SizedBox(height: 60),
                      ),
                    ),
                    categories.when(
                      loading: () => const SliverFillRemaining(
                        hasScrollBody: false,
                        child: PageLoading(),
                      ),
                      error: (error, _) => SliverFillRemaining(
                        hasScrollBody: false,
                        child: Center(child: Text(error.toString())),
                      ),
                      data: (items) => SliverPadding(
                        padding: const EdgeInsets.fromLTRB(24, 6, 24, 20),
                        sliver: SliverToBoxAdapter(
                          child: _entry(context, items, recent, templates),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (categories.hasValue) _submitBar(context),
          ],
        ),
      ),
    );
  }

  Widget _entry(
    BuildContext context,
    List<Category> items,
    List<TransactionItem> recent,
    List<TransactionItem> templates,
  ) {
    final t = context.ze;
    final availableCategories = items
        .where((item) => categoryKindSupportsTransaction(item.kind, _type))
        .toList();
    final recentCategoryIds = recent
        .map((item) => item.categoryId)
        .whereType<String>()
        .toSet()
        .toList();
    final position = {
      for (final (index, item) in availableCategories.indexed) item.id: index,
    };
    int rank(Category item) {
      final index = recentCategoryIds.indexOf(item.id);
      return index < 0 ? recentCategoryIds.length : index;
    }

    // Stable: unused categories keep their configured order.
    availableCategories.sort((a, b) {
      final byRecent = rank(a).compareTo(rank(b));
      return byRecent != 0
          ? byRecent
          : position[a.id]!.compareTo(position[b.id]!);
    });
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (widget.localOcr != null)
          ZeCard(
            tone: ZeTone.warn,
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(16),
            child: Text(
              tr(
                    'On-device OCR prefilled this manual entry; nothing is posted yet. Check the amount and merchant and choose the time. Only the fields you confirm are submitted, recorded as a manual entry; the screenshot and recognized text are never saved. The draft expires in 5 minutes.',
                    '本地 OCR 辅助手动录入，尚未记账。请核对金额、商户并选择交易时间。仅确认后提交编辑后的字段，账本来源为手动录入；不保存截图或 OCR 全文。草稿 5 分钟后失效。',
                  ) +
                  switch (widget.localOcr!.warning) {
                    'multiple_amounts' => tr(
                      '\nSeveral amounts were found, so the amount is blank. Enter it yourself.',
                      '\n识别到多个金额：金额已留空，请人工填写。',
                    ),
                    'missing_amount' => tr(
                      '\nNo clear amount was found. Enter it yourself.',
                      '\n未识别到明确金额，请人工填写。',
                    ),
                    _ => '',
                  },
            ),
          ),
        if (_posted)
          Semantics(
            liveRegion: true,
            child: ZeCard(
              tone: ZeTone.income,
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(14),
              child: Text(
                tr('Transaction posted. Ready for the next one', '已入账，可以记下一笔了'),
                style: TextStyle(color: t.income, fontWeight: FontWeight.w700),
              ),
            ),
          ),
        ZeSegmented<String>(
          segments: [
            ('expense', tr('Expense', '支出')),
            ('income', tr('Income', '收入')),
            ('refund', tr('Refund', '退款')),
            ('transfer', tr('Transfer', '转账')),
          ],
          selected: _type,
          onChanged: (value) => _update(() {
            if (value == _type) return;
            _type = value;
            _categoryId = null;
          }),
        ),
        if (!_editing && widget.localOcr == null && templates.isNotEmpty) ...[
          const SizedBox(height: 14),
          _recentTemplates(context, templates),
        ],
        const SizedBox(height: 16),
        _categories(context, availableCategories),
        const SizedBox(height: 14),
        _details(context),
        if (_editing)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _learnRule,
              onChanged: (value) => _update(() => _learnRule = value),
              title: Text(tr('Remember this merchant’s category', '记住此商户的分类')),
              subtitle: Text(
                tr(
                  'A learning rule is created only when you explicitly enable this',
                  '只有你主动开启时才会创建分类规则',
                ),
              ),
            ),
          ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(
              _error!,
              style: TextStyle(color: t.danger, fontWeight: FontWeight.w600),
            ),
          ),
      ],
    );
  }

  Widget _amountField(BuildContext context) {
    final palette = SkyPalette.of(context);
    final code = _currency.text.trim().toUpperCase();
    return FractionallySizedBox(
      alignment: Alignment.centerLeft,
      // The owl has the right side of the sky.
      widthFactor: .72,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ValueListenableBuilder(
            valueListenable: _amount,
            builder: (context, value, _) {
              // Long amounts get smaller type instead of scrolling out of sight.
              final size = switch (value.text.length) {
                <= 6 => 48.0,
                <= 8 => 38.0,
                _ => 30.0,
              };
              return Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(right: 4),
                    child: Text(
                      currencySymbol(code).trim(),
                      style: TextStyle(
                        fontSize: size * .56,
                        height: 1.1,
                        fontWeight: FontWeight.w700,
                        color: palette.foreground,
                      ),
                    ),
                  ),
                  Expanded(
                    child: TextFormField(
                      controller: _amount,
                      focusNode: _amountFocus,
                      cursorColor: palette.foreground,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      style: TextStyle(
                        fontSize: size,
                        height: 1.1,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -size * .02,
                        color: palette.foreground,
                        fontFeatures: tabularFigures,
                      ),
                      decoration: InputDecoration(
                        filled: false,
                        isDense: true,
                        hintText: '0.00',
                        hintStyle: TextStyle(
                          color: palette.foreground.withValues(alpha: .45),
                        ),
                        errorStyle: TextStyle(
                          color: palette.danger,
                          fontWeight: FontWeight.w700,
                        ),
                        errorMaxLines: 2,
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        errorBorder: InputBorder.none,
                        focusedErrorBorder: InputBorder.none,
                        contentPadding: const EdgeInsets.symmetric(vertical: 4),
                      ),
                      validator: (value) {
                        final parsed = double.tryParse(value ?? '');
                        if (parsed == null || parsed <= 0) {
                          return tr('Enter a valid amount', '请输入有效金额');
                        }
                        if ((value?.split('.').elementAtOrNull(1)?.length ??
                                0) >
                            2) {
                          return tr('Up to two decimal places', '最多两位小数');
                        }
                        return null;
                      },
                    ),
                  ),
                ],
              );
            },
          ),
          const SizedBox(height: 6),
          Semantics(
            button: true,
            label: tr('Currency: $code', '币种：$code'),
            child: InkWell(
              onTap: _saving ? null : _pickCurrency,
              borderRadius: BorderRadius.circular(99),
              child: SkyPill(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  spacing: 4,
                  children: [
                    Icon(
                      Icons.unfold_more_rounded,
                      size: 14,
                      color: palette.foreground,
                    ),
                    Text(code.isEmpty ? 'CNY' : code),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// One tap refills type, merchant, category, currency and payment method
  /// from a recent entry; the amount and time stay for the user to enter.
  Widget _recentTemplates(BuildContext context, List<TransactionItem> items) =>
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            tr('Recent merchants', '最近的商户'),
            style: Theme.of(context).textTheme.labelLarge,
          ),
          const SizedBox(height: 8),
          // One row, however many: it scrolls out to the screen's edges.
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            clipBehavior: Clip.none,
            child: Row(
              spacing: 8,
              children: [
                for (final item in items)
                  ActionChip(
                    label: Text(item.merchantName!),
                    onPressed: _saving
                        ? null
                        : () => _update(() {
                            _type = item.type;
                            _merchant.text = item.merchantName!;
                            _categoryId = item.categoryId;
                            _currency.text = item.currency;
                            _payment.text = item.paymentMethod ?? '';
                          }),
                  ),
              ],
            ),
          ),
        ],
      );

  Widget _categories(BuildContext context, List<Category> available) {
    final t = context.ze;
    final quick = available.take(_quickCategoryCount).toList();
    final selected = available.where((item) => item.id == _categoryId);
    // Keep a category picked from the full list visible in the grid.
    if (selected.isNotEmpty && !quick.contains(selected.first)) {
      if (quick.length == _quickCategoryCount) quick.removeLast();
      quick.insert(0, selected.first);
    }
    final hasMore = available.length > quick.length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  tr('Category', '分类'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: Text(
                  selected.isEmpty
                      ? tr('Uncategorized', '未分类')
                      : selected.first.name,
                  textAlign: TextAlign.end,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: selected.isEmpty ? t.faint : t.ink,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
        if (available.isEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              tr('No categories for this type yet', '这个类型还没有分类'),
              style: Theme.of(context).textTheme.bodySmall,
            ),
          )
        else
          LayoutBuilder(
            builder: (context, constraints) {
              final width = constraints.maxWidth / 4;
              return Wrap(
                runSpacing: 8,
                children: [
                  for (final category in quick)
                    SizedBox(
                      width: width,
                      child: _CategoryOption(
                        category: category,
                        selected: category.id == _categoryId,
                        onTap: () => _update(
                          () => _categoryId = category.id == _categoryId
                              ? null
                              : category.id,
                        ),
                      ),
                    ),
                  if (hasMore)
                    SizedBox(
                      width: width,
                      child: _MoreCategoriesOption(
                        onTap: () => _pickCategory(available),
                      ),
                    ),
                ],
              );
            },
          ),
      ],
    );
  }

  Widget _details(BuildContext context) {
    final t = context.ze;
    final timeLabel = widget.localOcr != null && !_ocrTimeConfirmed
        ? tr('Choose when the payment happened (required)', '请选择实际交易时间（必填）')
        : DateFormat('yyyy-MM-dd HH:mm').format(_time);
    return Column(
      children: [
        TextFormField(
          controller: _merchant,
          maxLength: 120,
          decoration: InputDecoration(
            labelText: tr('Merchant name (optional)', '商户名称（选填）'),
            prefixIcon: const Icon(Icons.storefront_rounded),
            counterText: '',
          ),
        ),
        const SizedBox(height: 4),
        ListTile(
          contentPadding: EdgeInsets.zero,
          minTileHeight: 60,
          leading: const ZeIconTile(
            icon: Icons.schedule_rounded,
            tone: ZeTone.neutral,
            size: 38,
          ),
          title: Text(tr('Transaction time', '交易时间')),
          subtitle: Text(
            timeLabel,
            style: TextStyle(
              color: widget.localOcr != null && !_ocrTimeConfirmed
                  ? t.warn
                  : t.sub,
              fontFeatures: tabularFigures,
            ),
          ),
          trailing: const ZeChevron(),
          onTap: _pickTime,
        ),
        const Divider(),
        ExpansionTile(
          tilePadding: EdgeInsets.zero,
          childrenPadding: const EdgeInsets.only(bottom: 12),
          leading: const ZeIconTile(
            icon: Icons.notes_rounded,
            tone: ZeTone.neutral,
            size: 38,
          ),
          title: Text(tr('More details', '更多信息')),
          subtitle: Text(
            tr('Payment method and description', '支付方式和交易说明'),
            style: Theme.of(context).textTheme.bodySmall,
          ),
          children: [
            TextFormField(
              controller: _payment,
              maxLength: 80,
              decoration: InputDecoration(
                labelText: tr('Payment method', '支付方式'),
                prefixIcon: const Icon(Icons.account_balance_wallet_rounded),
                counterText: '',
              ),
            ),
            const SizedBox(height: 10),
            TextFormField(
              controller: _description,
              maxLength: 240,
              maxLines: 3,
              decoration: InputDecoration(
                labelText: tr('Transaction description', '交易说明'),
                alignLabelWithHint: true,
                counterText: '',
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _CategoryOption extends StatelessWidget {
  const _CategoryOption({
    required this.category,
    required this.selected,
    required this.onTap,
  });

  final Category category;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    final visual = visualForCategory(category);
    return Semantics(
      button: true,
      selected: selected,
      label: category.name,
      onTap: onTap,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Column(
            children: [
              // The ring has its room in either state, so nothing shifts.
              AnimatedContainer(
                duration: const Duration(milliseconds: 160),
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: selected ? t.ink : Colors.transparent,
                    width: 2.5,
                  ),
                ),
                child: ZeIconTile(
                  icon: visual.icon,
                  color: visual.color,
                  size: 46,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                category.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 12,
                  color: selected ? t.ink : t.sub,
                  fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MoreCategoriesOption extends StatelessWidget {
  const _MoreCategoriesOption({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(16),
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        children: [
          const Padding(
            padding: EdgeInsets.all(5.5),
            child: ZeIconTile(
              icon: Icons.more_horiz_rounded,
              color: ZeHues.stone,
              size: 46,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            tr('All categories', '全部分类'),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 12,
              color: context.ze.sub,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    ),
  );
}
