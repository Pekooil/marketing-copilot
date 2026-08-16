import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../../supabase/migrations/20260816180000_posthog_connector.sql", import.meta.url);

describe("PostHog connector isolation", () => {
  it("adds member-read and explicit worker-scope policies", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    for (const table of ["connector_connection", "connector_metric_mapping", "connector_metric_mapping_version", "sync_run"]) {
      expect(sql).toContain(`create policy ${table}_member_select`);
      expect(sql).toContain(`create policy ${table}_worker_scope`);
    }
    expect(sql).toContain("create policy secret_reference_worker_scope");
    expect(sql).not.toContain("secret_reference_member_select");
  });

  it("authorizes every founder RPC by active workspace membership", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql.match(/not app\.is_active_member\(p_workspace_id\)/g)).toHaveLength(4);
    expect(sql).toMatch(/get_connector_workspace_state[\s\S]*workspace unavailable/i);
  });

  it("never grants browser roles write access to connection or sync tables", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql).toContain("grant select on app.connector_connection");
    expect(sql).not.toMatch(/grant (insert|update|delete)[^;]*to authenticated/i);
    expect(sql).toContain("grant select, insert, update, delete on app.connector_connection");
  });
});
