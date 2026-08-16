import { z } from "zod";

import { metricQualityStateSchema } from "@/metrics/quality";

export const connectorProviderSchema = z.literal("posthog");
export const connectorRegionSchema = z.enum(["us", "eu"]);
export const connectorStatusSchema = z.enum(["pending", "healthy", "degraded", "error", "revoked"]);

export const connectorConnectionInputSchema = z.object({
  provider: connectorProviderSchema,
  region: connectorRegionSchema,
  projectId: z.string().regex(/^[1-9][0-9]{0,19}$/, "Use the numeric PostHog project ID."),
  displayName: z.string().trim().min(1).max(120),
});

export const endpointMappingInputSchema = z.object({
  metricDefinitionId: z.uuid(),
  endpointName: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/, "Use a PostHog Endpoint name without spaces or path characters."),
  endpointVersion: z.number().int().positive(),
});

export const syncRangeSchema = z.object({
  windowStart: z.iso.datetime(),
  windowEnd: z.iso.datetime(),
  segment: z.string().trim().min(1).max(300),
}).superRefine((value, context) => {
  const start = Date.parse(value.windowStart);
  const end = Date.parse(value.windowEnd);
  if (end <= start) context.addIssue({ code: "custom", path: ["windowEnd"], message: "Window end must be after window start." });
  if (end - start > 366 * 24 * 60 * 60 * 1_000) context.addIssue({ code: "custom", path: ["windowEnd"], message: "Connector windows are limited to 366 days." });
});

export const connectorEndpointSchema = z.object({
  name: z.string().min(1).max(120),
  active: z.boolean(),
  materialized: z.boolean(),
  version: z.number().int().positive(),
  columns: z.array(z.string().min(1).max(120)).max(30),
});

export const connectorSnapshotSchema = z.object({
  value: z.number().finite().nullable(),
  qualityState: metricQualityStateSchema,
  qualityScore: z.number().min(0).max(1),
  windowStart: z.iso.datetime(),
  windowEnd: z.iso.datetime(),
  segment: z.string().min(1).max(300),
  freshAsOf: z.iso.datetime(),
  providerRequestId: z.string().min(1).max(200),
  providerObjectRef: z.string().min(1).max(500),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  checkpoint: z.string().min(1).max(500),
});

export type ConnectorConnectionInput = z.infer<typeof connectorConnectionInputSchema>;
export type ConnectorEndpoint = z.infer<typeof connectorEndpointSchema>;
export type ConnectorSnapshot = z.infer<typeof connectorSnapshotSchema>;
export type EndpointMappingInput = z.infer<typeof endpointMappingInputSchema>;
export type SyncRange = z.infer<typeof syncRangeSchema>;

export interface ConnectorCredentials {
  accessToken: string;
}

export interface ConnectorAdapter {
  readonly provider: "posthog";
  readonly capabilities: {
    readOnly: true;
    aggregateEndpoints: true;
    rawEventExport: false;
    arbitraryQuery: false;
    supportedRegions: readonly ["us", "eu"];
  };
  healthCheck(input: { connection: ConnectorConnectionInput; credentials: ConnectorCredentials }): Promise<{ healthy: true; providerRequestId: string | null }>;
  discoverSources(input: { connection: ConnectorConnectionInput; credentials: ConnectorCredentials }): Promise<ConnectorEndpoint[]>;
  fetchMetricSnapshot(input: { connection: ConnectorConnectionInput; credentials: ConnectorCredentials; mapping: EndpointMappingInput; range: SyncRange; checkpoint: string | null }): Promise<ConnectorSnapshot>;
}
