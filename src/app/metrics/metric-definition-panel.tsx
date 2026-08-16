"use client";

import { useState, useTransition, type FormEvent } from "react";

import type { MetricDefinitionInput } from "@/metrics/definition";
import type { MetricsWorkspaceState, SaveMetricDefinitionAction } from "@/metrics/workspace-schema";

const emptyDefinition: MetricDefinitionInput = {
  name: "",
  businessDefinition: "",
  unit: "count",
  customUnit: "",
  aggregation: "count",
  segment: "All users",
  exclusions: [],
  timezone: "UTC",
  freshnessHours: 168,
};

export function MetricDefinitionPanel({ state, action, onSaved }: { state: MetricsWorkspaceState; action: SaveMetricDefinitionAction; onSaved: (state: MetricsWorkspaceState, message: string) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MetricDefinitionInput>(emptyDefinition);
  const [exclusions, setExclusions] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const editing = state.definitions.find((definition) => definition.id === editingId);

  function selectDefinition(id: string) {
    const definition = state.definitions.find((item) => item.id === id);
    setEditingId(definition?.id ?? null);
    setForm(definition ? {
      name: definition.name,
      businessDefinition: definition.businessDefinition,
      unit: definition.unit,
      customUnit: definition.customUnit,
      aggregation: definition.aggregation,
      segment: definition.segment,
      exclusions: definition.exclusions,
      timezone: definition.timezone,
      freshnessHours: definition.freshnessHours,
    } : emptyDefinition);
    setExclusions(definition?.exclusions.join(", ") ?? "");
    setErrors({});
  }

  function update<K extends keyof MetricDefinitionInput>(key: K, value: MetricDefinitionInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [`definition.${key}`]: "" }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestId = crypto.randomUUID();
    startTransition(async () => {
      const result = await action({
        workspaceId: state.workspaceId,
        metricDefinitionId: editingId,
        expectedVersion: editing?.version ?? 0,
        definition: { ...form, exclusions: exclusions.split(",").map((item) => item.trim()).filter(Boolean) },
        requestId,
        idempotencyKey: `metric-definition-${requestId}`,
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? { form: result.message });
        return;
      }
      onSaved(result.state, result.message);
      selectDefinition("");
    });
  }

  return (
    <section className="rounded-3xl border border-[var(--line)] bg-white p-5 sm:p-6" aria-labelledby="metric-definition-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">1 · Define</p><h2 id="metric-definition-heading" className="mt-2 text-2xl font-semibold">Metric contracts</h2></div>
        <label className="text-xs font-medium text-[var(--muted)]">Edit existing<select aria-label="Edit existing metric" value={editingId ?? ""} onChange={(event) => selectDefinition(event.target.value)} className="mt-1 block min-h-10 rounded-lg border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)]"><option value="">New metric</option>{state.definitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.name} · v{definition.version}</option>)}</select></label>
      </div>
      <form onSubmit={submit} noValidate className="mt-6 space-y-5">
        <TextField label="Metric name" value={form.name} onChange={(value) => update("name", value)} error={errors["definition.name"]} placeholder="Weekly activated accounts" />
        <TextField label="Business definition" value={form.businessDefinition} onChange={(value) => update("businessDefinition", value)} error={errors["definition.businessDefinition"]} multiline hint="State exactly what counts and when." />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Unit" value={form.unit} onChange={(value) => update("unit", value as MetricDefinitionInput["unit"])} options={["count", "percentage", "currency_minor", "seconds", "custom"]} />
          <SelectField label="Aggregation" value={form.aggregation} onChange={(value) => update("aggregation", value as MetricDefinitionInput["aggregation"])} options={["count", "sum", "average", "unique", "ratio", "latest"]} />
        </div>
        {form.unit === "custom" ? <TextField label="Custom unit" value={form.customUnit} onChange={(value) => update("customUnit", value)} error={errors["definition.customUnit"]} /> : null}
        <TextField label="Segment" value={form.segment} onChange={(value) => update("segment", value)} error={errors["definition.segment"]} />
        <TextField label="Exclusions" value={exclusions} onChange={setExclusions} hint="Comma-separated, such as internal accounts, test users." />
        <div className="grid gap-4 sm:grid-cols-2"><TextField label="IANA timezone" value={form.timezone} onChange={(value) => update("timezone", value)} error={errors["definition.timezone"]} placeholder="UTC" /><TextField label="Freshness threshold (hours)" value={String(form.freshnessHours)} onChange={(value) => update("freshnessHours", Number(value))} error={errors["definition.freshnessHours"]} type="number" min="1" max="8760" /></div>
        {errors.form ? <p role="alert" className="text-sm text-[#9b2c20]">{errors.form}</p> : null}
        <button type="submit" disabled={pending} className="min-h-11 cursor-pointer rounded-lg bg-[var(--ink)] px-5 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-2 disabled:cursor-wait disabled:opacity-60">{pending ? "Saving…" : editing ? `Save metric v${editing.version + 1}` : "Create metric definition"}</button>
      </form>
      {state.definitions.length > 0 ? <ul className="mt-6 divide-y divide-[var(--line)] border-t border-[var(--line)]">{state.definitions.map((definition) => <li key={definition.id} className="py-4"><div className="flex items-center justify-between gap-3"><p className="font-semibold">{definition.name}</p><span className="rounded-full bg-[#eef6f2] px-2 py-1 text-[11px] font-semibold text-[#32624f]">Approved · v{definition.version}</span></div><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{definition.businessDefinition} · {definition.segment} · {definition.timezone}</p></li>)}</ul> : null}
    </section>
  );
}

function TextField({ label, value, onChange, error, hint, multiline = false, ...input }: { label: string; value: string; onChange: (value: string) => void; error?: string; hint?: string; multiline?: boolean; placeholder?: string; type?: string; min?: string; max?: string }) {
  const id = `metric-${label.toLowerCase().replace(/\W+/g, "-")}`;
  const className = "mt-2 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm focus:border-[var(--ink)] focus:outline-2";
  return <div><label htmlFor={id} className="block text-sm font-medium">{label}</label>{multiline ? <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} rows={3} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint ${id}-error`} className={className} /> : <input {...input} id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint ${id}-error`} className={className} />}{hint ? <span id={`${id}-hint`} className="mt-1 block text-xs leading-5 text-[var(--muted)]">{hint}</span> : null}{error ? <span id={`${id}-error`} role="alert" className="mt-1 block text-xs text-[#9b2c20]">{error}</span> : null}</div>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <label className="block text-sm font-medium">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm">{options.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</select></label>;
}
