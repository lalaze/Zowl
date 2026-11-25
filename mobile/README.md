# Zowl mobile app

The Flutter client for Android and iOS. It is an online client: accounts, transactions, screenshot tasks, and
statistics all come from the Next.js server at the repository root. The phone keeps no second copy of the
ledger.

## What it covers

- Sign-in with revocable bearer sessions.
- Monthly overview, recent transactions, and five-tab navigation (Home, Activity, +, Insights, Me).
- Search, filters, details, manual entry with duplicate confirmation, amendments, and voiding.
- Screenshot import from the gallery or the share sheet, with privacy consent and field review before posting.
- Android payment page capture, its encrypted offline queue, and the **Captured payments** review inbox.
- Statistics by month and currency, daily and monthly trends, category and source shares.
- Profile, Chinese/English UI, light/dark mode, four accent colors, and account management for administrators.

Statement-file import, category management, and AI provider settings are on the web app.

## Requirements

- Flutter 3.38 / Dart 3.10
- iOS 13+; Android uses Flutter's default `minSdk`
- Run `flutter doctor --android-licenses` before the first Android build

## Run against a local server

Start the server from the repository root on all interfaces:

```bash
npm run dev -- --hostname 0.0.0.0
```

Then run the app:

```bash
cd mobile
flutter pub get
dart run build_runner build

# Android emulator
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000 --dart-define=ALLOW_INSECURE_LOCAL_API=true

# iOS simulator
flutter run --dart-define=API_BASE_URL=http://127.0.0.1:3000 --dart-define=ALLOW_INSECURE_LOCAL_API=true
```

Debug and profile builds accept plain HTTP only to a Tailscale IP (`100.64.0.0/10`), or to `localhost`,
`127.0.0.1`, and `10.0.2.2` when built with `ALLOW_INSECURE_LOCAL_API=true`. On a physical phone on your tailnet:

```bash
flutter run --dart-define=API_BASE_URL=http://100.x.y.z:3000
```

Any other host needs HTTPS. There is no default `API_BASE_URL`; the app refuses to start without one.

## Release builds

