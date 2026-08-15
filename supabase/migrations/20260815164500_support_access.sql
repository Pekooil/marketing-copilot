begin;

create table app.support_access_grant (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references app.workspace(id) on delete cascade,
  support_user_id uuid not null references app.user_account(id) on delete cascade,
  approved_by uuid not null references app.user_account(id),
  reason text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint support_access_reason_not_blank check (length(trim(reason)) > 0),
  constraint support_access_expiry_after_create check (expires_at > created_at)
);

create index support_access_lookup_idx
on app.support_access_grant(workspace_id, support_user_id, expires_at)
where revoked_at is null;

grant select, insert, update (revoked_at) on app.support_access_grant to app_worker;
create policy support_access_worker_scope on app.support_access_grant
for all to app_worker
using (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
with check (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);

comment on table app.support_access_grant is 'Time-bound, workspace-scoped support authorization; every use is audited.';
commit;
