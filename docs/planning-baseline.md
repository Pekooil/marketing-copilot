# Planning baseline and decision register

**Status:** Active planning baseline  
**Date:** August 14, 2026  
**Implementation authority:** None  
**Source:** Attached product and engineering source of truth, version 1.0

## Product test

V1 must prove that a company-aware AI Growth Lead can identify one current growth constraint, propose bounded measurable experiments, learn from results, and change the next plan. The unit of value is an evidence-informed learning loop, not generated content or agent activity.

## Non-negotiable invariants

1. One founder-approved primary objective and one named primary constraint per workspace.
2. Unknown, stale, conflicted, invalid, and zero are distinct data states.
3. Deterministic code performs calculations, ranking formulas, authorization, and state transitions.
4. Models emit versioned, schema-validated artifacts with evidence references.
5. Every strategic number traces to a metric snapshot, definition, source, and time window.
6. Approved experiment protocols and human decisions are append-only.
7. Raw model output cannot become a verified fact or durable learning.
8. All V1 connectors are read-only; all public, financial, account, production, and product mutations are blocked.
9. The architecture remains a modular monolith with durable workers, not microservices or persona runtimes.
10. Sprint 1 cannot start until the Phase 0 exit gate is explicitly approved.

## Proposed decision register

| ID | Decision | Status | Acceptance owner | Blocking evidence |
|---|---|---|---|---|
| ADR-001 | Temporal Cloud with a TypeScript worker behind a domain workflow port | Proposed | Engineering lead | Cost/operational spike and failure-recovery proof |
| ADR-002 | Supabase Postgres, Auth, and Storage with Drizzle migrations | Proposed | Engineering + security | Auth/RLS tenancy spike and restore/export review |
| ADR-003 | Connector adapters; PostHog OAuth; data-plane method gated by provider validation | Proposed with blocker | Engineering + product | Phase 0 platform prevalence and PostHog supported-access spike |
| ADR-004 | Vercel AI SDK with AI Gateway behind a domain model port | Proposed | AI/evaluation lead | Structured-output, routing, privacy, latency, and cost spike |

## Source contradiction requiring resolution

The source of truth calls for recurring aggregate PostHog query syncs. PostHog’s current API documentation says `/query` is for ad-hoc or embedded analytics and that third-party connectors must use Batch Exports rather than `/query` for recurring exports. The plan therefore does not authorize a scheduled `/query` connector until PostHog confirms the intended bounded aggregate use. See ADR-003 and risk R-03.

This is a planning clarification, not a scope change: PostHog remains the proposed first connector, while manual/CSV metrics remain the guaranteed fallback.

## Assumptions delegated by the founder

- Planning artifacts are Markdown plus machine-valid JSON Schema in this repository.
- Recommended architecture choices are recorded as proposed ADRs rather than silently accepted.
- Estimates use ideal engineering days and identify a role, not a named person.
- A founder/product lead owns business gates until specific owners are assigned.
- No production accounts, credentials, migrations, dependencies, or application files will be created during planning.

## Approval record template

For each ADR or gate, record:

- decision: accept, revise, reject, or defer;
- approver and timestamp;
- evidence reviewed;
- conditions and expiry/review date;
- downstream tickets unblocked;
- rollback or revisit trigger.

