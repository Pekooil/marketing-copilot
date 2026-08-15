import { ApplicationError } from "./errors";
import { executeMutation, mutationEnvelopeSchema, type IdempotencyStore, type MutationEnvelope } from "./mutation";
import { validateAuditEvent, type AuditEventInput, type AuditTransactionContext, type AuditTransactionRunner } from "./audit";

export async function executeAuditedMutation<T>(input: {
  envelope: unknown;
  action: string;
  payload: unknown;
  actor: Pick<AuditEventInput, "actorType" | "actorId">;
  target: Pick<AuditEventInput, "targetType" | "targetId" | "targetVersion">;
  metadata?: AuditEventInput["metadata"];
  store: IdempotencyStore;
  transaction: AuditTransactionRunner;
  authorize: (workspaceId: string) => Promise<void>;
  effect: (envelope: MutationEnvelope, context: AuditTransactionContext) => Promise<T>;
}) {
  const envelope = mutationEnvelopeSchema.safeParse(input.envelope);

  try {
    return await executeMutation({
      envelope: input.envelope,
      action: input.action,
      payload: input.payload,
      store: input.store,
      authorize: input.authorize,
      effect: (resolvedEnvelope) =>
        input.transaction.run(async (context) => {
          const value = await input.effect(resolvedEnvelope, context);
          await context.appendAudit(
            validateAuditEvent({
              workspaceId: resolvedEnvelope.workspaceId,
              ...input.actor,
              action: input.action,
              ...input.target,
              requestId: resolvedEnvelope.requestId,
              result: "succeeded",
              metadata: input.metadata,
            }),
          );
          return value;
        }),
    });
  } catch (error) {
    const isDenied =
      error instanceof ApplicationError &&
      (error.code === "AUTHENTICATION_REQUIRED" || error.code === "FORBIDDEN_OR_NOT_FOUND");
    if (isDenied && envelope.success) {
      await input.transaction.run((context) =>
        context.appendAudit(
          validateAuditEvent({
            workspaceId: envelope.data.workspaceId,
            ...input.actor,
            action: input.action,
            ...input.target,
            requestId: envelope.data.requestId,
            result: "denied",
            metadata: input.metadata,
          }),
        ),
      );
    }
    throw error;
  }
}
