# S1-007 row-level security and grants

Every application table uses `ENABLE ROW LEVEL SECURITY` plus `FORCE ROW LEVEL SECURITY`. Public and anonymous grants are revoked. Authenticated access receives only the table verbs needed by the application and is constrained by server-owned membership rows; client-editable JWT metadata is never used for roles.

The `app_worker` role has no login and no RLS bypass. A privileged server transaction may assume it only after setting `app.workspace_id` locally; an absent or mismatched scope returns no tenant rows. The Supabase `service_role` credential remains server-only and must never be used for ordinary request queries or model tools.

An event trigger enables and forces RLS and revokes grants on every newly created `app` table. New tables therefore fail closed until a later migration supplies deliberate grants and policies.

The automated suite covers the two-tenant select/insert/update/delete matrix, forged workspace IDs, missing worker scope, and migration assertions. Raw PostgreSQL execution awaits the Docker-compatible local database runtime recorded in S1-004.
