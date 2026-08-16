"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState, useTransition, type FormEvent } from "react";

import type {
  AnalyzeProductUrlAction,
  ProductUnderstandingState,
  VerifyProductUnderstandingAction,
} from "@/product-understanding/schema";

export function ProductUnderstanding({
  initialState,
  analyzeAction,
  verifyAction,
}: {
  initialState: ProductUnderstandingState;
  analyzeAction: AnalyzeProductUrlAction;
  verifyAction: VerifyProductUnderstandingAction;
}) {
  const [state, setState] = useState(initialState);
  const [url, setUrl] = useState(initialState.proposal?.source.url ?? "");
  const [draft, setDraft] = useState(() => draftFrom(initialState));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState(
    initialState.verifiedSnapshot
      ? "Verified context is ready"
      : initialState.proposal
        ? "Proposal ready for review"
        : "No website analyzed yet",
  );
  const [isPending, startTransition] = useTransition();
  const proposalNeedsReview =
    state.proposal && state.proposal.id !== state.verifiedSnapshot?.proposalId;

  function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setStatus("Reading the public page safely…");
    const requestId = crypto.randomUUID();
    startTransition(async () => {
      const result = await analyzeAction({
        workspaceId: state.workspaceId,
        url,
        requestId,
        idempotencyKey: `product-analysis-${requestId}`,
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setStatus(result.message);
        return;
      }
      setState(result.state);
      setDraft(draftFrom(result.state));
      setStatus("Proposal ready—review every field before verification");
      queueMicrotask(() =>
        document.querySelector<HTMLElement>("#proposal-heading")?.focus(),
      );
    });
  }

  function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state.proposal) return;
    setErrors({});
    setStatus("Saving founder verification…");
    const requestId = crypto.randomUUID();
    startTransition(async () => {
      const result = await verifyAction({
        workspaceId: state.workspaceId,
        proposalId: state.proposal!.id,
        expectedProfileVersion: state.profileVersion,
        ...draft,
        requestId,
        idempotencyKey: `product-verification-${requestId}`,
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setStatus(result.message);
        return;
      }
      setState(result.state);
      setDraft(draftFrom(result.state));
      setStatus("Verified context snapshot created");
      queueMicrotask(() =>
        document.querySelector<HTMLElement>("#snapshot-heading")?.focus(),
      );
    });
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-5 py-8 sm:px-8 lg:py-12">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] pb-5">
        <div>
          <p className="text-sm font-semibold">AI Marketing Copilot</p>
          <p aria-live="polite" className="mt-1 text-xs text-[var(--muted)]">
            {status}
          </p>
        </div>
        <nav aria-label="Workspace setup" className="flex flex-wrap gap-2">
          <Link href={"/metrics" as Route} className="min-h-11 rounded-lg px-3 py-3 text-sm font-semibold hover:bg-[var(--surface)] focus-visible:outline-2">Manual metrics</Link>
          <Link href="/onboarding" className="min-h-11 rounded-lg px-3 py-3 text-sm font-semibold hover:bg-[var(--surface)] focus-visible:outline-2">Workspace setup</Link>
        </nav>
      </header>

      <section className="grid gap-10 py-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)] lg:py-14">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Verified product context
          </p>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Show the evidence. Keep the founder in control.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--muted)]">
            Analyze one public product page for {state.workspaceName}. Extracted text is
            only a proposal until you review, correct, and verify it.
          </p>

          <form onSubmit={analyze} noValidate className="mt-9 rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-6">
            <label htmlFor="product-url" className="block text-sm font-medium">
              Public product URL
            </label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <input
                id="product-url"
                name="url"
                type="url"
                inputMode="url"
                autoComplete="url"
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setErrors((current) => ({ ...current, url: "" }));
                }}
                aria-invalid={Boolean(errors.url)}
                aria-describedby="product-url-hint product-url-error"
                placeholder="https://example.com"
                className="min-h-12 min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-white px-4 text-base focus:border-[var(--ink)] focus:outline-2"
              />
              <button
                type="submit"
                disabled={isPending}
                className="min-h-12 cursor-pointer rounded-lg bg-[#d4af37] px-5 text-sm font-semibold text-[#171717] hover:opacity-85 focus-visible:outline-2 disabled:cursor-wait disabled:opacity-60"
              >
                {isPending ? "Working…" : state.proposal ? "Analyze again" : "Analyze page"}
              </button>
            </div>
            <p id="product-url-hint" className="mt-2 text-xs leading-5 text-[var(--muted)]">
              HTTPS only. Private networks, custom ports, unsafe redirects, non-HTML files,
              and pages over 1 MB are blocked. Raw page bodies are not retained.
            </p>
            {errors.url ? <p id="product-url-error" role="alert" className="mt-2 text-sm text-[#9b2c20]">{errors.url}</p> : null}
          </form>

          {state.proposal ? (
            <section className="mt-8" aria-labelledby="proposal-heading">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Unverified proposal</p>
                  <h2 id="proposal-heading" tabIndex={-1} className="mt-2 text-2xl font-semibold tracking-[-0.025em]">Review the proposed understanding</h2>
                </div>
                <span className="rounded-full border border-[#e2d08b] bg-[#fff9df] px-3 py-1 text-xs font-semibold text-[#6c5716]">
                  Founder verification required
                </span>
              </div>

              <SourceCard state={state} />

              {proposalNeedsReview ? (
                <form onSubmit={verify} noValidate className="mt-6 space-y-6">
                  <ReviewField label="Company name" name="companyName" value={draft.companyName} error={errors.companyName} onChange={(value) => setDraft((current) => ({ ...current, companyName: value }))} />
                  <ReviewField label="Product summary" name="productSummary" value={draft.productSummary} error={errors.productSummary} multiline onChange={(value) => setDraft((current) => ({ ...current, productSummary: value }))} />
                  <ReviewField label="Target customer" name="targetCustomer" value={draft.targetCustomer} error={errors.targetCustomer} multiline optional onChange={(value) => setDraft((current) => ({ ...current, targetCustomer: value }))} />
                  {errors.form ? <p role="alert" className="text-sm text-[#9b2c20]">{errors.form}</p> : null}
                  <div className="rounded-xl border border-[#b7cec5] bg-[#eef6f2] p-4 text-sm leading-6 text-[#23483b]">
                    Verifying records your corrections as a new immutable profile version. The original proposal and its source remain unchanged for provenance.
                  </div>
                  <button type="submit" disabled={isPending} className="min-h-12 cursor-pointer rounded-lg bg-[var(--ink)] px-5 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-2 disabled:cursor-wait disabled:opacity-60">
                    {isPending ? "Saving…" : "Verify and create context snapshot"}
                  </button>
                </form>
              ) : (
                <p className="mt-6 rounded-xl border border-[#b7cec5] bg-[#eef6f2] p-4 text-sm leading-6 text-[#23483b]">
                  This proposal has been founder-verified. Analyze the page again to create a new proposal before making another verified version.
                </p>
              )}
            </section>
          ) : null}
        </div>

        <aside className="lg:pt-24">
          {state.verifiedSnapshot ? <SnapshotCard snapshot={state.verifiedSnapshot} /> : <EmptySnapshot />}
        </aside>
      </section>
    </main>
  );
}

