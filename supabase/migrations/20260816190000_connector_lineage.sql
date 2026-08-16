begin;

alter table app.connector_connection drop constraint connector_connection_account_unique;
create unique index connector_connection_live_account_unique
on app.connector_connection(workspace_id, provider, provider_account_ref)
where status <> 'revoked';

create function app.rotate_posthog_secret(
  p_workspace_id uuid,
  p_connection_id uuid,
  p_actor_id uuid,
  p_expected_vault_key_ref text,
  p_next_vault_key_ref text,
  p_expires_at timestamptz
) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_workspace_id is distinct from nullif(current_setting('app.workspace_id', true), '')::uuid
    or not exists (
      select 1 from app.membership
      where workspace_id = p_workspace_id and user_id = p_actor_id and status = 'active'
    ) then
    raise exception 'worker scope unavailable' using errcode = '42501';
  end if;
  if length(trim(p_next_vault_key_ref)) not between 8 and 500
    or p_next_vault_key_ref ~ '(pha_|phr_)'
    or p_expires_at <= now() then
    raise exception 'secret reference is invalid' using errcode = '22023';
  end if;
  update app.secret_reference
  set vault_key_ref = trim(p_next_vault_key_ref), expires_at = p_expires_at, rotated_at = now()
  where workspace_id = p_workspace_id and connection_id = p_connection_id
    and vault_key_ref = p_expected_vault_key_ref and revoked_at is null;
  if not found then raise exception 'secret reference changed' using errcode = '40001'; end if;
  update app.connector_connection
  set status = 'healthy', last_healthy_at = now(), last_error_code = null, updated_at = now()
  where workspace_id = p_workspace_id and id = p_connection_id and status <> 'revoked';
end;
$$;

create function public.get_connector_metric_lineage(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null or not exists (
    select 1 from app.membership as membership
    where membership.workspace_id = p_workspace_id
      and membership.user_id = v_user_id
      and membership.status = 'active'
  ) then
    raise exception 'workspace unavailable' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'snapshotId', latest.snapshot_id,
    'metricDefinitionId', latest.metric_definition_id,
    'sourceId', source.id,
    'endpointName', source.metadata ->> 'endpointName',
    'endpointVersion', source.metadata ->> 'endpointVersion',
    'providerObjectRef', source.provider_object_ref,
    'observedAt', source.observed_at,
    'providerRequestId', source.metadata ->> 'providerRequestId',
    'checkpoint', source.metadata ->> 'checkpoint'
  )), '[]'::jsonb) into v_result
  from (
    select distinct on (snapshot.metric_definition_id)
      snapshot.id as snapshot_id,
      snapshot.metric_definition_id,
      chosen.source_record_id,
      snapshot.created_at
    from app.metric_snapshot as snapshot
    inner join lateral (
      select observation.source_record_id
      from jsonb_array_elements_text(snapshot.evidence_refs) as evidence(observation_id)
      inner join app.metric_observation as observation
        on observation.id = evidence.observation_id::uuid
        and observation.workspace_id = snapshot.workspace_id
      inner join app.source_record as evidence_source
        on evidence_source.id = observation.source_record_id
        and evidence_source.workspace_id = snapshot.workspace_id
        and evidence_source.source_type = 'posthog_endpoint'
      order by observation.created_at desc, observation.id desc
      limit 1
    ) as chosen on true
    where snapshot.workspace_id = p_workspace_id and snapshot.sync_run_id is not null
    order by snapshot.metric_definition_id, snapshot.created_at desc, snapshot.id desc
  ) as latest
  inner join app.source_record as source
    on source.id = latest.source_record_id and source.workspace_id = p_workspace_id;

  return v_result;
end;
$$;

revoke all on function public.get_connector_metric_lineage(uuid) from public, anon;
grant execute on function public.get_connector_metric_lineage(uuid) to authenticated;
revoke all on function app.rotate_posthog_secret(uuid,uuid,uuid,text,text,timestamptz) from public, anon, authenticated;
grant execute on function app.rotate_posthog_secret(uuid,uuid,uuid,text,text,timestamptz) to app_worker;

comment on function public.get_connector_metric_lineage(uuid) is
'Returns only bounded aggregate Endpoint lineage for the latest connector snapshot per metric; raw rows and credentials are never exposed.';

commit;
