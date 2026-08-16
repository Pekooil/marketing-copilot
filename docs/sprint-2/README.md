# Sprint 2 — product understanding and verified onboarding

**Status:** Technical implementation complete; live database and founder acceptance gates pending
**Implementation date:** August 16, 2026
**Roadmap outcome:** A founder reviews public-page sources, corrects the proposed company understanding, and sees a founder-verified context snapshot.

## Implemented slice

- A protected `/product-understanding` App Router experience reachable from onboarding review.
- HTTPS-only page ingestion with credential/custom-port denial, public DNS validation, address pinning, redirect revalidation, time and size limits, and HTML-only responses.
- Deterministic extraction of page title, description, and explicitly stated audience. Page scripts/templates are excluded and source text is never treated as executable instruction.
- Immutable `source_record`, `product_understanding_proposal`, `product_understanding_review`, and `context_snapshot` records with default-deny RLS, tenant policies, scoped-worker policies, and rollback migration.
- A mandatory founder review step. Analysis emits only `evidence_supported` fields; only the authenticated founder verification RPC can append `founder_verified` fields.
- Optimistic profile version checks, idempotency receipts, immutable audit evidence, exact evidence snippets, and non-content product analytics schemas.
- Unit, component, integration, isolation, adversarial evaluation, browser, migration, and build gates.

## Deliberate defaults

- One submitted public page is analyzed per proposal. Multi-page crawling, robots-policy orchestration, model inference, and background workflows are deferred until evidence shows deterministic single-page extraction is insufficient.
- Raw page bodies are processed transiently and discarded. Persisted provenance contains URL, content hash, observation time, bounded metadata, and the exact claim snippets shown to the founder.
- Only HTTPS on the default port is allowed. A redirect is treated as a new target and must pass the same checks.
- Re-analysis creates a new immutable proposal and cannot overwrite the last verified snapshot.

## Exit gate

- [x] Inference cannot auto-verify a profile field at TypeScript or database boundaries.
- [x] Unsafe URL, redirect, content-type, timeout, and extraction failures preserve the current verified context.
- [x] Extraction/source-grounding and prompt-injection fixtures pass locally.
- [x] Founder correction produces a new profile version and immutable context snapshot in component/RPC contracts.
- [x] Product-understanding tables use tenant RLS and immutable evidence triggers.
- [ ] Forward/prior/down-forward migration rehearsal passes on the dedicated database.
- [ ] Raw authenticated cross-tenant and immutable-evidence scenarios pass on the dedicated database.
- [ ] Founder accepts the copy, evidence presentation, correction flow, and single-page extraction quality on staging.

Sprint 3 remains blocked until the three live/acceptance items are recorded. The local technical suite does not substitute for those gates.