function SourceCard({ state }: { state: ProductUnderstandingState }) {
  const proposal = state.proposal!;
  const evidence = [
    ...proposal.candidate.companyName.evidence,
    ...proposal.candidate.productSummary.evidence,
    ...(proposal.candidate.targetCustomer?.evidence ?? []),
  ];
  const uniqueEvidence = Array.from(new Map(evidence.map((item) => [`${item.selector}:${item.quote}`, item])).values());
  return (
    <div className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Source reviewed</p>
      <a href={proposal.source.url} target="_blank" rel="noreferrer" className="mt-2 block break-all font-semibold underline decoration-[var(--line)] underline-offset-4 hover:decoration-[var(--ink)]">
        {proposal.source.title || proposal.source.url}
      </a>
      <p className="mt-2 text-xs text-[var(--muted)]">Observed {new Date(proposal.source.observedAt).toLocaleString()} · Evidence ID {proposal.source.id.slice(0, 8)}</p>
      <ul className="mt-4 space-y-3">
        {uniqueEvidence.map((item) => (
          <li key={`${item.selector}:${item.quote}`} className="border-l-2 border-[var(--accent)] pl-3 text-sm leading-6">
            <span className="font-mono text-[11px] uppercase text-[var(--muted)]">{item.selector}</span>
            <q className="mt-1 block">{item.quote}</q>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReviewField({ label, name, value, error, onChange, multiline = false, optional = false }: { label: string; name: string; value: string; error?: string; onChange: (value: string) => void; multiline?: boolean; optional?: boolean }) {
  const id = `review-${name}`;
  const controlClass = "mt-2 min-h-12 w-full rounded-lg border border-[var(--line)] bg-white px-4 py-3 text-base leading-6 focus:border-[var(--ink)] focus:outline-2";
  return (
    <label htmlFor={id} className="block text-sm font-medium">
      {label}{optional ? <span className="font-normal text-[var(--muted)]"> · optional</span> : null}
      {multiline ? (
        <textarea id={id} name={name} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={`${id}-error`} rows={4} className={controlClass} />
      ) : (
        <input id={id} name={name} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={`${id}-error`} className={controlClass} />
      )}
      {error ? <span id={`${id}-error`} role="alert" className="mt-2 block text-sm text-[#9b2c20]">{error}</span> : null}
    </label>
  );
}

function SnapshotCard({ snapshot }: { snapshot: NonNullable<ProductUnderstandingState["verifiedSnapshot"]> }) {
  return (
    <section className="sticky top-8 rounded-3xl border border-[#b7cec5] bg-[#eef6f2] p-6 shadow-[0_20px_60px_rgba(23,32,29,0.07)]" aria-labelledby="snapshot-heading">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#32624f]">Verified context snapshot</p>
      <h2 id="snapshot-heading" tabIndex={-1} className="mt-3 text-2xl font-semibold tracking-[-0.03em]">{snapshot.companyProfile.companyName}</h2>
      <p className="mt-4 text-sm leading-6 text-[#315247]">{snapshot.companyProfile.productSummary}</p>
      {snapshot.companyProfile.targetCustomer ? <p className="mt-4 border-t border-[#c9ddd5] pt-4 text-sm"><strong>Target customer:</strong> {snapshot.companyProfile.targetCustomer}</p> : null}
      <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-[#c9ddd5] pt-5 text-xs">
        <div><dt className="text-[#527064]">Snapshot</dt><dd className="mt-1 font-mono">#{snapshot.sequence}</dd></div>
        <div><dt className="text-[#527064]">Profile version</dt><dd className="mt-1 font-mono">v{snapshot.profileVersion}</dd></div>
        <div className="col-span-2"><dt className="text-[#527064]">Verified</dt><dd className="mt-1">{new Date(snapshot.createdAt).toLocaleString()}</dd></div>
      </dl>
      <p className="mt-5 text-xs leading-5 text-[#527064]">Downstream work can reference this immutable snapshot and its {snapshot.sourceIds.length} source record.</p>
    </section>
  );
}

function EmptySnapshot() {
  return (
    <section className="rounded-3xl border border-dashed border-[var(--line)] bg-[var(--surface)] p-6">
      <p className="text-sm font-semibold">No verified snapshot yet</p>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Analysis alone never creates trusted context. A snapshot appears here only after founder review.</p>
    </section>
  );
}

function draftFrom(state: ProductUnderstandingState) {
  const candidate = state.proposal?.candidate;
  return {
    companyName: candidate?.companyName.value ?? state.verifiedSnapshot?.companyProfile.companyName ?? "",
    productSummary: candidate?.productSummary.value ?? state.verifiedSnapshot?.companyProfile.productSummary ?? "",
    targetCustomer: candidate?.targetCustomer?.value ?? state.verifiedSnapshot?.companyProfile.targetCustomer ?? "",
  };
}
