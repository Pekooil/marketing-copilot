import "server-only";

import type { AuditEventInput } from "@/domain/audit";

import { createLogger } from "./logger";

export class AuditConsistencyError extends Error {
  readonly code = "AUDIT_CONSISTENCY_FAILURE";
}

export function createMutationTrace(logger = createLogger()) {
  const startedAt = performance.now();
  return {
    mutationStarted(action: string) {
      logger.info({ event: "mutation_started", action });
    },
    auditAppended(event: Pick<AuditEventInput, "action" | "result" | "targetType">) {
      logger.info({ event: "audit_appended", action: event.action, result: event.result, targetType: event.targetType });
    },
    mutationCompleted(action: string, result: string) {
      logger.info({ event: "mutation_completed", action, result, durationMs: Math.round(performance.now() - startedAt) });
    },
    consistencyFailure(action: string) {
      logger.error({ event: "mutation_audit_inconsistency", action, errorClass: "AUDIT_CONSISTENCY_FAILURE", alert: true });
      throw new AuditConsistencyError("Mutation and audit state are inconsistent.");
    },
  };
}
