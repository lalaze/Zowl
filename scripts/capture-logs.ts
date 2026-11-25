import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

export const REMOTE_CAPTURE_LOG_DIR =
  "/sdcard/Android/data/com.zowl.mobile/files/capture-log";
export const DEFAULT_GAP_SECONDS = 180;
export const LAST_REVIEWED_FILE = "last-reviewed";

const LOG_FILE_NAME_PATTERN =
  /^(\d{4}-\d{2}-\d{2})(?:\.([2-9]\d*|1\d+))?\.log(\.gz)?$/u;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const LOG_LINE_PATTERN =
  /^(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3}) (.*)$/u;

export interface ParsedLogFileName {
  day: string;
  part: number;
  compressed: boolean;
  baseName: string;
}

export interface FileEntry {
  name: string;
  size: number;
}

export interface PullPlan {
  pull: string[];
  deleteLocal: string[];
  keepLocal: string[];
}

export interface PaymentSignal {
  id: string;
  pattern: RegExp;
  description: string;
  strong?: boolean;
}

export const PAYMENT_SIGNALS: readonly PaymentSignal[] = [
  {
    id: "cashier-text",
    pattern: /^cashier-text /u,
    description: "Cashier OCR text read",
  },
  {
    id: "cashier-amount",
    pattern: /^cashier amount read /u,
    description: "Cashier amount parsed",
  },
  {
    id: "cashier-dialog",
    pattern: /^cashier dialog /u,
    description: "Cashier dialog window seen",
  },
  {
    id: "cashier-closed",
    pattern: /^cashier closed with its overlay /u,
    description: "Cashier closed with overlay",
  },
  {
    id: "order-page",
    pattern: /^order-page /u,
    description: "Order page read for context",
  },
  {
    id: "payment-code",
    pattern: /^payment-code shown/u,
    description: "Payment-code page shown",
  },
  {
    id: "payment-code-left",
    pattern: /^payment-code left without a capture/u,
    description: "Left payment-code page without capture",
    strong: true,
  },
  {
    // Only OCR parsers: they run on gated payment windows. Accessibility-text rejections
    // (page_window_changed, page_read_limit, ...) happen thousands of times a day while browsing.
    id: "rejected-ocr",
    pattern: /^rejected \S+ parser=\S+_ocr_v1 /u,
    description: "Payment window rejected by an OCR parser",
  },
  {
    // WeChat's mini-program cashier. Its own window may only ever report a framework class,
    // so the screens that open with it are the sign.
    id: "wechat-cashier",
    pattern: /^window-state wechat window=\S+ class=(?:WalletBrandUI|AppBrandTaskProxyUI)$/u,
    description: "WeChat mini-program cashier opened",
  },
  {
    // Shown for every Taobao checkout, also one that is then paid in WeChat.
    id: "taobao-cash-desk",
    pattern: /^window-state taobao window=\S+ class=CashDeskActivity$/u,
    description: "Taobao cash desk opened",
  },
  {
    id: "payment-window-joined",
    pattern: /^payment window wechat window=\S+ joined by /u,
    description: "WeChat window taken for a cashier or payment result",
  },
  {
    id: "pinduoduo-panel",
    pattern: /(?:order-panel|paid-panel)/u,
    description: "Pinduoduo order or paid panel seen",
  },
  {
    id: "ocr-attempt",
    pattern: /^(?:ocr|screenshot) \S+ window=\S+ role=/u,
    description: "OCR or screenshot attempt on payment window",
  },
];

export interface LogEntry {
  file: string;
  line: number;
  day: string;
  timestampMs: number;
  timestamp: string;
  message: string;
}

export interface SignalCount {
  id: string;
  count: number;
}

export interface SuspiciousFlow {
  strong: boolean;
  start: string;
  end: string;
  startRef: string;
  endRef: string;
  day: string;
  lineCount: number;
  platforms: string[];
  signals: SignalCount[];
  windowClasses: string[];
}

export interface ProcessStartRecord {
  timestamp: string;
  version: string;
  lineRef: string;
}

