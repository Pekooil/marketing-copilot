import { calculateFunnelConversions, type FunnelObservation } from "@/metrics/funnel";
import type { MetricsWorkspaceState } from "@/metrics/workspace-schema";

export function FunnelReport({ state }: { state: MetricsWorkspaceState }) {
  if (!state.funnel) return <section className="rounded-3xl border border-dashed border-[var(--line)] bg-[var(--surface)] p-6"><p className="font-semibold">No approved funnel yet</p><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Map at least two defined metrics to see traceable conversions.</p></section>;
  const definitions = new Map(state.definitions.map((definition) => [definition.id, definition]));
  const snapshots = new Map(state.snapshots.map((snapshot) => [snapshot.metricDefinitionId, snapshot]));
  const imports = new Map(state.imports.map((batch) => [batch.id, batch]));
  const stages = state.funnel.stages.filter((stage) => stage.included).sort((a, b) => a.position - b.position);
  const observations: FunnelObservation[] = stages.map((stage) => {
    const definition = stage.metricDefinitionId ? definitions.get(stage.metricDefinitionId) : undefined;
    const snapshot = stage.metricDefinitionId ? snapshots.get(stage.metricDefinitionId) : undefined;
    return { stage: stage.stage, value: snapshot?.value ?? null, qualityState: snapshot?.qualityState ?? "unknown", windowStart: snapshot?.windowStart ?? "", windowEnd: snapshot?.windowEnd ?? "", segment: snapshot?.segment ?? definition?.segment ?? "unknown", timezone: definition?.timezone ?? "UTC", snapshotId: snapshot?.id ?? null };
  });
  const conversions = calculateFunnelConversions(observations);

  return (
    <section className="rounded-3xl border border-[var(--line)] bg-[#15221e] p-5 text-white sm:p-6" aria-labelledby="funnel-report-heading">
      <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9bb5ab]">Traceable output</p><h2 id="funnel-report-heading" className="mt-2 text-2xl font-semibold">{state.funnel.name}</h2></div><span className="font-mono text-xs text-[#9bb5ab]">v{state.funnel.version}</span></div>
      <ol className="mt-7 space-y-4">{stages.map((stage, index) => {
        const definition = stage.metricDefinitionId ? definitions.get(stage.metricDefinitionId) : undefined;
        const snapshot = stage.metricDefinitionId ? snapshots.get(stage.metricDefinitionId) : undefined;
        const batch = snapshot ? imports.get(snapshot.importBatchId) : undefined;
        const conversion = index > 0 ? conversions[index - 1] : null;
        return <li key={stage.id}>{conversion ? <div className="mb-4 ml-5 border-l border-[#4c665c] pl-5"><p className="font-mono text-lg font-semibold">{conversion.rate === null ? "—" : `${(conversion.rate * 100).toFixed(1)}%`}</p><p className="text-xs text-[#9bb5ab]">{conversion.rate === null ? unavailableLabel(conversion.reason) : `${title(conversion.fromStage)} → ${title(conversion.toStage)}`}</p></div> : null}<details className="rounded-2xl border border-[#33483f] bg-[#1c2d27] p-4" open={snapshot?.qualityState === "conflicted"}><summary className="cursor-pointer list-none"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold">{stage.label}</p><p className="mt-1 text-xs text-[#9bb5ab]">{definition?.name ?? "No metric mapped"}</p></div><div className="text-right"><p className="font-mono text-2xl font-semibold">{snapshot?.value === null || snapshot?.value === undefined ? "—" : formatValue(snapshot.value, definition?.unit)}</p><p className={`mt-1 text-[11px] font-semibold uppercase ${snapshot?.qualityState === "current" ? "text-[#85d4b5]" : "text-[#e9cc6c]"}`}>{snapshot?.qualityState ?? "unknown"}</p></div></div></summary><div className="mt-4 border-t border-[#33483f] pt-4 text-xs leading-5 text-[#b8cbc3]"><p><strong>Definition:</strong> {stage.definition}</p><p className="mt-2"><strong>Window:</strong> {snapshot ? `${snapshot.windowStart.slice(0, 10)} → ${snapshot.windowEnd.slice(0, 10)}` : "No observation"}</p><p className="mt-2"><strong>Scope:</strong> {snapshot?.segment ?? definition?.segment ?? "Unknown"} · {definition?.timezone ?? "UTC"}</p><p className="mt-2"><strong>Source:</strong> {batch ? `${batch.filename} · ${batch.sourceId.slice(0, 8)}` : "No source record"}</p><p className="mt-2"><strong>Evidence:</strong> {snapshot?.evidenceIds.map((id) => id.slice(0, 8)).join(", ") || "None"}</p></div></details></li>;
      })}</ol>
    </section>
  );
}

function unavailableLabel(reason?: "quality" | "incompatible_scope" | "zero_denominator") {
  if (reason === "incompatible_scope") return "Unavailable · windows, segments, or timezones differ";
  if (reason === "zero_denominator") return "Unavailable · observed denominator is zero";
  return "Unavailable · current observations required";
}
function formatValue(value: number, unit?: string) { return unit === "percentage" ? `${(value * 100).toFixed(1)}%` : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value); }
function title(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
