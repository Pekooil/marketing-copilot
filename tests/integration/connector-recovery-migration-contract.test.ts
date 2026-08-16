import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../../supabase/migrations/20260816200000_connector_recovery.sql", import.meta.url);
const rollbackUrl = new URL("../../supabase/rollbacks/20260816200000_connector_recovery.down.sql", import.meta.url);

describe("connector replay and recovery migration", () => {
  it("validates exact committed evidence before replay recovery", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql).toContain("v_replay:=true");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("sync replay does not match committed evidence");
    expect(sql).toContain("v_previous.quality_state='stale'");
    expect(sql).toContain("'posthog-recovery-v1'");
    expect(sql).toContain("on conflict(workspace_id,idempotency_key) do nothing");
  });

  it("requires worker scope and an active founder actor", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql).toContain("current_setting('app.workspace_id',true)");
    expect(sql).toContain("user_id=p_actor_id and status='active'");
    expect(sql).toContain("worker scope unavailable");
  });

  it("returns mappings and runs only for the selected live connection", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql).toContain("mapping.connection_id=v_connection_id");
    expect(sql).toContain("run.connection_id=v_connection_id");
  });

  it("keeps backward-compatible functions available until the full isolated connector rollback", async () => {
    const sql = await readFile(rollbackUrl, "utf8");
    expect(sql).toContain("Backward-compatible Sprint 4 sync implementation retained");
    expect(sql).toContain("earlier connector down migration removes it");
    expect(sql).not.toContain("drop function");
  });
});
