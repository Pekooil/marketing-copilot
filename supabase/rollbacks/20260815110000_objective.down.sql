-- TEST/LOCAL ONLY. Production rollback retains objective versions.
begin;
drop table if exists app.objective_version cascade;
drop table if exists app.objective cascade;
drop function if exists app.reject_objective_version_mutation();
drop function if exists app.validate_objective_activation();
drop type if exists app.objective_direction;
drop type if exists app.baseline_state;
drop type if exists app.objective_status;
commit;
