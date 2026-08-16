import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireIdentity } from "@/auth/require-identity";
import { ConnectorError } from "@/connectors/errors";
import { openOAuthState } from "@/connectors/oauth-state";
import { PosthogEndpointAdapter } from "@/connectors/posthog/endpoint-adapter";
import { discoverPosthogOAuthServer, exchangePosthogAuthorizationCode } from "@/connectors/posthog/oauth";
import { getConnectorRuntimeConfig } from "@/connectors/runtime-config";
import { ManagedConnectorVault } from "@/connectors/vault";
import { completeConnector } from "@/connectors/worker-db";

export async function GET(request: Request) {
  const target = new URL("/metrics", request.url);
  const cookieStore = await cookies();
  try {
    const identity = await requireIdentity();
    const config = getConnectorRuntimeConfig();
    const stored = openOAuthState(cookieStore.get("connector_oauth")?.value, config.stateSecret);
    const search = new URL(request.url).searchParams;
    if (search.get("error")) throw new ConnectorError({ code: "POSTHOG_AUTHORIZATION_DENIED", classification: "credential", message: "PostHog authorization was not completed." });
    const code = search.get("code") ?? "";
    const state = search.get("state") ?? "";
    if (stored.userId !== identity.userId || stored.state !== state) throw new ConnectorError({ code: "CONNECTOR_OAUTH_STATE_INVALID", classification: "credential", message: "The PostHog authorization attempt is invalid." });
    const metadata = await discoverPosthogOAuthServer();
    const tokens = await exchangePosthogAuthorizationCode({ tokenEndpoint: metadata.token_endpoint, clientId: config.clientId, redirectUri: config.redirectUri, code, codeVerifier: stored.codeVerifier });
    await new PosthogEndpointAdapter().healthCheck({ connection: stored.connection, credentials: { accessToken: tokens.accessToken } });
    const vault = new ManagedConnectorVault({ url: config.vaultUrl, token: config.vaultToken });
    const reference = await vault.write(stored.connectionId, tokens);
    try {
      await completeConnector(config.databaseUrl, { workspaceId: stored.workspaceId, connectionId: stored.connectionId, actorId: identity.userId, vaultKeyRef: reference, expiresAt: tokens.expiresAt });
    } catch (error) {
      await vault.revoke(reference).catch(() => undefined);
      throw error;
    }
    target.searchParams.set("connector", "connected");
  } catch (error) {
    target.searchParams.set("connector", error instanceof ConnectorError ? error.code.toLowerCase() : "connection_failed");
  } finally {
    cookieStore.delete("connector_oauth");
  }
  return NextResponse.redirect(target);
}
