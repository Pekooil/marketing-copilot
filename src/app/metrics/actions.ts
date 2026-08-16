"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireIdentity } from "@/auth/require-identity";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { metricDefinitionKey } from "@/metrics/definition";
import { CsvImportError, parseManualMetricsCsv } from "@/metrics/manual-import";
import {
  mappedManualMetricRowSchema,
  metricsWorkspaceStateSchema,
  saveFunnelInputSchema,
  saveMetricDefinitionInputSchema,
  type CommitCsvAction,
  type CsvPreviewResult,
  type MetricsMutationResult,
  type MetricsWorkspaceState,
} from "@/metrics/workspace-schema";
import { createLogger } from "@/observability/logger";

const logger = createLogger();
const uploadEnvelopeSchema = z.object({ workspaceId: z.uuid(), requestId: z.uuid().optional(), idempotencyKey: z.string().min(8).max(128).optional() });

export async function loadMetricsWorkspaceState(workspaceId: string): Promise<MetricsWorkspaceState> {
  await requireIdentity();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_metrics_workspace_state", { p_workspace_id: workspaceId });
  if (error) {
    logger.error({ event: "metrics.load", result: "failed", errorClass: error.code });
    throw new Error("Metrics workspace could not be loaded.");
  }
  return metricsWorkspaceStateSchema.parse(data);
}

export async function saveMetricDefinition(rawInput: unknown): Promise<MetricsMutationResult> {
  const input = saveMetricDefinitionInputSchema.safeParse(rawInput);
  if (!input.success) return validationFailure(input.error);
  try {
    await requireIdentity();
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("save_metric_definition", {
      p_workspace_id: input.data.workspaceId,
      p_metric_definition_id: input.data.metricDefinitionId,
      p_expected_version: input.data.expectedVersion,
      p_definition: input.data.definition,
      p_request_id: input.data.requestId,
      p_idempotency_key: input.data.idempotencyKey,
    });
    if (error) return rpcFailure("metric_definition.save", error.code);
    const state = metricsWorkspaceStateSchema.parse(data);
    revalidatePath("/metrics");
    return { ok: true, state, message: "Metric definition saved and founder-approved." };
  } catch (error) {
    return unexpectedFailure("metric_definition.save", error);
  }
}

export async function previewManualMetrics(formData: FormData): Promise<CsvPreviewResult | { ok: false; message: string }> {
  try {
    await requireIdentity();
    const envelope = parseUploadEnvelope(formData);
    const file = readCsvFile(formData);
    const state = await loadMetricsWorkspaceState(envelope.workspaceId);
    return { ok: true, preview: await buildMappedPreview(file, state) };
  } catch (error) {
    logger.warn({ event: "manual_metrics.preview", result: "failed", errorClass: error instanceof Error ? error.constructor.name : "UNKNOWN_ERROR" });
    return { ok: false, message: publicCsvError(error) };
  }
}

export const commitManualMetrics: CommitCsvAction = async (formData) => {
  try {
    await requireIdentity();
    const envelope = uploadEnvelopeSchema.parse({
      workspaceId: formData.get("workspaceId"), requestId: formData.get("requestId"), idempotencyKey: formData.get("idempotencyKey"),
    });
    if (!envelope.requestId || !envelope.idempotencyKey) return { ok: false, message: "The import request is incomplete." };
    const file = readCsvFile(formData);
    const state = await loadMetricsWorkspaceState(envelope.workspaceId);
    const preview = await buildMappedPreview(file, state);
    if (preview.errors.length > 0 || preview.rows.length !== preview.totalRows) {
      return { ok: false, message: "Resolve every CSV preview error before importing." };
    }
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("commit_manual_metric_import", {
      p_workspace_id: envelope.workspaceId,
      p_filename: preview.filename,
      p_source_hash: preview.sourceHash,
      p_rows: preview.rows,
      p_request_id: envelope.requestId,
      p_idempotency_key: envelope.idempotencyKey,
    });
    if (error) return rpcFailure("manual_metrics.import", error.code);
    const nextState = metricsWorkspaceStateSchema.parse(data);
    revalidatePath("/metrics");
    return { ok: true, state: nextState, message: `${preview.rows.length} metric rows imported with source lineage.` };
  } catch (error) {
    if (error instanceof CsvImportError || error instanceof z.ZodError) return { ok: false, message: publicCsvError(error) };
    return unexpectedFailure("manual_metrics.import", error);
  }
};

