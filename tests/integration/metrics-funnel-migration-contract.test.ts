import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../../supabase/migrations/20260816140000_metrics_funnel.sql",
  import.meta.url,
);

describe("manual metrics and funnel persistence", () => {
  it("versions definitions and funnel mappings while keeping source history immutable", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql).toContain("metric_definition_version_unique");
    expect(sql).toContain("funnel_definition_version_unique");
    expect(sql).toContain("metric_definition_version_immutable");
    expect(sql).toContain("manual_import_batch_immutable");
    expect(sql).toContain("metric_observation_immutable");
    expect(sql).toContain("metric_snapshot_immutable");
    expect(sql).toContain("funnel_stage_immutable");
  });

  it("keeps unknown separate from zero and retains conflict evidence", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql).toMatch(/quality_state in \('current', 'stale', 'conflicted'\) and value_numeric is not null/i);
    expect(sql).toMatch(/quality_state in \('missing', 'unknown', 'invalid'\) and value_numeric is null/i);
    expect(sql).toContain("v_previous.evidence_refs || jsonb_build_array(v_observation_id)");
    expect(sql).toContain("v_snapshot_quality := 'conflicted'");
    expect(sql).not.toMatch(/avg\s*\(.*value_numeric/i);
  });

  it("imports idempotently without retaining raw CSV bodies", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql).toContain("manual_import_workspace_source_unique");
    expect(sql).toContain("metric_snapshot_idempotency_unique");
    expect(sql).toContain("'retainedRawBody',false");
    expect(sql).toMatch(/raw CSV bodies are not retained/i);
    expect(sql).toContain("if v_receipt.status='succeeded'");
    expect(sql).toContain("v_quality_score := case v_quality");
  });

  it("requires founder membership and optimistic versions in every RPC", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql.match(/not app\.is_active_member\(p_workspace_id\)/g)).toHaveLength(3);
    expect(sql).toContain("v_actual <> p_expected_version");
    expect(sql).toContain("'founder_approved'");
    expect(sql).toContain("decision_ref");
  });
});
