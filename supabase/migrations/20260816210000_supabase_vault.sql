begin;

create extension if not exists supabase_vault;
revoke all on schema vault from public, anon, authenticated, app_worker;
revoke all on all tables in schema vault from public, anon, authenticated, app_worker;

create function app.validate_posthog_token_set(p_token_set jsonb)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_expires_at timestamptz;
begin
  if jsonb_typeof(p_token_set) <> 'object'
    or pg_catalog.jsonb_object_length(p_token_set) <> 3
    or not p_token_set ?& array['accessToken','refreshToken','expiresAt']
    or jsonb_typeof(p_token_set -> 'accessToken') <> 'string'
    or jsonb_typeof(p_token_set -> 'refreshToken') <> 'string'
    or jsonb_typeof(p_token_set -> 'expiresAt') <> 'string'
    or p_token_set ->> 'accessToken' !~ '^pha_[A-Za-z0-9_-]{8,}$'
    or p_token_set ->> 'refreshToken' !~ '^phr_[A-Za-z0-9_-]{8,}$'
  then
    raise exception 'token set is invalid' using errcode = '22023';
  end if;

  begin
    v_expires_at := (p_token_set ->> 'expiresAt')::timestamptz;
  exception when others then
    raise exception 'token set is invalid' using errcode = '22023';
  end;
  if v_expires_at <= now() then
    raise exception 'token set is expired' using errcode = '22023';
  end if;
  return v_expires_at;
end;
$$;

create function app.complete_posthog_connection_vault(
  p_workspace_id uuid,
  p_connection_id uuid,
  p_actor_id uuid,
  p_token_set jsonb
) returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_expires_at timestamptz;
  v_vault_id uuid;
begin
  if p_workspace_id is distinct from nullif(current_setting('app.workspace_id', true), '')::uuid
    or not exists (
      select 1 from app.membership
      where workspace_id = p_workspace_id and user_id = p_actor_id and status = 'active'
    ) then
    raise exception 'worker scope unavailable' using errcode = '42501';
  end if;
  if not exists (
    select 1 from app.connector_connection
    where id = p_connection_id and workspace_id = p_workspace_id and status = 'pending'
    for update
  ) then
    raise exception 'connection unavailable' using errcode = '42501';
  end if;

  v_expires_at := app.validate_posthog_token_set(p_token_set);
  select vault.create_secret(
    p_token_set::text,
    'marketing-copilot:posthog:' || p_connection_id::text,
    'Marketing Copilot PostHog OAuth token set. Read only through app worker functions.'
  ) into v_vault_id;

  insert into app.secret_reference(
    workspace_id, connection_id, vault_provider, vault_key_ref, credential_type, expires_at
  ) values (
    p_workspace_id, p_connection_id, 'supabase-vault-v1', v_vault_id::text, 'oauth_token_set', v_expires_at
  );
  update app.connector_connection
  set status = 'healthy', last_healthy_at = now(), last_error_code = null, updated_at = now()
  where id = p_connection_id and workspace_id = p_workspace_id;
  return v_vault_id;
end;
$$;

