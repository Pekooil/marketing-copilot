import { z } from "zod";

import { metricDefinitionInputSchema } from "./definition";
import { funnelDefinitionInputSchema } from "./funnel";
import { manualMetricRowSchema } from "./manual-import";
import { metricQualityStateSchema } from "./quality";

export const savedMetricDefinitionSchema = metricDefinitionInputSchema.extend({
  id: z.uuid(),
  versionId: z.uuid(),
  version: z.number().int().positive(),
  approvalState: z.literal("founder_approved"),
});

export const importBatchSummarySchema = z.object({
  id: z.uuid(),
  filename: z.string().min(1).max(255),
  rowCount: z.number().int().positive().max(500),
  sourceId: z.uuid(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.iso.datetime(),
});

export const metricSnapshotSummarySchema = z.object({
  id: z.uuid(),
  metricDefinitionId: z.uuid(),
  windowStart: z.iso.datetime(),
  windowEnd: z.iso.datetime(),
  segment: z.string().min(1).max(300),
  value: z.coerce.number().finite().nullable(),
  qualityState: metricQualityStateSchema,
  qualityScore: z.coerce.number().min(0).max(1),
  freshAsOf: z.iso.datetime(),
  evidenceIds: z.array(z.uuid()).min(1),
  importBatchId: z.uuid().nullable(),
  syncRunId: z.uuid().nullable().optional(),
  sourceLineage: z.object({
    sourceId: z.uuid(),
    endpointName: z.string().min(1).max(120),
    endpointVersion: z.number().int().positive(),
    providerObjectRef: z.string().startsWith("posthog_endpoint:").max(500),
    observedAt: z.iso.datetime(),
    providerRequestId: z.string().min(1).max(200),
    checkpoint: z.string().min(1).max(500),
  }).nullable().optional(),
});

export const connectorMetricLineageSchema = z.array(z.object({
  snapshotId: z.uuid(),
  metricDefinitionId: z.uuid(),
  sourceId: z.uuid(),
  endpointName: z.string().min(1).max(120),
  endpointVersion: z.coerce.number().int().positive(),
  providerObjectRef: z.string().startsWith("posthog_endpoint:").max(500),
  observedAt: z.iso.datetime(),
  providerRequestId: z.string().min(1).max(200),
  checkpoint: z.string().min(1).max(500),
}));

export const savedFunnelSchema = z.object({
  id: z.uuid(),
  versionId: z.uuid(),
  version: z.number().int().positive(),
  name: z.string().min(1).max(120),
  stages: z.array(
    z.object({
      id: z.uuid(),
      stage: funnelDefinitionInputSchema.shape.stages.element.shape.stage,
      label: z.string().min(1).max(80),
      position: z.number().int().min(0).max(6),
      metricDefinitionId: z.uuid().nullable(),
      definition: z.string().min(1).max(1_000),
      included: z.boolean(),
      mappingState: z.enum(["mapped", "unmapped"]),
      qualityThreshold: z.coerce.number().min(0).max(1),
    }),
  ),
});

export const metricsWorkspaceStateSchema = z.object({
  workspaceId: z.uuid(),
  workspaceName: z.string().min(1).max(120),
  definitions: z.array(savedMetricDefinitionSchema),
  imports: z.array(importBatchSummarySchema),
  snapshots: z.array(metricSnapshotSummarySchema),
  funnel: savedFunnelSchema.nullable(),
});

export type MetricsWorkspaceState = z.infer<typeof metricsWorkspaceStateSchema>;

export const saveMetricDefinitionInputSchema = z.object({
  workspaceId: z.uuid(),
  metricDefinitionId: z.uuid().nullable(),
  expectedVersion: z.number().int().nonnegative(),
  definition: metricDefinitionInputSchema,
  requestId: z.uuid(),
  idempotencyKey: z.string().min(8).max(128),
});

export const saveFunnelInputSchema = z.object({
  workspaceId: z.uuid(),
  expectedVersion: z.number().int().nonnegative(),
  funnel: funnelDefinitionInputSchema,
  requestId: z.uuid(),
  idempotencyKey: z.string().min(8).max(128),
});

export const mappedManualMetricRowSchema = manualMetricRowSchema.extend({
  metricDefinitionId: z.uuid(),
});

export type MappedManualMetricRow = z.infer<typeof mappedManualMetricRowSchema>;

export interface CsvPreviewResult {
  ok: true;
  preview: {
    filename: string;
    sourceHash: string;
    totalRows: number;
    rows: MappedManualMetricRow[];
    errors: Array<{ rowNumber: number; field: string; message: string }>;
  };
}

export type MetricsMutationResult =
  | { ok: true; state: MetricsWorkspaceState; message: string }
  | { ok: false; fieldErrors?: Record<string, string>; message: string };

export type SaveMetricDefinitionAction = (
  input: z.input<typeof saveMetricDefinitionInputSchema>,
) => Promise<MetricsMutationResult>;

export type SaveFunnelAction = (
  input: z.input<typeof saveFunnelInputSchema>,
) => Promise<MetricsMutationResult>;

export type PreviewCsvAction = (
  formData: FormData,
) => Promise<CsvPreviewResult | { ok: false; message: string }>;

export type CommitCsvAction = (formData: FormData) => Promise<MetricsMutationResult>;
