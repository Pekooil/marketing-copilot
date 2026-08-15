-- TEST/LOCAL ONLY. Production rollback retains profile history.
begin;
drop table if exists app.company_profile_version cascade;
drop table if exists app.company_profile cascade;
drop function if exists app.reject_profile_version_mutation();
drop type if exists app.company_profile_status;
commit;
