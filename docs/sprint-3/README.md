# Sprint 3 — trustworthy manual metrics and funnel builder

**Status:** Technical implementation complete; live database and founder acceptance gates pending  
**Implementation date:** August 16, 2026  
**Roadmap outcome:** A founder defines approved metrics, previews and imports a bounded CSV, maps a canonical funnel, sees deterministic conversions, and traces every displayed number to its source.

## Implemented slice

- A protected `/metrics` workspace for creating and revising founder-approved metric definitions.
- A full-file CSV preview that validates required columns, size, row count, timestamps, value/quality compatibility, and approved metric mappings before commit.
- Immutable source, import, observation, and derived-snapshot lineage. Raw CSV bodies are processed transiently and are not retained.
- Idempotent file replay and stable row identity. Disagreeing observations become `conflicted`, retain both evidence references, and never produce an average.
- A founder-defined, ordered canonical funnel with explicit definitions and approved metric mappings.
- Deterministic adjacent conversion rates only for current, compatible windows, segments, and timezones. Unknown values and zero denominators display explicit unavailable states.
- Content-free analytics schemas for definition, preview, import, funnel, and safe-error actions.
- Unit, component, integration, isolation, evaluation, browser, migration, and build gates.

## Deliberate defaults

- Manual CSV is the only Sprint 3 data source. Live connectors and automated event mapping remain deferred.
- Zero is an observed number; blank is unknown. Missing, invalid, conflicted, stale, and unknown are visible data states, not values to interpolate.
- The workspace shows the latest immutable snapshot per metric. Historical snapshots remain in the database for audit and future time-series work.
- Metric and funnel definitions are founder-approved at save time and append a new immutable version on revision.

## Exit gate

- [x] Unknown is never coerced to zero in parsing, persistence, rendering, or conversion logic.
- [x] Malformed or partially invalid CSV files commit nothing.
- [x] Exact import replay has one effect and stable row identity.
- [x] Disagreement is `conflicted`, valueless, and traceable to every candidate observation.
- [x] Incompatible scope and zero denominators cannot fabricate a conversion.
- [x] Metric/funnel history is immutable and protected by tenant RLS contracts.
- [x] Founder-facing browser fixture demonstrates preview, import, conversion, and source trace.
- [ ] Forward/prior/down-forward migration rehearsal passes on the dedicated database.
- [ ] Raw authenticated idempotency, conflict, isolation, and immutability scenarios pass on the dedicated database.
- [ ] A founder accepts the metric language, CSV template, funnel mapping, and lineage presentation on staging.

Sprint 4 remains blocked until the three live/acceptance items are recorded. Local technical verification does not substitute for those gates.