Release builds require HTTPS. Android release signing reads `ANDROID_KEYSTORE_PATH`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD` from the environment and fails
without them.

```bash
flutter build apk --release --dart-define=API_BASE_URL=https://money.example.com
flutter build ios --release --no-codesign --dart-define=API_BASE_URL=https://money.example.com
```

To produce a verified ARM64 APK plus the `release.json` the server's download page needs, use
`npm run mobile:release` from the repository root. See [docs/docker-deployment.md](../docs/docker-deployment.md).

## Android payment capture

### Automatic payment page capture

Open **Me → Automatic payment capture**, turn on the master switch, and allow the
**Zowl payment page capture (beta)** accessibility service in Android settings. The service reads the
payment-success page of enabled apps:

- Alipay (on by default) and WeChat.
- Taobao, Pinduoduo, JD.com, and Pupu as experimental sources, off by default ([ADR-0012](../docs/adr/0012-shopping-app-payment-pages.md)).
  The JD.com and Pupu rules were written without device samples, so expect misses.

When a payment-flow window exposes no readable text on Android 14+, that one window is read by on-device OCR
(Google ML Kit, Chinese model bundled in the APK) instead ([ADR-0010](../docs/adr/0010-automatic-ocr-for-unreadable-payment-pages.md)).
Historical bills, refunds, transfers, and pages with ambiguous amounts are ignored. The recorded time is when
the success page was observed. After one capture, a new checkout must be seen before the next payment counts.

Candidates appear under the centre **+** → **Captured payments**, and Home shows a review card while any are
waiting. Auto-posting has its own switch, off by default, with per-transaction and trusted-merchant amount
limits. Payment notifications are no longer read ([ADR-0011](../docs/adr/0011-android-capture-reads-payment-pages-only.md)).

Android turns the accessibility service off after **Force stop**. Turn it on again to resume. After updating
the APK, toggling the service off and on reloads its configuration.

### Zowl Scan quick-settings tile

An independent, default-off feature for Android 14+ ([ADR-0009](../docs/adr/0009-local-ocr-manual-draft.md)):

1. Open **Me → Zowl Scan**, read the privacy note, and enable local recognition.
2. Make sure the accessibility service above is allowed.
3. Tap **Add Zowl Scan tile** on that page, or add **Zowl Scan** by editing Android Quick Settings.
4. On a WeChat or Alipay payment-success page, pull down Quick Settings and tap the tile once.
5. Review the amount and merchant, pick the transaction time yourself, and confirm.

The screenshot and OCR text stay in native memory. The draft lives only in process memory for five minutes,
bound to the signed-in user. Nothing is posted until you confirm, and the posted transaction has `manual`
provenance.

### Diagnostics

**Me → Automatic payment capture → Local parser diagnostics** shows counters by source, parser version, and
acceptance or rejection reason. A capture log on the device records window names, line counts, and rejection
codes permanently (older days are gzipped, and logging pauses below 500 MiB free space without deleting
files), with no page text, amounts, merchants, or account data
([ADR-0013](../docs/adr/0013-capture-log-kept-on-device.md)). **Export log** shares all kept files as one zip
through the system share sheet. Nothing is uploaded.

## Tests

From the repository root:

```bash
npm run test:mobile:quick      # analyze, unit/widget/golden/accessibility tests, coverage gate
npm run test:mobile:contract   # mobile API contract against the real server
npm run test:mobile:e2e:android  # Android API 35 emulator
npm run test:mobile:e2e:ios      # iPhone simulator (macOS)
npm run test:mobile:all        # all of the above
```

Coverage ignores generated `*.g.dart`, but every other file under `lib/` must appear in LCOV. Overall line
coverage must be at least 80%, and `lib/core/**` at least 90%.

Device tests create an isolated server database, file directory, and accounts. They inject a fixed PNG and reset
app data between scenarios. Android reaches the backend at `10.0.2.2:3200`, iOS at `127.0.0.1:3200`. Logs and
screenshots are kept on failure.

Golden images for every main screen in light and dark mode live in `test/goldens/`. They are rendered on macOS:
on Linux and Windows text rasterises a few percent differently, so there the comparison is skipped (the rest of
each test still runs) and updating them is refused. Update them on macOS, only for an intended visual change:

```bash
flutter test --update-goldens
```

Native Android tests use a synthetic, debug-only payment page:

```bash
cd android
./gradlew :app:testDebugUnitTest
./gradlew :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=com.zowl.mobile.capture.PaymentAccessibilityInstrumentedTest
./gradlew :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=com.zowl.mobile.capture.CaptureQueueInstrumentedTest
```

They prove the Android integration, not compatibility with real Alipay or WeChat pages. Check real coverage
with real payments on a real phone and compare against the official bill.

GitHub Actions runs the backend lint, type check, and unit tests, the mobile quick gate, the API contract, golden
comparisons on a macOS runner, and Android E2E on pull requests. Pushes to `main`, a daily schedule, and manual
runs also run iOS E2E and both debug builds.

## Security and platform notes

- Session tokens are kept in the iOS Keychain or Android Keystore. Android app backup is disabled.
- A missing installation marker clears stale sessions that the iOS Keychain may keep after reinstalling.
- Passwords, transactions, statistics, and screenshots are not persisted on the device.
- Android grants accessibility access globally, but the service only reads windows of the enabled payment apps.
  Page text and OCR screenshots are parsed in memory and never written, logged, or uploaded. The one opt-in
  exception is scrubbed order text for Taobao and Pinduoduo ([ADR-0014](../docs/adr/0014-order-context-for-shopping-captures.md)).
- Structured candidates wait in an Android Keystore AES-GCM queue, limited to 100 items or 7 days. Signing out
  or turning capture off clears the queue and the native worker's credentials.
- `POST_NOTIFICATIONS` is only used for pending-candidate reminders; denying it does not stop capture.
- iOS only asks for photo-library access. Android uses the system photo picker without broad storage access.
- Upload limits match the server: at most 10 images, 40 MiB in total, JPG/PNG/WebP only.
