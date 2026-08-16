import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../../supabase/migrations/20260815180000_onboarding_rpc.sql",
  import.meta.url,
);

describe("onboarding persistence RPC", () => {
  it("derives identity, scopes workspace access, versions writes, and records receipts and audit", async () => {
    const sql = await readFile(migrationUrl, "utf8");

    expect(sql).toMatch(/security definer[\s\S]*set search_path = ''/i);
    expect(sql).toMatch(/v_user_id uuid := auth\.uid\(\)/i);
    expect(sql).toMatch(/membership\.user_id = v_user_id/i);
    expect(sql).toMatch(/insert into app\.company_profile_version/i);
    expect(sql).toMatch(/insert into app\.objective_version/i);
    expect(sql).toMatch(/insert into app\.resource_constraint_version/i);
    expect(sql).toMatch(/insert into app\.mutation_receipt/i);
    expect(sql).toMatch(/insert into app\.audit_event/i);
    expect(sql).toMatch(/revoke all on function public\.save_onboarding[\s\S]*from public, anon/i);
    expect(sql).toMatch(/grant execute on function public\.save_onboarding[\s\S]*to authenticated/i);
  });
});
