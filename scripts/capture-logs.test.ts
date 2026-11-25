import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import {
  formatScanReport,
  parseAdbDevices,
  parseLogContent,
  parseRemoteListing,
  planPull,
  readLastReviewed,
  scanMirror,
  writeLastReviewed,
} from "./capture-logs";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "zowl-capture-logs-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("capture-logs parsing and planning", () => {
  it("dates a December line at the top of a January file in the previous year", () => {
    const entries = parseLogContent(
      "2027-01-01.log",
      "12-31 23:59:58.000 (previous line repeated 3 more times)\n01-01 00:00:01.000 service connected\n",
    );
    expect(entries.map((entry) => entry.timestamp)).toEqual([
      "2026-12-31 23:59:58.000",
      "2027-01-01 00:00:01.000",
    ]);
  });

  it("parses log lines using the year from the file name and attaches unparseable lines", () => {
    const entries = parseLogContent(
      "2026-11-17.log",
      [
        "11-17 09:46:13.123 service connected",
        "unexpected continuation line",
        "11-17 09:46:14.500 window-state wechat window=12 class=LauncherUI",
      ].join("\n") + "\n",
    );

    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      file: "2026-11-17.log",
      line: 1,
      day: "2026-11-17",
      timestamp: "2026-11-17 09:46:13.123",
      message: "service connected",
    });
    expect(entries[1]).toMatchObject({
      line: 2,
      timestamp: "2026-11-17 09:46:13.123",
      timestampMs: entries[0].timestampMs,
      message: "unexpected continuation line",
    });
    expect(entries[2]).toMatchObject({
      line: 3,
      timestamp: "2026-11-17 09:46:14.500",
    });
  });

  it("plans pulls with gz size check, always pulling .log, deleting superseded .log, keeping local-only, and ignoring foreign files", () => {
    const plan = planPull(
      [
        { name: "2026-11-15.log.gz", size: 500 },
        { name: "2026-11-16.log.gz", size: 800 },
        { name: "2026-11-17.log.gz", size: 900 },
        { name: "2026-11-18.log", size: 300 },
        { name: "2026-11-18.log.gz.tmp", size: 12 },
        { name: "random.txt", size: 10 },
      ],
      [
        { name: "2026-11-10.log.gz", size: 400 },
        { name: "2026-11-15.log.gz", size: 500 },
        { name: "2026-11-16.log.gz", size: 700 },
        { name: "2026-11-17.log", size: 1500 },
        { name: "2026-11-18.log", size: 300 },
        { name: "last-reviewed", size: 11 },
      ],
    );

    expect(plan.pull).toEqual([
      "2026-11-16.log.gz",
      "2026-11-17.log.gz",
      "2026-11-18.log",
    ]);
    expect(plan.deleteLocal).toEqual(["2026-11-17.log"]);
    expect(plan.keepLocal).toEqual(["2026-11-10.log.gz", "2026-11-15.log.gz"]);
  });

  it("parses adb devices and remote ls -l listings", () => {
    expect(
      parseAdbDevices(
        "List of devices attached\nABC123\tdevice\nOFFLINE1\toffline\n192.0.2.1:37123\tdevice\n",
      ),
    ).toEqual(["ABC123", "192.0.2.1:37123"]);

    const listing = [
      "total 32",
      "-rw-rw---- 1 u0_a123 ext_data_rw 1024 2026-11-16 23:59 2026-11-16.log.gz",
      "-rw-rw---- 1 u0_a123 ext_data_rw 2048 2026-11-17 09:46 2026-11-17.log",
      "-rw-rw---- 1 u0_a123 ext_data_rw 50 2026-11-17 09:46 2026-11-17.log.gz.tmp",
    ].join("\r\n");

    expect(parseRemoteListing(listing)).toEqual([
      { name: "2026-11-16.log.gz", size: 1024 },
      { name: "2026-11-17.log", size: 2048 },
    ]);
  });
});

