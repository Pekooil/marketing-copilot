"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";

import type { CommitCsvAction, CsvPreviewResult, MetricsWorkspaceState, PreviewCsvAction } from "@/metrics/workspace-schema";

export function CsvImportPanel({ state, previewAction, commitAction, onImported }: { state: MetricsWorkspaceState; previewAction: PreviewCsvAction; commitAction: CommitCsvAction; onImported: (state: MetricsWorkspaceState, message: string) => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<CsvPreviewResult["preview"] | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function formData() {
    if (!formRef.current) throw new Error("Import form is unavailable.");
    return new FormData(formRef.current);
  }

  function previewFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Previewing every row…");
    startTransition(async () => {
      const result = await previewAction(formData());
      if (!result.ok) {
        setPreview(null);
        setMessage(result.message);
        return;
      }
      setPreview(result.preview);
      setMessage(result.preview.errors.length > 0 ? `${result.preview.errors.length} issues must be fixed before import.` : `${result.preview.rows.length} rows are valid and ready to import.`);
    });
  }

  function commit() {
    const requestId = crypto.randomUUID();
    const data = formData();
    data.set("requestId", requestId);
    data.set("idempotencyKey", `manual-metrics-${requestId}`);
    setMessage("Importing validated rows…");
    startTransition(async () => {
      const result = await commitAction(data);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      onImported(result.state, result.message);
      setPreview(null);
      setMessage(result.message);
      formRef.current?.reset();
    });
  }

  return (
    <section className="rounded-3xl border border-[var(--line)] bg-white p-5 sm:p-6" aria-labelledby="csv-import-heading">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">2 · Import</p>
      <h2 id="csv-import-heading" className="mt-2 text-2xl font-semibold">Preview manual data</h2>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Required columns: metric, value, window_start, window_end, segment, fresh_as_of, quality_state, source_note. Preview commits nothing.</p>
      <form ref={formRef} onSubmit={previewFile} className="mt-5">
        <input type="hidden" name="workspaceId" value={state.workspaceId} />
        <label htmlFor="metric-csv" className="block text-sm font-medium">CSV file<input id="metric-csv" name="csv" type="file" accept=".csv,text/csv" onChange={() => { setPreview(null); setMessage(""); }} className="mt-2 block min-h-11 w-full cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-1 file:font-semibold" /></label>
        <div className="mt-4 flex flex-wrap gap-3"><button type="submit" disabled={pending} className="min-h-11 cursor-pointer rounded-lg border border-[var(--ink)] px-4 text-sm font-semibold hover:bg-[var(--surface)] focus-visible:outline-2 disabled:cursor-wait disabled:opacity-60">{pending ? "Checking…" : "Preview CSV"}</button>{preview && preview.errors.length === 0 && preview.rows.length === preview.totalRows ? <button type="button" disabled={pending} onClick={commit} className="min-h-11 cursor-pointer rounded-lg bg-[#d4af37] px-4 text-sm font-semibold text-[#171717] hover:opacity-85 focus-visible:outline-2 disabled:cursor-wait disabled:opacity-60">Import {preview.rows.length} rows</button> : null}</div>
      </form>
      {message ? <p aria-live="polite" className={`mt-4 text-sm ${preview?.errors.length ? "text-[#9b2c20]" : "text-[var(--muted)]"}`}>{message}</p> : null}
      {preview ? <PreviewTable preview={preview} /> : null}
      {state.imports.length > 0 ? <div className="mt-6 border-t border-[var(--line)] pt-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Recent source records</p><ul className="mt-3 space-y-3">{state.imports.slice(0, 3).map((batch) => <li key={batch.id} className="text-sm"><div className="flex justify-between gap-3"><span className="font-medium">{batch.filename}</span><span className="text-[var(--muted)]">{batch.rowCount} rows</span></div><p className="mt-1 font-mono text-[11px] text-[var(--muted)]">Source {batch.sourceId.slice(0, 8)} · {new Date(batch.createdAt).toLocaleString()}</p></li>)}</ul></div> : null}
    </section>
  );
}

function PreviewTable({ preview }: { preview: CsvPreviewResult["preview"] }) {
  return (
    <div className="mt-5 max-h-80 overflow-auto rounded-xl border border-[var(--line)]">
      {preview.errors.length > 0 ? <ul className="divide-y divide-[var(--line)]">{preview.errors.map((error, index) => <li key={`${error.rowNumber}-${error.field}-${index}`} className="px-4 py-3 text-sm"><strong>Row {error.rowNumber} · {error.field}:</strong> {error.message}</li>)}</ul> : <table className="w-full min-w-[44rem] text-left text-xs"><thead className="sticky top-0 bg-[var(--surface)]"><tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Metric</th><th className="px-3 py-2">Value</th><th className="px-3 py-2">Quality</th><th className="px-3 py-2">Window</th><th className="px-3 py-2">Segment</th></tr></thead><tbody>{preview.rows.map((row) => <tr key={row.rowKey} className="border-t border-[var(--line)]"><td className="px-3 py-2">{row.rowNumber}</td><td className="px-3 py-2 font-medium">{row.metricName}</td><td className="px-3 py-2 font-mono">{row.value === null ? "—" : row.value}</td><td className="px-3 py-2">{row.qualityState}</td><td className="px-3 py-2">{row.windowStart.slice(0, 10)} → {row.windowEnd.slice(0, 10)}</td><td className="px-3 py-2">{row.segment}</td></tr>)}</tbody></table>}
    </div>
  );
}
