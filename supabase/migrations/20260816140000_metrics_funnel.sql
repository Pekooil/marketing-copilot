begin;

alter table app.source_record drop constraint source_record_public_web;
alter table app.source_record add constraint source_record_supported_type check (
  content_hash ~ '^[a-f0-9]{64}$'
  and storage_ref is null
  and (
    (source_type = 'public_web_page' and provider_object_ref like 'https://%' and sensitivity = 'public')
    or (source_type = 'manual_csv' and provider_object_ref like 'manual_csv:%' and sensitivity = 'confidential')
  )
);

create type app.metric_definition_status as enum ('draft', 'active');
create type app.metric_approval_state as enum ('draft', 'founder_approved');
create type app.metric_unit as enum ('count', 'percentage', 'currency_minor', 'seconds', 'custom');
create type app.metric_aggregation as enum ('count', 'sum', 'average', 'unique', 'ratio', 'latest');
create type app.metric_quality_state as enum ('current', 'stale', 'missing', 'conflicted', 'invalid', 'unknown');
create type app.funnel_definition_status as enum ('draft', 'active');
create type app.canonical_funnel_stage as enum ('awareness', 'acquisition', 'conversion', 'activation', 'retention', 'revenue', 'referral');
create type app.funnel_mapping_state as enum ('mapped', 'unmapped');

create table app.metric_definition (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references app.workspace(id) on delete cascade,
  name_key text not null,
  current_version_id uuid,
  status app.metric_definition_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint metric_definition_workspace_name_unique unique (workspace_id, name_key),
  constraint metric_definition_name_key_not_blank check (length(trim(name_key)) > 0)
);

create table app.metric_definition_version (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references app.workspace(id) on delete cascade,
  metric_definition_id uuid not null references app.metric_definition(id) on delete cascade,
  version integer not null check (version > 0),
  name text not null,
  business_definition text not null,
  unit app.metric_unit not null,
  custom_unit text,
  aggregation app.metric_aggregation not null,
  segment_contract jsonb not null,
  source_contract jsonb not null,
  timezone text not null,
  freshness_hours integer not null check (freshness_hours between 1 and 8760),
  approval_state app.metric_approval_state not null,
  created_by uuid not null references app.user_account(id),
  created_at timestamptz not null default now(),
  constraint metric_definition_version_unique unique (metric_definition_id, version),
  constraint metric_definition_version_fields check (
    length(trim(name)) between 1 and 120
    and length(trim(business_definition)) between 1 and 1000
    and jsonb_typeof(segment_contract) = 'object'
    and jsonb_typeof(source_contract) = 'object'
    and ((unit = 'custom' and nullif(trim(custom_unit), '') is not null) or (unit <> 'custom' and custom_unit is null))
  )
);

alter table app.metric_definition add constraint metric_definition_current_version_fk
foreign key (current_version_id) references app.metric_definition_version(id)
deferrable initially deferred;

create table app.manual_import_batch (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references app.workspace(id) on delete cascade,
  source_record_id uuid not null references app.source_record(id),
  source_hash text not null,
  filename text not null,
  row_count integer not null check (row_count between 1 and 500),
  request_id uuid not null,
  created_by uuid not null references app.user_account(id),
  created_at timestamptz not null default now(),
  constraint manual_import_workspace_source_unique unique (workspace_id, source_hash),
  constraint manual_import_request_unique unique (workspace_id, request_id),
  constraint manual_import_filename_safe check (length(trim(filename)) between 1 and 255 and filename !~ '[/\\]')
);

create table app.metric_observation (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references app.workspace(id) on delete cascade,
  metric_definition_id uuid not null references app.metric_definition(id),
  import_batch_id uuid not null references app.manual_import_batch(id),
  source_record_id uuid not null references app.source_record(id),
  source_row_number integer not null check (source_row_number > 1),
  row_key text not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  segment_key text not null,
  value_numeric numeric,
  quality_state app.metric_quality_state not null,
  quality_score numeric(4,3) not null check (quality_score between 0 and 1),
  fresh_as_of timestamptz not null,
  source_note text not null,
  created_at timestamptz not null default now(),
  constraint metric_observation_row_unique unique (import_batch_id, source_row_number),
  constraint metric_observation_identity_unique unique (workspace_id, metric_definition_id, row_key, source_record_id),
  constraint metric_observation_window_valid check (window_end > window_start),
  constraint metric_observation_segment_not_blank check (length(trim(segment_key)) between 1 and 300),
  constraint metric_observation_source_note_not_blank check (length(trim(source_note)) between 1 and 500),
  constraint metric_observation_value_quality check (
    (quality_state in ('current', 'stale', 'conflicted') and value_numeric is not null)
    or (quality_state in ('missing', 'unknown', 'invalid') and value_numeric is null)
  )
);

