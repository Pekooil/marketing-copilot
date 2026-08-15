begin;

create type app.company_profile_status as enum ('draft', 'active');

create table app.company_profile (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references app.workspace(id) on delete cascade,
  current_version_id uuid,
  status app.company_profile_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_profile_workspace_unique unique (workspace_id)
);

create table app.company_profile_version (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references app.workspace(id) on delete cascade,
  company_profile_id uuid not null references app.company_profile(id) on delete cascade,
  version integer not null check (version > 0),
  canonical_payload jsonb not null,
  created_by_actor text not null,
  founder_decision_ref text,
  created_at timestamptz not null default now(),
  constraint company_profile_version_unique unique (company_profile_id, version),
  constraint company_profile_actor_not_blank check (length(trim(created_by_actor)) > 0),
  constraint verified_profile_requires_founder check (
    not jsonb_path_exists(canonical_payload, '$.* ? (@.verificationState == "founder_verified")')
    or (created_by_actor like 'founder:%' and founder_decision_ref is not null)
  )
);

alter table app.company_profile
add constraint company_profile_current_version_fk
foreign key (current_version_id) references app.company_profile_version(id)
deferrable initially deferred;

create index company_profile_version_workspace_idx
on app.company_profile_version(workspace_id, company_profile_id);

create trigger company_profile_updated_at before update on app.company_profile
for each row execute function app.set_updated_at();

create function app.reject_profile_version_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'company profile versions are immutable' using errcode = '55000';
end;
$$;

create trigger company_profile_version_immutable
before update or delete on app.company_profile_version
for each row execute function app.reject_profile_version_mutation();

grant select, insert on app.company_profile to authenticated;
grant update (current_version_id, status) on app.company_profile to authenticated;
grant select, insert on app.company_profile_version to authenticated;
grant select, insert, update, delete on app.company_profile, app.company_profile_version to app_worker;

create policy company_profile_member_select on app.company_profile
for select to authenticated using (app.is_active_member(workspace_id));
create policy company_profile_member_insert on app.company_profile
for insert to authenticated with check (app.is_active_member(workspace_id));
create policy company_profile_member_update on app.company_profile
for update to authenticated
using (app.is_active_member(workspace_id))
with check (app.is_active_member(workspace_id));

create policy company_profile_version_member_select on app.company_profile_version
for select to authenticated using (app.is_active_member(workspace_id));
create policy company_profile_version_member_insert on app.company_profile_version
for insert to authenticated with check (app.is_active_member(workspace_id));

create policy company_profile_worker_scope on app.company_profile
for all to app_worker
using (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
with check (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);
create policy company_profile_version_worker_scope on app.company_profile_version
for all to app_worker
using (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
with check (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);

commit;
