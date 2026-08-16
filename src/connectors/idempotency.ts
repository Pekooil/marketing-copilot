import { createHash } from "node:crypto";

export function connectorSyncKey(input: { connectionId: string; metricDefinitionId: string; endpointVersion: number; windowStart: string; windowEnd: string; segment: string }) {
  return createHash("sha256").update([
    input.connectionId,
    input.metricDefinitionId,
    String(input.endpointVersion),
    input.windowStart,
    input.windowEnd,
    input.segment.trim(),
  ].join("\u001f")).digest("hex");
}
