import { z } from "zod";

const safeMetadataValue = z.union([z.string().max(200), z.number().finite(), z.boolean(), z.null()]);

export const auditEventSchema = z.object({
  workspaceId: z.uuid(),
  actorType: z.enum(["founder", "worker", "support"]),
  actorId: z.string().trim().min(1).max(200),
  action: z.string().trim().min(1).max(120),
  targetType: z.string().trim().min(1).max(80),
  targetId: z.string().trim().min(1).max(200),
  targetVersion: z.number().int().positive().nullable(),
  requestId: z.uuid(),
  result: z.enum(["succeeded", "denied"]),
  metadata: z.record(z.string().max(80), safeMetadataValue).default({}),
});

export type AuditEventInput = z.infer<typeof auditEventSchema>;

const forbiddenMetadataKey = /(token|secret|password|authorization|cookie|email|payload|content)/i;

export function validateAuditEvent(input: unknown) {
  const event = auditEventSchema.parse(input);
  const forbiddenKey = Object.keys(event.metadata).find((key) => forbiddenMetadataKey.test(key));
  if (forbiddenKey) throw new Error(`Audit metadata key is not permitted: ${forbiddenKey}`);
  return event;
}

export interface AuditTransactionContext {
  appendAudit(event: AuditEventInput): Promise<void>;
  database?: unknown;
}

export interface AuditTransactionRunner {
  run<T>(work: (context: AuditTransactionContext) => Promise<T>): Promise<T>;
}
