import 'package:intl/intl.dart';

import 'l10n.dart';

final _currencyFormatters = <String, NumberFormat>{};
final _symbolCurrencyFormatters = <String, NumberFormat>{};

String currencySymbol(String currency) => switch (currency) {
  'CNY' => '¥',
  'USD' => r'$',
  'EUR' => '€',
  'GBP' => '£',
  'JPY' => '¥',
  _ => '$currency ',
};

String formatMoney(int amountMinor, [String currency = 'CNY']) {
  final formatter = _currencyFormatters.putIfAbsent(
    currency,
    () => NumberFormat.currency(
      locale: 'en_US',
      name: currency,
      decimalDigits: 2,
    ),
  );
  return formatter.format(amountMinor / 100);
}

String formatSignedMoney(int amountMinor, String type, String currency) {
  final incoming = type == 'income' || type == 'refund';
  return '${incoming ? '+' : '-'} ${formatMoney(amountMinor, currency)}';
}

String formatMoneyWithSymbol(int amountMinor, [String currency = 'CNY']) {
  final formatter = _symbolCurrencyFormatters.putIfAbsent(
    currency,
    () => NumberFormat.currency(
      locale: 'en_US',
      symbol: currencySymbol(currency),
      decimalDigits: 2,
    ),
  );
  return formatter.format(amountMinor / 100);
}

String formatSignedMoneyWithSymbol(
  int amountMinor,
  String type,
  String currency,
) {
  if (type == 'transfer') {
    return formatMoneyWithSymbol(amountMinor.abs(), currency);
  }
  final incoming = type == 'income' || type == 'refund';
  return '${incoming ? '+' : '-'}${formatMoneyWithSymbol(amountMinor.abs(), currency)}';
}

String formatDateTime(String iso) {
  final value = DateTime.tryParse(iso)?.toLocal();
  if (value == null) return iso;
  return DateFormat('yyyy-MM-dd HH:mm').format(value);
}

String monthKey([DateTime? value]) =>
    DateFormat('yyyy-MM').format(value ?? DateTime.now());

String formatTime(String iso) {
  final value = DateTime.tryParse(iso)?.toLocal();
  if (value == null) return iso;
  return DateFormat('HH:mm').format(value);
}

/// "Today", "Yesterday", or a short weekday date for list section headers.
/// Chinese: "今天 · 11月12日 周四", "11月12日 周四", "2025年11月12日 周四".
String formatDayLabel(DateTime day, {DateTime? now}) {
  final current = now ?? DateTime.now();
  final today = DateTime(current.year, current.month, current.day);
  final normalized = DateTime(day.year, day.month, day.day);
  final difference = today.difference(normalized).inDays;
  if (isZh) {
    final date = DateFormat('M月d日 EEE', 'zh_CN').format(day);
    if (difference == 0) return '今天 · $date';
    if (difference == 1) return '昨天 · $date';
    if (normalized.year != today.year) {
      return DateFormat('y年M月d日 EEE', 'zh_CN').format(day);
    }
    return date;
  }
  final weekday = DateFormat('EEE d', 'en_US').format(day);
  if (difference == 0) return 'Today · $weekday';
  if (difference == 1) return 'Yesterday · $weekday';
  if (normalized.year != today.year) {
    return DateFormat('EEE, MMM d, yyyy', 'en_US').format(day);
  }
  return DateFormat('EEE, MMM d', 'en_US').format(day);
}

/// "1 transaction", "2 transactions".
String plural(int count, String singular, [String? pluralForm]) =>
    '$count ${count == 1 ? singular : pluralForm ?? '${singular}s'}';

const _sourceLabels = {
  'manual': 'Manual',
  'screenshot': 'Screenshot',
  'alipay': 'Alipay',
  'wechat': 'WeChat',
  'cmb': 'China Merchants Bank',
  'taobao': 'Taobao',
  'pinduoduo': 'Pinduoduo',
  'jd': 'JD.com',
  'pupu': 'Pupu',
  'xianyu': 'Xianyu',
  'generic': 'Statement import',
  'other': 'Other',
};

const _sourceLabelsZh = {
  'manual': '手动记账',
  'screenshot': '截图',
  'alipay': '支付宝',
  'wechat': '微信',
  'cmb': '招商银行',
  'taobao': '淘宝',
  'pinduoduo': '拼多多',
  'jd': '京东',
  'pupu': '朴朴',
  'xianyu': '闲鱼',
  'generic': '账单导入',
  'other': '其他',
};

String sourceLabel(String? source) =>
    (isZh ? _sourceLabelsZh : _sourceLabels)[source] ??
    source ??
    tr('Other', '其他');
