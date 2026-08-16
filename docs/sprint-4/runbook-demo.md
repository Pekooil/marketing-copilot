# Sprint 4 runbook and demo

## Secure runtime provisioning

Configure these values only in the deployment environment, never in source control or browser-visible variables:

- `NEXT_PUBLIC_APP_URL`: exact production HTTPS origin used by the CIMD client ID and callback.
- `CONNECTOR_STATE_SECRET`: at least 32 random characters for sealed OAuth state.
- `CONNECTOR_DATABASE_URL`: server-only PostgreSQL credential permitted to `SET ROLE app_worker`; use the pooled/direct mode supported by the host and never expose it to the browser.

For the current production deployment, set `NEXT_PUBLIC_APP_URL=https://marketing-copilot-chi.vercel.app`. Apply `20260816210000_supabase_vault.sql` to the linked Supabase database; it enables Supabase Vault and installs the worker-only credential functions. No Vault URL or Vault service token belongs in Vercel. Supabase owns the encryption key outside the application database, and the connector database credential reaches decrypted values only through the workspace-scoped security-definer functions.

Host `/connectors/posthog/client-metadata` on the production domain. The document declares the exact client ID, callback, refresh grant, and `com.posthog.scopes: ["endpoint:read"]`. Optionally add PostHog's organization verification token during production verification; request verification for both US and EU if both remain supported.

## Endpoint template and mapping

The founder creates each aggregate Endpoint in PostHog. It must accept `window_start`, `window_end`, and `segment`, and return exactly one row with `value`, `window_start`, `window_end`, `segment`, and `fresh_as_of`. Keep personal or raw event fields out of the output. Materialization is preferred for repeatedly reviewed aggregates.

After OAuth, discover metadata, choose an active Endpoint, review the target metric contract, and approve the pinned version. A changed Endpoint version requires an explicit new mapping version.

## Failure handling

- Authorization denied/expired: restart the pending authorization. Never request a token from the founder.
- Credential or scope error: reauthorize with `endpoint:read`; existing aggregate evidence remains visible but unsafe conclusions stay blocked.
- Missing/version-changed Endpoint: restore the pinned version or approve a new mapping version.
- Rate limit/provider outage: wait for the provider window and retry the same bounded refresh. The latest metric is stale until committed evidence recovers.
- Invalid row, pagination, extra rows, or scope drift: correct the Endpoint output; do not bypass adapter validation.
- Vault unavailable: stop connector operations. Do not fall back to application tables, environment variables, or logs for tokens.
- Suspected credential exposure: revoke the connector and PostHog authorization, rotate the database credential and sealed-state secret if implicated, preserve audit/source history, and reconnect.

## Rollback

1. Disable access to the connector server actions or roll back the application deployment; keep manual CSV metrics available.
2. Call the worker-only revocation function for active PostHog connections. It deletes only their Supabase Vault secrets; historical source, observation, snapshot, and audit records remain immutable.
3. Prefer a reviewed forward database correction. Never disable RLS, mutate evidence history, or copy tokens into PostgreSQL during recovery.
4. Destructive down migrations are for an isolated rehearsal database only.
5. Re-run `pnpm ci`, `pnpm test:e2e`, `pnpm db:rehearse`, and `pnpm db:gate` before restoring the connector.

## Demo

Run `pnpm demo:sprint4`, then demonstrate:

1. the production-domain CIMD document and `endpoint:read` consent;
2. a founder-created one-row activation Endpoint and metadata-only discovery;
3. founder approval of a pinned mapping;
4. first bounded refresh with source/execution/checkpoint lineage;
5. exact replay with no second observation;
6. a rate-limit fixture producing degraded connection and stale metric state;
7. exact retry restoring current state from committed evidence;
8. revocation followed by a same-project reconnect with empty mappings;
9. tenant isolation and browser-commit denial in the raw database gate.

Live gate evidence requires `DATABASE_TEST_URL`, `ALLOW_DB_GATE_WRITES=1`, `ALLOW_DESTRUCTIVE_DB_REHEARSAL=1`, and a dedicated non-production database.
