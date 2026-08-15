import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../../supabase/migrations/20260815105200_rls_and_grants.sql", import.meta.url);

describe("RLS migration contract", () => {
  it("forces RLS, revokes defaults, scopes workers, and secures future tables", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    for (const table of ["user_account", "workspace", "membership"]) {
      expect(sql).toContain(`alter table app.${table} force row level security`);
    }
    expect(sql).toContain("revoke all on all tables in schema app from anon, authenticated, app_worker, public");
    expect(sql).toContain("current_setting('app.workspace_id', true)");
    expect(sql).toContain("create event trigger app_new_table_default_deny");
  });
});
