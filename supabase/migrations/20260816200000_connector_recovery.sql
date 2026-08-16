begin;

create or replace function public.get_connector_workspace_state(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_user_id uuid:=auth.uid(); v_workspace_name text; v_connection_id uuid; v_connection jsonb; v_mappings jsonb; v_runs jsonb;
begin
  if v_user_id is null or not app.is_active_member(p_workspace_id) then raise exception 'workspace unavailable' using errcode='42501'; end if;
  select name into v_workspace_name from app.workspace where id=p_workspace_id;
  select connection.id,jsonb_build_object(
    'id',connection.id,'provider',connection.provider,'region',connection.region,'projectId',connection.provider_account_ref,
    'displayName',connection.display_name,'status',connection.status,'scopes',connection.scopes,
    'credentialConfigured',exists(select 1 from app.secret_reference as secret where secret.connection_id=connection.id and secret.revoked_at is null),
    'lastHealthyAt',connection.last_healthy_at,'lastErrorCode',connection.last_error_code
  ) into v_connection_id,v_connection from app.connector_connection as connection
  where connection.workspace_id=p_workspace_id order by (connection.status<>'revoked') desc,connection.created_at desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',mapping.id,'versionId',version.id,'version',version.version,'connectionId',mapping.connection_id,
    'metricDefinitionId',mapping.metric_definition_id,'endpointName',version.endpoint_name,'endpointVersion',version.endpoint_version,
    'approvalState',version.approval_state,'createdAt',version.created_at
  ) order by version.created_at),'[]'::jsonb) into v_mappings
  from app.connector_metric_mapping as mapping inner join app.connector_metric_mapping_version as version on version.id=mapping.current_version_id
  where mapping.workspace_id=p_workspace_id and mapping.connection_id=v_connection_id;
  select coalesce(jsonb_agg(item.payload order by item.started_at desc),'[]'::jsonb) into v_runs from (
    select run.started_at,jsonb_build_object(
      'id',run.id,'connectionId',run.connection_id,'status',run.status,'windowStart',run.window_start,'windowEnd',run.window_end,
      'segment',run.segment_key,'metricCount',run.metric_count,'succeededCount',run.succeeded_count,'errorClass',run.error_class,
      'startedAt',run.started_at,'completedAt',run.completed_at
    ) as payload from app.sync_run as run where run.workspace_id=p_workspace_id and run.connection_id=v_connection_id
    order by run.started_at desc limit 10
  ) as item;
  return jsonb_build_object('workspaceId',p_workspace_id,'workspaceName',v_workspace_name,
    'connection',v_connection,'mappings',v_mappings,'runs',v_runs);
end; $$;

create or replace function app.commit_connector_sync(
  p_workspace_id uuid,p_connection_id uuid,p_actor_id uuid,p_idempotency_key text,p_request_id uuid,
  p_window_start timestamptz,p_window_end timestamptz,p_segment text,p_results jsonb
) returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_run_id uuid; v_run_status app.sync_run_status; v_replay boolean:=false; v_result jsonb; v_mapping app.connector_metric_mapping_version%rowtype;
  v_source_id uuid; v_observation_id uuid; v_previous app.metric_snapshot%rowtype; v_value numeric; v_quality app.metric_quality_state;
  v_evidence jsonb; v_snapshot_quality app.metric_quality_state; v_snapshot_value numeric;
  v_requests jsonb:='[]'::jsonb; v_checkpoints jsonb:='{}'::jsonb;
