import { describe, expect, it, vi } from "vitest";

import { connectorSyncKey } from "@/connectors/idempotency";
import { ConnectorError } from "@/connectors/errors";
import { PosthogEndpointAdapter } from "@/connectors/posthog/endpoint-adapter";
import { createPosthogAuthorizationRequest, discoverPosthogOAuthServer } from "@/connectors/posthog/oauth";

const connection = { provider: "posthog" as const, region: "us" as const, projectId: "12345", displayName: "Production analytics" };
const credentials = { accessToken: "pha_test_token_123456" };
const mapping = { metricDefinitionId: "10000000-0000-4000-8000-000000000001", endpointName: "weekly-activation", endpointVersion: 3 };
const range = { windowStart: "2026-08-01T00:00:00.000Z", windowEnd: "2026-08-08T00:00:00.000Z", segment: "Self-serve founders" };

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

describe("PostHog read-only connector", () => {
  it("discovers OAuth metadata and creates a PKCE request with only endpoint:read", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ authorization_endpoint: "https://oauth.posthog.com/oauth/authorize", token_endpoint: "https://oauth.posthog.com/oauth/token", scopes_supported: ["endpoint:read"] }));
    const metadata = await discoverPosthogOAuthServer(fetcher);
    const request = createPosthogAuthorizationRequest({ clientId: "https://copilot.example/oauth-client", redirectUri: "https://copilot.example/connectors/posthog/callback" }, metadata.authorization_endpoint);
    const url = new URL(request.url);
    expect(url.searchParams.get("scope")).toBe("endpoint:read");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(request.codeVerifier).not.toBe(request.state);
  });

  it("discovers only bounded endpoint metadata", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ results: [{ name: "weekly-activation", is_active: true, is_materialized: true, current_version: 3, columns: [{ name: "value" }], created_by: { email: "private@example.com" }, query: "select * from events" }] }));
    const result = await new PosthogEndpointAdapter(fetcher).discoverSources({ connection, credentials });
    expect(result).toEqual([{ name: "weekly-activation", active: true, materialized: true, version: 3, columns: ["value"] }]);
    expect(JSON.stringify(result)).not.toContain("private@example.com");
    expect(JSON.stringify(result)).not.toContain("select *");
  });

  it("normalizes one exact aggregate row with traceable lineage", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ name: mapping.endpointName, execution_id: "execution-1", results: [[25, range.windowStart, range.windowEnd, range.segment, "2026-08-08T01:00:00.000Z"]], columns: ["value", "window_start", "window_end", "segment", "fresh_as_of"], hasMore: false, endpoint_version: 3 }));
    const snapshot = await new PosthogEndpointAdapter(fetcher).fetchMetricSnapshot({ connection, credentials, mapping, range, checkpoint: null });
    expect(snapshot).toMatchObject({ value: 25, qualityState: "current", providerRequestId: "execution-1", providerObjectRef: "posthog_endpoint:12345:weekly-activation:v3" });
    expect(snapshot.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(fetcher.mock.calls[0][0]).not.toContain("query");
  });

  it("keeps a null aggregate unknown and rejects pagination or scope drift", async () => {
    const valid = { name: mapping.endpointName, execution_id: "execution-2", results: [[null, range.windowStart, range.windowEnd, range.segment, "2026-08-08T01:00:00.000Z"]], columns: ["value", "window_start", "window_end", "segment", "fresh_as_of"], hasMore: false, endpoint_version: 3 };
    const unknown = await new PosthogEndpointAdapter(vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(valid))).fetchMetricSnapshot({ connection, credentials, mapping, range, checkpoint: null });
    expect(unknown).toMatchObject({ value: null, qualityState: "unknown" });
    await expect(new PosthogEndpointAdapter(vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ...valid, hasMore: true }))).fetchMetricSnapshot({ connection, credentials, mapping, range, checkpoint: null })).rejects.toMatchObject({ classification: "invalid_response" });
    await expect(new PosthogEndpointAdapter(vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ...valid, results: [[1, range.windowStart, range.windowEnd, "Paid", "2026-08-08T01:00:00.000Z"]] }))).fetchMetricSnapshot({ connection, credentials, mapping, range, checkpoint: null })).rejects.toThrow(/different window or segment/i);
  });

  it("classifies provider failures without leaking response bodies or credentials", async () => {
    const adapter = new PosthogEndpointAdapter(vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ token: credentials.accessToken }, 429, { "retry-after": "30" })));
    const error = await adapter.healthCheck({ connection, credentials }).catch((caught) => caught);
    expect(error).toBeInstanceOf(ConnectorError);
    expect(error).toMatchObject({ classification: "rate_limited", retryable: true, retryAfterSeconds: 30 });
    expect(JSON.stringify(error)).not.toContain(credentials.accessToken);
  });

  it("builds stable sync identity from approved mapping scope", () => {
    const input = { connectionId: "connection-1", metricDefinitionId: mapping.metricDefinitionId, endpointVersion: 3, ...range };
    expect(connectorSyncKey(input)).toBe(connectorSyncKey(input));
    expect(connectorSyncKey({ ...input, endpointVersion: 4 })).not.toBe(connectorSyncKey(input));
  });
});