create table app.metric_snapshot (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references app.workspace(id) on delete cascade,
  metric_definition_id uuid not null references app.metric_definition(id),
  import_batch_id uuid not null references app.manual_import_batch(id),
  window_start timestamptz not null,
  window_end timestamptz not null,
  segment_key text not null,
  value_numeric numeric,
  quality_state app.metric_quality_state not null,
  quality_score numeric(4,3) not null check (quality_score between 0 and 1),
  fresh_as_of timestamptz not null,
  calculation_version text not null,
  evidence_refs jsonb not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint metric_snapshot_idempotency_unique unique (workspace_id, idempotency_key),
  constraint metric_snapshot_window_valid check (window_end > window_start),
  constraint metric_snapshot_evidence_array check (jsonb_typeof(evidence_refs) = 'array' and jsonb_array_length(evidence_refs) > 0),
  constraint metric_snapshot_value_quality check (
    (quality_state in ('current', 'stale') and value_numeric is not null)
    or (quality_state in ('missing', 'conflicted', 'invalid', 'unknown') and value_numeric is null)
  )
);

create table app.funnel_definition (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references app.workspace(id) on delete cascade,
  current_version_id uuid,
  status app.funnel_definition_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funnel_definition_workspace_unique unique (workspace_id)
);

create table app.funnel_definition_version (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references app.workspace(id) on delete cascade,
  funnel_definition_id uuid not null references app.funnel_definition(id) on delete cascade,
  version integer not null check (version > 0),
  name text not null,
  approved_by uuid not null references app.user_account(id),
  decision_ref text not null,
  created_at timestamptz not null default now(),
  constraint funnel_definition_version_unique unique (funnel_definition_id, version),
  constraint funnel_definition_name_not_blank check (length(trim(name)) between 1 and 120),
  constraint funnel_definition_decision_not_blank check (length(trim(decision_ref)) > 0)
);

alter table app.funnel_definition add constraint funnel_definition_current_version_fk
foreign key (current_version_id) references app.funnel_definition_version(id)
deferrable initially deferred;

create table app.funnel_stage (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references app.workspace(id) on delete cascade,
  funnel_version_id uuid not null references app.funnel_definition_version(id) on delete cascade,
  stage app.canonical_funnel_stage not null,
  label text not null,
  position integer not null check (position between 0 and 6),
  metric_definition_id uuid references app.metric_definition(id),
  definition text not null,
  included boolean not null,
  mapping_state app.funnel_mapping_state not null,
  quality_threshold numeric(4,3) not null default 1 check (quality_threshold between 0 and 1),
  created_at timestamptz not null default now(),
  constraint funnel_stage_version_stage_unique unique (funnel_version_id, stage),
  constraint funnel_stage_version_position_unique unique (funnel_version_id, position),
  constraint funnel_stage_mapping_valid check (
    (included and mapping_state = 'mapped' and metric_definition_id is not null)
    or (not included and mapping_state = 'unmapped' and metric_definition_id is null)
  ),
  constraint funnel_stage_text_valid check (length(trim(label)) between 1 and 80 and length(trim(definition)) between 1 and 1000)
);

create index metric_definition_version_workspace_idx on app.metric_definition_version(workspace_id, metric_definition_id);
create index metric_observation_scope_idx on app.metric_observation(workspace_id, metric_definition_id, window_start, window_end, segment_key);
create index metric_snapshot_latest_idx on app.metric_snapshot(workspace_id, metric_definition_id, created_at desc);
create index manual_import_workspace_created_idx on app.manual_import_batch(workspace_id, created_at desc);
create index funnel_stage_workspace_version_idx on app.funnel_stage(workspace_id, funnel_version_id, position);

create trigger metric_definition_updated_at before update on app.metric_definition
for each row execute function app.set_updated_at();
create trigger funnel_definition_updated_at before update on app.funnel_definition
for each row execute function app.set_updated_at();

create function app.reject_metric_history_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'metric and funnel history is immutable' using errcode = '55000';
end;
$$;

