begin;

create function public.get_onboarding_state(p_workspace_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace app.workspace%rowtype;
  v_profile app.company_profile_version%rowtype;
  v_objective app.objective%rowtype;
  v_objective_version app.objective_version%rowtype;
  v_constraints app.resource_constraint_version%rowtype;
  v_step integer := 0;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select workspace.* into v_workspace
  from app.workspace as workspace
  inner join app.membership as membership on membership.workspace_id = workspace.id
  where membership.user_id = v_user_id
    and membership.status = 'active'
    and (p_workspace_id is null or workspace.id = p_workspace_id)
  order by membership.created_at asc
  limit 1;

  if p_workspace_id is not null and v_workspace.id is null then
    raise exception 'workspace unavailable' using errcode = '42501';
  end if;

  if v_workspace.id is null then
    return jsonb_build_object(
      'workspaceId', null,
      'step', 0,
      'activated', false,
      'draft', jsonb_build_object(
        'workspaceName', '', 'companyName', '', 'productSummary', '',
        'metricName', '', 'metricDefinition', '', 'direction', 'increase',
        'targetValue', '', 'baselineState', 'unknown', 'baselineValue', '',
        'deadline', '', 'targetSegment', '', 'rationale', '',
        'founderHours', '5', 'cashBudget', '100', 'currency', 'USD',
        'riskTolerance', 'low', 'prohibitedTactics', '', 'brandRules', ''
      )
    );
  end if;

  select version.* into v_profile
  from app.company_profile as profile
  inner join app.company_profile_version as version on version.id = profile.current_version_id
  where profile.workspace_id = v_workspace.id;

  select objective.* into v_objective
  from app.objective as objective
  where objective.workspace_id = v_workspace.id
    and objective.status in ('draft', 'active')
  order by case when objective.status = 'active' then 0 else 1 end, objective.updated_at desc
  limit 1;

  if v_objective.id is not null then
    select version.* into v_objective_version
    from app.objective_version as version
    where version.id = v_objective.current_version_id;

    select version.* into v_constraints
    from app.resource_constraint as constraints
    inner join app.resource_constraint_version as version on version.id = constraints.current_version_id
    where constraints.workspace_id = v_workspace.id
      and constraints.objective_id = v_objective.id;
  end if;

  v_step := case
    when v_constraints.id is not null then 3
    when v_objective_version.id is not null then 2
    when v_profile.id is not null then 1
    else 0
  end;

  return jsonb_build_object(
    'workspaceId', v_workspace.id,
    'step', v_step,
    'activated', coalesce(v_objective.status = 'active', false),
    'draft', jsonb_build_object(
      'workspaceName', v_workspace.name,
      'companyName', coalesce(v_profile.canonical_payload #>> '{companyName,value}', ''),
      'productSummary', coalesce(v_profile.canonical_payload #>> '{productSummary,value}', ''),
      'metricName', coalesce(v_objective_version.metric_name, ''),
      'metricDefinition', coalesce(v_objective_version.metric_definition, ''),
      'direction', coalesce(v_objective_version.direction::text, 'increase'),
      'targetValue', coalesce(v_objective_version.target_value::text, ''),
      'baselineState', coalesce(v_objective_version.baseline_state::text, 'unknown'),
      'baselineValue', coalesce(v_objective_version.baseline_value::text, ''),
      'deadline', coalesce(v_objective_version.deadline::text, ''),
      'targetSegment', coalesce(v_objective_version.target_segment, ''),
      'rationale', coalesce(v_objective_version.rationale, ''),
      'founderHours', coalesce(trim(trailing '.0' from (v_constraints.founder_minutes_per_week::numeric / 60)::text), '5'),
      'cashBudget', coalesce(trim(trailing '.0' from (v_constraints.cash_budget_minor::numeric / 100)::text), '100'),
      'currency', coalesce(v_constraints.currency, 'USD'),
      'riskTolerance', coalesce(v_constraints.risk_tolerance::text, 'low'),
      'prohibitedTactics', coalesce((select string_agg(value, ', ') from jsonb_array_elements_text(v_constraints.prohibited_tactics)), ''),
      'brandRules', coalesce((select string_agg(value, ', ') from jsonb_array_elements_text(v_constraints.brand_rules)), '')
    )
  );
end;
$$;

create function public.save_onboarding(
  p_workspace_id uuid,
  p_step integer,
  p_activate boolean,
  p_request_id uuid,
  p_idempotency_key text,
  p_draft jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace app.workspace%rowtype;
  v_workspace_id uuid;
  v_workspace_name text := nullif(trim(p_draft ->> 'workspaceName'), '');
  v_slug text;
  v_hash text;
  v_receipt app.mutation_receipt%rowtype;
  v_profile app.company_profile%rowtype;
  v_profile_version integer;
  v_profile_version_id uuid;
  v_profile_payload jsonb;
  v_objective app.objective%rowtype;
  v_objective_version integer;
  v_objective_version_id uuid;
  v_constraints app.resource_constraint%rowtype;
  v_constraint_version integer;
  v_constraint_version_id uuid;
  v_action text := case when p_activate then 'onboarding.activated' else 'onboarding.draft_saved' end;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_step < 0 or p_step > 3 then
    raise exception 'invalid onboarding step' using errcode = '22023';
  end if;
  if v_workspace_name is null then
    raise exception 'workspace name is required' using errcode = '23514';
  end if;
  if length(trim(p_idempotency_key)) < 8 then
    raise exception 'idempotency key is invalid' using errcode = '22023';
  end if;

  insert into app.user_account (id)
  values (v_user_id)
  on conflict (id) do nothing;

  if p_workspace_id is not null then
    select workspace.* into v_workspace
    from app.workspace as workspace
    inner join app.membership as membership on membership.workspace_id = workspace.id
    where workspace.id = p_workspace_id
      and membership.user_id = v_user_id
      and membership.status = 'active'
    for update of workspace;
    if v_workspace.id is null then
      raise exception 'workspace unavailable' using errcode = '42501';
    end if;
  else
    select workspace.* into v_workspace
    from app.workspace as workspace
    inner join app.membership as membership on membership.workspace_id = workspace.id
    where membership.user_id = v_user_id and membership.status = 'active'
    order by membership.created_at asc
    limit 1
    for update of workspace;
  end if;

  if v_workspace.id is null then
    v_workspace_id := extensions.gen_random_uuid();
    v_slug := regexp_replace(lower(v_workspace_name), '[^a-z0-9]+', '-', 'g');
    v_slug := trim(both '-' from v_slug);
    if v_slug = '' then v_slug := 'workspace'; end if;
    v_slug := left(v_slug, 52) || '-' || left(replace(v_workspace_id::text, '-', ''), 8);
    insert into app.workspace (id, name, slug, created_by)
    values (v_workspace_id, v_workspace_name, v_slug, v_user_id)
    returning * into v_workspace;
    insert into app.membership (workspace_id, user_id, role, status)
    values (v_workspace_id, v_user_id, 'owner', 'active');
  else
    v_workspace_id := v_workspace.id;
    if v_workspace.name is distinct from v_workspace_name then
      update app.workspace
      set name = v_workspace_name, revision = revision + 1
      where id = v_workspace_id
      returning * into v_workspace;
    end if;
  end if;

  v_hash := encode(extensions.digest(
    concat_ws(':', p_step::text, p_activate::text, p_draft::text),
    'sha256'
  ), 'hex');

  select * into v_receipt
  from app.mutation_receipt
  where workspace_id = v_workspace_id and idempotency_key = p_idempotency_key
  for update;
  if v_receipt.id is not null then
    if v_receipt.request_hash <> v_hash then
      raise exception 'idempotency key reused with different input' using errcode = '23505';
    end if;
    if v_receipt.status = 'succeeded' then
      return public.get_onboarding_state(v_workspace_id);
    end if;
  else
    insert into app.mutation_receipt (
      workspace_id, idempotency_key, request_hash, request_id, action, status
    ) values (
      v_workspace_id, p_idempotency_key, v_hash, p_request_id, v_action, 'started'
    ) returning * into v_receipt;
  end if;

  if p_step = 0 then
    v_profile_payload := jsonb_build_object(
      'companyName', jsonb_build_object(
        'value', trim(p_draft ->> 'companyName'),
        'verificationState', 'founder_provided', 'confidence', 1, 'evidenceIds', '[]'::jsonb
      ),
      'productSummary', jsonb_build_object(
        'value', trim(p_draft ->> 'productSummary'),
        'verificationState', 'founder_provided', 'confidence', 1, 'evidenceIds', '[]'::jsonb
      )
    );
    select * into v_profile from app.company_profile
    where workspace_id = v_workspace_id for update;
    if v_profile.id is null then
      insert into app.company_profile (workspace_id)
      values (v_workspace_id) returning * into v_profile;
      v_profile_version := 1;
    else
      select coalesce(max(version), 0) + 1 into v_profile_version
      from app.company_profile_version where company_profile_id = v_profile.id;
    end if;
    insert into app.company_profile_version (
      workspace_id, company_profile_id, version, canonical_payload,
      created_by_actor, founder_decision_ref
    ) values (
      v_workspace_id, v_profile.id, v_profile_version, v_profile_payload,
      'founder:' || v_user_id::text, p_request_id::text
    ) returning id into v_profile_version_id;
    update app.company_profile
    set current_version_id = v_profile_version_id
    where id = v_profile.id;
  end if;

  if p_step = 1 then
    select * into v_objective from app.objective
    where workspace_id = v_workspace_id and status in ('draft', 'active')
    order by case when status = 'active' then 0 else 1 end, updated_at desc
    limit 1 for update;
    if v_objective.id is null then
      insert into app.objective (workspace_id)
      values (v_workspace_id) returning * into v_objective;
      v_objective_version := 1;
    else
      select coalesce(max(version), 0) + 1 into v_objective_version
      from app.objective_version where objective_id = v_objective.id;
    end if;
    insert into app.objective_version (
      workspace_id, objective_id, version, metric_name, metric_definition,
      direction, target_value, baseline_value, baseline_state, deadline,
      target_segment, rationale, created_by
    ) values (
      v_workspace_id, v_objective.id, v_objective_version,
      nullif(trim(p_draft ->> 'metricName'), ''),
      nullif(trim(p_draft ->> 'metricDefinition'), ''),
      (p_draft ->> 'direction')::app.objective_direction,
      nullif(p_draft ->> 'targetValue', '')::numeric,
      case when p_draft ->> 'baselineState' = 'known'
        then nullif(p_draft ->> 'baselineValue', '')::numeric else null end,
      (p_draft ->> 'baselineState')::app.baseline_state,
      nullif(p_draft ->> 'deadline', '')::date,
      nullif(trim(p_draft ->> 'targetSegment'), ''),
      nullif(trim(p_draft ->> 'rationale'), ''),
      v_user_id
    ) returning id into v_objective_version_id;
    update app.objective set current_version_id = v_objective_version_id
    where id = v_objective.id;
  end if;

  if p_step >= 2 then
    select * into v_objective from app.objective
    where workspace_id = v_workspace_id and status in ('draft', 'active')
    order by case when status = 'active' then 0 else 1 end, updated_at desc
    limit 1 for update;
    if v_objective.id is null then
      raise exception 'objective is required before resources' using errcode = '23514';
    end if;
  end if;

  if p_step = 2 then
    select * into v_constraints from app.resource_constraint
    where workspace_id = v_workspace_id and objective_id = v_objective.id
    for update;
    if v_constraints.id is null then
      insert into app.resource_constraint (workspace_id, objective_id)
      values (v_workspace_id, v_objective.id) returning * into v_constraints;
      v_constraint_version := 1;
    else
      select coalesce(max(version), 0) + 1 into v_constraint_version
      from app.resource_constraint_version where resource_constraint_id = v_constraints.id;
    end if;
    insert into app.resource_constraint_version (
      workspace_id, resource_constraint_id, version, founder_minutes_per_week,
      cash_budget_minor, currency, risk_tolerance, prohibited_tactics, brand_rules,
      audience_limits, geography_limits, approval_preferences, created_by
    ) values (
      v_workspace_id, v_constraints.id, v_constraint_version,
      round((p_draft ->> 'founderHours')::numeric * 60)::integer,
      round((p_draft ->> 'cashBudget')::numeric * 100)::bigint,
      upper(p_draft ->> 'currency'),
      (p_draft ->> 'riskTolerance')::app.risk_tolerance,
      to_jsonb(regexp_split_to_array(coalesce(p_draft ->> 'prohibitedTactics', ''), '\\s*,\\s*')) - '',
      to_jsonb(regexp_split_to_array(coalesce(p_draft ->> 'brandRules', ''), '\\s*,\\s*')) - '',
      '[]'::jsonb,
      '[]'::jsonb,
      '{"requirePreparationApproval":true,"requestedActionClasses":["C"]}'::jsonb,
      v_user_id
    ) returning id into v_constraint_version_id;
    update app.resource_constraint set current_version_id = v_constraint_version_id
    where id = v_constraints.id;
  end if;

  if p_activate then
    if p_step <> 3 then
      raise exception 'activation requires review step' using errcode = '23514';
    end if;
    update app.objective set status = 'superseded'
    where workspace_id = v_workspace_id and status = 'active' and id <> v_objective.id;
    update app.objective set status = 'active' where id = v_objective.id;
  end if;

  insert into app.audit_event (
    workspace_id, actor_type, actor_id, action, target_type, target_id,
    target_version, request_id, result, metadata
  ) values (
    v_workspace_id, 'founder', v_user_id::text, v_action, 'workspace',
    v_workspace_id::text, null, p_request_id, 'succeeded',
    jsonb_build_object('step', p_step, 'activated', p_activate)
  );

  update app.mutation_receipt
  set status = 'succeeded', result_ref = v_workspace_id::text, completed_at = now()
  where id = v_receipt.id;

  return public.get_onboarding_state(v_workspace_id);
end;
$$;

revoke all on function public.get_onboarding_state(uuid) from public, anon;
revoke all on function public.save_onboarding(uuid, integer, boolean, uuid, text, jsonb) from public, anon;
grant execute on function public.get_onboarding_state(uuid) to authenticated;
grant execute on function public.save_onboarding(uuid, integer, boolean, uuid, text, jsonb) to authenticated;

comment on function public.get_onboarding_state(uuid)
is 'Returns only the authenticated founder onboarding state after membership verification.';
comment on function public.save_onboarding(uuid, integer, boolean, uuid, text, jsonb)
is 'Atomically persists versioned onboarding state with idempotency and immutable audit evidence.';

commit;
