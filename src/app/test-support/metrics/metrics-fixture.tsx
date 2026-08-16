"use client";

import { useRef } from "react";

import { MetricsWorkspace } from "@/app/metrics/metrics-workspace";
import type { ConnectorWorkspaceState, DiscoverConnectorSourcesAction, RefreshConnectorAction, RevokeConnectorAction, SaveConnectorMappingAction, StartConnectionAction } from "@/connectors/workspace-schema";
import type {
  CommitCsvAction,
  MetricsWorkspaceState,
  PreviewCsvAction,
  SaveFunnelAction,
  SaveMetricDefinitionAction,
} from "@/metrics/workspace-schema";

const workspaceId = "a0000000-0000-4000-8000-000000000001";
const visitsId = "a0000000-0000-4000-8000-000000000010";
const activationId = "a0000000-0000-4000-8000-000000000020";
const windowStart = "2026-08-01T00:00:00.000Z";
const windowEnd = "2026-08-08T00:00:00.000Z";
const freshAsOf = "2026-08-08T01:00:00.000Z";

const definitions: MetricsWorkspaceState["definitions"] = [
  {
    id: visitsId,
    versionId: "a0000000-0000-4000-8000-000000000011",
    version: 1,
    name: "Qualified visits",
    businessDefinition: "Distinct qualified product visits during the UTC week.",
    unit: "count",
    customUnit: "",
    aggregation: "unique",
    segment: "Self-serve founders",
    exclusions: ["Internal traffic"],
    timezone: "UTC",
    freshnessHours: 168,
    approvalState: "founder_approved",
  },
  {
    id: activationId,
    versionId: "a0000000-0000-4000-8000-000000000021",
    version: 1,
    name: "Activated accounts",
    businessDefinition: "Accounts completing the founder-approved value event during the UTC week.",
    unit: "count",
    customUnit: "",
    aggregation: "unique",
    segment: "Self-serve founders",
    exclusions: ["Internal accounts"],
    timezone: "UTC",
    freshnessHours: 168,
    approvalState: "founder_approved",
  },
];

const funnel: NonNullable<MetricsWorkspaceState["funnel"]> = {
  id: "b0000000-0000-4000-8000-000000000001",
  versionId: "b0000000-0000-4000-8000-000000000002",
  version: 1,
  name: "Core product funnel",
  stages: [
    { id: "b0000000-0000-4000-8000-000000000010", stage: "acquisition", label: "Qualified visits", position: 0, metricDefinitionId: visitsId, definition: "A qualified founder reaches the product.", included: true, mappingState: "mapped", qualityThreshold: 1 },
    { id: "b0000000-0000-4000-8000-000000000020", stage: "activation", label: "Activated accounts", position: 1, metricDefinitionId: activationId, definition: "A founder receives the defined product value.", included: true, mappingState: "mapped", qualityThreshold: 1 },
  ],
};

const initialState: MetricsWorkspaceState = {
  workspaceId,
  workspaceName: "Sprint 3 demo workspace",
  definitions,
  imports: [],
  snapshots: [],
  funnel,
};

const importedState: MetricsWorkspaceState = {
  ...initialState,
  imports: [{ id: "c0000000-0000-4000-8000-000000000001", filename: "sprint3-demo.csv", rowCount: 2, sourceId: "c0000000-0000-4000-8000-000000000002", sourceHash: "c".repeat(64), createdAt: freshAsOf }],
  snapshots: [
    { id: "d0000000-0000-4000-8000-000000000001", metricDefinitionId: visitsId, windowStart, windowEnd, segment: "Self-serve founders", value: 100, qualityState: "current", qualityScore: 1, freshAsOf, evidenceIds: ["e0000000-0000-4000-8000-000000000001"], importBatchId: "c0000000-0000-4000-8000-000000000001" },
    { id: "d0000000-0000-4000-8000-000000000002", metricDefinitionId: activationId, windowStart, windowEnd, segment: "Self-serve founders", value: 25, qualityState: "current", qualityScore: 1, freshAsOf, evidenceIds: ["e0000000-0000-4000-8000-000000000002"], importBatchId: "c0000000-0000-4000-8000-000000000001" },
  ],
};

const connectionId = "f0000000-0000-4000-8000-000000000001";
const mappingId = "f0000000-0000-4000-8000-000000000002";
const mappingVersionId = "f0000000-0000-4000-8000-000000000003";
const successfulRunId = "f0000000-0000-4000-8000-000000000004";
const failedRunId = "f0000000-0000-4000-8000-000000000005";

const initialConnectorState: ConnectorWorkspaceState = {
  workspaceId,
  workspaceName: "Sprint 4 demo workspace",
  connection: { id: connectionId, provider: "posthog", region: "us", projectId: "12345", displayName: "PostHog demo", status: "healthy", scopes: ["endpoint:read"], credentialConfigured: true, lastHealthyAt: freshAsOf, lastErrorCode: null },
  mappings: [],
  runs: [],
};

const mappedConnectorState: ConnectorWorkspaceState = {
  ...initialConnectorState,
  mappings: [{ id: mappingId, versionId: mappingVersionId, version: 1, connectionId, metricDefinitionId: activationId, endpointName: "weekly-activation", endpointVersion: 3, approvalState: "founder_approved", createdAt: freshAsOf }],
};

