# ADR-003: read-only connector strategy

**Status:** Proposed with a blocking data-plane validation  
**Decision owner:** Engineering lead and product owner  
**Review gate:** Phase 0 platform-prevalence result plus PostHog technical spike

## Context

V1 guarantees manual/CSV metrics and proposes PostHog as the first live analytics connector. It must preserve source lineage, freshness, least privilege, idempotency, regional hosts, and tenant isolation while avoiding an unnecessary clone of raw customer events.

## Decision

Create a provider-neutral `ConnectorAdapter` contract and implement only manual/CSV plus PostHog in V1. PostHog authentication uses OAuth 2.0 with the region-agnostic endpoint and Client ID Metadata Document, minimal read scopes, short-lived access tokens, encrypted refresh-token references, and explicit revocation.

The PostHog data-plane method remains **unaccepted** until a Phase 0 spike confirms a provider-supported path for scheduled funnel aggregates. Do not build a recurring `/query` export connector based on assumption.

Current PostHog documentation states:

- OAuth is the intended authentication for apps other PostHog users connect, with scoped access and US/EU routing: [OAuth integration](https://posthog.com/docs/api/oauth).
- `/query` supports ad-hoc and embedded analytics, but third-party connectors must not use it as a recurring export path: [API queries](https://posthog.com/docs/api/queries).
- Project secret keys are still beta and currently have limited supported scopes: [project secret API keys](https://posthog.com/docs/api/project-secret-api-keys).

## Candidate data-plane paths to validate

1. PostHog-approved bounded aggregate queries for this product’s low-frequency, user-visible analytics use case.
2. PostHog Endpoints or materialized queries that expose approved aggregates.
3. Batch Exports into ephemeral processing, with raw rows discarded after producing canonical aggregates and lineage.
4. Founder-created saved insights queried through a supported read endpoint.

Select the least-privilege option that works for US Cloud, EU Cloud, and the supported self-hosted policy. If none is viable for the beachhead, keep manual/CSV as V1 and re-rank the first connector after Phase 0.

## Adapter contract

Each adapter must provide:

- `authorize`, `refresh`, `revoke`, and `healthCheck`;
- `discoverSources` returning metadata only;
- `proposeMappings` without silently accepting them;
- `fetchMetricSnapshot(definition, range, segment, checkpoint)` returning canonical aggregates, quality, lineage, provider request IDs, and next checkpoint;
- stable idempotency key construction;
- provider-specific rate-limit and retry classification;
- explicit capabilities so unsupported behavior fails closed.

Model-facing code cannot submit arbitrary SQL, URLs, event properties, or provider-native queries. Metric definitions are compiled by deterministic provider adapters from founder-approved mappings.

## Data and secret rules

- Store tokens only through `secret_reference`; never log or send them to models.
- Prefer aggregate counts and rates. If Batch Exports are required, process raw data transiently in an isolated worker and persist only allowed aggregates plus provenance.
- A sync is append-only at the source/checkpoint layer and upserts derived snapshots by deterministic idempotency key.
- Source disagreement creates `conflicted`; connection failure creates `stale`; neither becomes zero.
- Backfills are explicit, range-bounded, restartable, and audited.

## Validation before acceptance

1. Interview 8–12 founders and record PostHog, GA4, Mixpanel, and no-analytics prevalence.
2. Obtain written or documented confirmation of a supported recurring aggregate path.
3. Verify minimal OAuth scopes, refresh/revocation, region routing, rate limits, and pagination.
4. Run fixture tests for duplicate pages, partial failure, schema changes, expired credentials, and remapping.
5. Prove no raw identifying analytics property reaches persisted storage or model context in the default path.

## Rollback

Disable the provider adapter by feature flag, mark impacted metrics stale, preserve manual data, revoke stored credentials, and recompute only after remapping. The canonical metric/funnel schema remains provider-independent.

