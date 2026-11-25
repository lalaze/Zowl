export type MobileVersion = { version: string; versionCode: number };

const flutterArm64VersionCodeOffset = 2_000;

export function parseMobileVersion(pubspec: string): MobileVersion {
  const match = /^version:\s*([0-9A-Za-z.+-]+)\+(\d+)\s*$/mu.exec(pubspec);
  if (!match) throw new Error("mobile/pubspec.yaml has no valid version");
  return { version: match[1], versionCode: Number.parseInt(match[2], 10) };
}

export function arm64SplitVersionCode(baseVersionCode: number) {
  return flutterArm64VersionCodeOffset + baseVersionCode;
}

// Plain-HTTP endpoints that only make sense in development: loopback, the Android
// emulator's host alias, and Tailscale's 100.64.0.0/10 range.
const forbiddenEndpointPattern =
  /http:\/\/(?:localhost|127\.0\.0\.1|10\.0\.2\.2|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3})/u;

export function findDevelopmentEndpoint(binary: Buffer) {
  return forbiddenEndpointPattern.exec(binary.toString("latin1"))?.[0];
}
