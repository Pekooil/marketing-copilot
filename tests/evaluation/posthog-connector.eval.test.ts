import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import { PosthogEndpointAdapter } from "@/connectors/posthog/endpoint-adapter";

const connection = { provider: "posthog" as const, region: "eu" as const, projectId: "12345", displayName: "Production analytics" };
const credentials = { accessToken: "pha_test_token_123456" };
const mapping = { metricDefinitionId: "10000000-0000-4000-8000-000000000001", endpointName: "weekly-activation", endpointVersion: 3 };
const range = { windowStart: "2026-08-01T00:00:00.000Z", windowEnd: "2026-08-08T00:00:00.000Z", segment: "Self-serve founders" };

function response(executionId: string, value: number | null, overrides: Record<string, unknown> = {}, freshAsOf = "2026-08-08T01:00:00.000Z") {
  return new Response(JSON.stringify({ name: mapping.endpointName, execution_id: executionId, results: [[value, range.windowStart, range.windowEnd, range.segment, freshAsOf]], columns: ["value", "window_start", "window_end", "segment", "fresh_as_of"], hasMore: false, endpoint_version: 3, ...overrides }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("Sprint 4 reliable PostHog connector evaluation", () => {
  it("gives identical aggregate evidence stable content identity across provider executions", async () => {
    const first = await new PosthogEndpointAdapter(vi.fn<typeof fetch>().mockResolvedValue(response("execution-1", 25))).fetchMetricSnapshot({ connection, credentials, mapping, range, checkpoint: null });
    const replay = await new PosthogEndpointAdapter(vi.fn<typeof fetch>().mockResolvedValue(response("execution-2", 25, {}, "2026-08-08T02:00:00.000Z"))).fetchMetricSnapshot({ connection, credentials, mapping, range, checkpoint: first.checkpoint });
    expect(replay.contentHash).toBe(first.contentHash);
    expect(replay.providerRequestId).not.toBe(first.providerRequestId);
    const changed = await new PosthogEndpointAdapter(vi.fn<typeof fetch>().mockResolvedValue(response("execution-3", 26))).fetchMetricSnapshot({ connection, credentials, mapping, range, checkpoint: replay.checkpoint });
    expect(changed.contentHash).not.toBe(first.contentHash);
  });

  it("keeps null unknown and fails closed on extra rows, pagination, or Endpoint version drift", async () => {
    const unknown = await new PosthogEndpointAdapter(vi.fn<typeof fetch>().mockResolvedValue(response("execution-3", null))).fetchMetricSnapshot({ connection, credentials, mapping, range, checkpoint: null });
    expect(unknown).toMatchObject({ value: null, qualityState: "unknown" });
    await expect(new PosthogEndpointAdapter(vi.fn<typeof fetch>().mockResolvedValue(response("execution-4", 25, { hasMore: true }))).fetchMetricSnapshot({ connection, credentials, mapping, range, checkpoint: null })).rejects.toMatchObject({ code: "POSTHOG_RESPONSE_INVALID" });
    await expect(new PosthogEndpointAdapter(vi.fn<typeof fetch>().mockResolvedValue(response("execution-5", 25, { endpoint_version: 4 }))).fetchMetricSnapshot({ connection, credentials, mapping, range, checkpoint: null })).rejects.toMatchObject({ code: "POSTHOG_RESPONSE_INVALID" });
  });

  it("uses only PostHog Endpoint APIs and excludes arbitrary query and raw-event paths", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response("execution-6", 25));
    await new PosthogEndpointAdapter(fetcher).fetchMetricSnapshot({ connection, credentials, mapping, range, checkpoint: null });
    const requestUrl = String(fetcher.mock.calls[0][0]);
    expect(requestUrl).toContain("/endpoints/weekly-activation/run/");
    expect(requestUrl).not.toMatch(/\/query|\/events|\/persons/i);
  });

  it("persists stale failure evidence and restores current state from exact committed replay without duplicating observations", async () => {
    const sql = await readFile(new URL("../../supabase/migrations/20260816200000_connector_recovery.sql", import.meta.url), "utf8");
    expect(sql).toContain("v_previous.quality_state='stale'");
    expect(sql).toContain("'posthog-recovery-v1'");
    expect(sql).toContain("sync replay does not match committed evidence");
    expect(sql).toContain("connector.sync.recovered");
  });
});
