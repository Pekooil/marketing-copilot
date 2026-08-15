-- TEST/LOCAL ONLY. Production rollback retains constraint history.
begin;
drop table if exists app.resource_constraint_version cascade;
drop table if exists app.resource_constraint cascade;
drop function if exists app.reject_resource_constraint_version_mutation();
drop type if exists app.risk_tolerance;
commit;