begin
  if p_workspace_id is distinct from nullif(current_setting('app.workspace_id',true),'')::uuid
    or not exists(select 1 from app.membership where workspace_id=p_workspace_id and user_id=p_actor_id and status='active')
    then raise exception 'worker scope unavailable' using errcode='42501'; end if;
  if p_window_end<=p_window_start or nullif(trim(p_segment),'') is null or jsonb_typeof(p_results)<>'array'
    or jsonb_array_length(p_results) not between 1 and 50 then raise exception 'sync input is invalid' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text||':'||p_idempotency_key,0));
  select id,status into v_run_id,v_run_status from app.sync_run
    where workspace_id=p_workspace_id and idempotency_key=p_idempotency_key;
  if v_run_id is not null then
    if v_run_status<>'succeeded' then return; end if;
    v_replay:=true;
  else
    insert into app.sync_run(workspace_id,connection_id,status,idempotency_key,request_id,window_start,window_end,segment_key,metric_count,created_by)
    values(p_workspace_id,p_connection_id,'running',p_idempotency_key,p_request_id,p_window_start,p_window_end,trim(p_segment),jsonb_array_length(p_results),p_actor_id)
    returning id into v_run_id;
  end if;
  for v_result in select value from jsonb_array_elements(p_results) loop
    select version.* into v_mapping from app.connector_metric_mapping as mapping
    inner join app.connector_metric_mapping_version as version on version.id=mapping.current_version_id
    where mapping.workspace_id=p_workspace_id and mapping.connection_id=p_connection_id
      and mapping.metric_definition_id=(v_result->>'metricDefinitionId')::uuid
      and version.endpoint_name=v_result->>'endpointName'
      and version.endpoint_version=(v_result->>'endpointVersion')::integer;
    if v_mapping.id is null then raise exception 'connector mapping changed' using errcode='40001'; end if;
    if (v_result->>'contentHash') !~ '^[a-f0-9]{64}$' or v_result->>'providerObjectRef' not like 'posthog_endpoint:%'
      or v_result->>'qualityState' not in ('current','unknown') or (v_result->>'windowStart')::timestamptz<>p_window_start
      or (v_result->>'windowEnd')::timestamptz<>p_window_end or v_result->>'segment'<>trim(p_segment)
      then raise exception 'connector result is invalid' using errcode='22023'; end if;
    v_quality:=(v_result->>'qualityState')::app.metric_quality_state;
    v_value:=case when jsonb_typeof(v_result->'value')='number' then (v_result->>'value')::numeric else null end;
    if (v_quality='current' and v_value is null) or (v_quality='unknown' and v_value is not null)
      then raise exception 'connector value is invalid' using errcode='22023'; end if;

    if v_replay then
      select observation.id into v_observation_id
      from app.metric_observation as observation
      inner join app.source_record as source on source.id=observation.source_record_id
      where observation.workspace_id=p_workspace_id
        and observation.metric_definition_id=(v_result->>'metricDefinitionId')::uuid
        and source.provider_object_ref=v_result->>'providerObjectRef'
        and source.content_hash=v_result->>'contentHash'
      order by observation.created_at desc limit 1;
      if v_observation_id is null then raise exception 'sync replay does not match committed evidence' using errcode='40001'; end if;
      select * into v_previous from app.metric_snapshot where workspace_id=p_workspace_id
        and metric_definition_id=(v_result->>'metricDefinitionId')::uuid
        and window_start=p_window_start and window_end=p_window_end and segment_key=trim(p_segment)
        order by created_at desc,id desc limit 1;
      if v_previous.id is not null and v_previous.quality_state='stale' then
        insert into app.metric_snapshot(workspace_id,metric_definition_id,import_batch_id,sync_run_id,window_start,window_end,segment_key,
          value_numeric,quality_state,quality_score,fresh_as_of,calculation_version,evidence_refs,idempotency_key)
        values(p_workspace_id,(v_result->>'metricDefinitionId')::uuid,null,v_run_id,p_window_start,p_window_end,trim(p_segment),
          v_value,v_quality,case when v_quality='current' then 1 else 0 end,(v_result->>'freshAsOf')::timestamptz,
          'posthog-recovery-v1',jsonb_build_array(v_observation_id),p_idempotency_key||':recovery:'||(v_result->>'metricDefinitionId'))
        on conflict(workspace_id,idempotency_key) do nothing;
      end if;
      continue;
    end if;

    insert into app.source_record(workspace_id,source_type,provider_object_ref,content_hash,observed_at,metadata,sensitivity)
    values(p_workspace_id,'posthog_endpoint',v_result->>'providerObjectRef',v_result->>'contentHash',(v_result->>'freshAsOf')::timestamptz,
      jsonb_build_object('endpointName',v_result->>'endpointName','endpointVersion',(v_result->>'endpointVersion')::integer,
      'providerRequestId',v_result->>'providerRequestId','checkpoint',v_result->>'checkpoint','retainedRawRows',false),'confidential')
    on conflict(workspace_id,source_type,provider_object_ref,content_hash) do nothing;
    select id into v_source_id from app.source_record where workspace_id=p_workspace_id and source_type='posthog_endpoint'
      and provider_object_ref=v_result->>'providerObjectRef' and content_hash=v_result->>'contentHash';
    insert into app.metric_observation(workspace_id,metric_definition_id,import_batch_id,sync_run_id,source_record_id,source_row_number,row_key,
      window_start,window_end,segment_key,value_numeric,quality_state,quality_score,fresh_as_of,source_note)
    values(p_workspace_id,(v_result->>'metricDefinitionId')::uuid,null,v_run_id,v_source_id,1,v_result->>'contentHash',
      p_window_start,p_window_end,trim(p_segment),v_value,v_quality,case when v_quality='current' then 1 else 0 end,
      (v_result->>'freshAsOf')::timestamptz,'PostHog aggregate Endpoint') returning id into v_observation_id;
    select * into v_previous from app.metric_snapshot where workspace_id=p_workspace_id
      and metric_definition_id=(v_result->>'metricDefinitionId')::uuid and window_start=p_window_start
      and window_end=p_window_end and segment_key=trim(p_segment) and quality_state<>'stale'
      order by created_at desc,id desc limit 1;
    if v_previous.id is not null and (v_previous.quality_state is distinct from v_quality or v_previous.value_numeric is distinct from v_value) then
      v_snapshot_quality:='conflicted'; v_snapshot_value:=null; v_evidence:=v_previous.evidence_refs||jsonb_build_array(v_observation_id);
    else
      v_snapshot_quality:=v_quality; v_snapshot_value:=v_value; v_evidence:=jsonb_build_array(v_observation_id);
    end if;
    insert into app.metric_snapshot(workspace_id,metric_definition_id,import_batch_id,sync_run_id,window_start,window_end,segment_key,
      value_numeric,quality_state,quality_score,fresh_as_of,calculation_version,evidence_refs,idempotency_key)
    values(p_workspace_id,(v_result->>'metricDefinitionId')::uuid,null,v_run_id,p_window_start,p_window_end,trim(p_segment),
      v_snapshot_value,v_snapshot_quality,case v_snapshot_quality when 'current' then 1 when 'conflicted' then 0.2 else 0 end,
      (v_result->>'freshAsOf')::timestamptz,'posthog-endpoint-v2',v_evidence,p_idempotency_key||':'||(v_result->>'metricDefinitionId'));
    v_requests:=v_requests||jsonb_build_array(v_result->>'providerRequestId');
    v_checkpoints:=v_checkpoints||jsonb_build_object(v_result->>'metricDefinitionId',v_result->>'checkpoint');
  end loop;
  if v_replay then
    update app.connector_connection set status='healthy',last_healthy_at=now(),last_error_code=null,updated_at=now()
      where id=p_connection_id and workspace_id=p_workspace_id and status<>'revoked';
    insert into app.audit_event(workspace_id,actor_type,actor_id,action,target_type,target_id,request_id,result,metadata)
    values(p_workspace_id,'worker',p_actor_id::text,'connector.sync.recovered','sync_run',v_run_id::text,p_request_id,'succeeded',
      jsonb_build_object('metricCount',jsonb_array_length(p_results)));
    return;
  end if;
  update app.sync_run set status='succeeded',succeeded_count=jsonb_array_length(p_results),provider_request_ids=v_requests,
    checkpoints=v_checkpoints,completed_at=now() where id=v_run_id;
  update app.connector_connection set status='healthy',last_healthy_at=now(),last_error_code=null,updated_at=now()
    where id=p_connection_id and workspace_id=p_workspace_id;
  insert into app.audit_event(workspace_id,actor_type,actor_id,action,target_type,target_id,request_id,result,metadata)
  values(p_workspace_id,'worker',p_actor_id::text,'connector.sync.succeeded','sync_run',v_run_id::text,p_request_id,'succeeded',
    jsonb_build_object('metricCount',jsonb_array_length(p_results)));
end; $$;

comment on function app.commit_connector_sync(uuid,uuid,uuid,text,uuid,timestamptz,timestamptz,text,jsonb) is
'Worker-only atomic aggregate sync commit. Exact replay has one observation effect and can restore a stale snapshot from its committed evidence.';

commit;
