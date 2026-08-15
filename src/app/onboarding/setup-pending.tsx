export function SetupPending() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Setup paused</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">Your workspace is safe.</h1>
      <p className="mt-4 leading-7 text-[var(--muted)]">Onboarding is temporarily unavailable. No saved company, objective, or resource data has been removed.</p>
      <form action="/auth/sign-out" method="post" className="mt-8"><button type="submit" className="min-h-11 cursor-pointer rounded-lg border border-[var(--ink)] px-5 text-sm font-semibold">Sign out</button></form>
    </main>
  );
}
