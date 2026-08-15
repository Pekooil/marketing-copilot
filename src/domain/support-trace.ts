import { z } from "zod";

import { validateAuditEvent, type AuditTransactionRunner } from "./audit";

const traceRequestSchema = z.object({
  supportActorId: z.string().trim().min(1),
  workspaceId: z.uuid(),
  requestId: z.uuid(),
});

export interface SupportAccessGrant {
  workspaceId: string;
  supportActorId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface SupportTraceItem {
  source: "mutation" | "audit" | "log";
  action: string;
  result: string;
  timestamp: string;
  reference: string;
}

export interface SupportTraceRepository {
  findActiveGrant(supportActorId: string, workspaceId: string): Promise<SupportAccessGrant | null>;
  findByWorkspaceAndRequest(workspaceId: string, requestId: string): Promise<SupportTraceItem[]>;
}

export class SupportAccessError extends Error {
  readonly code = "SUPPORT_ACCESS_DENIED";
}

export async function lookupSupportTrace(input: {
  request: unknown;
  repository: SupportTraceRepository;
  audit: AuditTransactionRunner;
  now?: Date;
}) {
  const request = traceRequestSchema.parse(input.request);
  const now = input.now ?? new Date();
  const grant = await input.repository.findActiveGrant(
    request.supportActorId,
    request.workspaceId,
  );
  if (
    !grant ||
    grant.revokedAt !== null ||
    grant.expiresAt.getTime() <= now.getTime()
  ) {
    throw new SupportAccessError("Support access is absent, expired, or revoked.");
  }

  return input.audit.run(async (context) => {
    const trace = await input.repository.findByWorkspaceAndRequest(
      request.workspaceId,
      request.requestId,
    );
    await context.appendAudit(
      validateAuditEvent({
        workspaceId: request.workspaceId,
        actorType: "support",
        actorId: request.supportActorId,
        action: "support.trace.read",
        targetType: "request_trace",
        targetId: request.requestId,
        targetVersion: null,
        requestId: crypto.randomUUID(),
        result: "succeeded",
        metadata: { result_count: trace.length },
      }),
    );
    return trace;
  });
}