export interface PreviousExitRecord {
  timestamp: string;
  reason: string;
  description?: string;
  lineRef: string;
}

export interface ServiceDownGap {
  start: string;
  end: string | null;
  durationSeconds: number | null;
  startEvent: string;
  endEvent: string | null;
  startRef: string;
  endRef: string | null;
}

export interface DaySummary {
  day: string;
  capturedCount: number;
  suspiciousFlowCount: number;
  processStarts: ProcessStartRecord[];
  previousProcessExits: PreviousExitRecord[];
  serviceDownGaps: ServiceDownGap[];
}

export interface ScanResult {
  mirrorDir: string;
  since: string | null;
  until: string | null;
  gapSeconds: number;
  filesScanned: string[];
  days: DaySummary[];
  suspiciousFlows: SuspiciousFlow[];
}

export function parseLogFileName(name: string): ParsedLogFileName | null {
  const match = LOG_FILE_NAME_PATTERN.exec(name);
  if (!match) return null;
  const day = match[1];
  if (!isValidDateString(day)) return null;
  const part = match[2] ? Number.parseInt(match[2], 10) : 1;
  const compressed = Boolean(match[3]);
  const baseName = compressed ? name.slice(0, -3) : name;
  return { day, part, compressed, baseName };
}

export function compareLogFiles(left: string, right: string): number {
  const a = parseLogFileName(left);
  const b = parseLogFileName(right);
  if (a && b) {
    if (a.day !== b.day) return a.day < b.day ? -1 : 1;
    if (a.part !== b.part) return a.part - b.part;
    if (a.compressed !== b.compressed) return a.compressed ? 1 : -1;
  }
  return left.localeCompare(right);
}

export function isValidDateString(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function subtractDays(dayString: string, days: number): string {
  const match = DATE_PATTERN.exec(dayString);
  if (!match) throw new Error(`Invalid date: ${dayString}`);
  const date = new Date(
    Date.UTC(
      Number.parseInt(match[1], 10),
      Number.parseInt(match[2], 10) - 1,
      Number.parseInt(match[3], 10) - days,
    ),
  );
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function sanitizeModelName(rawModel: string): string {
  const cleaned = rawModel
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
  return cleaned || "unknown";
}

export function parseAdbDevices(output: string): string[] {
  const serials: string[] = [];
  for (const rawLine of output.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("List of devices")) continue;
    const parts = line.split(/\s+/u);
    if (parts.length >= 2 && parts[1] === "device") {
      serials.push(parts[0]);
    }
  }
  return serials;
}

export function parseRemoteListing(output: string): FileEntry[] {
  const entries: FileEntry[] = [];
  const isoPattern =
    /^-\S+\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?\s+(.+)$/u;
  const legacyPattern =
    /^-\S+\s+\d+\s+\S+\s+\S+\s+(\d+)\s+[A-Z][a-z]{2}\s+\d+\s+\S+\s+(.+)$/u;
  for (const rawLine of output.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("total ")) continue;
    const match = isoPattern.exec(line) ?? legacyPattern.exec(line);
    if (!match) continue;
    const size = Number.parseInt(match[1], 10);
    const name = path.posix.basename(match[2].trim());
    if (!Number.isNaN(size) && parseLogFileName(name)) {
      entries.push({ name, size });
    }
  }
  return entries.sort((a, b) => compareLogFiles(a.name, b.name));
}

