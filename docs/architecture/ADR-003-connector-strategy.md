# ADR-003: read-only connector strategy

**Status:** Accepted for PostHog Cloud aggregate Endpoints
**Decision owner:** Engineering lead and product owner  
**Review gate:** Revisit after the Sprint 4 founder test-project demo and first private-beta usage

## Context

V1 guarantees manual/CSV metrics and proposes PostHog as the first live analytics connector. It must preserve source lineage, freshness, least privilege, idempotency, regional hosts, and tenant isolation while avoiding an unnecessary clone of raw customer events.

## Decision

Create a provider-neutral `ConnectorAdapter` contract and implement only manual/CSV plus PostHog in V1. PostHog authentication uses OAuth 2.0 with the region-agnostic endpoint and Client ID Metadata Document, minimal read scopes, short-lived access tokens, Supabase Vault for the encrypted token set, and explicit revocation.

The accepted PostHog data plane is founder-created aggregate Endpoints, executed only on an explicit bounded refresh. Each founder-approved metric mapping pins an Endpoint version. Recurring `/query`, arbitrary HogQL, raw events, persons, and background schedules are forbidden.

Current PostHog documentation states:

- OAuth is the intended authentication for apps other PostHog users connect, with scoped access and US/EU routing: [OAuth integration](https://posthog.com/docs/api/oauth).
- `/query` supports ad-hoc and embedded analytics, but third-party connectors must not use it as a recurring export path: [API queries](https://posthog.com/docs/api/queries).
- Endpoints expose versioned, optionally materialized aggregate results through the provider-supported `endpoint:read` scope: [Endpoints API](https://posthog.com/docs/api/endpoints).

## Rejected alternatives

- Recurring `/query`: explicitly unsuitable for third-party recurring export use.
- Batch Exports: unnecessarily exposes raw rows for the current aggregate use case.
- Saved insights: weaker output/version contract than Endpoints for founder-approved mappings.
- Project secret keys: not the third-party delegated authorization model.
- Self-hosted PostHog: deferred because the accepted OAuth/CIMD and regional-host contract currently targets US and EU Cloud.

## Adapter contract

Each adapter must provide:

- OAuth authorization/refresh/revocation lifecycle outside the data adapter, plus adapter `healthCheck`;
- `discoverSources` returning metadata only;
- metadata-only discovery with mappings explicitly approved by the founder;
- `fetchMetricSnapshot(definition, range, segment, checkpoint)` returning canonical aggregates, quality, lineage, provider request IDs, and next checkpoint;
- stable idempotency key construction;
- provider-specific rate-limit and retry classification;
- explicit capabilities so unsupported behavior fails closed.

Model-facing code cannot submit arbitrary SQL, URLs, event properties, or provider-native queries. Metric definitions are compiled by deterministic provider adapters from founder-approved mappings.

## Data and secret rules

- Store token material only in Supabase Vault; `app.secret_reference` stores the opaque Vault UUID and lifecycle metadata. Never log tokens or send them to models.
- Prefer aggregate counts and rates. If Batch Exports are required, process raw data transiently in an isolated worker and persist only allowed aggregates plus provenance.
- A sync is append-only at the source/checkpoint layer and upserts derived snapshots by deterministic idempotency key.
- Source disagreement creates `conflicted`; connection failure creates `stale`; neither becomes zero.
- Backfills are explicit, range-bounded, restartable, and audited.

## Acceptance evidence

1. Official PostHog documentation provides OAuth/CIMD, scope ceilings, short-lived access tokens, refresh tokens, and region-agnostic US/EU routing.
2. Official Endpoints APIs provide listing/execution, pinned versions, materialized execution, columns, pagination state, and execution identifiers with `endpoint:read`.
3. The adapter accepts exactly one bounded aggregate row and rejects pagination, version drift, scope drift, invalid columns, and raw/query paths.
4. Token material is encrypted in Supabase Vault behind worker-only, workspace-scoped functions; application tables store only opaque UUID references and reject token prefixes.
5. Automated evaluation, browser, migration, isolation, and raw-database gates cover replay, stale failure, recovery, lineage, and tenant denial. Live database evidence remains a deployment gate.

## Rollback

Disable the provider adapter by feature flag, mark impacted metrics stale, preserve manual data, revoke stored credentials, and recompute only after remapping. The canonical metric/funnel schema remains provider-independent.
