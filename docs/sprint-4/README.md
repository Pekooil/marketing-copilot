# Sprint 4 — PostHog read-only connection and reliable sync

**Status:** Technical implementation and Supabase Vault boundary complete; live database provisioning and founder acceptance gates pending
**Implementation date:** August 16, 2026
**Roadmap outcome:** A founder connects a PostHog Cloud project, pins aggregate Endpoints to approved metrics, refreshes without duplicate observations, sees failures become stale, and recovers with full source lineage.

## Implemented slice

- Region-agnostic PostHog OAuth using a hosted Client ID Metadata Document, PKCE, sealed expiring state, and only `endpoint:read`.
- Supabase Vault storage for access/refresh tokens. The application schema stores only an opaque Vault UUID; worker-only security-definer functions atomically create, read, rotate, and delete the encrypted token set.
- US and EU Cloud aggregate Endpoint discovery and execution. Arbitrary `/query`, HogQL, persons, events, raw rows, self-hosted instances, and background schedules fail outside the capability contract.
- Founder-approved, immutable mappings that pin an Endpoint version to an approved metric definition.
- Explicit date/segment refreshes limited to 366 days. Every result must be exactly one row with the approved window, segment, version, and five-column aggregate contract.
- Immutable sync runs, source records, observations, snapshots, provider executions, checkpoints, and evidence references.
- Stable replay identity: execution/freshness changes do not duplicate identical aggregate content, while a changed value can become conflicting evidence. Provider failure creates stale state without destroying evidence; exact committed replay restores current state.
- Connection health, recent runs, safe errors, reconnect, revocation, and traceable funnel output in the protected metrics workspace.
- Content-free analytics schemas plus unit, component, integration, isolation, evaluation, browser, migration, build, and raw-database gate coverage.

## Deliberate defaults

- Refresh is founder-triggered and bounded. Scheduling, webhooks, continuous ingestion, and arbitrary backfills are deferred.
- PostHog Endpoints are created and reviewed in PostHog by the founder. The copilot does not generate, read, store, or execute Endpoint query text.
- A returned numeric zero is current; null is unknown. Provider failure is stale. Disagreement with existing exact-scope evidence is conflicted and valueless.
- Revocation preserves historical aggregate evidence while invalidating the live credential reference. Reconnecting the same PostHog project creates a new live connection with no inherited mappings.

## Exit gate

- [x] OAuth uses CIMD, PKCE, expiring sealed state, US/EU routing, and only `endpoint:read`.
- [x] The database contains opaque vault references only; token prefixes are rejected and browser roles cannot read secret references.
- [x] Raw/query/person/event access is absent from the adapter capability and evaluation path.
- [x] Endpoint mappings are founder-approved and version-pinned.
- [x] Exact replay has one observation effect and retains traceable provider execution/checkpoint evidence.
- [x] Failure becomes stale immediately in the UI; exact committed evidence can recover current state without duplication.
- [x] Cross-tenant connector state and browser-submitted provider commits fail closed by contract.
- [x] The browser fixture demonstrates mapping, first refresh, exact replay, rate-limit degradation, stale output, and recovery.
- [ ] The production HTTPS origin, Supabase Vault migration, connector database role, sealed-state secret, and optional PostHog CIMD verification token are provisioned.
- [ ] Forward/prior/down-forward migration rehearsal and raw connector scenarios pass on the dedicated non-production database.
- [ ] A founder accepts the PostHog authorization, Endpoint creation template, mapping, failure, recovery, lineage, and revocation flow on staging.

Sprint 5 should not treat connector-fed metrics as qualified evidence until the remaining live and founder acceptance gates are recorded.