export function planPull(remote: FileEntry[], local: FileEntry[]): PullPlan {
  const remoteMap = new Map<string, FileEntry>();
  for (const entry of remote) {
    if (parseLogFileName(entry.name)) {
      remoteMap.set(entry.name, entry);
    }
  }
  const localMap = new Map<string, FileEntry>();
  for (const entry of local) {
    if (parseLogFileName(entry.name)) {
      localMap.set(entry.name, entry);
    }
  }

  const pull: string[] = [];
  const keepSet = new Set<string>();
  const deleteLocal: string[] = [];

  const remoteNames = [...remoteMap.keys()].sort(compareLogFiles);
  for (const name of remoteNames) {
    const parsed = parseLogFileName(name)!;
    const remoteEntry = remoteMap.get(name)!;
    if (parsed.compressed) {
      const localEntry = localMap.get(name);
      if (!localEntry || localEntry.size !== remoteEntry.size) {
        pull.push(name);
      } else {
        keepSet.add(name);
      }
    } else {
      // If the phone already has the compressed twin alongside a stale .log, pull only the .gz.
      if (remoteMap.has(`${name}.gz`)) {
        continue;
      }
      pull.push(name);
    }
  }

  const pullSet = new Set(pull);
  const localNames = [...localMap.keys()].sort(compareLogFiles);
  for (const name of localNames) {
    const parsed = parseLogFileName(name)!;
    if (!parsed.compressed && remoteMap.has(`${name}.gz`)) {
      deleteLocal.push(name);
    } else if (!pullSet.has(name)) {
      keepSet.add(name);
    }
  }

  const keepLocal = [...keepSet].sort(compareLogFiles);
  return { pull, deleteLocal, keepLocal };
}

export function parseLogContent(
  fileName: string,
  content: string,
  previousTimestamp?: { timestampMs: number; timestamp: string },
): LogEntry[] {
  const parsedName = parseLogFileName(fileName);
  if (!parsedName) return [];
  const year = Number.parseInt(parsedName.day.slice(0, 4), 10);
  const fileMonth = Number.parseInt(parsedName.day.slice(5, 7), 10);
  const fileDay = Number.parseInt(parsedName.day.slice(8, 10), 10);
  const fallbackMs = Date.UTC(year, fileMonth - 1, fileDay, 0, 0, 0, 0);
  const fallbackTimestamp = `${parsedName.day} 00:00:00.000`;

  const lines = content.split(/\r?\n/u);
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  const entries: LogEntry[] = [];
  let lastMs = previousTimestamp?.timestampMs ?? fallbackMs;
  let lastTimestamp = previousTimestamp?.timestamp ?? fallbackTimestamp;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const match = LOG_LINE_PATTERN.exec(rawLine);
    if (match) {
      const month = Number.parseInt(match[1], 10);
      const day = Number.parseInt(match[2], 10);
      const hour = Number.parseInt(match[3], 10);
      const minute = Number.parseInt(match[4], 10);
      const second = Number.parseInt(match[5], 10);
      const millis = Number.parseInt(match[6], 10);
      // A repeat summary carries the previous line's time, so a 12-31 line can open the 01-01 file.
      const lineYear = month > fileMonth ? year - 1 : year;
      lastMs = Date.UTC(lineYear, month - 1, day, hour, minute, second, millis);
      lastTimestamp = `${String(lineYear).padStart(4, "0")}-${match[1]}-${match[2]} ${match[3]}:${match[4]}:${match[5]}.${match[6]}`;
      entries.push({
        file: fileName,
        line: index + 1,
        day: parsedName.day,
        timestampMs: lastMs,
        timestamp: lastTimestamp,
        message: match[7],
      });
    } else {
      entries.push({
        file: fileName,
        line: index + 1,
        day: parsedName.day,
        timestampMs: lastMs,
        timestamp: lastTimestamp,
        message: rawLine,
      });
    }
  }

  return entries;
}

const PLATFORM_PATTERNS: readonly RegExp[] = [
  /^(?:window-state|look|ocr|screenshot|cashier-text|cashier dialog|order-page|order-context|page|captured|rejected) ([a-z0-9_-]+)/u,
  /^cashier amount read ([a-z0-9_-]+)/u,
  /^cashier closed with its overlay ([a-z0-9_-]+):/u,
  /^([a-z0-9_-]+) (?:ready|source off|signed out|capture off)$/u,
];

const WINDOW_CLASS_PATTERN = /^window-state \S+ window=\S+ class=(\S+)/u;
const CAPTURED_PATTERN = /^captured \S+/u;
const PROCESS_START_VERSION_PATTERN =
  /^process start .*?\bversion=(\S+(?:\s+\(\d+\))?)/u;
