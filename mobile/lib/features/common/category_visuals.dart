import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models.dart';
import '../../core/providers.dart';

/// Icon and colour that represent a category everywhere in the app.
class CategoryVisual {
  const CategoryVisual(this.icon, this.color);
  final IconData icon;
  final Color color;
}

/// Categories by id, so rows can resolve the icon the user chose on the web.
///
/// Watches [categoriesProvider] directly instead of going through a derived
/// provider. When categories reload (on sign-in) while no row is on screen, a
/// derived provider is only refreshed by the next row that builds, and its
/// dependency changing mid-build made Riverpod schedule a refresh during build
/// ("setState() or markNeedsBuild() called during build").
Map<String, Category> watchCategoryLookup(WidgetRef ref) {
  final categories = ref.watch(
    categoriesProvider.select((state) => state.value),
  );
  if (categories == null) return const {};
  return _categoryLookups[categories] ??= {
    for (final category in categories) category.id: category,
  };
}

/// One lookup per loaded category list, shared by every row that shows it.
final _categoryLookups = Expando<Map<String, Category>>();

Color? parseHexColor(String? value) {
  final hex = value?.trim().replaceFirst('#', '');
  if (hex == null || (hex.length != 6 && hex.length != 3)) return null;
  final full = hex.length == 3
      ? hex.split('').map((char) => '$char$char').join()
      : hex;
  final parsed = int.tryParse(full, radix: 16);
  return parsed == null ? null : Color(0xff000000 | parsed);
}

String _kebab(String value) => value
    .trim()
    .replaceAllMapped(RegExp(r'([a-z0-9])([A-Z])'), (m) => '${m[1]}-${m[2]}')
    .replaceAll('_', '-')
    .toLowerCase();

/// Lucide icon names (as stored by the web app) mapped to Material icons.
const _lucideIcons = <String, IconData>{
  'utensils': Icons.restaurant_rounded,
  'utensils-crossed': Icons.restaurant_rounded,
  'chef-hat': Icons.restaurant_rounded,
  'coffee': Icons.local_cafe_rounded,
  'cup-soda': Icons.local_drink_rounded,
  'beer': Icons.sports_bar_rounded,
  'wine': Icons.wine_bar_rounded,
  'pizza': Icons.local_pizza_rounded,
  'cake': Icons.cake_rounded,
  'apple': Icons.shopping_basket_rounded,
  'bike': Icons.delivery_dining_rounded,
  'train': Icons.train_rounded,
  'train-front': Icons.train_rounded,
  'tram-front': Icons.tram_rounded,
  'bus': Icons.directions_bus_rounded,
  'car': Icons.directions_car_rounded,
  'car-taxi-front': Icons.local_taxi_rounded,
  'plane': Icons.flight_rounded,
  'fuel': Icons.local_gas_station_rounded,
  'shopping-bag': Icons.shopping_bag_rounded,
  'shopping-cart': Icons.shopping_cart_rounded,
  'shopping-basket': Icons.shopping_basket_rounded,
  'store': Icons.storefront_rounded,
  'shirt': Icons.checkroom_rounded,
  'clapperboard': Icons.movie_rounded,
  'film': Icons.movie_rounded,
  'gamepad': Icons.sports_esports_rounded,
  'gamepad-2': Icons.sports_esports_rounded,
  'music': Icons.music_note_rounded,
  'ticket': Icons.confirmation_number_rounded,
  'house': Icons.home_rounded,
  'home': Icons.home_rounded,
  'building': Icons.apartment_rounded,
  'zap': Icons.bolt_rounded,
  'plug': Icons.power_rounded,
  'droplet': Icons.water_drop_rounded,
  'flame': Icons.local_fire_department_rounded,
  'wifi': Icons.wifi_rounded,
  'phone': Icons.phone_rounded,
  'smartphone': Icons.smartphone_rounded,
  'laptop': Icons.laptop_rounded,
  'monitor': Icons.desktop_windows_rounded,
  'heart-pulse': Icons.monitor_heart_rounded,
  'heart': Icons.favorite_rounded,
  'pill': Icons.medication_rounded,
  'stethoscope': Icons.medical_services_rounded,
  'dumbbell': Icons.fitness_center_rounded,
  'graduation-cap': Icons.school_rounded,
  'book': Icons.menu_book_rounded,
  'book-open': Icons.menu_book_rounded,
  'baby': Icons.child_friendly_rounded,
  'dog': Icons.pets_rounded,
  'cat': Icons.pets_rounded,
  'paw-print': Icons.pets_rounded,
  'scissors': Icons.content_cut_rounded,
  'sparkles': Icons.auto_awesome_rounded,
  'gift': Icons.redeem_rounded,
  'party-popper': Icons.celebration_rounded,
  'arrow-left-right': Icons.swap_horiz_rounded,
  'repeat': Icons.repeat_rounded,
  'rotate-ccw': Icons.undo_rounded,
  'undo-2': Icons.undo_rounded,
  'wallet': Icons.account_balance_wallet_rounded,
  'wallet-cards': Icons.work_rounded,
  'briefcase': Icons.work_rounded,
  'banknote': Icons.payments_rounded,
  'coins': Icons.savings_rounded,
  'piggy-bank': Icons.savings_rounded,
  'landmark': Icons.account_balance_rounded,
  'credit-card': Icons.credit_card_rounded,
  'receipt': Icons.receipt_long_rounded,
  'trending-up': Icons.trending_up_rounded,
  'shield': Icons.shield_rounded,
  'umbrella': Icons.umbrella_rounded,
  'tags': Icons.sell_rounded,
  'tag': Icons.sell_rounded,
  'shapes': Icons.category_rounded,
};

