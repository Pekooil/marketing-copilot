import { redirect } from "next/navigation";

import { loadOnboardingState } from "@/app/onboarding/actions";
import { requireIdentity } from "@/auth/require-identity";

import { commitManualMetrics, loadMetricsWorkspaceState, previewManualMetrics, saveFunnel, saveMetricDefinition } from "./actions";
import { discoverConnectorSources, loadConnectorWorkspaceState, refreshPosthogMetrics, revokePosthogConnection, saveConnectorMapping, startPosthogConnection } from "./connector-actions";
import { MetricsWorkspace } from "./metrics-workspace";

export const metadata = { title: "Manual metrics and funnel" };
export const dynamic = "force-dynamic";

export default async function MetricsPage() {
  await requireIdentity();
  const onboarding = await loadOnboardingState();
  if (!onboarding.workspaceId) redirect("/onboarding");
  const [initialState, connectorState] = await Promise.all([loadMetricsWorkspaceState(onboarding.workspaceId), loadConnectorWorkspaceState(onboarding.workspaceId)]);
  return <MetricsWorkspace initialState={initialState} saveDefinitionAction={saveMetricDefinition} previewCsvAction={previewManualMetrics} commitCsvAction={commitManualMetrics} saveFunnelAction={saveFunnel} connector={{ initialState: connectorState, startAction: startPosthogConnection, discoverAction: discoverConnectorSources, saveMappingAction: saveConnectorMapping, refreshAction: refreshPosthogMetrics, revokeAction: revokePosthogConnection }} />;
}
