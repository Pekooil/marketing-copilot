begin;

revoke all on function app.revoke_posthog_secret_vault(uuid,uuid,uuid,uuid) from app_worker;
revoke all on function app.rotate_posthog_secret_vault(uuid,uuid,uuid,text,jsonb) from app_worker;
revoke all on function app.read_posthog_secret(uuid,uuid) from app_worker;
revoke all on function app.complete_posthog_connection_vault(uuid,uuid,uuid,jsonb) from app_worker;
revoke all on function app.validate_posthog_token_set(jsonb) from app_worker;

update app.connector_connection as connection
set status = 'revoked', updated_at = now()
where status <> 'revoked'
  and exists (
    select 1 from app.secret_reference as secret
    where secret.connection_id = connection.id and secret.vault_provider = 'supabase-vault-v1'
  );
update app.secret_reference
set revoked_at = coalesce(revoked_at, now())
where vault_provider = 'supabase-vault-v1';
delete from vault.secrets where name like 'marketing-copilot:posthog:%';

drop function if exists app.revoke_posthog_secret_vault(uuid,uuid,uuid,uuid);
drop function if exists app.rotate_posthog_secret_vault(uuid,uuid,uuid,text,jsonb);
drop function if exists app.read_posthog_secret(uuid,uuid);
drop function if exists app.complete_posthog_connection_vault(uuid,uuid,uuid,jsonb);
drop function if exists app.validate_posthog_token_set(jsonb);
grant execute on function public.revoke_connector_connection(uuid,uuid,uuid) to authenticated;
grant execute on function app.complete_posthog_connection(uuid,uuid,uuid,text,text,timestamptz) to app_worker;
grant execute on function app.rotate_posthog_secret(uuid,uuid,uuid,text,text,timestamptz) to app_worker;
grant select, insert, update, delete on app.secret_reference to app_worker;

commit;
