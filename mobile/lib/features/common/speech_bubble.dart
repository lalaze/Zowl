import 'package:flutter/material.dart';

import '../../core/theme.dart';
import 'brand_mark.dart';

/// The owl saying something: a short, friendly line next to the mascot.
class OwlSays extends StatelessWidget {
  const OwlSays({super.key, required this.message, this.owlSize = 64});

  final String message;
  final double owlSize;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.center,
    children: [
      OwlMark(size: owlSize),
      const SizedBox(width: 4),
      Expanded(child: SpeechBubble(text: message)),
    ],
  );
}

/// White bubble with a tail pointing left, towards whoever is speaking.
class SpeechBubble extends StatelessWidget {
  const SpeechBubble({super.key, required this.text, this.color});

  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final t = context.ze;
    return CustomPaint(
      painter: _BubblePainter(color ?? t.card),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 12, 16, 12),
        child: Text(
          text,
          style: TextStyle(
            color: t.ink,
            fontSize: 14,
            height: 1.35,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

class _BubblePainter extends CustomPainter {
  const _BubblePainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color;
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(9, 0, size.width - 9, size.height),
        const Radius.circular(20),
      ),
      paint,
    );
    final middle = size.height / 2;
    canvas.drawPath(
      Path()
        ..moveTo(11, middle - 8)
        ..quadraticBezierTo(4, middle, 0, middle + 6)
        ..quadraticBezierTo(8, middle + 5, 11, middle + 8)
        ..close(),
      paint,
    );
  }

  @override
  bool shouldRepaint(covariant _BubblePainter oldDelegate) =>
      oldDelegate.color != color;
}
