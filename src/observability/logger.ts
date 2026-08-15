import "server-only";

import { createHash } from "node:crypto";

import { getRequestContext } from "./context";
import { redact } from "./redaction";

type LogLevel = "info" | "warn" | "error";

export interface LogRecord {
  event: string;
  result?: string;
  durationMs?: number;
  errorClass?: string;
  [key: string]: unknown;
}

export function createLogger(write: (line: string) => void = console.log) {
  function emit(level: LogLevel, record: LogRecord) {
    const context = getRequestContext();
    write(
      JSON.stringify(
        redact({
          timestamp: new Date().toISOString(),
          level,
          service: "marketing-copilot-web",
          ...context,
          ...record,
        }),
      ),
    );
  }
  return {
    info: (record: LogRecord) => emit("info", record),
    warn: (record: LogRecord) => emit("warn", record),
    error: (record: LogRecord) => emit("error", record),
  };
}

export function privacyHash(value: string, salt = process.env.OBSERVABILITY_HASH_SALT) {
  if (!salt && process.env.APP_ENV === "production") {
    throw new Error("OBSERVABILITY_HASH_SALT is required in production.");
  }
  return createHash("sha256").update(`${salt ?? "local-only"}:${value}`).digest("hex").slice(0, 20);
}
