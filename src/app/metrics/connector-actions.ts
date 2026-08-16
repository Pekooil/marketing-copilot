"use server";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireIdentity } from "@/auth/require-identity";
import { connectorSyncKey } from "@/connectors/idempotency";
import { ConnectorError } from "@/connectors/errors";
import { sealOAuthState } from "@/connectors/oauth-state";
import { PosthogEndpointAdapter } from "@/connectors/posthog/endpoint-adapter";
import { createPosthogAuthorizationRequest, discoverPosthogOAuthServer, refreshPosthogOAuthToken } from "@/connectors/posthog/oauth";
import { getConnectorRuntimeConfig } from "@/connectors/runtime-config";
import { ManagedConnectorVault } from "@/connectors/vault";
import { commitConnectorSync, loadConnectorWorkerContext, recordConnectorFailure, rotateConnectorSecret } from "@/connectors/worker-db";
import { connectorWorkspaceStateSchema, refreshConnectorInputSchema, saveConnectorMappingInputSchema, startConnectionInputSchema, type ConnectorWorkspaceState, type DiscoverConnectorSourcesAction, type RefreshConnectorAction, type RevokeConnectorAction, type SaveConnectorMappingAction, type StartConnectionAction } from "@/connectors/workspace-schema";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createLogger } from "@/observability/logger";
import { loadMetricsWorkspaceState } from "./actions";

const logger = createLogger();

export async function loadConnectorWorkspaceState(workspaceId: string): Promise<ConnectorWorkspaceState> {
  await requireIdentity();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_connector_workspace_state", { p_workspace_id: workspaceId });
  if (error) throw new ConnectorError({ code: "CONNECTOR_STATE_UNAVAILABLE", classification: "temporary", message: "Connector status could not be loaded.", retryable: true });
  return connectorWorkspaceStateSchema.parse(data);
}

