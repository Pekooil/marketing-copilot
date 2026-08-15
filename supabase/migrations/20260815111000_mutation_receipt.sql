begin;

create type app.mutation_status as enum ('started', 'succeeded', 'failed');
create table app.mutation_receipt (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references app.workspace(id) on delete cascade,
  idempotency_key text not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  request_id uuid not null,
  action text not null,
  status app.mutation_status not null default 'started',
  result_ref text,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint mutation_receipt_scope_unique unique (workspace_id, idempotency_key),
  constraint mutation_receipt_key_not_blank check (length(trim(idempotency_key)) >= 8),
  constraint mutation_receipt_action_not_blank check (length(trim(action)) > 0)
);

create index mutation_receipt_request_idx on app.mutation_receipt(workspace_id, request_id);
grant select, insert, update on app.mutation_receipt to app_worker;
create policy mutation_receipt_worker_scope on app.mutation_receipt
for all to app_worker
using (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
with check (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);

comment on table app.mutation_receipt is 'Privacy-safe idempotency metadata; never stores request payloads.';
commit;
