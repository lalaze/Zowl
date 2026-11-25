import 'package:flutter/material.dart';

import '../common/owl_motion.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});
  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: OwlLoading.splash());
}