create trigger metric_definition_version_immutable before update or delete on app.metric_definition_version for each row execute function app.reject_metric_history_mutation();
create trigger manual_import_batch_immutable before update or delete on app.manual_import_batch for each row execute function app.reject_metric_history_mutation();
create trigger metric_observation_immutable before update or delete on app.metric_observation for each row execute function app.reject_metric_history_mutation();
create trigger metric_snapshot_immutable before update or delete on app.metric_snapshot for each row execute function app.reject_metric_history_mutation();
create trigger funnel_definition_version_immutable before update or delete on app.funnel_definition_version for each row execute function app.reject_metric_history_mutation();
create trigger funnel_stage_immutable before update or delete on app.funnel_stage for each row execute function app.reject_metric_history_mutation();

grant select, insert on app.metric_definition, app.metric_definition_version, app.manual_import_batch,
  app.metric_observation, app.metric_snapshot, app.funnel_definition, app.funnel_definition_version,
  app.funnel_stage to authenticated;
grant update (name_key, current_version_id, status) on app.metric_definition to authenticated;
grant update (current_version_id, status) on app.funnel_definition to authenticated;
grant select, insert, update, delete on app.metric_definition, app.metric_definition_version,
  app.manual_import_batch, app.metric_observation, app.metric_snapshot, app.funnel_definition,
  app.funnel_definition_version, app.funnel_stage to app_worker;

create policy metric_definition_member_select on app.metric_definition for select to authenticated using (app.is_active_member(workspace_id));
create policy metric_definition_member_insert on app.metric_definition for insert to authenticated with check (app.is_active_member(workspace_id));
create policy metric_definition_member_update on app.metric_definition for update to authenticated using (app.is_active_member(workspace_id)) with check (app.is_active_member(workspace_id));
create policy metric_definition_version_member_select on app.metric_definition_version for select to authenticated using (app.is_active_member(workspace_id));
create policy metric_definition_version_member_insert on app.metric_definition_version for insert to authenticated with check (app.is_active_member(workspace_id));
create policy manual_import_batch_member_select on app.manual_import_batch for select to authenticated using (app.is_active_member(workspace_id));
create policy manual_import_batch_member_insert on app.manual_import_batch for insert to authenticated with check (app.is_active_member(workspace_id));
create policy metric_observation_member_select on app.metric_observation for select to authenticated using (app.is_active_member(workspace_id));
create policy metric_observation_member_insert on app.metric_observation for insert to authenticated with check (app.is_active_member(workspace_id));
create policy metric_snapshot_member_select on app.metric_snapshot for select to authenticated using (app.is_active_member(workspace_id));
create policy metric_snapshot_member_insert on app.metric_snapshot for insert to authenticated with check (app.is_active_member(workspace_id));
create policy funnel_definition_member_select on app.funnel_definition for select to authenticated using (app.is_active_member(workspace_id));
create policy funnel_definition_member_insert on app.funnel_definition for insert to authenticated with check (app.is_active_member(workspace_id));
create policy funnel_definition_member_update on app.funnel_definition for update to authenticated using (app.is_active_member(workspace_id)) with check (app.is_active_member(workspace_id));
create policy funnel_definition_version_member_select on app.funnel_definition_version for select to authenticated using (app.is_active_member(workspace_id));
create policy funnel_definition_version_member_insert on app.funnel_definition_version for insert to authenticated with check (app.is_active_member(workspace_id));
create policy funnel_stage_member_select on app.funnel_stage for select to authenticated using (app.is_active_member(workspace_id));
create policy funnel_stage_member_insert on app.funnel_stage for insert to authenticated with check (app.is_active_member(workspace_id));

create policy metric_definition_worker_scope on app.metric_definition for all to app_worker using (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid) with check (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);
create policy metric_definition_version_worker_scope on app.metric_definition_version for all to app_worker using (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid) with check (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);
create policy manual_import_batch_worker_scope on app.manual_import_batch for all to app_worker using (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid) with check (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);
create policy metric_observation_worker_scope on app.metric_observation for all to app_worker using (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid) with check (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);
create policy metric_snapshot_worker_scope on app.metric_snapshot for all to app_worker using (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid) with check (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);
create policy funnel_definition_worker_scope on app.funnel_definition for all to app_worker using (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid) with check (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);
create policy funnel_definition_version_worker_scope on app.funnel_definition_version for all to app_worker using (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid) with check (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);
create policy funnel_stage_worker_scope on app.funnel_stage for all to app_worker using (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid) with check (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);

