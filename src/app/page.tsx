const foundationChecks = [
  "Private workspace boundary",
  "One measurable objective",
  "Versioned founder constraints",
  "Every mutation attributable",
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10 sm:px-10 lg:px-14 lg:py-16">
      <header className="flex items-center justify-between gap-6 border-b border-[var(--line)] pb-5">
        <p className="text-sm font-semibold tracking-[-0.01em]">
          AI Marketing Copilot
        </p>
        <span className="rounded-full border border-[#b7cec5] bg-[#e4f0eb] px-3 py-1 text-xs font-medium text-[var(--accent-strong)]">
          Sprint 1 foundation
        </span>
      </header>

      <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.25fr_0.75fr] lg:py-24">
        <div>
          <p className="mb-5 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Secure workspace first
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.045em] sm:text-6xl">
            A calm operating system for evidence-backed growth decisions.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-[var(--muted)]">
            This foundation intentionally starts with identity, tenancy, goals,
            constraints, and an audit trail. Recommendations arrive only after
            the context can be trusted.
          </p>
        </div>

        <aside className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-7 shadow-[0_24px_70px_rgba(23,32,29,0.08)]">
          <p className="text-sm font-semibold">Foundation contract</p>
          <ul className="mt-6 space-y-4">
            {foundationChecks.map((check, index) => (
              <li key={check} className="flex items-start gap-3 text-sm">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#dcebe5] font-mono text-xs font-semibold text-[var(--accent-strong)]"
                >
                  {index + 1}
                </span>
                <span>{check}</span>
              </li>
            ))}
          </ul>
          <p className="mt-7 border-t border-[var(--line)] pt-5 text-xs leading-5 text-[var(--muted)]">
            External sending, publishing, spending, deployment, and account
            mutation remain blocked in V1.
          </p>
        </aside>
      </section>
    </main>
  );
}
