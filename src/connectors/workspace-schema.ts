import { z } from "zod";

import { connectorConnectionInputSchema, connectorEndpointSchema, connectorStatusSchema, endpointMappingInputSchema, syncRangeSchema } from "./contracts";
import type { MetricsWorkspaceState } from "@/metrics/workspace-schema";

export const connectorConnectionSummarySchema = connectorConnectionInputSchema.extend({
  id: z.uuid(),
  status: connectorStatusSchema,
  scopes: z.tuple([z.literal("endpoint:read")]),
  credentialConfigured: z.boolean(),
  lastHealthyAt: z.iso.datetime().nullable(),
  lastErrorCode: z.string().regex(/^[A-Z0-9_]{2,80}$/).nullable(),
});

export const connectorMappingSummarySchema = endpointMappingInputSchema.extend({
  id: z.uuid(),
  versionId: z.uuid(),
  version: z.number().int().positive(),
  connectionId: z.uuid(),
  approvalState: z.literal("founder_approved"),
  createdAt: z.iso.datetime(),
});

export const syncRunSummarySchema = z.object({
  id: z.uuid(),
  connectionId: z.uuid(),
  status: z.enum(["running", "succeeded", "failed"]),
  windowStart: z.iso.datetime(),
  windowEnd: z.iso.datetime(),
  segment: z.string().min(1).max(300),
  metricCount: z.number().int().min(1).max(50),
  succeededCount: z.number().int().min(0).max(50),
  errorClass: z.string().nullable(),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});

export const connectorWorkspaceStateSchema = z.object({
  workspaceId: z.uuid(),
  workspaceName: z.string().min(1).max(120),
  connection: connectorConnectionSummarySchema.nullable(),
  mappings: z.array(connectorMappingSummarySchema),
  runs: z.array(syncRunSummarySchema),
});

export const startConnectionInputSchema = z.object({
  workspaceId: z.uuid(),
  connection: connectorConnectionInputSchema,
  requestId: z.uuid(),
  idempotencyKey: z.string().min(8).max(128),
});

export const saveConnectorMappingInputSchema = z.object({
  workspaceId: z.uuid(),
  connectionId: z.uuid(),
  expectedVersion: z.number().int().nonnegative(),
  mapping: endpointMappingInputSchema,
  requestId: z.uuid(),
  idempotencyKey: z.string().min(8).max(128),
});

export const refreshConnectorInputSchema = z.object({
  workspaceId: z.uuid(),
  connectionId: z.uuid(),
  range: syncRangeSchema,
  requestId: z.uuid(),
});

export type ConnectorWorkspaceState = z.infer<typeof connectorWorkspaceStateSchema>;

export type StartConnectionAction = (input: z.input<typeof startConnectionInputSchema>) => Promise<{ ok: true; authorizationUrl: string } | { ok: false; message: string }>;
export type DiscoverConnectorSourcesAction = (input: { workspaceId: string; connectionId: string }) => Promise<{ ok: true; endpoints: z.infer<typeof connectorEndpointSchema>[] } | { ok: false; message: string }>;
export type SaveConnectorMappingAction = (input: z.input<typeof saveConnectorMappingInputSchema>) => Promise<{ ok: true; state: ConnectorWorkspaceState; message: string } | { ok: false; message: string }>;
export type RefreshConnectorAction = (input: z.input<typeof refreshConnectorInputSchema>) => Promise<{ ok: true; connectorState: ConnectorWorkspaceState; metricsState: MetricsWorkspaceState; message: string } | { ok: false; connectorState?: ConnectorWorkspaceState; metricsState?: MetricsWorkspaceState; message: string }>;
export type RevokeConnectorAction = (input: { workspaceId: string; connectionId: string; requestId: string }) => Promise<{ ok: true; state: ConnectorWorkspaceState; message: string } | { ok: false; message: string }>;
