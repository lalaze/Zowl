import 'package:flutter_test/flutter_test.dart';
import 'package:zowl_mobile/core/config.dart';

void main() {
  test('accepts plain HTTP to a Tailscale IP in debug builds', () {
    expect(
      ApiConfig.parse('http://100.64.0.10:3000/', release: false).baseUrl,
      'http://100.64.0.10:3000',
    );
    expect(
      ApiConfig.parse('http://100.127.255.254:3000', release: false).baseUrl,
      'http://100.127.255.254:3000',
    );
  });

  test('rejects plain HTTP to hosts outside the Tailscale range', () {
    for (final host in [
      '100.63.255.255',
      '100.128.0.1',
      '192.168.1.10',
      '100.64.0',
      '100.64.0.256',
      'money.example.com',
    ]) {
      expect(
        () => ApiConfig.parse('http://$host:3000', release: false),
        throwsFormatException,
        reason: host,
      );
    }
    expect(
      () => ApiConfig.parse('http://100.64.0.10:3000', release: true),
      throwsFormatException,
    );
  });

  test('requires HTTPS for release builds', () {
    expect(
      () => ApiConfig.parse('http://example.com', release: true),
      throwsFormatException,
    );
    expect(
      ApiConfig.parse('https://money.example.com', release: true).baseUrl,
      'https://money.example.com',
    );
  });

  test(
    'allows only simulator loopback hosts behind the explicit test flag',
    () {
      for (final host in ['localhost', '127.0.0.1', '10.0.2.2']) {
        expect(
          ApiConfig.parse(
            'http://$host:3200',
            release: false,
            allowInsecureLocal: true,
          ).baseUrl,
          'http://$host:3200',
        );
      }

      expect(
        () => ApiConfig.parse('http://127.0.0.1:3200', release: false),
        throwsFormatException,
      );
      expect(
        () => ApiConfig.parse(
          'http://example.com',
          release: false,
          allowInsecureLocal: true,
        ),
        throwsFormatException,
      );
      expect(
        () => ApiConfig.parse(
          'http://127.0.0.1:3200',
          release: true,
          allowInsecureLocal: true,
        ),
        throwsFormatException,
      );
    },
  );

  test('rejects malformed and unsupported URLs', () {
    expect(
      () => ApiConfig.parse('not a url', release: false),
      throwsFormatException,
    );
    expect(
      () => ApiConfig.parse('ftp://example.com', release: false),
      throwsFormatException,
    );
  });
}
