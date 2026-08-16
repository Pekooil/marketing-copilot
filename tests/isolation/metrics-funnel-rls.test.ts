import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../../supabase/migrations/20260816140000_metrics_funnel.sql",
  import.meta.url,
);

describe("metric and funnel tenant isolation", () => {
  it("adds member and explicit workspace-scoped worker policies to every table", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    for (const table of [
      "metric_definition",
      "metric_definition_version",
      "manual_import_batch",
      "metric_observation",
      "metric_snapshot",
      "funnel_definition",
      "funnel_definition_version",
      "funnel_stage",
    ]) {
      expect(sql).toContain(`create policy ${table}_member_select`);
      expect(sql).toContain(`create policy ${table}_worker_scope`);
    }
    expect(sql).toContain("current_setting('app.workspace_id', true)");
  });

  it("does not grant authenticated update or delete on immutable history", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql).toContain("grant select, insert on app.metric_definition, app.metric_definition_version");
    expect(sql).not.toMatch(/grant update[^;]*app\.metric_snapshot/i);
    expect(sql).not.toMatch(/grant delete[^;]*authenticated/i);
  });
});
