const sensitiveKey = /(authorization|cookie|password|secret|token|email|payload|content|goal|brand|rationale)/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        sensitiveKey.test(key) ? "[REDACTED]" : redact(child),
      ]),
    );
  }
  return value;
}
