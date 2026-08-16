import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../../supabase/migrations/20260816210000_supabase_vault.sql", import.meta.url);
const rollbackUrl = new URL("../../supabase/rollbacks/20260816210000_supabase_vault.down.sql", import.meta.url);

describe("Supabase Vault connector boundary", () => {
  it("stores tokens in Vault while application tables receive only an opaque UUID", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql).toContain("create extension if not exists supabase_vault");
    expect(sql).toContain("select vault.create_secret(");
    expect(sql).toContain("'supabase-vault-v1', v_vault_id::text");
    expect(sql).toContain("inner join vault.decrypted_secrets as vault_secret");
    expect(sql).toContain("vault_secret.id::text = secret.vault_key_ref");
  });

  it("validates the complete token set and rotates the same expected Vault secret", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql).toContain("pg_catalog.jsonb_object_length(p_token_set) <> 3");
    expect(sql).toContain("p_token_set ?& array['accessToken','refreshToken','expiresAt']");
    expect(sql).toContain("create function app.rotate_posthog_secret_vault");
    expect(sql).toContain("secret.vault_key_ref = p_expected_vault_key_ref");
    expect(sql).toContain("perform vault.update_secret(");
  });

  it("keeps every credential operation worker-only and workspace-scoped", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    for (const signature of [
      "app.complete_posthog_connection_vault(uuid,uuid,uuid,jsonb)",
      "app.read_posthog_secret(uuid,uuid)",
      "app.rotate_posthog_secret_vault(uuid,uuid,uuid,text,jsonb)",
      "app.revoke_posthog_secret_vault(uuid,uuid,uuid,uuid)",
    ]) {
      expect(sql).toContain(`revoke all on function ${signature} from public, anon, authenticated`);
      expect(sql).toContain(`grant execute on function ${signature} to app_worker`);
    }
    expect(sql).toContain("current_setting('app.workspace_id', true)");
    expect(sql).toContain("membership");
    expect(sql).toContain("revoke all on schema vault from public, anon, authenticated, app_worker");
    expect(sql).toContain("revoke all on all tables in schema vault from public, anon, authenticated, app_worker");
    expect(sql).toContain("revoke execute on function public.revoke_connector_connection(uuid,uuid,uuid) from authenticated");
    expect(sql).toContain("revoke execute on function app.complete_posthog_connection(uuid,uuid,uuid,text,text,timestamptz) from app_worker");
    expect(sql).toContain("revoke execute on function app.rotate_posthog_secret(uuid,uuid,uuid,text,text,timestamptz) from app_worker");
    expect(sql).toContain("revoke select, insert, update, delete on app.secret_reference from app_worker");
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete)[^;]*vault\.(secrets|decrypted_secrets)/i);
  });

  it("deletes the live Vault secret atomically and scopes destructive rollback cleanup", async () => {
    const migration = await readFile(migrationUrl, "utf8");
    const rollback = await readFile(rollbackUrl, "utf8");
    expect(migration).toContain("delete from vault.secrets where id::text = v_vault_key_ref");
    expect(migration).toContain("set status = 'revoked'");
    expect(rollback).toContain("delete from vault.secrets where name like 'marketing-copilot:posthog:%'");
    expect(rollback).not.toContain("drop extension");
  });
});
