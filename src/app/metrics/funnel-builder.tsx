"use client";

import { useState, useTransition } from "react";

import type { FunnelDefinitionInput } from "@/metrics/funnel";
import type { MetricsWorkspaceState, SaveFunnelAction } from "@/metrics/workspace-schema";

type Stage = FunnelDefinitionInput["stages"][number];
const canonicalStages: Stage["stage"][] = ["awareness", "acquisition", "conversion", "activation", "retention", "revenue", "referral"];

export function FunnelBuilder({ state, action, onSaved }: { state: MetricsWorkspaceState; action: SaveFunnelAction; onSaved: (state: MetricsWorkspaceState, message: string) => void }) {
  const [name, setName] = useState(state.funnel?.name ?? "Core product funnel");
  const [stages, setStages] = useState<Stage[]>(() => state.funnel ? state.funnel.stages.map((stage) => ({ stage: stage.stage, label: stage.label, definition: stage.definition, metricDefinitionId: stage.metricDefinitionId, included: stage.included, position: stage.position })) : canonicalStages.map((stage, position) => ({ stage, label: title(stage), definition: "", metricDefinitionId: null, included: false, position })));
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function updateStage(index: number, patch: Partial<Stage>) {
    setStages((current) => current.map((stage, stageIndex) => stageIndex === index ? { ...stage, ...patch } : stage));
  }

  function move(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= stages.length) return;
    setStages((current) => {
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next.map((stage, position) => ({ ...stage, position }));
    });
  }

  function save() {
    const requestId = crypto.randomUUID();
    setMessage("Saving founder-approved mapping…");
    startTransition(async () => {
      const result = await action({ workspaceId: state.workspaceId, expectedVersion: state.funnel?.version ?? 0, funnel: { name, stages }, requestId, idempotencyKey: `funnel-${requestId}` });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      onSaved(result.state, result.message);
      setMessage(result.message);
    });
  }

  return (
    <section className="rounded-3xl border border-[var(--line)] bg-white p-5 sm:p-6" aria-labelledby="funnel-builder-heading">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">3 · Map</p>
      <h2 id="funnel-builder-heading" className="mt-2 text-2xl font-semibold">Canonical funnel</h2>
      <label className="mt-5 block text-sm font-medium">Funnel name<input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-[var(--line)] px-3 text-sm" /></label>
      <ol className="mt-6 space-y-3">{stages.map((stage, index) => <li key={stage.stage} className={`rounded-xl border p-4 ${stage.included ? "border-[#b7cec5] bg-[#f6faf8]" : "border-[var(--line)] bg-[var(--surface)]"}`}><div className="flex flex-wrap items-center gap-3"><label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={stage.included} onChange={(event) => updateStage(index, { included: event.target.checked, metricDefinitionId: event.target.checked ? stage.metricDefinitionId : null })} />{stage.label}</label><span className="ml-auto font-mono text-[11px] text-[var(--muted)]">{stage.stage}</span><button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${stage.label} earlier`} className="size-9 rounded-lg border border-[var(--line)] disabled:opacity-30">↑</button><button type="button" onClick={() => move(index, 1)} disabled={index === stages.length - 1} aria-label={`Move ${stage.label} later`} className="size-9 rounded-lg border border-[var(--line)] disabled:opacity-30">↓</button></div>{stage.included ? <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium">Stage label<input value={stage.label} onChange={(event) => updateStage(index, { label: event.target.value })} className="mt-1 min-h-10 w-full rounded-lg border border-[var(--line)] px-3 text-sm" /></label><label className="text-xs font-medium">Mapped metric<select aria-label={`${stage.label} mapped metric`} value={stage.metricDefinitionId ?? ""} onChange={(event) => updateStage(index, { metricDefinitionId: event.target.value || null })} className="mt-1 min-h-10 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm"><option value="">Choose metric</option>{state.definitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.name}</option>)}</select></label><label className="text-xs font-medium sm:col-span-2">Founder definition<textarea value={stage.definition} onChange={(event) => updateStage(index, { definition: event.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm" /></label></div> : null}</li>)}</ol>
      {message ? <p aria-live="polite" className="mt-4 text-sm text-[var(--muted)]">{message}</p> : null}
      <button type="button" onClick={save} disabled={pending || state.definitions.length < 2} className="mt-5 min-h-11 cursor-pointer rounded-lg bg-[var(--ink)] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Saving…" : state.funnel ? `Save funnel v${state.funnel.version + 1}` : "Approve funnel mapping"}</button>
      {state.definitions.length < 2 ? <p className="mt-2 text-xs text-[var(--muted)]">Define at least two metrics before mapping a funnel.</p> : null}
    </section>
  );
}

function title(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
