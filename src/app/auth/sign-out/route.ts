import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const client = await createServerSupabaseClient();
  await client.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/auth/sign-in", request.url), 303);
}
