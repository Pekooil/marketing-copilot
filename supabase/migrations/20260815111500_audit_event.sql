begin;

create type app.audit_actor_type as enum ('founder', 'worker', 'support');
create type app.audit_result as enum ('succeeded', 'denied');

create table app.audit_event (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references app.workspace(id),
  actor_type app.audit_actor_type not null,
  actor_id text not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  target_version integer,
  request_id uuid not null,
  result app.audit_result not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_actor_not_blank check (length(trim(actor_id)) > 0),
  constraint audit_action_not_blank check (length(trim(action)) > 0),
  constraint audit_target_not_blank check (length(trim(target_type)) > 0 and length(trim(target_id)) > 0),
  constraint audit_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index audit_event_workspace_created_idx on app.audit_event(workspace_id, created_at desc);
create unique index audit_event_request_action_result_unique
on app.audit_event(workspace_id, request_id, action, result);

create function app.reject_audit_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit events are append-only' using errcode = '55000';
end;
$$;
create trigger audit_event_append_only
before update or delete on app.audit_event
for each row execute function app.reject_audit_mutation();

grant select, insert on app.audit_event to app_worker;
create policy audit_event_worker_scope on app.audit_event
for select to app_worker
using (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);
create policy audit_event_worker_append on app.audit_event
for insert to app_worker
with check (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);

comment on table app.audit_event is 'Append-only, separately retained, privacy-safe mutation evidence.';
commit;
