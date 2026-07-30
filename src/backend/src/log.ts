/**
 * Simple logger that prefixes messages with timestamps and channel names.
 * Messages are written to stderr so stdout stays clean for IPC.
 */

const LEVELS = ["debug", "info", "warn", "error"] as const;
type Level = (typeof LEVELS)[number];

const MIN_LEVEL: Level = (process.env.LAUNCHER_LOG_LEVEL as Level) ?? "info";

function shouldLog(level: Level): boolean {
  return LEVELS.indexOf(level) >= LEVELS.indexOf(MIN_LEVEL);
}

function ts(): string {
  return new Date().toISOString().slice(11, 23);
}

export const log = {
  debug(channel: string, msg: string, ...args: unknown[]) {
    if (shouldLog("debug")) process.stderr.write(`[${ts()}] [DEBUG] [${channel}] ${msg}${args.length ? " " + JSON.stringify(args) : ""}\n`);
  },
  info(channel: string, msg: string, ...args: unknown[]) {
    if (shouldLog("info")) process.stderr.write(`[${ts()}] [INFO]  [${channel}] ${msg}${args.length ? " " + JSON.stringify(args) : ""}\n`);
  },
  warn(channel: string, msg: string, ...args: unknown[]) {
    if (shouldLog("warn")) process.stderr.write(`[${ts()}] [WARN]  [${channel}] ${msg}${args.length ? " " + JSON.stringify(args) : ""}\n`);
  },
  error(channel: string, msg: string, ...args: unknown[]) {
    if (shouldLog("error")) process.stderr.write(`[${ts()}] [ERROR] [${channel}] ${msg}${args.length ? " " + JSON.stringify(args) : ""}\n`);
  },
};
