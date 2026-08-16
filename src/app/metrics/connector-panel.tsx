"use client";

import { useState, useTransition, type FormEvent } from "react";

import type { ConnectorEndpoint } from "@/connectors/contracts";
import type { ConnectorWorkspaceState, DiscoverConnectorSourcesAction, RefreshConnectorAction, RevokeConnectorAction, SaveConnectorMappingAction, StartConnectionAction } from "@/connectors/workspace-schema";
import type { MetricsWorkspaceState } from "@/metrics/workspace-schema";

export function ConnectorPanel({ connectorState, metricsState, startAction, discoverAction, saveMappingAction, refreshAction, revokeAction, onConnectorState, onMetricsState }: {
  connectorState: ConnectorWorkspaceState;
  metricsState: MetricsWorkspaceState;
  startAction: StartConnectionAction;
  discoverAction: DiscoverConnectorSourcesAction;
  saveMappingAction: SaveConnectorMappingAction;
  refreshAction: RefreshConnectorAction;
  revokeAction: RevokeConnectorAction;
  onConnectorState: (state: ConnectorWorkspaceState) => void;
  onMetricsState: (state: MetricsWorkspaceState, message: string) => void;
}) {
  const [endpoints, setEndpoints] = useState<ConnectorEndpoint[]>([]);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const connection = connectorState.connection;

  if (!connection || connection.status === "revoked" || connection.status === "pending") {
    return <ConnectionForm workspaceId={connectorState.workspaceId} action={startAction} pending={pending} startTransition={startTransition} message={message} setMessage={setMessage} initialConnection={connection?.status === "pending" ? connection : undefined} />;
  }
  const activeConnection = connection;

  function discover() {
    setMessage("Loading approved aggregate Endpoints…");
    startTransition(async () => {
      const result = await discoverAction({ workspaceId: connectorState.workspaceId, connectionId: activeConnection.id });
      if (!result.ok) return setMessage(result.message);
      setEndpoints(result.endpoints);
      setMessage(`${result.endpoints.length} active Endpoints available. Query text and creator data were not retained.`);
    });
  }

  function saveMapping(metricDefinitionId: string, endpointName: string) {
    const endpoint = endpoints.find((item) => item.name === endpointName);
    if (!endpoint) return setMessage("Choose an active Endpoint.");
    const existing = connectorState.mappings.find((item) => item.metricDefinitionId === metricDefinitionId);
    const requestId = crypto.randomUUID();
    startTransition(async () => {
      const result = await saveMappingAction({ workspaceId: connectorState.workspaceId, connectionId: activeConnection.id, expectedVersion: existing?.version ?? 0, mapping: { metricDefinitionId, endpointName: endpoint.name, endpointVersion: endpoint.version }, requestId, idempotencyKey: `connector-mapping-${requestId}` });
      if (!result.ok) return setMessage(result.message);
      onConnectorState(result.state);
      setMessage(result.message);
    });
  }

  function refresh(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const start = String(form.get("windowStart"));
    const end = String(form.get("windowEnd"));
    const segment = String(form.get("segment"));
    const requestId = crypto.randomUUID();
    setMessage("Refreshing pinned aggregate Endpoints…");
    startTransition(async () => {
      const result = await refreshAction({ workspaceId: connectorState.workspaceId, connectionId: activeConnection.id, range: { windowStart: `${start}T00:00:00.000Z`, windowEnd: `${end}T00:00:00.000Z`, segment }, requestId });
      if (!result.ok) {
        if (result.connectorState) onConnectorState(result.connectorState);
        if (result.metricsState) onMetricsState(result.metricsState, result.message);
        return setMessage(result.message);
      }
      onConnectorState(result.connectorState);
      onMetricsState(result.metricsState, result.message);
      setMessage(result.message);
    });
  }

  function revoke() {
    const requestId = crypto.randomUUID();
    startTransition(async () => {
      const result = await revokeAction({ workspaceId: connectorState.workspaceId, connectionId: activeConnection.id, requestId });
      if (!result.ok) return setMessage(result.message);
      onConnectorState(result.state);
      setEndpoints([]);
      setMessage(result.message);
    });
  }

  return (
    <section className="rounded-3xl border border-[var(--line)] bg-white p-5 sm:p-6" aria-labelledby="connector-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Live source · Sprint 4</p><h2 id="connector-heading" className="mt-2 text-2xl font-semibold">PostHog aggregate Endpoints</h2><p className="mt-2 text-sm text-[var(--muted)]">{connection.displayName} · project {connection.projectId} · {connection.region.toUpperCase()}</p></div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${connection.status === "healthy" ? "bg-[#e4f0eb] text-[#32624f]" : "bg-[#fff4d6] text-[#775a00]"}`}>{connection.status}</span>
      </div>
      <p className="mt-4 text-sm leading-6 text-[var(--muted)]">Read-only scope: <code>endpoint:read</code>. No raw events, persons, or arbitrary queries.</p>
      {connection.lastErrorCode ? <p role="alert" className="mt-4 rounded-xl bg-[#fff0ed] p-4 text-sm text-[#8a2d22]">Last refresh: {connection.lastErrorCode}. Existing metrics remain visible with their quality state.</p> : null}
      <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={discover} disabled={pending || !connection.credentialConfigured} className="min-h-11 rounded-lg border border-[var(--ink)] px-4 text-sm font-semibold disabled:opacity-50">Discover Endpoints</button><button type="button" onClick={revoke} disabled={pending || !connection.credentialConfigured} className="min-h-11 rounded-lg px-4 text-sm font-semibold text-[#8a2d22] disabled:opacity-50">Revoke access</button></div>
      {endpoints.length > 0 ? <div className="mt-6 border-t border-[var(--line)] pt-5"><h3 className="font-semibold">Founder-approved mappings</h3><div className="mt-4 space-y-4">{metricsState.definitions.map((definition) => <MappingRow key={definition.id} definition={definition} endpoints={endpoints} existing={connectorState.mappings.find((item) => item.metricDefinitionId === definition.id)} disabled={pending} onSave={saveMapping} />)}</div></div> : null}
      {connectorState.mappings.length > 0 ? <form onSubmit={refresh} className="mt-6 grid gap-4 border-t border-[var(--line)] pt-5 sm:grid-cols-3"><label className="text-sm font-medium">Window start<input required name="windowStart" type="date" className="mt-2 min-h-11 w-full rounded-lg border border-[var(--line)] px-3" /></label><label className="text-sm font-medium">Window end<input required name="windowEnd" type="date" className="mt-2 min-h-11 w-full rounded-lg border border-[var(--line)] px-3" /></label><label className="text-sm font-medium">Exact segment<input required name="segment" defaultValue={metricsState.definitions[0]?.segment ?? "All users"} className="mt-2 min-h-11 w-full rounded-lg border border-[var(--line)] px-3" /></label><button type="submit" disabled={pending || !connection.credentialConfigured} className="min-h-11 rounded-lg bg-[var(--ink)] px-5 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-3">{pending ? "Refreshing…" : `Refresh ${connectorState.mappings.length} mapped metrics`}</button></form> : null}
      {message ? <p aria-live="polite" className="mt-4 text-sm text-[var(--muted)]">{message}</p> : null}
      {connectorState.runs.length > 0 ? <div className="mt-6 border-t border-[var(--line)] pt-5"><h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Recent refreshes</h3><ul className="mt-3 space-y-2">{connectorState.runs.slice(0, 5).map((run) => <li key={run.id} className="flex flex-wrap justify-between gap-2 text-sm"><span>{run.windowStart.slice(0, 10)} → {run.windowEnd.slice(0, 10)} · {run.segment}</span><span className="font-mono text-xs">{run.status} · {run.succeededCount}/{run.metricCount}</span></li>)}</ul></div> : null}
    </section>
  );
}

function ConnectionForm({ workspaceId, action, pending, startTransition, message, setMessage, initialConnection }: { workspaceId: string; action: StartConnectionAction; pending: boolean; startTransition: (callback: () => Promise<void>) => void; message: string; setMessage: (value: string) => void; initialConnection?: NonNullable<ConnectorWorkspaceState["connection"]> }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const requestId = crypto.randomUUID();
    setMessage("Preparing secure PostHog authorization…");
    startTransition(async () => {
      const result = await action({ workspaceId, connection: { provider: "posthog", region: String(form.get("region")) as "us" | "eu", projectId: String(form.get("projectId")), displayName: String(form.get("displayName")) }, requestId, idempotencyKey: `posthog-connect-${requestId}` });
      if (!result.ok) return setMessage(result.message);
      window.location.assign(result.authorizationUrl);
    });
  }
  return <section className="rounded-3xl border border-[var(--line)] bg-white p-5 sm:p-6" aria-labelledby="connector-heading"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Live source · Sprint 4</p><h2 id="connector-heading" className="mt-2 text-2xl font-semibold">{initialConnection ? "Resume PostHog authorization" : "Connect PostHog"}</h2><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Authorize only <code>endpoint:read</code>. You create the aggregate Endpoints in PostHog and approve every metric mapping here.</p>{initialConnection ? <p className="mt-3 rounded-xl bg-[#fff4d6] p-4 text-sm">The previous authorization did not finish. Restarting replaces only the pending attempt.</p> : null}<form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Connection name<input required name="displayName" defaultValue={initialConnection?.displayName ?? "Production analytics"} className="mt-2 min-h-11 w-full rounded-lg border border-[var(--line)] px-3" /></label><label className="text-sm font-medium">PostHog project ID<input required name="projectId" inputMode="numeric" pattern="[1-9][0-9]*" defaultValue={initialConnection?.projectId} className="mt-2 min-h-11 w-full rounded-lg border border-[var(--line)] px-3" /></label><label className="text-sm font-medium">Cloud region<select name="region" defaultValue={initialConnection?.region ?? "us"} className="mt-2 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3"><option value="us">US Cloud</option><option value="eu">EU Cloud</option></select></label><button type="submit" disabled={pending} className="min-h-11 self-end rounded-lg bg-[var(--ink)] px-5 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Preparing…" : initialConnection ? "Restart authorization" : "Authorize in PostHog"}</button></form>{message ? <p aria-live="polite" className="mt-4 text-sm text-[var(--muted)]">{message}</p> : null}</section>;
}