export const startPosthogConnection: StartConnectionAction = async (rawInput) => {
  try {
    const input = startConnectionInputSchema.parse(rawInput);
    const identity = await requireIdentity();
    const config = getConnectorRuntimeConfig();
    const metadata = await discoverPosthogOAuthServer();
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("begin_posthog_connection", {
      p_workspace_id: input.workspaceId,
      p_region: input.connection.region,
      p_project_id: input.connection.projectId,
      p_display_name: input.connection.displayName,
      p_request_id: input.requestId,
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) return rpcFailure(error.code);
    const state = connectorWorkspaceStateSchema.parse(data);
    if (!state.connection) return { ok: false, message: "The connection could not be prepared." };
    const authorization = createPosthogAuthorizationRequest({ clientId: config.clientId, redirectUri: config.redirectUri }, metadata.authorization_endpoint);
    const cookieStore = await cookies();
    cookieStore.set("connector_oauth", sealOAuthState({ userId: identity.userId, workspaceId: input.workspaceId, connectionId: state.connection.id, connection: input.connection, state: authorization.state, codeVerifier: authorization.codeVerifier, expiresAt: Date.now() + 10 * 60 * 1_000 }, config.stateSecret), {
      httpOnly: true,
      secure: config.appUrl.startsWith("https://"),
      sameSite: "lax",
      path: "/connectors/posthog/callback",
      maxAge: 600,
    });
    return { ok: true, authorizationUrl: authorization.url };
  } catch (error) {
    return safeFailure("connector.connection.start", error);
  }
};

export const discoverConnectorSources: DiscoverConnectorSourcesAction = async (rawInput) => {
  try {
    const input = z.object({ workspaceId: z.uuid(), connectionId: z.uuid() }).parse(rawInput);
    const identity = await requireIdentity();
    const config = getConnectorRuntimeConfig();
    const context = await loadConnectorWorkerContext(config.databaseUrl, input.workspaceId, input.connectionId);
    const tokenSet = await loadFreshTokenSet(config, context, input.workspaceId, identity.userId);
    const endpoints = await new PosthogEndpointAdapter().discoverSources({ connection: context.connection, credentials: { accessToken: tokenSet.accessToken } });
    return { ok: true, endpoints: endpoints.filter((endpoint) => endpoint.active) };
  } catch (error) {
    return safeFailure("connector.sources.discover", error);
  }
};

export const saveConnectorMapping: SaveConnectorMappingAction = async (rawInput) => {
  try {
    const input = saveConnectorMappingInputSchema.parse(rawInput);
    await requireIdentity();
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("save_connector_mapping", {
      p_workspace_id: input.workspaceId,
      p_connection_id: input.connectionId,
      p_metric_definition_id: input.mapping.metricDefinitionId,
      p_expected_version: input.expectedVersion,
      p_endpoint_name: input.mapping.endpointName,
      p_endpoint_version: input.mapping.endpointVersion,
      p_request_id: input.requestId,
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) return rpcFailure(error.code);
    revalidatePath("/metrics");
    return { ok: true, state: connectorWorkspaceStateSchema.parse(data), message: "Founder-approved Endpoint mapping saved." };
  } catch (error) {
    return safeFailure("connector.mapping.save", error);
  }
};

export const refreshPosthogMetrics: RefreshConnectorAction = async (rawInput) => {
  const parsed = refreshConnectorInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, message: "Choose a valid bounded window and segment." };
  const input = parsed.data;
  let identity: Awaited<ReturnType<typeof requireIdentity>> | null = null;
  let metricCount = 0;
  const syncKeyParts: string[] = [];
  try {
    identity = await requireIdentity();
    const config = getConnectorRuntimeConfig();
    const context = await loadConnectorWorkerContext(config.databaseUrl, input.workspaceId, input.connectionId);
    metricCount = context.mappings.length;
    if (metricCount === 0) return { ok: false, message: "Map at least one metric before refreshing." };
    const tokenSet = await loadFreshTokenSet(config, context, input.workspaceId, identity.userId);
    const adapter = new PosthogEndpointAdapter();
    const results = await Promise.all(context.mappings.map(async (mapping) => {
      syncKeyParts.push(connectorSyncKey({ connectionId: input.connectionId, metricDefinitionId: mapping.metricDefinitionId, endpointVersion: mapping.endpointVersion, ...input.range }));
      const snapshot = await adapter.fetchMetricSnapshot({ connection: context.connection, credentials: { accessToken: tokenSet.accessToken }, mapping, range: input.range, checkpoint: null });
      return { ...snapshot, metricDefinitionId: mapping.metricDefinitionId, endpointName: mapping.endpointName, endpointVersion: mapping.endpointVersion };
    }));
    const idempotencyKey = createHash("sha256").update(syncKeyParts.toSorted().join(":"), "utf8").digest("hex");
    await commitConnectorSync(config.databaseUrl, { workspaceId: input.workspaceId, connectionId: input.connectionId, actorId: identity.userId, idempotencyKey, requestId: input.requestId, ...input.range, results });
    revalidatePath("/metrics");
    const [connectorState, metricsState] = await Promise.all([loadConnectorWorkspaceState(input.workspaceId), loadMetricsWorkspaceState(input.workspaceId)]);
    return { ok: true, connectorState, metricsState, message: `${results.length} PostHog aggregates refreshed with source lineage.` };
  } catch (error) {
    const connectorError = error instanceof ConnectorError ? error : null;
    if (identity && connectorError && connectorError.classification !== "configuration") {
      try {
        const config = getConnectorRuntimeConfig();
        const failureKey = createHash("sha256").update(`failure:${input.connectionId}:${input.range.windowStart}:${input.range.windowEnd}:${input.range.segment}:${connectorError.code}`).digest("hex");
        await recordConnectorFailure(config.databaseUrl, { workspaceId: input.workspaceId, connectionId: input.connectionId, actorId: identity.userId, idempotencyKey: failureKey, requestId: input.requestId, ...input.range, metricCount: Math.max(metricCount, 1), errorClass: connectorError.code });
      } catch {
        logger.error({ event: "connector.sync.failure_record", result: "failed", errorClass: "CONNECTOR_FAILURE_RECORD_FAILED" });
      }
    }
    const failure = safeFailure("connector.sync", error);
    try { return { ...failure, connectorState: await loadConnectorWorkspaceState(input.workspaceId) }; } catch { return failure; }
  }
};

export const revokePosthogConnection: RevokeConnectorAction = async (rawInput) => {
  try {
    const input = z.object({ workspaceId: z.uuid(), connectionId: z.uuid(), requestId: z.uuid() }).parse(rawInput);
    await requireIdentity();
    const config = getConnectorRuntimeConfig();
    const context = await loadConnectorWorkerContext(config.databaseUrl, input.workspaceId, input.connectionId);
    await new ManagedConnectorVault({ url: config.vaultUrl, token: config.vaultToken }).revoke(context.secretReference.vaultKeyRef);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("revoke_connector_connection", { p_workspace_id: input.workspaceId, p_connection_id: input.connectionId, p_request_id: input.requestId });
    if (error) return rpcFailure(error.code);
    revalidatePath("/metrics");
    return { ok: true, state: connectorWorkspaceStateSchema.parse(data), message: "PostHog access revoked. Historical aggregate evidence was preserved." };
  } catch (error) {
    return safeFailure("connector.connection.revoke", error);
  }
};

function rpcFailure(code: string): { ok: false; message: string } {
  if (code === "42501") return { ok: false, message: "That connector resource is unavailable." };
  if (code === "40001") return { ok: false, message: "The mapping changed. Refresh before saving." };
  if (code === "23505") return { ok: false, message: "An active PostHog connection or conflicting request already exists." };
  return { ok: false, message: "The connector change could not be saved." };
}

function safeFailure(event: string, error: unknown): { ok: false; message: string } {
  const code = error instanceof ConnectorError ? error.code : error instanceof z.ZodError ? "CONNECTOR_INPUT_INVALID" : "CONNECTOR_UNEXPECTED";
  logger.warn({ event, result: "failed", errorClass: code });
  return { ok: false, message: error instanceof ConnectorError ? error.message : error instanceof z.ZodError ? "Review the connector fields." : "The connector operation could not be completed safely." };
}

async function loadFreshTokenSet(config: ReturnType<typeof getConnectorRuntimeConfig>, context: Awaited<ReturnType<typeof loadConnectorWorkerContext>>, workspaceId: string, actorId: string) {
  const vault = new ManagedConnectorVault({ url: config.vaultUrl, token: config.vaultToken });
  const current = await vault.read(context.secretReference.vaultKeyRef);
  if (Date.parse(current.expiresAt) > Date.now() + 60_000) return current;
  const metadata = await discoverPosthogOAuthServer();
  const refreshed = await refreshPosthogOAuthToken({ tokenEndpoint: metadata.token_endpoint, clientId: config.clientId, refreshToken: current.refreshToken });
  const nextReference = await vault.write(context.connection.id, refreshed);
  try {
    await rotateConnectorSecret(config.databaseUrl, {
      workspaceId,
      connectionId: context.connection.id,
      actorId,
      expectedReference: context.secretReference.vaultKeyRef,
      nextReference,
      expiresAt: refreshed.expiresAt,
    });
  } catch (error) {
    if (nextReference !== context.secretReference.vaultKeyRef) await vault.revoke(nextReference).catch(() => undefined);
    throw error;
  }
  if (nextReference !== context.secretReference.vaultKeyRef) {
    await vault.revoke(context.secretReference.vaultKeyRef).catch(() => logger.warn({ event: "connector.secret.old_revoke", result: "failed", errorClass: "CONNECTOR_VAULT_UNAVAILABLE" }));
  }
  return refreshed;
}
