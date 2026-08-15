import "server-only";

import type { Database } from "@/db/client";
import { auditEvents } from "@/db/schema";
import { validateAuditEvent, type AuditTransactionRunner } from "@/domain/audit";

type TransactionDatabase = Parameters<Parameters<Database["transaction"]>[0]>[0];

export function createPostgresAuditTransactionRunner(
  database: Database,
): AuditTransactionRunner {
  return {
    run: (work) =>
      database.transaction((transaction) =>
        work({
          database: transaction as TransactionDatabase,
          async appendAudit(input) {
            const event = validateAuditEvent(input);
            await transaction.insert(auditEvents).values(event);
          },
        }),
      ),
  };
}
