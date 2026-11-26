import 'package:flutter/material.dart';

/// Shared user avatar icon presets used across Home and Settings.
const zeAvatarPresets = <String, (String, String, IconData)>{
  'piggy': ('Piggy bank', '小猪存钱罐', Icons.savings_outlined),
  'cat': ('Cat', '小猫', Icons.pets),
  'dog': ('Dog', '小狗', Icons.pets_outlined),
  'rabbit': ('Rabbit', '小兔', Icons.cruelty_free_outlined),
  'sprout': ('Sprout', '嫩芽', Icons.eco_outlined),
  'sparkles': ('Sparkle', '闪光', Icons.auto_awesome_outlined),
};

IconData avatarIconFor(String? preset) =>
    zeAvatarPresets[preset]?.$3 ?? Icons.person_rounded;
