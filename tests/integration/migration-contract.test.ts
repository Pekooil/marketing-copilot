import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../../supabase/migrations/20260815102000_identity_tenancy.sql", import.meta.url);

describe("identity and tenancy migration", () => {
  it("enforces uniqueness, references, and an active owner", async () => {
    const sql = await readFile(migrationUrl, "utf8");

    expect(sql).toContain("constraint membership_pk primary key (workspace_id, user_id)");
    expect(sql).toContain("references auth.users(id)");
    expect(sql).toContain("constraint trigger membership_active_owner");
    expect(sql).toContain("deferrable initially deferred");
  });
});
