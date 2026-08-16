import "server-only";

import postgres from "postgres";
import { z } from "zod";

import { connectorConnectionInputSchema, connectorSnapshotSchema, endpointMappingInputSchema } from "./contracts";

const contextSchema = z.object({
  connection: connectorConnectionInputSchema.extend({ id: z.uuid() }),
  secretReference: z.object({ vaultProvider: z.literal("managed-http-v1"), vaultKeyRef: z.string().min(8), expiresAt: z.iso.datetime().nullable() }),
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

export async function completeConnector(databaseUrl: string, input: { workspaceId: string; connectionId: string; actorId: string; vaultKeyRef: string; expiresAt: string }) {
  return withConnectorWorker(databaseUrl, input.workspaceId, (transaction) => transaction`
    select app.complete_posthog_connection(${input.workspaceId},${input.connectionId},${input.actorId},'managed-http-v1',${input.vaultKeyRef},${input.expiresAt})
  `);
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

export async function rotateConnectorSecret(databaseUrl: string, input: { workspaceId: string; connectionId: string; actorId: string; expectedReference: string; nextReference: string; expiresAt: string }) {
  return withConnectorWorker(databaseUrl, input.workspaceId, (transaction) => transaction`
    select app.rotate_posthog_secret(${input.workspaceId},${input.connectionId},${input.actorId},${input.expectedReference},${input.nextReference},${input.expiresAt})
  `);
}
