import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseConfig } from "@/lib/supabase/config";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  let config;

  try {
    config = getSupabaseConfig();
  } catch {
    return signInRedirect(request);
  }

  const client = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data, error } = await client.auth.getClaims();
  if (error || !data?.claims?.sub) {
    return signInRedirect(request);
  }

  return response;
}

function signInRedirect(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/auth/sign-in";
  url.search = "";
  url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/onboarding/:path*", "/workspace/:path*"],
};
