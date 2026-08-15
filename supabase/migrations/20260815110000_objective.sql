begin;

create type app.objective_status as enum ('draft', 'active', 'superseded');
create type app.baseline_state as enum ('known', 'unknown');
create type app.objective_direction as enum ('increase', 'decrease');

create table app.objective (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references app.workspace(id) on delete cascade,
  current_version_id uuid,
  status app.objective_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app.objective_version (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references app.workspace(id) on delete cascade,
  objective_id uuid not null references app.objective(id) on delete cascade,
  version integer not null check (version > 0),
  metric_name text,
  metric_definition text,
  direction app.objective_direction,
  target_value numeric(20,6),
  baseline_value numeric(20,6),
  baseline_state app.baseline_state not null default 'unknown',
  deadline date,
  target_segment text,
  rationale text,
  created_by uuid not null references app.user_account(id),
  created_at timestamptz not null default now(),
  constraint objective_version_unique unique (objective_id, version),
  constraint objective_baseline_consistent check (
    (baseline_state = 'unknown' and baseline_value is null)
    or (baseline_state = 'known' and baseline_value is not null)
  )
);

alter table app.objective
add constraint objective_current_version_fk
foreign key (current_version_id) references app.objective_version(id)
deferrable initially deferred;

create unique index objective_one_active_per_workspace
on app.objective(workspace_id) where status = 'active';
create index objective_workspace_status_idx on app.objective(workspace_id, status);
create index objective_version_workspace_idx on app.objective_version(workspace_id, objective_id);

create trigger objective_updated_at before update on app.objective
for each row execute function app.set_updated_at();

create function app.validate_objective_activation() returns trigger
language plpgsql
set search_path = ''
as $$
declare current_version app.objective_version%rowtype;
begin
  if new.status <> 'active' then return new; end if;
  select * into current_version from app.objective_version where id = new.current_version_id;
  if current_version.id is null
     or nullif(trim(current_version.metric_name), '') is null
     or nullif(trim(current_version.metric_definition), '') is null
     or current_version.direction is null
     or current_version.target_value is null
     or current_version.deadline <= current_date
     or nullif(trim(current_version.target_segment), '') is null
     or nullif(trim(current_version.rationale), '') is null then
    raise exception 'objective is incomplete or has a past deadline' using errcode = '23514';
  end if;
  if current_version.baseline_state = 'known' and (
    (current_version.direction = 'increase' and current_version.target_value <= current_version.baseline_value)
    or (current_version.direction = 'decrease' and current_version.target_value >= current_version.baseline_value)
  ) then
    raise exception 'objective target does not improve on baseline' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger objective_activation_valid
before insert or update of status, current_version_id on app.objective
for each row execute function app.validate_objective_activation();

create function app.reject_objective_version_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'objective versions are immutable' using errcode = '55000';
end;
$$;

create trigger objective_version_immutable
before update or delete on app.objective_version
for each row execute function app.reject_objective_version_mutation();

grant select, insert on app.objective to authenticated;
grant update (current_version_id, status) on app.objective to authenticated;
grant select, insert on app.objective_version to authenticated;
grant select, insert, update, delete on app.objective, app.objective_version to app_worker;

create policy objective_member_select on app.objective
for select to authenticated using (app.is_active_member(workspace_id));
create policy objective_member_insert on app.objective
for insert to authenticated with check (app.is_active_member(workspace_id));
create policy objective_member_update on app.objective
for update to authenticated using (app.is_active_member(workspace_id))
with check (app.is_active_member(workspace_id));
create policy objective_version_member_select on app.objective_version
for select to authenticated using (app.is_active_member(workspace_id));
create policy objective_version_member_insert on app.objective_version
for insert to authenticated with check (app.is_active_member(workspace_id));

create policy objective_worker_scope on app.objective
for all to app_worker
using (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
with check (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);
create policy objective_version_worker_scope on app.objective_version
for all to app_worker
using (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
with check (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);

commit;