const successfulConnectorState: ConnectorWorkspaceState = {
  ...mappedConnectorState,
  runs: [{ id: successfulRunId, connectionId, status: "succeeded", windowStart, windowEnd, segment: "Self-serve founders", metricCount: 1, succeededCount: 1, errorClass: null, startedAt: freshAsOf, completedAt: freshAsOf }],
};

const degradedConnectorState: ConnectorWorkspaceState = {
  ...successfulConnectorState,
  connection: { ...successfulConnectorState.connection!, status: "degraded", lastErrorCode: "POSTHOG_RATE_LIMITED" },
  runs: [{ id: failedRunId, connectionId, status: "failed", windowStart, windowEnd, segment: "Self-serve founders", metricCount: 1, succeededCount: 0, errorClass: "POSTHOG_RATE_LIMITED", startedAt: freshAsOf, completedAt: freshAsOf }, ...successfulConnectorState.runs],
};

function connectorMetricsState(qualityState: "current" | "stale"): MetricsWorkspaceState {
  return {
    ...initialState,
    snapshots: [{
      id: qualityState === "current" ? "f0000000-0000-4000-8000-000000000010" : "f0000000-0000-4000-8000-000000000011",
      metricDefinitionId: activationId,
      windowStart,
      windowEnd,
      segment: "Self-serve founders",
      value: 25,
      qualityState,
      qualityScore: qualityState === "current" ? 1 : 0.5,
      freshAsOf,
      evidenceIds: ["f0000000-0000-4000-8000-000000000012"],
      importBatchId: null,
      syncRunId: qualityState === "current" ? successfulRunId : failedRunId,
      sourceLineage: { sourceId: "f0000000-0000-4000-8000-000000000013", endpointName: "weekly-activation", endpointVersion: 3, providerObjectRef: "posthog_endpoint:12345:weekly-activation:v3", observedAt: freshAsOf, providerRequestId: "execution-demo-1", checkpoint: "3:execution-demo-1" },
    }],
  };
}

const previewCsvAction: PreviewCsvAction = async () => ({
  ok: true,
  preview: {
    filename: "sprint3-demo.csv",
    sourceHash: "c".repeat(64),
    totalRows: 2,
    errors: [],
    rows: [
      { rowNumber: 2, metricName: "Qualified visits", metricDefinitionId: visitsId, value: 100, windowStart, windowEnd, segment: "Self-serve founders", freshAsOf, qualityState: "current", qualityScore: 1, sourceNote: "Founder export", rowKey: "1".repeat(64) },
      { rowNumber: 3, metricName: "Activated accounts", metricDefinitionId: activationId, value: 25, windowStart, windowEnd, segment: "Self-serve founders", freshAsOf, qualityState: "current", qualityScore: 1, sourceNote: "Founder export", rowKey: "2".repeat(64) },
    ],
  },
});

const commitCsvAction: CommitCsvAction = async () => ({ ok: true, state: importedState, message: "Imported 2 traceable observations." });
const saveDefinitionAction: SaveMetricDefinitionAction = async () => ({ ok: false, message: "The fixture keeps definitions fixed." });
const saveFunnelAction: SaveFunnelAction = async () => ({ ok: true, state: importedState, message: "Funnel mapping approved." });

export function MetricsFixture() {
  const refreshAttempt = useRef(0);
  const startAction: StartConnectionAction = async () => ({ ok: false, message: "The browser fixture starts with a healthy connection." });
  const discoverAction: DiscoverConnectorSourcesAction = async () => ({ ok: true, endpoints: [{ name: "weekly-activation", active: true, materialized: true, version: 3, columns: ["value", "window_start", "window_end", "segment", "fresh_as_of"] }] });
  const saveMappingAction: SaveConnectorMappingAction = async () => ({ ok: true, state: mappedConnectorState, message: "Founder-approved Endpoint mapping saved." });
  const refreshAction: RefreshConnectorAction = async () => {
    refreshAttempt.current += 1;
    if (refreshAttempt.current === 3) return { ok: false, connectorState: degradedConnectorState, metricsState: connectorMetricsState("stale"), message: "PostHog is rate limiting refreshes. Existing evidence is marked stale." };
    return { ok: true, connectorState: successfulConnectorState, metricsState: connectorMetricsState("current"), message: refreshAttempt.current === 2 ? "Exact replay recovered with no duplicate observation." : refreshAttempt.current > 3 ? "PostHog aggregate recovered from committed evidence." : "1 PostHog aggregate refreshed with source lineage." };
  };
  const revokeAction: RevokeConnectorAction = async () => ({ ok: true, state: { ...initialConnectorState, connection: { ...initialConnectorState.connection!, status: "revoked", credentialConfigured: false } }, message: "PostHog access revoked." });
  return <MetricsWorkspace initialState={initialState} saveDefinitionAction={saveDefinitionAction} previewCsvAction={previewCsvAction} commitCsvAction={commitCsvAction} saveFunnelAction={saveFunnelAction} connector={{ initialState: initialConnectorState, startAction, discoverAction, saveMappingAction, refreshAction, revokeAction }} />;
}
