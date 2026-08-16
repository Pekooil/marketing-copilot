import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConnectorPanel } from "@/app/metrics/connector-panel";
import type { ConnectorWorkspaceState } from "@/connectors/workspace-schema";
import type { MetricsWorkspaceState } from "@/metrics/workspace-schema";

const workspaceId = "a0000000-0000-4000-8000-000000000001";
const connectionId = "a0000000-0000-4000-8000-000000000002";
const metricId = "a0000000-0000-4000-8000-000000000003";

const metricsState: MetricsWorkspaceState = {
  workspaceId,
  workspaceName: "Acme",
  definitions: [{ id: metricId, versionId: "a0000000-0000-4000-8000-000000000004", version: 1, name: "Activated accounts", businessDefinition: "Accounts reaching first value.", unit: "count", customUnit: "", aggregation: "unique", segment: "Self-serve founders", exclusions: [], timezone: "UTC", freshnessHours: 168, approvalState: "founder_approved" }],
  imports: [], snapshots: [], funnel: null,
};

const emptyConnectorState: ConnectorWorkspaceState = { workspaceId, workspaceName: "Acme", connection: null, mappings: [], runs: [] };
const healthyConnectorState: ConnectorWorkspaceState = {
  ...emptyConnectorState,
  connection: { id: connectionId, provider: "posthog", region: "us", projectId: "12345", displayName: "Production analytics", status: "healthy", scopes: ["endpoint:read"], credentialConfigured: true, lastHealthyAt: "2026-08-16T12:00:00.000Z", lastErrorCode: null },
};

const baseProps = {
  metricsState,
  startAction: vi.fn(),
  discoverAction: vi.fn(),
  saveMappingAction: vi.fn(),
  refreshAction: vi.fn(),
  revokeAction: vi.fn(),
  onConnectorState: vi.fn(),
  onMetricsState: vi.fn(),
};

describe("PostHog connector panel", () => {
  it("can restart an interrupted authorization with the pending connection prefilled", async () => {
    const pendingState: ConnectorWorkspaceState = { ...healthyConnectorState, connection: { ...healthyConnectorState.connection!, status: "pending", credentialConfigured: false } };
    render(<ConnectorPanel {...baseProps} connectorState={pendingState} />);
    expect(screen.getByRole("heading", { name: "Resume PostHog authorization" })).toBeInTheDocument();
    expect(screen.getByLabelText("PostHog project ID")).toHaveValue("12345");
    expect(screen.getByRole("button", { name: "Restart authorization" })).toBeEnabled();
  });

  it("fails closed with a safe message when secure runtime setup is unavailable", async () => {
    const user = userEvent.setup();
    const startAction = vi.fn().mockResolvedValue({ ok: false, message: "Secure connector setup is not configured for this environment." });
    render(<ConnectorPanel {...baseProps} connectorState={emptyConnectorState} startAction={startAction} />);
    await user.type(screen.getByLabelText("PostHog project ID"), "12345");
    await user.click(screen.getByRole("button", { name: "Authorize in PostHog" }));
    expect(await screen.findByText(/secure connector setup is not configured/i)).toBeInTheDocument();
    expect(startAction).toHaveBeenCalledWith(expect.objectContaining({ connection: expect.objectContaining({ provider: "posthog", projectId: "12345", region: "us" }) }));
  });

  it("discovers metadata-only Endpoints and saves a founder-approved pinned mapping", async () => {
    const user = userEvent.setup();
    const discoverAction = vi.fn().mockResolvedValue({ ok: true, endpoints: [{ name: "weekly-activation", active: true, materialized: true, version: 3, columns: ["value", "window_start", "window_end", "segment", "fresh_as_of"] }] });
    const mappedState: ConnectorWorkspaceState = { ...healthyConnectorState, mappings: [{ id: "a0000000-0000-4000-8000-000000000005", versionId: "a0000000-0000-4000-8000-000000000006", version: 1, connectionId, metricDefinitionId: metricId, endpointName: "weekly-activation", endpointVersion: 3, approvalState: "founder_approved", createdAt: "2026-08-16T12:00:00.000Z" }] };
    const saveMappingAction = vi.fn().mockResolvedValue({ ok: true, state: mappedState, message: "Mapping saved" });
    render(<ConnectorPanel {...baseProps} connectorState={healthyConnectorState} discoverAction={discoverAction} saveMappingAction={saveMappingAction} />);
    await user.click(screen.getByRole("button", { name: "Discover Endpoints" }));
    await user.selectOptions(await screen.findByLabelText("Aggregate Endpoint"), "weekly-activation");
    await user.click(screen.getByRole("button", { name: "Approve mapping" }));
    await waitFor(() => expect(saveMappingAction).toHaveBeenCalledOnce());
    expect(saveMappingAction).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 0, mapping: { metricDefinitionId: metricId, endpointName: "weekly-activation", endpointVersion: 3 } }));
  });

  it("refreshes an exact bounded window and returns updated metric state", async () => {
    const user = userEvent.setup();
    const mappedState: ConnectorWorkspaceState = { ...healthyConnectorState, mappings: [{ id: "a0000000-0000-4000-8000-000000000005", versionId: "a0000000-0000-4000-8000-000000000006", version: 1, connectionId, metricDefinitionId: metricId, endpointName: "weekly-activation", endpointVersion: 3, approvalState: "founder_approved", createdAt: "2026-08-16T12:00:00.000Z" }] };
    const refreshAction = vi.fn().mockResolvedValue({ ok: true, connectorState: mappedState, metricsState, message: "1 aggregate refreshed" });
    const onMetricsState = vi.fn();
    render(<ConnectorPanel {...baseProps} connectorState={mappedState} refreshAction={refreshAction} onMetricsState={onMetricsState} />);
    await user.type(screen.getByLabelText("Window start"), "2026-08-01");
    await user.type(screen.getByLabelText("Window end"), "2026-08-08");
    await user.click(screen.getByRole("button", { name: "Refresh 1 mapped metrics" }));
    await waitFor(() => expect(refreshAction).toHaveBeenCalledOnce());
    expect(refreshAction).toHaveBeenCalledWith(expect.objectContaining({ range: { windowStart: "2026-08-01T00:00:00.000Z", windowEnd: "2026-08-08T00:00:00.000Z", segment: "Self-serve founders" } }));
    expect(onMetricsState).toHaveBeenCalledWith(metricsState, "1 aggregate refreshed");
  });
});
