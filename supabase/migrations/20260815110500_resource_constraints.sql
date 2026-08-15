begin;

create type app.risk_tolerance as enum ('low', 'medium', 'high');

create table app.resource_constraint (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references app.workspace(id) on delete cascade,
  objective_id uuid not null references app.objective(id) on delete cascade,
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resource_constraint_objective_unique unique (workspace_id, objective_id)
);

create table app.resource_constraint_version (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references app.workspace(id) on delete cascade,
  resource_constraint_id uuid not null references app.resource_constraint(id) on delete cascade,
  version integer not null check (version > 0),
  founder_minutes_per_week integer not null check (founder_minutes_per_week >= 0),
  cash_budget_minor bigint not null check (cash_budget_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  risk_tolerance app.risk_tolerance not null,
  prohibited_tactics jsonb not null default '[]'::jsonb check (jsonb_typeof(prohibited_tactics) = 'array'),
  brand_rules jsonb not null default '[]'::jsonb check (jsonb_typeof(brand_rules) = 'array'),
  audience_limits jsonb not null default '[]'::jsonb check (jsonb_typeof(audience_limits) = 'array'),
  geography_limits jsonb not null default '[]'::jsonb check (jsonb_typeof(geography_limits) = 'array'),
  approval_preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(approval_preferences) = 'object'),
  created_by uuid not null references app.user_account(id),
  created_at timestamptz not null default now(),
  constraint resource_constraint_version_unique unique (resource_constraint_id, version)
);

alter table app.resource_constraint
add constraint resource_constraint_current_version_fk
foreign key (current_version_id) references app.resource_constraint_version(id)
deferrable initially deferred;

create index resource_constraint_version_workspace_idx
on app.resource_constraint_version(workspace_id, resource_constraint_id);
create trigger resource_constraint_updated_at before update on app.resource_constraint
for each row execute function app.set_updated_at();

create function app.reject_resource_constraint_version_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'resource constraint versions are immutable' using errcode = '55000';
end;
$$;
create trigger resource_constraint_version_immutable
before update or delete on app.resource_constraint_version
for each row execute function app.reject_resource_constraint_version_mutation();

grant select, insert on app.resource_constraint to authenticated;
grant update (current_version_id) on app.resource_constraint to authenticated;
grant select, insert on app.resource_constraint_version to authenticated;
grant select, insert, update, delete on app.resource_constraint, app.resource_constraint_version to app_worker;

create policy resource_constraint_member_select on app.resource_constraint
for select to authenticated using (app.is_active_member(workspace_id));
create policy resource_constraint_member_insert on app.resource_constraint
for insert to authenticated with check (app.is_active_member(workspace_id));
create policy resource_constraint_member_update on app.resource_constraint
for update to authenticated using (app.is_active_member(workspace_id))
with check (app.is_active_member(workspace_id));
create policy resource_constraint_version_member_select on app.resource_constraint_version
for select to authenticated using (app.is_active_member(workspace_id));
create policy resource_constraint_version_member_insert on app.resource_constraint_version
for insert to authenticated with check (app.is_active_member(workspace_id));

create policy resource_constraint_worker_scope on app.resource_constraint
for all to app_worker
using (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
with check (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);
create policy resource_constraint_version_worker_scope on app.resource_constraint_version
for all to app_worker
using (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
with check (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);

commit;
