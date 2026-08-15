import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../../supabase/migrations/20260815111500_audit_event.sql", import.meta.url);
const repositoryUrl = new URL("../../src/repositories/audit.ts", import.meta.url);

describe("audit persistence contract", () => {
  it("is append-only and shares the Drizzle transaction with domain work", async () => {
    const [sql, repository] = await Promise.all([readFile(migrationUrl, "utf8"), readFile(repositoryUrl, "utf8")]);
    expect(sql).toContain("before update or delete on app.audit_event");
    expect(sql).not.toContain("grant update");
    expect(sql).not.toContain("grant delete");
    expect(repository).toContain("database.transaction");
    expect(repository).toContain("transaction.insert(auditEvents)");
  });
});
