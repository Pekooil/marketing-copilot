begin;

create schema if not exists app;
create extension if not exists pgcrypto with schema extensions;

create type app.membership_role as enum ('owner', 'member');
create type app.membership_status as enum ('active', 'inactive');

create table app.user_account (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app.workspace (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null constraint workspace_name_not_blank check (length(trim(name)) > 0),
  slug text not null constraint workspace_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_by uuid not null references app.user_account(id),
  revision integer not null default 1 constraint workspace_revision_positive check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_slug_unique unique (slug)
);

create table app.membership (
  workspace_id uuid not null references app.workspace(id) on delete cascade,
  user_id uuid not null references app.user_account(id) on delete cascade,
  role app.membership_role not null,
  status app.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_pk primary key (workspace_id, user_id)
);

create index workspace_created_by_idx on app.workspace(created_by);
create index membership_user_active_idx on app.membership(user_id, status);
create index membership_workspace_role_idx on app.membership(workspace_id, role, status);

create function app.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_account_updated_at before update on app.user_account
for each row execute function app.set_updated_at();
create trigger workspace_updated_at before update on app.workspace
for each row execute function app.set_updated_at();
create trigger membership_updated_at before update on app.membership
for each row execute function app.set_updated_at();

create function app.ensure_active_workspace_owner() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_workspace_id uuid := coalesce(new.workspace_id, old.workspace_id);
begin
  if exists (select 1 from app.workspace where id = affected_workspace_id)
     and not exists (
       select 1 from app.membership
       where workspace_id = affected_workspace_id
         and role = 'owner'
         and status = 'active'
     ) then
    raise exception 'workspace % must retain an active owner', affected_workspace_id
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger membership_active_owner
after insert or update or delete on app.membership
deferrable initially deferred
for each row execute function app.ensure_active_workspace_owner();

comment on schema app is 'Application-owned data; access requires explicit grants and row policies.';

commit;
