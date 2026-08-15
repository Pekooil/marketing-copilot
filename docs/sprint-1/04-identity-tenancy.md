# S1-004 identity and tenancy migration

The first application migration creates `app.user_account`, `app.workspace`, and `app.membership`. Membership has a composite primary key, and a deferred constraint trigger prevents a committed workspace from having no active owner.

## Test seed

`supabase/seed.sql` creates two confirmed local-only users, each owning a separate workspace. The fixed UUIDs are non-secret fixtures and must never be reused outside local/test environments.

## Forward and rollback verification

1. Start a local Supabase stack.
2. Run `supabase db reset` to prove forward-on-empty plus seed application.
3. Apply the migration to a database at the preceding migration version to prove forward-on-prior.
4. On disposable test data only, run `supabase/rollbacks/20260815102000_identity_tenancy.down.sql`, then reapply the forward migration.
5. Attempt to delete or deactivate the only owner and confirm SQLSTATE `23514` at commit.

Production rollback does not run the destructive down script. Disable the dependent application release, retain data, and issue a reviewed forward corrective migration.

## Current verification boundary

Static migration policy checks, Drizzle type checks, ownership unit tests, seed inspection, and the production application build pass. A Docker-compatible runtime is not installed in the current workspace, so `supabase db reset` and the destructive rollback rehearsal remain an environment prerequisite for the Sprint 1 release gate.
