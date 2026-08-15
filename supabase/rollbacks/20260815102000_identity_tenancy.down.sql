-- TEST/LOCAL ONLY. Production recovery uses application rollback and a forward migration.
begin;
drop schema if exists app cascade;
commit;
