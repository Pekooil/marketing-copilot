import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6">
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
        404
      </p>
      <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">
        This page is not part of the plan.
      </h1>
      <p className="mt-4 text-[var(--muted)]">
        Return to the workspace foundation and continue from a known state.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex min-h-11 w-fit cursor-pointer items-center rounded-full bg-[var(--accent)] px-5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--accent-strong)] focus-visible:outline-2"
      >
        Return home
      </Link>
    </main>
  );
}
