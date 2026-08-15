import { signIn } from "./actions";

export const metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Private beta</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">Sign in to your workspace</h1>
      <p className="mt-4 text-sm leading-6 text-[var(--muted)]">Your session is verified on the server before any workspace data is read or changed.</p>
      {params.error ? (
        <p role="alert" className="mt-6 rounded-xl border border-[#d8b9ad] bg-[#f8ebe6] p-3 text-sm text-[#713f32]">
          We could not sign you in. Check your details and try again.
        </p>
      ) : null}
      <form action={signIn} className="mt-8 space-y-5">
        <input type="hidden" name="next" value={safeFormValue(params.next)} />
        <label className="block text-sm font-medium">
          Email
          <input name="email" type="email" autoComplete="email" required className="mt-2 min-h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3" />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input name="password" type="password" autoComplete="current-password" minLength={8} required className="mt-2 min-h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3" />
        </label>
        <button type="submit" className="min-h-11 w-full rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]">
          Sign in
        </button>
      </form>
    </main>
  );
}

function safeFormValue(value: string | undefined) {
  return value?.slice(0, 512) ?? "";
}
