import 'package:flutter/foundation.dart';

class ApiConfig {
  const ApiConfig._(this.baseUrl);

  final String baseUrl;

  static ApiConfig parse(
    String raw, {
    required bool release,
    bool allowInsecureLocal = false,
  }) {
    final normalized = raw.trim().replaceFirst(RegExp(r'/+$'), '');
    final uri = Uri.tryParse(normalized);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      throw const FormatException('API_BASE_URL is not a valid URL');
    }
    if (release && uri.scheme != 'https') {
      throw const FormatException(
        'Release builds only allow HTTPS API_BASE_URL',
      );
    }
    if (!release && uri.scheme != 'https' && uri.scheme != 'http') {
      throw const FormatException('API_BASE_URL only supports HTTP or HTTPS');
    }
    const localTestHosts = {'localhost', '127.0.0.1', '10.0.2.2'};
    final allowedDevelopmentHttp =
        isTailscaleAddress(uri.host) ||
        (allowInsecureLocal && localTestHosts.contains(uri.host));
    if (!release && uri.scheme == 'http' && !allowedDevelopmentHttp) {
      throw const FormatException(
        'Debug unencrypted HTTP only allows a Tailscale IP '
        '(or a local test host with ALLOW_INSECURE_LOCAL_API)',
      );
    }
    return ApiConfig._(normalized);
  }

  /// Whether [host] is an IPv4 address in Tailscale's 100.64.0.0/10 range.
  static bool isTailscaleAddress(String host) {
    final octets = host.split('.');
    if (octets.length != 4) return false;
    final values = <int>[];
    for (final octet in octets) {
      if (!RegExp(r'^\d{1,3}$').hasMatch(octet)) return false;
      final value = int.parse(octet);
      if (value > 255) return false;
      values.add(value);
    }
    return values[0] == 100 && values[1] >= 64 && values[1] <= 127;
  }

  static ApiConfig fromEnvironment() {
    const raw = String.fromEnvironment('API_BASE_URL');
    if (raw.trim().isEmpty) {
      throw const FormatException(
        'API_BASE_URL is not set; build with '
        '--dart-define=API_BASE_URL=https://your-server',
      );
    }
    return parse(
      raw,
      release: kReleaseMode,
      allowInsecureLocal: const bool.fromEnvironment(
        'ALLOW_INSECURE_LOCAL_API',
        defaultValue: false,
      ),
    );
  }
}