export async function saveFunnel(rawInput: unknown): Promise<MetricsMutationResult> {
  const input = saveFunnelInputSchema.safeParse(rawInput);
  if (!input.success) return validationFailure(input.error);
  try {
    await requireIdentity();
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("save_funnel_definition", {
      p_workspace_id: input.data.workspaceId,
      p_expected_version: input.data.expectedVersion,
      p_name: input.data.funnel.name,
      p_stages: input.data.funnel.stages,
      p_request_id: input.data.requestId,
      p_idempotency_key: input.data.idempotencyKey,
    });
    if (error) return rpcFailure("funnel.save", error.code);
    const state = metricsWorkspaceStateSchema.parse(data);
    revalidatePath("/metrics");
    return { ok: true, state, message: "Founder-approved funnel mapping saved." };
  } catch (error) {
    return unexpectedFailure("funnel.save", error);
  }
}

function parseUploadEnvelope(formData: FormData) {
  return uploadEnvelopeSchema.parse({ workspaceId: formData.get("workspaceId") });
}

function readCsvFile(formData: FormData) {
  const file = formData.get("csv");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) {
    throw new CsvImportError("Choose a CSV file.");
  }
  if (file.size > 256_000) throw new CsvImportError("CSV files must be 256 KB or smaller.");
  return file;
}

async function buildMappedPreview(file: File, state: MetricsWorkspaceState) {
  const parsed = parseManualMetricsCsv(await file.text());
  const definitions = new Map(state.definitions.map((definition) => [metricDefinitionKey(definition.name), definition.id]));
  const errors = [...parsed.errors];
  const rows = parsed.rows.flatMap((row) => {
    const metricDefinitionId = definitions.get(metricDefinitionKey(row.metricName));
    if (!metricDefinitionId) {
      errors.push({ rowNumber: row.rowNumber, field: "metric", message: `Define and approve “${row.metricName}” before importing.` });
      return [];
    }
    return [mappedManualMetricRowSchema.parse({ ...row, metricDefinitionId })];
  });
  return { filename: file.name, sourceHash: parsed.sourceHash, totalRows: parsed.totalRows, rows, errors };
}

function validationFailure(error: z.ZodError): MetricsMutationResult {
  return { ok: false, fieldErrors: Object.fromEntries(error.issues.map((issue) => [issue.path.join("."), issue.message])), message: "Review the highlighted fields." };
}

function rpcFailure(event: string, code: string): MetricsMutationResult {
  logger.warn({ event, result: "failed", errorClass: code });
  if (code === "42501") return { ok: false, message: "That workspace resource is unavailable." };
  if (code === "40001") return { ok: false, message: "This record changed in another session. Refresh before saving." };
  if (code === "23505") return { ok: false, message: "This name or request conflicts with an existing record." };
  return { ok: false, message: "The change could not be saved. Existing metric data was not changed." };
}

function unexpectedFailure(event: string, error: unknown): MetricsMutationResult {
  logger.warn({ event, result: "failed", errorClass: error instanceof Error ? error.constructor.name : "UNKNOWN_ERROR" });
  return { ok: false, message: "The change could not be saved. Existing metric data was not changed." };
}

function publicCsvError(error: unknown) {
  if (error instanceof CsvImportError) return error.message;
  if (error instanceof z.ZodError) return "The CSV request is invalid.";
  return "The CSV could not be previewed safely.";
}
