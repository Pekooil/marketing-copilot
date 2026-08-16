import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

import { ConnectorError } from "@/connectors/errors";

const metadataSchema = z.object({
  authorization_endpoint: z.url().startsWith("https://"),
  token_endpoint: z.url().startsWith("https://"),
  scopes_supported: z.array(z.string()).optional(),
});

export const posthogOAuthScopes = ["endpoint:read"] as const;
export const posthogOAuthMetadataUrl = "https://oauth.posthog.com/.well-known/oauth-authorization-server";

export interface PosthogOAuthConfig {
  clientId: string;
  redirectUri: string;
}

export async function discoverPosthogOAuthServer(fetcher: typeof fetch = fetch) {
  const response = await fetcher(posthogOAuthMetadataUrl, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new ConnectorError({ code: "POSTHOG_OAUTH_DISCOVERY_FAILED", classification: "temporary", message: "PostHog authorization is temporarily unavailable.", retryable: true });
  const metadata = metadataSchema.parse(await response.json());
  for (const endpoint of [metadata.authorization_endpoint, metadata.token_endpoint]) {
    if (!new URL(endpoint).hostname.endsWith("posthog.com")) throw new ConnectorError({ code: "POSTHOG_OAUTH_METADATA_UNSAFE", classification: "configuration", message: "PostHog returned an unexpected authorization endpoint." });
  }
  if (metadata.scopes_supported && !posthogOAuthScopes.every((scope) => metadata.scopes_supported?.includes(scope))) {
    throw new ConnectorError({ code: "POSTHOG_SCOPE_UNAVAILABLE", classification: "configuration", message: "The required read-only PostHog scope is unavailable." });
  }
  return metadata;
}

export function createPosthogAuthorizationRequest(config: PosthogOAuthConfig, authorizationEndpoint: string) {
  const parsed = z.object({ clientId: z.url().startsWith("https://"), redirectUri: z.url() }).parse(config);
  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const url = new URL(authorizationEndpoint);
  if (!url.hostname.endsWith("posthog.com") || url.protocol !== "https:") throw new ConnectorError({ code: "POSTHOG_AUTHORIZATION_URL_UNSAFE", classification: "configuration", message: "The PostHog authorization endpoint is invalid." });
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: parsed.clientId,
    redirect_uri: parsed.redirectUri,
    scope: posthogOAuthScopes.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return { url: url.toString(), state, codeVerifier };
}