const PREVIOUS_PROCESS_EXIT_PATTERN =
  /^previous process .*?\breason=(\S+)(?:.*?\bdescription=(.*))?$/u;

function extractPlatform(message: string): string | null {
  for (const pattern of PLATFORM_PATTERNS) {
    const match = pattern.exec(message);
    if (match) return match[1];
  }
  return null;
}

export function analyzeEntries(
  entries: LogEntry[],
  gapSeconds: number = DEFAULT_GAP_SECONDS,
): { days: DaySummary[]; suspiciousFlows: SuspiciousFlow[] } {
  const dayMap = new Map<string, DaySummary>();
  const ensureDay = (day: string): DaySummary => {
    let summary = dayMap.get(day);
    if (!summary) {
      summary = {
        day,
        capturedCount: 0,
        suspiciousFlowCount: 0,
        processStarts: [],
        previousProcessExits: [],
        serviceDownGaps: [],
      };
      dayMap.set(day, summary);
    }
    return summary;
  };

  let downSince: LogEntry | null = null;

  for (const entry of entries) {
    const summary = ensureDay(entry.day);
    const ref = `${entry.file}:${entry.line}`;

    if (CAPTURED_PATTERN.test(entry.message)) {
      summary.capturedCount += 1;
    }

    const startMatch = PROCESS_START_VERSION_PATTERN.exec(entry.message);
    if (startMatch) {
      summary.processStarts.push({
        timestamp: entry.timestamp,
        version: startMatch[1],
        lineRef: ref,
      });
    }

    const exitMatch = PREVIOUS_PROCESS_EXIT_PATTERN.exec(entry.message);
    if (exitMatch) {
      const description = exitMatch[2]?.trim();
      summary.previousProcessExits.push({
        timestamp: entry.timestamp,
        reason: exitMatch[1],
        ...(description ? { description } : {}),
        lineRef: ref,
      });
    }

    if (
      entry.message === "service unbound" ||
      entry.message === "service destroyed"
    ) {
      if (!downSince) {
        downSince = entry;
      }
    } else if (
      entry.message === "service connected" ||
      entry.message.startsWith("process start ")
    ) {
      if (downSince) {
        const downDay = ensureDay(downSince.day);
        downDay.serviceDownGaps.push({
          start: downSince.timestamp,
          end: entry.timestamp,
          durationSeconds: Math.max(
            0,
            Math.round((entry.timestampMs - downSince.timestampMs) / 1000),
          ),
          startEvent: downSince.message,
          endEvent: entry.message.startsWith("process start ")
            ? "process start"
            : entry.message,
          startRef: `${downSince.file}:${downSince.line}`,
          endRef: ref,
        });
        downSince = null;
      }
    }
  }

  if (downSince) {
    const downDay = ensureDay(downSince.day);
    downDay.serviceDownGaps.push({
      start: downSince.timestamp,
      end: null,
      durationSeconds: null,
      startEvent: downSince.message,
      endEvent: null,
      startRef: `${downSince.file}:${downSince.line}`,
      endRef: null,
    });
  }

  // Split entries into flows by timestamp gap.
  const gapMs = gapSeconds * 1000;
  const flows: LogEntry[][] = [];
  for (const entry of entries) {
    const current = flows[flows.length - 1];
    if (
      !current ||
      entry.timestampMs - current[current.length - 1].timestampMs > gapMs
    ) {
      flows.push([entry]);
    } else {
      current.push(entry);
    }
  }

  const strongSignalIds = new Set(
    PAYMENT_SIGNALS.filter((signal) => signal.strong).map((signal) => signal.id),
  );
  const suspiciousFlows: SuspiciousFlow[] = [];

  for (const flow of flows) {
    let hasCaptured = false;
    const signalCounts = new Map<string, number>();
    const platforms: string[] = [];
    const seenPlatforms = new Set<string>();
    const windowClasses: string[] = [];
    const seenClasses = new Set<string>();

    for (const entry of flow) {
      if (CAPTURED_PATTERN.test(entry.message)) {
        hasCaptured = true;
      }
      for (const signal of PAYMENT_SIGNALS) {
        if (signal.pattern.test(entry.message)) {
          signalCounts.set(signal.id, (signalCounts.get(signal.id) ?? 0) + 1);
        }
      }
      const platform = extractPlatform(entry.message);
      if (platform && !seenPlatforms.has(platform)) {
        seenPlatforms.add(platform);
        platforms.push(platform);
      }
      const classMatch = WINDOW_CLASS_PATTERN.exec(entry.message);
      if (classMatch && !seenClasses.has(classMatch[1])) {
        seenClasses.add(classMatch[1]);
        windowClasses.push(classMatch[1]);
      }
    }

    if (signalCounts.size === 0 || hasCaptured) continue;

    const signals: SignalCount[] = [];
    let strong = false;
    for (const signal of PAYMENT_SIGNALS) {
      const count = signalCounts.get(signal.id);
      if (count) {
        signals.push({ id: signal.id, count });
        if (strongSignalIds.has(signal.id)) strong = true;
      }
    }

    const first = flow[0];
    const last = flow[flow.length - 1];
    const suspicious: SuspiciousFlow = {
      strong,
      start: first.timestamp,
      end: last.timestamp,
      startRef: `${first.file}:${first.line}`,
      endRef: `${last.file}:${last.line}`,
      day: first.day,
      lineCount: flow.length,
      platforms,
      signals,
      windowClasses,
    };
    suspiciousFlows.push(suspicious);
    ensureDay(first.day).suspiciousFlowCount += 1;
  }

  const days = [...dayMap.values()].sort((a, b) =>
    a.day < b.day ? -1 : a.day > b.day ? 1 : 0,
  );
  return { days, suspiciousFlows };
}

