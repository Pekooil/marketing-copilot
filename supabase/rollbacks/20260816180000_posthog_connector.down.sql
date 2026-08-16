begin;

drop function if exists public.revoke_connector_connection(uuid,uuid,uuid);
drop function if exists public.save_connector_mapping(uuid,uuid,uuid,integer,text,integer,uuid,text);
drop function if exists public.begin_posthog_connection(uuid,app.connector_region,text,text,uuid,text);
drop function if exists public.get_connector_workspace_state(uuid);
drop function if exists app.record_connector_sync_failure(uuid,uuid,uuid,text,uuid,timestamptz,timestamptz,text,integer,text);
drop function if exists app.commit_connector_sync(uuid,uuid,uuid,text,uuid,timestamptz,timestamptz,text,jsonb);
drop function if exists app.get_connector_worker_context(uuid,uuid);
drop function if exists app.complete_posthog_connection(uuid,uuid,uuid,text,text,timestamptz);

alter table app.metric_snapshot disable trigger metric_snapshot_immutable;
alter table app.metric_observation disable trigger metric_observation_immutable;
delete from app.metric_snapshot where sync_run_id is not null;
delete from app.metric_observation where sync_run_id is not null;
alter table app.metric_snapshot enable trigger metric_snapshot_immutable;
alter table app.metric_observation enable trigger metric_observation_immutable;

alter table app.metric_snapshot drop constraint if exists metric_snapshot_origin_check;
alter table app.metric_snapshot drop column if exists sync_run_id;
alter table app.metric_snapshot alter column import_batch_id set not null;
alter table app.metric_observation drop constraint if exists metric_observation_origin_check;
alter table app.metric_observation drop column if exists sync_run_id;
alter table app.metric_observation drop constraint if exists metric_observation_source_row_number_check;
alter table app.metric_observation add constraint metric_observation_source_row_number_check check (source_row_number > 1);
alter table app.metric_observation alter column import_batch_id set not null;

drop table if exists app.sync_run;
alter table app.connector_metric_mapping drop constraint if exists connector_mapping_current_version_fk;
drop table if exists app.connector_metric_mapping_version;
drop table if exists app.connector_metric_mapping;
drop table if exists app.secret_reference;
drop table if exists app.connector_connection;
drop type if exists app.sync_run_status;
drop type if exists app.connector_status;
drop type if exists app.connector_region;
drop type if exists app.connector_provider;

alter table app.source_record disable trigger source_record_immutable;
delete from app.source_record where source_type='posthog_endpoint';
alter table app.source_record enable trigger source_record_immutable;
alter table app.source_record drop constraint if exists source_record_supported_type;
alter table app.source_record add constraint source_record_supported_type check (
  content_hash ~ '^[a-f0-9]{64}$' and storage_ref is null and (
    (source_type='public_web_page' and provider_object_ref like 'https://%' and sensitivity='public')
    or (source_type='manual_csv' and provider_object_ref like 'manual_csv:%' and sensitivity='confidential')
  )
);

commit;
