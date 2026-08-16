begin;

create table app.source_record (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references app.workspace(id) on delete cascade,
  source_type text not null,
  provider_object_ref text not null,
  content_hash text not null,
  observed_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  sensitivity text not null default 'public',
  storage_ref text,
  created_at timestamptz not null default now(),
  constraint source_record_identity_unique unique (
    workspace_id, source_type, provider_object_ref, content_hash
  ),
  constraint source_record_public_web check (
    source_type = 'public_web_page'
    and provider_object_ref like 'https://%'
    and content_hash ~ '^[a-f0-9]{64}$'
    and sensitivity = 'public'
    and storage_ref is null
  )
);

create table app.product_understanding_proposal (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references app.workspace(id) on delete cascade,
  source_record_id uuid not null references app.source_record(id),
  candidate_payload jsonb not null,
  extractor_version text not null,
  request_id uuid not null,
  created_by uuid not null references app.user_account(id),
  created_at timestamptz not null default now(),
  constraint product_understanding_proposal_request_unique unique (workspace_id, request_id),
  constraint product_understanding_candidate_object check (jsonb_typeof(candidate_payload) = 'object'),
  constraint product_understanding_never_auto_verified check (
    not jsonb_path_exists(candidate_payload, '$.** ? (@.verificationState == "founder_verified")')
  )
);

create table app.product_understanding_review (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references app.workspace(id) on delete cascade,
  proposal_id uuid not null references app.product_understanding_proposal(id),
  profile_version_id uuid not null references app.company_profile_version(id),
  corrected_payload jsonb not null,
  decision_ref text not null,
  reviewed_by uuid not null references app.user_account(id),
  created_at timestamptz not null default now(),
  constraint product_understanding_review_proposal_unique unique (proposal_id),
  constraint product_understanding_decision_not_blank check (length(trim(decision_ref)) > 0)
);

create table app.context_snapshot (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references app.workspace(id) on delete cascade,
  sequence integer not null check (sequence > 0),
  profile_version_id uuid not null references app.company_profile_version(id),
  snapshot_payload jsonb not null,
  source_refs jsonb not null,
  created_by uuid not null references app.user_account(id),
  created_at timestamptz not null default now(),
  constraint context_snapshot_sequence_unique unique (workspace_id, sequence),
  constraint context_snapshot_source_array check (
    jsonb_typeof(source_refs) = 'array' and jsonb_array_length(source_refs) > 0
  )
);

create index source_record_workspace_observed_idx
on app.source_record(workspace_id, observed_at desc);
create index product_understanding_workspace_created_idx
on app.product_understanding_proposal(workspace_id, created_at desc);
create index context_snapshot_workspace_created_idx
on app.context_snapshot(workspace_id, created_at desc);

create function app.reject_product_understanding_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'product understanding evidence is immutable' using errcode = '55000';
end;
$$;

create trigger source_record_immutable before update or delete on app.source_record
for each row execute function app.reject_product_understanding_mutation();
create trigger product_understanding_proposal_immutable before update or delete on app.product_understanding_proposal
for each row execute function app.reject_product_understanding_mutation();
create trigger product_understanding_review_immutable before update or delete on app.product_understanding_review
for each row execute function app.reject_product_understanding_mutation();
create trigger context_snapshot_immutable before update or delete on app.context_snapshot
for each row execute function app.reject_product_understanding_mutation();

grant select, insert on app.source_record, app.product_understanding_proposal,
  app.product_understanding_review, app.context_snapshot to authenticated;
grant select, insert, update, delete on app.source_record, app.product_understanding_proposal,
  app.product_understanding_review, app.context_snapshot to app_worker;

create policy source_record_member_select on app.source_record
for select to authenticated using (app.is_active_member(workspace_id));
create policy source_record_member_insert on app.source_record
for insert to authenticated with check (app.is_active_member(workspace_id));
create policy product_understanding_proposal_member_select on app.product_understanding_proposal
for select to authenticated using (app.is_active_member(workspace_id));
create policy product_understanding_proposal_member_insert on app.product_understanding_proposal
for insert to authenticated with check (app.is_active_member(workspace_id));
create policy product_understanding_review_member_select on app.product_understanding_review
for select to authenticated using (app.is_active_member(workspace_id));
create policy product_understanding_review_member_insert on app.product_understanding_review
for insert to authenticated with check (app.is_active_member(workspace_id));
create policy context_snapshot_member_select on app.context_snapshot
for select to authenticated using (app.is_active_member(workspace_id));
create policy context_snapshot_member_insert on app.context_snapshot
for insert to authenticated with check (app.is_active_member(workspace_id));

