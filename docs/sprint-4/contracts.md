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

Sync identity is derived from connection, metric definition, pinned Endpoint version, window, and segment. Provider execution ID, Endpoint reference, response content hash, and checkpoint form the source lineage. Credential, permission, mapping, rate-limit, transient, and invalid-response failures have distinct safe classes.

US and EU Cloud are supported. Self-hosted PostHog, Batch Exports, arbitrary insights, automated mapping approval, background schedules, and raw-event processing are outside this Sprint 4 slice.