describe("capture-logs scan", () => {
  it("detects uncaptured cashier and strong payment-code-left flows while ignoring captured flows and plain browsing", () => {
    const dir = createTempDir();
    writeFileSync(
      path.join(dir, "2026-11-17.log"),
      [
        // Flow 1: plain browsing (not suspicious)
        "11-17 08:00:00.000 window-state wechat window=1 class=LauncherUI",
        "11-17 08:00:05.000 look wechat window=1 class=LauncherUI texts=0 partial=false",
        "11-17 08:00:06.000 rejected wechat parser=wechat_payment_page_v1 reason=page_window_changed",
        // Flow 2: captured Taobao payment (not suspicious)
        "11-17 09:00:00.000 window-state taobao window=10 class=CashierActivity",
        "11-17 09:00:02.000 cashier-text taobao window=10 lines=4 amounts=1 offers=0",
        "11-17 09:00:05.000 captured taobao parser=taobao_cashier_v1 merchant=true",
        // Flow 3: uncaptured payment-code-left (suspicious + strong)
        "11-17 12:00:00.000 window-state wechat window=20 class=WalletOfflineEntranceUI",
        "11-17 12:00:01.000 payment-code shown window=20",
        "11-17 12:00:15.000 payment-code left without a capture: reminder",
        // Flow 4: uncaptured Alipay cashier (suspicious, not strong)
        "11-17 15:00:00.000 window-state alipay window=30 class=FlyBirdWindowActivity",
        "11-17 15:00:02.000 cashier-text alipay window=30 lines=5 amounts=2 offers=1",
        "11-17 15:00:03.000 rejected alipay parser=alipay_payment_page_ocr_v1 reason=multiple_amounts",
      ].join("\n") + "\n",
    );

    const result = scanMirror({ dir, gapSeconds: 180 });
    expect(result.days).toHaveLength(1);
    expect(result.days[0].capturedCount).toBe(1);
    expect(result.days[0].suspiciousFlowCount).toBe(2);

    expect(result.suspiciousFlows).toHaveLength(2);
    expect(result.suspiciousFlows[0]).toMatchObject({
      strong: true,
      start: "2026-11-17 12:00:00.000",
      end: "2026-11-17 12:00:15.000",
      startRef: "2026-11-17.log:7",
      endRef: "2026-11-17.log:9",
      platforms: ["wechat"],
      windowClasses: ["WalletOfflineEntranceUI"],
      signals: [
        { id: "payment-code", count: 1 },
        { id: "payment-code-left", count: 1 },
      ],
    });
    expect(result.suspiciousFlows[1]).toMatchObject({
      strong: false,
      start: "2026-11-17 15:00:00.000",
      end: "2026-11-17 15:00:03.000",
      startRef: "2026-11-17.log:10",
      endRef: "2026-11-17.log:12",
      platforms: ["alipay"],
      windowClasses: ["FlyBirdWindowActivity"],
      signals: [
        { id: "cashier-text", count: 1 },
        { id: "rejected-ocr", count: 1 },
      ],
    });

    const report = formatScanReport(result);
    expect(report).toContain("STRONG");
    expect(report).toContain("payment-code-left(1)");
    expect(report).toContain("2026-11-17.log:10 .. 2026-11-17.log:12");
  });

  it("flags WeChat cashiers that were never read", () => {
    const dir = createTempDir();
    writeFileSync(
      path.join(dir, "2026-11-23.log"),
      [
        // A mini-program cashier whose window reports no class of its own.
        "11-23 08:00:00.000 window-state wechat window=354 class=FrameLayout",
        "11-23 08:00:00.200 window-state wechat window=351 class=AppBrandTaskProxyUI",
        "11-23 08:00:00.300 window-state wechat window=353 class=WalletBrandUI",
        "11-23 08:00:00.400 look wechat window=354 class=unknown texts=0 partial=false",
        // A Taobao order paid in WeChat.
        "11-23 12:00:00.000 window-state wechat window=474 class=FrameLayout",
        "11-23 12:00:00.100 window-state taobao window=471 class=CashDeskActivity",
        // The same, read and captured.
        "11-23 16:00:00.000 window-state taobao window=571 class=CashDeskActivity",
        "11-23 16:00:00.100 payment window wechat window=574 joined by cash desk",
        "11-23 16:00:06.000 captured wechat parser=wechat_payment_page_ocr_v1 merchant=false",
        // A chat is not a payment.
        "11-23 20:00:00.000 window-state wechat window=9 class=LauncherUI",
        "11-23 20:00:00.100 window-state wechat window=700 class=FrameLayout",
      ].join("\n") + "\n",
    );

    const { suspiciousFlows } = scanMirror({ dir });
    expect(suspiciousFlows.map((flow) => flow.signals)).toEqual([
      [{ id: "wechat-cashier", count: 2 }],
      [{ id: "taobao-cash-desk", count: 1 }],
    ]);
  });

  it("reads .log.gz in day/part order across parts and next day and detects service-down gaps", () => {
    const dir = createTempDir();
    writeFileSync(
      path.join(dir, "2026-11-17.log.gz"),
      gzipSync(
        [
          "11-17 08:00:00.000 process start pid=100 version=1.0.22 (35) android=35 device=Test zone=UTC",
          "11-17 08:00:00.050 previous process pid=99 ended 11-17 07:00:00.000 reason=freezer status=0 importance=300 description=frozen",
          "11-17 10:00:00.000 window-state pinduoduo window=40 class=OrderActivity",
          "11-17 10:00:02.000 page pinduoduo window=40 kind=order-panel amounts=1",
        ].join("\n") + "\n",
      ),
    );
    // Continuation of the same flow in part 2 (within gapSeconds) gets captured -> not suspicious.
    writeFileSync(
      path.join(dir, "2026-11-17.2.log"),
      [
        "11-17 10:00:10.000 captured pinduoduo parser=pdd_panel_v1 merchant=false",
        "11-17 23:50:00.000 service unbound",
      ].join("\n") + "\n",
    );
    writeFileSync(
      path.join(dir, "2026-11-18.log"),
      [
        "11-18 00:05:00.000 process start pid=200 version=1.0.23 (36) android=35 device=Test zone=UTC",
        "11-18 00:05:01.000 service connected",
      ].join("\n") + "\n",
    );

    const result = scanMirror({ dir });
    expect(result.filesScanned).toEqual([
      "2026-11-17.log.gz",
      "2026-11-17.2.log",
      "2026-11-18.log",
    ]);
    expect(result.suspiciousFlows).toHaveLength(0);
    expect(result.days).toHaveLength(2);
    expect(result.days[0].processStarts).toEqual([
      {
        timestamp: "2026-11-17 08:00:00.000",
        version: "1.0.22 (35)",
        lineRef: "2026-11-17.log.gz:1",
      },
    ]);
    expect(result.days[0].previousProcessExits).toEqual([
      {
        timestamp: "2026-11-17 08:00:00.050",
        reason: "freezer",
        description: "frozen",
        lineRef: "2026-11-17.log.gz:2",
      },
    ]);
    expect(result.days[0].serviceDownGaps).toEqual([
      {
        start: "2026-11-17 23:50:00.000",
        end: "2026-11-18 00:05:00.000",
        durationSeconds: 900,
        startEvent: "service unbound",
        endEvent: "process start",
        startRef: "2026-11-17.2.log:2",
        endRef: "2026-11-18.log:1",
      },
    ]);
  });

  it("applies --since/--until filtering and defaults --since from last-reviewed", () => {
    const dir = createTempDir();
    writeFileSync(
      path.join(dir, "2026-11-01.log"),
      "11-01 10:00:00.000 payment-code left without a capture: reminder\n",
    );
    writeFileSync(
      path.join(dir, "2026-11-15.log"),
      "11-15 10:00:00.000 payment-code left without a capture: reminder\n",
    );
    writeFileSync(
      path.join(dir, "2026-11-18.log"),
      "11-18 10:00:00.000 payment-code left without a capture: reminder\n",
    );

    // Without last-reviewed: defaults to 7 days before newest (2026-11-11 .. 2026-11-18).
    const defaultScan = scanMirror({ dir });
    expect(defaultScan.since).toBe("2026-11-11");
    expect(defaultScan.until).toBe("2026-11-18");
    expect(defaultScan.filesScanned).toEqual(["2026-11-15.log", "2026-11-18.log"]);

    // With last-reviewed: defaults --since to that date.
    writeLastReviewed(dir, "2026-11-17");
    expect(readLastReviewed(dir)).toBe("2026-11-17");
    const reviewedScan = scanMirror({ dir });
    expect(reviewedScan.since).toBe("2026-11-17");
    expect(reviewedScan.filesScanned).toEqual(["2026-11-18.log"]);

    // Explicit --since / --until override last-reviewed.
    const explicitScan = scanMirror({
      dir,
      since: "2026-11-01",
      until: "2026-11-15",
    });
    expect(explicitScan.filesScanned).toEqual(["2026-11-01.log", "2026-11-15.log"]);
  });
});
