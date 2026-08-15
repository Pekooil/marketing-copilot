"use client";

import { useEffect, useState, type FormEvent, type InputHTMLAttributes } from "react";

import { validateObjectiveForActivation, type ObjectiveDraft } from "@/domain/objective";
import { resourceConstraintsSchema } from "@/domain/resource-constraints";

const storageKey = "marketing-copilot:onboarding-draft:v1";
const steps = ["Company", "Objective", "Resources", "Review"] as const;

interface Draft {
  workspaceName: string;
  companyName: string;
  productSummary: string;
  metricName: string;
  metricDefinition: string;
  direction: "increase" | "decrease";
  targetValue: string;
  baselineState: "known" | "unknown";
  baselineValue: string;
  deadline: string;
  targetSegment: string;
  rationale: string;
  founderHours: string;
  cashBudget: string;
  currency: string;
  riskTolerance: "low" | "medium" | "high";
  prohibitedTactics: string;
  brandRules: string;
}

const emptyDraft: Draft = {
  workspaceName: "",
  companyName: "",
  productSummary: "",
  metricName: "",
  metricDefinition: "",
  direction: "increase",
  targetValue: "",
  baselineState: "unknown",
  baselineValue: "",
  deadline: "",
  targetSegment: "",
  rationale: "",
  founderHours: "5",
  cashBudget: "100",
  currency: "USD",
  riskTolerance: "low",
  prohibitedTactics: "",
  brandRules: "",
};

export function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(emptyDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("Draft not saved yet");

  useEffect(() => {
    const saved = window.sessionStorage.getItem(storageKey);
    if (!saved) return;
    let active = true;
    try {
      const parsed = JSON.parse(saved) as { draft: Draft; step: number };
      queueMicrotask(() => {
        if (!active) return;
        setDraft({ ...emptyDraft, ...parsed.draft });
        setStep(Math.min(Math.max(parsed.step, 0), steps.length - 1));
        setStatus("Draft resumed from this browser session");
      });
    } catch {
      window.sessionStorage.removeItem(storageKey);
    }
    return () => {
      active = false;
    };
  }, []);

  function update(name: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: "" }));
  }

  function save(nextStep = step) {
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify({ draft, step: nextStep }));
      setStatus("Draft saved in this browser session");
      return true;
    } catch {
      setStatus("Draft could not be saved. Your entries are still on this page.");
      return false;
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateStep(step, draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    const nextStep = Math.min(step + 1, steps.length - 1);
    if (!save(nextStep)) return;
    setStep(nextStep);
    queueMicrotask(() => document.querySelector<HTMLElement>("#onboarding-heading")?.focus());
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-5 py-8 sm:px-8 lg:py-12">
      <header className="flex items-center justify-between border-b border-[var(--line)] pb-5">
        <div>
          <p className="text-sm font-semibold">AI Marketing Copilot</p>
          <p aria-live="polite" className="mt-1 text-xs text-[var(--muted)]">{status}</p>
        </div>
        <form action="/auth/sign-out" method="post">
          <button type="submit" className="min-h-11 cursor-pointer rounded-lg px-3 text-sm font-semibold transition-colors duration-200 hover:bg-[var(--surface)] focus-visible:outline-2">Sign out</button>
        </form>
      </header>

      <div className="grid gap-10 py-10 lg:grid-cols-[14rem_minmax(0,1fr)] lg:py-14">
        <nav aria-label="Onboarding progress">
          <ol className="grid grid-cols-4 gap-2 lg:grid-cols-1">
            {steps.map((label, index) => (
              <li key={label} aria-current={index === step ? "step" : undefined} className={`flex min-w-0 items-center gap-3 border-t-2 px-1 pt-3 text-xs font-medium sm:text-sm lg:border-l-2 lg:border-t-0 lg:px-4 lg:py-3 ${index === step ? "border-[var(--accent)] text-[var(--ink)]" : "border-[var(--line)] text-[var(--muted)]"}`}>
                <span aria-hidden="true" className={`hidden size-6 shrink-0 items-center justify-center rounded-full text-xs sm:flex ${index < step ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "bg-[var(--surface)]"}`}>{index < step ? <CheckIcon /> : index + 1}</span>
                <span className="truncate">{label}</span>
              </li>
            ))}
          </ol>
        </nav>

        <section className="max-w-2xl">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Step {step + 1} of {steps.length}</p>
          <h1 id="onboarding-heading" tabIndex={-1} className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{headingFor(step)}</h1>
          <p className="mt-4 max-w-xl leading-7 text-[var(--muted)]">{descriptionFor(step)}</p>

          {step < 3 ? (
            <form onSubmit={submit} noValidate className="mt-9 space-y-6">
              {step === 0 ? <CompanyStep draft={draft} errors={errors} update={update} /> : null}
              {step === 1 ? <ObjectiveStep draft={draft} errors={errors} update={update} /> : null}
              {step === 2 ? <ResourcesStep draft={draft} errors={errors} update={update} /> : null}
              <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-6">
                <button type="submit" className="min-h-11 cursor-pointer rounded-lg bg-[#d4af37] px-5 text-sm font-semibold text-[#171717] transition-opacity duration-200 hover:opacity-85 focus-visible:outline-2">Save and continue</button>
                <button type="button" onClick={() => save()} className="min-h-11 cursor-pointer rounded-lg border border-[var(--ink)] px-5 text-sm font-semibold transition-colors duration-200 hover:bg-[var(--surface)] focus-visible:outline-2">Save for later</button>
                {step > 0 ? <button type="button" onClick={() => setStep((current) => current - 1)} className="min-h-11 cursor-pointer px-3 text-sm font-semibold text-[var(--muted)] hover:text-[var(--ink)] focus-visible:outline-2">Back</button> : null}
              </div>
            </form>
          ) : (
            <Review draft={draft} onBack={() => setStep(2)} onActivate={() => { save(3); setStatus("Setup ready for server activation"); }} />
          )}
        </section>
      </div>
    </main>
  );
}

