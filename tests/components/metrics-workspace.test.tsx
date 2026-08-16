import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CsvImportPanel } from "@/app/metrics/csv-import-panel";
import { FunnelReport } from "@/app/metrics/funnel-report";
import { MetricDefinitionPanel } from "@/app/metrics/metric-definition-panel";
import type { MetricsWorkspaceState } from "@/metrics/workspace-schema";

const workspaceId = "a0000000-0000-4000-8000-000000000001";
const metricA = "a0000000-0000-4000-8000-000000000010";
const metricB = "a0000000-0000-4000-8000-000000000011";
const batchId = "a0000000-0000-4000-8000-000000000020";
const sourceId = "a0000000-0000-4000-8000-000000000021";

const emptyState: MetricsWorkspaceState = {
  workspaceId,
  workspaceName: "Acme workspace",
  definitions: [],
  imports: [],
  snapshots: [],
  funnel: null,
};

const stateWithFunnel: MetricsWorkspaceState = {
  ...emptyState,
  definitions: [definition(metricA, "Qualified visits"), definition(metricB, "Activated accounts")],
  imports: [{ id: batchId, filename: "weekly-funnel.csv", rowCount: 2, sourceId, sourceHash: "a".repeat(64), createdAt: "2026-08-16T12:00:00.000Z" }],
  snapshots: [snapshot(metricA, 0, "a0000000-0000-4000-8000-000000000030"), snapshot(metricB, 0, "a0000000-0000-4000-8000-000000000031")],
  funnel: {
    id: "a0000000-0000-4000-8000-000000000040",
    versionId: "a0000000-0000-4000-8000-000000000041",
    version: 1,
    name: "Core funnel",
    stages: [
      { id: "a0000000-0000-4000-8000-000000000042", stage: "acquisition", label: "Visits", position: 0, metricDefinitionId: metricA, definition: "Qualified site visits", included: true, mappingState: "mapped", qualityThreshold: 1 },
      { id: "a0000000-0000-4000-8000-000000000043", stage: "activation", label: "Activated", position: 1, metricDefinitionId: metricB, definition: "Accounts reaching first value", included: true, mappingState: "mapped", qualityThreshold: 1 },
    ],
  },
};

describe("manual metrics workspace", () => {
  it("creates a founder-approved metric definition", async () => {
    const user = userEvent.setup();
    const nextState = { ...emptyState, definitions: [definition(metricA, "Weekly signups")] };
    const action = vi.fn().mockResolvedValue({ ok: true, state: nextState, message: "Saved" });
    render(<MetricDefinitionPanel state={emptyState} action={action} onSaved={vi.fn()} />);
    await user.type(screen.getByLabelText("Metric name"), "Weekly signups");
    await user.type(screen.getByLabelText("Business definition"), "Unique accounts created during the UTC week.");
    await user.click(screen.getByRole("button", { name: "Create metric definition" }));
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(action).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId,
      expectedVersion: 0,
      definition: expect.objectContaining({ name: "Weekly signups", timezone: "UTC", freshnessHours: 168 }),
    }));
  });

  it("previews a CSV without converting unknown to zero", async () => {
    const user = userEvent.setup();
    const previewAction = vi.fn().mockResolvedValue({ ok: true, preview: {
      filename: "metrics.csv", sourceHash: "b".repeat(64), totalRows: 1, errors: [],
      rows: [{ rowNumber: 2, metricName: "Qualified visits", metricDefinitionId: metricA, value: null, windowStart: "2026-08-01T00:00:00Z", windowEnd: "2026-08-08T00:00:00Z", segment: "all", freshAsOf: "2026-08-08T01:00:00Z", qualityState: "unknown", qualityScore: 0, sourceNote: "Not measured", rowKey: "c".repeat(64) }],
    } });
    render(<CsvImportPanel state={stateWithFunnel} previewAction={previewAction} commitAction={vi.fn()} onImported={vi.fn()} />);
    await user.upload(screen.getByLabelText("CSV file"), new File(["metric,value"], "metrics.csv", { type: "text/csv" }));
    await user.click(screen.getByRole("button", { name: "Preview CSV" }));
    expect(await screen.findByText("1 rows are valid and ready to import.")).toBeInTheDocument();
    const row = screen.getByRole("cell", { name: "Qualified visits" }).closest("tr")!;
    expect(within(row).getByText("—")).toBeInTheDocument();
    expect(within(row).getByText("unknown")).toBeInTheDocument();
  });

  it("shows observed zero, source lineage, and an unavailable conversion reason", () => {
    render(<FunnelReport state={stateWithFunnel} />);
    expect(screen.getAllByText("0")).toHaveLength(2);
    expect(screen.getByText("Unavailable · observed denominator is zero")).toBeInTheDocument();
    expect(screen.getAllByText(/weekly-funnel\.csv/)).toHaveLength(2);
    expect(screen.getAllByText(/a0000000/).length).toBeGreaterThan(0);
  });
});

function definition(id: string, name: string): MetricsWorkspaceState["definitions"][number] {
  return { id, versionId: id.replace(/.$/, "f"), version: 1, name, businessDefinition: `${name} in the UTC week.`, unit: "count", customUnit: "", aggregation: "unique", segment: "all", exclusions: [], timezone: "UTC", freshnessHours: 168, approvalState: "founder_approved" };
}

function snapshot(metricDefinitionId: string, value: number, id: string): MetricsWorkspaceState["snapshots"][number] {
  return { id, metricDefinitionId, windowStart: "2026-08-01T00:00:00Z", windowEnd: "2026-08-08T00:00:00Z", segment: "all", value, qualityState: "current", qualityScore: 1, freshAsOf: "2026-08-08T01:00:00Z", evidenceIds: [id.replace(/.$/, "e")], importBatchId: batchId };
}