create function public.get_metrics_workspace_state(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_name text;
  v_definitions jsonb;
  v_imports jsonb;
  v_snapshots jsonb;
  v_funnel jsonb;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select workspace.name into v_workspace_name from app.workspace as workspace
  inner join app.membership as membership on membership.workspace_id = workspace.id
  where workspace.id = p_workspace_id and membership.user_id = v_user_id and membership.status = 'active';
  if v_workspace_name is null then raise exception 'workspace unavailable' using errcode = '42501'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', definition.id, 'versionId', version.id, 'version', version.version,
    'name', version.name, 'businessDefinition', version.business_definition,
    'unit', version.unit, 'customUnit', coalesce(version.custom_unit, ''),
    'aggregation', version.aggregation, 'segment', version.segment_contract ->> 'segment',
    'exclusions', coalesce(version.segment_contract -> 'exclusions', '[]'::jsonb),
    'timezone', version.timezone, 'freshnessHours', version.freshness_hours,
    'approvalState', version.approval_state
  ) order by version.name), '[]'::jsonb) into v_definitions
  from app.metric_definition as definition
  inner join app.metric_definition_version as version on version.id = definition.current_version_id
  where definition.workspace_id = p_workspace_id;

  select coalesce(jsonb_agg(item.payload order by item.created_at desc), '[]'::jsonb) into v_imports
  from (
    select batch.created_at, jsonb_build_object(
      'id', batch.id, 'filename', batch.filename, 'rowCount', batch.row_count,
      'sourceId', batch.source_record_id, 'sourceHash', batch.source_hash,
      'createdAt', batch.created_at
    ) as payload
    from app.manual_import_batch as batch where batch.workspace_id = p_workspace_id
    order by batch.created_at desc limit 10
  ) as item;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', latest.id, 'metricDefinitionId', latest.metric_definition_id,
    'windowStart', latest.window_start, 'windowEnd', latest.window_end,
    'segment', latest.segment_key, 'value', latest.value_numeric,
    'qualityState', latest.quality_state, 'qualityScore', latest.quality_score,
    'freshAsOf', latest.fresh_as_of, 'evidenceIds', latest.evidence_refs,
    'importBatchId', latest.import_batch_id
  )), '[]'::jsonb) into v_snapshots
  from (
    select distinct on (snapshot.metric_definition_id) snapshot.*
    from app.metric_snapshot as snapshot where snapshot.workspace_id = p_workspace_id
    order by snapshot.metric_definition_id, snapshot.created_at desc, snapshot.id desc
  ) as latest;

  select case when version.id is null then null else jsonb_build_object(
    'id', funnel.id, 'versionId', version.id, 'version', version.version, 'name', version.name,
    'stages', coalesce((select jsonb_agg(jsonb_build_object(
      'id', stage_row.id, 'stage', stage_row.stage, 'label', stage_row.label,
      'position', stage_row.position, 'metricDefinitionId', stage_row.metric_definition_id,
      'definition', stage_row.definition, 'included', stage_row.included,
      'mappingState', stage_row.mapping_state, 'qualityThreshold', stage_row.quality_threshold
    ) order by stage_row.position) from app.funnel_stage as stage_row where stage_row.funnel_version_id = version.id), '[]'::jsonb)
  ) end into v_funnel
  from app.funnel_definition as funnel
  left join app.funnel_definition_version as version on version.id = funnel.current_version_id
  where funnel.workspace_id = p_workspace_id;

  return jsonb_build_object('workspaceId', p_workspace_id, 'workspaceName', v_workspace_name,
    'definitions', v_definitions, 'imports', v_imports, 'snapshots', v_snapshots, 'funnel', v_funnel);
end;
$$;

