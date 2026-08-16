import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../../supabase/migrations/20260816100000_product_understanding.sql",
  import.meta.url,
);

describe("product understanding tenant isolation", () => {
  it("uses forced default-deny RLS with member and scoped-worker policies", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    for (const table of [
      "source_record",
      "product_understanding_proposal",
      "product_understanding_review",
      "context_snapshot",
    ]) {
      expect(sql).toContain(`create policy ${table}_member_select`);
      expect(sql).toContain(`create policy ${table}_worker_scope`);
    }
    expect(sql).toMatch(/app\.is_active_member\(workspace_id\)/i);
    expect(sql).toContain("current_setting('app.workspace_id', true)");
  });
});