export function readLastReviewed(mirrorDir: string): string | null {
  const filePath = path.join(mirrorDir, LAST_REVIEWED_FILE);
  try {
    const raw = readFileSync(filePath, "utf8").trim();
    return isValidDateString(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeLastReviewed(mirrorDir: string, date: string): void {
  if (!isValidDateString(date)) {
    throw new Error(`Invalid date (expected YYYY-MM-DD): ${date}`);
  }
  mkdirSync(mirrorDir, { recursive: true });
  writeFileSync(path.join(mirrorDir, LAST_REVIEWED_FILE), `${date}\n`, "utf8");
}

function readLogFileText(filePath: string, compressed: boolean): string {
  if (compressed) {
    return gunzipSync(readFileSync(filePath)).toString("utf8");
  }
  return readFileSync(filePath, "utf8");
}

export function listLocalLogFiles(mirrorDir: string): FileEntry[] {
  let names: string[];
  try {
    names = readdirSync(mirrorDir);
  } catch {
    return [];
  }
  const entries: FileEntry[] = [];
  for (const name of names) {
    if (!parseLogFileName(name)) continue;
    const fullPath = path.join(mirrorDir, name);
    try {
      const info = statSync(fullPath);
      if (info.isFile()) {
        entries.push({ name, size: info.size });
      }
    } catch {
      // Skip disappeared files.
    }
  }
  return entries.sort((a, b) => compareLogFiles(a.name, b.name));
}

export function scanMirror(options: {
  dir: string;
  since?: string;
  until?: string;
  gapSeconds?: number;
}): ScanResult {
  const mirrorDir = path.resolve(options.dir);
  const gapSeconds = options.gapSeconds ?? DEFAULT_GAP_SECONDS;
  if (!Number.isFinite(gapSeconds) || gapSeconds <= 0) {
    throw new Error(`--gap-seconds must be a positive number, got ${gapSeconds}`);
  }
  if (options.since && !isValidDateString(options.since)) {
    throw new Error(`Invalid --since date (expected YYYY-MM-DD): ${options.since}`);
  }
  if (options.until && !isValidDateString(options.until)) {
    throw new Error(`Invalid --until date (expected YYYY-MM-DD): ${options.until}`);
  }

  const allFiles = listLocalLogFiles(mirrorDir);
  if (allFiles.length === 0) {
    return {
      mirrorDir,
      since: options.since ?? null,
      until: options.until ?? null,
      gapSeconds,
      filesScanned: [],
      days: [],
      suspiciousFlows: [],
    };
  }

  const newestDay = parseLogFileName(allFiles[allFiles.length - 1].name)!.day;
  const until = options.until ?? newestDay;
  const since =
    options.since ?? readLastReviewed(mirrorDir) ?? subtractDays(newestDay, 7);

  const selected = allFiles.filter((entry) => {
    const parsed = parseLogFileName(entry.name)!;
    return parsed.day >= since && parsed.day <= until;
  });

  const allEntries: LogEntry[] = [];
  let prevTimestamp: { timestampMs: number; timestamp: string } | undefined;

  for (const entry of selected) {
    const parsed = parseLogFileName(entry.name)!;
    const content = readLogFileText(
      path.join(mirrorDir, entry.name),
      parsed.compressed,
    );
    const parsedEntries = parseLogContent(entry.name, content, prevTimestamp);
    if (parsedEntries.length > 0) {
      const last = parsedEntries[parsedEntries.length - 1];
      prevTimestamp = {
        timestampMs: last.timestampMs,
        timestamp: last.timestamp,
      };
      allEntries.push(...parsedEntries);
    }
  }

  const { days, suspiciousFlows } = analyzeEntries(allEntries, gapSeconds);
  return {
    mirrorDir,
    since,
    until,
    gapSeconds,
    filesScanned: selected.map((entry) => entry.name),
    days,
    suspiciousFlows,
  };
}

export function formatScanReport(result: ScanResult): string {
  const lines: string[] = [];
  const strongCount = result.suspiciousFlows.filter((flow) => flow.strong).length;
  lines.push(
    `Scan range: ${result.since ?? "(none)"} .. ${result.until ?? "(none)"} (gap: ${result.gapSeconds}s, files: ${result.filesScanned.length})`,
  );
  lines.push(
    `Suspicious flows: ${result.suspiciousFlows.length}${strongCount > 0 ? ` (${strongCount} strong)` : ""}`,
  );

  if (result.days.length > 0) {
    lines.push("");
    lines.push("Daily summary:");
    for (const day of result.days) {
      lines.push(
        `  ${day.day}: captured=${day.capturedCount}, suspicious=${day.suspiciousFlowCount}`,
      );
      for (const start of day.processStarts) {
        lines.push(
          `    process start: ${start.timestamp} version=${start.version} (${start.lineRef})`,
        );
      }
      for (const exit of day.previousProcessExits) {
        const desc = exit.description ? ` description=${exit.description}` : "";
        lines.push(
          `    previous exit: ${exit.timestamp} reason=${exit.reason}${desc} (${exit.lineRef})`,
        );
      }
      for (const gap of day.serviceDownGaps) {
        const endPart = gap.end
          ? `${gap.end} (${gap.durationSeconds}s, ${gap.startEvent} -> ${gap.endEvent})`
          : `ongoing (${gap.startEvent})`;
        lines.push(`    service down:  ${gap.start} -> ${endPart}`);
      }
    }
  }

  if (result.suspiciousFlows.length > 0) {
    lines.push("");
    lines.push("Suspicious flows:");
    result.suspiciousFlows.forEach((flow, index) => {
      const badge = flow.strong ? "STRONG " : "       ";
      lines.push(`[${index + 1}] ${badge}${flow.start} .. ${flow.end}`);
      lines.push(
        `    platforms: ${flow.platforms.length > 0 ? flow.platforms.join(", ") : "(unknown)"}`,
      );
      lines.push(
        `    signals:   ${flow.signals.map((s) => `${s.id}(${s.count})`).join(", ")}`,
      );
      lines.push(
        `    classes:   ${flow.windowClasses.length > 0 ? flow.windowClasses.join(" -> ") : "(none)"}`,
      );
      lines.push(`    lines:     ${flow.startRef} .. ${flow.endRef}`);
    });
  }

  return `${lines.join("\n")}\n`;
}

function runAdb(serial: string | undefined, args: string[]): string {
  const fullArgs = serial ? ["-s", serial, ...args] : args;
  const result = spawnSync("adb", fullArgs, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(
      `adb ${fullArgs.join(" ")} failed${detail ? `: ${detail}` : ""}`,
    );
  }
  return result.stdout ?? "";
}

function resolveSerial(explicitSerial?: string): string {
  if (explicitSerial) return explicitSerial;
  const output = runAdb(undefined, ["devices"]);
  const devices = parseAdbDevices(output);
  if (devices.length === 0) {
    throw new Error(
      "No online adb device found. Connect a phone via USB or wireless debugging, or pass --serial.",
    );
  }
  if (devices.length > 1) {
    throw new Error(
      `Multiple adb devices connected (${devices.join(", ")}). Pass --serial <id>.`,
    );
  }
  return devices[0];
}

function defaultCaptureLogsRoot(): string {
  return path.join(os.homedir(), ".zowl", "capture-logs");
}

function resolveMirrorDirForRead(explicitDir?: string): string {
  if (explicitDir) return path.resolve(explicitDir);
  const envDir = process.env.ZOWL_CAPTURE_LOG_DIR?.trim();
  if (envDir) return path.resolve(envDir);
  const root = defaultCaptureLogsRoot();
  let subdirs: string[] = [];
  try {
    subdirs = readdirSync(root).filter((name) => {
      try {
        return statSync(path.join(root, name)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    // Root does not exist yet.
  }
  if (subdirs.length === 1) {
    return path.join(root, subdirs[0]);
  }
  if (subdirs.length > 1) {
    throw new Error(
      `Multiple mirror directories found under ${root} (${subdirs.join(", ")}). Pass --dir or set ZOWL_CAPTURE_LOG_DIR.`,
    );
  }
  throw new Error(
    `No capture-log mirror directory found. Run "pull" first, pass --dir, or set ZOWL_CAPTURE_LOG_DIR.`,
  );
}

function runPull(args: { serial?: string; out?: string }): void {
  const serial = resolveSerial(args.serial);
  let outDir: string;
  if (args.out) {
    outDir = path.resolve(args.out);
  } else if (process.env.ZOWL_CAPTURE_LOG_DIR?.trim()) {
    outDir = path.resolve(process.env.ZOWL_CAPTURE_LOG_DIR.trim());
  } else {
    const model = sanitizeModelName(
      runAdb(serial, ["shell", "getprop", "ro.product.model"]),
    );
    outDir = path.join(defaultCaptureLogsRoot(), model);
  }

  let listingOutput: string;
  try {
    listingOutput = runAdb(serial, [
      "shell",
      `ls -l '${REMOTE_CAPTURE_LOG_DIR}/'`,
    ]);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("No such file or directory")) {
      console.log(`Remote directory not found yet: ${REMOTE_CAPTURE_LOG_DIR}`);
      return;
    }
    throw error;
  }

  const remoteFiles = parseRemoteListing(listingOutput);
  mkdirSync(outDir, { recursive: true });
  const localFiles = listLocalLogFiles(outDir);
  const plan = planPull(remoteFiles, localFiles);

  for (const name of plan.pull) {
    const remotePath = `${REMOTE_CAPTURE_LOG_DIR}/${name}`;
    const tmpPath = path.join(outDir, `.${name}.pull.tmp`);
    const finalPath = path.join(outDir, name);
    try {
      runAdb(serial, ["pull", remotePath, tmpPath]);
      renameSync(tmpPath, finalPath);
    } catch (error) {
      try {
        unlinkSync(tmpPath);
      } catch {
        // Ignore temp cleanup failure.
      }
      throw error;
    }
  }

  for (const name of plan.deleteLocal) {
    try {
      unlinkSync(path.join(outDir, name));
    } catch {
      // Ignore already-deleted file.
    }
  }

  const afterFiles = listLocalLogFiles(outDir);
  const totalBytes = afterFiles.reduce((sum, entry) => sum + entry.size, 0);
  console.log(
    `Pulled ${plan.pull.length}, kept ${plan.keepLocal.length}` +
      `${plan.deleteLocal.length > 0 ? `, replaced ${plan.deleteLocal.length}` : ""}` +
      `, total ${totalBytes} bytes (${outDir})`,
  );
}

function usage(): string {
  return [
    "Usage: npx tsx scripts/capture-logs.ts <command> [options]",
    "",
    "Commands:",
    "  pull [--serial <adb serial>] [--out <dir>]",
    "      Sync on-device capture logs to a local mirror directory.",
    "  scan [--dir <mirror>] [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--gap-seconds 180] [--json]",
    "      Scan mirrored logs for suspicious uncaptured payment flows and daily summaries.",
    "  mark-reviewed <YYYY-MM-DD> [--dir <mirror>]",
    "      Record the last reviewed date in <mirror>/last-reviewed.",
    "",
    "Environment:",
    "  ZOWL_CAPTURE_LOG_DIR   Default mirror directory (otherwise ~/.zowl/capture-logs/<model>).",
  ].join("\n");
}

function takeFlagValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function main(argv: string[]): void {
  if (
    argv.length === 0 ||
    argv.includes("--help") ||
    argv.includes("-h") ||
    argv[0] === "help"
  ) {
    console.log(usage());
    return;
  }

  const [command, ...rest] = argv;
  if (command === "pull") {
    let serial: string | undefined;
    let out: string | undefined;
    for (let i = 0; i < rest.length; i += 1) {
      const arg = rest[i];
      if (arg === "--serial") {
        serial = takeFlagValue(rest, i, "--serial");
        i += 1;
      } else if (arg === "--out") {
        out = takeFlagValue(rest, i, "--out");
        i += 1;
      } else {
        throw new Error(`Unknown option for pull: ${arg}`);
      }
    }
    runPull({ serial, out });
    return;
  }

  if (command === "scan") {
    let dir: string | undefined;
    let since: string | undefined;
    let until: string | undefined;
    let gapSeconds = DEFAULT_GAP_SECONDS;
    let asJson = false;
    for (let i = 0; i < rest.length; i += 1) {
      const arg = rest[i];
      if (arg === "--dir") {
        dir = takeFlagValue(rest, i, "--dir");
        i += 1;
      } else if (arg === "--since") {
        since = takeFlagValue(rest, i, "--since");
        i += 1;
      } else if (arg === "--until") {
        until = takeFlagValue(rest, i, "--until");
        i += 1;
      } else if (arg === "--gap-seconds") {
        gapSeconds = Number(takeFlagValue(rest, i, "--gap-seconds"));
        i += 1;
      } else if (arg === "--json") {
        asJson = true;
      } else {
        throw new Error(`Unknown option for scan: ${arg}`);
      }
    }
    const mirrorDir = resolveMirrorDirForRead(dir);
    const result = scanMirror({ dir: mirrorDir, since, until, gapSeconds });
    if (asJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      process.stdout.write(formatScanReport(result));
    }
    return;
  }

  if (command === "mark-reviewed") {
    let date: string | undefined;
    let dir: string | undefined;
    for (let i = 0; i < rest.length; i += 1) {
      const arg = rest[i];
      if (arg === "--dir") {
        dir = takeFlagValue(rest, i, "--dir");
        i += 1;
      } else if (!arg.startsWith("--") && !date) {
        date = arg;
      } else {
        throw new Error(`Unknown argument for mark-reviewed: ${arg}`);
      }
    }
    if (!date) {
      throw new Error("mark-reviewed requires a YYYY-MM-DD date");
    }
    const mirrorDir = resolveMirrorDirForRead(dir);
    writeLastReviewed(mirrorDir, date);
    console.log(`Marked ${date} as reviewed in ${mirrorDir}`);
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    main(process.argv.slice(2));
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
