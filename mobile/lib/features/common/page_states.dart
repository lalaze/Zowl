import 'package:flutter/material.dart';

import '../../core/l10n.dart';
import '../../core/theme.dart';
import 'brand_mark.dart';
import 'ze_labels.dart';

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.error, required this.onRetry});
  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const ZeIconTile(
            icon: Icons.cloud_off_rounded,
            tone: ZeTone.neutral,
            size: 64,
          ),
          const SizedBox(height: 16),
          Text(
            error.toString(),
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 16),
          FilledButton.tonal(
            onPressed: onRetry,
            style: FilledButton.styleFrom(
              minimumSize: const Size(120, 46),
              backgroundColor: context.ze.primarySoft,
              foregroundColor: context.ze.accentText,
            ),
            child: Text(tr('Retry', '重试')),
          ),
        ],
      ),
    ),
  );
}

/// Empty state: the owl, a message, an optional hint and action.
class EmptyView extends StatelessWidget {
  const EmptyView({
    super.key,
    required this.message,
    this.subtitle,
    this.illustration,
    this.action,
  });

  final String message;
  final String? subtitle;

  /// Replaces the owl, e.g. with a larger one for first-run states.
  final Widget? illustration;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 28),
    child: Column(
      children: [
        illustration ?? const OwlMark(size: 72),
        const SizedBox(height: 14),
        Text(
          message,
          textAlign: TextAlign.center,
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 4),
          Text(
            subtitle!,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
        if (action != null) ...[const SizedBox(height: 16), action!],
      ],
    ),
  );
}
