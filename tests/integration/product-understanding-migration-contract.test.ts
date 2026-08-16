import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../../supabase/migrations/20260816100000_product_understanding.sql",
  import.meta.url,
);

describe("product understanding persistence", () => {
  it("keeps provenance, proposals, reviews, and snapshots immutable", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql).toContain("source_record_identity_unique");
    expect(sql).toContain("product_understanding_never_auto_verified");
    expect(sql).toContain("source_record_immutable");
    expect(sql).toContain("product_understanding_proposal_immutable");
    expect(sql).toContain("product_understanding_review_immutable");
    expect(sql).toContain("context_snapshot_immutable");
    expect(sql).toMatch(/raw public page bodies are not retained/i);
  });

  it("requires membership, optimistic versions, and founder attribution", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql).toMatch(/not app\.is_active_member\(p_workspace_id\)/i);
    expect(sql).toContain("v_actual_version <> p_expected_profile_version");
    expect(sql).toContain("'founder:' || v_user_id::text");
    expect(sql).toContain("'verificationState', 'founder_verified'");
    expect(sql).toContain("p_request_id::text");
  });
});
