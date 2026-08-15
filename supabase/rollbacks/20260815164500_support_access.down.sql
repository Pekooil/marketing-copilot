-- Fail-closed normal rollback: revoke access without deleting evidence.
begin;
revoke all on app.support_access_grant from anon, authenticated, app_worker, public;
commit;
