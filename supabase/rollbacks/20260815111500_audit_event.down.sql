-- Normal rollback never drops audit history. This script intentionally fails closed.
begin;
revoke all on app.audit_event from anon, authenticated, app_worker, public;
commit;