type StepProps = { draft: Draft; errors: Record<string, string>; update: (name: keyof Draft, value: string) => void };

function Field({ label, name, value, onChange, error, type = "text", hint, ...input }: { label: string; name: keyof Draft; value: string; onChange: (name: keyof Draft, value: string) => void; error?: string; type?: string; hint?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "value" | "onChange" | "type">) {
  const id = `field-${name}`;
  return <label htmlFor={id} className="block text-sm font-medium">{label}<input {...input} id={id} name={name} value={value} type={type} onChange={(event) => onChange(name, event.target.value)} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint ${id}-error`} className="mt-2 min-h-12 w-full rounded-lg border border-[var(--line)] bg-white px-4 text-base transition-colors duration-200 focus:border-[var(--ink)] focus:outline-2" />{hint ? <span id={`${id}-hint`} className="mt-2 block text-xs leading-5 text-[var(--muted)]">{hint}</span> : null}{error ? <span id={`${id}-error`} role="alert" className="mt-2 block text-sm text-[#9b2c20]">{error}</span> : null}</label>;
}

function CompanyStep({ draft, errors, update }: StepProps) {
  return <><Field label="Workspace name" name="workspaceName" value={draft.workspaceName} onChange={update} error={errors.workspaceName} autoComplete="organization" hint="Your private boundary for goals, evidence, and decisions." /><Field label="Company name" name="companyName" value={draft.companyName} onChange={update} error={errors.companyName} /><Field label="What does the product help customers do?" name="productSummary" value={draft.productSummary} onChange={update} error={errors.productSummary} hint="A short founder-provided description is enough. URL analysis comes later." /></>;
}

function ObjectiveStep({ draft, errors, update }: StepProps) {
  return <><Field label="Metric name" name="metricName" value={draft.metricName} onChange={update} error={errors.metricName} placeholder="Weekly activated accounts" /><Field label="Metric definition" name="metricDefinition" value={draft.metricDefinition} onChange={update} error={errors.metricDefinition} hint="State exactly what counts so the number stays trustworthy." /><div className="grid gap-5 sm:grid-cols-2"><label className="block text-sm font-medium">Direction<select value={draft.direction} onChange={(event) => update("direction", event.target.value)} className="mt-2 min-h-12 w-full cursor-pointer rounded-lg border border-[var(--line)] bg-white px-4 text-base"><option value="increase">Increase</option><option value="decrease">Decrease</option></select></label><Field label="Target value" name="targetValue" value={draft.targetValue} onChange={update} error={errors.targetValue} type="number" step="any" /></div><fieldset><legend className="text-sm font-medium">Current baseline</legend><div className="mt-2 flex gap-5">{(["unknown", "known"] as const).map((value) => <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"><input type="radio" name="baselineState" checked={draft.baselineState === value} onChange={() => update("baselineState", value)} />{value === "unknown" ? "Unknown" : "Known"}</label>)}</div></fieldset>{draft.baselineState === "known" ? <Field label="Baseline value" name="baselineValue" value={draft.baselineValue} onChange={update} error={errors.baselineValue} type="number" step="any" hint="Enter 0 when zero is the observed value." /> : null}<Field label="Deadline" name="deadline" value={draft.deadline} onChange={update} error={errors.deadline} type="date" /><Field label="Target segment" name="targetSegment" value={draft.targetSegment} onChange={update} error={errors.targetSegment} /><Field label="Why does this matter now?" name="rationale" value={draft.rationale} onChange={update} error={errors.rationale} /></>;
}

function ResourcesStep({ draft, errors, update }: StepProps) {
  return <><div className="grid gap-5 sm:grid-cols-2"><Field label="Founder hours per week" name="founderHours" value={draft.founderHours} onChange={update} error={errors.founderHours} type="number" min="0" step="0.25" /><Field label="Cash budget" name="cashBudget" value={draft.cashBudget} onChange={update} error={errors.cashBudget} type="number" min="0" step="0.01" /></div><Field label="Currency" name="currency" value={draft.currency} onChange={update} error={errors.currency} maxLength={3} /><label className="block text-sm font-medium">Risk tolerance<select value={draft.riskTolerance} onChange={(event) => update("riskTolerance", event.target.value)} className="mt-2 min-h-12 w-full cursor-pointer rounded-lg border border-[var(--line)] bg-white px-4 text-base"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><Field label="Prohibited tactics" name="prohibitedTactics" value={draft.prohibitedTactics} onChange={update} error={errors.prohibitedTactics} hint="Comma-separated. Sending, publishing, spending, deployment, and sensitive actions remain blocked globally." /><Field label="Brand and claim rules" name="brandRules" value={draft.brandRules} onChange={update} error={errors.brandRules} hint="Comma-separated rules such as ‘No unsupported superlatives’." /></>;
}

function Review({ draft, onBack, onActivate }: { draft: Draft; onBack: () => void; onActivate: () => void }) {
  return <div className="mt-9 space-y-5"><ReviewRow label="Company" value={`${draft.companyName} · ${draft.productSummary}`} /><ReviewRow label="Objective" value={`${draft.direction} ${draft.metricName} to ${draft.targetValue} by ${draft.deadline}`} /><ReviewRow label="Operating envelope" value={`${draft.founderHours} hours/week · ${draft.currency} ${draft.cashBudget} · ${draft.riskTolerance} risk`} /><div className="rounded-xl border border-[#e2d08b] bg-[#fff9df] p-4 text-sm leading-6"><strong>Safety boundary:</strong> This setup cannot authorize external sending, publishing, spending, deployment, account changes, or irreversible actions.</div><div className="flex flex-wrap gap-3 border-t border-[var(--line)] pt-6"><button type="button" onClick={onActivate} className="min-h-11 cursor-pointer rounded-lg bg-[#d4af37] px-5 text-sm font-semibold text-[#171717] transition-opacity duration-200 hover:opacity-85 focus-visible:outline-2">Activate objective</button><button type="button" onClick={onBack} className="min-h-11 cursor-pointer rounded-lg border border-[var(--ink)] px-5 text-sm font-semibold hover:bg-[var(--surface)] focus-visible:outline-2">Back</button></div></div>;
}

function ReviewRow({ label, value }: { label: string; value: string }) { return <div className="border-b border-[var(--line)] pb-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{label}</p><p className="mt-2 leading-7">{value}</p></div>; }
function CheckIcon() { return <svg aria-hidden="true" viewBox="0 0 20 20" className="size-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="m4 10 4 4 8-8" /></svg>; }
function headingFor(step: number) { return ["Name the workspace and company.", "Make the goal measurable.", "Set a realistic operating envelope.", "Review before activation."][step]; }
function descriptionFor(step: number) { return ["Start with founder-provided facts. Nothing here is inferred from a website.", "A precise metric and deadline let the copilot distinguish progress from activity.", "These limits shape every recommendation and never override the global safety policy.", "Confirm the context the copilot will use. You can return and edit any step."][step]; }

function validateStep(step: number, draft: Draft) {
  if (step === 0) {
    return Object.fromEntries(Object.entries({ workspaceName: draft.workspaceName.trim() ? "" : "Enter a workspace name.", companyName: draft.companyName.trim() ? "" : "Enter a company name.", productSummary: draft.productSummary.trim() ? "" : "Describe the product briefly." }).filter(([, value]) => value));
  }
  if (step === 1) {
    const objective: ObjectiveDraft = { metricName: draft.metricName, metricDefinition: draft.metricDefinition, direction: draft.direction, targetValue: draft.targetValue === "" ? undefined : Number(draft.targetValue), baselineState: draft.baselineState, baselineValue: draft.baselineState === "unknown" ? null : draft.baselineValue === "" ? null : Number(draft.baselineValue), deadline: draft.deadline, targetSegment: draft.targetSegment, rationale: draft.rationale };
    try { validateObjectiveForActivation(objective); return {}; } catch (error) { return "fieldErrors" in (error as object) ? (error as { fieldErrors: Record<string, string> }).fieldErrors : { form: "Review the objective." }; }
  }
  const tactics = splitList(draft.prohibitedTactics);
  const rules = splitList(draft.brandRules);
  const result = resourceConstraintsSchema.safeParse({ founderMinutesPerWeek: Number(draft.founderHours) * 60, cashBudgetMinor: Math.round(Number(draft.cashBudget) * 100), currency: draft.currency.toUpperCase(), riskTolerance: draft.riskTolerance, prohibitedTactics: tactics, brandRules: rules, audienceLimits: [], geographyLimits: [], approvalPreferences: { requirePreparationApproval: true, requestedActionClasses: ["C"] } });
  if (result.success) return {};
  const flattened = result.error.flatten().fieldErrors;
  return { founderHours: flattened.founderMinutesPerWeek?.[0] ?? "", cashBudget: flattened.cashBudgetMinor?.[0] ?? "", currency: flattened.currency?.[0] ?? "", prohibitedTactics: flattened.prohibitedTactics?.[0] ?? "", brandRules: flattened.brandRules?.[0] ?? "" };
}

function splitList(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
