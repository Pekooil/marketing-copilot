import "server-only";

import postgres from "postgres";
import { z } from "zod";

import { connectorConnectionInputSchema, connectorSnapshotSchema, endpointMappingInputSchema } from "./contracts";
import { posthogTokenSetSchema, type PosthogTokenSet } from "./token-set";
import { databaseTimestampSchema } from "@/db/timestamp";

const contextSchema = z.object({
  connection: connectorConnectionInputSchema.extend({ id: z.uuid() }),
  secretReference: z.object({ vaultProvider: z.literal("supabase-vault-v1"), vaultKeyRef: z.uuid(), expiresAt: databaseTimestampSchema.nullable() }),
  mappings: z.array(endpointMappingInputSchema),
});

export type ConnectorWorkerContext = z.infer<typeof contextSchema>;

export async function withConnectorWorker<T>(databaseUrl: string, workspaceId: string, work: (transaction: postgres.TransactionSql) => Promise<T>) {
  const host = new URL(databaseUrl).hostname;
  const sql = postgres(databaseUrl, { max: 1, prepare: false, ssl: host === "localhost" || host === "127.0.0.1" ? false : "require" });
  try {
    return await sql.begin(async (transaction) => {
      await transaction.unsafe("set local role app_worker");
      await transaction`select set_config('app.workspace_id', ${workspaceId}, true)`;
      return work(transaction);
    });
  } finally {
    await sql.end();
  }
}

export async function loadConnectorWorkerContext(databaseUrl: string, workspaceId: string, connectionId: string) {
  return withConnectorWorker(databaseUrl, workspaceId, async (transaction) => {
    const [row] = await transaction`select app.get_connector_worker_context(${workspaceId},${connectionId}) as context`;
    return contextSchema.parse(row.context);
  });
}

export async function storeConnectorSecret(databaseUrl: string, input: { workspaceId: string; connectionId: string; actorId: string; tokenSet: PosthogTokenSet }) {
  const tokenSet = posthogTokenSetSchema.parse(input.tokenSet);
  return withConnectorWorker(databaseUrl, input.workspaceId, (transaction) => transaction`
    select app.complete_posthog_connection_vault(${input.workspaceId},${input.connectionId},${input.actorId},${transaction.json(tokenSet)})
  `);
}

export async function readConnectorSecret(databaseUrl: string, workspaceId: string, connectionId: string) {
  return withConnectorWorker(databaseUrl, workspaceId, async (transaction) => {
    const [row] = await transaction`select app.read_posthog_secret(${workspaceId},${connectionId}) as token_set`;
    return posthogTokenSetSchema.parse(row.token_set);
  });
}

export async function commitConnectorSync(databaseUrl: string, input: { workspaceId: string; connectionId: string; actorId: string; idempotencyKey: string; requestId: string; windowStart: string; windowEnd: string; segment: string; results: Array<z.infer<typeof connectorSnapshotSchema> & { metricDefinitionId: string; endpointName: string; endpointVersion: number }> }) {
  return withConnectorWorker(databaseUrl, input.workspaceId, (transaction) => transaction`
    select app.commit_connector_sync(${input.workspaceId},${input.connectionId},${input.actorId},${input.idempotencyKey},${input.requestId},${input.windowStart},${input.windowEnd},${input.segment},${transaction.json(input.results)})
  `);
}

export async function recordConnectorFailure(databaseUrl: string, input: { workspaceId: string; connectionId: string; actorId: string; idempotencyKey: string; requestId: string; windowStart: string; windowEnd: string; segment: string; metricCount: number; errorClass: string }) {
  return withConnectorWorker(databaseUrl, input.workspaceId, (transaction) => transaction`
    select app.record_connector_sync_failure(${input.workspaceId},${input.connectionId},${input.actorId},${input.idempotencyKey},${input.requestId},${input.windowStart},${input.windowEnd},${input.segment},${input.metricCount},${input.errorClass})
  `);
}

export async function rotateConnectorSecret(databaseUrl: string, input: { workspaceId: string; connectionId: string; actorId: string; expectedReference: string; tokenSet: PosthogTokenSet }) {
  const tokenSet = posthogTokenSetSchema.parse(input.tokenSet);
  return withConnectorWorker(databaseUrl, input.workspaceId, (transaction) => transaction`
    select app.rotate_posthog_secret_vault(${input.workspaceId},${input.connectionId},${input.actorId},${input.expectedReference},${transaction.json(tokenSet)})
  `);
}

export async function revokeConnectorSecret(databaseUrl: string, input: { workspaceId: string; connectionId: string; actorId: string; requestId: string }) {
  return withConnectorWorker(databaseUrl, input.workspaceId, (transaction) => transaction`
    select app.revoke_posthog_secret_vault(${input.workspaceId},${input.connectionId},${input.actorId},${input.requestId})
  `);
}
