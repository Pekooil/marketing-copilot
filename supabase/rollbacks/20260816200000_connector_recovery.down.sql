begin;

comment on function app.commit_connector_sync(uuid,uuid,uuid,text,uuid,timestamptz,timestamptz,text,jsonb) is
'Backward-compatible Sprint 4 sync implementation retained during application rollback; the earlier connector down migration removes it during a full isolated rehearsal.';
comment on function public.get_connector_workspace_state(uuid) is
'Backward-compatible active-connection filtering retained during application rollback; the earlier connector down migration removes it during a full isolated rehearsal.';

commit;