create function public.save_metric_definition(
  p_workspace_id uuid, p_metric_definition_id uuid, p_expected_version integer,
  p_definition jsonb, p_request_id uuid, p_idempotency_key text
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid(); v_hash text; v_receipt app.mutation_receipt%rowtype;
  v_definition app.metric_definition%rowtype; v_actual integer; v_next integer; v_version_id uuid;
  v_name text := trim(p_definition ->> 'name');
  v_name_key text := lower(regexp_replace(trim(p_definition ->> 'name'), '\s+', ' ', 'g'));
begin
  if v_user_id is null or not app.is_active_member(p_workspace_id) then raise exception 'workspace unavailable' using errcode = '42501'; end if;
  if jsonb_typeof(p_definition) <> 'object' or length(v_name) not between 1 and 120
    or length(trim(p_definition ->> 'businessDefinition')) not between 1 and 1000
    or p_definition ->> 'unit' not in ('count','percentage','currency_minor','seconds','custom')
    or p_definition ->> 'aggregation' not in ('count','sum','average','unique','ratio','latest')
    or nullif(trim(p_definition ->> 'segment'), '') is null
    or coalesce((p_definition ->> 'freshnessHours')::integer, 0) not between 1 and 8760
    or jsonb_typeof(p_definition -> 'exclusions') <> 'array' then
    raise exception 'metric definition is invalid' using errcode = '22023';
  end if;
  if (p_definition ->> 'unit' = 'custom') <> (nullif(trim(coalesce(p_definition ->> 'customUnit','')), '') is not null) then
    raise exception 'custom unit is invalid' using errcode = '22023';
  end if;

  v_hash := encode(extensions.digest(concat_ws(':', coalesce(p_metric_definition_id::text, 'new'), p_expected_version::text, p_definition::text), 'sha256'), 'hex');
  select * into v_receipt from app.mutation_receipt where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key for update;
  if v_receipt.id is not null then
    if v_receipt.request_hash <> v_hash then raise exception 'idempotency key reused' using errcode = '23505'; end if;
    if v_receipt.status = 'succeeded' then return public.get_metrics_workspace_state(p_workspace_id); end if;
  else
    insert into app.mutation_receipt (workspace_id,idempotency_key,request_hash,request_id,action,status)
    values (p_workspace_id,p_idempotency_key,v_hash,p_request_id,'metric_definition.saved','started') returning * into v_receipt;
  end if;

  if p_metric_definition_id is null then
    if p_expected_version <> 0 then raise exception 'stale metric definition' using errcode = '40001'; end if;
    insert into app.metric_definition (workspace_id,name_key) values (p_workspace_id,v_name_key) returning * into v_definition;
    v_next := 1;
  else
    select * into v_definition from app.metric_definition where id = p_metric_definition_id and workspace_id = p_workspace_id for update;
    if v_definition.id is null then raise exception 'metric definition unavailable' using errcode = '42501'; end if;
    select version into v_actual from app.metric_definition_version where id = v_definition.current_version_id;
    if v_actual <> p_expected_version then raise exception 'stale metric definition' using errcode = '40001'; end if;
    select coalesce(max(version),0)+1 into v_next from app.metric_definition_version where metric_definition_id = v_definition.id;
    update app.metric_definition set name_key = v_name_key where id = v_definition.id;
  end if;

  insert into app.metric_definition_version (workspace_id,metric_definition_id,version,name,business_definition,
    unit,custom_unit,aggregation,segment_contract,source_contract,timezone,freshness_hours,approval_state,created_by)
  values (p_workspace_id,v_definition.id,v_next,v_name,trim(p_definition ->> 'businessDefinition'),
    (p_definition ->> 'unit')::app.metric_unit,nullif(trim(coalesce(p_definition ->> 'customUnit','')),''),
    (p_definition ->> 'aggregation')::app.metric_aggregation,
    jsonb_build_object('segment',trim(p_definition ->> 'segment'),'exclusions',p_definition -> 'exclusions'),
    jsonb_build_object('method','manual_csv','version','1'),trim(p_definition ->> 'timezone'),
    (p_definition ->> 'freshnessHours')::integer,'founder_approved',v_user_id) returning id into v_version_id;
  update app.metric_definition set current_version_id = v_version_id,status = 'active' where id = v_definition.id;
  insert into app.audit_event (workspace_id,actor_type,actor_id,action,target_type,target_id,target_version,request_id,result,metadata)
  values (p_workspace_id,'founder',v_user_id::text,'metric_definition.saved','metric_definition',v_definition.id::text,v_next,p_request_id,'succeeded','{}');
  update app.mutation_receipt set status='succeeded',result_ref=v_definition.id::text,completed_at=now() where id=v_receipt.id;
  return public.get_metrics_workspace_state(p_workspace_id);
end;
$$;

create function public.commit_manual_metric_import(
  p_workspace_id uuid, p_filename text, p_source_hash text, p_rows jsonb,
  p_request_id uuid, p_idempotency_key text
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid(); v_hash text; v_receipt app.mutation_receipt%rowtype;
  v_source_id uuid; v_batch_id uuid; v_existing_batch uuid; v_row jsonb;
  v_metric app.metric_definition%rowtype; v_observation_id uuid; v_previous app.metric_snapshot%rowtype;
  v_quality app.metric_quality_state; v_value numeric; v_window_start timestamptz; v_window_end timestamptz;
  v_fresh timestamptz; v_evidence jsonb; v_snapshot_quality app.metric_quality_state; v_snapshot_value numeric;
  v_quality_score numeric;
begin
  if v_user_id is null or not app.is_active_member(p_workspace_id) then raise exception 'workspace unavailable' using errcode = '42501'; end if;
  if length(trim(p_filename)) not between 1 and 255 or p_filename ~ '[/\\]'
    or p_source_hash !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_rows) <> 'array'
    or jsonb_array_length(p_rows) not between 1 and 500 then raise exception 'manual import is invalid' using errcode = '22023'; end if;
  v_hash := encode(extensions.digest(concat_ws(':',p_filename,p_source_hash,p_rows::text),'sha256'),'hex');
  select * into v_receipt from app.mutation_receipt where workspace_id=p_workspace_id and idempotency_key=p_idempotency_key for update;
  if v_receipt.id is not null then
    if v_receipt.request_hash <> v_hash then raise exception 'idempotency key reused' using errcode='23505'; end if;
    if v_receipt.status='succeeded' then return public.get_metrics_workspace_state(p_workspace_id); end if;
  else
    insert into app.mutation_receipt (workspace_id,idempotency_key,request_hash,request_id,action,status)
    values (p_workspace_id,p_idempotency_key,v_hash,p_request_id,'manual_metrics.imported','started') returning * into v_receipt;
  end if;
  select id into v_existing_batch from app.manual_import_batch where workspace_id=p_workspace_id and source_hash=p_source_hash;
  if v_existing_batch is not null then
    update app.mutation_receipt set status='succeeded',result_ref=v_existing_batch::text,completed_at=now() where id=v_receipt.id;
    insert into app.audit_event (workspace_id,actor_type,actor_id,action,target_type,target_id,request_id,result,metadata)
    values (p_workspace_id,'founder',v_user_id::text,'manual_metrics.replayed','manual_import_batch',v_existing_batch::text,p_request_id,'succeeded','{}');
    return public.get_metrics_workspace_state(p_workspace_id);
  end if;

  insert into app.source_record (workspace_id,source_type,provider_object_ref,content_hash,observed_at,metadata,sensitivity)
  values (p_workspace_id,'manual_csv','manual_csv:'||p_source_hash,p_source_hash,now(),jsonb_build_object('filename',trim(p_filename),'rowCount',jsonb_array_length(p_rows),'retainedRawBody',false),'confidential')
  returning id into v_source_id;
  insert into app.manual_import_batch (workspace_id,source_record_id,source_hash,filename,row_count,request_id,created_by)
  values (p_workspace_id,v_source_id,p_source_hash,trim(p_filename),jsonb_array_length(p_rows),p_request_id,v_user_id) returning id into v_batch_id;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_row) <> 'object' or (v_row ->> 'rowKey') !~ '^[a-f0-9]{64}$'
      or (v_row ->> 'qualityState') not in ('current','stale','missing','conflicted','invalid','unknown')
      or nullif(trim(v_row ->> 'segment'),'') is null or nullif(trim(v_row ->> 'sourceNote'),'') is null then
      raise exception 'manual import row is invalid' using errcode='22023';
    end if;
    select * into v_metric from app.metric_definition where id=(v_row ->> 'metricDefinitionId')::uuid and workspace_id=p_workspace_id and status='active';
    if v_metric.id is null then raise exception 'metric definition unavailable' using errcode='42501'; end if;
    v_quality := (v_row ->> 'qualityState')::app.metric_quality_state;
    v_value := case when jsonb_typeof(v_row -> 'value')='number' then (v_row ->> 'value')::numeric else null end;
    if (v_quality in ('current','stale','conflicted') and v_value is null)
      or (v_quality in ('missing','unknown','invalid') and v_value is not null) then raise exception 'metric value and quality conflict' using errcode='22023'; end if;
    v_quality_score := case v_quality when 'current' then 1 when 'stale' then 0.5 when 'conflicted' then 0.2 else 0 end;
    v_window_start := (v_row ->> 'windowStart')::timestamptz; v_window_end := (v_row ->> 'windowEnd')::timestamptz;
    v_fresh := (v_row ->> 'freshAsOf')::timestamptz;
    if v_window_end <= v_window_start then raise exception 'metric window is invalid' using errcode='22023'; end if;

    insert into app.metric_observation (workspace_id,metric_definition_id,import_batch_id,source_record_id,source_row_number,row_key,
      window_start,window_end,segment_key,value_numeric,quality_state,quality_score,fresh_as_of,source_note)
    values (p_workspace_id,v_metric.id,v_batch_id,v_source_id,(v_row ->> 'rowNumber')::integer,v_row ->> 'rowKey',
      v_window_start,v_window_end,trim(v_row ->> 'segment'),v_value,v_quality,v_quality_score,v_fresh,trim(v_row ->> 'sourceNote'))
    returning id into v_observation_id;
    select * into v_previous from app.metric_snapshot where workspace_id=p_workspace_id and metric_definition_id=v_metric.id
      and window_start=v_window_start and window_end=v_window_end and segment_key=trim(v_row ->> 'segment')
      order by created_at desc,id desc limit 1;
    if v_previous.id is not null and (v_previous.quality_state is distinct from v_quality or v_previous.value_numeric is distinct from v_value) then
      v_snapshot_quality := 'conflicted'; v_snapshot_value := null;
      v_evidence := v_previous.evidence_refs || jsonb_build_array(v_observation_id);
    else
      v_snapshot_quality := case when v_quality='conflicted' then 'conflicted' else v_quality end;
      v_snapshot_value := case when v_quality='conflicted' then null else v_value end;
      v_evidence := jsonb_build_array(v_observation_id);
    end if;
    insert into app.metric_snapshot (workspace_id,metric_definition_id,import_batch_id,window_start,window_end,segment_key,
      value_numeric,quality_state,quality_score,fresh_as_of,calculation_version,evidence_refs,idempotency_key)
    values (p_workspace_id,v_metric.id,v_batch_id,v_window_start,v_window_end,trim(v_row ->> 'segment'),v_snapshot_value,
      v_snapshot_quality,case when v_snapshot_quality='conflicted' then 0.2 else v_quality_score end,
      v_fresh,'manual-import-v1',v_evidence,p_source_hash||':'||(v_row ->> 'rowKey'));
  end loop;
  insert into app.audit_event (workspace_id,actor_type,actor_id,action,target_type,target_id,request_id,result,metadata)
  values (p_workspace_id,'founder',v_user_id::text,'manual_metrics.imported','manual_import_batch',v_batch_id::text,p_request_id,'succeeded',jsonb_build_object('rowCount',jsonb_array_length(p_rows),'sourceRecordId',v_source_id));
  update app.mutation_receipt set status='succeeded',result_ref=v_batch_id::text,completed_at=now() where id=v_receipt.id;
  return public.get_metrics_workspace_state(p_workspace_id);
