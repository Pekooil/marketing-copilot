"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";

import type {
  CommitCsvAction,
  MetricsWorkspaceState,
  PreviewCsvAction,
  SaveFunnelAction,
  SaveMetricDefinitionAction,
} from "@/metrics/workspace-schema";
import type { ConnectorWorkspaceState, DiscoverConnectorSourcesAction, RefreshConnectorAction, RevokeConnectorAction, SaveConnectorMappingAction, StartConnectionAction } from "@/connectors/workspace-schema";

import { CsvImportPanel } from "./csv-import-panel";
import { FunnelBuilder } from "./funnel-builder";
import { FunnelReport } from "./funnel-report";
import { MetricDefinitionPanel } from "./metric-definition-panel";
import { ConnectorPanel } from "./connector-panel";

export function MetricsWorkspace({
  initialState,
  saveDefinitionAction,
  previewCsvAction,
  commitCsvAction,
  saveFunnelAction,
  connector,
}: {
  initialState: MetricsWorkspaceState;
  saveDefinitionAction: SaveMetricDefinitionAction;
  previewCsvAction: PreviewCsvAction;
  commitCsvAction: CommitCsvAction;
  saveFunnelAction: SaveFunnelAction;
  connector?: { initialState: ConnectorWorkspaceState; startAction: StartConnectionAction; discoverAction: DiscoverConnectorSourcesAction; saveMappingAction: SaveConnectorMappingAction; refreshAction: RefreshConnectorAction; revokeAction: RevokeConnectorAction };
}) {
  const [state, setState] = useState(initialState);
  const [connectorState, setConnectorState] = useState(connector?.initialState ?? null);
  const [status, setStatus] = useState(
    state.imports.length > 0 ? "Manual metric data loaded" : "No metric data imported yet",
  );

  function update(nextState: MetricsWorkspaceState, message: string) {
    setState(nextState);
    setStatus(message);
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-5 py-8 sm:px-8 lg:py-12">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] pb-5">
        <div>
          <p className="text-sm font-semibold">AI Marketing Copilot</p>
          <p aria-live="polite" className="mt-1 text-xs text-[var(--muted)]">{status}</p>
        </div>
        <Link href={"/product-understanding" as Route} className="min-h-11 rounded-lg px-3 py-3 text-sm font-semibold hover:bg-[var(--surface)] focus-visible:outline-2">
          Product context
        </Link>
      </header>

      <section className="py-10 lg:py-14">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Manual metrics · Sprint 3</p>
        <h1 className="mt-3 max-w-4xl text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">Build a funnel where every number can explain itself.</h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-[var(--muted)]">Define what each metric means, preview a bounded CSV before it changes anything, and map only compatible observations into an approved funnel.</p>
      </section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-8">
          {connector && connectorState ? <ConnectorPanel connectorState={connectorState} metricsState={state} startAction={connector.startAction} discoverAction={connector.discoverAction} saveMappingAction={connector.saveMappingAction} refreshAction={connector.refreshAction} revokeAction={connector.revokeAction} onConnectorState={setConnectorState} onMetricsState={update} /> : null}
          <MetricDefinitionPanel state={state} action={saveDefinitionAction} onSaved={update} />
          <CsvImportPanel state={state} previewAction={previewCsvAction} commitAction={commitCsvAction} onImported={update} />
        </div>
        <div className="space-y-8">
          <FunnelBuilder state={state} action={saveFunnelAction} onSaved={update} />
          <FunnelReport state={state} />
        </div>
      </div>
    </main>
  );
}
