# Sprint 3 runbook and demo

## Operations and failure handling

- Preview rejection: fix every listed row/header error and preview the full file again. A failed preview changes no source, import, observation, or snapshot record.
- Unknown metric name: create and approve its metric definition or correct the CSV spelling. The server remaps names during commit and never trusts client preview rows.
- Replay: an identical source hash returns the existing import without duplicating observations.
- Conflict: inspect both immutable evidence references and correct the upstream file. Do not average, delete, or silently select a candidate.
- Unavailable conversion: align window, segment, timezone, and current quality; an observed zero denominator remains an explicit unavailable reason.
- Suspected sensitive upload: restrict route access, preserve request/audit identifiers, and confirm raw CSV content was not retained before restoring service.

## Rollback

1. Roll back the application deployment so `/metrics` is unavailable; existing definitions and evidence remain intact.
2. Prefer a reviewed forward database correction. Never disable RLS or delete metric history during normal recovery.
3. The destructive down migration is only for an isolated rehearsal database. It removes Sprint 3 records, types, and RPCs.
4. Re-run `pnpm run ci`, `pnpm db:rehearse`, `pnpm db:gate`, and `pnpm test:e2e` before re-enabling.

## Demo

Run `pnpm demo:sprint3` for the scripted sequence:

1. define two founder-approved metrics with explicit scope and freshness;
2. preview a CSV containing an observed zero and an unknown blank;
3. repair a malformed row and commit the valid full file;
4. replay the same file and show no duplicate observations;
5. import a disagreeing candidate and show a valueless conflict with both evidence references;
6. map two canonical funnel stages and inspect compatible conversion behavior;
7. open a displayed number to show filename, source record, and evidence identifiers;
8. run tenant isolation and immutable-history attempts through the database gate.

Live database evidence requires `DATABASE_TEST_URL`, `ALLOW_DB_GATE_WRITES=1`, and a dedicated non-production database.