function MappingRow({ definition, endpoints, existing, disabled, onSave }: { definition: MetricsWorkspaceState["definitions"][number]; endpoints: ConnectorEndpoint[]; existing?: ConnectorWorkspaceState["mappings"][number]; disabled: boolean; onSave: (metricDefinitionId: string, endpointName: string) => void }) {
  const [selected, setSelected] = useState(existing?.endpointName ?? "");
  return <div className="grid gap-3 rounded-xl border border-[var(--line)] p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><div><p className="text-sm font-semibold">{definition.name}</p><p className="mt-1 text-xs text-[var(--muted)]">{definition.segment} · {definition.timezone}</p></div><label className="text-xs font-medium">Aggregate Endpoint<select value={selected} onChange={(event) => setSelected(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm"><option value="">Choose Endpoint</option>{endpoints.map((endpoint) => <option key={`${endpoint.name}-${endpoint.version}`} value={endpoint.name}>{endpoint.name} · v{endpoint.version}{endpoint.materialized ? " · materialized" : ""}</option>)}</select></label><button type="button" disabled={disabled || !selected} onClick={() => onSave(definition.id, selected)} className="min-h-10 rounded-lg border border-[var(--ink)] px-4 text-sm font-semibold disabled:opacity-40">{existing ? `Save v${existing.version + 1}` : "Approve mapping"}</button></div>;
}
