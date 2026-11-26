import 'package:flutter/material.dart';

import '../../core/l10n.dart';

extension ZeMessageContext on BuildContext {
  void showMessage(String message) {
    ScaffoldMessenger.of(this).showSnackBar(SnackBar(content: Text(message)));
  }
}

Future<bool> confirmDialog(
  BuildContext context, {
  required String title,
  String? message,
  Widget? content,
  String? cancelLabel,
  required String confirmLabel,
}) async =>
    await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: content ?? (message == null ? null : Text(message)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(cancelLabel ?? tr('Cancel', '取消')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(confirmLabel),
          ),
        ],
      ),
    ) ??
    false;