create policy source_record_worker_scope on app.source_record for all to app_worker
using (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
with check (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);
create policy product_understanding_proposal_worker_scope on app.product_understanding_proposal for all to app_worker
using (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
with check (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);
create policy product_understanding_review_worker_scope on app.product_understanding_review for all to app_worker
using (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
with check (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);
create policy context_snapshot_worker_scope on app.context_snapshot for all to app_worker
using (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
with check (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);

create function public.get_product_understanding_state(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace app.workspace%rowtype;
  v_profile_version integer := 0;
  v_proposal app.product_understanding_proposal%rowtype;
  v_source app.source_record%rowtype;
  v_snapshot app.context_snapshot%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select workspace.* into v_workspace
  from app.workspace as workspace
  inner join app.membership as membership on membership.workspace_id = workspace.id
  where workspace.id = p_workspace_id
    and membership.user_id = v_user_id
    and membership.status = 'active';
  if v_workspace.id is null then
    raise exception 'workspace unavailable' using errcode = '42501';
  end if;

  select version.version into v_profile_version
  from app.company_profile as profile
  inner join app.company_profile_version as version on version.id = profile.current_version_id
  where profile.workspace_id = p_workspace_id;

  select * into v_proposal
  from app.product_understanding_proposal
  where workspace_id = p_workspace_id
  order by created_at desc, id desc
  limit 1;
  if v_proposal.id is not null then
    select * into v_source from app.source_record where id = v_proposal.source_record_id;
  end if;

  select * into v_snapshot
  from app.context_snapshot
  where workspace_id = p_workspace_id
  order by sequence desc
  limit 1;

  return jsonb_build_object(
    'workspaceId', v_workspace.id,
    'workspaceName', v_workspace.name,
    'profileVersion', coalesce(v_profile_version, 0),
    'proposal', case when v_proposal.id is null then null else jsonb_build_object(
      'id', v_proposal.id,
      'createdAt', v_proposal.created_at,
      'extractorVersion', v_proposal.extractor_version,
      'candidate', v_proposal.candidate_payload,
      'source', jsonb_build_object(
        'id', v_source.id,
        'url', v_source.provider_object_ref,
        'title', coalesce(v_source.metadata ->> 'title', ''),
        'observedAt', v_source.observed_at,
        'contentHash', v_source.content_hash
      )
    ) end,
    'verifiedSnapshot', case when v_snapshot.id is null then null else jsonb_build_object(
      'id', v_snapshot.id,
      'proposalId', v_snapshot.snapshot_payload ->> 'proposalId',
      'sequence', v_snapshot.sequence,
      'createdAt', v_snapshot.created_at,
      'profileVersion', (v_snapshot.snapshot_payload ->> 'profileVersion')::integer,
      'sourceIds', v_snapshot.source_refs,
      'companyProfile', v_snapshot.snapshot_payload -> 'companyProfile'
    ) end
  );
end;
$$;

create function public.save_product_understanding_proposal(
  p_workspace_id uuid,
  p_request_id uuid,
  p_idempotency_key text,
  p_requested_url text,
  p_final_url text,
  p_content_hash text,
  p_observed_at timestamptz,
  p_source_metadata jsonb,
  p_candidate_payload jsonb,
  p_extractor_version text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_hash text;
  v_receipt app.mutation_receipt%rowtype;
  v_source_id uuid;
  v_proposal_id uuid;
begin
  if v_user_id is null or not app.is_active_member(p_workspace_id) then
    raise exception 'workspace unavailable' using errcode = '42501';
  end if;
  if p_final_url not like 'https://%' or p_content_hash !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_source_metadata) <> 'object'
    or jsonb_typeof(p_candidate_payload) <> 'object'
    or coalesce(p_candidate_payload #>> '{companyName,verificationState}', '') <> 'evidence_supported'
    or coalesce(p_candidate_payload #>> '{productSummary,verificationState}', '') <> 'evidence_supported'
    or jsonb_path_exists(p_candidate_payload, '$.** ? (@.verificationState == "founder_verified")') then
    raise exception 'invalid product understanding proposal' using errcode = '22023';
  end if;

  v_hash := encode(extensions.digest(concat_ws(':', p_final_url, p_content_hash, p_candidate_payload::text), 'sha256'), 'hex');
  select * into v_receipt from app.mutation_receipt
  where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key for update;
  if v_receipt.id is not null then
    if v_receipt.request_hash <> v_hash then
      raise exception 'idempotency key reused with different input' using errcode = '23505';
    end if;
    if v_receipt.status = 'succeeded' then
      return public.get_product_understanding_state(p_workspace_id);
    end if;
  else
    insert into app.mutation_receipt (
      workspace_id, idempotency_key, request_hash, request_id, action, status
    ) values (
      p_workspace_id, p_idempotency_key, v_hash, p_request_id,
      'product_understanding.analyzed', 'started'
    ) returning * into v_receipt;
  end if;

  insert into app.source_record (
    workspace_id, source_type, provider_object_ref, content_hash,
    observed_at, metadata, sensitivity
  ) values (
    p_workspace_id, 'public_web_page', p_final_url, p_content_hash,
    p_observed_at, p_source_metadata || jsonb_build_object('requestedUrl', p_requested_url), 'public'
  ) on conflict (workspace_id, source_type, provider_object_ref, content_hash) do nothing;
  select id into v_source_id from app.source_record
  where workspace_id = p_workspace_id
    and source_type = 'public_web_page'
    and provider_object_ref = p_final_url
    and content_hash = p_content_hash;

  insert into app.product_understanding_proposal (
    workspace_id, source_record_id, candidate_payload, extractor_version,
    request_id, created_by
  ) values (
    p_workspace_id, v_source_id, p_candidate_payload, p_extractor_version,
    p_request_id, v_user_id
  ) returning id into v_proposal_id;

  insert into app.audit_event (
    workspace_id, actor_type, actor_id, action, target_type, target_id,
    request_id, result, metadata
  ) values (
    p_workspace_id, 'founder', v_user_id::text, 'product_understanding.analyzed',
    'product_understanding_proposal', v_proposal_id::text, p_request_id,
    'succeeded', jsonb_build_object('sourceRecordId', v_source_id, 'extractorVersion', p_extractor_version)
  );
  update app.mutation_receipt set status = 'succeeded', result_ref = v_proposal_id::text,
    completed_at = now() where id = v_receipt.id;
  return public.get_product_understanding_state(p_workspace_id);
end;
$$;

create function public.verify_product_understanding(
  p_workspace_id uuid,
  p_proposal_id uuid,
  p_expected_profile_version integer,
  p_company_name text,
  p_product_summary text,
  p_target_customer text,
  p_request_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_hash text;
  v_receipt app.mutation_receipt%rowtype;
  v_proposal app.product_understanding_proposal%rowtype;
  v_source app.source_record%rowtype;
  v_profile app.company_profile%rowtype;
  v_actual_version integer;
  v_next_version integer;
  v_profile_version_id uuid;
  v_profile_payload jsonb;
  v_snapshot_id uuid;
  v_snapshot_sequence integer;
begin
  if v_user_id is null or not app.is_active_member(p_workspace_id) then
    raise exception 'workspace unavailable' using errcode = '42501';
  end if;
  if nullif(trim(p_company_name), '') is null or length(trim(p_company_name)) > 200
    or nullif(trim(p_product_summary), '') is null or length(trim(p_product_summary)) > 2000
    or length(trim(coalesce(p_target_customer, ''))) > 2000 then
    raise exception 'verified profile is invalid' using errcode = '22023';
  end if;

  v_hash := encode(extensions.digest(concat_ws(':', p_proposal_id::text, p_expected_profile_version::text,
    trim(p_company_name), trim(p_product_summary), trim(coalesce(p_target_customer, ''))), 'sha256'), 'hex');
  select * into v_receipt from app.mutation_receipt
  where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key for update;
  if v_receipt.id is not null then
    if v_receipt.request_hash <> v_hash then
      raise exception 'idempotency key reused with different input' using errcode = '23505';
    end if;
    if v_receipt.status = 'succeeded' then
      return public.get_product_understanding_state(p_workspace_id);
    end if;
  else
    insert into app.mutation_receipt (
      workspace_id, idempotency_key, request_hash, request_id, action, status
    ) values (
      p_workspace_id, p_idempotency_key, v_hash, p_request_id,
      'product_understanding.verified', 'started'
    ) returning * into v_receipt;
  end if;

  select * into v_proposal from app.product_understanding_proposal
  where id = p_proposal_id and workspace_id = p_workspace_id;
  if v_proposal.id is null then
    raise exception 'proposal unavailable' using errcode = '42501';
  end if;
  select * into v_source from app.source_record where id = v_proposal.source_record_id;

  select * into v_profile from app.company_profile
  where workspace_id = p_workspace_id for update;
  if v_profile.id is null then
    raise exception 'company profile is required' using errcode = '23514';
  end if;
  select version into v_actual_version from app.company_profile_version
  where id = v_profile.current_version_id;
  if v_actual_version <> p_expected_profile_version then
    raise exception 'stale company profile version' using errcode = '40001';
  end if;
  select coalesce(max(version), 0) + 1 into v_next_version
  from app.company_profile_version where company_profile_id = v_profile.id;

  v_profile_payload := jsonb_strip_nulls(jsonb_build_object(
    'companyName', jsonb_build_object(
      'value', trim(p_company_name), 'verificationState', 'founder_verified',
      'confidence', 1, 'evidenceIds', jsonb_build_array(v_source.id::text)
    ),
    'website', jsonb_build_object(
      'value', v_source.provider_object_ref, 'verificationState', 'founder_verified',
      'confidence', 1, 'evidenceIds', jsonb_build_array(v_source.id::text)
    ),
    'productSummary', jsonb_build_object(
      'value', trim(p_product_summary), 'verificationState', 'founder_verified',
      'confidence', 1, 'evidenceIds', jsonb_build_array(v_source.id::text)
    ),
    'targetCustomer', case when nullif(trim(coalesce(p_target_customer, '')), '') is null then null
      else jsonb_build_object(
        'value', trim(p_target_customer), 'verificationState', 'founder_verified',
        'confidence', 1, 'evidenceIds', jsonb_build_array(v_source.id::text)
      ) end
  ));

  insert into app.company_profile_version (
    workspace_id, company_profile_id, version, canonical_payload,
    created_by_actor, founder_decision_ref
  ) values (
    p_workspace_id, v_profile.id, v_next_version, v_profile_payload,
    'founder:' || v_user_id::text, p_request_id::text
  ) returning id into v_profile_version_id;
  update app.company_profile set current_version_id = v_profile_version_id, status = 'active'
  where id = v_profile.id;

  insert into app.product_understanding_review (
    workspace_id, proposal_id, profile_version_id, corrected_payload,
    decision_ref, reviewed_by
  ) values (
    p_workspace_id, p_proposal_id, v_profile_version_id, v_profile_payload,
    p_request_id::text, v_user_id
  );

  select coalesce(max(sequence), 0) + 1 into v_snapshot_sequence
  from app.context_snapshot where workspace_id = p_workspace_id;
  insert into app.context_snapshot (
    workspace_id, sequence, profile_version_id, snapshot_payload, source_refs, created_by
  ) values (
    p_workspace_id, v_snapshot_sequence, v_profile_version_id,
    jsonb_build_object(
      'proposalId', p_proposal_id,
      'profileVersion', v_next_version,
      'companyProfile', jsonb_build_object(
        'companyName', trim(p_company_name),
        'website', v_source.provider_object_ref,
        'productSummary', trim(p_product_summary),
        'targetCustomer', nullif(trim(coalesce(p_target_customer, '')), '')
      )
    ),
    jsonb_build_array(v_source.id), v_user_id
  ) returning id into v_snapshot_id;

  insert into app.audit_event (
    workspace_id, actor_type, actor_id, action, target_type, target_id,
    target_version, request_id, result, metadata
  ) values (
    p_workspace_id, 'founder', v_user_id::text, 'product_understanding.verified',
    'context_snapshot', v_snapshot_id::text, v_snapshot_sequence, p_request_id,
    'succeeded', jsonb_build_object('proposalId', p_proposal_id, 'profileVersionId', v_profile_version_id)
  );
  update app.mutation_receipt set status = 'succeeded', result_ref = v_snapshot_id::text,
    completed_at = now() where id = v_receipt.id;
  return public.get_product_understanding_state(p_workspace_id);
end;
$$;

revoke all on function public.get_product_understanding_state(uuid) from public, anon;
revoke all on function public.save_product_understanding_proposal(uuid, uuid, text, text, text, text, timestamptz, jsonb, jsonb, text) from public, anon;
revoke all on function public.verify_product_understanding(uuid, uuid, integer, text, text, text, uuid, text) from public, anon;
grant execute on function public.get_product_understanding_state(uuid) to authenticated;
grant execute on function public.save_product_understanding_proposal(uuid, uuid, text, text, text, text, timestamptz, jsonb, jsonb, text) to authenticated;
grant execute on function public.verify_product_understanding(uuid, uuid, integer, text, text, text, uuid, text) to authenticated;

comment on table app.source_record is 'Immutable provenance metadata; raw public page bodies are not retained.';
comment on table app.context_snapshot is 'Immutable founder-verified context used by downstream runs.';
comment on function public.save_product_understanding_proposal(uuid, uuid, text, text, text, text, timestamptz, jsonb, jsonb, text)
is 'Persists an evidence-supported proposal without granting verified status.';
comment on function public.verify_product_understanding(uuid, uuid, integer, text, text, text, uuid, text)
is 'Records founder correction and verification as immutable profile and context versions.';

commit;
