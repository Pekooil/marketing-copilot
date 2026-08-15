begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_worker') then
    create role app_worker nologin noinherit;
  end if;
end;
$$;

grant app_worker to service_role;
grant usage on schema app to authenticated, app_worker;
revoke all on schema app from anon, public;
revoke all on all tables in schema app from anon, authenticated, app_worker, public;

grant select, insert on app.user_account to authenticated;
grant update (display_name, revision) on app.user_account to authenticated;
grant select, insert on app.workspace to authenticated;
grant update (name, slug, revision) on app.workspace to authenticated;
grant select, insert, delete on app.membership to authenticated;
grant update (role, status) on app.membership to authenticated;
grant select, insert, update, delete on app.workspace, app.membership to app_worker;

alter table app.user_account enable row level security;
alter table app.user_account force row level security;
alter table app.workspace enable row level security;
alter table app.workspace force row level security;
alter table app.membership enable row level security;
alter table app.membership force row level security;

create function app.is_active_member(target_workspace_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from app.membership
    where workspace_id = target_workspace_id
      and user_id = (select auth.uid())
      and status = 'active'
  );
$$;

create function app.is_active_owner(target_workspace_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from app.membership
    where workspace_id = target_workspace_id
      and user_id = (select auth.uid())
      and role = 'owner'
      and status = 'active'
  );
$$;

revoke all on function app.is_active_member(uuid) from public;
revoke all on function app.is_active_owner(uuid) from public;
grant execute on function app.is_active_member(uuid), app.is_active_owner(uuid) to authenticated;

create policy user_account_select_self on app.user_account
for select to authenticated
using ((select auth.uid()) is not null and id = (select auth.uid()));
create policy user_account_insert_self on app.user_account
for insert to authenticated
with check ((select auth.uid()) is not null and id = (select auth.uid()));
create policy user_account_update_self on app.user_account
for update to authenticated
using ((select auth.uid()) is not null and id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy workspace_select_member on app.workspace
for select to authenticated using (app.is_active_member(id));
create policy workspace_insert_creator on app.workspace
for insert to authenticated
with check ((select auth.uid()) is not null and created_by = (select auth.uid()));
create policy workspace_update_owner on app.workspace
for update to authenticated
using (app.is_active_owner(id))
with check (app.is_active_owner(id));

create policy membership_select_member on app.membership
for select to authenticated using (app.is_active_member(workspace_id));
create policy membership_insert_owner on app.membership
for insert to authenticated
with check (
  app.is_active_owner(workspace_id)
  or (
    user_id = (select auth.uid())
    and role = 'owner'
    and exists (
      select 1 from app.workspace
      where id = workspace_id and created_by = (select auth.uid())
    )
  )
);
create policy membership_update_owner on app.membership
for update to authenticated
using (app.is_active_owner(workspace_id))
with check (app.is_active_owner(workspace_id));
create policy membership_delete_owner on app.membership
for delete to authenticated using (app.is_active_owner(workspace_id));

create policy workspace_worker_scope on app.workspace
for all to app_worker
using (id = nullif(current_setting('app.workspace_id', true), '')::uuid)
with check (id = nullif(current_setting('app.workspace_id', true), '')::uuid);
create policy membership_worker_scope on app.membership
for all to app_worker
using (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
with check (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);

create function app.auto_secure_new_table() returns event_trigger
language plpgsql security definer
set search_path = ''
as $$
declare command record;
begin
  for command in select * from pg_event_trigger_ddl_commands() loop
    if command.schema_name = 'app' and command.object_type = 'table' then
      execute format('alter table %s enable row level security', command.object_identity);
      execute format('alter table %s force row level security', command.object_identity);
      execute format('revoke all on table %s from anon, authenticated, app_worker, public', command.object_identity);
    end if;
  end loop;
end;
$$;

create event trigger app_new_table_default_deny
on ddl_command_end
when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
execute function app.auto_secure_new_table();

commit;
