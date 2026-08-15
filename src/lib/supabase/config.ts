import { z } from "zod";

const supabaseConfigSchema = z.object({
  url: z.url(),
  publishableKey: z.string().trim().min(1),
});

export class AuthConfigurationError extends Error {
  readonly code = "AUTH_CONFIGURATION_ERROR";
}

export function getSupabaseConfig() {
  const result = supabaseConfigSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  if (!result.success) {
    throw new AuthConfigurationError("Authentication is not configured for this environment.");
  }

  return result.data;
}