create function app.read_posthog_secret(p_workspace_id uuid, p_connection_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_token_set jsonb;
begin
  if p_workspace_id is distinct from nullif(current_setting('app.workspace_id', true), '')::uuid then
    raise exception 'worker scope unavailable' using errcode = '42501';
  end if;
  select vault_secret.decrypted_secret::jsonb into v_token_set
  from app.connector_connection as connection
  inner join app.secret_reference as secret
    on secret.connection_id = connection.id
    and secret.workspace_id = connection.workspace_id
    and secret.vault_provider = 'supabase-vault-v1'
    and secret.revoked_at is null
  inner join vault.decrypted_secrets as vault_secret
    on vault_secret.id::text = secret.vault_key_ref
  where connection.id = p_connection_id
    and connection.workspace_id = p_workspace_id
    and connection.status in ('healthy','degraded','error');
  if v_token_set is null then
    raise exception 'credential unavailable' using errcode = '42501';
  end if;
  perform app.validate_posthog_token_set(v_token_set);
  return v_token_set;
end;
$$;

create function app.rotate_posthog_secret_vault(
  p_workspace_id uuid,
  p_connection_id uuid,
  p_actor_id uuid,
  p_expected_vault_key_ref text,
  p_token_set jsonb
) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_expires_at timestamptz;
  v_vault_id uuid;
begin
  if p_workspace_id is distinct from nullif(current_setting('app.workspace_id', true), '')::uuid
    or not exists (
      select 1 from app.membership
      where workspace_id = p_workspace_id and user_id = p_actor_id and status = 'active'
    ) then
    raise exception 'worker scope unavailable' using errcode = '42501';
  end if;
  v_expires_at := app.validate_posthog_token_set(p_token_set);
  select secret.vault_key_ref::uuid into v_vault_id
  from app.secret_reference as secret
  inner join app.connector_connection as connection on connection.id = secret.connection_id
  where secret.workspace_id = p_workspace_id
    and secret.connection_id = p_connection_id
    and secret.vault_provider = 'supabase-vault-v1'
    and secret.vault_key_ref = p_expected_vault_key_ref
    and secret.revoked_at is null
    and connection.status in ('healthy','degraded','error')
  for update of secret;
  if v_vault_id is null then
    raise exception 'secret reference changed' using errcode = '40001';
  end if;

  perform vault.update_secret(
    v_vault_id,
    p_token_set::text,
    'marketing-copilot:posthog:' || p_connection_id::text,
    'Marketing Copilot PostHog OAuth token set. Read only through app worker functions.'
  );
  update app.secret_reference
  set expires_at = v_expires_at, rotated_at = now()
  where workspace_id = p_workspace_id and connection_id = p_connection_id;
  update app.connector_connection
  set status = 'healthy', last_healthy_at = now(), last_error_code = null, updated_at = now()
  where workspace_id = p_workspace_id and id = p_connection_id and status <> 'revoked';
end;
$$;

create function app.revoke_posthog_secret_vault(
  p_workspace_id uuid,
  p_connection_id uuid,
  p_actor_id uuid,
  p_request_id uuid
) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status app.connector_status;
  v_provider text;
  v_vault_key_ref text;
begin
  if p_workspace_id is distinct from nullif(current_setting('app.workspace_id', true), '')::uuid
    or not exists (
      select 1 from app.membership
      where workspace_id = p_workspace_id and user_id = p_actor_id and status = 'active'
    ) then
    raise exception 'worker scope unavailable' using errcode = '42501';
  end if;
  select status into v_status from app.connector_connection
  where id = p_connection_id and workspace_id = p_workspace_id for update;
  if v_status is null then
    raise exception 'connection unavailable' using errcode = '42501';
  end if;
  if v_status = 'revoked' then return; end if;

  select vault_provider, vault_key_ref into v_provider, v_vault_key_ref
  from app.secret_reference
  where workspace_id = p_workspace_id and connection_id = p_connection_id and revoked_at is null
  for update;
  if v_provider = 'supabase-vault-v1' then
    delete from vault.secrets where id::text = v_vault_key_ref;
  end if;
  update app.secret_reference
  set revoked_at = coalesce(revoked_at, now())
  where workspace_id = p_workspace_id and connection_id = p_connection_id;
  update app.connector_connection
  set status = 'revoked', updated_at = now()
  where workspace_id = p_workspace_id and id = p_connection_id;
  insert into app.audit_event(
    workspace_id, actor_type, actor_id, action, target_type, target_id, request_id, result, metadata
  ) values (
    p_workspace_id, 'founder', p_actor_id::text, 'connector.connection.revoked',
    'connector_connection', p_connection_id::text, p_request_id, 'succeeded',
    jsonb_build_object('vaultProvider', coalesce(v_provider, 'none'))
  );
end;
$$;

update app.secret_reference
set revoked_at = coalesce(revoked_at, now())
where vault_provider <> 'supabase-vault-v1' and revoked_at is null;
update app.connector_connection as connection
set status = 'revoked', updated_at = now()
where status <> 'revoked'
  and exists (
    select 1 from app.secret_reference as secret
    where secret.connection_id = connection.id
      and secret.vault_provider <> 'supabase-vault-v1'
  );

revoke all on function app.validate_posthog_token_set(jsonb) from public, anon, authenticated;
revoke all on function app.complete_posthog_connection_vault(uuid,uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function app.read_posthog_secret(uuid,uuid) from public, anon, authenticated;
revoke all on function app.rotate_posthog_secret_vault(uuid,uuid,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function app.revoke_posthog_secret_vault(uuid,uuid,uuid,uuid) from public, anon, authenticated;
revoke execute on function public.revoke_connector_connection(uuid,uuid,uuid) from authenticated;
revoke execute on function app.complete_posthog_connection(uuid,uuid,uuid,text,text,timestamptz) from app_worker;
revoke execute on function app.rotate_posthog_secret(uuid,uuid,uuid,text,text,timestamptz) from app_worker;
revoke select, insert, update, delete on app.secret_reference from app_worker;
grant execute on function app.validate_posthog_token_set(jsonb) to app_worker;
grant execute on function app.complete_posthog_connection_vault(uuid,uuid,uuid,jsonb) to app_worker;
grant execute on function app.read_posthog_secret(uuid,uuid) to app_worker;
grant execute on function app.rotate_posthog_secret_vault(uuid,uuid,uuid,text,jsonb) to app_worker;
grant execute on function app.revoke_posthog_secret_vault(uuid,uuid,uuid,uuid) to app_worker;

comment on function app.complete_posthog_connection_vault(uuid,uuid,uuid,jsonb) is
'Atomically stores a validated PostHog OAuth token set in Supabase Vault and persists only its opaque UUID reference.';
comment on function app.read_posthog_secret(uuid,uuid) is
'Worker-only, workspace-scoped credential access. Browser roles and app_worker have no direct Vault schema access.';
comment on function app.revoke_posthog_secret_vault(uuid,uuid,uuid,uuid) is
'Atomically deletes the Supabase Vault secret, revokes its opaque reference, and preserves historical aggregate evidence.';

commit;
