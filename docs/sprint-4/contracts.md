# Sprint 4 connector contracts

## Accepted access path

Sprint 4 uses PostHog OAuth with a Client ID Metadata Document and only the `endpoint:read` scope. A founder creates bounded aggregate PostHog Endpoints and explicitly maps an immutable Endpoint version to each approved metric definition. The connector never sends arbitrary HogQL, reads persons, or uses `/query` as a recurring export mechanism.

Official basis, checked August 16, 2026:

- PostHog recommends OAuth for third-party applications, supports region-agnostic US/EU authorization, and recommends scope ceilings: <https://posthog.com/docs/api/oauth>
- PostHog says third-party connectors must not use `/query` and recommends materialized views for recurring aggregates: <https://posthog.com/docs/api/queries>
- PostHog Endpoints can be listed and executed with `endpoint:read`, including pinned versions and materialized execution: <https://posthog.com/docs/api/endpoints>

## Aggregate Endpoint output

Every mapped Endpoint must return exactly one row and the columns `value`, `window_start`, `window_end`, `segment`, and `fresh_as_of`. The returned window and segment must exactly match the approved sync request. Pagination, multiple rows, missing columns, version drift, and non-numeric values fail closed.

A numeric zero remains current. A null value becomes unknown. Raw events, person records, queries, creator emails, and arbitrary properties are discarded at the adapter boundary.

## Reliability and identity

Request identity is derived from connection, metric definition, pinned Endpoint version, window, and segment; atomic commit identity also includes normalized aggregate content. Execution and freshness timestamps do not duplicate an unchanged aggregate, while a changed value remains eligible to create traceable conflicting evidence. Provider execution ID, Endpoint reference, response content hash, and checkpoint form the source lineage. Credential, permission, mapping, rate-limit, transient, and invalid-response failures have distinct safe classes.

US and EU Cloud are supported. Self-hosted PostHog, Batch Exports, arbitrary insights, automated mapping approval, background schedules, and raw-event processing are outside this Sprint 4 slice.

## Credential boundary

OAuth access and refresh tokens are stored as one encrypted JSON value in Supabase Vault. The application tables retain only the Vault secret UUID, expiry, rotation time, and revocation time. Browser roles cannot execute the Vault wrapper functions or read `app.secret_reference`. The `app_worker` role also has no direct Vault-schema or secret-reference-table access; a transaction that has assumed that role and set the exact workspace scope can create, decrypt, rotate, or delete a connector secret only through the security-definer wrappers.

Rotation updates the same expected Vault UUID so a failed refresh cannot orphan a second credential. Revocation deletes the Vault row and marks the application reference and connection revoked in the same database transaction. Historical aggregate evidence is intentionally retained. Supabase documents that Vault secrets are authenticated and encrypted at rest with a project key managed separately from the database: <https://supabase.com/docs/guides/database/vault>
