begin;

drop function if exists public.get_connector_metric_lineage(uuid);
drop function if exists app.rotate_posthog_secret(uuid,uuid,uuid,text,text,timestamptz);
drop index if exists app.connector_connection_live_account_unique;
alter table app.connector_connection add constraint connector_connection_account_unique
unique (workspace_id, provider, provider_account_ref);

commit;
