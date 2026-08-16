"use client";

import { MetricsWorkspace } from "@/app/metrics/metrics-workspace";
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
  return <MetricsWorkspace initialState={initialState} saveDefinitionAction={saveDefinitionAction} previewCsvAction={previewCsvAction} commitCsvAction={commitCsvAction} saveFunnelAction={saveFunnelAction} />;
}
