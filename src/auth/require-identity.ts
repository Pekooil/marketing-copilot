import "server-only";

import { resolveIdentity } from "./identity";
import { createSupabaseSessionVerifier } from "./supabase-verifier";

export async function requireIdentity() {
  return resolveIdentity(createSupabaseSessionVerifier());
}
