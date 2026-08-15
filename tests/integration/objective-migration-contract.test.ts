import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../../supabase/migrations/20260815110000_objective.sql", import.meta.url);

describe("objective persistence contract", () => {
  it("enforces one active objective and zero-versus-unknown consistency", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql).toContain("unique index objective_one_active_per_workspace");
    expect(sql).toContain("where status = 'active'");
    expect(sql).toContain("baseline_state = 'unknown' and baseline_value is null");
    expect(sql).toContain("constraint objective_version_unique unique (objective_id, version)");
  });
});
