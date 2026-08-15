import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

import type { SessionVerifier } from "./identity";

export function createSupabaseSessionVerifier(): SessionVerifier {
  return {
    async verify() {
      const client = await createServerSupabaseClient();
      const [{ data: userData, error: userError }, { data: sessionData }] =
        await Promise.all([client.auth.getUser(), client.auth.getSession()]);

      const session = sessionData.session;
      if (userError || !userData.user || !session?.expires_at) {
        return null;
      }

      return {
        userId: userData.user.id,
        sessionId: null,
        expiresAt: session.expires_at,
      };
    },
  };
}
