import { requireIdentity } from "@/auth/require-identity";

export const metadata = { title: "Set up workspace" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  await requireIdentity();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Authenticated workspace</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">Your setup starts here.</h1>
      <p className="mt-4 max-w-xl leading-7 text-[var(--muted)]">Company, objective, and resource steps will be assembled in the Sprint 1 onboarding slice.</p>
      <form action="/auth/sign-out" method="post" className="mt-8">
        <button type="submit" className="min-h-11 rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-semibold">
          Sign out
        </button>
      </form>
    </main>
  );
}