/// Keyword fallbacks for categories without a recognised icon name.
const _nameIcons = <(String, IconData)>[
  ('food', Icons.restaurant_rounded),
  ('dining', Icons.restaurant_rounded),
  ('coffee', Icons.local_cafe_rounded),
  ('grocer', Icons.shopping_basket_rounded),
  ('delivery', Icons.delivery_dining_rounded),
  ('transport', Icons.directions_car_rounded),
  ('travel', Icons.flight_rounded),
  ('shopping', Icons.shopping_bag_rounded),
  ('entertainment', Icons.movie_rounded),
  ('housing', Icons.home_rounded),
  ('rent', Icons.home_rounded),
  ('health', Icons.monitor_heart_rounded),
  ('medical', Icons.monitor_heart_rounded),
  ('education', Icons.school_rounded),
  ('electronic', Icons.laptop_rounded),
  ('digital', Icons.laptop_rounded),
  ('transfer', Icons.swap_horiz_rounded),
  ('red packet', Icons.redeem_rounded),
  ('gift', Icons.redeem_rounded),
  ('salary', Icons.work_rounded),
  ('refund', Icons.undo_rounded),
];

const _fallbackColors = [
  Color(0xfff2762e),
  Color(0xff3b82f6),
  Color(0xffa855f7),
  Color(0xffec4899),
  Color(0xff14b8a6),
  Color(0xffeab308),
  Color(0xff64748b),
];

const _incomeColor = Color(0xff10b07a);
const _neutralColor = Color(0xff8b93a1);

CategoryVisual categoryVisual({
  String? icon,
  String? color,
  String? name,
  String? type,
}) {
  final resolvedIcon =
      (icon == null ? null : _lucideIcons[_kebab(icon)]) ??
      _iconForName(name) ??
      switch (type) {
        'income' => Icons.payments_rounded,
        'refund' => Icons.undo_rounded,
        'transfer' => Icons.swap_horiz_rounded,
        _ => name == null ? Icons.receipt_long_rounded : Icons.sell_rounded,
      };
  final resolvedColor =
      parseHexColor(color) ??
      (type == 'income'
          ? _incomeColor
          : name == null
          ? _neutralColor
          : _fallbackColors[name.hashCode.abs() % _fallbackColors.length]);
  return CategoryVisual(resolvedIcon, landscapeTone(resolvedColor));
}

/// A category's colour brought into the landscape's range: its own hue,
/// muted, and dark enough for a white icon.
Color landscapeTone(Color color) => _tones[color] ??= _toneFor(color);

final _tones = <Color, Color>{};

Color _toneFor(Color color) {
  final hsl = HSLColor.fromColor(color);
  // Earth colours carry more saturation than cool ones before they shout.
  final cap = switch (hsl.hue) {
    < 14 => .5,
    < 50 => .62,
    < 180 => .36,
    < 240 => .4,
    < 320 => .28,
    _ => .46,
  };
  var tone = hsl
      .withSaturation(math.min(hsl.saturation * .7, cap))
      .withLightness(.56);
  // Above the 3:1 against a white icon that WCAG asks of graphics.
  while (1.05 / (tone.toColor().computeLuminance() + .05) < 3.4) {
    tone = tone.withLightness(tone.lightness - .02);
  }
  return tone.toColor();
}

IconData? _iconForName(String? name) {
  final lower = name?.toLowerCase();
  if (lower == null || lower.isEmpty) return null;
  for (final (keyword, icon) in _nameIcons) {
    if (lower.contains(keyword)) return icon;
  }
  return null;
}

CategoryVisual visualForCategory(Category category) => categoryVisual(
  icon: category.icon,
  color: category.color,
  name: category.name,
  type: category.kind == 'income' ? 'income' : null,
);

CategoryVisual visualForTransaction(
  TransactionItem item,
  Map<String, Category> lookup,
) {
  final category = item.categoryId == null ? null : lookup[item.categoryId];
  return categoryVisual(
    icon: category?.icon,
    color: item.categoryColor ?? category?.color,
    name: item.categoryName ?? category?.name,
    type: item.type,
  );
}
