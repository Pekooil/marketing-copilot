import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../../supabase/migrations/20260816180000_posthog_connector.sql", import.meta.url);
const rollbackUrl = new URL("../../supabase/rollbacks/20260816180000_posthog_connector.down.sql", import.meta.url);

describe("PostHog connector persistence", () => {
  it("stores only an opaque secret reference and enforces the least-privilege scope", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql).toContain("create table app.secret_reference");
    expect(sql).toContain("vault_key_ref !~ '(pha_|phr_)'");
    expect(sql).toContain("scopes = '[\"endpoint:read\"]'::jsonb");
    expect(sql).not.toMatch(/grant select[^;]*app\.secret_reference[^;]*authenticated/i);
  });

  it("shares the immutable metric pipeline while requiring exactly one origin", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql).toContain("metric_observation_origin_check");
    expect(sql).toContain("metric_snapshot_origin_check");
    expect(sql).toContain("(import_batch_id is null) <> (sync_run_id is null)");
    expect(sql).toContain("v_previous.evidence_refs||jsonb_build_array(v_observation_id)");
    expect(sql).toContain("v_snapshot_quality:='conflicted'");
    expect(sql).not.toMatch(/avg\s*\(.*value_numeric/i);
  });

  it("commits provider results only through workspace-scoped worker functions", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql).toContain("create function app.commit_connector_sync");
    expect(sql).toContain("create function app.record_connector_sync_failure");
    expect(sql).toContain("worker scope unavailable");
    expect(sql).toMatch(/revoke all on function app\.commit_connector_sync[\s\S]*from public,anon,authenticated/i);
    expect(sql).toMatch(/grant execute on function app\.commit_connector_sync[\s\S]*to app_worker/i);
  });

  it("turns failures stale without overwriting prior evidence", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql).toContain("'connector-failure-v1',v_previous.evidence_refs");
    expect(sql).toContain("then 'error'::app.connector_status else 'degraded'::app.connector_status");
    expect(sql).toContain("last_error_code=p_error_class");
  });

  it("provides an isolated destructive rollback", async () => {
    const sql = await readFile(rollbackUrl, "utf8");
    expect(sql).toContain("delete from app.metric_snapshot where sync_run_id is not null");
    expect(sql).toContain("delete from app.source_record where source_type='posthog_endpoint'");
    expect(sql).toContain("alter column import_batch_id set not null");
  });
});
