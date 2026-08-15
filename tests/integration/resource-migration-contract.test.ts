import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../../supabase/migrations/20260815110500_resource_constraints.sql", import.meta.url);

describe("resource constraint persistence", () => {
  it("enforces non-negative precise money, currency, immutable versions, and RLS", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql).toContain("cash_budget_minor bigint not null check (cash_budget_minor >= 0)");
    expect(sql).toContain("currency ~ '^[A-Z]{3}$'");
    expect(sql).toContain("resource_constraint_version_immutable");
    expect(sql).toContain("resource_constraint_version_worker_scope");
  });
});
