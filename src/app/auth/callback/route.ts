import { NextResponse, type NextRequest } from "next/server";

import { safeReturnPath } from "@/auth/redirect";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeReturnPath(request.nextUrl.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/auth/sign-in?error=invalid_callback", request.url));
  }

  const client = await createServerSupabaseClient();
  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/auth/sign-in?error=invalid_callback", request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}
