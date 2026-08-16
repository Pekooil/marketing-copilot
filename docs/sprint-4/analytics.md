# Sprint 4 analytics contract

Sprint 4 adds content-free events for authorization outcome, mapping save, sync success/recovery, sync failure, and revocation. Allowed dimensions are limited to provider, US/EU region, first/revision, materialization boolean, bounded metric-count buckets, quality-state categories, connection health category, and uppercase safe error class.

Project IDs, Endpoint names, metric names, source/evidence/request identifiers, segments, windows, values, provider execution IDs, checkpoints, token material, query text, and raw PostHog content are rejected by strict schemas. `safe_error` accepts the `connectors` area while retaining the same uppercase error-class restriction.

The schema remains provider-neutral infrastructure. Selecting PostHog as a product data connector does not authorize sending product analytics to PostHog; a production analytics sink still requires explicit consent, environment configuration, and its own privacy review.
