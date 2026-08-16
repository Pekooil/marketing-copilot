import { createHash } from "node:crypto";
import { z } from "zod";

import { connectorConnectionInputSchema, connectorEndpointSchema, connectorSnapshotSchema, endpointMappingInputSchema, syncRangeSchema, type ConnectorAdapter } from "@/connectors/contracts";
import { ConnectorError } from "@/connectors/errors";
import { qualityScoreByState } from "@/metrics/quality";

const hosts = { us: "https://us.posthog.com", eu: "https://eu.posthog.com" } as const;
const requiredColumns = ["value", "window_start", "window_end", "segment", "fresh_as_of"] as const;

const endpointListSchema = z.object({
  results: z.array(z.object({
    name: z.string().min(1).max(120),
    is_active: z.boolean(),
    is_materialized: z.boolean(),
    current_version: z.number().int().nonnegative(),
    columns: z.array(z.object({ name: z.string().min(1).max(120) })).max(30),
  })).max(100),
});

const endpointRunSchema = z.object({
  name: z.string().min(1).max(120),
  execution_id: z.string().min(1).max(200),
  results: z.array(z.array(z.unknown()).max(30)).max(2),
  columns: z.array(z.string().min(1).max(120)).max(30),
  hasMore: z.boolean(),
  endpoint_version: z.number().int().positive(),
});

export class PosthogEndpointAdapter implements ConnectorAdapter {
  readonly provider = "posthog" as const;
  readonly capabilities = { readOnly: true, aggregateEndpoints: true, rawEventExport: false, arbitraryQuery: false, supportedRegions: ["us", "eu"] } as const;
  readonly #fetcher: typeof fetch;

  constructor(fetcher: typeof fetch = fetch) {
    this.#fetcher = fetcher;
  }

  async healthCheck(input: Parameters<ConnectorAdapter["healthCheck"]>[0]) {
    const connection = connectorConnectionInputSchema.parse(input.connection);
    const response = await this.#request(connection, input.credentials.accessToken, `/api/projects/${connection.projectId}/endpoints/?limit=1`);
    await response.json();
    return { healthy: true as const, providerRequestId: response.headers.get("x-request-id") };
  }

  async discoverSources(input: Parameters<ConnectorAdapter["discoverSources"]>[0]) {
    const connection = connectorConnectionInputSchema.parse(input.connection);
    const response = await this.#request(connection, input.credentials.accessToken, `/api/projects/${connection.projectId}/endpoints/?limit=100`);
    const parsed = endpointListSchema.parse(await response.json());
    return parsed.results.map((endpoint) => connectorEndpointSchema.parse({
      name: endpoint.name,
      active: endpoint.is_active,
      materialized: endpoint.is_materialized,
      version: endpoint.current_version,
      columns: endpoint.columns.map((column) => column.name),
    }));
  }

  async fetchMetricSnapshot(input: Parameters<ConnectorAdapter["fetchMetricSnapshot"]>[0]) {
    const connection = connectorConnectionInputSchema.parse(input.connection);
    const mapping = endpointMappingInputSchema.parse(input.mapping);
    const range = syncRangeSchema.parse(input.range);
    const response = await this.#request(connection, input.credentials.accessToken, `/api/projects/${connection.projectId}/endpoints/${encodeURIComponent(mapping.endpointName)}/run/`, {
      method: "POST",
      body: JSON.stringify({ limit: 2, refresh: "cache", version: mapping.endpointVersion, variables: { window_start: range.windowStart, window_end: range.windowEnd, segment: range.segment } }),
    });
    const raw = endpointRunSchema.safeParse(await response.json());
    if (!raw.success) throw invalidResponse("PostHog returned an invalid aggregate response.");
    const result = raw.data;
    if (result.hasMore || result.results.length !== 1) throw invalidResponse("The mapped PostHog Endpoint must return exactly one aggregate row.");
    if (result.endpoint_version !== mapping.endpointVersion) throw invalidResponse("The mapped PostHog Endpoint version changed.");
    const indexes = Object.fromEntries(result.columns.map((column, index) => [column, index]));
    if (!requiredColumns.every((column) => Number.isInteger(indexes[column]))) throw invalidResponse(`The mapped Endpoint must return ${requiredColumns.join(", ")}.`);
    const row = result.results[0];
    const valueCell = row[indexes.value];
    const value = valueCell === null ? null : Number(valueCell);
    if (value !== null && !Number.isFinite(value)) throw invalidResponse("The mapped Endpoint returned a non-numeric value.");
    const windowStart = normalizeTimestamp(row[indexes.window_start]);
    const windowEnd = normalizeTimestamp(row[indexes.window_end]);
    const freshAsOf = normalizeTimestamp(row[indexes.fresh_as_of]);
    const segment = z.string().min(1).max(300).parse(row[indexes.segment]);
    if (windowStart !== range.windowStart || windowEnd !== range.windowEnd || segment !== range.segment) throw invalidResponse("The mapped Endpoint returned a different window or segment.");
    const qualityState = value === null ? "unknown" as const : "current" as const;
    const canonical = JSON.stringify({ endpoint: mapping.endpointName, version: mapping.endpointVersion, executionId: result.execution_id, value, windowStart, windowEnd, segment, freshAsOf });
    return connectorSnapshotSchema.parse({
      value,
      qualityState,
      qualityScore: qualityScoreByState[qualityState],
      windowStart,
      windowEnd,
      segment,
      freshAsOf,
      providerRequestId: result.execution_id,
      providerObjectRef: `posthog_endpoint:${connection.projectId}:${mapping.endpointName}:v${mapping.endpointVersion}`,
      contentHash: createHash("sha256").update(canonical).digest("hex"),
      checkpoint: `${mapping.endpointVersion}:${result.execution_id}`,
    });
  }

  async #request(connection: z.infer<typeof connectorConnectionInputSchema>, accessToken: string, path: string, init: RequestInit = {}) {
    if (!/^pha_[A-Za-z0-9_-]{8,}$/.test(accessToken)) throw new ConnectorError({ code: "POSTHOG_CREDENTIAL_INVALID", classification: "credential", message: "The PostHog connection must be authorized again." });
    const response = await this.#fetcher(`${hosts[connection.region]}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw classifyResponse(response);
    return response;
  }
}

function normalizeTimestamp(value: unknown) {
  const parsed = z.iso.datetime().safeParse(value);
  if (!parsed.success) throw invalidResponse("The mapped Endpoint returned an invalid timestamp.");
  return new Date(parsed.data).toISOString();
}

function invalidResponse(message: string) {
  return new ConnectorError({ code: "POSTHOG_RESPONSE_INVALID", classification: "invalid_response", message });
}

function classifyResponse(response: Response) {
  if (response.status === 401) return new ConnectorError({ code: "POSTHOG_CREDENTIAL_EXPIRED", classification: "credential", message: "The PostHog connection must be authorized again." });
  if (response.status === 403) return new ConnectorError({ code: "POSTHOG_SCOPE_DENIED", classification: "permission", message: "PostHog did not grant the required read-only scope." });
  if (response.status === 404) return new ConnectorError({ code: "POSTHOG_ENDPOINT_MISSING", classification: "mapping", message: "The mapped PostHog Endpoint is unavailable." });
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after"));
    return new ConnectorError({ code: "POSTHOG_RATE_LIMITED", classification: "rate_limited", message: "PostHog is rate limiting refreshes.", retryable: true, retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : null });
  }
  return new ConnectorError({ code: "POSTHOG_TEMPORARY_FAILURE", classification: "temporary", message: "PostHog is temporarily unavailable.", retryable: response.status >= 500 });
}
