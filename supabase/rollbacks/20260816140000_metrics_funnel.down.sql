begin;

drop function if exists public.save_funnel_definition(uuid,integer,text,jsonb,uuid,text);
drop function if exists public.commit_manual_metric_import(uuid,text,text,jsonb,uuid,text);
drop function if exists public.save_metric_definition(uuid,uuid,integer,jsonb,uuid,text);
drop function if exists public.get_metrics_workspace_state(uuid);
drop table if exists app.funnel_stage;
drop table if exists app.funnel_definition_version;
drop table if exists app.funnel_definition;
drop table if exists app.metric_snapshot;
drop table if exists app.metric_observation;
drop table if exists app.manual_import_batch;
drop table if exists app.metric_definition_version;
drop table if exists app.metric_definition;
drop function if exists app.reject_metric_history_mutation();
drop type if exists app.funnel_mapping_state;
drop type if exists app.canonical_funnel_stage;
drop type if exists app.funnel_definition_status;
drop type if exists app.metric_quality_state;
drop type if exists app.metric_aggregation;
drop type if exists app.metric_unit;
drop type if exists app.metric_approval_state;
drop type if exists app.metric_definition_status;
alter table app.source_record disable trigger source_record_immutable;
delete from app.source_record where source_type = 'manual_csv';
alter table app.source_record enable trigger source_record_immutable;
alter table app.source_record drop constraint if exists source_record_supported_type;
alter table app.source_record add constraint source_record_public_web check (
  source_type = 'public_web_page' and provider_object_ref like 'https://%'
  and content_hash ~ '^[a-f0-9]{64}$' and sensitivity = 'public' and storage_ref is null
);

commit;
