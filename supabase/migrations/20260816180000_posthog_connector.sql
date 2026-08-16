begin;

alter table app.source_record drop constraint source_record_supported_type;
alter table app.source_record add constraint source_record_supported_type check (
  content_hash ~ '^[a-f0-9]{64}$' and storage_ref is null and (
    (source_type = 'public_web_page' and provider_object_ref like 'https://%' and sensitivity = 'public')
    or (source_type = 'manual_csv' and provider_object_ref like 'manual_csv:%' and sensitivity = 'confidential')
    or (source_type = 'posthog_endpoint' and provider_object_ref like 'posthog_endpoint:%' and sensitivity = 'confidential')
  )
);

create type app.connector_provider as enum ('posthog');
create type app.connector_region as enum ('us', 'eu');
create type app.connector_status as enum ('pending', 'healthy', 'degraded', 'error', 'revoked');
create type app.sync_run_status as enum ('running', 'succeeded', 'failed');

create table app.connector_connection (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references app.workspace(id) on delete cascade,
  provider app.connector_provider not null,
  provider_account_ref text not null,
  region app.connector_region not null,
  display_name text not null,
  status app.connector_status not null default 'pending',
  scopes jsonb not null default '["endpoint:read"]'::jsonb,
  auth_method text not null default 'oauth_cimd',
  last_healthy_at timestamptz,
  last_error_code text,
  created_by uuid not null references app.user_account(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connector_connection_account_unique unique (workspace_id, provider, provider_account_ref),
  constraint connector_connection_project_id check (provider_account_ref ~ '^[1-9][0-9]{0,19}$'),
  constraint connector_connection_display_name check (length(trim(display_name)) between 1 and 120),
  constraint connector_connection_least_privilege check (scopes = '["endpoint:read"]'::jsonb and auth_method = 'oauth_cimd'),
  constraint connector_connection_safe_error check (last_error_code is null or last_error_code ~ '^[A-Z0-9_]{2,80}$')
);
create unique index connector_one_live_provider_idx on app.connector_connection(workspace_id, provider) where status <> 'revoked';

create table app.secret_reference (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references app.workspace(id) on delete cascade,
  connection_id uuid not null references app.connector_connection(id) on delete cascade,
  vault_provider text not null,
  vault_key_ref text not null,
  credential_type text not null,
  expires_at timestamptz,
  rotated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint secret_reference_connection_unique unique (connection_id),
  constraint secret_reference_fields check (
    length(trim(vault_provider)) between 1 and 80
    and length(trim(vault_key_ref)) between 8 and 500
    and credential_type = 'oauth_token_set'
    and vault_key_ref !~ '(pha_|phr_)'
  )
);

create table app.connector_metric_mapping (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references app.workspace(id) on delete cascade,
  connection_id uuid not null references app.connector_connection(id) on delete cascade,
  metric_definition_id uuid not null references app.metric_definition(id) on delete cascade,
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connector_metric_mapping_unique unique (connection_id, metric_definition_id)
);

create table app.connector_metric_mapping_version (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references app.workspace(id) on delete cascade,
  mapping_id uuid not null references app.connector_metric_mapping(id) on delete cascade,
  version integer not null check (version > 0),
  endpoint_name text not null,
  endpoint_version integer not null check (endpoint_version > 0),
  approval_state app.metric_approval_state not null default 'founder_approved',
  approved_by uuid not null references app.user_account(id),
  decision_ref text not null,
  created_at timestamptz not null default now(),
  constraint connector_mapping_version_unique unique (mapping_id, version),
  constraint connector_mapping_endpoint_safe check (endpoint_name ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$'),
  constraint connector_mapping_decision_not_blank check (length(trim(decision_ref)) > 0)
);
alter table app.connector_metric_mapping add constraint connector_mapping_current_version_fk
foreign key (current_version_id) references app.connector_metric_mapping_version(id) deferrable initially deferred;

create table app.sync_run (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references app.workspace(id) on delete cascade,
  connection_id uuid not null references app.connector_connection(id),
  status app.sync_run_status not null default 'running',
  idempotency_key text not null,
  request_id uuid not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  segment_key text not null,
  attempt integer not null default 1 check (attempt > 0),
  metric_count integer not null check (metric_count between 1 and 50),
  succeeded_count integer not null default 0 check (succeeded_count between 0 and 50),
  error_class text,
  provider_request_ids jsonb not null default '[]'::jsonb,
  checkpoints jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid not null references app.user_account(id),
  constraint sync_run_identity_unique unique (workspace_id, idempotency_key),
  constraint sync_run_request_unique unique (workspace_id, request_id),
  constraint sync_run_window_valid check (window_end > window_start),
  constraint sync_run_segment_not_blank check (length(trim(segment_key)) between 1 and 300),
  constraint sync_run_error_safe check (error_class is null or error_class ~ '^[A-Z0-9_]{2,80}$'),
  constraint sync_run_requests_array check (jsonb_typeof(provider_request_ids) = 'array'),
  constraint sync_run_checkpoints_object check (jsonb_typeof(checkpoints) = 'object'),
  constraint sync_run_completion check (
    (status = 'running' and completed_at is null and error_class is null)
    or (status = 'succeeded' and completed_at is not null and error_class is null)
    or (status = 'failed' and completed_at is not null and error_class is not null)
  )
);

alter table app.metric_observation alter column import_batch_id drop not null;
alter table app.metric_observation add column sync_run_id uuid references app.sync_run(id);
alter table app.metric_observation drop constraint metric_observation_source_row_number_check;
alter table app.metric_observation add constraint metric_observation_source_row_number_check check (source_row_number > 0);
alter table app.metric_observation add constraint metric_observation_origin_check check ((import_batch_id is null) <> (sync_run_id is null));

alter table app.metric_snapshot alter column import_batch_id drop not null;
alter table app.metric_snapshot add column sync_run_id uuid references app.sync_run(id);
alter table app.metric_snapshot add constraint metric_snapshot_origin_check check ((import_batch_id is null) <> (sync_run_id is null));

create index connector_connection_workspace_idx on app.connector_connection(workspace_id, status);
create index connector_mapping_workspace_idx on app.connector_metric_mapping(workspace_id, connection_id);
create index sync_run_workspace_started_idx on app.sync_run(workspace_id, started_at desc);
create index metric_observation_sync_run_idx on app.metric_observation(workspace_id, sync_run_id);
create index metric_snapshot_sync_run_idx on app.metric_snapshot(workspace_id, sync_run_id);

create trigger connector_mapping_version_immutable before update or delete on app.connector_metric_mapping_version
for each row execute function app.reject_metric_history_mutation();

grant select on app.connector_connection, app.connector_metric_mapping, app.connector_metric_mapping_version, app.sync_run to authenticated;
grant select, insert, update, delete on app.connector_connection, app.secret_reference, app.connector_metric_mapping,
  app.connector_metric_mapping_version, app.sync_run to app_worker;

create policy connector_connection_member_select on app.connector_connection for select to authenticated using (app.is_active_member(workspace_id));
create policy connector_metric_mapping_member_select on app.connector_metric_mapping for select to authenticated using (app.is_active_member(workspace_id));
create policy connector_metric_mapping_version_member_select on app.connector_metric_mapping_version for select to authenticated using (app.is_active_member(workspace_id));
create policy sync_run_member_select on app.sync_run for select to authenticated using (app.is_active_member(workspace_id));

create policy connector_connection_worker_scope on app.connector_connection for all to app_worker
using (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
with check (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);
create policy secret_reference_worker_scope on app.secret_reference for all to app_worker
using (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
with check (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);
create policy connector_metric_mapping_worker_scope on app.connector_metric_mapping for all to app_worker
using (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
with check (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);
create policy connector_metric_mapping_version_worker_scope on app.connector_metric_mapping_version for all to app_worker
using (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
with check (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);
create policy sync_run_worker_scope on app.sync_run for all to app_worker
using (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
with check (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);

create function public.get_connector_workspace_state(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid(); v_workspace_name text; v_connection jsonb; v_mappings jsonb; v_runs jsonb;
begin
  if v_user_id is null or not app.is_active_member(p_workspace_id) then raise exception 'workspace unavailable' using errcode='42501'; end if;
  select name into v_workspace_name from app.workspace where id=p_workspace_id;
  select jsonb_build_object(
    'id', connection.id, 'provider', connection.provider, 'region', connection.region,
    'projectId', connection.provider_account_ref, 'displayName', connection.display_name,
    'status', connection.status, 'scopes', connection.scopes,
    'credentialConfigured', exists(select 1 from app.secret_reference as secret where secret.connection_id=connection.id and secret.revoked_at is null),
    'lastHealthyAt', connection.last_healthy_at, 'lastErrorCode', connection.last_error_code
  ) into v_connection from app.connector_connection as connection
  where connection.workspace_id=p_workspace_id order by (connection.status <> 'revoked') desc, connection.created_at desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', mapping.id, 'versionId', version.id, 'version', version.version,
    'connectionId', mapping.connection_id, 'metricDefinitionId', mapping.metric_definition_id,
    'endpointName', version.endpoint_name, 'endpointVersion', version.endpoint_version,
    'approvalState', version.approval_state, 'createdAt', version.created_at
  ) order by version.created_at), '[]'::jsonb) into v_mappings
  from app.connector_metric_mapping as mapping
  inner join app.connector_metric_mapping_version as version on version.id=mapping.current_version_id
  where mapping.workspace_id=p_workspace_id;
  select coalesce(jsonb_agg(item.payload order by item.started_at desc), '[]'::jsonb) into v_runs from (
    select run.started_at, jsonb_build_object(
      'id',run.id,'connectionId',run.connection_id,'status',run.status,'windowStart',run.window_start,
      'windowEnd',run.window_end,'segment',run.segment_key,'metricCount',run.metric_count,
      'succeededCount',run.succeeded_count,'errorClass',run.error_class,
      'startedAt',run.started_at,'completedAt',run.completed_at
    ) as payload from app.sync_run as run where run.workspace_id=p_workspace_id order by run.started_at desc limit 10
  ) as item;
  return jsonb_build_object('workspaceId',p_workspace_id,'workspaceName',v_workspace_name,
    'connection',v_connection,'mappings',v_mappings,'runs',v_runs);
end; $$;

create function public.begin_posthog_connection(
  p_workspace_id uuid, p_region app.connector_region, p_project_id text, p_display_name text,
  p_request_id uuid, p_idempotency_key text
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user_id uuid:=auth.uid(); v_connection app.connector_connection%rowtype; v_hash text; v_receipt app.mutation_receipt%rowtype;
begin
  if v_user_id is null or not app.is_active_member(p_workspace_id) then raise exception 'workspace unavailable' using errcode='42501'; end if;
  if p_project_id !~ '^[1-9][0-9]{0,19}$' or length(trim(p_display_name)) not between 1 and 120 then raise exception 'connection input is invalid' using errcode='22023'; end if;
  v_hash:=encode(extensions.digest(concat_ws(':',p_region::text,p_project_id,trim(p_display_name)),'sha256'),'hex');
  select * into v_receipt from app.mutation_receipt where workspace_id=p_workspace_id and idempotency_key=p_idempotency_key for update;
  if v_receipt.id is not null then
    if v_receipt.request_hash<>v_hash then raise exception 'idempotency key reused' using errcode='23505'; end if;
    if v_receipt.status='succeeded' then return public.get_connector_workspace_state(p_workspace_id); end if;
  else
    insert into app.mutation_receipt(workspace_id,idempotency_key,request_hash,request_id,action,status)
    values(p_workspace_id,p_idempotency_key,v_hash,p_request_id,'connector.connection.started','started') returning * into v_receipt;
  end if;
  select * into v_connection from app.connector_connection where workspace_id=p_workspace_id and provider='posthog' and status<>'revoked' for update;
  if v_connection.id is null then
    insert into app.connector_connection(workspace_id,provider,provider_account_ref,region,display_name,created_by)
    values(p_workspace_id,'posthog',p_project_id,p_region,trim(p_display_name),v_user_id) returning * into v_connection;
  elsif v_connection.status<>'pending' or v_connection.provider_account_ref<>p_project_id then
    raise exception 'an active PostHog connection already exists' using errcode='23505';
  else
    update app.connector_connection set region=p_region,display_name=trim(p_display_name),updated_at=now() where id=v_connection.id;
  end if;
  insert into app.audit_event(workspace_id,actor_type,actor_id,action,target_type,target_id,request_id,result,metadata)
  values(p_workspace_id,'founder',v_user_id::text,'connector.connection.started','connector_connection',v_connection.id::text,p_request_id,'succeeded',jsonb_build_object('provider','posthog','region',p_region));
  update app.mutation_receipt set status='succeeded',result_ref=v_connection.id::text,completed_at=now() where id=v_receipt.id;
  return public.get_connector_workspace_state(p_workspace_id);
end; $$;

create function public.save_connector_mapping(
  p_workspace_id uuid, p_connection_id uuid, p_metric_definition_id uuid,
  p_expected_version integer, p_endpoint_name text, p_endpoint_version integer,
  p_request_id uuid, p_idempotency_key text
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user_id uuid:=auth.uid(); v_mapping app.connector_metric_mapping%rowtype; v_actual integer; v_next integer;
  v_version_id uuid; v_hash text; v_receipt app.mutation_receipt%rowtype; v_count integer;
begin
  if v_user_id is null or not app.is_active_member(p_workspace_id) then raise exception 'workspace unavailable' using errcode='42501'; end if;
  select count(*) into v_count from app.connector_connection where id=p_connection_id and workspace_id=p_workspace_id and status in ('healthy','degraded','error');
  if v_count<>1 then raise exception 'connection unavailable' using errcode='42501'; end if;
  select count(*) into v_count from app.metric_definition where id=p_metric_definition_id and workspace_id=p_workspace_id and status='active';
  if v_count<>1 then raise exception 'metric unavailable' using errcode='42501'; end if;
  if p_endpoint_name !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$' or p_endpoint_version<1 then raise exception 'mapping is invalid' using errcode='22023'; end if;
  v_hash:=encode(extensions.digest(concat_ws(':',p_connection_id::text,p_metric_definition_id::text,p_expected_version::text,p_endpoint_name,p_endpoint_version::text),'sha256'),'hex');
  select * into v_receipt from app.mutation_receipt where workspace_id=p_workspace_id and idempotency_key=p_idempotency_key for update;
  if v_receipt.id is not null then
    if v_receipt.request_hash<>v_hash then raise exception 'idempotency key reused' using errcode='23505'; end if;
    if v_receipt.status='succeeded' then return public.get_connector_workspace_state(p_workspace_id); end if;
  else insert into app.mutation_receipt(workspace_id,idempotency_key,request_hash,request_id,action,status)
    values(p_workspace_id,p_idempotency_key,v_hash,p_request_id,'connector.mapping.saved','started') returning * into v_receipt;
  end if;
  select * into v_mapping from app.connector_metric_mapping where connection_id=p_connection_id and metric_definition_id=p_metric_definition_id for update;
  if v_mapping.id is null then
    if p_expected_version<>0 then raise exception 'stale connector mapping' using errcode='40001'; end if;
    insert into app.connector_metric_mapping(workspace_id,connection_id,metric_definition_id)
    values(p_workspace_id,p_connection_id,p_metric_definition_id) returning * into v_mapping; v_next:=1;
  else
    select version into v_actual from app.connector_metric_mapping_version where id=v_mapping.current_version_id;
    if v_actual<>p_expected_version then raise exception 'stale connector mapping' using errcode='40001'; end if;
    select coalesce(max(version),0)+1 into v_next from app.connector_metric_mapping_version where mapping_id=v_mapping.id;
  end if;
  insert into app.connector_metric_mapping_version(workspace_id,mapping_id,version,endpoint_name,endpoint_version,approved_by,decision_ref)
  values(p_workspace_id,v_mapping.id,v_next,p_endpoint_name,p_endpoint_version,v_user_id,p_request_id::text) returning id into v_version_id;
  update app.connector_metric_mapping set current_version_id=v_version_id,updated_at=now() where id=v_mapping.id;
  insert into app.audit_event(workspace_id,actor_type,actor_id,action,target_type,target_id,target_version,request_id,result,metadata)
  values(p_workspace_id,'founder',v_user_id::text,'connector.mapping.saved','connector_metric_mapping',v_mapping.id::text,v_next,p_request_id,'succeeded',jsonb_build_object('endpointVersion',p_endpoint_version));
  update app.mutation_receipt set status='succeeded',result_ref=v_mapping.id::text,completed_at=now() where id=v_receipt.id;
  return public.get_connector_workspace_state(p_workspace_id);
end; $$;

create function public.revoke_connector_connection(p_workspace_id uuid,p_connection_id uuid,p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_user_id uuid:=auth.uid(); v_count integer;
begin
  if v_user_id is null or not app.is_active_member(p_workspace_id) then raise exception 'workspace unavailable' using errcode='42501'; end if;
  update app.connector_connection set status='revoked',updated_at=now() where id=p_connection_id and workspace_id=p_workspace_id and status<>'revoked' returning 1 into v_count;
  if v_count is null then raise exception 'connection unavailable' using errcode='42501'; end if;
  update app.secret_reference set revoked_at=now() where connection_id=p_connection_id and revoked_at is null;
  insert into app.audit_event(workspace_id,actor_type,actor_id,action,target_type,target_id,request_id,result,metadata)
  values(p_workspace_id,'founder',v_user_id::text,'connector.connection.revoked','connector_connection',p_connection_id::text,p_request_id,'succeeded','{}');
  return public.get_connector_workspace_state(p_workspace_id);
end; $$;

create function app.complete_posthog_connection(
  p_workspace_id uuid,p_connection_id uuid,p_actor_id uuid,p_vault_provider text,p_vault_key_ref text,p_expires_at timestamptz
) returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_workspace_id is distinct from nullif(current_setting('app.workspace_id',true),'')::uuid then raise exception 'worker scope unavailable' using errcode='42501'; end if;
  if not exists(select 1 from app.membership where workspace_id=p_workspace_id and user_id=p_actor_id and status='active') then raise exception 'actor unavailable' using errcode='42501'; end if;
  insert into app.secret_reference(workspace_id,connection_id,vault_provider,vault_key_ref,credential_type,expires_at)
  select p_workspace_id,connection.id,trim(p_vault_provider),trim(p_vault_key_ref),'oauth_token_set',p_expires_at
  from app.connector_connection as connection where connection.id=p_connection_id and connection.workspace_id=p_workspace_id and connection.status='pending';
  if not found then raise exception 'connection unavailable' using errcode='42501'; end if;
  update app.connector_connection set status='healthy',last_healthy_at=now(),last_error_code=null,updated_at=now() where id=p_connection_id;
end; $$;

create function app.get_connector_worker_context(p_workspace_id uuid,p_connection_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if p_workspace_id is distinct from nullif(current_setting('app.workspace_id',true),'')::uuid then raise exception 'worker scope unavailable' using errcode='42501'; end if;
  select jsonb_build_object(
    'connection',jsonb_build_object('id',connection.id,'provider',connection.provider,'region',connection.region,'projectId',connection.provider_account_ref,'displayName',connection.display_name),
    'secretReference',jsonb_build_object('vaultProvider',secret.vault_provider,'vaultKeyRef',secret.vault_key_ref,'expiresAt',secret.expires_at),
    'mappings',coalesce((select jsonb_agg(jsonb_build_object('metricDefinitionId',mapping.metric_definition_id,'endpointName',version.endpoint_name,'endpointVersion',version.endpoint_version))
      from app.connector_metric_mapping as mapping inner join app.connector_metric_mapping_version as version on version.id=mapping.current_version_id where mapping.connection_id=connection.id),'[]'::jsonb)
  ) into v_result from app.connector_connection as connection inner join app.secret_reference as secret on secret.connection_id=connection.id and secret.revoked_at is null
  where connection.id=p_connection_id and connection.workspace_id=p_workspace_id and connection.status in ('healthy','degraded','error');
  if v_result is null then raise exception 'connection unavailable' using errcode='42501'; end if;
  return v_result;
end; $$;

create function app.commit_connector_sync(
  p_workspace_id uuid,p_connection_id uuid,p_actor_id uuid,p_idempotency_key text,p_request_id uuid,
  p_window_start timestamptz,p_window_end timestamptz,p_segment text,p_results jsonb
) returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_run_id uuid; v_result jsonb; v_mapping app.connector_metric_mapping_version%rowtype; v_source_id uuid; v_observation_id uuid;
  v_previous app.metric_snapshot%rowtype; v_value numeric; v_quality app.metric_quality_state; v_evidence jsonb; v_snapshot_quality app.metric_quality_state; v_snapshot_value numeric;
  v_requests jsonb:='[]'::jsonb; v_checkpoints jsonb:='{}'::jsonb;
begin
  if p_workspace_id is distinct from nullif(current_setting('app.workspace_id',true),'')::uuid then raise exception 'worker scope unavailable' using errcode='42501'; end if;
  if p_window_end<=p_window_start or nullif(trim(p_segment),'') is null or jsonb_typeof(p_results)<>'array' or jsonb_array_length(p_results) not between 1 and 50 then raise exception 'sync input is invalid' using errcode='22023'; end if;
  select id into v_run_id from app.sync_run where workspace_id=p_workspace_id and idempotency_key=p_idempotency_key;
  if v_run_id is not null then return; end if;
  insert into app.sync_run(workspace_id,connection_id,status,idempotency_key,request_id,window_start,window_end,segment_key,metric_count,created_by)
  values(p_workspace_id,p_connection_id,'running',p_idempotency_key,p_request_id,p_window_start,p_window_end,trim(p_segment),jsonb_array_length(p_results),p_actor_id) returning id into v_run_id;
  for v_result in select value from jsonb_array_elements(p_results) loop
    select version.* into v_mapping from app.connector_metric_mapping as mapping inner join app.connector_metric_mapping_version as version on version.id=mapping.current_version_id
    where mapping.workspace_id=p_workspace_id and mapping.connection_id=p_connection_id and mapping.metric_definition_id=(v_result->>'metricDefinitionId')::uuid
      and version.endpoint_name=v_result->>'endpointName' and version.endpoint_version=(v_result->>'endpointVersion')::integer;
    if v_mapping.id is null then raise exception 'connector mapping changed' using errcode='40001'; end if;
    if (v_result->>'contentHash') !~ '^[a-f0-9]{64}$' or v_result->>'providerObjectRef' not like 'posthog_endpoint:%'
      or v_result->>'qualityState' not in ('current','unknown') or (v_result->>'windowStart')::timestamptz<>p_window_start
      or (v_result->>'windowEnd')::timestamptz<>p_window_end or v_result->>'segment'<>trim(p_segment) then raise exception 'connector result is invalid' using errcode='22023'; end if;
    v_quality:=(v_result->>'qualityState')::app.metric_quality_state;
    v_value:=case when jsonb_typeof(v_result->'value')='number' then (v_result->>'value')::numeric else null end;
    if (v_quality='current' and v_value is null) or (v_quality='unknown' and v_value is not null) then raise exception 'connector value is invalid' using errcode='22023'; end if;
    insert into app.source_record(workspace_id,source_type,provider_object_ref,content_hash,observed_at,metadata,sensitivity)
    values(p_workspace_id,'posthog_endpoint',v_result->>'providerObjectRef',v_result->>'contentHash',(v_result->>'freshAsOf')::timestamptz,
      jsonb_build_object('endpointName',v_result->>'endpointName','endpointVersion',(v_result->>'endpointVersion')::integer,'providerRequestId',v_result->>'providerRequestId','checkpoint',v_result->>'checkpoint','retainedRawRows',false),'confidential')
    on conflict(workspace_id,source_type,provider_object_ref,content_hash) do nothing;
    select id into v_source_id from app.source_record where workspace_id=p_workspace_id and source_type='posthog_endpoint' and provider_object_ref=v_result->>'providerObjectRef' and content_hash=v_result->>'contentHash';
    insert into app.metric_observation(workspace_id,metric_definition_id,import_batch_id,sync_run_id,source_record_id,source_row_number,row_key,
      window_start,window_end,segment_key,value_numeric,quality_state,quality_score,fresh_as_of,source_note)
    values(p_workspace_id,(v_result->>'metricDefinitionId')::uuid,null,v_run_id,v_source_id,1,v_result->>'contentHash',p_window_start,p_window_end,trim(p_segment),v_value,v_quality,
      case when v_quality='current' then 1 else 0 end,(v_result->>'freshAsOf')::timestamptz,'PostHog aggregate Endpoint') returning id into v_observation_id;
    select * into v_previous from app.metric_snapshot where workspace_id=p_workspace_id and metric_definition_id=(v_result->>'metricDefinitionId')::uuid
      and window_start=p_window_start and window_end=p_window_end and segment_key=trim(p_segment) order by created_at desc,id desc limit 1;
    if v_previous.id is not null and (v_previous.quality_state is distinct from v_quality or v_previous.value_numeric is distinct from v_value) then
      v_snapshot_quality:='conflicted'; v_snapshot_value:=null; v_evidence:=v_previous.evidence_refs||jsonb_build_array(v_observation_id);
    else v_snapshot_quality:=v_quality; v_snapshot_value:=v_value; v_evidence:=jsonb_build_array(v_observation_id); end if;
    insert into app.metric_snapshot(workspace_id,metric_definition_id,import_batch_id,sync_run_id,window_start,window_end,segment_key,value_numeric,quality_state,quality_score,fresh_as_of,calculation_version,evidence_refs,idempotency_key)
    values(p_workspace_id,(v_result->>'metricDefinitionId')::uuid,null,v_run_id,p_window_start,p_window_end,trim(p_segment),v_snapshot_value,v_snapshot_quality,
      case v_snapshot_quality when 'current' then 1 when 'conflicted' then 0.2 else 0 end,(v_result->>'freshAsOf')::timestamptz,'posthog-endpoint-v1',v_evidence,p_idempotency_key||':'||(v_result->>'metricDefinitionId'));
    v_requests:=v_requests||jsonb_build_array(v_result->>'providerRequestId');
    v_checkpoints:=v_checkpoints||jsonb_build_object(v_result->>'metricDefinitionId',v_result->>'checkpoint');
  end loop;
  update app.sync_run set status='succeeded',succeeded_count=jsonb_array_length(p_results),provider_request_ids=v_requests,checkpoints=v_checkpoints,completed_at=now() where id=v_run_id;
  update app.connector_connection set status='healthy',last_healthy_at=now(),last_error_code=null,updated_at=now() where id=p_connection_id and workspace_id=p_workspace_id;
  insert into app.audit_event(workspace_id,actor_type,actor_id,action,target_type,target_id,request_id,result,metadata)
  values(p_workspace_id,'worker',p_actor_id::text,'connector.sync.succeeded','sync_run',v_run_id::text,p_request_id,'succeeded',jsonb_build_object('metricCount',jsonb_array_length(p_results)));
end; $$;

create function app.record_connector_sync_failure(
  p_workspace_id uuid,p_connection_id uuid,p_actor_id uuid,p_idempotency_key text,p_request_id uuid,
  p_window_start timestamptz,p_window_end timestamptz,p_segment text,p_metric_count integer,p_error_class text
) returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_run_id uuid; v_mapping record; v_previous app.metric_snapshot%rowtype;
begin
  if p_workspace_id is distinct from nullif(current_setting('app.workspace_id',true),'')::uuid then raise exception 'worker scope unavailable' using errcode='42501'; end if;
  if p_error_class is null or p_error_class !~ '^[A-Z0-9_]{2,80}$' or p_metric_count not between 1 and 50 then raise exception 'failure input is invalid' using errcode='22023'; end if;
  insert into app.sync_run(workspace_id,connection_id,status,idempotency_key,request_id,window_start,window_end,segment_key,metric_count,error_class,completed_at,created_by)
  values(p_workspace_id,p_connection_id,'failed',p_idempotency_key,p_request_id,p_window_start,p_window_end,trim(p_segment),p_metric_count,p_error_class,now(),p_actor_id)
  on conflict(workspace_id,idempotency_key) do nothing returning id into v_run_id;
  if v_run_id is null then return; end if;
  for v_mapping in select mapping.metric_definition_id from app.connector_metric_mapping as mapping where mapping.connection_id=p_connection_id loop
    select * into v_previous from app.metric_snapshot where workspace_id=p_workspace_id and metric_definition_id=v_mapping.metric_definition_id order by created_at desc,id desc limit 1;
    if v_previous.id is not null and v_previous.value_numeric is not null then
      insert into app.metric_snapshot(workspace_id,metric_definition_id,import_batch_id,sync_run_id,window_start,window_end,segment_key,value_numeric,quality_state,quality_score,fresh_as_of,calculation_version,evidence_refs,idempotency_key)
      values(p_workspace_id,v_mapping.metric_definition_id,null,v_run_id,v_previous.window_start,v_previous.window_end,v_previous.segment_key,v_previous.value_numeric,'stale',0.5,v_previous.fresh_as_of,'connector-failure-v1',v_previous.evidence_refs,p_idempotency_key||':'||v_mapping.metric_definition_id);
    end if;
  end loop;
  update app.connector_connection set status=case when p_error_class in ('POSTHOG_CREDENTIAL_EXPIRED','POSTHOG_SCOPE_DENIED','POSTHOG_ENDPOINT_MISSING') then 'error'::app.connector_status else 'degraded'::app.connector_status end,
    last_error_code=p_error_class,updated_at=now() where id=p_connection_id and workspace_id=p_workspace_id;
  insert into app.audit_event(workspace_id,actor_type,actor_id,action,target_type,target_id,request_id,result,metadata)
  values(p_workspace_id,'worker',p_actor_id::text,'connector.sync.failed','sync_run',v_run_id::text,p_request_id,'succeeded',jsonb_build_object('errorClass',p_error_class));
end; $$;

revoke all on function public.get_connector_workspace_state(uuid) from public,anon;
revoke all on function public.begin_posthog_connection(uuid,app.connector_region,text,text,uuid,text) from public,anon;
revoke all on function public.save_connector_mapping(uuid,uuid,uuid,integer,text,integer,uuid,text) from public,anon;
revoke all on function public.revoke_connector_connection(uuid,uuid,uuid) from public,anon;
grant execute on function public.get_connector_workspace_state(uuid) to authenticated;
grant execute on function public.begin_posthog_connection(uuid,app.connector_region,text,text,uuid,text) to authenticated;
grant execute on function public.save_connector_mapping(uuid,uuid,uuid,integer,text,integer,uuid,text) to authenticated;
grant execute on function public.revoke_connector_connection(uuid,uuid,uuid) to authenticated;
revoke all on function app.complete_posthog_connection(uuid,uuid,uuid,text,text,timestamptz) from public,anon,authenticated;
revoke all on function app.get_connector_worker_context(uuid,uuid) from public,anon,authenticated;
revoke all on function app.commit_connector_sync(uuid,uuid,uuid,text,uuid,timestamptz,timestamptz,text,jsonb) from public,anon,authenticated;
revoke all on function app.record_connector_sync_failure(uuid,uuid,uuid,text,uuid,timestamptz,timestamptz,text,integer,text) from public,anon,authenticated;
grant execute on function app.complete_posthog_connection(uuid,uuid,uuid,text,text,timestamptz) to app_worker;
grant execute on function app.get_connector_worker_context(uuid,uuid) to app_worker;
grant execute on function app.commit_connector_sync(uuid,uuid,uuid,text,uuid,timestamptz,timestamptz,text,jsonb) to app_worker;
grant execute on function app.record_connector_sync_failure(uuid,uuid,uuid,text,uuid,timestamptz,timestamptz,text,integer,text) to app_worker;

comment on table app.secret_reference is 'Opaque managed-vault pointer only; connector credential material is forbidden.';
comment on function app.commit_connector_sync(uuid,uuid,uuid,text,uuid,timestamptz,timestamptz,text,jsonb) is 'Worker-only atomic aggregate sync commit; browser clients cannot submit provider results.';

commit;
