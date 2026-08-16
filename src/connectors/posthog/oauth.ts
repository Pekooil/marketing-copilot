import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

import { ConnectorError } from "@/connectors/errors";

const metadataSchema = z.object({
  authorization_endpoint: z.url().startsWith("https://"),
  token_endpoint: z.url().startsWith("https://"),
  scopes_supported: z.array(z.string()).optional(),
});

const tokenResponseSchema = z.object({
  access_token: z.string().regex(/^pha_[A-Za-z0-9_-]{8,}$/),
  refresh_token: z.string().regex(/^phr_[A-Za-z0-9_-]{8,}$/).optional(),
  expires_in: z.number().int().positive().max(86_400),
  scope: z.string().optional(),
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
    if (!isPosthogHostname(new URL(endpoint).hostname)) throw new ConnectorError({ code: "POSTHOG_OAUTH_METADATA_UNSAFE", classification: "configuration", message: "PostHog returned an unexpected authorization endpoint." });
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
  if (!isPosthogHostname(url.hostname) || url.protocol !== "https:") throw new ConnectorError({ code: "POSTHOG_AUTHORIZATION_URL_UNSAFE", classification: "configuration", message: "The PostHog authorization endpoint is invalid." });
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

export async function exchangePosthogAuthorizationCode(input: { tokenEndpoint: string; clientId: string; redirectUri: string; code: string; codeVerifier: string }, fetcher: typeof fetch = fetch) {
  return requestToken(input.tokenEndpoint, new URLSearchParams({
    grant_type: "authorization_code",
    code: z.string().min(8).max(2_000).parse(input.code),
    client_id: z.url().startsWith("https://").parse(input.clientId),
    redirect_uri: z.url().parse(input.redirectUri),
    code_verifier: z.string().min(43).max(128).parse(input.codeVerifier),
  }), fetcher, null);
}

export async function refreshPosthogOAuthToken(input: { tokenEndpoint: string; clientId: string; refreshToken: string }, fetcher: typeof fetch = fetch) {
  const refreshToken = z.string().regex(/^phr_[A-Za-z0-9_-]{8,}$/).parse(input.refreshToken);
  return requestToken(input.tokenEndpoint, new URLSearchParams({
    grant_type: "refresh_token",
    client_id: z.url().startsWith("https://").parse(input.clientId),
    refresh_token: refreshToken,
  }), fetcher, refreshToken);
}

async function requestToken(tokenEndpoint: string, body: URLSearchParams, fetcher: typeof fetch, existingRefreshToken: string | null) {
  const endpoint = new URL(z.url().startsWith("https://").parse(tokenEndpoint));
  if (!isPosthogHostname(endpoint.hostname)) throw new ConnectorError({ code: "POSTHOG_OAUTH_METADATA_UNSAFE", classification: "configuration", message: "PostHog returned an unexpected token endpoint." });
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new ConnectorError({ code: "POSTHOG_TOKEN_EXCHANGE_FAILED", classification: "credential", message: "PostHog authorization must be completed again." });
  const parsed = tokenResponseSchema.parse(await response.json());
  if (parsed.scope && !parsed.scope.split(/\s+/).includes("endpoint:read")) throw new ConnectorError({ code: "POSTHOG_SCOPE_DENIED", classification: "permission", message: "PostHog did not grant the required read-only scope." });
  const refreshToken = parsed.refresh_token ?? existingRefreshToken;
  if (!refreshToken) throw new ConnectorError({ code: "POSTHOG_TOKEN_EXCHANGE_FAILED", classification: "credential", message: "PostHog authorization must be completed again." });
  return { accessToken: parsed.access_token, refreshToken, expiresAt: new Date(Date.now() + parsed.expires_in * 1_000).toISOString() };
}

function isPosthogHostname(hostname: string) {
  return hostname === "posthog.com" || hostname.endsWith(".posthog.com");
}
