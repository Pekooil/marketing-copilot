import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../../supabase/migrations/20260816190000_connector_lineage.sql", import.meta.url);

describe("connector lineage migration contract", () => {
  it("exposes only authenticated aggregate source lineage", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql).toContain("create function public.get_connector_metric_lineage");
    expect(sql).toContain("membership.status = 'active'");
    expect(sql).toContain("evidence_source.source_type = 'posthog_endpoint'");
    expect(sql).toContain("revoke all on function public.get_connector_metric_lineage(uuid) from public, anon");
    expect(sql).not.toMatch(/access_token|refresh_token/i);
  });

  it("allows a revoked provider account to be reconnected without weakening the one-live-connection rule", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql).toContain("create unique index connector_connection_live_account_unique");
    expect(sql).toContain("where status <> 'revoked'");
  });

  it("rotates only the expected opaque vault reference under worker scope", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql).toContain("create function app.rotate_posthog_secret");
    expect(sql).toContain("vault_key_ref = p_expected_vault_key_ref");
    expect(sql).toContain("p_next_vault_key_ref ~ '(pha_|phr_)'");
    expect(sql).toContain("grant execute on function app.rotate_posthog_secret");
  });
});
