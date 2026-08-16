import { NextResponse } from "next/server";

import { getConnectorRuntimeConfig } from "@/connectors/runtime-config";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const config = getConnectorRuntimeConfig();
    return NextResponse.json({
      client_id: config.clientId,
      client_name: "AI Marketing Copilot",
      redirect_uris: [config.redirectUri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      "com.posthog.scopes": ["endpoint:read"],
    }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch {
    return NextResponse.json({ error: "connector_not_configured" }, { status: 503 });
  }
}
