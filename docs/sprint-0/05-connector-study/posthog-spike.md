# PostHog supported-access spike

**Status:** Required before accepting ADR-003 or planning Sprint 4 implementation

## Known official constraints

- PostHog recommends OAuth for third-party applications that users connect, with requested scopes limited to need: [OAuth integration](https://posthog.com/docs/api/oauth).
- Its query documentation describes `/query` as ad-hoc/embedded analytics and states third-party connectors must use Batch Exports rather than treating `/query` as a recurring export path: [API queries](https://posthog.com/docs/api/queries).
- Project secret API keys are beta and have limited scopes: [project secret keys](https://posthog.com/docs/api/project-secret-api-keys).

## Spike questions

1. Is a weekly/daily bounded aggregate funnel request considered supported embedded analytics or an unsupported recurring connector export?
2. Can OAuth scopes discover event definitions and read only approved aggregate insights without person/event-row access?
3. Are PostHog Endpoints/materialized queries suitable for founder-approved aggregate metrics?
4. If Batch Exports are required, can raw rows be processed ephemerally and discarded while preserving aggregate lineage?
5. What works across US Cloud, EU Cloud, and supported self-hosted instances?
6. What rate limits, result caching, pagination, async-query, and backfill constraints apply?
7. How should event definition changes and deleted events be detected?
8. Does PostHog require partner verification or additional terms for this use?

## Proof scenarios

- OAuth connect, refresh, and revoke with minimal scopes.
- Discover project and event metadata without reading person properties.
- Founder confirms signup, activation, and retention mappings.
- Fetch two identical aggregate windows; deterministic idempotency produces one snapshot per definition/window/version.
- Simulate expired token, rate limit, partial response, renamed event, conflicting manual value, US/EU routing, and backfill restart.
- Inspect logs/storage/model input to prove secrets and disallowed properties are absent.

## Spike output

- Supported access method and provider evidence.
- Exact scopes and regional endpoints.
- Data minimization/retention diagram.
- Latency/rate-limit/cost results.
- Contract fixtures captured without customer data.
- Go, revise, or reject decision for the PostHog adapter.

Do not implement scheduled `/query` syncs until this decision is recorded.