end;
$$;

create function public.save_funnel_definition(
  p_workspace_id uuid, p_expected_version integer, p_name text, p_stages jsonb,
  p_request_id uuid, p_idempotency_key text
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_user_id uuid:=auth.uid(); v_hash text; v_receipt app.mutation_receipt%rowtype;
  v_funnel app.funnel_definition%rowtype; v_actual integer; v_next integer; v_version_id uuid;
  v_stage jsonb; v_included integer:=0; v_metric_count integer;
begin
  if v_user_id is null or not app.is_active_member(p_workspace_id) then raise exception 'workspace unavailable' using errcode='42501'; end if;
  if length(trim(p_name)) not between 1 and 120 or jsonb_typeof(p_stages)<>'array' or jsonb_array_length(p_stages) not between 2 and 7 then
    raise exception 'funnel definition is invalid' using errcode='22023'; end if;
  for v_stage in select value from jsonb_array_elements(p_stages) loop
    if (v_stage ->> 'stage') not in ('awareness','acquisition','conversion','activation','retention','revenue','referral')
      or length(trim(v_stage ->> 'label')) not between 1 and 80 or length(trim(v_stage ->> 'definition')) not between 1 and 1000
      or (v_stage ->> 'position')::integer not between 0 and 6 then raise exception 'funnel stage is invalid' using errcode='22023'; end if;
    if (v_stage ->> 'included')::boolean then
      v_included:=v_included+1;
      select count(*) into v_metric_count from app.metric_definition where id=(v_stage ->> 'metricDefinitionId')::uuid and workspace_id=p_workspace_id and status='active';
      if v_metric_count<>1 then raise exception 'funnel metric unavailable' using errcode='42501'; end if;
    elsif v_stage ->> 'metricDefinitionId' is not null then raise exception 'excluded stage cannot map a metric' using errcode='22023'; end if;
  end loop;
  if v_included<2 then raise exception 'include at least two stages' using errcode='22023'; end if;
  v_hash:=encode(extensions.digest(concat_ws(':',p_expected_version::text,trim(p_name),p_stages::text),'sha256'),'hex');
  select * into v_receipt from app.mutation_receipt where workspace_id=p_workspace_id and idempotency_key=p_idempotency_key for update;
  if v_receipt.id is not null then
    if v_receipt.request_hash<>v_hash then raise exception 'idempotency key reused' using errcode='23505'; end if;
    if v_receipt.status='succeeded' then return public.get_metrics_workspace_state(p_workspace_id); end if;
  else
    insert into app.mutation_receipt (workspace_id,idempotency_key,request_hash,request_id,action,status)
    values (p_workspace_id,p_idempotency_key,v_hash,p_request_id,'funnel_definition.saved','started') returning * into v_receipt;
  end if;
  select * into v_funnel from app.funnel_definition where workspace_id=p_workspace_id for update;
  if v_funnel.id is null then
    if p_expected_version<>0 then raise exception 'stale funnel version' using errcode='40001'; end if;
    insert into app.funnel_definition (workspace_id) values (p_workspace_id) returning * into v_funnel; v_next:=1;
  else
    select version into v_actual from app.funnel_definition_version where id=v_funnel.current_version_id;
    if v_actual<>p_expected_version then raise exception 'stale funnel version' using errcode='40001'; end if;
    select coalesce(max(version),0)+1 into v_next from app.funnel_definition_version where funnel_definition_id=v_funnel.id;
  end if;
  insert into app.funnel_definition_version (workspace_id,funnel_definition_id,version,name,approved_by,decision_ref)
  values (p_workspace_id,v_funnel.id,v_next,trim(p_name),v_user_id,p_request_id::text) returning id into v_version_id;
  for v_stage in select value from jsonb_array_elements(p_stages) loop
    insert into app.funnel_stage (workspace_id,funnel_version_id,stage,label,position,metric_definition_id,definition,included,mapping_state)
    values (p_workspace_id,v_version_id,(v_stage ->> 'stage')::app.canonical_funnel_stage,trim(v_stage ->> 'label'),
      (v_stage ->> 'position')::integer,case when (v_stage ->> 'included')::boolean then (v_stage ->> 'metricDefinitionId')::uuid else null end,
      trim(v_stage ->> 'definition'),(v_stage ->> 'included')::boolean,case when (v_stage ->> 'included')::boolean then 'mapped'::app.funnel_mapping_state else 'unmapped'::app.funnel_mapping_state end);
  end loop;
  update app.funnel_definition set current_version_id=v_version_id,status='active' where id=v_funnel.id;
  insert into app.audit_event (workspace_id,actor_type,actor_id,action,target_type,target_id,target_version,request_id,result,metadata)
  values (p_workspace_id,'founder',v_user_id::text,'funnel_definition.saved','funnel_definition',v_funnel.id::text,v_next,p_request_id,'succeeded',jsonb_build_object('includedStages',v_included));
  update app.mutation_receipt set status='succeeded',result_ref=v_funnel.id::text,completed_at=now() where id=v_receipt.id;
  return public.get_metrics_workspace_state(p_workspace_id);
end;
$$;

revoke all on function public.get_metrics_workspace_state(uuid) from public,anon;
revoke all on function public.save_metric_definition(uuid,uuid,integer,jsonb,uuid,text) from public,anon;
revoke all on function public.commit_manual_metric_import(uuid,text,text,jsonb,uuid,text) from public,anon;
revoke all on function public.save_funnel_definition(uuid,integer,text,jsonb,uuid,text) from public,anon;
grant execute on function public.get_metrics_workspace_state(uuid) to authenticated;
grant execute on function public.save_metric_definition(uuid,uuid,integer,jsonb,uuid,text) to authenticated;
grant execute on function public.commit_manual_metric_import(uuid,text,text,jsonb,uuid,text) to authenticated;
grant execute on function public.save_funnel_definition(uuid,integer,text,jsonb,uuid,text) to authenticated;

comment on table app.metric_observation is 'Immutable normalized manual source row; observed zero remains distinct from missing or unknown.';
comment on table app.metric_snapshot is 'Immutable derived metric state with observation evidence references; conflicts retain every candidate.';
comment on function public.commit_manual_metric_import(uuid,text,text,jsonb,uuid,text) is 'Commits a fully validated bounded CSV preview idempotently; raw CSV bodies are not retained.';

commit;
