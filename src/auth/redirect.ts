const FALLBACK_PATH = "/onboarding";

export function safeReturnPath(input: string | null | undefined) {
  if (!input || !input.startsWith("/") || input.startsWith("//") || input.includes("\\")) {
    return FALLBACK_PATH;
  }

  const base = new URL("https://marketing-copilot.local");
  const target = new URL(input, base);
  if (target.origin !== base.origin) {
    return FALLBACK_PATH;
  }

  return `${target.pathname}${target.search}${target.hash}`;
}
