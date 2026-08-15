-- TEST/LOCAL ONLY. Production rollback retains receipts through their retention window.
begin;
drop table if exists app.mutation_receipt cascade;
drop type if exists app.mutation_status;
commit;
