import { describe, expect, it } from "vitest";

import {
  arm64SplitVersionCode,
  findDevelopmentEndpoint,
  parseMobileVersion,
} from "./android-release-model";

describe("Android release script", () => {
  it("reads semantic version and Android version code from pubspec", () => {
    expect(
      parseMobileVersion("name: zowl_mobile\nversion: 1.2.3+42\n"),
    ).toEqual({ version: "1.2.3", versionCode: 42 });
  });

  it("rejects pubspec content without an explicit version code", () => {
    expect(() => parseMobileVersion("version: 1.2.3\n")).toThrow(
      "no valid version",
    );
  });

  it("accounts for Flutter's arm64 split APK version-code offset", () => {
    expect(arm64SplitVersionCode(1)).toBe(2001);
    expect(arm64SplitVersionCode(42)).toBe(2042);
  });

  it("finds plaintext development endpoints in the compiled app", () => {
    for (const endpoint of [
      "http://localhost",
      "http://127.0.0.1",
      "http://10.0.2.2",
      "http://100.64.0.10",
      "http://100.127.255.254",
    ]) {
      expect(
        findDevelopmentEndpoint(Buffer.from(`\u0000${endpoint}:3000\u0000`)),
      ).toBe(endpoint);
    }
  });

  it("allows HTTPS and non-Tailscale addresses in the compiled app", () => {
    expect(
      findDevelopmentEndpoint(
        Buffer.from(
          "https://money.example.com http://100.63.0.1 http://100.128.0.1 https://100.64.0.10",
        ),
      ),
    ).toBeUndefined();
  });
});
