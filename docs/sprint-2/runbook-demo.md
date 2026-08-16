# Sprint 2 runbook and demo

## Operations and failure handling

- URL rejection: show only the safe category to the founder. Logs contain error class and duration, never the submitted URL, page text, or extracted payload.
- Fetch/extraction failure: no source, proposal, profile version, or context snapshot is committed. The previous verified snapshot remains current.
- Version conflict: reload product-understanding state and ask the founder to review against the newer profile. Never force an overwrite.
- Suspected SSRF bypass: disable the product-understanding route at deployment, preserve request/audit identifiers, and review DNS/redirect evidence without replaying the target from a privileged network.
- Evidence mismatch: keep both immutable source and proposal records, analyze again, and require a new founder review.

## Rollback

1. Roll back the application deployment so the route/CTA is unavailable; existing evidence and snapshots remain readable at the database layer.
2. Prefer a reviewed forward database correction. Never disable RLS or delete evidence/profile history as routine recovery.
3. The destructive down migration is for the isolated rehearsal database only. It removes Sprint 2 tables and RPCs but does not remove prior company-profile history.
4. Re-run `pnpm test:release`, `pnpm db:rehearse`, and `pnpm db:gate` before re-enabling.

## Demo

Run `pnpm demo:sprint2` for the scripted sequence. The release packet includes:

1. unsafe URL failure and unchanged verified context;
2. public source URL, observed time, evidence ID, and exact snippets;
3. visible unverified proposal state;
4. founder correction and verified snapshot/profile version;
5. re-analysis without snapshot overwrite;
6. tenant isolation and evidence immutability results;
7. extraction/adversarial evaluation results.
